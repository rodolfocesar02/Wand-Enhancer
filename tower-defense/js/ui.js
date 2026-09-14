'use strict';

/* Ponte entre o estado do jogo e o DOM. */

const UI = {
  init(game) {
    this.game = game;
    this.el = {
      gold: document.getElementById('stat-gold'),
      lives: document.getElementById('stat-lives'),
      wave: document.getElementById('stat-wave'),
      score: document.getElementById('stat-score'),
      shop: document.getElementById('shop-list'),
      inspector: document.getElementById('inspector'),
      inspName: document.getElementById('insp-name'),
      inspStats: document.getElementById('insp-stats'),
      upgrade: document.getElementById('btn-upgrade'),
      sell: document.getElementById('btn-sell'),
      wave_btn: document.getElementById('btn-wave'),
      pause: document.getElementById('btn-pause'),
      speed: document.getElementById('btn-speed'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlayText: document.getElementById('overlay-text'),
      overlayBtn: document.getElementById('overlay-btn'),
      hint: document.getElementById('hint')
    };

    this.buildShop();
    this.bind();
    game.onChange(() => this.render());
    this.render();
  },

  buildShop() {
    this.shopButtons = {};
    this.el.shop.innerHTML = '';

    for (const key of Object.keys(TOWER_TYPES)) {
      const def = TOWER_TYPES[key];
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      btn.innerHTML =
        '<span class="swatch" style="background:' + def.color + '"></span>' +
        '<span><strong>' + def.name + '</strong><small>' + def.blurb + '</small></span>' +
        '<span class="price">' + def.cost + '</span>';
      btn.addEventListener('click', () => this.game.selectType(key));
      this.el.shop.appendChild(btn);
      this.shopButtons[key] = btn;
    }
  },

  bind() {
    const g = this.game;
    this.el.wave_btn.addEventListener('click', () => g.callWave(true));
    this.el.pause.addEventListener('click', () => g.togglePause());
    this.el.speed.addEventListener('click', () => g.cycleSpeed());
    this.el.upgrade.addEventListener('click', () => g.upgradeSelected());
    this.el.sell.addEventListener('click', () => g.sellSelected());

    this.el.overlayBtn.addEventListener('click', () => {
      if (g.state === 'gameover') {
        g.reset();
        this.buildShop();
      }
      g.start();
    });
  },

  render() {
    const g = this.game;
    const e = this.el;

    e.gold.textContent = g.gold;
    e.lives.textContent = g.lives;
    e.wave.textContent = g.wave;
    e.score.textContent = g.score;

    for (const key of Object.keys(this.shopButtons)) {
      const btn = this.shopButtons[key];
      btn.classList.toggle('selected', g.selectedType === key);
      btn.disabled = g.gold < TOWER_TYPES[key].cost || g.state !== 'running';
    }

    this.renderInspector();

    e.wave_btn.disabled = g.state !== 'running' || g.waveInProgress;
    e.wave_btn.textContent = g.waveInProgress
      ? 'Onda ' + g.wave + ' em curso'
      : 'Chamar onda ' + (g.wave + 1);

    e.pause.textContent = g.paused ? 'Retomar' : 'Pausar';
    e.pause.disabled = g.state !== 'running';
    e.speed.textContent = g.speed + 'x';

    e.overlay.hidden = g.state === 'running';
    if (g.state === 'gameover') {
      e.overlayTitle.textContent = 'Fim de jogo';
      e.overlayText.textContent =
        'Você resistiu até a onda ' + g.wave + ' com ' + g.score + ' pontos.';
      e.overlayBtn.textContent = 'Jogar de novo';
    }

    e.hint.textContent = g.paused
      ? 'Jogo pausado.'
      : g.state === 'running' && !g.waveInProgress && g.restTimer > 0
        ? 'Próxima onda em ' + Math.ceil(g.restTimer) + 's - chame antes e ganhe ouro extra.'
        : 'Chamar a onda mais cedo rende ouro extra.';
  },

  renderInspector() {
    const g = this.game;
    const t = g.selectedTower;
    const e = this.el;

    if (!t) { e.inspector.hidden = true; return; }

    e.inspector.hidden = false;
    e.inspName.textContent = t.def.name + ' — nível ' + (t.level + 1);

    const s = t.stats;
    const rows = [
      ['Dano', s.damage],
      ['Cadência', (1 / s.cooldown).toFixed(2) + '/s'],
      ['Alcance', Math.round(s.range)],
      ['DPS', Math.round(s.damage / s.cooldown)]
    ];
    if (s.splash) rows.push(['Área', Math.round(s.splash)]);
    if (s.slow) rows.push(['Lentidão', Math.round(s.slow * 100) + '%']);

    e.inspStats.innerHTML = rows
      .map(row => '<dt>' + row[0] + '</dt><dd>' + row[1] + '</dd>')
      .join('');

    if (t.maxLevel) {
      e.upgrade.textContent = 'Nível máximo';
      e.upgrade.disabled = true;
    } else {
      e.upgrade.textContent = 'Melhorar (' + t.upgradeCost + ')';
      e.upgrade.disabled = g.gold < t.upgradeCost;
    }
    e.sell.textContent = 'Vender (+' + t.sellValue + ')';
  }
};
