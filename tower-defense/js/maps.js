'use strict';

/* Mapas para o tabuleiro 14x9.
 *
 * Cada um define entrada, saída e paredes de terreno (células onde não dá
 * para construir nem andar). Mudar entrada e saída muda toda a estratégia de
 * labirinto, então isto é conteúdo, não enfeite. */

const MAPS = [
  {
    id: 'planicie',
    name: 'Planície',
    desc: 'Campo aberto de ponta a ponta. Labirinto livre.',
    spawn: { c: 0, r: 4 },
    exit: { c: 13, r: 4 },
    walls: []
  },
  {
    id: 'desfiladeiro',
    name: 'Desfiladeiro',
    desc: 'Duas gargantas de rocha estreitam o meio do mapa.',
    spawn: { c: 0, r: 1 },
    exit: { c: 13, r: 7 },
    walls: [
      [4, 0], [4, 1], [4, 2],
      [4, 6], [4, 7], [4, 8],
      [9, 0], [9, 1], [9, 2],
      [9, 6], [9, 7], [9, 8]
    ]
  },
  {
    id: 'ruinas',
    name: 'Ruínas',
    desc: 'Pilares espalhados quebram qualquer corredor reto.',
    spawn: { c: 0, r: 0 },
    exit: { c: 13, r: 8 },
    walls: [
      [3, 2], [3, 3],
      [6, 1], [7, 1],
      [6, 6], [6, 7],
      [10, 3], [10, 4],
      [4, 6], [9, 5], [11, 7]
    ]
  }
];

function getMap(id) {
  for (const m of MAPS) if (m.id === id) return m;
  return MAPS[0];
}
