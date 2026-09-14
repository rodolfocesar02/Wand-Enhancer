'use strict';

/* Meta-progressao: o que sobrevive entre partidas.
 *
 * Uma run tem 25 ondas. Terminando ou perdendo, o jogador leva XP para o menu
 * e gasta em desbloqueios permanentes. Persistencia em localStorage -- se o
 * navegador bloquear, o jogo continua funcionando, so nao guarda nada. */

const META_KEY = 'towerdefense.meta.v1';

const META_UPGRADES = [
  // --- torres ---
  { id: 'u_bombarda', group: 'Torres', name: 'Bombarda', cost: 45,
    desc: 'Libera a torre de área de curto alcance.', effect: { unlockTower: 'bombarda' } },
  { id: 'u_templo', group: 'Torres', name: 'Templo Rúnico', cost: 70,
    desc: 'Libera a torre híbrida que escolhe o lado do dano.', effect: { unlockTower: 'templo' } },
  { id: 'u_balista', group: 'Torres', name: 'Balista', cost: 95,
    desc: 'Libera a torre de alcance enorme que perfura a fila.', effect: { unlockTower: 'balista' } },

  // --- magias ---
  { id: 'u_gelar', group: 'Magias', name: 'Congelar', cost: 55,
    desc: 'Libera a magia que congela o campo inteiro.', effect: { unlockSpell: 'gelar' } },
  { id: 'u_furia', group: 'Magias', name: 'Fúria', cost: 75,
    desc: 'Libera a magia que acelera todas as torres.', effect: { unlockSpell: 'furia' } },
  { id: 'u_muralha', group: 'Magias', name: 'Muralha', cost: 90,
    desc: 'Libera a barreira temporária que reescreve o caminho.', effect: { unlockSpell: 'muralha' } },

  // --- fusoes ---
  { id: 'u_fusao', group: 'Fusões', name: 'Arte da Fusão', cost: 120,
    desc: 'Permite fundir duas torres nível 3 adjacentes numa torre nova.',
    effect: { unlockFusion: true } },

  // --- mapas ---
  { id: 'u_desfiladeiro', group: 'Mapas', name: 'Desfiladeiro', cost: 50,
    desc: 'Novo mapa: gargantas estreitas e entrada em diagonal.', effect: { unlockMap: 'desfiladeiro' } },
  { id: 'u_ruinas', group: 'Mapas', name: 'Ruínas', cost: 85,
    desc: 'Novo mapa: pilares espalhados, sem corredor reto.', effect: { unlockMap: 'ruinas' } },

  // --- melhorias graduais (compraveis varias vezes) ---
  { id: 'g_ouro', group: 'Reino', name: 'Cofres do Reino', cost: 20, growth: 1.7, max: 5,
    desc: '+30 de ouro inicial por nível.', effect: { startGold: 30 } },
  { id: 'g_vidas', group: 'Reino', name: 'Muralhas do Reino', cost: 25, growth: 1.8, max: 4,
    desc: '+4 vidas por nível.', effect: { startLives: 4 } },
  { id: 'g_fisico', group: 'Reino', name: 'Arsenal', cost: 35, growth: 1.8, max: 5,
    desc: '+8% de dano físico de todas as torres por nível.', effect: { fisicoMul: 0.08 } },
  { id: 'g_magico', group: 'Reino', name: 'Biblioteca', cost: 35, growth: 1.8, max: 5,
    desc: '+8% de dano mágico de todas as torres por nível.', effect: { magicoMul: 0.08 } },
  { id: 'g_recarga', group: 'Reino', name: 'Ritual Veloz', cost: 40, growth: 1.9, max: 4,
    desc: '-8% de recarga das magias por nível.', effect: { spellCdMul: 0.08 } }
];

const Meta = {
  state: null,

  load() {
    const fresh = { xp: 0, levels: {}, bestWave: 0, runs: 0, wins: 0 };
    try {
      const raw = localStorage.getItem(META_KEY);
      this.state = raw ? Object.assign(fresh, JSON.parse(raw)) : fresh;
    } catch (err) {
      // Navegador sem localStorage (modo privado, cookies bloqueados):
      // joga normalmente, so nao guarda progresso.
      this.state = fresh;
    }
    return this.state;
  },

  save() {
    try { localStorage.setItem(META_KEY, JSON.stringify(this.state)); } catch (err) { /* ignora */ }
  },

  reset() {
    this.state = { xp: 0, levels: {}, bestWave: 0, runs: 0, wins: 0 };
    this.save();
  },

  levelOf(id) { return this.state.levels[id] || 0; },

  def(id) {
    for (const u of META_UPGRADES) if (u.id === id) return u;
    return null;
  },

  maxLevel(def) { return def.max || 1; },

  costOf(def) {
    const lvl = this.levelOf(def.id);
    if (lvl >= this.maxLevel(def)) return null;
    return Math.round(def.cost * Math.pow(def.growth || 1, lvl));
  },

  canBuy(def) {
    const cost = this.costOf(def);
    return cost !== null && this.state.xp >= cost;
  },

  buy(id) {
    const def = this.def(id);
    if (!def || !this.canBuy(def)) return false;
    this.state.xp -= this.costOf(def);
    this.state.levels[id] = this.levelOf(id) + 1;
    this.save();
    return true;
  },

  /* Bonus agregados aplicados ao iniciar uma run. */
  bonuses() {
    const b = {
      startGold: CONFIG.startGold,
      startLives: CONFIG.startLives,
      fisicoMul: 1,
      magicoMul: 1,
      spellCdMul: 1,
      towers: [],
      spells: [STARTER_SPELL],
      maps: ['planicie'],
      fusion: false
    };

    for (const key of Object.keys(TOWER_TYPES)) {
      if (TOWER_TYPES[key].starter) b.towers.push(key);
    }

    for (const def of META_UPGRADES) {
      const lvl = this.levelOf(def.id);
      if (lvl === 0) continue;
      const e = def.effect;

      if (e.unlockTower && b.towers.indexOf(e.unlockTower) === -1) b.towers.push(e.unlockTower);
      if (e.unlockSpell && b.spells.indexOf(e.unlockSpell) === -1) b.spells.push(e.unlockSpell);
      if (e.unlockMap && b.maps.indexOf(e.unlockMap) === -1) b.maps.push(e.unlockMap);
      if (e.unlockFusion) b.fusion = true;
      if (e.startGold) b.startGold += e.startGold * lvl;
      if (e.startLives) b.startLives += e.startLives * lvl;
      if (e.fisicoMul) b.fisicoMul += e.fisicoMul * lvl;
      if (e.magicoMul) b.magicoMul += e.magicoMul * lvl;
      if (e.spellCdMul) b.spellCdMul -= e.spellCdMul * lvl;
    }

    b.spellCdMul = Math.max(0.5, b.spellCdMul);
    return b;
  },

  /* XP de uma run. Perder rende XP tambem, senao o jogador trava sem
   * conseguir comprar o que precisa para passar da parede em que morreu. */
  awardRun(wave, score, won) {
    const xp = Math.floor(score / 40) + wave * 3 + (won ? 80 : 0);
    this.state.xp += xp;
    this.state.runs += 1;
    if (won) this.state.wins += 1;
    if (wave > this.state.bestWave) this.state.bestWave = wave;
    this.save();
    return xp;
  }
};
