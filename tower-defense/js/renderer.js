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
    Trail.draw(ctx);
    this.perigo(ctx, game);
    this.endpoints(ctx, game);
    this.walls(ctx, game);
    this.hover(ctx, game);
    this.towers(ctx, game);
    this.enemies(ctx, game);
    this.projectiles(ctx, game);
    this.effects(ctx, game);
    this.floaters(ctx, game);
    this.fuseOverlay(ctx, game);
    this.tint(ctx, game);
    this.strip(ctx, game);
  },

  /* ------------------------------------------------------------ cenario -- */

  terrain(ctx, game) {
    const t = CONFIG.tile;
    const chao = Terrain.get(game.map.id);

    if (chao) {
      ctx.drawImage(chao, 0, 0, CONFIG.boardW, CONFIG.boardH);
    } else {
      // Xadrez de reserva enquanto a textura nao chegou.
      for (let r = 0; r < CONFIG.rows; r++) {
        for (let c = 0; c < CONFIG.cols; c++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#111a2e' : '#0f1728';
          ctx.fillRect(c * t, r * t, t, t);
        }
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < CONFIG.cols; c++) { ctx.moveTo(c * t, 0); ctx.lineTo(c * t, CONFIG.boardH); }
    for (let r = 1; r < CONFIG.rows; r++) { ctx.moveTo(0, r * t); ctx.lineTo(CONFIG.boardW, r * t); }
    ctx.stroke();

    // Rocha do mapa: nao da para construir nem atravessar.
    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < CONFIG.cols; c++) {
        if (game.grid.cellAt(c, r) !== CELL.TERRENO) continue;

        // Rocha, nao bloco. Sobre a textura de pedra do mapa, o azul chapado
        // que existia aqui destoava e parecia peca de interface.
        const x = c * t, y = r * t;
        ctx.fillStyle = '#0d0f12';
        ctx.fillRect(x + 1, y + 1, t - 2, t - 2);

        ctx.fillStyle = '#1c2026';
        ctx.beginPath();
        ctx.moveTo(x + 7,      y + t - 8);
        ctx.lineTo(x + 13,     y + 14);
        ctx.lineTo(x + t / 2,  y + 7);
        ctx.lineTo(x + t - 12, y + 17);
        ctx.lineTo(x + t - 7,  y + t - 8);
        ctx.closePath();
        ctx.fill();

        // Aresta clara no topo: da volume sem precisar de sombra projetada.
        ctx.strokeStyle = 'rgba(160,172,188,.22)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 13, y + 14);
        ctx.lineTo(x + t / 2, y + 7);
        ctx.lineTo(x + t - 12, y + 17);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 1.5, t - 3, t - 3);
      }
    }
  },

  /* Mapa de calor do medo.
   *
   * Nao e enfeite. Se o jogador nao VE onde o perigo acumulou, a rota foge do
   * killbox sem explicacao e o jogo so parece injusto. Manchas radiais em vez
   * de quadrados: o campo e borrado, entao desenha-lo quadriculado mentiria
   * sobre a resolucao da mecanica. */
  perigo(ctx, game) {
    if (!Perigo.ligado()) return;

    if (!this._quente) {
      const tam = 96;
      const cv = document.createElement('canvas');
      cv.width = cv.height = tam;
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
      g.addColorStop(0, 'rgba(248,68,52,1)');
      g.addColorStop(0.5, 'rgba(230,60,46,0.55)');
      g.addColorStop(1, 'rgba(200,50,40,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, tam, tam);
      this._quente = cv;
    }

    const t = CONFIG.tile;
    const raio = t * 0.92;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < CONFIG.cols; c++) {
        const n = Perigo.nivel(c, r);
        if (n < 0.05) continue;
        ctx.globalAlpha = Math.min(0.5, n * 0.5);
        ctx.drawImage(this._quente, (c + 0.5) * t - raio, (r + 0.5) * t - raio, raio * 2, raio * 2);
      }
    }
    ctx.restore();
  },

  /* Rota prevista.
   *
   * Com o medo ligado existe uma rota POR CLASSE de sensibilidade, e desenhar
   * as tres sempre viraria poluicao. Entao: enquanto as classes concordam, sai
   * a linha azul de sempre; assim que uma diverge, cada rota ganha a cor da
   * sua classe. A cor so aparece quando ha o que dizer. */
  path(ctx, game) {
    const classes = Perigo.ligado() ? ['cauteloso', 'normal', 'afoito'] : [null];
    const rotas = [];

    for (const nome of classes) {
      const pts = game.grid.previewPath(CONFIG.tile, nome);
      if (pts.length < 2) continue;
      const sig = pts.map(p => p.x + '_' + p.y).join('|');
      const igual = rotas.find(r => r.sig === sig);
      if (igual) { igual.nomes.push(nome); continue; }
      rotas.push({ sig: sig, pts: pts, nomes: [nome] });
    }
    if (rotas.length === 0) return;

    const unica = rotas.length === 1;
    for (const rota of rotas) {
      const meta = unica ? null : MEDO_META[rota.nomes[0]];
      this.rota(ctx, game, rota.pts, meta);
    }

    if (!unica) {
      ctx.save();
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      let y = 12;
      for (const rota of rotas) {
        const meta = MEDO_META[rota.nomes[0]];
        ctx.fillStyle = meta.color;
        ctx.fillRect(6, y - 6, 8, 3);
        ctx.fillText(rota.nomes.map(n => MEDO_META[n].label).join(' + '), 18, y);
        y += 13;
      }
      ctx.restore();
    }
  },

  rota(ctx, game, points, meta) {
    const banda = meta ? this.rgba(meta.color, 0.2) : 'rgba(96,165,250,.26)';
    const linha = meta ? this.rgba(meta.color, 0.85) : 'rgba(147,197,253,.5)';

    ctx.save();
    ctx.strokeStyle = banda;
    ctx.lineWidth = meta ? 11 : 16;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();

    ctx.strokeStyle = linha;
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 13]);
    ctx.lineDashOffset = -game.elapsed * 34;
    ctx.stroke();
    ctx.restore();
  },

  rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
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

      // A estrada nao e desenhada permanentemente -- quem mostra por onde eles
      // andam e a trilha pisada. Aqui aparece a rota que ESTA construcao
      // criaria, que e quando a informacao vale alguma coisa.
      if (ok) {
        const rotas = game.rotaPrevista(cell.c, cell.r);
        const unica = rotas.length === 1;
        for (const rota of rotas) this.rota(ctx, game, rota.pts, unica ? null : MEDO_META[rota.nome]);
      }

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
    for (const tower of game.towers) {
      if (game.selectedTower === tower) this.towerRange(ctx, tower);
      this.drawTower(ctx, tower);
    }
  },

  towerRange(ctx, tower) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, tower.stats.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  /* Desenho de uma torre, isolado para poder ser repetido por cima do véu
   * da escolha de fusão. */
  drawTower(ctx, tower) {
    const t = CONFIG.tile;
    if (!tower.pronta) { this.towerObra(ctx, tower, t); return; }
    const set = SpriteSheet.get(tower.typeKey);

    // Silenciosa precisa se ler de longe, no meio da onda: apagar o sprite
    // inteiro comunica mais rapido que qualquer simbolo no canto.
    ctx.save();
    if (tower.mudo) ctx.globalAlpha = 0.42;

    if (set) {
      // Sprite pintado: o disco de pedra é circular, então girar a peça
      // inteira em direção ao alvo não quebra a leitura da base.
      //
      // Com dois quadros só, a troca de imagem sozinha não grita a 64px. O
      // coice faz o resto e não custa arte nenhuma: a peça recua no eixo do
      // tiro, incha um pouco e leva um clarão aditivo por cima dela mesma.
      const size = (t * CONFIG.spriteOverflow) / set.discRatio;
      const coice = Math.max(0, Math.min(1, tower.recoil));
      const img = set.images[this.spriteFrame(tower, set)];

      ctx.save();
      ctx.translate(tower.x, tower.y);
      if (coice > 0) {
        ctx.translate(-Math.cos(tower.angle) * coice * 3.5,
                      -Math.sin(tower.angle) * coice * 3.5);
      }
      // angleOffset corrige a arte que aponta para cima em vez da direita.
      ctx.rotate(tower.angle + (set.angleOffset || 0));

      const lado = size * (1 + coice * 0.075);
      ctx.drawImage(img, -lado / 2, -lado / 2, lado, lado);

      if (coice > 0.05) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = coice * 0.42;
        ctx.drawImage(img, -lado / 2, -lado / 2, lado, lado);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = tower.fused ? '#2a1f3d' : '#1e293b';
      ctx.fillRect(tower.c * t + 5, tower.r * t + 5, t - 10, t - 10);
      ctx.strokeStyle = tower.def.color;
      ctx.lineWidth = tower.fused ? 3 : 2;
      ctx.strokeRect(tower.c * t + 5, tower.r * t + 5, t - 10, t - 10);

      ctx.save();
      ctx.translate(tower.x, tower.y);
      ctx.rotate(tower.angle);
      this.towerHead(ctx, tower);
      ctx.restore();
    }
    ctx.restore();

    this.towerBadges(ctx, tower, t);
    this.towerMute(ctx, tower, t);
    this.towerHp(ctx, tower, t);
  },

  /* Vida da torre. So aparece quando ela ja apanhou: uma barra permanente em
   * cada torre poluiria o tabuleiro inteiro para informar que nada aconteceu.
   * Quando aparece, e a coisa mais urgente na tela. */
  towerHp(ctx, tower, t) {
    if (tower.golpe > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, tower.golpe * 3);
      ctx.fillStyle = '#f87171';
      ctx.fillRect(tower.c * t + 2, tower.r * t + 2, t - 4, t - 4);
      ctx.restore();
    }
    if (!tower.ferida) return;

    const frac = Math.max(0, tower.hp / tower.maxHp);
    const w = t - 18, x = tower.c * t + 9, y = tower.r * t + t - 6;
    ctx.fillStyle = 'rgba(8,11,20,.8)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.22 ? '#fbbf24' : '#f87171';
    ctx.fillRect(x, y, w * frac, 3);
  },

  /* Torre em obra: andaime. Precisa se ler como "ainda nao e parede", porque
   * e exatamente isso que ela nao e -- a rota passa por cima dela. */
  towerObra(ctx, tower, t) {
    const x = tower.c * t, y = tower.r * t;

    ctx.save();
    ctx.fillStyle = 'rgba(12,17,30,.55)';
    ctx.fillRect(x + 5, y + 5, t - 10, t - 10);

    ctx.strokeStyle = tower.def.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -this._clock * 18;
    ctx.strokeRect(x + 5.5, y + 5.5, t - 11, t - 11);
    ctx.setLineDash([]);

    // Arco de progresso: quanto falta para virar parede de verdade.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(148,163,184,.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, t * 0.27, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = tower.def.color;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, t * 0.27, -Math.PI / 2, -Math.PI / 2 + tower.obraFrac * Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(230,236,255,.8)';
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OBRA', tower.x, y + t - 9);
    ctx.restore();
  },

  /* Marca da torre silenciosa e o aquecimento ao voltar a atirar. */
  towerMute(ctx, tower, t) {
    if (tower.mudo) {
      const x = tower.c * t + t - 13, y = tower.r * t + t - 13;
      ctx.save();
      ctx.fillStyle = 'rgba(8,11,20,.8)';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (tower.aquecer > 0) {
      const frac = 1 - tower.aquecer / CONFIG.aquecimento;
      ctx.save();
      ctx.strokeStyle = 'rgba(74,222,128,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, t * 0.42, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  /* Escolha da parceira de fusão.
   *
   * O tabuleiro inteiro recebe um véu escuro e só a torre de origem e as
   * candidatas são redesenhadas por cima, com a cor natural. É a diferença
   * entre "descubra quais servem" e "estas servem" -- com a fusão agora
   * aceitando qualquer torre do mapa, uma lista de texto não daria conta. */
  fuseOverlay(ctx, game) {
    const fp = game.fusePending;
    if (!fp) return;
    const t = CONFIG.tile;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 9, 18, .72)';
    ctx.fillRect(0, 0, CONFIG.boardW, CONFIG.boardH);
    ctx.restore();

    // Torre de origem: contorno branco, sem pulsar, para nao competir.
    this.drawTower(ctx, fp.tower);
    ctx.save();
    ctx.strokeStyle = 'rgba(230,236,255,.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(fp.tower.c * t + 2, fp.tower.r * t + 2, t - 4, t - 4);
    ctx.restore();

    const pulso = 0.55 + 0.45 * Math.sin(game.elapsed * 7);
    for (const alvo of fp.partners) {
      this.drawTower(ctx, alvo);
      ctx.save();
      ctx.globalAlpha = pulso;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.strokeRect(alvo.c * t + 2, alvo.r * t + 2, t - 4, t - 4);
      ctx.restore();

      // Linha ligando origem e candidata: diz de onde para onde a fusao vai.
      ctx.save();
      ctx.globalAlpha = 0.30 + pulso * 0.25;
      ctx.strokeStyle = fp.def.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.lineDashOffset = -game.elapsed * 26;
      ctx.beginPath();
      ctx.moveTo(fp.tower.x, fp.tower.y);
      ctx.lineTo(alvo.x, alvo.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = '#e6ecff';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Escolha a torre para fundir em ' + fp.def.name,
                 CONFIG.boardW / 2, 28);
    ctx.fillStyle = '#8fa0c7';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('toque em qualquer outro lugar para cancelar', CONFIG.boardW / 2, 48);
    ctx.restore();
  },

  /* O ciclo de tiro do sprite sai da recarga que a torre já controla:
   *   0 carregada  -- recarga zerada, pronta para atirar
   *   1 disparada  -- logo após o tiro, corda solta e sem virote
   *   2 rearmando  -- resto da recarga, corda armada e ainda sem virote */
  spriteFrame(tower, set) {
    let state = 0;
    if (tower.cooldown > 0) {
      const total = tower.fullCooldown || tower.stats.cooldown;
      // Janela do quadro de tiro: 30% da recarga, mas nunca menos que o
      // lampejo mínimo. Só a proporção fazia o tiro sumir em torre rápida --
      // 0,13s na Arqueira Rúnica, que a 60 quadros por segundo são 8 quadros.
      const janela = Math.max(CONFIG.lampejo, total * 0.30);
      state = (total - tower.cooldown) < janela ? 1 : 2;
    }
    // cycle mapeia estado -> quadro, porque nem toda torre tem três desenhos.
    return set.cycle ? set.cycle[state] : state;
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

      // O tranco é só deslocamento de desenho -- a posição real nunca muda.
      const kx = e.knock > 0 ? -Math.cos(e.angle) * e.knock * 4 : 0;
      const ky = e.knock > 0 ? -Math.sin(e.angle) * e.knock * 4 : 0;

      const mob = MobSheet.get(e.type);
      ctx.save();
      ctx.translate(e.x + kx, e.y + ky);

      if (mob) {
        // O sprite ja vem tingido pelo afixo; girar so o desenho mantem o
        // circulo de colisao intacto.
        ctx.rotate(e.angle + (mob.angleOffset || 0));
        const size = (e.radius * 2) / mob.bodyRatio;
        const imgs = mob.tinted[e.affixKey] || mob.images;
        ctx.drawImage(imgs[MobSheet.frameFor(mob, e)], -size / 2, -size / 2, size, size);
        if (e.hitFlash > 0) {
          // Clarao do acerto por cima, sem repintar o sprite inteiro.
          ctx.globalAlpha = 0.55;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(imgs[MobSheet.frameFor(mob, e)], -size / 2, -size / 2, size, size);
        }
      } else {
        ctx.rotate(e.angle);
        ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
        this.enemyShape(ctx, e);
      }
      ctx.restore();

      this.enemyMarker(ctx, e, game);
      this.enemyDig(ctx, e, game);
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

  /* Anel no inimigo que parou de andar e esta cavando. Sem isso o jogador ve
   * um monstro travado na parede e acha que e bug, em vez de entender que o
   * labirinto dele passou do limite. */
  enemyDig(ctx, e, game) {
    if (!e.atacando) return;
    const p = 0.5 + 0.5 * Math.sin(game.elapsed * 14);
    ctx.save();
    ctx.strokeStyle = 'rgba(248,113,113,' + (0.45 + p * 0.45) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius + 5 + p * 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(248,113,113,.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.atacando.x, e.atacando.y);
    ctx.stroke();
    ctx.restore();
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
      const k = Math.max(0, fx.life / fx.max);
      ctx.save();

      if (fx.kind === 'muzzle') {
        // Cone curto na boca de tiro: diz de onde saiu o disparo mesmo quando
        // o projétil já saiu do quadro.
        ctx.globalAlpha = k;
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.angle);
        ctx.fillStyle = '#fff7e0';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(16 * k, -5 * k);
        ctx.lineTo(23 * k, 0);
        ctx.lineTo(16 * k, 5 * k);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = k * 0.7;
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(0, 0, 6 * k, 0, Math.PI * 2);
        ctx.fill();

      } else if (fx.kind === 'spark') {
        // Faísca no ponto de acerto, aberta contra o sentido da marcha.
        const n = fx.big ? 7 : 4;
        const len = fx.big ? 17 : 11;
        ctx.globalAlpha = k;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = fx.big ? 2.6 : 1.8;
        ctx.lineCap = 'round';
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.angle + Math.PI);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / (n - 1) - 0.5) * 1.5;
          const d = len * (1.4 - k);
          ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
          ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        }
        ctx.stroke();

      } else if (fx.kind === 'shards') {
        // Estilhaços da morte: espalham para fora e encolhem.
        ctx.globalAlpha = k;
        ctx.fillStyle = fx.color;
        ctx.translate(fx.x, fx.y);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + fx.x * 0.01;
          const d = fx.radius * (0.6 + (1 - k) * 2.1);
          ctx.save();
          ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
          ctx.rotate(a);
          const sz = 3.4 * k + 1;
          ctx.fillRect(-sz, -sz * 0.45, sz * 2, sz * 0.9);
          ctx.restore();
        }

      } else {
        ctx.globalAlpha = k * (fx.heavy ? 0.8 : 0.6);
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = fx.heavy ? 5 : 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius * (1.3 - k * 0.5), 0, Math.PI * 2);
        ctx.stroke();
        if (fx.heavy) {
          ctx.globalAlpha = k * 0.25;
          ctx.fillStyle = fx.color;
          ctx.fill();
        }
      }
      ctx.restore();
    }
  },

  /* ------------------------------------------ faixa de magias no canvas -- */

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  strip(ctx, game) {
    const y0 = CONFIG.boardH;
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, y0, CONFIG.boardW, CONFIG.strip);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0 + 0.5);
    ctx.lineTo(CONFIG.boardW, y0 + 0.5);
    ctx.stroke();

    for (const b of game.stripLayout()) {
      const sl = b.slot;
      const ready = sl.cd <= 0;
      const armed = game.spellbook.pending === sl.key;

      ctx.fillStyle = armed ? '#223054' : '#1b2540';
      this.roundRect(ctx, b.x, b.y, b.w, b.h, 11);
      ctx.fill();

      // Recarga subindo de baixo para cima, como uma ampulheta.
      if (!ready) {
        ctx.save();
        this.roundRect(ctx, b.x, b.y, b.w, b.h, 11);
        ctx.clip();
        const k = sl.cd / sl.maxCd;
        ctx.fillStyle = 'rgba(8,12,24,.74)';
        ctx.fillRect(b.x, b.y + b.h * (1 - k), b.w, b.h * k);
        ctx.restore();
      }

      ctx.strokeStyle = armed ? '#e6ecff' : ready ? sl.def.color : '#2b3859';
      ctx.lineWidth = armed ? 2.5 : 1.5;
      this.roundRect(ctx, b.x, b.y, b.w, b.h, 11);
      ctx.stroke();

      ctx.fillStyle = ready ? sl.def.color : '#3b4560';
      this.roundRect(ctx, b.x + 10, b.y + 11, 22, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.font = '700 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sl.def.hotkey, b.x + 21, b.y + 22);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ready ? '#e6ecff' : '#6b7a9c';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(sl.def.name, b.x + 40, b.y + 24);

      ctx.fillStyle = ready ? '#8fa0c7' : sl.def.color;
      ctx.font = '600 11.5px system-ui, sans-serif';
      ctx.fillText(ready ? (sl.def.targeted ? 'toque no mapa' : 'pronta')
                         : Math.ceil(sl.cd) + 's', b.x + 40, b.y + 41);
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
