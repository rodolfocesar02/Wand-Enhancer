'use strict';

/* Ponte entre estado e DOM.
 *
 * Dois ritmos de propósito: sync() reconstrói DOM (caro, só quando o estado
 * muda) e tick() atualiza números (barato, todo quadro). Refazer innerHTML 60
 * vezes por segundo quebraria hover e desperdiçaria trabalho.
 *
 * As magias não aparecem aqui: elas são desenhadas dentro do canvas, para
 * ficarem a um toque de distância durante a onda. */

const UI = {
  init(game) {
    this.game = game;
    this.selectedMap = 'planicie';

    this.el = {
      screenMenu: document.getElementById('screen-menu'),
      screenGame: document.getElementById('screen-game'),
      metaXp: document.getElementById('meta-xp'),
      metaStats: document.getElementById('meta-stats'),
      mapList: document.getElementById('map-list'),
      metaList: document.getElementById('meta-list'),
      start: document.getElementById('btn-start'),
      wipe: document.getElementById('btn-wipe'),

      board: document.getElementById('board'),
      canvas: document.getElementById('canvas'),
      gold: document.getElementById('stat-gold'),
      lives: document.getElementById('stat-lives'),
      wave: document.getElementById('stat-wave'),
      score: document.getElementById('stat-score'),
      shop: document.getElementById('shop-list'),

      menu: document.getElementById('tower-menu'),
      tmMute: document.getElementById('tm-mute'),
      tmRepair: document.getElementById('tm-repair'),
      reportBox: document.getElementById('report-box'),
      reportTable: document.getElementById('report-table'),
      reportText: document.getElementById('report-text'),
      reportCopy: document.getElementById('report-copy'),
      medo: document.getElementById('btn-medo'),
      lastReport: document.getElementById('last-report-block'),
      lastReportHint: document.getElementById('last-report-hint'),
      lastReportText: document.getElementById('last-report-text'),
      lastReportCopy: document.getElementById('last-report-copy'),
      repairAll: document.getElementById('btn-repair-all'),
      tmName: document.getElementById('tm-name'),
      tmClose: document.getElementById('tm-close'),
      tmSplit: document.getElementById('tm-split'),
      tmStats: document.getElementById('tm-stats'),
      tmTraco: document.getElementById('tm-traco'),
      tmBranches: document.getElementById('tm-branches'),
      tmFusion: document.getElementById('tm-fusion'),
      tmSell: document.getElementById('tm-sell'),

      waveBtn: document.getElementById('btn-wave'),
      pause: document.getElementById('btn-pause'),
      speed: document.getElementById('btn-speed'),
      quit: document.getElementById('btn-quit'),
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
    this.armTwice(this.el.wipe, 'Apagar progresso', 'Apagar mesmo? Clique de novo', () => {
      Meta.reset();
      this.sync();
    });

    this.el.waveBtn.addEventListener('click', () => g.callWave(true));
    this.el.pause.addEventListener('click', () => g.togglePause());
    this.el.speed.addEventListener('click', () => g.cycleSpeed());
    this.el.tmSell.addEventListener('click', () => g.sellSelected());
    this.el.tmMute.addEventListener('click', () => g.toggleMute(g.menuTower));
    this.el.tmRepair.addEventListener('click', () => g.repararSelecionada());
    this.el.medo.addEventListener('click', () => g.toggleMedo());
    this.el.repairAll.addEventListener('click', () => g.repararTudo());
    this.el.tmClose.addEventListener('click', () => g.closeMenu());
    this.armTwice(this.el.quit, 'Abandonar', 'Abandonar mesmo? Clique de novo', () => g.endRun(false));
    this.el.overlayBtn.addEventListener('click', () => g.toMenu());

    this.el.lastReportCopy.addEventListener('click',
      () => this.copiar(this.el.lastReportText, this.el.lastReportCopy));
    this.el.reportCopy.addEventListener('click',
      () => this.copiar(this.el.reportText, this.el.reportCopy));

    window.addEventListener('resize', () => { if (g.menuTower) this.placeMenu(g.menuTower); });
  },

  /* Copiar dentro de um iframe pode ser bloqueado, então a área de texto é a
   * via garantida e a API do navegador é só o atalho. Usado pelos dois
   * relatórios: o do fim de partida e o guardado no menu. */
  copiar(campo, botao) {
    campo.select();
    campo.setSelectionRange(0, campo.value.length);
    const rotulo = botao.textContent;
    const pronto = () => {
      botao.textContent = 'Copiado';
      setTimeout(() => { botao.textContent = rotulo; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(campo.value).then(pronto, () => {});
    } else { try { document.execCommand('copy'); pronto(); } catch (e) { /* ignora */ } }
  },

  /* Confirmação em dois cliques em vez de confirm(): o diálogo nativo do
   * navegador pode estar bloqueado quando a página roda dentro de um iframe,
   * e aí o botão ficaria silenciosamente inerte. */
  armTwice(btn, idleLabel, confirmLabel, action) {
    let armed = false;
    let timer = null;
    const disarm = () => { armed = false; btn.textContent = idleLabel; btn.classList.remove('arming'); };

    btn.textContent = idleLabel;
    btn.addEventListener('click', () => {
      if (armed) { clearTimeout(timer); disarm(); action(); return; }
      armed = true;
      btn.textContent = confirmLabel;
      btn.classList.add('arming');
      timer = setTimeout(disarm, 4000);
    });
  },

  /* ============================== sync ============================== */

  sync() {
    const g = this.game;
    const menu = g.screen === 'menu';

    this.el.screenMenu.hidden = !menu;
    this.el.screenGame.hidden = menu;
    if (menu) { this.syncMenu(); return; }

    this.syncShop();
    this.syncTowerMenu();
    this.syncOverlay();
    this.tick();
  },

  /* ------------------------------- menu ---------------------------- */

  syncMenu() {
    const st = Meta.state;
    const bonus = Meta.bonuses();

    // Relatório da última expedição: sobrevive ao fechamento da aba.
    const ultimo = ultimoRelatorio();
    this.el.lastReport.hidden = !ultimo;
    if (ultimo) {
      const dia = new Date(ultimo.quando);
      this.el.lastReportHint.textContent =
        (ultimo.venceu ? 'Venceu' : 'Caiu na onda ' + ultimo.onda) +
        ' em ' + ultimo.mapa + ', com ' + ultimo.vidas + ' vidas — ' +
        dia.toLocaleDateString() + ' ' + dia.toLocaleTimeString().slice(0, 5);
      this.el.lastReportText.value = ultimo.texto;
    }

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

    for (let i = 0; i < g.unlockedTowers.length; i++) {
      const key = g.unlockedTowers[i];
      const def = TOWER_TYPES[key];
      const btn = document.createElement('button');
      btn.className = 'shop-chip';
      btn.title = def.blurb;
      // O quadradinho de cor dizia "esta torre e verde", nao "esta torre e
      // uma arqueira". Com seis torres desbloqueadas o jogador escolhia por
      // posicao decorada, nao por reconhecimento. A cor continua na borda.
      const arte = IconSheet.url('torre', key);
      btn.innerHTML =
        (arte ? '<span class="swatch art" style="background-image:url(' + arte +
                ');border-color:' + def.color + '"></span>'
              : '<span class="swatch" style="background:' + def.color + '"></span>') +
        '<span class="chip-name">' + def.name + '</span>' +
        '<span class="price">' + def.cost + '</span>' +
        '<span class="chip-key">' + (i + 1) + '</span>';
      btn.addEventListener('click', () => g.selectType(key));
      this.el.shop.appendChild(btn);
      this.shopButtons[key] = btn;
    }
  },

  /* O menu de ações abre por toque longo sobre a torre e flutua ao lado
   * dela, em vez de morar numa barra lateral que exigia rolagem. */
  syncTowerMenu() {
    const g = this.game;
    const t = g.menuTower;
    const e = this.el;

    if (!t || g.towers.indexOf(t) === -1) { e.menu.hidden = true; return; }
    e.menu.hidden = false;

    const s = t.stats;
    const total = s.dmg.fisico + s.dmg.magico;

    e.tmName.textContent = t.label;
    e.tmSplit.innerHTML = total > 0
      ? '<i class="f" style="width:' + (s.dmg.fisico / total * 100) + '%"></i>' +
        '<i class="m" style="width:' + (s.dmg.magico / total * 100) + '%"></i>'
      : '';

    const rows = [];
    if (s.dmg.fisico > 0) rows.push(['Dano físico', Math.round(s.dmg.fisico)]);
    if (s.dmg.magico > 0) rows.push(['Dano mágico', Math.round(s.dmg.magico)]);
    rows.push(['Cadência', (1 / s.cooldown).toFixed(2) + '/s']);
    rows.push(['Alcance', Math.round(s.range)]);
    rows.push(['Vida', Math.round(t.hp) + ' / ' + t.maxHp]);
    rows.push(['DPS', Math.round(Damage.dps(s))]);
    if (s.splash) rows.push(['Área', Math.round(s.splash)]);
    if (s.slow) rows.push(['Lentidão', Math.round(s.slow * 100) + '%']);
    if (s.pierce) rows.push(['Perfuração', s.pierce]);
    e.tmStats.innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');

    /* Traco da fusao. Fica FORA da lista de numeros de proposito: ele nao e
     * um valor a comparar, e uma regra que essa torre tem e as outras nao --
     * e o jogador precisa ler a regra, nao procurar a diferenca. */
    const tr = t.def.traco ? TRACOS[t.def.traco] : null;
    e.tmTraco.hidden = !tr;
    if (tr) {
      // A borda esquerda leva a cor do traco: no menu inteiro, e a unica
      // faixa colorida, entao ela vira o marcador que diz "esta torre tem
      // uma regra propria" antes mesmo de o texto ser lido.
      e.tmTraco.style.borderLeftColor = tr.cor;
      e.tmTraco.innerHTML = '<strong style="color:' + tr.cor + '">' + tr.nome +
                            '</strong><small>' + tr.desc + '</small>';
    }

    e.tmBranches.innerHTML = '';
    for (const branch of t.nextBranches) {
      const btn = document.createElement('button');
      btn.className = 'branch';
      btn.innerHTML =
        '<strong>' + branch.name + '</strong>' +
        '<span class="price">' + branch.cost + '</span>' +
        '<small>' + branch.desc + '</small>';
      btn.disabled = g.gold < branch.cost;
      btn.addEventListener('click', () => g.upgradeSelected(branch.key));
      e.tmBranches.appendChild(btn);
    }

    this.syncFusion(t);
    e.tmRepair.hidden = !t.ferida;
    if (t.ferida) {
      e.tmRepair.textContent = 'Reparar (' + t.custoReparo + ')';
      e.tmRepair.disabled = g.gold < t.custoReparo;
      e.tmRepair.className = 'primary';
    }
    e.tmMute.textContent = t.mudo ? 'Voltar a atirar' : 'Silenciar (emboscada)';
    e.tmMute.className = t.mudo ? 'primary' : '';
    e.tmMute.title = t.mudo
      ? 'Silenciosa: não atira e não aparece no campo de medo. Volta a atirar após ' +
        CONFIG.aquecimento + 's de aquecimento.'
      : 'Para de atirar. Sem tiro não há dano, sem dano não há perigo — a rota passa por cima dela sem desconfiar.';
    e.tmSell.textContent = 'Vender (+' + t.sellValue + ')';
    this.placeMenu(t);
  },

  /* O menu flutua ao lado da torre e é preso dentro do tabuleiro, para não
   * vazar da tela nem cobrir a torre que ele descreve. */
  placeMenu(t) {
    const e = this.el;

    // Em tela estreita o menu é uma gaveta presa embaixo pelo CSS. Posicionar
    // por inline style aqui brigaria com isso, então limpamos e saímos.
    if (window.matchMedia('(max-width: 760px)').matches) {
      e.menu.style.left = '';
      e.menu.style.top = '';
      return;
    }

    const cr = e.canvas.getBoundingClientRect();
    const br = e.board.getBoundingClientRect();
    if (!cr.width) return;

    const scale = cr.width / CONFIG.width;
    const offX = cr.left - br.left;
    const offY = cr.top - br.top;
    const w = e.menu.offsetWidth;
    const h = e.menu.offsetHeight;
    const gap = 10;

    let x = offX + (t.c + 1) * CONFIG.tile * scale + gap;
    if (x + w > offX + cr.width) x = offX + t.c * CONFIG.tile * scale - w - gap;
    x = Math.max(offX + 4, Math.min(x, offX + cr.width - w - 4));

    let y = offY + (t.r + 0.5) * CONFIG.tile * scale - h / 2;
    y = Math.max(offY + 4, Math.min(y, offY + cr.height - h - 4));

    e.menu.style.left = Math.round(x) + 'px';
    e.menu.style.top = Math.round(y) + 'px';
  },

  /* Painel de fusão.
   *
   * A fusão aceita qualquer torre do tabuleiro, não só as vizinhas, então o
   * botão aqui escolhe a RECEITA e a parceira é escolhida no mapa, com o
   * tabuleiro escurecido e só as candidatas acesas. Listar parceiras por nome
   * num painel não resolveria: o jogador precisa ver ONDE elas estão, porque
   * a célula liberada muda o labirinto. */
  syncFusion(t) {
    const g = this.game;
    const e = this.el.tmFusion;
    e.innerHTML = '';

    if (!g.fusionEnabled || t.fused) return;

    const receitas = g.fusionRecipes(t);
    for (const r of receitas) {
      const n = r.partners.length;
      const btn = document.createElement('button');
      btn.className = 'branch fuse-ready';
      btn.innerHTML =
        '<strong>Fundir → ' + r.def.name + '</strong>' +
        '<span class="price">' + n + '</span>' +
        '<small>' + r.def.blurb + ' &middot; ' +
        (n === 1 ? 'há 1 torre compatível' : 'há ' + n + ' torres compatíveis') + '</small>';
      btn.addEventListener('click', () => g.fuseArm(r.key));
      e.appendChild(btn);
    }

    const linhas = [];
    if (!t.maxLevel) {
      linhas.push('<span class="hintline warn">Esta torre precisa chegar ao nível 3.</span>');
    } else if (receitas.length === 0) {
      const combina = fusionsFor(t.typeKey)
        .map(f => '<b>' + TOWER_TYPES[f.partner].name + '</b> → ' + f.def.name)
        .join('<br>');
      linhas.push('<span class="hintline">Combina com (nível 3 nas duas, em qualquer ' +
                  'lugar do tabuleiro):<br>' + combina + '</span>');
    }

    // appendChild, nunca innerHTML += : concatenar innerHTML re-serializa e
    // recria todo o subárvore, o que descarta os listeners dos botões acima.
    if (linhas.length) {
      const box = document.createElement('div');
      box.innerHTML = linhas.join('');
      while (box.firstChild) e.appendChild(box.firstChild);
    }
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
    this.syncReport();
  },

  /* Tabela do relatório. Vermelho onde vazou ou caiu torre, verde na onda em
   * que o labirinto deu um salto -- que é o instante que interessa comparar
   * entre partidas. */
  syncReport() {
    const g = this.game;
    const e = this.el;

    e.reportBox.hidden = g.registro.length === 0;
    if (e.reportBox.hidden) return;

    const cols = [['onda','Onda'],['rota','Rota'],['folga','Folga'],['torres','Torres'],
                  ['obras','Obra'],['construidas','+T'],['destruidas','−T'],
                  ['vazou','Vazou'],['vidas','Vidas'],['ouro','Ouro'],
                  ['gastoTorres','$torre'],['gastoEvolucao','$evo'],['gastoReparo','$rep']];

    let html = '<table><thead><tr>' +
      cols.map(c => '<th>' + c[1] + '</th>').join('') + '</tr></thead><tbody>';

    let rotaAnterior = 0;
    for (const r of g.registro) {
      const salto = r.rota - rotaAnterior >= 4;
      rotaAnterior = r.rota;
      html += '<tr>' + cols.map(c => {
        const k = c[0];
        let v = r[k];
        if (k === 'folga') v = v.toFixed(2);
        let cls = '';
        if ((k === 'vazou' || k === 'destruidas') && r[k] > 0) cls = ' class="alerta"';
        if (k === 'rota' && salto) cls = ' class="marco"';
        return '<td' + cls + '>' + v + '</td>';
      }).join('') + '</tr>';
    }
    e.reportTable.innerHTML = html + '</tbody></table>';
    e.reportText.value = g.relatorio();
  },

  /* ============================== tick ============================== */

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

    const playing = g.screen === 'playing';
    const finished = g.wave >= CONFIG.wavesPerRun;
    e.waveBtn.disabled = !playing || g.waveInProgress || finished;
    e.waveBtn.textContent = g.waveInProgress
      ? 'Onda ' + g.wave + ' em curso'
      : finished ? 'Última onda' : 'Chamar onda ' + (g.wave + 1);

    e.pause.textContent = g.paused ? 'Retomar' : 'Pausar';
    e.pause.disabled = !playing;
    e.speed.textContent = g.speed + 'x';
    e.medo.textContent = 'Medo: ' + (CONFIG.medo ? 'on' : 'off');
    e.medo.classList.toggle('selected', !!CONFIG.medo);

    const feridas = g.feridas().length;
    const custo = feridas ? g.custoReparoTotal() : 0;
    e.repairAll.textContent = feridas ? 'Reparar ' + feridas + ' (' + custo + ')' : 'Reparar';
    e.repairAll.disabled = !playing || feridas === 0 || g.gold < g.feridas()
      .reduce((m, t) => Math.min(m, t.custoReparo), Infinity);
    e.repairAll.classList.toggle('urgente', feridas > 0 && !e.repairAll.disabled);

    this.tickHint();
  },

  tickHint() {
    const g = this.game;
    let text;

    if (g.paused) {
      text = 'Jogo pausado.';
    } else if (g.fusePending) {
      text = 'Toque na torre destacada para fundir em ' + g.fusePending.def.name +
             '. Esc cancela.';
    } else if (g.spellbook.pending) {
      text = 'Toque no mapa para lançar ' + SPELLS[g.spellbook.pending].name + '.';
    } else if (g.screen === 'playing' && g.towers.some(t => !t.pronta && !t.destruida)) {
      /* Andaime nao atira, e isso custou um quarto das vidas de um jogador
       * na onda 1: ele pos as torres na entrada, chamou a onda e viu tudo
       * passar por cima de tres construcoes. O andaime ja aparece no
       * tabuleiro, mas so diz "tem algo aqui" -- nao diz que aquilo nao
       * defende. A linha diz. */
      const n = g.towers.filter(t => !t.pronta && !t.destruida).length;
      text = n === 1 ? 'Torre em obra — ela não atira até terminar.'
                     : n + ' torres em obra — elas não atiram até terminar.';

    } else if (g.screen === 'playing' && !g.waveInProgress && g.restTimer > 0) {
      const next = Waves.preview(g.wave + 1);
      // A estreia vem antes dos afixos: e a unica informacao da linha que o
      // jogador nunca viu antes, e ele tem o intervalo para reagir a ela.
      text = 'Onda ' + (g.wave + 1) + ' em ' + Math.ceil(g.restTimer) + 's' +
             (next.boss ? ' — CHEFE' : '') +
             (next.estreia.length ? ' — estreia: ' + next.estreia.join(', ') : '') +
             (next.affixes.length ? ' — ' + next.affixes.join(', ') : '');
    } else {
      text = 'Segure uma torre para evoluir. Amarelo = dano físico, roxo = dano mágico.';
    }
    this.el.hint.textContent = text;
  }
};
