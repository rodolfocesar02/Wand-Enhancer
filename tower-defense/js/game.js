'use strict';

/* Estado e regras. Nao toca no DOM: quem observa e a UI.
 *
 * Isso e proposital -- a partida inteira roda sem tela, o que permite medir
 * o balanceamento por simulacao em vez de chutar. */

class Game {
  constructor() {
    this.listeners = [];
    this.screen = 'menu';
    this.resetRunState(MAPS[0]);
  }

  onChange(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  resetRunState(map) {
    this.map = map;
    this.grid = new Grid(map);
    this.towers = [];
    this.towerAt = new Map();
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.floaters = [];
    this.walls = [];

    this.gold = CONFIG.startGold;
    this.lives = CONFIG.startLives;
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.leaked = 0;

    this.paused = false;
    this.speedIndex = 0;
    this.elapsed = 0;

    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.restTimer = 0;

    this.hoverCell = null;
    this.selectedType = null;
    this.selectedTower = null;
    this.fuseArmed = null;
    this.buildCache = new Map();

    this.rateBonus = 0;
    this.rateTimer = 0;
    this.screenTint = null;

    this.damageMods = { fisicoMul: 1, magicoMul: 1 };
    this.unlockedTowers = Object.keys(TOWER_TYPES).filter(k => TOWER_TYPES[k].starter);
    this.unlockedSpells = [STARTER_SPELL];
    this.fusionEnabled = false;
    this.spellbook = new SpellBook(this.unlockedSpells, 1);
    this.lastXp = 0;
  }

  /* ------------------------------------------------------------- run ---- */

  startRun(mapId) {
    const bonus = Meta.bonuses();
    const map = getMap(mapId || bonus.maps[0]);

    this.resetRunState(map);
    this.gold = bonus.startGold;
    this.lives = bonus.startLives;
    this.damageMods = { fisicoMul: bonus.fisicoMul, magicoMul: bonus.magicoMul };
    this.unlockedTowers = bonus.towers.slice();
    this.unlockedSpells = bonus.spells.slice();
    this.fusionEnabled = bonus.fusion;
    this.spellbook = new SpellBook(this.unlockedSpells, bonus.spellCdMul);

    this.screen = 'playing';
    this.restTimer = CONFIG.wavePause;
    this.emit();
  }

  endRun(won) {
    this.screen = won ? 'victory' : 'gameover';
    this.lastXp = Meta.awardRun(this.wave, this.score, won);
    this.emit();
  }

  toMenu() {
    this.screen = 'menu';
    this.emit();
  }

  get speed() { return CONFIG.speeds[this.speedIndex]; }
  get waveInProgress() { return this.spawnQueue.length > 0 || this.enemies.length > 0; }
  key(c, r) { return c + ',' + r; }

  /* -------------------------------------------------------- construcao -- */

  canBuildAt(c, r) {
    if (!this.grid.inBounds(c, r)) return false;
    if (this.grid.isReserved(c, r)) return false;
    if (this.grid.cellAt(c, r) !== CELL.LIVRE) return false;

    for (const e of this.enemies) {
      const cell = e.cell;
      if (cell.c === c && cell.r === r) return false;
    }

    const cacheKey = this.key(c, r);
    if (this.buildCache.has(cacheKey)) return this.buildCache.get(cacheKey);

    const occupied = this.enemies.map(e => e.cell);
    const ok = this.grid.tryBlock(c, r, CELL.TORRE, occupied);
    if (ok) this.grid.unblock(c, r);

    this.buildCache.set(cacheKey, ok);
    return ok;
  }

  invalidateBuildCache() { this.buildCache.clear(); }

  build(typeKey, c, r) {
    const def = TOWER_TYPES[typeKey];
    if (!def || this.unlockedTowers.indexOf(typeKey) === -1) return false;

    if (this.gold < def.cost) { this.notifyCell('Ouro insuficiente', c, r, '#f87171'); return false; }

    const occupied = this.enemies.map(e => e.cell);
    if (!this.canBuildAt(c, r) || !this.grid.tryBlock(c, r, CELL.TORRE, occupied)) {
      this.notifyCell('Fecharia o caminho', c, r, '#f87171');
      return false;
    }

    const tower = new Tower(typeKey, c, r, CONFIG.tile);
    this.towers.push(tower);
    this.towerAt.set(this.key(c, r), tower);
    this.gold -= def.cost;
    this.invalidateBuildCache();
    this.notifyCell('-' + def.cost, c, r, '#fbbf24');
    this.emit();
    return true;
  }

  upgradeSelected(branchKey) {
    const t = this.selectedTower;
    if (!t || t.maxLevel) return false;

    const branch = t.branchAt(t.level + 2, branchKey);
    if (!branch) return false;
    if (this.gold < branch.cost) {
      this.notifyCell('Ouro insuficiente', t.c, t.r, '#f87171');
      return false;
    }

    this.gold -= branch.cost;
    t.upgrade(branchKey);
    this.notifyCell(branch.name, t.c, t.r, t.def.color);
    this.emit();
    return true;
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t) return;

    const refund = t.sellValue;
    this.gold += refund;
    this.removeTower(t);
    this.selectedTower = null;
    this.fuseArmed = null;
    this.notifyCell('+' + refund, t.c, t.r, '#4ade80');
    this.emit();
  }

  removeTower(t) {
    const i = this.towers.indexOf(t);
    if (i !== -1) this.towers.splice(i, 1);
    this.towerAt.delete(this.key(t.c, t.r));
    this.grid.unblock(t.c, t.r);
    this.invalidateBuildCache();
  }

  /* ------------------------------------------------------------ fusao -- */

  /* Vizinhas ortogonais que formam receita valida com a torre dada. */
  fusionOptions(tower) {
    if (!this.fusionEnabled || !tower || tower.fused || !tower.maxLevel) return [];

    const out = [];
    for (const d of DIRS) {
      const other = this.towerAt.get(this.key(tower.c + d[0], tower.r + d[1]));
      if (!other || other.fused || !other.maxLevel) continue;

      const key = fusionKey(tower.typeKey, other.typeKey);
      if (FUSIONS[key]) out.push({ key: key, def: FUSIONS[key], other: other });
    }
    return out;
  }

  fuse(tower, other) {
    const key = fusionKey(tower.typeKey, other.typeKey);
    if (!FUSIONS[key] || !this.fusionEnabled) return false;
    if (tower.fused || other.fused || !tower.maxLevel || !other.maxLevel) return false;

    // A torre fundida fica na celula da selecionada; a outra celula abre e o
    // labirinto muda junto -- fundir tambem e uma decisao de terreno.
    this.removeTower(other);
    tower.becomeFusion(key, other);
    this.selectedTower = tower;
    this.fuseArmed = null;
    this.invalidateBuildCache();
    this.notifyCell(FUSIONS[key].name, tower.c, tower.r, FUSIONS[key].color);
    this.effects.push({ x: tower.x, y: tower.y, radius: 70, life: 0.6, max: 0.6,
                        color: FUSIONS[key].color, heavy: true });
    this.emit();
    return true;
  }

  /* ----------------------------------------------------------- magias -- */

  triggerSpell(key) {
    if (this.screen !== 'playing') return;
    if (this.unlockedSpells.indexOf(key) === -1) return;

    const result = this.spellbook.arm(key);
    if (result === 'imediata') {
      if (Spells.cast(this, key, null)) this.spellbook.spend(key);
    }
    this.emit();
  }

  castPending(cell) {
    const key = this.spellbook.pending;
    if (!key) return false;
    if (Spells.cast(this, key, cell)) {
      this.spellbook.spend(key);
      this.emit();
      return true;
    }
    this.notifyCell('Não dá para lançar aí', cell.c, cell.r, '#f87171');
    return true; // consome o clique de qualquer forma
  }

  /* ------------------------------------------------------------ ondas -- */

  callWave(manual) {
    if (this.screen !== 'playing' || this.waveInProgress) return;
    if (this.wave >= CONFIG.wavesPerRun) return;

    if (manual && this.restTimer > 0) {
      const bonus = Math.ceil(this.restTimer * CONFIG.earlyCallBonus);
      this.gold += bonus;
      this.notifyCell('+' + bonus + ' antecipação', this.grid.spawn.c + 2, this.grid.spawn.r, '#fbbf24');
    }

    this.wave += 1;
    this.restTimer = 0;
    this.spawnQueue = Waves.build(this.wave);
    this.spawnTimer = 0;
    this.emit();
  }

  /* ------------------------------------------------------------- loop -- */

  update(dt) {
    this.elapsed += dt;
    this.decayFloaters(dt);
    if (this.screenTint) {
      this.screenTint.life -= dt;
      if (this.screenTint.life <= 0) this.screenTint = null;
    }

    if (this.screen !== 'playing' || this.paused) return;

    this.spellbook.update(dt);

    if (this.rateTimer > 0) {
      this.rateTimer -= dt;
      if (this.rateTimer <= 0) this.rateBonus = 0;
    }

    // Muralhas temporarias expiram e devolvem a celula ao mapa.
    if (this.walls.length > 0) {
      let expired = false;
      for (const w of this.walls) w.life -= dt;
      this.walls = this.walls.filter(w => {
        if (w.life > 0) return true;
        this.grid.unblock(w.c, w.r);
        expired = true;
        return false;
      });
      if (expired) this.invalidateBuildCache();
    }

    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      while (this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
        const item = this.spawnQueue.shift();
        this.enemies.push(new Enemy(item.type, item.affix, item.level, this.grid, CONFIG.tile));
        this.spawnTimer += item.delay;
      }
    }

    for (const tower of this.towers) {
      tower.update(dt, this.enemies, this.projectiles, this.rateBonus, this.damageMods);
    }

    const onHit = (enemy, dealt, packet) => this.onDamage(enemy, dealt, packet);
    for (const p of this.projectiles) p.update(dt, this.enemies, this.effects, onHit);
    this.projectiles = this.projectiles.filter(p => !p.done);

    let leaked = false;
    for (const e of this.enemies) {
      if (e.dead || e.escaped) continue;
      e.update(dt);
      if (e.escaped) {
        this.lives -= e.leak;
        this.leaked += 1;
        leaked = true;
        this.notifyCell('-' + e.leak, this.grid.exit.c, this.grid.exit.r, '#f87171');
      }
    }

    const survivors = [];
    for (const e of this.enemies) {
      if (e.dead) {
        this.gold += e.gold;
        this.score += e.gold;
        this.kills += 1;
        this.notify('+' + e.gold, e.x, e.y - 8, '#fbbf24');
        this.effects.push({ x: e.x, y: e.y, radius: e.radius + 6, life: 0.2, max: 0.2, color: e.color });
        continue;
      }
      if (e.escaped) continue;
      survivors.push(e);
    }

    const changed = leaked || survivors.length !== this.enemies.length;
    this.enemies = survivors;
    if (changed) this.invalidateBuildCache();

    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter(fx => fx.life > 0);

    if (this.lives <= 0) {
      this.lives = 0;
      this.endRun(false);
      return;
    }

    if (this.wave > 0 && !this.waveInProgress && this.restTimer <= 0) {
      const reward = Waves.reward(this.wave);
      this.gold += reward;
      this.score += reward;

      if (this.wave >= CONFIG.wavesPerRun) { this.endRun(true); return; }

      this.restTimer = CONFIG.wavePause;
      this.emit();
    } else if (this.restTimer > 0) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.callWave(false);
    }

    if (changed || this.spawnQueue.length > 0) this.emit();
  }

  /* Numeros de dano sao limitados de proposito: mostrar todo acerto vira
   * poluicao visual e esconde a informacao que importa. */
  onDamage(enemy, dealt, packet) {
    if (dealt < 1 || this.floaters.length > 26) return;
    if (dealt < 18 && Math.random() > 0.25) return;
    this.notify(Math.round(dealt), enemy.x, enemy.y - enemy.radius - 4,
                DAMAGE_META[Damage.dominant(packet)].color);
  }

  decayFloaters(dt) {
    for (const f of this.floaters) { f.life -= dt; f.y -= 26 * dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  notify(text, x, y, color) {
    this.floaters.push({ text: String(text), x: x, y: y, life: 0.85, max: 0.85,
                         color: color || '#e6ecff' });
  }

  notifyCell(text, c, r, color) {
    this.notify(text, (c + 0.5) * CONFIG.tile, (r + 0.5) * CONFIG.tile, color);
  }

  /* ------------------------------------------------------- interacao --- */

  selectType(typeKey) {
    if (this.unlockedTowers.indexOf(typeKey) === -1) return;
    this.selectedType = this.selectedType === typeKey ? null : typeKey;
    if (this.selectedType) { this.selectedTower = null; this.fuseArmed = null; }
    this.spellbook.pending = null;
    this.emit();
  }

  clickCell(c, r) {
    if (this.screen !== 'playing') return;

    if (this.spellbook.pending) { this.castPending({ c: c, r: r }); return; }

    const existing = this.towerAt.get(this.key(c, r));

    // Segundo clique da fusao: escolher a vizinha.
    if (this.fuseArmed && existing && existing !== this.fuseArmed) {
      const options = this.fusionOptions(this.fuseArmed);
      for (const opt of options) {
        if (opt.other === existing) { this.fuse(this.fuseArmed, existing); return; }
      }
    }

    if (existing) {
      this.selectedTower = this.selectedTower === existing ? null : existing;
      this.selectedType = null;
      this.fuseArmed = null;
      this.emit();
      return;
    }

    if (this.selectedType) { this.build(this.selectedType, c, r); return; }

    this.selectedTower = null;
    this.fuseArmed = null;
    this.emit();
  }

  armFusion() {
    if (!this.selectedTower) return;
    this.fuseArmed = this.fuseArmed === this.selectedTower ? null : this.selectedTower;
    this.emit();
  }

  clearSelection() {
    this.selectedType = null;
    this.selectedTower = null;
    this.fuseArmed = null;
    this.spellbook.pending = null;
    this.emit();
  }

  togglePause() {
    if (this.screen !== 'playing') return;
    this.paused = !this.paused;
    this.emit();
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % CONFIG.speeds.length;
    this.emit();
  }
}
