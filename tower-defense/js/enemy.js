'use strict';

/* Inimigo que segue o campo de fluxo do grid, celula a celula. */

class Enemy {
  constructor(typeKey, hpMultiplier, grid, tile) {
    const def = ENEMY_TYPES[typeKey];
    this.type = typeKey;
    this.def = def;
    this.grid = grid;
    this.tile = tile;

    this.maxHp = Math.round(def.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.baseSpeed = def.speed;
    this.radius = def.radius;
    this.gold = def.gold;
    this.leak = def.leak;

    this.x = (grid.spawn.c + 0.5) * tile;
    this.y = (grid.spawn.r + 0.5) * tile;

    this.slowFactor = 0;     // 0 = sem lentidao, 0.5 = metade da velocidade
    this.slowTimer = 0;
    this.hitFlash = 0;
    this.dead = false;
    this.escaped = false;
    this.angle = 0;
  }

  get cell() {
    return {
      c: Math.floor(this.x / this.tile),
      r: Math.floor(this.y / this.tile)
    };
  }

  /* Quanto falta ate a saida. Menor = mais adiantado; usado para mirar no "primeiro". */
  progress() {
    const cell = this.cell;
    const d = this.grid.distanceAt(cell.c, cell.r);
    return d === -1 ? Number.MAX_SAFE_INTEGER : d;
  }

  applySlow(factor, duration) {
    // Lentidao nao acumula: vale sempre o efeito mais forte ainda ativo.
    if (factor >= this.slowFactor) {
      this.slowFactor = factor;
      this.slowTimer = duration;
    } else {
      this.slowTimer = Math.max(this.slowTimer, duration * 0.5);
    }
  }

  damage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.12;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt) {
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 0;
    }

    const cell = this.cell;

    // Chegou na saida: vaza e tira vidas.
    if (cell.c === this.grid.exit.c && cell.r === this.grid.exit.r) {
      this.escaped = true;
      return;
    }

    const next = this.grid.nextCell(cell.c, cell.r);
    if (!next) return; // sem rota (nao deveria acontecer: tryBlock impede)

    const targetX = (next.c + 0.5) * this.tile;
    const targetY = (next.r + 0.5) * this.tile;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) return;

    this.angle = Math.atan2(dy, dx);
    const speed = this.baseSpeed * (1 - this.slowFactor);
    const step = Math.min(speed * dt, dist);

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }
}
