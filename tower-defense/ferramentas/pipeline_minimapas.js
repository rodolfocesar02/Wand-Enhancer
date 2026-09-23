/* Miniaturas dos mapas: renderizadas do PROPRIO tabuleiro, nao pintadas.
 *
 * Uma ilustracao bonita de "ruinas" nao diz onde ficam os pilares. O render
 * do tabuleiro vazio diz: o jogador ve a entrada, a saida e o formato exato
 * das pedras que vai ter que contornar. E de graca -- a arte ja existe.
 */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('file:///home/user/Wand-Enhancer/tower-defense/index.html');
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const res = {};
    const cv = document.getElementById('canvas');
    const ctx = cv.getContext('2d');
    for (const mapa of MAPS) {
      const g = new Game(); g.startRun(mapa.id);
      g.enemies = []; g.effects = []; g.floaters = []; g.hoverCell = null;
      Trail.reset();
      Renderer.draw(g);
      // so o tabuleiro, sem a faixa de magias
      const rec = document.createElement('canvas');
      rec.width = CONFIG.boardW; rec.height = CONFIG.boardH;
      rec.getContext('2d').drawImage(cv, 0, 0, CONFIG.boardW, CONFIG.boardH,
                                         0, 0, CONFIG.boardW, CONFIG.boardH);
      res[mapa.id] = rec.toDataURL('image/png');
    }
    return res;
  });

  const tmp = '/tmp/mini';
  fs.mkdirSync(tmp, { recursive: true });
  for (const id of Object.keys(out)) {
    fs.writeFileSync(tmp + '/' + id + '.png', Buffer.from(out[id].split(',')[1], 'base64'));
  }
  console.log('renderizados:', Object.keys(out).join(', '), '| erros:', errs.length);
  await b.close();
})();
