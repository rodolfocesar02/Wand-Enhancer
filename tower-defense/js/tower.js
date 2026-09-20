'use strict';

/* Torre.
 *
 * Evolucao ramificada: nos niveis 2 e 3 o jogador escolhe entre dois caminhos,
 * entao cada torre tem 4 estados finais sem precisar de 7 blocos de status
 * escritos a mao. Cada ramo aplica multiplicadores sobre a base.
 *
 * Fusao: duas torres nivel 3 adjacentes com receita valida viram uma torre
 * nova. A fusao ocupa a celula alvo e libera a outra -- o labirinto muda
 * junto, entao fundir tambem e uma decisao de terreno. */

const ROMANOS = ['I', 'II', 'III', 'IV', 'V'];

function fusionKey(a, b) {
  return [a, b].sort().join('+');
}

/* Todas as receitas de que um tipo de torre participa, com o parceiro que
 * cada uma exige. A interface usa isto para dizer ao jogador o que combina
 * com a torre selecionada, em vez de so informar que nada combina. */
function fusionsFor(typeKey) {
  const out = [];
  for (const key of Object.keys(FUSIONS)) {
    const parts = key.split('+');
    const i = parts.indexOf(typeKey);
    if (i === -1) continue;
    out.push({ partner: parts[1 - i], def: FUSIONS[key] });
  }
  return out;
}

class Tower {
  constructor(typeKey, c, r, tile) {
    this.typeKey = typeKey;
    this.def = TOWER_TYPES[typeKey];
    this.fused = false;
    this.c = c;
    this.r = r;
    this.level = 0;
    this.path = [];              // chaves dos ramos escolhidos
    this.cooldown = 0;
    this.fullCooldown = 1;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.mudo = false;      // modo silencioso: mira, mas nao atira nem marca perigo
    this.aquecer = 0;       // atrito ao voltar a atirar
    this.invested = this.def.cost;
    this.x = (c + 0.5) * tile;
    this.y = (r + 0.5) * tile;
    this.destruida = false;
    this.golpe = 0;          // clarao de quando a torre apanha
    this.debuff = 0;         // maldicao: fracao a mais de recarga
    this.debuffTimer = 0;
    this.dominada = 0;       // s restantes virada contra as proprias vizinhas
    this.vitima = null;      // torre que ela esta demolindo
    // Obra: nao bloqueia o caminho nem atira ate terminar.
    this.obraTotal = CONFIG.obra ? CONFIG.obraBase + this.def.cost * CONFIG.obraPorOuro : 0;
    this.obra = this.obraTotal;
    this.refresh();
    this.hp = this.maxHp;
  }

  /* Recalcula os status a partir da base e dos ramos escolhidos.
   * Chamado so em upgrade/fusao -- o getter e lido todo quadro. */
  refresh() {
    const b = this.def.base;
    const m = { range: 1, damage: 1, fisico: 1, magico: 1, cooldown: 1,
                splash: 1, slow: 1, slowDur: 1, pierce: 0 };

    for (let i = 0; i < this.path.length; i++) {
      const branch = this.branchAt(i + 2, this.path[i]);
      if (!branch) continue;
      for (const key of Object.keys(branch.mods)) {
        if (key === 'pierce') m.pierce += branch.mods.pierce;
        else m[key] *= branch.mods[key];
      }
    }

    this._stats = {
      range: b.range * m.range,
      cooldown: Math.max(0.08, b.cooldown * m.cooldown),
      projSpeed: b.projSpeed,
      dmg: {
        fisico: b.dmg.fisico * m.damage * m.fisico,
        magico: b.dmg.magico * m.damage * m.magico
      },
      splash: b.splash ? b.splash * m.splash : 0,
      slow: b.slow ? Math.min(0.9, b.slow * m.slow) : 0,
      slowDur: b.slowDur ? b.slowDur * m.slowDur : 0,
      pierce: (b.pierce || 0) + m.pierce
    };

    /* Traco da fusao. Os dois que sao puro numero entram aqui, no bloco de
     * status, para que TUDO que le stats -- inspetor, dps, projetil -- veja
     * o mesmo valor. Os outros tres sao comportamento de impacto e vivem no
     * projetil; aqui so viaja a etiqueta. */
    this._stats.traco = this.def.traco || null;
    const tr = this._stats.traco ? TRACOS[this._stats.traco] : null;
    if (tr && tr.slowMul && this._stats.slow) {
      this._stats.slow = Math.min(0.92, this._stats.slow * tr.slowMul);
      this._stats.slowDur *= tr.slowDurMul;
    }
    if (tr && tr.pierceExtra) {
      this._stats.pierce += tr.pierceExtra;
    }
  }

  get stats() { return this._stats; }

  /* Obra maior para quem alonga mais a rota. Chamado uma vez, na construcao. */
  alongarObra(passos) {
    this.obraTotal += passos * CONFIG.obraPorPasso;
    this.obra = this.obraTotal;
  }

  /* Maldicao do Necromante: alonga a recarga por um tempo.
   *
   * Nao zera o tiro de proposito. Torre muda nao da retorno nenhum ao
   * jogador -- ele so ve a onda passar e nao sabe por que. Atirando devagar,
   * o anel roxo e o ritmo quebrado dizem que ALGUMA coisa esta errada ali, e
   * o jogador tem o que investigar. */
  amaldicoar(forca, duracao) {
    if (forca >= this.debuff) { this.debuff = forca; this.debuffTimer = duracao; }
    else this.debuffTimer = Math.max(this.debuffTimer, duracao * 0.5);
  }

  /* Dominio do Chefe: a torre para de defender e demole a vizinha mais
   * fragil. Nao e "torre desligada" -- e torre trabalhando contra voce, que
   * e uma perda dupla e, principalmente, VISIVEL: o feixe vermelho entre as
   * duas diz o que esta acontecendo sem precisar de texto. */
  dominar(duracao) {
    this.dominada = Math.max(this.dominada, duracao);
  }

  get pronta() { return this.obra <= 0; }
  get obraFrac() { return this.obraTotal > 0 ? 1 - this.obra / this.obraTotal : 1; }

  /* Vida sai do investimento: o tijolo de 50 de ouro e frageis de proposito, e
   * a torre que voce evoluiu aguenta. Nao existe "parede de graca". */
  get maxHp() { return Math.round(CONFIG.vidaBase + this.invested * CONFIG.vidaPorOuro); }

  get ferida() { return this.hp < this.maxHp; }

  get custoReparo() { return Math.ceil((this.maxHp - this.hp) * CONFIG.reparoCusto); }

  /* Devolve true se a torre caiu. */
  apanhar(dano) {
    this.hp -= dano;
    this.golpe = 0.18;
    if (this.hp <= 0) { this.hp = 0; this.destruida = true; }
    return this.destruida;
  }

  reparar(fracao) {
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fracao);
  }

  branchAt(level, key) {
    if (!this.def.upgrades || !this.def.upgrades[level]) return null;
    for (const b of this.def.upgrades[level]) if (b.key === key) return b;
    return null;
  }

  /* Os ramos oferecidos no proximo nivel, ou [] se nao ha proximo.
   * Torre base: dois ramos, ate o nivel 3. Fusao: tres ramos, ate o nivel 4. */
  get nextBranches() {
    if (!this.def.upgrades) return [];
    return this.def.upgrades[this.level + 2] || [];
  }

  get maxLevel() { return this.nextBranches.length === 0; }

  get sellValue() { return Math.floor(this.invested * CONFIG.sellRate); }

  get label() {
    // Numeral romano de verdade: a fusao chega ao nivel 4, e 'IIII' nao e um.
    return this.def.name + (this.level > 0 ? ' ' + ROMANOS[this.level] : '');
  }

  upgrade(branchKey) {
    const branch = this.branchAt(this.level + 2, branchKey);
    if (!branch) return false;
    const antes = this.maxHp;
    this.invested += branch.cost;
    this.path.push(branchKey);
    this.level += 1;
    this.refresh();
    // Evoluir aumenta a vida maxima e entrega a diferenca: a torre nova nao
    // nasce ferida so porque a antiga tinha apanhado.
    this.hp += this.maxHp - antes;
    return true;
  }

  /* Vira a torre fundida indicada, absorvendo o investimento da outra. */
  becomeFusion(key, other) {
    this.typeKey = key;
    this.def = FUSIONS[key];
    this.fused = true;
    this.level = 0;
    this.path = [];
    this.invested += other.invested;
    this.cooldown = 0;
    this.refresh();
    this.hp = this.maxHp;
  }

  /* Mira no inimigo mais adiantado dentro do alcance: o mais perto de vazar. */
  pickTarget(enemies) {
    const range = this.stats.range;
    let best = null;
    let bestProgress = Number.MAX_SAFE_INTEGER;

    for (const e of enemies) {
      if (e.dead || e.escaped) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > range + e.radius) continue;

      // 'best === null' nao e redundancia: quem esta numa celula sem rota
      // devolve MAX_SAFE_INTEGER, e com so o '<' ele nunca era escolhido --
      // ficava imune por acidente. Agora vira alvo de ultimo caso.
      const p = e.progress();
      if (best === null || p < bestProgress) { bestProgress = p; best = e; }
    }
    return best;
  }

  /* Escolhe a vizinha mais FRACA de vida dentro do alcance e bate nela.
   *
   * Mais fraca, nao mais forte: assim o Dominio derruba a parede barata e
   * abre um buraco no labirinto -- que e a ameaca interessante -- em vez de
   * apagar a torre cara do jogador, que seria so perda seca.
   *
   * Sem projetil: o dano e continuo e o feixe conta a historia. Um projetil
   * por quadro contra uma torre parada a um tile de distancia seria custo
   * sem leitura. */
  demolir(dt, game) {
    if (!game) return;

    if (!this.vitima || this.vitima.destruida ||
        Math.hypot(this.vitima.x - this.x, this.vitima.y - this.y) > this.stats.range) {
      let alvo = null, menor = Infinity;
      for (const t of game.towers) {
        if (t === this || t.destruida || !t.pronta) continue;
        if (Math.hypot(t.x - this.x, t.y - this.y) > this.stats.range) continue;
        if (t.hp < menor) { menor = t.hp; alvo = t; }
      }
      this.vitima = alvo;
    }
    if (!this.vitima) return;

    this.angle = Math.atan2(this.vitima.y - this.y, this.vitima.x - this.x);
    game.torreApanha(this.vitima, Damage.dps(this.stats) * HABILIDADES.dominar.dano * dt, null);
  }

  update(dt, enemies, projectiles, rateBonus, mods, game) {
    if (!this.pronta) return;   // em obra: nao mira, nao atira
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.debuffTimer > 0) {
      this.debuffTimer -= dt;
      if (this.debuffTimer <= 0) this.debuff = 0;
    }
    if (this.dominada > 0) {
      this.dominada -= dt;
      if (this.dominada <= 0) { this.dominada = 0; this.vitima = null; }
      else return this.demolir(dt, game);
    }
    if (this.aquecer > 0) this.aquecer -= dt;
    if (this.recoil > 0) this.recoil -= dt * 5;
    if (this.golpe > 0) this.golpe -= dt;

    const target = this.pickTarget(enemies);
    if (!target) return;

    // A torre gira em direcao ao alvo mesmo sem poder atirar.
    this.angle = Math.atan2(target.y - this.y, target.x - this.x);

    // Silenciosa continua mirando -- so nao dispara. Sem tiro nao ha dano,
    // sem dano nao ha perigo, e a rota passa por cima dela sem desconfiar.
    if (this.mudo || this.aquecer > 0) return;
    if (this.cooldown > 0) return;

    this.cooldown = this.stats.cooldown * (1 + this.debuff) / (1 + (rateBonus || 0));
    this.fullCooldown = this.cooldown;   // o sprite lê a recarga para escolher o quadro
    this.recoil = 1;

    const reach = CONFIG.tile * 0.34;
    const mx = this.x + Math.cos(this.angle) * reach;
    const my = this.y + Math.sin(this.angle) * reach;
    if (game) game.muzzle(mx, my, this.angle, this.def.color);

    projectiles.push(new Projectile(mx, my, target, this.stats, this.def.color, mods));
  }
}
