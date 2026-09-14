'use strict';

/* Inimigo: silhueta base + afixo + nivel.
 *
 * As 5 silhuetas sao reaproveitadas; o que muda entre variantes e o afixo,
 * que altera cor E marcador de forma (placas, halo, rastro). Cor sozinha nao
 * comunica resistencia rapido o bastante numa onda cheia e falha para quem
 * tem daltonismo -- por isso o marcador nao e opcional. */

class Enemy {
  constructor(typeKey, affixKey, level, grid, tile) {
    const def = ENEMY_TYPES[typeKey];
    const affix = AFFIXES[affixKey] || AFFIXES.comum;

    this.type = typeKey;
    this.def = def;
    this.affixKey = affixKey || 'comum';
    this.affix = affix;
    this.level = level || 1;
    this.grid = grid;
    this.tile = tile;

    // Nivel do monstro escala vida e recompensa, nao velocidade.
    const levelMul = Math.pow(1.145, this.level - 1);

    this.maxHp = Math.round(def.hp * levelMul * affix.hpMul);
    this.hp = this.maxHp;
    this.baseSpeed = def.speed * affix.speedMul;
    this.radius = def.radius + (this.level > 8 ? 2 : 0);
    this.gold = Math.max(1, Math.round(def.gold * affix.goldMul * (1 + (this.level - 1) * 0.06)));
    this.leak = def.leak;
    this.resist = { fisico: affix.resist.fisico, magico: affix.resist.magico };
    this.color = affix.color || def.color || '#e2e8f0';
    this.marker = affix.marker;
    this.shape = def.shape;

    this.x = (grid.spawn.c + 0.5) * tile;
    this.y = (grid.spawn.r + 0.5) * tile;

    this.slowFactor = 0;
    this.slowTimer = 0;
    this.hitFlash = 0;
    this.knock = 0;        // tranco do impacto: só deslocamento de desenho
    this.lastSchool = null;
    this.dead = false;
    this.escaped = false;
    this.angle = 0;
    this.wobble = Math.random() * Math.PI * 2;
  }

  get cell() {
    return { c: Math.floor(this.x / this.tile), r: Math.floor(this.y / this.tile) };
  }

  /* Quanto falta ate a saida. Menor = mais adiantado. */
  progress() {
    const cell = this.cell;
    const d = this.grid.distanceAt(cell.c, cell.r);
    return d === -1 ? Number.MAX_SAFE_INTEGER : d;
  }

  applySlow(factor, duration) {
    // Lentidao nao acumula: vale sempre o efeito mais forte ainda ativo.
    if (factor >= this.slowFactor) {
      this.slowFactor = Math.min(0.95, factor);
      this.slowTimer = duration;
    } else {
      this.slowTimer = Math.max(this.slowTimer, duration * 0.5);
    }
  }

  takeHit(packet, mods) {
    const dealt = Damage.resolve(this, packet, mods);
    this.hp -= dealt;
    this.hitFlash = 0.12;
    this.lastSchool = Damage.dominant(packet);
    if (this.hp <= 0) this.dead = true;
    return dealt;
  }

  update(dt) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    // O tranco nunca move o inimigo de verdade: mexer na posição empurraria
    // ele para dentro de paredes e bagunçaria o campo de fluxo.
    if (this.knock > 0) this.knock = Math.max(0, this.knock - dt * 7);
    this.wobble += dt * 9;

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 0;
    }

    const cell = this.cell;

    if (cell.c === this.grid.exit.c && cell.r === this.grid.exit.r) {
      this.escaped = true;
      return;
    }

    const next = this.grid.nextCell(cell.c, cell.r);
    if (!next) return; // sem rota: so acontece se a Muralha expirar num quadro ruim

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
