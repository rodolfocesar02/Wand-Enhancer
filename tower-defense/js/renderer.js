'use strict';

/* Desenho puro em Canvas 2D. Nao muda estado do jogo, so le. */

const Renderer = {
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  /* Mantem a nitidez em telas HiDPI sem mexer nas coordenadas do jogo. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CONFIG.width * dpr;
    this.canvas.height = CONFIG.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  draw(game) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
    this.drawTerrain(ctx, game);
    this.drawPath(ctx, game);
    this.drawEndpoints(ctx, game);
    this.drawHover(ctx, game);
    this.drawTowers(ctx, game);
    this.drawEnemies(ctx, game);
    this.drawProjectiles(ctx, game);
    this.drawEffects(ctx, game);
    this.drawFloaters(ctx, game);
  },

  drawTerrain(ctx, game) {
    const t = CONFIG.tile;
    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < CONFIG.cols; c++) {
        ctx.fillStyle = (c + r) % 2 === 0 ? '#111a2e' : '#0f1728';
        ctx.fillRect(c * t, r * t, t, t);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < CONFIG.cols; c++) { ctx.moveTo(c * t, 0); ctx.lineTo(c * t, CONFIG.height); }
    for (let r = 1; r < CONFIG.rows; r++) { ctx.moveTo(0, r * t); ctx.lineTo(CONFIG.width, r * t); }
    ctx.stroke();
  },

  drawPath(ctx, game) {
    const points = game.grid.previewPath(CONFIG.tile);
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(96,165,250,.28)';
    ctx.lineWidth = 16;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();

    // Marcha tracejada indicando o sentido do fluxo.
    ctx.strokeStyle = 'rgba(147,197,253,.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 13]);
    ctx.lineDashOffset = -game.elapsed * 34;
    ctx.stroke();
    ctx.restore();
  },

  drawEndpoints(ctx, game) {
    const t = CONFIG.tile;
    const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 3);

    const spawn = game.grid.spawn;
    ctx.fillStyle = 'rgba(248,113,113,.22)';
    ctx.fillRect(spawn.c * t, spawn.r * t, t, t);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.strokeRect(spawn.c * t + 3, spawn.r * t + 3, t - 6, t - 6);

    const exit = game.grid.exit;
    ctx.fillStyle = 'rgba(74,222,128,.18)';
    ctx.fillRect(exit.c * t, exit.r * t, t, t);
    ctx.strokeStyle = 'rgba(74,222,128,' + (0.5 + pulse * 0.5) + ')';
    ctx.strokeRect(exit.c * t + 3, exit.r * t + 3, t - 6, t - 6);

    ctx.fillStyle = 'rgba(230,236,255,.6)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ENTRADA', (spawn.c + 0.5) * t, spawn.r * t + t - 6);
    ctx.fillText('SAÍDA', (exit.c + 0.5) * t, exit.r * t + t - 6);
  },

  drawHover(ctx, game) {
    const cell = game.hoverCell;
    if (!cell) return;
    const t = CONFIG.tile;

    if (game.selectedType) {
      const ok = game.canBuildAt(cell.c, cell.r);
      const def = TOWER_TYPES[game.selectedType];
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = ok ? def.color : '#ef4444';
      ctx.fillRect(cell.c * t + 2, cell.r * t + 2, t - 4, t - 4);
      if (ok) {
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.arc((cell.c + 0.5) * t, (cell.r + 0.5) * t, def.levels[0].range, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cell.c * t + 2, cell.r * t + 2, t - 4, t - 4);
  },

  drawTowers(ctx, game) {
    const t = CONFIG.tile;

    for (const tower of game.towers) {
      const sel = game.selectedTower === tower;
      const x = tower.x, y = tower.y;

      if (sel) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        ctx.strokeStyle = 'rgba(255,255,255,.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, tower.stats.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Base
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(tower.c * t + 4, tower.r * t + 4, t - 8, t - 8);
      ctx.strokeStyle = tower.def.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(tower.c * t + 4, tower.r * t + 4, t - 8, t - 8);

      // Canhao
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tower.angle);
      const kick = Math.max(0, tower.recoil) * 3;
      ctx.fillStyle = tower.def.color;
      ctx.fillRect(-6 - kick, -3.5, 20, 7);
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Pontinhos de nivel
      for (let i = 0; i <= tower.level; i++) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(tower.c * t + 10 + i * 6, tower.r * t + t - 9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  drawEnemies(ctx, game) {
    for (const e of game.enemies) {
      if (e.dead || e.escaped) continue;

      if (e.slowFactor > 0) {
        ctx.fillStyle = 'rgba(56,189,248,.22)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.def.color;
      ctx.beginPath();
      ctx.moveTo(e.radius, 0);
      ctx.lineTo(-e.radius * 0.75, e.radius * 0.8);
      ctx.lineTo(-e.radius * 0.35, 0);
      ctx.lineTo(-e.radius * 0.75, -e.radius * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Barra de vida (some quando cheia, para nao poluir)
      if (e.hp < e.maxHp) {
        const w = e.radius * 2.2;
        const pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w, 4);
        ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#f87171';
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w * pct, 4);
      }
    }
  },

  drawProjectiles(ctx, game) {
    for (const p of game.projectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.stats.splash ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  drawEffects(ctx, game) {
    for (const fx of game.effects) {
      const k = fx.life / fx.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k) * 0.6;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (1.25 - k * 0.45), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  drawFloaters(ctx, game) {
    ctx.textAlign = 'center';
    ctx.font = '700 13px system-ui, sans-serif';
    for (const f of game.floaters) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }
};
