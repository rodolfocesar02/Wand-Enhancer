'use strict';

/* Trilha pisada.
 *
 * Não é uma estrada desenhada -- não poderia ser. A rota deste jogo é
 * recalculada a cada torre construída, então qualquer caminho pintado ficaria
 * marcado onde ninguém passa mais. Aqui o chão se desgasta por ACÚMULO: cada
 * inimigo carimba uma mancha suave por onde passa, e a trilha emerge do
 * tráfego real.
 *
 * O efeito colateral é o melhor pedaço: a trilha guarda o histórico. Depois de
 * remodelar o labirinto no meio da partida, dá para ver a rota antiga
 * fantasma ao lado da nova.
 *
 * A mancha ESCURECE em vez de clarear, e isso é decisão de legibilidade, não
 * de gosto: os inimigos são mais claros que o chão, então escurecer por onde
 * eles andam aumenta o contraste exatamente na faixa onde eles estão.
 *
 * Nunca desbota. Ao fim de 25 ondas o labirinto inteiro conta onde a defesa
 * foi montada e refeita.
 */

const Trail = {
  ESCALA: 0.5,        // meia resolução: a mancha é suave, ninguém vê a diferença
  PASSO: 5,           // pixels percorridos entre um carimbo e o seguinte
  ALFA: 0.085,        // opacidade de cada carimbo; satura devagar com o trafego
  SATURA: 90,         // carimbos numa celula ate ela contar como trilha firme
  versao: 0,          // muda a cada carimbo; o campo de medo usa para invalidar cache


  init() {
    this.cv = document.createElement('canvas');
    this.cv.width = Math.ceil(CONFIG.boardW * this.ESCALA);
    this.cv.height = Math.ceil(CONFIG.boardH * this.ESCALA);
    this.ctx = this.cv.getContext('2d');

    /* As pegadas tem canvas proprio, e isso nao e organizacao -- e a unica
     * forma de elas aparecerem.
     *
     * A trilha satura: depois de algumas dezenas de monstros o corredor esta
     * no teto de opacidade, e uma pegada ESCURA carimbada ali dentro some,
     * porque nao ha mais escuro para somar. Medido numa corrida de 4 ondas
     * sem torre nenhuma: o corredor fica preto e a pegada e invisivel.
     *
     * Entao a pegada e CLARA -- terra revolvida, que e o que ela e de
     * verdade -- e desenhada por cima da trilha. Quanto mais pisado o chao,
     * mais ela contrasta, que e exatamente ao contrario da saturacao. */
    /* E em resolucao CHEIA, nao na metade como a mancha.
     * A mancha e um borrao radial -- meia resolucao nela e invisivel. A
     * pegada e forma: garra, bota, casco. A meia resolucao um pe de 8px
     * virava dois pontinhos claros e as oito silhuetas ficavam iguais, o
     * que anula a razao de existirem. */
    this.cvPasso = document.createElement('canvas');
    this.cvPasso.width = CONFIG.boardW;
    this.cvPasso.height = CONFIG.boardH;
    this.ctxPasso = this.cvPasso.getContext('2d');
    this.carimbo = this.fazCarimbo(64);
    this.reset();
  },

  /* A contagem por celula e separada do canvas de proposito: o campo de medo
   * le a trilha como desconto de custo, e a partida inteira precisa rodar sem
   * tela para o balanceamento continuar sendo medido por simulacao. */
  contar() {
    if (!this.pisadas) this.pisadas = new Float32Array(CONFIG.cols * CONFIG.rows);
    return this.pisadas;
  },

  /* Quanto aquela celula esta pisada, 0..1. */
  nivel(c, r) {
    const p = this.contar();
    if (c < 0 || c >= CONFIG.cols || r < 0 || r >= CONFIG.rows) return 0;
    return Math.min(1, p[r * CONFIG.cols + c] / this.SATURA);
  },

  /* Mancha radial com queda suave. Pré-renderizada uma vez: desenhar um
   * gradiente por inimigo por quadro seria desperdício numa onda cheia. */
  fazCarimbo(tam) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = tam;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, tam, tam);
    return cv;
  },

  reset() {
    this.contar().fill(0);
    this.versao += 1;
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.ctxPasso.clearRect(0, 0, this.cvPasso.width, this.cvPasso.height);
  },

  /* Carimba a passagem do inimigo. Chamado pelo jogo a cada PASSO pixels
   * percorridos, não a cada quadro -- assim o custo não depende da taxa de
   * quadros nem da velocidade do jogo. */
  stamp(enemy) {
    const p = this.contar();
    const cc = Math.floor(enemy.x / CONFIG.tile), cr = Math.floor(enemy.y / CONFIG.tile);
    if (cc >= 0 && cc < CONFIG.cols && cr >= 0 && cr < CONFIG.rows) {
      p[cr * CONFIG.cols + cc] += 1;
      this.versao += 1;
    }

    if (!this.ctx) return;
    const s = this.ESCALA;
    const r = enemy.radius * 1.5 * s;
    this.ctx.globalAlpha = this.ALFA;
    this.ctx.drawImage(this.carimbo,
      enemy.x * s - r, enemy.y * s - r, r * 2, r * 2);
    this.ctx.globalAlpha = 1;

    this.pegada(enemy, s);
  },

  /* Pegada a cada terceiro carimbo, alternando os lados.
   *
   * Nao e por frequencia: a cada PASSO pixels ja e raro o bastante, e uma
   * pegada em cada um viraria um borrao continuo -- exatamente a mancha que
   * a trilha ja faz. Uma a cada tres deixa espaco entre elas.
   *
   * O custo e zero por quadro porque isto carimba no MESMO canvas
   * persistente da trilha: desenha uma vez e fica. A pegada nao reduz a
   * taxa de quadros numa onda cheia porque ela nao e redesenhada.
   */
  PASSO_PEGADA: 6,
  DESVIO: 0.34,      // quanto a pegada sai do eixo, em raios do monstro

  pegada(enemy, s) {
    enemy._nPasso = (enemy._nPasso || 0) + 1;
    if (enemy._nPasso % this.PASSO_PEGADA !== 0) return;

    const img = PASSOS.para(enemy.type);
    if (!img) return;

    // Esquerda e direita alternadas, perpendicular a marcha.
    const lado = (enemy._nPasso / this.PASSO_PEGADA) % 2 === 0 ? 1 : -1;
    const nx = -Math.sin(enemy.angle) * enemy.radius * this.DESVIO * lado;
    const ny = Math.cos(enemy.angle) * enemy.radius * this.DESVIO * lado;
    const lar = enemy.radius * 1.15;

    const c = this.ctxPasso;
    c.save();
    // Baixa de proposito: dezenas de monstros pisam a MESMA linha, e a
    // 0,26 a rota virava uma faixa clara continua em vez de pegadas.
    c.globalAlpha = 0.17;
    c.translate(enemy.x + nx, enemy.y + ny);
    // A arte aponta para CIMA; o angulo 0 do jogo aponta para a direita.
    c.rotate(enemy.angle + Math.PI / 2);
    if (lado < 0) c.scale(-1, 1);        // espelha o pe do outro lado
    c.drawImage(img, -lar / 2, -lar / 2, lar, lar);
    // A forma vem preta; 'source-atop' pinta dentro dela sem vazar para
    // fora, entao a pegada sai clara sem precisar de uma segunda arte.
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = 1;
    c.fillStyle = '#d9c9a8';
    c.fillRect(-lar / 2, -lar / 2, lar, lar);
    c.restore();
  },

  /* O carimbo acumula ate saturar, mas a camada e desenhada com opacidade
   * limitada: sem esse teto a trilha vira um sulco preto e apaga a textura do
   * mapa exatamente onde o jogador mais olha. */
  TETO: 0.58,

  TETO_PASSO: 0.5,

  draw(ctx) {
    if (!this.cv) return;
    ctx.save();
    ctx.globalAlpha = this.TETO;
    ctx.drawImage(this.cv, 0, 0, CONFIG.boardW, CONFIG.boardH);
    // Depois da trilha, nunca antes: a graca e a pegada clara contra o
    // sulco escuro que ela mesma ajudou a cavar.
    ctx.globalAlpha = this.TETO_PASSO;
    ctx.drawImage(this.cvPasso, 0, 0, CONFIG.boardW, CONFIG.boardH);
    ctx.restore();
  }
};
