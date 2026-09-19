'use strict';

/* Gerador das 25 ondas de uma run.
 *
 * A composicao e deterministica de proposito: o jogador aprende o que vem,
 * o balanceamento pode ser medido por simulacao e duas partidas no mesmo
 * mapa sao comparaveis. A variedade vem dos afixos, nao de aleatoriedade.
 *
 * Os afixos entram escalonados para que cada um seja uma licao isolada antes
 * de aparecer misturado:
 *   onda 4  - Agil     (rapido e fragil: ensina lentidao)
 *   onda 6  - Blindado (resiste a fisico: ensina que precisa de magia)
 *   onda 9  - Encantado(resiste a magico: ensina que precisa de fisico)
 *   onda 14 - Runico   (resiste aos dois: ensina dano hibrido) */

const Waves = {
  /* Nivel dos monstros da onda. Escala vida e ouro, nunca velocidade. */
  levelFor(wave) {
    return 1 + Math.floor((wave - 1) * 0.8);
  },

  affixPool(wave) {
    const pool = ['comum', 'comum'];
    if (wave >= 4) pool.push('agil');
    if (wave >= 6) pool.push('blindado');
    if (wave >= 9) pool.push('encantado');
    if (wave >= 14) pool.push('runico');
    if (wave >= 11) pool.push('blindado', 'encantado');
    return pool;
  },

  isBossWave(wave) {
    return wave === 10 || wave === 20 || wave === CONFIG.wavesPerRun;
  },

  /* Quem ocupa cada corrente a partir de qual onda.
   *
   * Esta e a decisao que fez o elenco caber sem refazer o balanceamento:
   * o bicho novo SUBSTITUI o antigo na corrente dele em vez de abrir uma
   * corrente propria. Uma corrente nova somaria vida em cima de uma onda ja
   * calibrada; a substituicao mantem as contagens de push() intactas e o
   * unico delta e os ~10% de vida base entre um degrau e o seguinte.
   *
   * O espacamento e o ponto todo: cara nova nas ondas 1, 3, 5, 6, 7, 8, 10,
   * 12, 14, 16, 18, 20, 21 e 25 -- nunca mais de tres ondas sem novidade
   * numa corrida de 25. */
  SUCESSORES: {
    grunt:  [[21, 'demonio'], [14, 'cavaleiro'], [5, 'carnical']],
    veloz:  [[8, 'aranha']],
    bruxo:  [[16, 'necromante'], [10, 'arqueiro']],
    tanque: [[18, 'golem'], [12, 'ogro']]
  },

  /* A lista de cada corrente esta em ordem decrescente de onda, entao o
   * primeiro que couber e o mais avancado. */
  tipoNaOnda(base, wave) {
    const lista = this.SUCESSORES[base];
    if (!lista) return base;
    for (const [desde, tipo] of lista) if (wave >= desde) return tipo;
    return base;
  },

  /* Fila de spawns da onda: [{ type, affix, level, delay }] em ordem. */
  build(wave) {
    const level = this.levelFor(wave);
    const pool = this.affixPool(wave);
    const queue = [];
    let cursor = wave * 3; // semente deterministica: mesma onda, mesma mistura

    const push = (type, count, gap, forcedAffix) => {
      const real = this.tipoNaOnda(type, wave);
      for (let i = 0; i < count; i++) {
        const affix = forcedAffix || pool[cursor++ % pool.length];
        queue.push({ type: real, affix: affix, level: level, delay: gap });
      }
    };

    /* A onda de chefe SOMA, nao substitui.
     *
     * Ela trocava a onda normal por uma composicao menor mais o chefe, e o
     * resultado era uma queda: medido, a onda 20 tinha 5% MENOS vida total que
     * a 19, e a 21 vinha 60% acima. O chefe era um alivio no meio da subida,
     * exatamente o contrario do que a palavra CHEFE promete no aviso. */
    const chefe = this.isBossWave(wave);

    if (chefe) {
      const quantos = wave === CONFIG.wavesPerRun ? 2 : 1;
      push('chefe', quantos, 2.4, wave >= 20 ? 'runico' : 'comum');
    }

    push('grunt', 5 + Math.floor(wave * 1.2), Math.max(0.3, 0.74 - wave * 0.016));

    if (wave >= 3) push('veloz', 2 + Math.floor(wave * 0.55), Math.max(0.22, 0.5 - wave * 0.01));
    if (wave >= 6) push('tanque', 1 + Math.floor((wave - 5) * 0.4), 1.05);
    if (wave >= 7) push('bruxo', 1 + Math.floor((wave - 6) * 0.35), 0.9);

    return queue;
  },

  reward(wave) {
    return 26 + wave * 6 + (this.isBossWave(wave) ? 70 : 0);
  },

  /* Resumo mostrado antes da onda comecar, para o jogador poder se preparar. */
  preview(wave) {
    const pool = this.affixPool(wave);
    const seen = [];
    for (const a of pool) {
      if (a !== 'comum' && seen.indexOf(a) === -1) seen.push(a);
    }
    // Quem ESTREIA nesta onda. O jogador so consegue se preparar para o
    // bicho novo se souber que ele vem -- e a estreia e o unico momento em
    // que a corrente muda de comportamento.
    const estreia = [];
    for (const base of Object.keys(this.SUCESSORES)) {
      for (const [desde, tipo] of this.SUCESSORES[base]) {
        if (desde === wave) estreia.push(ENEMY_TYPES[tipo].name);
      }
    }

    return {
      boss: this.isBossWave(wave),
      level: this.levelFor(wave),
      affixes: seen.map(k => AFFIXES[k].name),
      estreia: estreia
    };
  }
};
