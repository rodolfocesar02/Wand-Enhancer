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

  init() {
    this.cv = document.createElement('canvas');
    this.cv.width = Math.ceil(CONFIG.boardW * this.ESCALA);
    this.cv.height = Math.ceil(CONFIG.boardH * this.ESCALA);
    this.ctx = this.cv.getContext('2d');
    this.carimbo = this.fazCarimbo(64);
    this.reset();
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
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
  },

  /* Carimba a passagem do inimigo. Chamado pelo jogo a cada PASSO pixels
   * percorridos, não a cada quadro -- assim o custo não depende da taxa de
   * quadros nem da velocidade do jogo. */
  stamp(enemy) {
    if (!this.ctx) return;
    const s = this.ESCALA;
    const r = enemy.radius * 1.5 * s;
    this.ctx.globalAlpha = this.ALFA;
    this.ctx.drawImage(this.carimbo,
      enemy.x * s - r, enemy.y * s - r, r * 2, r * 2);
    this.ctx.globalAlpha = 1;
  },

  /* O carimbo acumula ate saturar, mas a camada e desenhada com opacidade
   * limitada: sem esse teto a trilha vira um sulco preto e apaga a textura do
   * mapa exatamente onde o jogador mais olha. */
  TETO: 0.58,

  draw(ctx) {
    if (!this.cv) return;
    ctx.save();
    ctx.globalAlpha = this.TETO;
    ctx.drawImage(this.cv, 0, 0, CONFIG.boardW, CONFIG.boardH);
    ctx.restore();
  }
};
