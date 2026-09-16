'use strict';

/* Inimigo: silhueta base + afixo + nivel.
 *
 * As 5 silhuetas sao reaproveitadas; o que muda entre variantes e o afixo,
 * que altera cor E marcador de forma (placas, halo, rastro). Cor sozinha nao
 * comunica resistencia rapido o bastante numa onda cheia e falha para quem
 * tem daltonismo -- por isso o marcador nao e opcional. */

class Enemy {
  constructor(typeKey, affixKey, level, grid, tile) {
    const def = ENEMY_TYPES[typeKey];
    const affix = AFFIXES[affixKey] || AFFIXES.comum;

    this.type = typeKey;
    this.def = def;
    this.affixKey = affixKey || 'comum';
    this.affix = affix;
    this.level = level || 1;
    this.grid = grid;
    this.tile = tile;

    // Nivel do monstro escala vida e recompensa, nao velocidade.
    const levelMul = Math.pow(1.145, this.level - 1);

    this.maxHp = Math.round(def.hp * levelMul * affix.hpMul);
    this.hp = this.maxHp;
    this.baseSpeed = def.speed * affix.speedMul;
    this.radius = def.radius + (this.level > 8 ? 2 : 0);
    this.gold = Math.max(1, Math.round(def.gold * affix.goldMul * (1 + (this.level - 1) * 0.06)));
    this.leak = def.leak;
    this.resist = { fisico: affix.resist.fisico, magico: affix.resist.magico };
    this.color = affix.color || def.color || '#e2e8f0';
    this.marker = affix.marker;
    this.shape = def.shape;
    // Classe de sensibilidade ao medo: decide QUAL campo de fluxo este
    // inimigo lê. Todos de uma classe seguem a mesma rota -- rota individual
    // por monstro viraria papel picado e não acrescentaria decisão nenhuma.
    this.medo = def.medo || 'normal';

    /* Paciencia: quantas vezes a rota pode ser mais longa que a viagem direta
     * antes dele parar de andar e quebrar a parede. O ataque escala com o
     * nivel junto com a vida -- senao o labirinto voltaria a ser eterno nas
     * ondas altas, que e exatamente o problema que isto existe para resolver. */
    this.paciencia = def.paciencia || 99;
    // O ataque contra torres acompanha o nivel bem mais devagar que a vida:
    // a vida da TORRE nao escala com a onda, so com o ouro investido nela.
    this.ataque = (def.ataque || 0) * Math.pow(levelMul, CONFIG.ataqueEscala);
    this.impaciente = false;
    this.atacando = null;

    this.x = (grid.spawn.c + 0.5) * tile;
    this.y = (grid.spawn.r + 0.5) * tile;

    this.slowFactor = 0;
    this.slowTimer = 0;
    this.hitFlash = 0;
    this.knock = 0;        // tranco do impacto: só deslocamento de desenho
    this.lastSchool = null;
    this.dead = false;
    this.escaped = false;
    this.angle = 0;
    this.walked = Math.random() * 40;   // desfasa o passo entre inimigos iguais
    this.lastStamp = 0;                // distancia do ultimo carimbo na trilha
    this.wobble = Math.random() * Math.PI * 2;
  }

  get cell() {
    return { c: Math.floor(this.x / this.tile), r: Math.floor(this.y / this.tile) };
  }

  /* Quanto falta ate a saida. Menor = mais adiantado. */
  progress() {
    const cell = this.cell;
    const d = this.grid.distanceAt(cell.c, cell.r);
    return d === -1 ? Number.MAX_SAFE_INTEGER : d;
  }

  /* A parede que ele cava: a vizinha bloqueada por TORRE que fica mais perto
   * da saida num tabuleiro sem torres. Ou seja, ele cava na direcao certa.
   * Rocha do mapa nao conta -- aquilo nao quebra. */
  paredeAlvo(cell, game) {
    if (!game) return null;
    let melhor = null, melhorDist = Infinity;

    for (const d of DIRS) {
      const nc = cell.c + d[0], nr = cell.r + d[1];
      if (!this.grid.inBounds(nc, nr)) continue;
      if (this.grid.cellAt(nc, nr) !== CELL.TORRE) continue;

      const torre = game.towerAt.get(nc + ',' + nr);
      if (!torre) continue;

      const dl = this.grid.distLivre[this.grid.idx(nc, nr)];
      if (dl < 0 || dl >= melhorDist) continue;
      melhorDist = dl; melhor = torre;
    }
    return melhor;
  }

  applySlow(factor, duration) {
    // Lentidao nao acumula: vale sempre o efeito mais forte ainda ativo.
    if (factor >= this.slowFactor) {
      this.slowFactor = Math.min(0.95, factor);
      this.slowTimer = duration;
    } else {
      this.slowTimer = Math.max(this.slowTimer, duration * 0.5);
    }
  }

  takeHit(packet, mods) {
    const dealt = Damage.resolve(this, packet, mods);
    this.hp -= dealt;
    this.hitFlash = 0.12;
    this.lastSchool = Damage.dominant(packet);
    if (this.hp <= 0) this.dead = true;
    return dealt;
  }

  update(dt, game) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    // O tranco nunca move o inimigo de verdade: mexer na posição empurraria
    // ele para dentro de paredes e bagunçaria o campo de fluxo.
    if (this.knock > 0) this.knock = Math.max(0, this.knock - dt * 7);
    this.wobble += dt * 9;

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 0;
    }

    const cell = this.cell;

    if (cell.c === this.grid.exit.c && cell.r === this.grid.exit.r) {
      this.escaped = true;
      return;
    }

    /* Paciencia. O inimigo compara a viagem que o labirinto impos com a que
     * ele faria num tabuleiro sem torres. Passou do limite dele, ele para de
     * andar e cava. */
    this.impaciente = !!CONFIG.medoPaciencia && this.ataque > 0 &&
                      this.grid.folga(cell.c, cell.r) > this.paciencia;

    if (this.impaciente) {
      const alvo = this.paredeAlvo(cell, game);
      if (alvo) {
        this.atacando = alvo;
        this.angle = Math.atan2(alvo.y - this.y, alvo.x - this.x);
        game.torreApanha(alvo, this.ataque * dt, this);
        return;   // cavando: nao anda, nao pisa trilha
      }
    }
    this.atacando = null;

    const next = this.grid.nextCell(cell.c, cell.r, this.medo);
    if (!next) return; // sem rota: so acontece se a Muralha expirar num quadro ruim

    const targetX = (next.c + 0.5) * this.tile;
    const targetY = (next.r + 0.5) * this.tile;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) return;

    this.angle = Math.atan2(dy, dx);
    const speed = this.baseSpeed * (1 - this.slowFactor);
    const step = Math.min(speed * dt, dist);

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    // O ciclo de passo sai daqui: quem anda mais rapido pisa mais rapido,
    // sem nenhum temporizador separado para manter em sincronia.
    this.walked += step;
  }
}
