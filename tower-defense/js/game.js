'use strict';

/* Estado e regras do jogo. Nao toca no DOM: quem observa e a UI. */

class Game {
  constructor() {
    this.listeners = [];
    this.reset();
  }

  onChange(fn) { this.listeners.push(fn); }

  emit() { for (const fn of this.listeners) fn(this); }

  reset() {
    this.grid = new Grid(CONFIG.cols, CONFIG.rows, CONFIG.spawn, CONFIG.exit);
    this.towers = [];
    this.towerAt = new Map();
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.floaters = [];

    this.gold = CONFIG.startGold;
    this.lives = CONFIG.startLives;
    this.wave = 0;
    this.score = 0;

    this.state = 'ready';          // ready | running | gameover
    this.paused = false;
    this.speedIndex = 0;
    this.elapsed = 0;

    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.restTimer = 0;

    this.hoverCell = null;
    this.selectedType = null;
    this.selectedTower = null;
    this.buildCache = new Map();
    this.message = '';
  }

  get speed() { return CONFIG.speeds[this.speedIndex]; }

  get waveInProgress() { return this.spawnQueue.length > 0 || this.enemies.length > 0; }

  key(c, r) { return c + ',' + r; }

  start() {
    this.state = 'running';
    this.restTimer = CONFIG.wavePause;
    this.emit();
  }

  /* ---------- construcao ---------- */

  canBuildAt(c, r) {
    if (!this.grid.inBounds(c, r)) return false;
    if (this.grid.isReserved(c, r)) return false;
    if (this.towerAt.has(this.key(c, r))) return false;

    // Nenhum inimigo pode estar em cima da celula no momento da construcao.
    for (const e of this.enemies) {
      const cell = e.cell;
      if (cell.c === c && cell.r === r) return false;
    }

    const cacheKey = this.key(c, r);
    if (this.buildCache.has(cacheKey)) return this.buildCache.get(cacheKey);

    // Simula o bloqueio: se selar a rota de alguem, nao pode.
    const occupied = this.enemies.map(e => e.cell);
    const ok = this.grid.tryBlock(c, r, occupied);
    if (ok) this.grid.unblock(c, r);

    this.buildCache.set(cacheKey, ok);
    return ok;
  }

  invalidateBuildCache() { this.buildCache.clear(); }

  build(typeKey, c, r) {
    const def = TOWER_TYPES[typeKey];
    if (!def) return false;

    if (this.gold < def.cost) {
      this.notify('Ouro insuficiente', c, r, '#f87171');
      return false;
    }
    if (!this.canBuildAt(c, r)) {
      this.notify('Não dá para fechar o caminho', c, r, '#f87171');
      return false;
    }

    const occupied = this.enemies.map(e => e.cell);
    if (!this.grid.tryBlock(c, r, occupied)) {
      this.notify('Não dá para fechar o caminho', c, r, '#f87171');
      return false;
    }

    const tower = new Tower(typeKey, c, r, CONFIG.tile);
    this.towers.push(tower);
    this.towerAt.set(this.key(c, r), tower);
    this.gold -= def.cost;
    this.invalidateBuildCache();
    this.notify('-' + def.cost, c, r, '#fbbf24');
    this.emit();
    return true;
  }

  upgradeSelected() {
    const t = this.selectedTower;
    if (!t || t.maxLevel) return;
    if (this.gold < t.upgradeCost) {
      this.notify('Ouro insuficiente', t.c, t.r, '#f87171');
      return;
    }
    const cost = t.upgradeCost;
    this.gold -= cost;
    t.upgrade();
    this.notify('-' + cost, t.c, t.r, '#fbbf24');
    this.emit();
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t) return;

    const refund = t.sellValue;
    this.gold += refund;
    this.towers.splice(this.towers.indexOf(t), 1);
    this.towerAt.delete(this.key(t.c, t.r));
    this.grid.unblock(t.c, t.r);
    this.invalidateBuildCache();
    this.selectedTower = null;
    this.notify('+' + refund, t.c, t.r, '#4ade80');
    this.emit();
  }

  /* ---------- ondas ---------- */

  callWave(manual) {
    if (this.state !== 'running' || this.waveInProgress) return;

    if (manual && this.restTimer > 0) {
      const bonus = Math.ceil(this.restTimer * CONFIG.earlyCallBonus);
      this.gold += bonus;
      this.notify('+' + bonus + ' antecipação', CONFIG.spawn.c + 2, CONFIG.spawn.r - 1, '#fbbf24');
    }

    this.wave += 1;
    this.restTimer = 0;
    this.spawnQueue = Waves.build(this.wave);
    this.spawnTimer = 0;
    this.emit();
  }

  spawn(typeKey) {
    this.enemies.push(new Enemy(typeKey, Waves.hpMultiplier(this.wave), this.grid, CONFIG.tile));
  }

  /* ---------- loop ---------- */

  update(dt) {
    this.elapsed += dt;
    this.decayFloaters(dt);

    if (this.state !== 'running' || this.paused) return;

    // Fila de spawn da onda atual
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      while (this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
        const item = this.spawnQueue.shift();
        this.spawn(item.type);
        this.spawnTimer += item.delay;
      }
    }

    for (const tower of this.towers) tower.update(dt, this.enemies, this.projectiles);

    for (const p of this.projectiles) p.update(dt, this.enemies, this.effects);
    this.projectiles = this.projectiles.filter(p => !p.done);

    let leaked = false;
    for (const e of this.enemies) {
      if (e.dead || e.escaped) continue;
      e.update(dt);

      if (e.escaped) {
        this.lives -= e.leak;
        leaked = true;
        this.notify('-' + e.leak, CONFIG.exit.c, CONFIG.exit.r, '#f87171');
      }
    }

    const survivors = [];
    for (const e of this.enemies) {
      if (e.dead) {
        this.gold += e.gold;
        this.score += e.gold;
        this.notify('+' + e.gold, e.x / CONFIG.tile - 0.5, e.y / CONFIG.tile - 0.5, '#fbbf24');
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
      this.state = 'gameover';
      this.emit();
      return;
    }

    // Onda concluida: paga o bonus e agenda a proxima.
    if (this.wave > 0 && !this.waveInProgress && this.restTimer <= 0) {
      const reward = Waves.reward(this.wave);
      this.gold += reward;
      this.score += reward;
      this.restTimer = CONFIG.wavePause;
      this.emit();
    } else if (this.restTimer > 0) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.callWave(false);
    }

    if (changed || this.spawnQueue.length > 0) this.emit();
  }

  decayFloaters(dt) {
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 26 * dt;
    }
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  notify(text, c, r, color) {
    this.floaters.push({
      text: text,
      x: (c + 0.5) * CONFIG.tile,
      y: (r + 0.5) * CONFIG.tile,
      life: 0.9,
      max: 0.9,
      color: color || '#e6ecff'
    });
  }

  /* ---------- interacao ---------- */

  selectType(typeKey) {
    this.selectedType = this.selectedType === typeKey ? null : typeKey;
    if (this.selectedType) this.selectedTower = null;
    this.emit();
  }

  clickCell(c, r) {
    if (this.state === 'ready') return;

    const existing = this.towerAt.get(this.key(c, r));
    if (existing) {
      this.selectedTower = this.selectedTower === existing ? null : existing;
      this.selectedType = null;
      this.emit();
      return;
    }

    if (this.selectedType) {
      this.build(this.selectedType, c, r);
      return;
    }

    this.selectedTower = null;
    this.emit();
  }

  clearSelection() {
    this.selectedType = null;
    this.selectedTower = null;
    this.emit();
  }

  togglePause() {
    if (this.state !== 'running') return;
    this.paused = !this.paused;
    this.emit();
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % CONFIG.speeds.length;
    this.emit();
  }
}
