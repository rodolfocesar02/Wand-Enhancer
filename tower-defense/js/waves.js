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

  /* Fila de spawns da onda: [{ type, affix, level, delay }] em ordem. */
  build(wave) {
    const level = this.levelFor(wave);
    const pool = this.affixPool(wave);
    const queue = [];
    let cursor = wave * 3; // semente deterministica: mesma onda, mesma mistura

    const push = (type, count, gap, forcedAffix) => {
      for (let i = 0; i < count; i++) {
        const affix = forcedAffix || pool[cursor++ % pool.length];
        queue.push({ type: type, affix: affix, level: level, delay: gap });
      }
    };

    if (this.isBossWave(wave)) {
      const bosses = wave === CONFIG.wavesPerRun ? 2 : 1;
      push('chefe', bosses, 2.4, wave >= 20 ? 'runico' : 'comum');
      push('tanque', 2 + Math.floor(wave / 6), 0.95);
      push('bruxo', 2 + Math.floor(wave / 8), 0.8);
      push('veloz', 5 + Math.floor(wave / 4), 0.32);
      return queue;
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
    return {
      boss: this.isBossWave(wave),
      level: this.levelFor(wave),
      affixes: seen.map(k => AFFIXES[k].name)
    };
  }
};
