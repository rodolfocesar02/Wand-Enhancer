'use strict';

/* Projetil teleguiado.
 *
 * Tres comportamentos no impacto, combinaveis:
 *  - direto: dano so no alvo
 *  - splash: dano a todos no raio
 *  - pierce: continua a trajetoria e atinge os proximos N inimigos
 *
 * Se o alvo morre antes do impacto, o projetil segue ate o ultimo ponto
 * conhecido para que bombardas ainda explodam ali. */

class Projectile {
  /* Que familia de efeito o impacto usa.
   *
   * A escolha sai do que o projetil FAZ, nao do nome da torre: qualquer fusao
   * que herde lentidao ganha gelo e qualquer uma que vire magica ganha
   * arcano, sem lista de casos para manter. Sao 15 fusoes com quatro niveis
   * cada -- uma lista dessas envelheceria na primeira torre nova.
   */
  static arteDe(stats) {
    if (stats.slow) return 'gelo';
    return Damage.dominant(stats.dmg) === DAMAGE.MAGICO ? 'arcano' : 'fogo';
  }

  constructor(x, y, target, stats, color, mods) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.stats = stats;
    this.color = color;
    this.mods = mods;
    this.speed = stats.projSpeed;
    this.pierce = stats.pierce || 0;
    this.hitSet = [];
    this.lastX = target.x;
    this.lastY = target.y;
    this.dirX = 0;
    this.dirY = 0;
    this.headingX = 1;   // direcao de chegada, guardada para a perfuracao
    this.headingY = 0;
    this.piercing = false;
    this.travelled = 0;
    this.done = false;
  }

  update(dt, enemies, effects, onHit) {
    if (this.piercing) return this.updatePierce(dt, enemies, effects, onHit);

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
      this.impact(enemies, effects, onHit);
      return;
    }

    this.headingX = dx / dist;
    this.headingY = dy / dist;
    this.x += this.headingX * step;
    this.y += this.headingY * step;
  }

  /* Depois do primeiro alvo, a flecha da balista vira um projetil reto que
   * consome perfuracoes ate acabar ou sair do mapa. */
  updatePierce(dt, enemies, effects, onHit) {
    const step = this.speed * dt;
    this.x += this.dirX * step;
    this.y += this.dirY * step;
    this.travelled += step;

    if (this.x < -20 || this.y < -20 || this.x > CONFIG.boardW + 20 ||
        this.y > CONFIG.boardH + 20 || this.travelled > 900) {
      this.done = true;
      return;
    }

    for (const e of enemies) {
      if (e.dead || e.escaped || this.hitSet.indexOf(e) !== -1) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > e.radius + 5) continue;

      this.hitSet.push(e);
      onHit(e, e.takeHit(this.stats.dmg, this.mods), this.stats.dmg);
      if (this.stats.slow) e.applySlow(this.stats.slow, this.stats.slowDur);

      if (--this.pierce <= 0) { this.done = true; return; }
    }
  }

  impact(enemies, effects, onHit) {
    const s = this.stats;

    if (s.splash) {
      // 0,24s bastava para o anel geometrico; a arte tem quatro quadros e
      // precisa de tempo para eles serem lidos como sequencia.
      effects.push({ x: this.x, y: this.y, radius: s.splash, life: 0.38, max: 0.38,
                     color: this.color, arte: Projectile.arteDe(s),
                     giro: Math.random() * 6.2832, escala: 1.0 });
      for (const e of enemies) {
        if (e.dead || e.escaped) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) <= s.splash + e.radius) {
          onHit(e, e.takeHit(s.dmg, this.mods), s.dmg);
          if (s.slow) e.applySlow(s.slow, s.slowDur);
        }
      }
      this.done = true;
      return;
    }

    const t = this.target;
    if (t && !t.dead && !t.escaped) {
      this.hitSet.push(t);
      onHit(t, t.takeHit(s.dmg, this.mods), s.dmg);
      if (s.slow) {
        t.applySlow(s.slow, s.slowDur);
        // O congelamento nao tinha arte nenhuma: so o disco ciano por baixo.
        // O estouro no instante do acerto e o que separa "levou um tiro de
        // gelo" de "ficou lento por algum motivo".
        if (effects.length < 90) {
          effects.push({ x: t.x, y: t.y, radius: t.radius, life: 0.34, max: 0.34,
                         color: '#7dd3fc', arte: 'gelo',
                         giro: Math.random() * 6.2832, escala: 2.1, espalha: 0.45 });
        }
      }
    }

    // Sobrou perfuracao: segue reto na direcao em que chegou. No impacto o
    // projetil esta em cima do alvo, entao recalcular a direcao daqui daria
    // 0/0 -- por isso ela vem do ultimo passo do voo.
    if (this.pierce > 0) {
      this.dirX = this.headingX;
      this.dirY = this.headingY;
      this.piercing = true;
      this.travelled = 0;
      return;
    }

    this.done = true;
  }
}
