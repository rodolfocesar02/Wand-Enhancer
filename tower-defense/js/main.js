'use strict';

/* Bootstrap: entrada, loop de animação e ligação entre os módulos. */

(function () {
  const canvas = document.getElementById('canvas');

  Meta.load();
  const game = new Game();

  Renderer.init(canvas);
  UI.init(game);

  /* O canvas é redimensionado por CSS, então convertemos do espaço da tela
   * para o espaço lógico do tabuleiro antes de descobrir a célula. */
  function cellFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (CONFIG.width / rect.width);
    const y = (ev.clientY - rect.top) * (CONFIG.height / rect.height);
    const c = Math.floor(x / CONFIG.tile);
    const r = Math.floor(y / CONFIG.tile);
    return game.grid.inBounds(c, r) ? { c: c, r: r } : null;
  }

  canvas.addEventListener('mousemove', ev => { game.hoverCell = cellFromEvent(ev); });
  canvas.addEventListener('mouseleave', () => { game.hoverCell = null; });

  canvas.addEventListener('click', ev => {
    const cell = cellFromEvent(ev);
    if (cell) game.clickCell(cell.c, cell.r);
  });

  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    game.clearSelection();
  });

  // Toque: um tap vale como hover + clique.
  canvas.addEventListener('touchstart', ev => {
    if (!ev.touches.length) return;
    ev.preventDefault();
    const cell = cellFromEvent(ev.touches[0]);
    if (cell) { game.hoverCell = cell; game.clickCell(cell.c, cell.r); }
  }, { passive: false });

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
