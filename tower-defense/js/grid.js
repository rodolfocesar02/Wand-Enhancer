'use strict';

/* Grid com campo de fluxo.
 *
 * Nao existe caminho fixo: um BFS a partir da saida gera, para cada celula livre,
 * a distancia ate a saida e a direcao do proximo passo. As torres sao obstaculos,
 * entao construir remodela o percurso de todos os inimigos de uma vez.
 * O BFS tambem e o arbitro de "essa torre pode ser construida aqui?": se apos
 * bloquear a celula o spawn (ou algum inimigo vivo) perde acesso a saida, a
 * construcao e desfeita.
 */

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Grid {
  constructor(cols, rows, spawn, exit) {
    this.cols = cols;
    this.rows = rows;
    this.spawn = spawn;
    this.exit = exit;
    this.blocked = new Uint8Array(cols * rows);
    this.dist = new Int32Array(cols * rows);
    this.flow = new Int8Array(cols * rows);
    this.compute();
  }

  idx(c, r) { return r * this.cols + c; }

  inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }

  isBlocked(c, r) { return !this.inBounds(c, r) || this.blocked[this.idx(c, r)] === 1; }

  isReserved(c, r) {
    return (c === this.spawn.c && r === this.spawn.r) || (c === this.exit.c && r === this.exit.r);
  }

  /* BFS reverso a partir da saida. Preenche dist (-1 = inalcancavel) e flow. */
  compute() {
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
        if (this.blocked[ni] === 1 || this.dist[ni] !== -1) continue;

        this.dist[ni] = next;
        // A vizinha caminha na direcao oposta a que usamos para chegar nela.
        this.flow[ni] = d % 2 === 0 ? d + 1 : d - 1;
        queue[tail++] = ni;
      }
    }

    return this.dist[this.idx(this.spawn.c, this.spawn.r)] !== -1;
  }

  /* Celula seguinte no caminho, ou null se a atual for a saida/inalcancavel. */
  nextCell(c, r) {
    if (!this.inBounds(c, r)) return null;
    const d = this.flow[this.idx(c, r)];
    if (d < 0) return null;
    return { c: c + DIRS[d][0], r: r + DIRS[d][1] };
  }

  distanceAt(c, r) {
    if (!this.inBounds(c, r)) return -1;
    return this.dist[this.idx(c, r)];
  }

  /* Tenta bloquear a celula. Reverte e devolve false se selar o labirinto.
   * occupied: celulas {c,r} que precisam continuar com rota (inimigos vivos). */
  tryBlock(c, r, occupied) {
    if (!this.inBounds(c, r) || this.isReserved(c, r)) return false;

    const i = this.idx(c, r);
    if (this.blocked[i] === 1) return false;

    this.blocked[i] = 1;
    let ok = this.compute();

    if (ok && occupied) {
      for (const cell of occupied) {
        if (this.distanceAt(cell.c, cell.r) === -1) { ok = false; break; }
      }
    }

    if (!ok) {
      this.blocked[i] = 0;
      this.compute();
      return false;
    }
    return true;
  }

  unblock(c, r) {
    const i = this.idx(c, r);
    if (this.blocked[i] === 0) return;
    this.blocked[i] = 0;
    this.compute();
  }

  /* Traca a rota atual do spawn ate a saida, em pixels, para o preview. */
  previewPath(tile) {
    const points = [];
    let c = this.spawn.c, r = this.spawn.r;
    let guard = this.cols * this.rows;

    if (this.distanceAt(c, r) === -1) return points;
    points.push({ x: (c + 0.5) * tile, y: (r + 0.5) * tile });

    while (guard-- > 0) {
      const next = this.nextCell(c, r);
      if (!next) break;
      c = next.c; r = next.r;
      points.push({ x: (c + 0.5) * tile, y: (r + 0.5) * tile });
    }
    return points;
  }
}
