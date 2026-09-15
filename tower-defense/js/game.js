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
    this.menuTower = null;   // torre com o menu de ações aberto (toque longo)
    this.fusePending = null; // escolha de parceira para fusão em andamento
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

    Trail.reset();

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

  /* A faixa de magias vive dentro do canvas, abaixo do tabuleiro: fica a um
   * toque de distância sem roubar área de jogo e sem depender de rolagem. */
  stripLayout() {
    const slots = this.spellbook.slots;
    const n = slots.length || 1;
    const pad = 9;
    const w = (CONFIG.boardW - pad * (n + 1)) / n;
    return slots.map((slot, i) => ({
      slot: slot,
      x: pad + i * (w + pad),
      y: CONFIG.boardH + pad,
      w: w,
      h: CONFIG.strip - pad * 2
    }));
  }

  /* Devolve a magia sob o ponto, ou null se o ponto não está na faixa. */
  hitStrip(x, y) {
    if (y < CONFIG.boardH) return null;
    for (const b of this.stripLayout()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.slot.key;
    }
    return null;
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
    this.menuTower = null;
    this.fusePending = null;
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
  /* Receitas disponiveis para esta torre, com TODAS as parceiras possiveis do
   * tabuleiro -- nao so as vizinhas.
   *
   * A adjacencia era uma exigencia minha e estava errada. O jogador posiciona
   * torre em funcao do labirinto, nao de receita; pedir que duas nivel 3 do
   * par certo caiam lado a lado e pedir coincidencia, e a mecanica quase nunca
   * aparecia. A decisao de terreno continua existindo -- a celula da parceira
   * e liberada onde quer que ela esteja -- so que agora e uma escolha, e nao
   * um sorteio. */
  fusionRecipes(tower) {
    if (!this.fusionEnabled || !tower || tower.fused || !tower.maxLevel) return [];

    const porReceita = new Map();
    for (const other of this.towers) {
      if (other === tower || other.fused || !other.maxLevel) continue;

      const key = fusionKey(tower.typeKey, other.typeKey);
      if (!FUSIONS[key]) continue;

      if (!porReceita.has(key)) porReceita.set(key, { key: key, def: FUSIONS[key], partners: [] });
      porReceita.get(key).partners.push(other);
    }
    return Array.from(porReceita.values());
  }

  /* Arma a escolha da parceira: o tabuleiro escurece e so as torres que
   * servem para esta receita ficam com a cor natural. */
  fuseArm(recipeKey) {
    const t = this.selectedTower;
    if (!t) return false;

    const receita = this.fusionRecipes(t).find(r => r.key === recipeKey);
    if (!receita) return false;

    this.fusePending = { tower: t, key: recipeKey, def: receita.def, partners: receita.partners };
    this.menuTower = null;
    this.selectedType = null;
    this.spellbook.pending = null;
    this.emit();
    return true;
  }

  fuseCancel() {
    if (!this.fusePending) return;
    this.fusePending = null;
    this.emit();
  }

  fuse(tower, other) {
    const key = fusionKey(tower.typeKey, other.typeKey);
    if (!FUSIONS[key] || !this.fusionEnabled) return false;
    if (tower === other || tower.fused || other.fused) return false;
    if (!tower.maxLevel || !other.maxLevel) return false;

    // A torre fundida fica na celula da selecionada; a celula da parceira abre
    // e o labirinto muda junto -- fundir continua sendo decisao de terreno,
    // mesmo com as duas longe uma da outra. Liberar celula nunca pode selar o
    // mapa, entao nao ha o que validar aqui.
    this.removeTower(other);
    tower.becomeFusion(key, other);
    this.selectedTower = tower;
    this.fusePending = null;
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
      tower.update(dt, this.enemies, this.projectiles, this.rateBonus, this.damageMods, this);
    }

    const onHit = (enemy, dealt, packet) => this.onDamage(enemy, dealt, packet);
    for (const p of this.projectiles) p.update(dt, this.enemies, this.effects, onHit);
    this.projectiles = this.projectiles.filter(p => !p.done);

    let leaked = false;
    for (const e of this.enemies) {
      if (e.dead || e.escaped) continue;
      e.update(dt);
      // A trilha e carimbada por distancia, nao por quadro: o custo nao muda
      // com a taxa de quadros nem com a velocidade do jogo.
      if (e.walked - e.lastStamp >= Trail.PASSO) {
        e.lastStamp = e.walked;
        Trail.stamp(e);
      }

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
        this.effects.push({ x: e.x, y: e.y, radius: e.radius + 6, life: 0.22, max: 0.22, color: e.color });
        this.effects.push({ kind: 'shards', x: e.x, y: e.y, radius: e.radius,
                            life: 0.34, max: 0.34, color: e.color });
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
    if (dealt < 1) return;

    // A sensação de acerto vem de movimento, não de detalhe de sprite: por
    // isso faísca e tranco valem em qualquer escala, inclusive a 26px.
    const school = Damage.dominant(packet);
    enemy.knock = 1;
    if (this.effects.length < 90) {
      this.effects.push({
        kind: 'spark', x: enemy.x, y: enemy.y, angle: enemy.angle,
        life: 0.18, max: 0.18, color: DAMAGE_META[school].color,
        big: dealt > 60
      });
    }

    if (this.floaters.length > 26) return;
    if (dealt < 18 && Math.random() > 0.25) return;
    this.notify(Math.round(dealt), enemy.x, enemy.y - enemy.radius - 4,
                DAMAGE_META[school].color);
  }

  /* Clarão na boca de tiro, disparado pela torre no instante do tiro. */
  muzzle(x, y, angle, color) {
    if (this.effects.length > 90) return;
    this.effects.push({ kind: 'muzzle', x: x, y: y, angle: angle,
                        life: 0.09, max: 0.09, color: color });
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
    if (this.selectedType) this.selectedTower = null;
    this.spellbook.pending = null;
    this.emit();
  }

  clickCell(c, r) {
    if (this.screen !== 'playing') return;

    if (this.spellbook.pending) { this.castPending({ c: c, r: r }); return; }

    const existing = this.towerAt.get(this.key(c, r));

    // Escolha da parceira de fusão: só as torres destacadas respondem.
    if (this.fusePending) {
      if (existing && this.fusePending.partners.indexOf(existing) !== -1) {
        this.fuse(this.fusePending.tower, existing);
      } else {
        this.fuseCancel();
      }
      return;
    }

    if (existing) {
      this.selectedTower = this.selectedTower === existing ? null : existing;
      this.selectedType = null;
      this.emit();
      return;
    }

    if (this.selectedType) { this.build(this.selectedType, c, r); return; }

    this.selectedTower = null;
    this.emit();
  }

  /* Toque longo numa torre abre o menu de ações (evoluir, fundir, vender).
   * Um toque curto apenas seleciona e mostra o alcance. */
  openMenu(c, r) {
    const tower = this.towerAt.get(this.key(c, r));
    if (!tower) return false;
    this.menuTower = tower;
    this.selectedTower = tower;
    this.selectedType = null;
    this.spellbook.pending = null;
    this.emit();
    return true;
  }

  closeMenu() {
    if (!this.menuTower) return;
    this.menuTower = null;
    this.emit();
  }

  clearSelection() {
    this.selectedType = null;
    this.selectedTower = null;
    this.menuTower = null;
    this.fusePending = null;
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
