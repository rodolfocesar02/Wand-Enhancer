'use strict';

/* Gerador de ondas infinitas.
 *
 * A composicao muda de fase conforme a onda avanca e a vida escala
 * exponencialmente, entao o jogo nunca "acaba" - ele aperta ate voce perder.
 */

const Waves = {
  hpMultiplier(wave) {
    return Math.pow(1.155, wave - 1);
  },

  /* Devolve a fila de spawns da onda: [{ type, delay }] em ordem. */
  build(wave) {
    const queue = [];
    const push = (type, count, gap) => {
      for (let i = 0; i < count; i++) queue.push({ type: type, delay: gap });
    };

    if (wave % 10 === 0) {
      push('boss', 1 + Math.floor(wave / 20), 2.2);
      push('tank', 2 + Math.floor(wave / 6), 0.9);
      push('runner', 4 + Math.floor(wave / 5), 0.35);
      return queue;
    }

    const grunts = 5 + Math.floor(wave * 1.35);
    push('grunt', grunts, Math.max(0.28, 0.72 - wave * 0.02));

    if (wave >= 3) {
      push('runner', 2 + Math.floor(wave * 0.6), Math.max(0.2, 0.5 - wave * 0.012));
    }
    if (wave >= 6) {
      push('tank', 1 + Math.floor((wave - 5) * 0.45), 1.05);
    }
    return queue;
  },

  reward(wave) {
    return 22 + wave * 5;
  }
};
