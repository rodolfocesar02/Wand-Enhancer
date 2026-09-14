'use strict';

/* Mapas. Cada um define entrada, saida e paredes de terreno (celulas onde
 * nao da para construir nem andar). Mudar entrada/saida muda completamente
 * a estrategia de labirinto, entao isto e conteudo real e nao enfeite. */

const MAPS = [
  {
    id: 'planicie',
    name: 'Planície',
    desc: 'Campo aberto de ponta a ponta. Labirinto livre.',
    spawn: { c: 0, r: 6 },
    exit: { c: 19, r: 6 },
    walls: []
  },
  {
    id: 'desfiladeiro',
    name: 'Desfiladeiro',
    desc: 'Duas gargantas de rocha estreitam o meio do mapa.',
    spawn: { c: 0, r: 1 },
    exit: { c: 19, r: 10 },
    walls: [
      [6, 0], [6, 1], [6, 2], [6, 3],
      [6, 8], [6, 9], [6, 10], [6, 11],
      [13, 0], [13, 1], [13, 2], [13, 3],
      [13, 8], [13, 9], [13, 10], [13, 11]
    ]
  },
  {
    id: 'ruinas',
    name: 'Ruínas',
    desc: 'Pilares espalhados quebram qualquer corredor reto.',
    spawn: { c: 0, r: 0 },
    exit: { c: 19, r: 11 },
    walls: [
      [3, 3], [4, 3], [3, 4],
      [8, 1], [9, 1], [9, 2],
      [8, 9], [9, 9], [9, 10],
      [14, 4], [15, 4], [15, 5],
      [5, 7], [6, 7], [16, 8], [16, 9],
      [11, 5], [11, 6]
    ]
  }
];

function getMap(id) {
  for (const m of MAPS) if (m.id === id) return m;
  return MAPS[0];
}
