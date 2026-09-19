'use strict';

/* Estado e regras. Nao toca no DOM: quem observa e a UI.
 *
 * Isso e proposital -- a partida inteira roda sem tela, o que permite medir
 * o balanceamento por simulacao em vez de chutar. */

const RELATORIO_KEY = 'td_ultimo_relatorio';

/* Ultimo relatorio guardado, ou null. Lido pela tela de menu. */
function ultimoRelatorio() {
  try {
    const raw = localStorage.getItem(RELATORIO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) { return null; }
}

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
    // O grid puxa o campo de custo daqui a cada recalculo. Com o medo
    // desligado devolve null e os campos de fluxo voltam a ser o BFS antigo.
    this.grid.custoFn = () => Perigo.campo();
    this.medoRelogio = 0;
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

    // Registro da partida, onda a onda. Existe porque o bot nao joga como
    // gente: ele fecha a serpentina em poucas ondas e o jogador leva oito.
    // Calibrar contra o bot sozinho estava mirando no alvo errado.
    this.registro = [];
    this.ondaStats = this.novaOndaStats();

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

  novaOndaStats() {
    return { ouroTorres: 0, ouroEvolucao: 0, ouroReparo: 0,
             construidas: 0, destruidas: 0, vazou: 0, abates: 0 };
  }

  /* Uma linha por onda: o que foi construido, o que caiu, o quanto o
   * labirinto alongou a viagem e quanto vazou. */
  fecharRegistro() {
    const s = this.ondaStats;
    const sp = this.grid.spawn;
    this.registro.push({
      onda: this.wave,
      rota: this.grid.passos(this.grid.flow),
      folga: Math.round(this.grid.folga(sp.c, sp.r) * 100) / 100,
      torres: this.towers.length,
      obras: this.towers.filter(t => !t.pronta).length,
      construidas: s.construidas,
      destruidas: s.destruidas,
      vazou: s.vazou,
      vidas: this.lives,
      ouro: this.gold,
      gastoTorres: s.ouroTorres,
      gastoEvolucao: s.ouroEvolucao,
      gastoReparo: s.ouroReparo,
      abates: s.abates
    });
    this.ondaStats = this.novaOndaStats();
  }

  /* O relatorio sobrevive ao fim da partida.
   *
   * Existe porque ja se perdeu duas vezes: a tela de fim fecha e o unico
   * registro do que aconteceu vai junto. Guardar o ultimo custa uma linha de
   * localStorage e devolve o instrumento. */
  guardaRelatorio() {
    try {
      localStorage.setItem(RELATORIO_KEY, JSON.stringify({
        quando: Date.now(),
        mapa: this.map.id,
        venceu: this.screen === 'victory',
        onda: this.wave,
        vidas: this.lives,
        texto: this.relatorio()
      }));
    } catch (err) { /* navegador sem localStorage: segue sem guardar */ }
  }

  /* Texto pronto para colar de volta numa conversa. Tabela, nao prosa: o que
   * se quer daqui e comparar partidas, nao ler. */
  relatorio() {
    const cab = '| Onda | Rota | Folga | Torres | Obra | +T | -T | Vazou | Vidas | Ouro | $torre | $evo | $rep |';
    const sep = '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
    const linhas = this.registro.map(r =>
      '| ' + [r.onda, r.rota, r.folga.toFixed(2), r.torres, r.obras, r.construidas,
              r.destruidas, r.vazou, r.vidas, r.ouro, r.gastoTorres,
              r.gastoEvolucao, r.gastoReparo].join(' | ') + ' |');

    const modo = 'medo=' + (CONFIG.medo ? 'on' : 'off') +
                 ' paciencia=' + (CONFIG.medoPaciencia ? 'on' : 'off') +
                 ' obra=' + (CONFIG.obra ? 'on' : 'off');
    const fim = this.screen === 'victory' ? 'venceu' : 'caiu na onda ' + this.wave;

    return ['Tower Defense - relatorio de partida',
            'mapa=' + this.map.id + '  ' + modo,
            'resultado: ' + fim + ', ' + this.lives + ' vidas, ' +
              this.kills + ' abates, ' + this.score + ' pontos',
            '', cab, sep].concat(linhas).join('\n');
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
    Perigo.reset();
    this.grid.computeFear();

    this.screen = 'playing';
    this.restTimer = CONFIG.wavePause;
    this.emit();
  }

  endRun(won) {
    // A onda em que a partida acabou tambem entra no registro: e justamente
    // a linha que explica por que acabou.
    if (this.wave > 0 && (this.registro.length === 0 ||
        this.registro[this.registro.length - 1].onda !== this.wave)) {
      this.fecharRegistro();
    }
    this.screen = won ? 'victory' : 'gameover';
    this.lastXp = Meta.awardRun(this.wave, this.score, won);
    this.guardaRelatorio();
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
    // Torre em obra nao bloqueia a celula, mas ela esta ocupada mesmo assim.
    if (this.towerAt.has(this.key(c, r))) return false;

    for (const e of this.enemies) {
      const cell = e.cell;
      if (cell.c === c && cell.r === r) return false;
    }

    const cacheKey = this.key(c, r);
    if (this.buildCache.has(cacheKey)) return this.buildCache.get(cacheKey);

    const ok = this.validaFuturo(c, r);
    this.buildCache.set(cacheKey, ok);
    return ok;
  }

  /* Valida a construcao contra o tabuleiro FUTURO: com todas as obras em
   * andamento ja fechadas.
   *
   * Sem isso, duas obras validadas isoladamente poderiam selar o mapa juntas
   * e a segunda so descobriria isso ao terminar -- tarde demais para avisar o
   * jogador. Validando contra o futuro, terminar uma obra nunca pode fechar o
   * labirinto. */
  validaFuturo(c, r) {
    const obras = [];
    this.grid.probing = true;

    for (const t of this.towers) {
      if (t.pronta) continue;
      const i = this.grid.idx(t.c, t.r);
      if (this.grid.cells[i] !== CELL.LIVRE) continue;
      this.grid.cells[i] = CELL.TORRE;
      obras.push(i);
    }

    const ok = this.grid.tryBlock(c, r, CELL.TORRE, null);
    if (ok) this.grid.unblock(c, r);

    for (const i of obras) this.grid.cells[i] = CELL.LIVRE;
    this.grid.probing = false;
    this.grid.compute();
    return ok;
  }

  invalidateBuildCache() { this.buildCache.clear(); this._rotaCache = null; }

  /* Quantos passos esta construcao acrescenta na rota curta. E o que define o
   * tamanho da obra: fechar o caminho e trabalho pesado, acompanhar a rota
   * nao e. */
  deltaRota(c, r) {
    const antes = this.grid.passos(this.grid.flow);
    if (antes < 0) return 0;

    this.grid.probing = true;
    const ok = this.grid.tryBlock(c, r, CELL.TORRE, null);
    let depois = antes;
    if (ok) { depois = this.grid.passos(this.grid.flow); this.grid.unblock(c, r); }
    this.grid.probing = false;
    this.grid.computeFear();

    return depois < 0 ? 0 : Math.max(0, depois - antes);
  }

  /* Rota que existiria SE a torre fosse construida aqui.
   *
   * O tabuleiro nao tem mais estrada desenhada: quem mostra por onde eles
   * andam e a trilha, que emerge do trafego real. Mas planejar sem nenhuma
   * previsao seria construir no escuro, ainda mais com medo e paciencia em
   * jogo. Entao a previsao aparece exatamente quando serve: com a torre na
   * mao, sobre a celula onde ela cairia. */
  rotaPrevista(c, r) {
    const chave = c + ',' + r + ':' + this.towers.length;
    if (this._rotaCache && this._rotaCache.chave === chave) return this._rotaCache.rotas;

    const rotas = [];
    this.grid.probing = true;
    const ok = this.grid.tryBlock(c, r, CELL.TORRE, null);
    this.grid.probing = false;

    if (ok) {
      this.grid.computeFear();
      const vistas = new Set();
      for (const nome of ['cauteloso', 'normal', 'afoito']) {
        const pts = this.grid.previewPath(CONFIG.tile, nome);
        if (pts.length < 2) continue;
        const sig = pts.map(p => p.x + '_' + p.y).join('|');
        if (vistas.has(sig)) continue;
        vistas.add(sig);
        rotas.push({ nome: nome, pts: pts });
      }
      this.grid.unblock(c, r);
    }
    this.grid.computeFear();

    this._rotaCache = { chave: chave, rotas: rotas };
    return rotas;
  }

  build(typeKey, c, r) {
    const def = TOWER_TYPES[typeKey];
    if (!def || this.unlockedTowers.indexOf(typeKey) === -1) return false;

    if (this.gold < def.cost) { this.notifyCell('Ouro insuficiente', c, r, '#f87171'); return false; }

    if (!this.canBuildAt(c, r)) {
      this.notifyCell('Fecharia o caminho', c, r, '#f87171');
      return false;
    }

    const tower = new Tower(typeKey, c, r, CONFIG.tile);
    if (CONFIG.obra) tower.alongarObra(this.deltaRota(c, r));
    this.towers.push(tower);
    this.towerAt.set(this.key(c, r), tower);
    this.gold -= def.cost;
    this.ondaStats.ouroTorres += def.cost;
    this.ondaStats.construidas += 1;

    // A celula so fecha quando a obra termina. Enquanto isso a rota curta
    // continua aberta -- meio labirinto nao segura ninguem.
    if (tower.pronta) this.fecharCelula(tower);

    this.invalidateBuildCache();
    this.notifyCell('-' + def.cost, c, r, '#fbbf24');
    this.emit();
    return true;
  }

  /* Fecha a celula de uma obra terminada. Devolve false se algum inimigo vivo
   * ficaria sem rota -- nesse caso a obra espera ele sair, o que e melhor que
   * prender um monstro num bolso fechado. */
  fecharCelula(tower) {
    const occupied = this.enemies.map(e => e.cell);
    for (const cell of occupied) if (cell.c === tower.c && cell.r === tower.r) return false;

    if (!this.grid.tryBlock(tower.c, tower.r, CELL.TORRE, occupied)) return false;
    this.invalidateBuildCache();
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
    this.ondaStats.ouroEvolucao += branch.cost;
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
    this.effects.push({ x: tower.x, y: tower.y, radius: 46, life: 0.7, max: 0.7,
                        color: FUSIONS[key].color, arte: 'arcano',
                        giro: Math.random() * 6.2832, escala: 1.1, espalha: 0.5 });
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

    // O esquecimento do medo e por onda, nao por segundo: assim o ritmo com
    // que a rota volta ao corredor antigo nao muda com a velocidade do jogo.
    Perigo.decair();
    this.repararTorres(CONFIG.reparoOnda);

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

    // O campo de medo muda a cada tiro. Recalcular a todo quadro seria
    // desperdicio e faria a rota tremer; a cada segundo a mudanca de rota
    // parece uma decisao, e nao uma falha.
    if (Perigo.ligado() && Perigo.sujo) {
      this.medoRelogio += dt;
      if (this.medoRelogio >= Perigo.INTERVALO) {
        this.medoRelogio = 0;
        Perigo.sujo = false;
        this.grid.computeFear();
      }
    }

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
      if (!tower.pronta) {
        tower.obra -= dt;
        if (tower.obra <= 0) {
          tower.obra = 0;
          if (!this.fecharCelula(tower)) tower.obra = 0.05;   // espera o inimigo sair
          else { this.notifyCell('pronta', tower.c, tower.r, tower.def.color); this.emit(); }
        }
        continue;
      }
      tower.update(dt, this.enemies, this.projectiles, this.rateBonus, this.damageMods, this);
    }

    const onHit = (enemy, dealt, packet) => this.onDamage(enemy, dealt, packet);
    for (const p of this.projectiles) p.update(dt, this.enemies, this.effects, onHit);
    this.projectiles = this.projectiles.filter(p => !p.done);

    let leaked = false;
    for (const e of this.enemies) {
      if (e.dead || e.escaped) continue;
      e.update(dt, this);
      // A trilha e carimbada por distancia, nao por quadro: o custo nao muda
      // com a taxa de quadros nem com a velocidade do jogo.
      if (e.walked - e.lastStamp >= Trail.PASSO) {
        e.lastStamp = e.walked;
        Trail.stamp(e);
      }

      if (e.escaped) {
        this.lives -= e.leak;
        this.leaked += 1;
        this.ondaStats.vazou += 1;
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
        this.ondaStats.abates += 1;
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
      this.fecharRegistro();
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

    // O medo se alimenta daqui: a celula onde o inimigo apanhou fica mais cara
    // de atravessar. Uma torre que nunca atirou nao aparece no campo -- e isso
    // que da sentido ao modo silencioso.
    Perigo.marcar(enemy.x, enemy.y, dealt);

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

  /* A torre apanha de um inimigo impaciente. Se cair, a celula abre e o
   * labirinto inteiro se refaz -- o que e o ponto: a serpentina deixa de ser
   * construcao definitiva e vira uma coisa que precisa ser mantida. */
  torreApanha(torre, dano, inimigo) {
    if (!torre || torre.destruida) return;

    if (torre.apanhar(dano)) {
      this.ondaStats.destruidas += 1;
      this.removeTower(torre);
      if (this.selectedTower === torre) this.selectedTower = null;
      if (this.menuTower === torre) this.menuTower = null;
      if (this.fusePending && (this.fusePending.tower === torre ||
          this.fusePending.partners.indexOf(torre) !== -1)) this.fusePending = null;

      this.notifyCell('Torre destruída', torre.c, torre.r, '#f87171');
      this.effects.push({ x: torre.x, y: torre.y, radius: CONFIG.tile * 0.7,
                          life: 0.5, max: 0.5, color: '#f87171', heavy: true });
      // Pedra e madeira de verdade voando: e o unico retorno que diz o que
      // acabou de acontecer com a celula, porque a torre some no mesmo quadro.
      this.effects.push({ x: torre.x, y: torre.y, radius: CONFIG.tile * 0.5,
                          life: 0.55, max: 0.55, color: '#cbd5e1', arte: 'detrito',
                          giro: Math.random() * 6.2832, escala: 1.15, espalha: 0.45 });
      this.effects.push({ kind: 'shards', x: torre.x, y: torre.y, radius: CONFIG.tile * 0.4,
                          life: 0.45, max: 0.45, color: '#94a3b8' });
      this.emit();
      return;
    }

    if (this.effects.length < 90 && Math.random() < 0.18) {
      // A lasca sai do lado do inimigo, nao do centro da torre: assim da para
      // ver QUEM esta batendo sem seguir a linha tracejada.
      const a = Math.atan2(inimigo.y - torre.y, inimigo.x - torre.x);
      this.effects.push({ kind: 'spark', x: torre.x, y: torre.y, angle: a,
                          life: 0.16, max: 0.16, color: '#cbd5e1', big: false });
      this.effects.push({ x: torre.x + Math.cos(a) * CONFIG.tile * 0.3,
                          y: torre.y + Math.sin(a) * CONFIG.tile * 0.3,
                          radius: CONFIG.tile * 0.18, life: 0.3, max: 0.3,
                          color: '#cbd5e1', arte: 'detrito',
                          giro: Math.random() * 6.2832, escala: 1.6, espalha: 0.7 });
    }
  }

  /* Reparo automatico no intervalo entre ondas. Serpentina curta se recupera
   * inteira; serpentina gigante nao -- o desgaste e o preco do comprimento. */
  repararTorres(fracao) {
    let mexeu = false;
    for (const t of this.towers) {
      if (!t.ferida) continue;
      t.reparar(fracao);
      mexeu = true;
    }
    if (mexeu) this.emit();
  }

  /* Torres feridas e o que custa para deixar todas inteiras. */
  feridas() { return this.towers.filter(t => t.ferida); }

  custoReparoTotal() {
    let n = 0;
    for (const t of this.feridas()) n += t.custoReparo;
    return n;
  }

  /* Reparo em massa.
   *
   * Existe porque o reparo de uma torre so era mecanica morta: numa partida
   * real medida, o jogador gastou 8.190 de ouro reconstruindo parede, 3.540
   * evoluindo e ZERO reparando -- com cinquenta torres no tabuleiro, achar a
   * ferida e abrir o menu dela no meio da onda nao acontece. E terminava
   * ondas com 3.288 de ouro parado enquanto perdia.
   *
   * Conserta da mais ferida para a menos ferida enquanto o ouro der: parcial
   * e melhor que tudo-ou-nada, porque a torre que esta quase caindo e a que
   * importa. */
  repararTudo() {
    const fila = this.feridas().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    if (fila.length === 0) return 0;

    let gasto = 0, n = 0;
    for (const t of fila) {
      const custo = t.custoReparo;
      if (custo > this.gold) break;
      this.gold -= custo;
      this.ondaStats.ouroReparo += custo;
      gasto += custo;
      t.hp = t.maxHp;
      n += 1;
    }
    if (n > 0) {
      this.notifyCell(n + (n === 1 ? ' torre reparada' : ' torres reparadas'),
                      this.grid.spawn.c + 3, this.grid.spawn.r, '#4ade80');
      this.emit();
    }
    return gasto;
  }

  /* Reparo manual, pago. O jogador escolhe entre consertar o tijolo da frente
   * e comprar dano novo -- que e a decisao que faltava. */
  repararSelecionada() {
    const t = this.menuTower || this.selectedTower;
    if (!t || !t.ferida) return false;
    const custo = t.custoReparo;
    if (this.gold < custo) { this.notifyCell('Ouro insuficiente', t.c, t.r, '#f87171'); return false; }
    this.gold -= custo;
    this.ondaStats.ouroReparo += custo;
    t.hp = t.maxHp;
    this.notifyCell('-' + custo, t.c, t.r, '#4ade80');
    this.emit();
    return true;
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

  /* Liga e desliga o medo em partida, para poder comparar sem trocar de
   * build. Recalcular na hora e obrigatorio: com o medo desligado os campos
   * de classe somem e todo mundo volta ao fluxo neutro no mesmo quadro. */
  toggleMedo() {
    CONFIG.medo = !CONFIG.medo;
    this.grid.computeFear();
    this.notifyCell(CONFIG.medo ? 'Medo ligado' : 'Medo desligado',
                    this.grid.spawn.c + 3, this.grid.spawn.r, '#38bdf8');
    this.emit();
    return CONFIG.medo;
  }

  /* Modo silencioso: a torre para de atirar, entao para de marcar perigo e
   * some do campo. E a emboscada -- ligada depois que os inimigos ja se
   * comprometeram com o corredor. */
  toggleMute(tower) {
    const t = tower || this.selectedTower;
    if (!t) return false;
    t.mudo = !t.mudo;
    if (!t.mudo) t.aquecer = CONFIG.aquecimento;
    this.notifyCell(t.mudo ? 'Silenciosa' : 'Ativa', t.c, t.r,
                    t.mudo ? '#94a3b8' : '#4ade80');
    this.emit();
    return t.mudo;
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
