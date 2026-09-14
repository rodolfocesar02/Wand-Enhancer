'use strict';

/* Resolucao de dano em duas escolas.
 *
 * Resistencia e reducao percentual e nunca chega a 1.0, entao a torre errada
 * sempre faz alguma coisa -- so faz pouco. Resistencia negativa (afixo Agil)
 * vira dano extra, o que da ao jogador uma razao para nao trocar a defesa
 * inteira toda vez que o afixo muda. */

const Damage = {
  /* packet: { fisico, magico }. Devolve o dano ja reduzido pelas resistencias. */
  resolve(enemy, packet, mods) {
    const fisicoMul = mods ? mods.fisicoMul : 1;
    const magicoMul = mods ? mods.magicoMul : 1;
    let total = 0;

    if (packet.fisico) {
      total += packet.fisico * fisicoMul * (1 - enemy.resist.fisico);
    }
    if (packet.magico) {
      total += packet.magico * magicoMul * (1 - enemy.resist.magico);
    }
    return Math.max(0, total);
  },

  /* Qual escola domina o pacote -- usado so para colorir numeros e projeteis. */
  dominant(packet) {
    if (!packet.magico) return DAMAGE.FISICO;
    if (!packet.fisico) return DAMAGE.MAGICO;
    return packet.fisico >= packet.magico ? DAMAGE.FISICO : DAMAGE.MAGICO;
  },

  isHybrid(packet) {
    return packet.fisico > 0 && packet.magico > 0;
  },

  /* DPS teorico de um bloco de status, para o inspetor. */
  dps(stats) {
    return (stats.dmg.fisico + stats.dmg.magico) / stats.cooldown;
  }
};
