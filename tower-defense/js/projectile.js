'use strict';

/* Projetil teleguiado. Se o alvo morre antes do impacto, segue ate o ultimo
 * ponto conhecido para que canhoes ainda causem dano em area ali. */

class Projectile {
  constructor(x, y, target, stats, color) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.stats = stats;
    this.color = color;
    this.speed = stats.projSpeed;
    this.lastX = target.x;
    this.lastY = target.y;
    this.done = false;
  }

  update(dt, enemies, effects) {
    if (this.target && !this.target.dead && !this.target.escaped) {
      this.lastX = this.target.x;
      this.lastY = this.target.y;
    }

    const dx = this.lastX - this.x;
    const dy = this.lastY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (dist <= step) {
      this.x = this.lastX;
      this.y = this.lastY;
      this.explode(enemies, effects);
      this.done = true;
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  explode(enemies, effects) {
    const s = this.stats;

    if (s.splash) {
      effects.push({ x: this.x, y: this.y, radius: s.splash, life: 0.22, max: 0.22, color: this.color });
      for (const e of enemies) {
        if (e.dead || e.escaped) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) <= s.splash + e.radius) {
          e.damage(s.damage);
          if (s.slow) e.applySlow(s.slow, s.slowDur);
        }
      }
      return;
    }

    const t = this.target;
    if (t && !t.dead && !t.escaped) {
      t.damage(s.damage);
      if (s.slow) t.applySlow(s.slow, s.slowDur);
    }
  }
}
