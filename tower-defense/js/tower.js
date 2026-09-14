'use strict';

/* Torre.
 *
 * Evolucao ramificada: nos niveis 2 e 3 o jogador escolhe entre dois caminhos,
 * entao cada torre tem 4 estados finais sem precisar de 7 blocos de status
 * escritos a mao. Cada ramo aplica multiplicadores sobre a base.
 *
 * Fusao: duas torres nivel 3 adjacentes com receita valida viram uma torre
 * nova. A fusao ocupa a celula alvo e libera a outra -- o labirinto muda
 * junto, entao fundir tambem e uma decisao de terreno. */

function fusionKey(a, b) {
  return [a, b].sort().join('+');
}

/* Todas as receitas de que um tipo de torre participa, com o parceiro que
 * cada uma exige. A interface usa isto para dizer ao jogador o que combina
 * com a torre selecionada, em vez de so informar que nada combina. */
function fusionsFor(typeKey) {
  const out = [];
  for (const key of Object.keys(FUSIONS)) {
    const parts = key.split('+');
    const i = parts.indexOf(typeKey);
    if (i === -1) continue;
    out.push({ partner: parts[1 - i], def: FUSIONS[key] });
  }
  return out;
}

class Tower {
  constructor(typeKey, c, r, tile) {
    this.typeKey = typeKey;
    this.def = TOWER_TYPES[typeKey];
    this.fused = false;
    this.c = c;
    this.r = r;
    this.level = 0;
    this.path = [];              // chaves dos ramos escolhidos
    this.cooldown = 0;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.invested = this.def.cost;
    this.x = (c + 0.5) * tile;
    this.y = (r + 0.5) * tile;
    this.refresh();
  }

  /* Recalcula os status a partir da base e dos ramos escolhidos.
   * Chamado so em upgrade/fusao -- o getter e lido todo quadro. */
  refresh() {
    const b = this.def.base;
    const m = { range: 1, damage: 1, fisico: 1, magico: 1, cooldown: 1,
                splash: 1, slow: 1, slowDur: 1, pierce: 0 };

    for (let i = 0; i < this.path.length; i++) {
      const branch = this.branchAt(i + 2, this.path[i]);
      if (!branch) continue;
      for (const key of Object.keys(branch.mods)) {
        if (key === 'pierce') m.pierce += branch.mods.pierce;
        else m[key] *= branch.mods[key];
      }
    }

    this._stats = {
      range: b.range * m.range,
      cooldown: Math.max(0.08, b.cooldown * m.cooldown),
      projSpeed: b.projSpeed,
      dmg: {
        fisico: b.dmg.fisico * m.damage * m.fisico,
        magico: b.dmg.magico * m.damage * m.magico
      },
      splash: b.splash ? b.splash * m.splash : 0,
      slow: b.slow ? Math.min(0.9, b.slow * m.slow) : 0,
      slowDur: b.slowDur ? b.slowDur * m.slowDur : 0,
      pierce: (b.pierce || 0) + m.pierce
    };
  }

  get stats() { return this._stats; }

  branchAt(level, key) {
    if (!this.def.upgrades || !this.def.upgrades[level]) return null;
    for (const b of this.def.upgrades[level]) if (b.key === key) return b;
    return null;
  }

  /* Os dois ramos oferecidos no proximo nivel, ou [] se nao ha proximo. */
  get nextBranches() {
    if (this.fused || !this.def.upgrades) return [];
    return this.def.upgrades[this.level + 2] || [];
  }

  get maxLevel() { return this.nextBranches.length === 0; }

  get sellValue() { return Math.floor(this.invested * CONFIG.sellRate); }

  get label() {
    if (this.fused) return this.def.name;
    return this.def.name + (this.level > 0 ? ' ' + 'I'.repeat(this.level + 1) : '');
  }

  upgrade(branchKey) {
    const branch = this.branchAt(this.level + 2, branchKey);
    if (!branch) return false;
    this.invested += branch.cost;
    this.path.push(branchKey);
    this.level += 1;
    this.refresh();
    return true;
  }

  /* Vira a torre fundida indicada, absorvendo o investimento da outra. */
  becomeFusion(key, other) {
    this.typeKey = key;
    this.def = FUSIONS[key];
    this.fused = true;
    this.level = 0;
    this.path = [];
    this.invested += other.invested;
    this.cooldown = 0;
    this.refresh();
  }

  /* Mira no inimigo mais adiantado dentro do alcance: o mais perto de vazar. */
  pickTarget(enemies) {
    const range = this.stats.range;
    let best = null;
    let bestProgress = Number.MAX_SAFE_INTEGER;

    for (const e of enemies) {
      if (e.dead || e.escaped) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > range + e.radius) continue;

      const p = e.progress();
      if (p < bestProgress) { bestProgress = p; best = e; }
    }
    return best;
  }

  update(dt, enemies, projectiles, rateBonus, mods) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.recoil > 0) this.recoil -= dt * 5;

    const target = this.pickTarget(enemies);
    if (!target) return;

    // A torre gira em direcao ao alvo mesmo sem poder atirar.
    this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    if (this.cooldown > 0) return;

    this.cooldown = this.stats.cooldown / (1 + (rateBonus || 0));
    this.recoil = 1;
    const muzzle = 15;
    projectiles.push(new Projectile(
      this.x + Math.cos(this.angle) * muzzle,
      this.y + Math.sin(this.angle) * muzzle,
      target,
      this.stats,
      this.def.color,
      mods
    ));
  }
}
