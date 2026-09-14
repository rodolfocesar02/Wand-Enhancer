'use strict';

/* Constantes de mundo, torres, inimigos, magias e meta-progressao.
 * Tudo que o jogo balanceia mora aqui. */

const CONFIG = {
  /* Célula de 64px em vez de 48. A 48px os três quadros do sprite da Balista
   * ficam indistinguíveis; a 64 com 12% de transbordo eles se separam. O custo
   * é real: o tabuleiro cai de 240 para 126 células, então o labirinto fica
   * mais curto e o balanceamento foi remedido por simulação. */
  tile: 64,
  cols: 14,
  rows: 9,
  startGold: 170,
  startLives: 20,
  wavesPerRun: 25,
  sellRate: 0.7,
  earlyCallBonus: 2,
  wavePause: 7,
  speeds: [1, 2, 3]
};

/* O canvas é mais alto que o tabuleiro: a faixa de baixo carrega as magias,
 * desenhadas dentro do próprio canvas para ficarem a um toque de distância
 * sem roubar espaço da área de jogo. */
CONFIG.boardW = CONFIG.cols * CONFIG.tile;
CONFIG.boardH = CONFIG.rows * CONFIG.tile;
CONFIG.strip = 82;
CONFIG.width = CONFIG.boardW;
CONFIG.height = CONFIG.boardH + CONFIG.strip;

/* Quanto o sprite de uma torre transborda a célula. Torres vistas de cima
 * podem invadir um pouco a vizinha -- isso adensa o tabuleiro e dá ao sprite
 * os pixels que ele precisa. */
CONFIG.spriteOverflow = 1.12;

/* ---------------------------------------------------------------- dano ---- */

/* Duas escolas de dano. Resistencia e reducao percentual, entao um inimigo
 * com 0.6 de armadura recebe 40% do dano fisico. Nenhuma resistencia chega a
 * 1.0: torre errada sempre faz alguma coisa, so faz pouco. */
const DAMAGE = { FISICO: 'fisico', MAGICO: 'magico' };

const DAMAGE_META = {
  fisico: { label: 'Físico', color: '#fbbf24' },
  magico: { label: 'Mágico', color: '#c084fc' }
};

/* ------------------------------------------------------------- torres ---- */

/* Cada torre tem stats base + dois ramos de evolucao (nivel 2 e nivel 3).
 * Escolher um ramo aplica multiplicadores sobre a base, entao cada torre tem
 * 4 estados finais distintos sem precisar escrever 7 blocos de status a mao.
 *
 * Chaves de mods: range, damage (ambas escolas), fisico, magico, cooldown
 * (multiplicador, <1 = mais rapido), splash, slow, slowDur, pierce (aditivo).
 *
 * Eixo de design: quanto mais curto o alcance, maior o DPS bruto.
 *
 *   Bombarda  92 / 32 DPS
 *   Templo   120 / 27 DPS
 *   Altar    128 / 24 DPS
 *   Arqueira 135 / 22 DPS
 *   Balista  200 / 20 DPS
 *
 * O Vortice Glacial (96 / 10 DPS) e a unica excecao, e e deliberada: ele nao
 * paga em dano, paga em lentidao. Quem mede o Glacial pelo DPS dele esta
 * medindo a coisa errada -- o valor dele e o DPS que ele adiciona as vizinhas. */
const TOWER_TYPES = {
  arqueira: {
    name: 'Arqueira',
    blurb: 'Físico — longo alcance, tiro rápido',
    color: '#4ade80',
    shape: 'arqueira',
    cost: 50,
    starter: true,
    base: { range: 135, cooldown: 0.50, projSpeed: 560, dmg: { fisico: 11, magico: 0 } },
    upgrades: {
      2: [
        { key: 'vista',  name: 'Olho de Falcão', desc: '+30% alcance, +25% dano', cost: 55,
          mods: { range: 1.30, damage: 1.25 } },
        { key: 'ponta',  name: 'Ponta Perfurante', desc: '+85% dano físico',      cost: 55,
          mods: { fisico: 1.85 } }
      ],
      3: [
        { key: 'rajada', name: 'Rajada',   desc: '-35% recarga',                  cost: 125,
          mods: { cooldown: 0.65 } },
        { key: 'aljava', name: 'Aljava Farpada', desc: '+90% dano, +10% alcance', cost: 125,
          mods: { damage: 1.90, range: 1.10 } }
      ]
    }
  },

  glacial: {
    name: 'Vórtice Glacial',
    blurb: 'Mágico — pouco dano, lentidão forte',
    color: '#38bdf8',
    shape: 'glacial',
    cost: 70,
    starter: true,
    base: { range: 96, cooldown: 0.70, projSpeed: 480, dmg: { fisico: 0, magico: 7 },
            slow: 0.42, slowDur: 1.8 },
    upgrades: {
      2: [
        { key: 'nevasca', name: 'Nevasca', desc: '+35% lentidão e duração', cost: 70,
          mods: { slow: 1.35, slowDur: 1.35 } },
        { key: 'estilhaco', name: 'Estilhaço', desc: '+120% dano mágico',   cost: 70,
          mods: { magico: 2.20 } }
      ],
      3: [
        { key: 'inverno', name: 'Inverno Eterno', desc: '+30% lentidão, +25% alcance', cost: 150,
          mods: { slow: 1.30, range: 1.25 } },
        { key: 'lasca',   name: 'Lasca Cortante', desc: '+130% dano, -20% recarga',    cost: 150,
          mods: { magico: 2.30, cooldown: 0.80 } }
      ]
    }
  },

  altar: {
    name: 'Altar Arcano',
    blurb: 'Mágico — dano constante, ignora armadura',
    color: '#c084fc',
    shape: 'altar',
    cost: 85,
    starter: true,
    base: { range: 128, cooldown: 0.62, projSpeed: 620, dmg: { fisico: 0, magico: 15 } },
    upgrades: {
      2: [
        { key: 'canal', name: 'Canalização', desc: '-30% recarga',           cost: 85,
          mods: { cooldown: 0.70 } },
        { key: 'foco',  name: 'Foco Arcano', desc: '+90% dano mágico',       cost: 85,
          mods: { magico: 1.90 } }
      ],
      3: [
        { key: 'torrente', name: 'Torrente', desc: '-30% recarga, +20% alcance', cost: 180,
          mods: { cooldown: 0.70, range: 1.20 } },
        { key: 'cataclismo', name: 'Cataclismo', desc: '+120% dano mágico',      cost: 180,
          mods: { magico: 2.20 } }
      ]
    }
  },

  bombarda: {
    name: 'Bombarda',
    blurb: 'Físico — curto alcance, dano em área',
    color: '#fb923c',
    shape: 'bombarda',
    cost: 100,
    base: { range: 92, cooldown: 1.25, projSpeed: 340, dmg: { fisico: 40, magico: 0 }, splash: 48 },
    upgrades: {
      2: [
        { key: 'barril', name: 'Barril Largo', desc: '+35% raio da área',    cost: 100,
          mods: { splash: 1.35, damage: 1.10 } },
        { key: 'polvora', name: 'Pólvora Densa', desc: '+80% dano físico',   cost: 100,
          mods: { fisico: 1.80 } }
      ],
      3: [
        { key: 'chuva', name: 'Chuva de Ferro', desc: '+30% área, -25% recarga', cost: 210,
          mods: { splash: 1.30, cooldown: 0.75 } },
        { key: 'nucleo', name: 'Núcleo Pesado', desc: '+110% dano, +15% alcance', cost: 210,
          mods: { fisico: 2.10, range: 1.15 } }
      ]
    }
  },

  templo: {
    name: 'Templo Rúnico',
    blurb: 'Híbrido — metade físico, metade mágico',
    color: '#f0abfc',
    shape: 'templo',
    cost: 120,
    base: { range: 120, cooldown: 0.75, projSpeed: 520, dmg: { fisico: 10, magico: 10 } },
    /* A torre da escolha: cada nivel decide de que lado o dano cresce.
     * Manter o equilibrio nunca e a opcao mais forte contra um alvo, mas e a
     * unica que nao afunda contra o afixo errado. */
    upgrades: {
      2: [
        { key: 'aco',  name: 'Voto de Aço',  desc: '+130% físico, -20% mágico', cost: 120,
          mods: { fisico: 2.30, magico: 0.80 } },
        { key: 'runa', name: 'Voto de Runa', desc: '+130% mágico, -20% físico', cost: 120,
          mods: { magico: 2.30, fisico: 0.80 } }
      ],
      3: [
        { key: 'equilibrio', name: 'Equilíbrio', desc: '+75% nos dois danos, +15% alcance', cost: 250,
          mods: { damage: 1.75, range: 1.15 } },
        { key: 'fervor',     name: 'Fervor',     desc: '-35% recarga',                      cost: 250,
          mods: { cooldown: 0.65 } }
      ]
    }
  },

  balista: {
    name: 'Balista',
    blurb: 'Físico — alcance enorme, perfura a fila',
    color: '#60a5fa',
    shape: 'balista',
    cost: 145,
    base: { range: 200, cooldown: 2.35, projSpeed: 780, dmg: { fisico: 48, magico: 0 }, pierce: 2 },
    upgrades: {
      2: [
        { key: 'mira',  name: 'Mira Longa', desc: '+25% alcance, +1 perfuração', cost: 145,
          mods: { range: 1.25, pierce: 1 } },
        { key: 'virote', name: 'Virote Maciço', desc: '+75% dano físico',        cost: 145,
          mods: { fisico: 1.75 } }
      ],
      3: [
        { key: 'lanca', name: 'Lança de Cerco', desc: '+2 perfuração, +20% dano', cost: 300,
          mods: { pierce: 2, fisico: 1.20 } },
        { key: 'guincho', name: 'Guincho Rápido', desc: '-40% recarga',           cost: 300,
          mods: { cooldown: 0.60 } }
      ]
    }
  }
};

/* ------------------------------------------------------------- fusoes ---- */

/* Receitas curadas: 6 das 15 combinacoes possiveis. Exigem duas torres nivel 3
 * adjacentes. A torre fundida ocupa a celula alvo e LIBERA a outra celula --
 * o labirinto muda, entao fundir e tambem uma decisao de terreno.
 *
 * Regra de balanceamento, medida e nao chutada: o DPS da torre fundida fica
 * entre 80% e 92% da SOMA das duas torres nivel 3 que ela consome. Nao pode
 * ser mais que isso, senao fundir vira obrigatorio e as 6 torres viram
 * decoracao; nao pode ser menos, senao fundir vira armadilha e a mecanica
 * inteira e codigo morto.
 *
 * A troca real e: o jogador perde um pouco de dano bruto e ganha (a) cobertura
 * contra os dois tipos de resistencia, (b) uma celula livre no labirinto e
 * (c) alcance ou area maior. Em compensacao concentra o investimento numa
 * celula so, que cobre uma faixa do mapa em vez de duas.
 *
 * As fusoes com area ou perfuracao ficam na ponta baixa da faixa porque o
 * raio e o alcance maiores ja valem por si. Ver scripts de medicao no README. */
const FUSIONS = {
  'altar+arqueira': {
    name: 'Arqueira Rúnica', color: '#86efac', shape: 'arqueira',
    blurb: 'Flechas híbridas em cadência alta',
    base: { range: 155, cooldown: 0.42, projSpeed: 620, dmg: { fisico: 34, magico: 34 } }
  },
  'balista+bombarda': {
    name: 'Morteiro Pesado', color: '#f97316', shape: 'bombarda',
    blurb: 'Área enorme com alcance de cerco',
    base: { range: 175, cooldown: 1.60, projSpeed: 420, dmg: { fisico: 237, magico: 0 }, splash: 82 }
  },
  'altar+glacial': {
    name: 'Prisma Congelante', color: '#7dd3fc', shape: 'glacial',
    blurb: 'Magia em área que congela o grupo inteiro',
    base: { range: 140, cooldown: 0.85, projSpeed: 540, dmg: { fisico: 0, magico: 112 },
            splash: 62, slow: 0.55, slowDur: 2.2 }
  },
  'bombarda+templo': {
    name: 'Forja de Guerra', color: '#fda4af', shape: 'templo',
    blurb: 'Explosão híbrida: nada resiste aos dois',
    base: { range: 132, cooldown: 1.05, projSpeed: 400, dmg: { fisico: 83, magico: 83 }, splash: 58 }
  },
  'altar+balista': {
    name: 'Lança Etérea', color: '#a5b4fc', shape: 'balista',
    blurb: 'Perfura a fila com dano mágico puro',
    base: { range: 230, cooldown: 1.90, projSpeed: 860, dmg: { fisico: 0, magico: 260 }, pierce: 5 }
  },
  'arqueira+glacial': {
    name: 'Caçadora de Gelo', color: '#67e8f9', shape: 'arqueira',
    blurb: 'Tiro rápido que mantém a onda inteira lenta',
    base: { range: 150, cooldown: 0.34, projSpeed: 640, dmg: { fisico: 28, magico: 14 },
            slow: 0.34, slowDur: 1.5 }
  }
};

/* ----------------------------------------------------------- inimigos ---- */

/* 5 silhuetas reaproveitadas. As variantes vem dos afixos, que trocam cor
 * E marcador de forma -- cor sozinha nao comunica resistencia rapido o
 * suficiente no meio de uma onda, e falha para quem tem daltonismo. */
const ENEMY_TYPES = {
  grunt:  { name: 'Grunt',  hp: 62,   speed: 56,  gold: 8,   radius: 11, shape: 'triangulo',
            color: '#e2e8f0', leak: 1 },
  veloz:  { name: 'Veloz',  hp: 42,   speed: 104, gold: 11,  radius: 9,  shape: 'losango',
            color: '#5eead4', leak: 1 },
  tanque: { name: 'Tanque', hp: 245,  speed: 34,  gold: 24,  radius: 15, shape: 'hexagono',
            color: '#818cf8', leak: 2 },
  bruxo:  { name: 'Bruxo',  hp: 120,  speed: 62,  gold: 18,  radius: 12, shape: 'estrela',
            color: '#f472b6', leak: 2 },
  chefe:  { name: 'Chefe',  hp: 1700, speed: 31,  gold: 170, radius: 22, shape: 'chefe',
            color: '#f43f5e', leak: 6 }
};

/* Afixo = cor + marcador + trade-off. Resistencia nunca passa de 0.65:
 * a torre errada sempre faz alguma coisa, so faz pouco. */
const AFFIXES = {
  comum: {
    name: '', color: null, marker: null,
    resist: { fisico: 0, magico: 0 }, hpMul: 1, speedMul: 1, goldMul: 1
  },
  blindado: {
    name: 'Blindado', color: '#94a3b8', marker: 'placas',
    desc: 'Resiste a dano físico. Mais lento.',
    resist: { fisico: 0.62, magico: 0 }, hpMul: 1.15, speedMul: 0.82, goldMul: 1.4
  },
  encantado: {
    name: 'Encantado', color: '#a78bfa', marker: 'halo',
    desc: 'Resiste a dano mágico. Mais lento.',
    resist: { fisico: 0, magico: 0.62 }, hpMul: 1.15, speedMul: 0.82, goldMul: 1.4
  },
  runico: {
    name: 'Rúnico', color: '#cbd5e1', marker: 'ambos',
    desc: 'Resiste aos dois. Bem mais lento e com menos vida.',
    resist: { fisico: 0.38, magico: 0.38 }, hpMul: 0.78, speedMul: 0.66, goldMul: 1.7
  },
  agil: {
    name: 'Ágil', color: '#fde047', marker: 'rastro',
    desc: 'Sem resistência. Muito mais rápido e frágil.',
    resist: { fisico: -0.15, magico: -0.15 }, hpMul: 0.72, speedMul: 1.55, goldMul: 1.25
  }
};

/* --------------------------------------------------------------- magias -- */

/* Habilidades ativas com recarga propria, utilizaveis durante a onda. */
const SPELLS = {
  meteoro: {
    name: 'Meteoro', hotkey: 'Q', cooldown: 26, targeted: true, color: '#fb7185',
    desc: 'Dano mágico pesado numa área do mapa.',
    radius: 96, damage: { fisico: 0, magico: 260 }
  },
  gelar: {
    name: 'Congelar', hotkey: 'W', cooldown: 42, targeted: false, color: '#38bdf8',
    desc: 'Congela todos os inimigos em campo.',
    slow: 0.92, duration: 2.8
  },
  furia: {
    name: 'Fúria', hotkey: 'E', cooldown: 36, targeted: false, color: '#f59e0b',
    desc: 'Todas as torres atiram 70% mais rápido por 9s.',
    rateBonus: 0.70, duration: 9
  },
  muralha: {
    name: 'Muralha', hotkey: 'R', cooldown: 30, targeted: true, color: '#a3e635',
    desc: 'Bloqueia uma célula por 11s e força os inimigos a desviar.',
    duration: 11
  }
};

const STARTER_SPELL = 'meteoro';
