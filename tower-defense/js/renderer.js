'use strict';

/* Desenho em Canvas 2D. Nao muda estado do jogo, so le. */

const Renderer = {
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CONFIG.width * dpr;
    this.canvas.height = CONFIG.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  draw(game) {
    const ctx = this.ctx;
    this._clock = game.elapsed;   // altares e vortices giram sozinhos
    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
    this.terrain(ctx, game);
    this.path(ctx, game);
    this.endpoints(ctx, game);
    this.walls(ctx, game);
    this.hover(ctx, game);
    this.towers(ctx, game);
    this.enemies(ctx, game);
    this.projectiles(ctx, game);
    this.effects(ctx, game);
    this.floaters(ctx, game);
    this.tint(ctx, game);
  },

  /* ------------------------------------------------------------ cenario -- */

  terrain(ctx, game) {
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

    // Rocha do mapa: nao da para construir nem atravessar.
    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < CONFIG.cols; c++) {
        if (game.grid.cellAt(c, r) !== CELL.TERRENO) continue;
        ctx.fillStyle = '#243049';
        ctx.fillRect(c * t + 1, r * t + 1, t - 2, t - 2);
        ctx.strokeStyle = '#334463';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c * t + 9, r * t + t - 11);
        ctx.lineTo(c * t + t / 2, r * t + 10);
        ctx.lineTo(c * t + t - 9, r * t + t - 11);
        ctx.closePath();
        ctx.stroke();
      }
    }
  },

  path(ctx, game) {
    const points = game.grid.previewPath(CONFIG.tile);
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(96,165,250,.26)';
    ctx.lineWidth = 16;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(147,197,253,.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 13]);
    ctx.lineDashOffset = -game.elapsed * 34;
    ctx.stroke();
    ctx.restore();
  },

  endpoints(ctx, game) {
    const t = CONFIG.tile;
    const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 3);
    const s = game.grid.spawn, x = game.grid.exit;

    ctx.fillStyle = 'rgba(248,113,113,.22)';
    ctx.fillRect(s.c * t, s.r * t, t, t);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.c * t + 3, s.r * t + 3, t - 6, t - 6);

    ctx.fillStyle = 'rgba(74,222,128,.18)';
    ctx.fillRect(x.c * t, x.r * t, t, t);
    ctx.strokeStyle = 'rgba(74,222,128,' + (0.5 + pulse * 0.5) + ')';
    ctx.strokeRect(x.c * t + 3, x.r * t + 3, t - 6, t - 6);

    ctx.fillStyle = 'rgba(230,236,255,.75)';
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ENTRADA', (s.c + 0.5) * t, s.r * t + t - 5);
    ctx.fillText('SAÍDA', (x.c + 0.5) * t, x.r * t + t - 5);
  },

  walls(ctx, game) {
    const t = CONFIG.tile;
    for (const w of game.walls) {
      const k = w.life / w.max;
      ctx.save();
      ctx.globalAlpha = 0.35 + k * 0.45;
      ctx.fillStyle = SPELLS.muralha.color;
      ctx.fillRect(w.c * t + 4, w.r * t + 4, t - 8, t - 8);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = SPELLS.muralha.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(w.c * t + 4, w.r * t + 4, t - 8, t - 8);
      // Ampulheta: barra que encolhe com o tempo restante.
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(w.c * t + 6, w.r * t + t - 10, t - 12, 4);
      ctx.fillStyle = SPELLS.muralha.color;
      ctx.fillRect(w.c * t + 6, w.r * t + t - 10, (t - 12) * k, 4);
      ctx.restore();
    }
  },

  hover(ctx, game) {
    const cell = game.hoverCell;
    if (!cell) return;
    const t = CONFIG.tile;

    // Mira de magia tem prioridade sobre o preview de construcao.
    const pending = game.spellbook && game.spellbook.pending;
    if (pending) {
      const def = SPELLS[pending];
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = def.color;
      if (def.radius) {
        ctx.beginPath();
        ctx.arc((cell.c + 0.5) * t, (cell.r + 0.5) * t, def.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(cell.c * t + 3, cell.r * t + 3, t - 6, t - 6);
      }
      ctx.restore();
      return;
    }

    if (game.selectedType) {
      const ok = game.canBuildAt(cell.c, cell.r);
      const def = TOWER_TYPES[game.selectedType];
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = ok ? def.color : '#ef4444';
      ctx.fillRect(cell.c * t + 2, cell.r * t + 2, t - 4, t - 4);
      if (ok) {
        ctx.globalAlpha = 0.11;
        ctx.beginPath();
        ctx.arc((cell.c + 0.5) * t, (cell.r + 0.5) * t, def.base.range, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cell.c * t + 2, cell.r * t + 2, t - 4, t - 4);
  },

  /* ------------------------------------------------------------- torres -- */

  towers(ctx, game) {
    const t = CONFIG.tile;
    const fuseTargets = game.fuseArmed
      ? game.fusionOptions(game.fuseArmed).map(o => o.other)
      : [];

    for (const tower of game.towers) {
      const sel = game.selectedTower === tower;

      if (sel) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        ctx.strokeStyle = 'rgba(255,255,255,.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, tower.stats.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Alvo valido de fusao piscando.
      if (fuseTargets.indexOf(tower) !== -1) {
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(game.elapsed * 8);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.strokeRect(tower.c * t + 2, tower.r * t + 2, t - 4, t - 4);
        ctx.restore();
      }

      ctx.fillStyle = tower.fused ? '#2a1f3d' : '#1e293b';
      ctx.fillRect(tower.c * t + 4, tower.r * t + 4, t - 8, t - 8);
      ctx.strokeStyle = tower.def.color;
      ctx.lineWidth = tower.fused ? 3 : 2;
      ctx.strokeRect(tower.c * t + 4, tower.r * t + 4, t - 8, t - 8);

      ctx.save();
      ctx.translate(tower.x, tower.y);
      ctx.rotate(tower.angle);
      this.towerHead(ctx, tower);
      ctx.restore();

      this.towerBadges(ctx, tower, t);
    }
  },

  /* Cada silhueta de torre desenha sua propria arma, ja rotacionada. */
  towerHead(ctx, tower) {
    const color = tower.def.color;
    const kick = Math.max(0, tower.recoil) * 3;
    ctx.fillStyle = color;

    switch (tower.def.shape) {
      case 'balista':
        ctx.fillRect(-9 - kick, -2.5, 28, 5);
        ctx.fillRect(-2 - kick, -9, 5, 18);
        break;
      case 'bombarda':
        ctx.fillRect(-7 - kick, -5.5, 19, 11);
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        break;
      case 'altar':
        ctx.save();
        ctx.rotate(-tower.angle + spinPhase(tower));
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      case 'glacial':
        ctx.save();
        ctx.rotate(-tower.angle + spinPhase(tower) * 0.6);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(-Math.cos(a) * 11, -Math.sin(a) * 11);
          ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
          ctx.stroke();
        }
        ctx.restore();
        break;
      case 'templo':
        ctx.fillRect(-6 - kick, -4, 18, 8);
        ctx.fillStyle = DAMAGE_META.fisico.color;
        ctx.fillRect(-9, -8, 5, 5);
        ctx.fillStyle = DAMAGE_META.magico.color;
        ctx.fillRect(-9, 3, 5, 5);
        break;
      default: // arqueira
        ctx.fillRect(-6 - kick, -3.5, 21, 7);
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b1020';
        ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, Math.PI * 2); ctx.fill();
        break;
    }
  },

  /* Pontinhos de nivel + selo da escola de dano. */
  towerBadges(ctx, tower, t) {
    const dmg = tower.stats.dmg;

    if (tower.fused) {
      ctx.fillStyle = '#fde047';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('★', tower.c * t + 7, tower.r * t + 15);
    } else {
      for (let i = 0; i <= tower.level; i++) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(tower.c * t + 10 + i * 6, tower.r * t + t - 9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const w = 4;
    const total = dmg.fisico + dmg.magico;
    if (total <= 0) return;
    const fx = tower.c * t + t - 8;
    const fy = tower.r * t + 8;
    ctx.fillStyle = DAMAGE_META.fisico.color;
    ctx.fillRect(fx, fy, w, (dmg.fisico / total) * 14);
    ctx.fillStyle = DAMAGE_META.magico.color;
    ctx.fillRect(fx, fy + (dmg.fisico / total) * 14, w, (dmg.magico / total) * 14);
  },

  /* ----------------------------------------------------------- inimigos -- */

  enemies(ctx, game) {
    for (const e of game.enemies) {
      if (e.dead || e.escaped) continue;

      if (e.slowFactor > 0) {
        ctx.fillStyle = 'rgba(56,189,248,' + (0.12 + e.slowFactor * 0.22) + ')';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
      this.enemyShape(ctx, e);
      ctx.restore();

      this.enemyMarker(ctx, e, game);
      this.enemyBar(ctx, e);
    }
  },

  /* 5 silhuetas reaproveitadas entre todas as variantes. */
  enemyShape(ctx, e) {
    const R = e.radius;
    ctx.beginPath();

    switch (e.shape) {
      case 'losango':
        ctx.moveTo(R * 1.4, 0); ctx.lineTo(0, R * 0.7);
        ctx.lineTo(-R * 1.1, 0); ctx.lineTo(0, -R * 0.7);
        break;
      case 'hexagono':
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        }
        break;
      case 'estrela':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const rr = i % 2 === 0 ? R : R * 0.45;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        break;
      case 'chefe':
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = i % 2 === 0 ? R : R * 0.72;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        break;
      default: // triangulo
        ctx.moveTo(R, 0);
        ctx.lineTo(-R * 0.75, R * 0.8);
        ctx.lineTo(-R * 0.35, 0);
        ctx.lineTo(-R * 0.75, -R * 0.8);
        break;
    }
    ctx.closePath();
    ctx.fill();
  },

  /* O marcador e o que comunica resistencia. Cor sozinha nao serve: o jogador
   * tem menos de um segundo para decidir, e matiz falha para daltonicos. */
  enemyMarker(ctx, e, game) {
    if (!e.marker) return;
    const R = e.radius;

    if (e.marker === 'placas' || e.marker === 'ambos') {
      ctx.strokeStyle = DAMAGE_META.fisico.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R + 3, -0.7, 0.7);
      ctx.moveTo(e.x + Math.cos(Math.PI - 0.7) * (R + 3), e.y + Math.sin(Math.PI - 0.7) * (R + 3));
      ctx.arc(e.x, e.y, R + 3, Math.PI - 0.7, Math.PI + 0.7);
      ctx.stroke();
    }

    if (e.marker === 'halo' || e.marker === 'ambos') {
      ctx.save();
      ctx.strokeStyle = DAMAGE_META.magico.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.lineDashOffset = -game.elapsed * 18;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (e.marker === 'rastro') {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x - Math.cos(e.angle) * (R + 4), e.y - Math.sin(e.angle) * (R + 4));
      ctx.lineTo(e.x - Math.cos(e.angle) * (R + 17), e.y - Math.sin(e.angle) * (R + 17));
      ctx.stroke();
      ctx.restore();
    }
  },

  enemyBar(ctx, e) {
    if (e.hp >= e.maxHp) return;
    const w = e.radius * 2.3;
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w, 4);
    ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#f87171';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w * pct, 4);
  },

  /* ------------------------------------------------------------ efeitos -- */

  projectiles(ctx, game) {
    for (const p of game.projectiles) {
      const hybrid = Damage.isHybrid(p.stats.dmg);
      ctx.fillStyle = p.color;

      if (p.pierce > 0 || p.piercing) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.piercing ? p.dirY : p.headingY, p.piercing ? p.dirX : p.headingX));
        ctx.fillRect(-7, -1.6, 15, 3.2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.stats.splash ? 5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (hybrid) {
        ctx.strokeStyle = DAMAGE_META.magico.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },

  effects(ctx, game) {
    for (const fx of game.effects) {
      const k = fx.life / fx.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k) * (fx.heavy ? 0.8 : 0.6);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = fx.heavy ? 5 : 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (1.3 - k * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      if (fx.heavy) {
        ctx.globalAlpha = Math.max(0, k) * 0.25;
        ctx.fillStyle = fx.color;
        ctx.fill();
      }
      ctx.restore();
    }
  },

  floaters(ctx, game) {
    ctx.textAlign = 'center';
    ctx.font = '700 13px system-ui, sans-serif';
    for (const f of game.floaters) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  },

  tint(ctx, game) {
    if (!game.screenTint) return;
    ctx.save();
    ctx.globalAlpha = (game.screenTint.life / game.screenTint.max) * 0.22;
    ctx.fillStyle = game.screenTint.color;
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.restore();
  }
};

/* Fase de rotacao propria das torres animadas. Defasada por celula para que
 * duas torres iguais lado a lado nao girem em sincronia. */
function spinPhase(tower) {
  return (Renderer._clock || 0) + (tower.c + tower.r) * 0.3;
}
