'use strict';

/* Constantes de mundo e balanceamento. Tudo que o jogo ajusta mora aqui. */

const CONFIG = {
  tile: 48,
  cols: 20,
  rows: 12,
  startGold: 150,
  startLives: 20,
  spawn: { c: 0, r: 6 },
  exit: { c: 19, r: 6 },
  sellRate: 0.7,          // fracao do investido devolvida ao vender
  earlyCallBonus: 2,      // ouro por segundo restante ao chamar a onda antes da hora
  wavePause: 6,           // segundos de intervalo automatico entre ondas
  speeds: [1, 2, 3]
};

CONFIG.width = CONFIG.cols * CONFIG.tile;
CONFIG.height = CONFIG.rows * CONFIG.tile;

/* Cada torre tem 3 niveis. O nivel 0 e o custo de compra; os demais trazem upgradeCost. */
const TOWER_TYPES = {
  arrow: {
    name: 'Arqueira',
    blurb: 'Tiro rápido, alvo único',
    color: '#4ade80',
    cost: 50,
    levels: [
      { range: 112, damage: 12, cooldown: 0.50, projSpeed: 540 },
      { range: 132, damage: 21, cooldown: 0.40, projSpeed: 580, upgradeCost: 55 },
      { range: 154, damage: 36, cooldown: 0.31, projSpeed: 620, upgradeCost: 120 }
    ]
  },
  cannon: {
    name: 'Canhão',
    blurb: 'Dano em área, recarga lenta',
    color: '#fb923c',
    cost: 95,
    levels: [
      { range: 118, damage: 26, cooldown: 1.20, projSpeed: 330, splash: 46 },
      { range: 134, damage: 44, cooldown: 1.05, projSpeed: 350, splash: 56, upgradeCost: 100 },
      { range: 152, damage: 74, cooldown: 0.92, projSpeed: 370, splash: 68, upgradeCost: 210 }
    ]
  },
  frost: {
    name: 'Gelo',
    blurb: 'Congela e reduz velocidade',
    color: '#38bdf8',
    cost: 70,
    levels: [
      { range: 104, damage: 5, cooldown: 0.85, projSpeed: 470, slow: 0.40, slowDur: 1.6 },
      { range: 120, damage: 9, cooldown: 0.75, projSpeed: 500, slow: 0.52, slowDur: 2.0, upgradeCost: 75 },
      { range: 138, damage: 15, cooldown: 0.65, projSpeed: 530, slow: 0.64, slowDur: 2.4, upgradeCost: 160 }
    ]
  }
};

const ENEMY_TYPES = {
  grunt:  { name: 'Grunt',  hp: 60,   speed: 54, gold: 8,   radius: 11, color: '#e2e8f0', leak: 1 },
  runner: { name: 'Veloz',  hp: 40,   speed: 98, gold: 11,  radius: 9,  color: '#facc15', leak: 1 },
  tank:   { name: 'Tanque', hp: 230,  speed: 34, gold: 24,  radius: 15, color: '#a78bfa', leak: 2 },
  boss:   { name: 'Chefe',  hp: 1500, speed: 30, gold: 160, radius: 22, color: '#f43f5e', leak: 6 }
};
