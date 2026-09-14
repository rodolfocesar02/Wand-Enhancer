'use strict';

/* Magias ativas: recarga propria, utilizaveis no meio da onda.
 *
 * Duas sao miradas (exigem um clique no mapa depois de ativar) e duas sao
 * instantaneas. Muralha e a mais interessante das quatro porque conversa com
 * a mecanica central: ela bloqueia uma celula por alguns segundos e forca o
 * recalculo da rota, sem custar ouro. */

class SpellBook {
  constructor(unlockedKeys, cdMul) {
    this.cdMul = cdMul || 1;
    this.slots = unlockedKeys.map(key => ({
      key: key,
      def: SPELLS[key],
      cd: 0,
      maxCd: SPELLS[key].cooldown * (cdMul || 1)
    }));
    this.pending = null; // magia mirada aguardando o clique no mapa
  }

  slot(key) {
    for (const s of this.slots) if (s.key === key) return s;
    return null;
  }

  ready(key) {
    const s = this.slot(key);
    return !!s && s.cd <= 0;
  }

  update(dt) {
    for (const s of this.slots) if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
  }

  /* Ativa. Se for mirada, entra em espera do clique e nao gasta recarga ainda. */
  arm(key) {
    const s = this.slot(key);
    if (!s || s.cd > 0) return 'indisponivel';
    if (s.def.targeted) {
      this.pending = this.pending === key ? null : key;
      return this.pending ? 'mirando' : 'cancelado';
    }
    return 'imediata';
  }

  spend(key) {
    const s = this.slot(key);
    if (!s) return;
    s.cd = s.maxCd;
    this.pending = null;
  }
}

const Spells = {
  /* Executa o efeito. cell so importa para as magias miradas. */
  cast(game, key, cell) {
    const def = SPELLS[key];
    if (!def) return false;

    switch (key) {
      case 'meteoro': return this.meteoro(game, def, cell);
      case 'gelar': return this.gelar(game, def);
      case 'furia': return this.furia(game, def);
      case 'muralha': return this.muralha(game, def, cell);
      default: return false;
    }
  },

  meteoro(game, def, cell) {
    if (!cell) return false;
    const x = (cell.c + 0.5) * CONFIG.tile;
    const y = (cell.r + 0.5) * CONFIG.tile;

    game.effects.push({ x: x, y: y, radius: def.radius, life: 0.5, max: 0.5, color: def.color, heavy: true });

    for (const e of game.enemies) {
      if (e.dead || e.escaped) continue;
      if (Math.hypot(e.x - x, e.y - y) <= def.radius + e.radius) {
        const dealt = e.takeHit(def.damage, game.damageMods);
        game.onDamage(e, dealt, def.damage);
      }
    }
    return true;
  },

  gelar(game, def) {
    for (const e of game.enemies) {
      if (e.dead || e.escaped) continue;
      e.applySlow(def.slow, def.duration);
    }
    game.effects.push({
      x: CONFIG.width / 2, y: CONFIG.height / 2,
      radius: Math.max(CONFIG.width, CONFIG.height), life: 0.45, max: 0.45, color: def.color
    });
    game.screenTint = { color: def.color, life: 0.6, max: 0.6 };
    return true;
  },

  furia(game, def) {
    game.rateBonus = def.rateBonus;
    game.rateTimer = def.duration;
    game.screenTint = { color: def.color, life: 0.5, max: 0.5 };
    return true;
  },

  /* Barreira temporaria. Usa a mesma validacao das torres: se selar o mapa,
   * a magia nao e gasta. */
  muralha(game, def, cell) {
    if (!cell) return false;
    const occupied = game.enemies.map(e => e.cell);
    if (!game.grid.tryBlock(cell.c, cell.r, CELL.MURALHA, occupied)) return false;

    game.walls.push({ c: cell.c, r: cell.r, life: def.duration, max: def.duration });
    game.invalidateBuildCache();
    return true;
  }
};
