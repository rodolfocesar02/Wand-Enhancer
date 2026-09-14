'use strict';

/* Bootstrap: entrada, loop de animação e ligação entre os módulos. */

(function () {
  const canvas = document.getElementById('canvas');

  Meta.load();
  SpriteSheet.load();
  MobSheet.load();
  Terrain.load();
  const game = new Game();

  Renderer.init(canvas);
  UI.init(game);

  /* O canvas é redimensionado por CSS, então convertemos do espaço da tela
   * para o espaço lógico antes de descobrir onde o dedo caiu. */
  function pointOf(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (CONFIG.width / rect.width),
      y: (ev.clientY - rect.top) * (CONFIG.height / rect.height)
    };
  }

  /* Célula do tabuleiro, ou null se o ponto caiu na faixa de magias. */
  function cellOf(pt) {
    if (pt.y >= CONFIG.boardH) return null;
    const c = Math.floor(pt.x / CONFIG.tile);
    const r = Math.floor(pt.y / CONFIG.tile);
    return game.grid.inBounds(c, r) ? { c: c, r: r } : null;
  }

  /* Toque longo numa torre abre o menu de ações; toque curto só seleciona.
   * O mesmo gesto serve para mouse e para dedo, então não há dois caminhos
   * de código para manter em sincronia. */
  const HOLD_MS = 340;
  const HOLD_TOLERANCE = 12;
  let press = null;

  function cancelHold() {
    if (press && press.timer) clearTimeout(press.timer);
    press = null;
  }

  canvas.addEventListener('pointerdown', ev => {
    canvas.setPointerCapture(ev.pointerId);
    const pt = pointOf(ev);

    // Faixa de magias: responde no toque, sem esperar o levantar.
    const spell = game.hitStrip(pt.x, pt.y);
    if (spell) {
      game.triggerSpell(spell);
      press = null;
      return;
    }

    const cell = cellOf(pt);
    game.hoverCell = cell;
    press = { cell: cell, x: ev.clientX, y: ev.clientY, fired: false, timer: null };

    if (cell && game.towerAt.has(game.key(cell.c, cell.r))) {
      press.timer = setTimeout(() => {
        if (!press) return;
        press.fired = true;
        game.openMenu(cell.c, cell.r);
      }, HOLD_MS);
    }
  });

  canvas.addEventListener('pointermove', ev => {
    game.hoverCell = cellOf(pointOf(ev));
    if (!press) return;
    if (Math.abs(ev.clientX - press.x) > HOLD_TOLERANCE ||
        Math.abs(ev.clientY - press.y) > HOLD_TOLERANCE) {
      cancelHold();
    }
  });

  canvas.addEventListener('pointerup', ev => {
    if (!press) return;
    const fired = press.fired;
    const cell = press.cell;
    cancelHold();
    if (fired || !cell) return;   // o menu já abriu: o levantar não faz mais nada
    game.clickCell(cell.c, cell.r);
    void ev;
  });

  canvas.addEventListener('pointercancel', cancelHold);
  canvas.addEventListener('pointerleave', () => { game.hoverCell = null; cancelHold(); });

  // No desktop o botão direito abre o mesmo menu, sem precisar segurar.
  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    const cell = cellOf(pointOf(ev));
    if (cell && game.towerAt.has(game.key(cell.c, cell.r))) game.openMenu(cell.c, cell.r);
    else game.clearSelection();
  });

  window.addEventListener('keydown', ev => {
    if (game.screen === 'menu') return;
    if (ev.target instanceof HTMLInputElement) return;

    const n = parseInt(ev.key, 10);
    if (n >= 1 && n <= game.unlockedTowers.length) {
      game.selectType(game.unlockedTowers[n - 1]);
      return;
    }

    const upper = ev.key.toUpperCase();
    for (const slot of game.spellbook.slots) {
      if (slot.def.hotkey === upper) { game.triggerSpell(slot.key); return; }
    }

    switch (ev.key.toLowerCase()) {
      case 'n': game.callWave(true); break;
      case 'escape': game.clearSelection(); break;
      case ' ': ev.preventDefault(); game.togglePause(); break;
      default: break;
    }
  });

  let last = performance.now();

  function frame(now) {
    // Trava o passo em 50ms para que uma aba em segundo plano não teleporte
    // inimigos quando o navegador volta a desenhar.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    for (let i = 0; i < game.speed; i++) game.update(dt);

    if (game.screen !== 'menu') {
      Renderer.draw(game);
      UI.tick();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
