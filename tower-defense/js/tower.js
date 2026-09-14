'use strict';

/* Torre construida sobre uma celula do grid. */

class Tower {
  constructor(typeKey, c, r, tile) {
    this.typeKey = typeKey;
    this.def = TOWER_TYPES[typeKey];
    this.c = c;
    this.r = r;
    this.level = 0;
    this.cooldown = 0;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.invested = this.def.cost;
    this.x = (c + 0.5) * tile;
    this.y = (r + 0.5) * tile;
  }

  get stats() { return this.def.levels[this.level]; }

  get maxLevel() { return this.level >= this.def.levels.length - 1; }

  get upgradeCost() {
    return this.maxLevel ? null : this.def.levels[this.level + 1].upgradeCost;
  }

  get sellValue() { return Math.floor(this.invested * CONFIG.sellRate); }

  upgrade() {
    if (this.maxLevel) return false;
    this.invested += this.upgradeCost;
    this.level += 1;
    return true;
  }

  /* Mira no inimigo mais adiantado dentro do alcance: e o que esta perto de vazar. */
  pickTarget(enemies) {
    const range = this.stats.range;
    let best = null;
    let bestProgress = Number.MAX_SAFE_INTEGER;

    for (const e of enemies) {
      if (e.dead || e.escaped) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > range + e.radius) continue;

      const p = e.progress();
      if (p < bestProgress) {
        bestProgress = p;
        best = e;
      }
    }
    return best;
  }

  update(dt, enemies, projectiles) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.recoil > 0) this.recoil -= dt * 5;

    const target = this.pickTarget(enemies);
    if (!target) return;

    this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    if (this.cooldown > 0) return;

    this.cooldown = this.stats.cooldown;
    this.recoil = 1;
    const muzzle = 14;
    projectiles.push(new Projectile(
      this.x + Math.cos(this.angle) * muzzle,
      this.y + Math.sin(this.angle) * muzzle,
      target,
      this.stats,
      this.def.color
    ));
  }
}
