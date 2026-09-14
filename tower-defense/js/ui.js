'use strict';

/* Ponte entre estado e DOM.
 *
 * Dois ritmos de propósito: sync() reconstrói DOM (caro, só quando o estado
 * muda) e tick() atualiza números e recargas (barato, todo quadro). Refazer
 * innerHTML 60 vezes por segundo quebraria hover e desperdiçaria trabalho. */

const UI = {
  init(game) {
    this.game = game;
    this.selectedMap = 'planicie';
    this.cache = {};

    this.el = {
      screenMenu: document.getElementById('screen-menu'),
      screenGame: document.getElementById('screen-game'),
      metaXp: document.getElementById('meta-xp'),
      metaStats: document.getElementById('meta-stats'),
      mapList: document.getElementById('map-list'),
      metaList: document.getElementById('meta-list'),
      start: document.getElementById('btn-start'),
      wipe: document.getElementById('btn-wipe'),

      gold: document.getElementById('stat-gold'),
      lives: document.getElementById('stat-lives'),
      wave: document.getElementById('stat-wave'),
      score: document.getElementById('stat-score'),
      shop: document.getElementById('shop-list'),
      spellbar: document.getElementById('spellbar'),
      inspector: document.getElementById('inspector'),
      inspName: document.getElementById('insp-name'),
      inspSplit: document.getElementById('insp-split'),
      inspStats: document.getElementById('insp-stats'),
      inspBranches: document.getElementById('insp-branches'),
      inspFusion: document.getElementById('insp-fusion'),
      sell: document.getElementById('btn-sell'),
      wavePreview: document.getElementById('wave-preview'),
      waveBtn: document.getElementById('btn-wave'),
      pause: document.getElementById('btn-pause'),
      speed: document.getElementById('btn-speed'),
      quit: document.getElementById('btn-quit'),
      legend: document.getElementById('legend-list'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlayText: document.getElementById('overlay-text'),
      overlayXp: document.getElementById('overlay-xp'),
      overlayBtn: document.getElementById('overlay-btn'),
      hint: document.getElementById('hint')
    };

    this.bind();
    game.onChange(() => this.sync());
    this.sync();
  },

  bind() {
    const g = this.game;
    this.el.start.addEventListener('click', () => g.startRun(this.selectedMap));
    this.el.wipe.addEventListener('click', () => {
      if (confirm('Apagar todo o progresso permanente? Não dá para desfazer.')) {
        Meta.reset();
        this.sync();
      }
    });

    this.el.waveBtn.addEventListener('click', () => g.callWave(true));
    this.el.pause.addEventListener('click', () => g.togglePause());
    this.el.speed.addEventListener('click', () => g.cycleSpeed());
    this.el.sell.addEventListener('click', () => g.sellSelected());
    this.el.quit.addEventListener('click', () => {
      if (confirm('Abandonar a expedição? O XP acumulado até agora é mantido.')) g.endRun(false);
    });
    this.el.overlayBtn.addEventListener('click', () => g.toMenu());
  },

  /* ============================== sync ============================== */

  sync() {
    const g = this.game;
    const menu = g.screen === 'menu';

    this.el.screenMenu.hidden = !menu;
    this.el.screenGame.hidden = menu;

    if (menu) { this.syncMenu(); return; }

    this.syncShop();
    this.syncSpellbar();
    this.syncInspector();
    this.syncLegend();
    this.syncOverlay();
    this.tick();
  },

  /* ------------------------------- menu ---------------------------- */

  syncMenu() {
    const st = Meta.state;
    const bonus = Meta.bonuses();

    this.el.metaXp.textContent = st.xp;
    this.el.metaStats.innerHTML =
      '<div>Expedições: <b>' + st.runs + '</b></div>' +
      '<div>Concluídas: <b>' + st.wins + '</b></div>' +
      '<div>Melhor onda: <b>' + st.bestWave + '</b></div>' +
      '<div>Torres liberadas: <b>' + bonus.towers.length + '/' + Object.keys(TOWER_TYPES).length + '</b></div>' +
      '<div>Magias liberadas: <b>' + bonus.spells.length + '/' + Object.keys(SPELLS).length + '</b></div>';

    if (bonus.maps.indexOf(this.selectedMap) === -1) this.selectedMap = bonus.maps[0];

    this.el.mapList.innerHTML = '';
    for (const map of MAPS) {
      const unlocked = bonus.maps.indexOf(map.id) !== -1;
      const btn = document.createElement('button');
      btn.className = 'map-card' + (this.selectedMap === map.id ? ' selected' : '');
      btn.disabled = !unlocked;
      btn.innerHTML = '<strong>' + map.name + '</strong><small>' +
        (unlocked ? map.desc : 'Bloqueado — compre em Reino.') + '</small>';
      btn.addEventListener('click', () => { this.selectedMap = map.id; this.syncMenu(); });
      this.el.mapList.appendChild(btn);
    }

    this.el.metaList.innerHTML = '';
    let group = null;
    for (const def of META_UPGRADES) {
      if (def.group !== group) {
        group = def.group;
        const h = document.createElement('h3');
        h.className = 'meta-group';
        h.textContent = group;
        this.el.metaList.appendChild(h);
      }

      const lvl = Meta.levelOf(def.id);
      const max = Meta.maxLevel(def);
      const cost = Meta.costOf(def);
      const owned = cost === null;

      const btn = document.createElement('button');
      btn.className = 'meta-card' + (owned ? ' owned' : '');
      btn.disabled = owned || !Meta.canBuy(def);
      btn.innerHTML =
        '<strong>' + def.name + (max > 1 ? ' <span class="meta-lvl">' + lvl + '/' + max + '</span>' : '') + '</strong>' +
        '<span class="meta-cost">' + (owned ? '✓' : cost + ' XP') + '</span>' +
        '<small>' + def.desc + '</small>';
      btn.addEventListener('click', () => { if (Meta.buy(def.id)) this.syncMenu(); });
      this.el.metaList.appendChild(btn);
    }
  },

  /* ------------------------------ partida -------------------------- */

  syncShop() {
    const g = this.game;
    this.shopButtons = {};
    this.el.shop.innerHTML = '';

    for (const key of g.unlockedTowers) {
      const def = TOWER_TYPES[key];
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      btn.innerHTML =
        '<span class="swatch" style="background:' + def.color + '"></span>' +
        '<span><strong>' + def.name + '</strong><small>' + def.blurb + '</small></span>' +
        '<span class="price">' + def.cost + '</span>';
      btn.addEventListener('click', () => g.selectType(key));
      this.el.shop.appendChild(btn);
      this.shopButtons[key] = btn;
    }
  },

  syncSpellbar() {
    const g = this.game;
    this.spellButtons = {};
    this.el.spellbar.innerHTML = '';

    for (const slot of g.spellbook.slots) {
      const btn = document.createElement('button');
      btn.className = 'spell';
      btn.innerHTML =
        '<span class="hot" style="background:' + slot.def.color + '">' + slot.def.hotkey + '</span>' +
        '<strong>' + slot.def.name + '</strong>' +
        '<small class="cdtext">pronta</small>' +
        '<span class="cdfill"></span>';
      btn.title = slot.def.desc;
      btn.addEventListener('click', () => g.triggerSpell(slot.key));
      this.el.spellbar.appendChild(btn);
      this.spellButtons[slot.key] = btn;
    }
  },

  syncInspector() {
    const g = this.game;
    const t = g.selectedTower;
    const e = this.el;

    if (!t) { e.inspector.hidden = true; return; }
    e.inspector.hidden = false;

    const s = t.stats;
    const total = s.dmg.fisico + s.dmg.magico;

    e.inspName.textContent = t.label;
    e.inspSplit.innerHTML = total > 0
      ? '<i class="f" style="width:' + (s.dmg.fisico / total * 100) + '%"></i>' +
        '<i class="m" style="width:' + (s.dmg.magico / total * 100) + '%"></i>'
      : '';

    const rows = [];
    if (s.dmg.fisico > 0) rows.push(['Dano físico', Math.round(s.dmg.fisico)]);
    if (s.dmg.magico > 0) rows.push(['Dano mágico', Math.round(s.dmg.magico)]);
    rows.push(['Cadência', (1 / s.cooldown).toFixed(2) + '/s']);
    rows.push(['Alcance', Math.round(s.range)]);
    rows.push(['DPS', Math.round(Damage.dps(s))]);
    if (s.splash) rows.push(['Área', Math.round(s.splash)]);
    if (s.slow) rows.push(['Lentidão', Math.round(s.slow * 100) + '%']);
    if (s.pierce) rows.push(['Perfuração', s.pierce]);
    e.inspStats.innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');

    // Ramos de evolução: o jogador escolhe um dos dois, e a escolha é final.
    e.inspBranches.innerHTML = '';
    for (const branch of t.nextBranches) {
      const btn = document.createElement('button');
      btn.className = 'branch';
      btn.innerHTML =
        '<strong>' + branch.name + '</strong>' +
        '<span class="price">' + branch.cost + '</span>' +
        '<small>' + branch.desc + '</small>';
      btn.disabled = g.gold < branch.cost;
      btn.addEventListener('click', () => g.upgradeSelected(branch.key));
      e.inspBranches.appendChild(btn);
    }

    this.syncFusion(t);
    e.sell.textContent = 'Vender (+' + t.sellValue + ')';
  },

  syncFusion(t) {
    const g = this.game;
    const e = this.el.inspFusion;
    e.innerHTML = '';

    if (!g.fusionEnabled || t.fused) return;

    if (!t.maxLevel) {
      e.innerHTML = '<span class="hintline">Fusão exige nível 3 nas duas torres.</span>';
      return;
    }

    const options = g.fusionOptions(t);
    if (options.length === 0) {
      e.innerHTML = '<span class="hintline">Nenhuma vizinha nível 3 forma receita.</span>';
      return;
    }

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'branch' + (g.fuseArmed === t ? ' armed' : '');
      btn.innerHTML =
        '<strong>Fundir → ' + opt.def.name + '</strong>' +
        '<small>' + opt.def.blurb + ' &middot; libera a célula da outra torre</small>';
      btn.addEventListener('click', () => g.fuse(t, opt.other));
      e.appendChild(btn);
    }
  },

  syncLegend() {
    const g = this.game;
    const items = [];
    g.unlockedTowers.forEach((k, i) => {
      items.push('<kbd>' + (i + 1) + '</kbd> ' + TOWER_TYPES[k].name);
    });
    for (const slot of g.spellbook.slots) {
      items.push('<kbd>' + slot.def.hotkey + '</kbd> ' + slot.def.name);
    }
    items.push('<kbd>N</kbd> chamar onda', '<kbd>Espaço</kbd> pausar', '<kbd>Esc</kbd> cancelar');
    this.el.legend.innerHTML = items.map(i => '<li>' + i + '</li>').join('');
  },

  syncOverlay() {
    const g = this.game;
    const e = this.el;
    const over = g.screen === 'gameover' || g.screen === 'victory';

    e.overlay.hidden = !over;
    if (!over) return;

    const won = g.screen === 'victory';
    e.overlayTitle.textContent = won ? 'Expedição concluída' : 'Fim de jogo';
    e.overlayText.textContent = won
      ? 'Você segurou as ' + CONFIG.wavesPerRun + ' ondas com ' + g.lives + ' vidas restantes, ' +
        g.kills + ' abates e ' + g.score + ' pontos.'
      : 'Caiu na onda ' + g.wave + ' de ' + CONFIG.wavesPerRun + ', com ' + g.kills +
        ' abates e ' + g.score + ' pontos.';
    e.overlayXp.textContent = '+' + g.lastXp + ' XP';
  },

  /* ============================== tick ============================== */

  /* Só números e estados — nada de innerHTML estrutural aqui. */
  tick() {
    const g = this.game;
    if (g.screen === 'menu') return;
    const e = this.el;

    e.gold.textContent = Math.floor(g.gold);
    e.lives.textContent = g.lives;
    e.wave.textContent = g.wave + '/' + CONFIG.wavesPerRun;
    e.score.textContent = g.score;

    for (const key of Object.keys(this.shopButtons || {})) {
      const btn = this.shopButtons[key];
      btn.classList.toggle('selected', g.selectedType === key);
      btn.disabled = g.gold < TOWER_TYPES[key].cost || g.screen !== 'playing';
    }

    for (const slot of g.spellbook.slots) {
      const btn = this.spellButtons[slot.key];
      if (!btn) continue;
      const k = slot.maxCd > 0 ? slot.cd / slot.maxCd : 0;
      btn.classList.toggle('armed', g.spellbook.pending === slot.key);
      btn.disabled = g.screen !== 'playing';
      btn.querySelector('.cdfill').style.transform = 'scaleY(' + k.toFixed(3) + ')';
      btn.querySelector('.cdtext').textContent =
        slot.cd > 0 ? Math.ceil(slot.cd) + 's' : (slot.def.targeted ? 'clique no mapa' : 'pronta');
    }

    const playing = g.screen === 'playing';
    const finished = g.wave >= CONFIG.wavesPerRun;
    e.waveBtn.disabled = !playing || g.waveInProgress || finished;
    e.waveBtn.textContent = g.waveInProgress
      ? 'Onda ' + g.wave + ' em curso'
      : finished ? 'Última onda' : 'Chamar onda ' + (g.wave + 1);

    e.pause.textContent = g.paused ? 'Retomar' : 'Pausar';
    e.pause.disabled = !playing;
    e.speed.textContent = g.speed + 'x';

    this.tickPreview();
    this.tickHint();
  },

  tickPreview() {
    const g = this.game;
    const next = g.waveInProgress ? g.wave : g.wave + 1;
    if (next > CONFIG.wavesPerRun) { this.el.wavePreview.innerHTML = ''; return; }

    const p = Waves.preview(next);
    let html = '<b>Onda ' + next + '</b> &middot; monstros nível ' + p.level;
    if (p.boss) html += ' <span class="tag boss">CHEFE</span>';
    html += '<br>' + (p.affixes.length
      ? p.affixes.map(a => '<span class="tag">' + a + '</span>').join('')
      : '<span class="tag">sem afixos</span>');
    this.el.wavePreview.innerHTML = html;
  },

  tickHint() {
    const g = this.game;
    let text;

    if (g.paused) text = 'Jogo pausado.';
    else if (g.spellbook.pending) text = 'Clique no mapa para lançar ' + SPELLS[g.spellbook.pending].name + '.';
    else if (g.screen === 'playing' && !g.waveInProgress && g.restTimer > 0)
      text = 'Próxima onda em ' + Math.ceil(g.restTimer) + 's — chamar antes rende ouro extra.';
    else text = 'Construa para alongar o caminho. Amarelo = dano físico, roxo = dano mágico.';

    this.el.hint.textContent = text;
  }
};
