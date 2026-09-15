'use strict';

/* Grid com campos de fluxo.
 *
 * Nao existe caminho fixo. Um Dijkstra reverso a partir da saida gera, para
 * cada celula livre, o custo ate a saida e a direcao do proximo passo. Torres,
 * paredes de terreno e a magia Muralha sao obstaculos, entao qualquer uma
 * delas remodela a rota de todos os inimigos de uma vez.
 *
 * Dois tipos de campo convivem aqui:
 *
 *   - o campo NEUTRO, com custo 1 por celula. E o BFS de sempre, e continua
 *     sendo o arbitro de tudo que precisa de resposta objetiva: o que pode ser
 *     construido (se bloquear deixaria alguem sem rota, a construcao e
 *     desfeita) e quem esta mais perto de vazar (mira das torres).
 *
 *   - os campos de MEDO, um por classe de sensibilidade, com custo 1 + s*extra,
 *     onde extra vem do dano ja levado na celula. Aqui a rota nao e a mais
 *     curta, e a mais barata -- e como a sensibilidade s difere entre classes,
 *     o Tanque pode cortar reto pelo corredor da morte enquanto o Bruxo
 *     contorna o mapa. Sao tres campos de 126 celulas, nao um por inimigo:
 *     rota individual por monstro destruiria a legibilidade sem acrescentar
 *     decisao nenhuma.
 *
 * Alcancabilidade e a mesma nos dois: custo positivo nao cria nem fecha
 * passagem. Por isso tryBlock continua valendo para todo mundo. */

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const CELL = { LIVRE: 0, TORRE: 1, TERRENO: 2, MURALHA: 3 };

class Grid {
  constructor(map) {
    this.cols = CONFIG.cols;
    this.rows = CONFIG.rows;
    this.spawn = map.spawn;
    this.exit = map.exit;
    this.cells = new Uint8Array(this.cols * this.rows);
    this.dist = new Int32Array(this.cols * this.rows);
    this.flow = new Int8Array(this.cols * this.rows);
    // Distancia ate a saida IGNORANDO torres: so a rocha do mapa bloqueia.
    // E a referencia da paciencia -- quanto o labirinto alongou a viagem em
    // relacao ao que ela seria num tabuleiro vazio.
    this.distLivre = new Int32Array(this.cols * this.rows);
    // Bandeira explicita. A primeira versao testava distLivre[saida] !== 0
    // para saber se precisava calcular -- e Int32Array ja nasce zerado, entao
    // a condicao era falsa desde o inicio e o BFS livre nunca rodava. A folga
    // dava 1,00 numa serpentina de 62 passos.
    this.livrePronto = false;

    // Um campo por classe de medo. custoFn e plugado pelo jogo e devolve o
    // custo extra por celula, ou null quando o medo esta desligado.
    this.custoFn = null;
    this.medoFlow = {};
    this.medoDist = {};
    // Durante uma sondagem ("da para construir aqui?") o grid e bloqueado e
    // desbloqueado sem que nada mude de verdade. Recalcular os campos de medo
    // nesse vai-e-vem seria trabalho jogado fora a cada quadro.
    this.probing = false;

    for (const w of map.walls) {
      if (this.inBounds(w[0], w[1]) && !this.isReserved(w[0], w[1])) {
        this.cells[this.idx(w[0], w[1])] = CELL.TERRENO;
      }
    }
    this.compute();
  }

  idx(c, r) { return r * this.cols + c; }

  inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }

  cellAt(c, r) { return this.inBounds(c, r) ? this.cells[this.idx(c, r)] : CELL.TERRENO; }

  isBlocked(c, r) { return this.cellAt(c, r) !== CELL.LIVRE; }

  isReserved(c, r) {
    return (c === this.spawn.c && r === this.spawn.r) || (c === this.exit.c && r === this.exit.r);
  }

  /* BFS que ignora torres: so a rocha do mapa bloqueia. Muda apenas quando o
   * mapa muda, entao e calculado uma vez e nao a cada construcao. */
  computeLivre() {
    this.livrePronto = true;
    this.distLivre.fill(-1);
    const start = this.idx(this.exit.c, this.exit.r);
    this.distLivre[start] = 0;

    const queue = new Int32Array(this.cols * this.rows);
    let head = 0, tail = 0;
    queue[tail++] = start;

    while (head < tail) {
      const cur = queue[head++];
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      const next = this.distLivre[cur] + 1;

      for (let d = 0; d < DIRS.length; d++) {
        const nc = c + DIRS[d][0];
        const nr = r + DIRS[d][1];
        if (!this.inBounds(nc, nr)) continue;
        const ni = this.idx(nc, nr);
        if (this.cells[ni] === CELL.TERRENO || this.distLivre[ni] !== -1) continue;
        this.distLivre[ni] = next;
        queue[tail++] = ni;
      }
    }
  }

  /* Quanto o labirinto alongou a viagem a partir desta celula. 1 = rota
   * direta; 3 = o jogador esta fazendo o inimigo andar o triplo.
   *
   * E a medida da paciencia. Uma torre que so serve de tijolo nao aparece em
   * lugar nenhum do jogo ate aqui: e aqui que ela cobra o preco. */
  folga(c, r) {
    if (!this.inBounds(c, r)) return 1;
    const i = this.idx(c, r);
    const livre = this.distLivre[i];
    const real = this.dist[i];
    if (livre <= 0 || real < 0) return 1;
    return real / livre;
  }

  /* BFS reverso a partir da saida. Preenche dist (-1 = inalcancavel) e flow. */
  compute() {
    if (!this.livrePronto) this.computeLivre();
    this.dist.fill(-1);
    this.flow.fill(-1);

    const start = this.idx(this.exit.c, this.exit.r);
    this.dist[start] = 0;

    const queue = new Int32Array(this.cols * this.rows);
    let head = 0, tail = 0;
    queue[tail++] = start;

    while (head < tail) {
      const cur = queue[head++];
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      const next = this.dist[cur] + 1;

      for (let d = 0; d < DIRS.length; d++) {
        const nc = c + DIRS[d][0];
        const nr = r + DIRS[d][1];
        if (!this.inBounds(nc, nr)) continue;

        const ni = this.idx(nc, nr);
        if (this.cells[ni] !== CELL.LIVRE || this.dist[ni] !== -1) continue;

        this.dist[ni] = next;
        // A vizinha caminha na direcao oposta a que usamos para chegar nela.
        this.flow[ni] = d % 2 === 0 ? d + 1 : d - 1;
        queue[tail++] = ni;
      }
    }

    const ok = this.dist[this.idx(this.spawn.c, this.spawn.r)] !== -1;
    this.computeFear();
    return ok;
  }

  /* Um Dijkstra por classe de sensibilidade sobre o campo de custo atual.
   * Sem campo de custo (medo desligado) os campos de medo simplesmente
   * apontam para o fluxo neutro, e o jogo inteiro volta a ser o de antes. */
  computeFear() {
    if (this.probing) return;
    const extra = this.custoFn ? this.custoFn() : null;

    if (!extra) {
      this.medoFlow = {};
      this.medoDist = {};
      return;
    }

    // Orcamento: a rota com medo nao pode passar de (1+TOLERANCIA) vezes a
    // rota curta. Se passar, a sensibilidade cai e tenta de novo -- o inimigo
    // evita o que cabe na paciencia dele e depois encara.
    const curta = this.passos(this.flow);
    const limite = curta > 0 ? Math.ceil(curta * (1 + Perigo.TOLERANCIA)) : Infinity;

    for (const nome of Object.keys(Perigo.CLASSES)) {
      let s = Perigo.CLASSES[nome];
      let campo = null;
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        campo = this.dijkstra(extra, s);
        if (this.passos(campo.flow) <= limite) break;
        s *= 0.45;
      }
      this.medoFlow[nome] = campo.flow;
      this.medoDist[nome] = campo.dist;
    }
  }

  /* Numero de passos da entrada ate a saida seguindo um campo de fluxo. */
  passos(flow) {
    let c = this.spawn.c, r = this.spawn.r;
    let guard = this.cols * this.rows * 2, n = 0;
    while (guard-- > 0) {
      if (c === this.exit.c && r === this.exit.r) return n;
      const d = flow[this.idx(c, r)];
      if (d < 0) return -1;
      c += DIRS[d][0]; r += DIRS[d][1]; n++;
    }
    return -1;
  }

  /* Dijkstra reverso a partir da saida. Cobra o custo da celula em que se
   * ENTRA, entao a saida custa zero. Fila de prioridade com remocao pregucosa:
   * em 126 celulas qualquer estrutura mais esperta seria enfeite. */
  dijkstra(extra, s) {
    const n = this.cols * this.rows;
    // Float64, nao Float32: com 32 bits o valor GRAVADO em dist e arredondado
    // e fica menor que o que esta na fila, entao a remocao preguicosa
    // (cur.d > dist[i]) descartava nos validos e o campo nao chegava na
    // entrada. Falha silenciosa -- so apareceu porque o teste cobrava que
    // toda classe tivesse rota ate a saida.
    const dist = new Float64Array(n).fill(Infinity);
    const flow = new Int8Array(n).fill(-1);

    const start = this.idx(this.exit.c, this.exit.r);
    dist[start] = 0;

    const heap = [{ i: start, d: 0 }];
    while (heap.length > 0) {
      // Fila pequena o bastante para varrer: 126 celulas, sem heap binario.
      let melhor = 0;
      for (let k = 1; k < heap.length; k++) if (heap[k].d < heap[melhor].d) melhor = k;
      const cur = heap.splice(melhor, 1)[0];
      if (cur.d > dist[cur.i]) continue;

      const c = cur.i % this.cols;
      const r = (cur.i - c) / this.cols;

      for (let d = 0; d < DIRS.length; d++) {
        const nc = c + DIRS[d][0];
        const nr = r + DIRS[d][1];
        if (!this.inBounds(nc, nr)) continue;

        const ni = this.idx(nc, nr);
        if (this.cells[ni] !== CELL.LIVRE) continue;

        // Piso positivo: custo zero ou negativo quebraria o Dijkstra, e uma
        // trilha muito batida chega a descontar mais do que a celula custa.
        const custo = Math.max(0.3, 1 + s * extra[ni]);
        const alt = cur.d + custo;
        if (alt >= dist[ni]) continue;

        dist[ni] = alt;
        flow[ni] = d % 2 === 0 ? d + 1 : d - 1;
        heap.push({ i: ni, d: alt });
      }
    }
    return { dist: dist, flow: flow };
  }

  /* Proximo passo. Sem classe (ou com o medo desligado) cai no campo neutro,
   * que e exatamente o comportamento antigo. */
  nextCell(c, r, classe) {
    if (!this.inBounds(c, r)) return null;
    const campo = classe && this.medoFlow[classe] ? this.medoFlow[classe] : this.flow;
    const d = campo[this.idx(c, r)];
    if (d < 0) return null;
    return { c: c + DIRS[d][0], r: r + DIRS[d][1] };
  }

  distanceAt(c, r) {
    if (!this.inBounds(c, r)) return -1;
    return this.dist[this.idx(c, r)];
  }

  /* Tenta ocupar a celula com o tipo dado. Reverte e devolve false se selar
   * o labirinto. occupied: celulas que precisam continuar com rota. */
  tryBlock(c, r, kind, occupied) {
    if (!this.inBounds(c, r) || this.isReserved(c, r)) return false;

    const i = this.idx(c, r);
    if (this.cells[i] !== CELL.LIVRE) return false;

    this.cells[i] = kind;
    let ok = this.compute();

    if (ok && occupied) {
      for (const cell of occupied) {
        if (this.distanceAt(cell.c, cell.r) === -1) { ok = false; break; }
      }
    }

    if (!ok) {
      this.cells[i] = CELL.LIVRE;
      this.compute();
      return false;
    }
    return true;
  }

  unblock(c, r) {
    const i = this.idx(c, r);
    if (this.cells[i] === CELL.LIVRE || this.cells[i] === CELL.TERRENO) return;
    this.cells[i] = CELL.LIVRE;
    this.compute();
  }

  /* Traca a rota atual do spawn ate a saida, em pixels, para o preview.
   * Com classe, traca a rota daquela sensibilidade ao medo. */
  previewPath(tile, classe) {
    const points = [];
    let c = this.spawn.c, r = this.spawn.r;
    let guard = this.cols * this.rows * 2;

    if (this.distanceAt(c, r) === -1) return points;
    points.push({ x: (c + 0.5) * tile, y: (r + 0.5) * tile });

    while (guard-- > 0) {
      const next = this.nextCell(c, r, classe);
      if (!next) break;
      c = next.c; r = next.r;
      points.push({ x: (c + 0.5) * tile, y: (r + 0.5) * tile });
    }
    return points;
  }
}
