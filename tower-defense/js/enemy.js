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

    /* Habilidade: uma por tipo, e so em alguns. Ver HABILIDADES em config.
     * O relogio comeca desfasado para que dez Necromantes da mesma onda nao
     * lancem tudo no mesmo quadro -- isso seria um pico de custo e, pior,
     * um pico de dificuldade que o jogador le como injusto. */
    this.hab = def.habilidade ? HABILIDADES[def.habilidade] : null;
    this.habKey = def.habilidade || null;
    this.habTimer = this.hab && this.hab.intervalo
      ? Math.random() * this.hab.intervalo : 0;
    this.pressa = 0;          // bonus de velocidade recebido de um aliado
    this.pressaTimer = 0;
    this.travessias = this.hab && this.hab.usos ? this.hab.usos : 0;
    this.escalando = 0;       // s restantes em cima da torre
    this.escalaDe = null;     // celula de onde saiu
    this.escalaPara = null;   // celula para onde vai
    this.voa = this.habKey === 'voo';
  }

  /* O voador nao le o campo de fluxo, entao a distancia do labirinto nao diz
   * nada sobre ele. Sem isto, uma torre com um voador e um Grunt no alcance
   * miraria o Grunt: o voador atras de uma parede devolve -1 e vira
   * MAX_SAFE_INTEGER, ou seja, "o mais atrasado do mapa". */
  progressoVoo() {
    const ex = (this.grid.exit.c + 0.5) * this.tile;
    const ey = (this.grid.exit.r + 0.5) * this.tile;
    return Math.hypot(ex - this.x, ey - this.y) / this.tile;
  }

  get cell() {
    return { c: Math.floor(this.x / this.tile), r: Math.floor(this.y / this.tile) };
  }

  /* Quanto falta ate a saida. Menor = mais adiantado. */
  progress() {
    if (this.voa) return this.progressoVoo();

    /* Escalando, a Aranha esta EM CIMA de uma celula de torre, que nao tem
     * rota -- e distanceAt devolve -1 ali. Sem este ramo ela virava
     * MAX_SAFE_INTEGER, o "mais atrasado do mapa", e nenhuma torre a mirava:
     * atravessar deixava de custar e virava invisibilidade de graca.
     * Durante a escalada ela conta pela celula de DESTINO. */
    if (this.escalando > 0 && this.escalaPara) {
      const c = Math.floor(this.escalaPara.x / this.tile);
      const r = Math.floor(this.escalaPara.y / this.tile);
      const d = this.grid.distanceAt(c, r);
      if (d !== -1) return d;
    }

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
    if (this.pressaTimer > 0) {
      this.pressaTimer -= dt;
      if (this.pressaTimer <= 0) this.pressa = 0;
    }
    if (this.hab && this.hab.intervalo) {
      this.habTimer -= dt;
      if (this.habTimer <= 0) {
        this.habTimer = this.hab.intervalo;
        this.lancar(game);
      }
    }

    const cell = this.cell;

    if (cell.c === this.grid.exit.c && cell.r === this.grid.exit.r) {
      this.escaped = true;
      return;
    }

    /* O voador sai do labirinto inteiro: vai reto para a saida, nunca fica
     * impaciente e nunca cava. A resposta do jogador nao e um desvio -- e
     * torre perto da saida, que e uma decisao de mapa, nao de serpentina. */
    if (this.voa) return this.voar(dt);

    /* A escalada e um estado, nao um teleporte: a Aranha fica parada em cima
     * da torre pelo tempo da habilidade, visivel e sem desviar dos tiros.
     * Sem esse custo, atravessar seria so um atalho gratis. */
    if (this.escalando > 0) return this.escalar(dt);

    if (this.travessias > 0 && this.hab && this.hab.ganho !== undefined) {
      const passagem = this.escolherPassagem(cell, game);
      if (passagem) {
        this.travessias -= 1;
        this.escalando = this.hab.tempo;
        this.escalaDe = { x: this.x, y: this.y };
        this.escalaPara = { x: (passagem.c + 0.5) * this.tile,
                            y: (passagem.r + 0.5) * this.tile };
        this.angle = Math.atan2(this.escalaPara.y - this.y, this.escalaPara.x - this.x);
        if (game) game.avisoHabilidade(this, HABILIDADES.passagem);
        return;
      }
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
    const step = Math.min(this.velocidade * dt, dist);

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    // O ciclo de passo sai daqui: quem anda mais rapido pisa mais rapido,
    // sem nenhum temporizador separado para manter em sincronia.
    this.walked += step;
  }

  /* --------------------------------------------------------- habilidades -- */

  get velocidade() {
    return this.baseSpeed * (1 - this.slowFactor) * (1 + this.pressa);
  }

  voar(dt) {
    const ex = (this.grid.exit.c + 0.5) * this.tile;
    const ey = (this.grid.exit.r + 0.5) * this.tile;
    const dx = ex - this.x, dy = ey - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) { this.escaped = true; return; }
    this.angle = Math.atan2(dy, dx);
    const step = Math.min(this.velocidade * dt, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.walked += step;
  }

  escalar(dt) {
    this.escalando -= dt;
    const k = 1 - Math.max(0, this.escalando) / this.hab.tempo;
    this.x = this.escalaDe.x + (this.escalaPara.x - this.escalaDe.x) * k;
    this.y = this.escalaDe.y + (this.escalaPara.y - this.escalaDe.y) * k;
    if (this.escalando <= 0) {
      this.x = this.escalaPara.x;
      this.y = this.escalaPara.y;
      this.escalando = 0;
    }
  }

  /* Qual parede vale escalar: a que mais ENCURTA a rota real que falta.
   *
   * Compara a rota daqui com a rota do outro lado da parede, descontando as
   * duas casas que a travessia consome. Usa o campo de fluxo real, que ja
   * conhece o labirinto inteiro -- nao ha busca nova por monstro, so quatro
   * leituras.
   *
   * O destino e a celula DEPOIS da torre, nunca a torre: pousar em cima dela
   * deixaria a Aranha dentro de uma parede se a torre caisse no mesmo quadro. */
  escolherPassagem(cell, game) {
    const aqui = this.grid.distanceAt(cell.c, cell.r);
    if (aqui < 0) return null;

    let melhor = null, melhorGanho = this.hab.ganho;

    for (const d of DIRS) {
      const tc = cell.c + d[0], tr = cell.r + d[1];
      if (!this.grid.inBounds(tc, tr)) continue;
      if (this.grid.cellAt(tc, tr) !== CELL.TORRE) continue;

      const pc = tc + d[0], pr = tr + d[1];
      if (!this.grid.inBounds(pc, pr)) continue;
      if (this.grid.cellAt(pc, pr) !== CELL.LIVRE) continue;

      const depois = this.grid.distanceAt(pc, pr);
      if (depois < 0) continue;

      const ganho = aqui - depois - 2;   // as duas casas da travessia
      if (ganho <= melhorGanho) continue;
      melhorGanho = ganho; melhor = { c: pc, r: pr };
    }
    return melhor;
  }

  /* Escolha de alvo -- e isto que o jogador le como inteligencia.
   *
   * Nao e sorteio: o Necromante cala a torre que mais machuca e o Bruxo
   * apressa o aliado mais adiantado. Roda no intervalo da habilidade, nunca
   * por quadro. */
  lancar(game) {
    if (!game || !this.hab) return;
    const raio = this.hab.raio * this.tile;

    if (this.habKey === 'debuff') {
      let alvo = null, melhor = 0;
      for (const t of game.towers) {
        if (t.destruida || !t.pronta || t.debuffTimer > 0) continue;
        if (Math.hypot(t.x - this.x, t.y - this.y) > raio) continue;
        const dps = Damage.dps(t.stats);
        if (dps > melhor) { melhor = dps; alvo = t; }
      }
      if (alvo) {
        alvo.amaldicoar(this.hab.forca, this.hab.duracao);
        game.avisoHabilidade(this, this.hab, alvo);
      }
      return;
    }

    if (this.habKey === 'pressa') {
      let alvo = null, melhor = Number.MAX_SAFE_INTEGER;
      for (const e of game.enemies) {
        if (e === this || e.dead || e.escaped || e.pressaTimer > 0) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) > raio) continue;
        const p = e.progress();
        if (p < melhor) { melhor = p; alvo = e; }
      }
      if (alvo) {
        alvo.pressa = this.hab.forca;
        alvo.pressaTimer = this.hab.duracao;
        game.avisoHabilidade(this, this.hab, alvo);
      }
    }
  }
}
