'use strict';

/* Campo de medo.
 *
 * A ideia: a rota deixa de ser a MAIS CURTA e passa a ser a MAIS BARATA.
 * Cada celula tem um custo, e o custo sobe com o dano que ja foi levado ali.
 * Um corredor onde muita coisa morreu fica caro de atravessar, entao o campo
 * de fluxo desvia dele sozinho.
 *
 * A consequencia e a parte que interessa: antes a rota so mudava quando o
 * jogador construia. Agora ela muda quando o jogador ATIRA. Empilhar dano no
 * mesmo ponto passa a ser autodestrutivo -- o killbox expulsa a propria
 * comida -- e surge um papel novo para torre fraca: cerca, que nao mata,
 * so encarece.
 *
 * Por que dano causado e nao area de torre: uma torre que nao atirou nunca
 * aparece no campo. Isso e o que da sentido ao modo silencioso, e faz a
 * mecanica ser aprendida pelo inimigo em vez de dada de graca.
 *
 * Oscilacao (rota foge -> killbox para de marcar -> rota volta -> ...) e a
 * falha classica desse tipo de realimentacao. Aqui ela nao acontece DENTRO da
 * onda porque o dano so cresce; o esquecimento e por onda (DECAI), entao a
 * rota volta devagar, ao longo de varias ondas, em vez de piscar. */

const Perigo = {
  /* Quanto a celula mais perigosa do mapa custa a mais, em passos. 8 = a pior
   * celula vale 9 celulas limpas, entao um desvio de ate 8 celulas compensa. */
  PESO: 8,

  /* Expoente da normalizacao. <1 alarga a faixa quente: sem isso so a celula
   * do pico assusta e o resto do corredor fica indistinguivel de chao limpo. */
  GAMA: 0.65,

  /* Esquecimento por onda. 0.82 ~ memoria de 4 ondas: o jogador consegue
   * remanejar a defesa sem carregar o fantasma do labirinto antigo a partida
   * inteira. */
  DECAI: 0.82,

  /* Desconto do chao pisado, em passos. Contrapeso ao medo: o habito puxa a
   * rota de volta enquanto o medo empurra. Modesto de proposito -- e criterio
   * de desempate, nao tranca. */
  DESCONTO: 0.40,

  /* Dano total no mapa antes do campo valer. Sem isso os primeiros tiros da
   * onda 1 gerariam um campo extremo a partir de um acerto so. A onda 1 fica
   * sendo a onda limpa, que ensina a rota curta antes de quebra-la. */
  MINIMO: 600,

  /* Orcamento de desvio: quanto a rota com medo pode ser mais longa que a
   * rota curta, em fracao de passos.
   *
   * Sem teto a mecanica vira esteira -- medido: o bot killbox caia da onda 17
   * para 9 e nao se recuperava nem re-mirando, porque toda torre que ele
   * construia empurrava a rota de novo e ele nunca conseguia concentrar dano
   * em lugar nenhum. O chefe contornava a defesa inteira, toda vez, que e o
   * desfecho mais frustrante possivel num tower defense.
   *
   * Com teto, o inimigo evita o que da para evitar dentro da paciencia dele e
   * depois encara. Tem medo, nao tem liberdade. */
  TOLERANCIA: 0.25,

  /* Segundos de jogo entre recalculos. O campo muda a todo tiro; recalcular a
   * todo quadro seria desperdicio e faria a rota tremer. */
  INTERVALO: 1.0,

  /* Sensibilidade por classe. Mesmo campo de perigo, leituras diferentes:
   * e daqui que sai a cena de duas rotas na mesma onda.
   *
   * A escala e legivel: s * PESO = quantas celulas limpas a mais o inimigo
   * aceita andar para evitar UMA celula no pico do perigo. O afoito troca
   * meia celula (ou seja, atravessa), o cauteloso troca seis.
   *
   * O primeiro valor que escrevi para o afoito (0.25) dava 2 celulas e ele
   * desviava junto com o cauteloso -- a medicao pegou, a leitura nao pegaria. */
  CLASSES: { afoito: 0.06, normal: 0.28, cauteloso: 0.80 },

  init() {
    this.n = CONFIG.cols * CONFIG.rows;
    this.dano = new Float32Array(this.n);
    this.extra = new Float32Array(this.n);
    this.max = 0;
    this.total = 0;
    this.sujo = false;
    this.versao = 0;
    this.versaoExtra = -1;
  },

  reset() {
    if (!this.dano) this.init();
    this.dano.fill(0);
    this.max = 0;
    this.total = 0;
    this.sujo = false;
    this.versao += 1;
  },

  ligado() { return !!CONFIG.medo; },

  /* Registra dano no ponto onde o inimigo estava. */
  marcar(x, y, dano) {
    if (!this.dano) this.init();
    const c = Math.floor(x / CONFIG.tile);
    const r = Math.floor(y / CONFIG.tile);
    if (c < 0 || c >= CONFIG.cols || r < 0 || r >= CONFIG.rows) return;

    const i = r * CONFIG.cols + c;
    this.dano[i] += dano;
    this.total += dano;
    if (this.dano[i] > this.max) this.max = this.dano[i];
    this.sujo = true;
    this.versao += 1;
  },

  /* Esquecimento, chamado uma vez por onda -- nao por segundo. Assim o
   * ritmo do medo nao depende da velocidade do jogo. */
  decair() {
    if (!this.dano) return;
    let max = 0, total = 0;
    for (let i = 0; i < this.n; i++) {
      const v = this.dano[i] * this.DECAI;
      this.dano[i] = v < 0.5 ? 0 : v;
      total += this.dano[i];
      if (this.dano[i] > max) max = this.dano[i];
    }
    this.max = max;
    this.total = total;
    this.sujo = true;
    this.versao += 1;
  },

  /* Nivel 0..1 da celula, ja borrado. E o que o mapa de calor desenha: o
   * jogador precisa VER o custo, senao a mecanica inteira e invisivel e o
   * jogo so parece injusto. */
  nivel(c, r) {
    if (!this.ligado() || !this.dano || this.total < this.MINIMO) return 0;
    this.recalcular();
    const cols = CONFIG.cols;
    const bruto = this.extra[r * cols + c] + this.DESCONTO * Trail.nivel(c, r);
    return Math.max(0, Math.min(1, bruto / this.PESO));
  },

  /* Escala do campo: o percentil 70 das celulas que ja viram dano, nunca o
   * maximo.
   *
   * Normalizar pelo maximo foi a primeira versao e ficou INERTE -- medido, nao
   * suposto: a rota divergia em 0% a 3% das amostras mesmo com 250 mil de dano
   * no mapa. O motivo e que a distribuicao e pontuda. A celula onde os
   * inimigos morrem leva uma ordem de grandeza mais dano que o resto do
   * corredor, entao dividir por ela fazia o corredor inteiro parecer seguro e
   * so o pico assustava. Com o percentil, o killbox inteiro pesa. */
  referencia() {
    const vals = [];
    for (let i = 0; i < this.n; i++) if (this.dano[i] > 0) vals.push(this.dano[i]);
    if (vals.length === 0) return 1;
    vals.sort((a, b) => a - b);
    return Math.max(1, vals[Math.floor(vals.length * 0.70)]);
  },

  /* Custo adicional por celula: perigo borrado menos desconto da trilha.
   * Borrar importa -- sem isso o dano fica preso nas celulas exatas dos
   * acertos e a rota costura entre pontos quentes de um jeito que nao se
   * explica olhando a tela. */
  recalcular() {
    if (this.versaoExtra === this.versao && this.versaoTrilha === Trail.versao) return this.extra;
    this.versaoExtra = this.versao;
    this.versaoTrilha = Trail.versao;

    const cols = CONFIG.cols, rows = CONFIG.rows;
    const ref = this.referencia();
    const fraco = this.total < this.MINIMO;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (fraco) { this.extra[i] = -this.DESCONTO * Trail.nivel(c, r); continue; }

        let soma = this.dano[i] * 0.5, peso = 0.5;
        if (c > 0)        { soma += this.dano[i - 1] * 0.125;    peso += 0.125; }
        if (c < cols - 1) { soma += this.dano[i + 1] * 0.125;    peso += 0.125; }
        if (r > 0)        { soma += this.dano[i - cols] * 0.125; peso += 0.125; }
        if (r < rows - 1) { soma += this.dano[i + cols] * 0.125; peso += 0.125; }

        const n = Math.min(1, (soma / peso) / ref);
        this.extra[i] = this.PESO * Math.pow(n, this.GAMA) - this.DESCONTO * Trail.nivel(c, r);
      }
    }
    return this.extra;
  },

  /* O que o Grid consome. null = medo desligado, e o campo de fluxo volta a
   * ser o BFS de sempre. */
  campo() {
    if (!this.ligado() || !this.dano) return null;
    return this.recalcular();
  }
};
