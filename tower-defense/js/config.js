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
  speeds: [1, 2, 3],

  /* Medo: a rota deixa de ser a mais curta e passa a ser a mais barata, e o
   * custo sobe onde a defesa ja causou dano. Fica atras de uma chave porque a
   * mecanica muda o jogo inteiro e precisa poder ser comparada ligada e
   * desligada na mesma partida (tecla M, ou o botao no dock). */
  medo: true,

  /* Segundos em que a torre nao atira depois de sair do modo silencioso.
   * Sem esse atrito, calar e descalar seria escolha sem custo. */
  aquecimento: 0.8,

  /* Paciencia: o inimigo quebra a parede quando o labirinto passa do limite.
   *
   * Sem isto o zigue-zague e estrategia dominante e o resto do jogo e
   * decoracao -- medido: no mesmo nivel de desbloqueio a serpentina vence 6 de
   * 6 partidas com rota de 54 passos, enquanto o killbox de tabuleiro aberto
   * perde 6 de 6. E o jogador nem precisa evoluir as torres: 36 Arqueiras
   * nivel 1 usadas como tijolo valem mais que 8 torres nivel 3, porque cada
   * celula a mais multiplica o valor de TODAS as outras torres.
   *
   * Nenhuma mecanica de rota conserta isso. O medo decide por onde o inimigo
   * anda; a serpentina apaga a escolha. O preco tinha que cair sobre o
   * comprimento em si.
   *
   * vidaBase/vidaPorOuro: vida da torre a partir do que foi investido nela.
   * O tijolo barato e o elo fraco, de proposito -- e por isso que a "cerca"
   * vira um papel de verdade: parede precisa de vida, nao de dano.
   * reparoOnda: fracao da vida que volta em cada intervalo entre ondas. */
  medoPaciencia: true,
  vidaBase: 195,
  vidaPorOuro: 3.6,
  reparoOnda: 0.5,
  reparoCusto: 0.5,         // ouro por ponto de vida, no reparo manual

  /* Expoente com que o ataque CONTRA TORRES acompanha o nivel do inimigo.
   *
   * Era 1.0, ou seja o mesmo 1,145^nivel que escala a vida deles -- e a vida
   * da torre nao escala com nada, ela vem do ouro investido. Na onda 20 isso
   * dava um Tanque com 456 de dano por segundo contra uma torre de 375 de
   * vida: nenhuma parede sobrevivia e o jogo virava esteira de reconstrucao.
   *
   * Medido numa partida real: 86 torres destruidas em 12 ondas, 63% de tudo
   * que foi construido, 8.190 de ouro em parede contra 3.540 em evolucao e
   * ZERO em reparo -- o jogador nunca teve tempo de reparar porque a torre
   * morria antes. Com 0,35 o Tanque da onda 20 faz 120, e derrubar uma torre
   * passa a levar tres segundos em vez de menos de um. */
  ataqueEscala: 0.35,

  /* Obra: a torre nao nasce pronta.
   *
   * Enquanto esta em obra ela NAO BLOQUEIA e NAO ATIRA. Isso e o ponto: ate
   * agora o labirinto custava ouro mas nao custava tempo -- dava para montar
   * a serpentina inteira no intervalo entre ondas, sem pressao nenhuma. Com
   * obra, meio labirinto nao e meio labirinto: e labirinto nenhum, porque a
   * rota curta continua aberta enquanto a parede nao fecha.
   *
   * Nao bloquear e a parte que faz a mecanica existir. Se a torre bloqueasse
   * na hora e so demorasse a atirar, a serpentina apareceria instantanea e o
   * unico custo seria dano atrasado -- o inimigo andaria o caminho longo de
   * graca, que e o oposto do que se quer. */
  obra: true,
  obraBase: 2.2,
  obraPorOuro: 0.014,       // Arqueira ~2,9s; Balista ~4,2s

  /* Segundos de obra por PASSO que a torre acrescenta na rota.
   *
   * Aumentar o tempo de obra por igual e alavanca cega -- medido: a 2,5x o
   * jogo inteiro desaba (zigue-zague cai da onda 20 para a 6, killbox de 13,7
   * para 10,2), porque penaliza construir, e nao alongar. Este numero mira a
   * coisa certa: a torre que so acompanha a rota sai rapido, e o tijolo que
   * FECHA o caminho e obra grande. Num labirinto montado coluna por coluna,
   * quem paga caro e sempre a ultima peca -- a que fecha. */
  obraPorPasso: 0.85,

  /* Duracao MINIMA do quadro de tiro, em segundos.
   *
   * A janela era 30% da recarga, o que funciona para torre lenta e some para
   * torre rapida: a Balista de Repeticao recarrega em 0,62s, entao o quadro
   * de tiro durava 0,19s -- e a Arqueira Runica, 0,13s. Com um piso absoluto,
   * duas imagens bastam para o tiro gritar mesmo em cadencia alta. */
  lampejo: 0.17
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

/* As 15 combinacoes possiveis, todas. Exigem duas torres nivel 3
 * em QUALQUER lugar do tabuleiro -- a exigencia de adjacencia era minha e
 * estava errada. A torre fundida ocupa a celula alvo e LIBERA a outra celula,
 * entao o labirinto muda e fundir e tambem uma decisao de terreno.
 *
 * Regra de balanceamento, medida e nao chutada: o DPS da torre fundida fica
 * entre 80% e 92% da SOMA das duas torres nivel 3 que ela consome -- soma das
 * MELHORES pontas de evolucao de cada uma, nao da media delas. Contra a media
 * as razoes dao 1,07 a 1,38, o que parece violar a regra e nao viola: e o
 * denominador errado. As nove medem hoje 0,802 a 0,907. Nao pode
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
  },

  /* --- familia da Balista ------------------------------------------------
   *
   * A Balista participava de duas receitas so. Com a arte das cinco chegando,
   * ela vira o eixo do sistema de fusao: aparece em 5 das 9 receitas. Isso e
   * um desequilibrio de design assumido -- as outras torres aparecem em 2 ou
   * 3 -- e o contrapeso e que toda fusao da Balista fica na ponta BAIXA da
   * faixa de 80-92%, porque perfuracao e alcance longo ja valem por si.
   *
   * A curva alcance x DPS continua valendo entre elas: 215/101, 195/108,
   * 175/116. Mais perto, mais forte. */
  'balista+glacial': {
    name: 'Lança do Inverno', color: '#93c5fd', shape: 'balista',
    blurb: 'Perfura a fila e deixa todos lentos',
    base: { range: 215, cooldown: 1.78, projSpeed: 820, dmg: { fisico: 60, magico: 120 },
            pierce: 3, slow: 0.45, slowDur: 2.0 }
  },
  'balista+templo': {
    name: 'Balista Gêmea', color: '#c4b5fd', shape: 'balista',
    blurb: 'Dois virotes, um de cada escola',
    base: { range: 195, cooldown: 1.45, projSpeed: 880, dmg: { fisico: 78, magico: 78 },
            pierce: 3 }
  },
  'arqueira+balista': {
    name: 'Balista de Repetição', color: '#a3e635', shape: 'arqueira',
    blurb: 'Cadência de arqueira com virote de balista',
    base: { range: 175, cooldown: 0.62, projSpeed: 760, dmg: { fisico: 72, magico: 0 },
            pierce: 2 }
  },

  /* --- familia do Altar -------------------------------------------------
   *
   * O Altar ja participava de tres receitas; com a arte da familia dele
   * chegando, faltava so o par com a Bombarda. Este e o extremo curto da
   * curva: o menor alcance de todas as nove e, por isso, o maior DPS. */
  'altar+bombarda': {
    name: 'Canhão Rúnico', color: '#818cf8', shape: 'bombarda',
    blurb: 'Explosão puramente mágica, bem de perto',
    base: { range: 118, cooldown: 1.15, projSpeed: 380, dmg: { fisico: 0, magico: 210 },
            splash: 70 }
  },

  /* A arte desta chegou rotulada como Altar + Balista e eu engoli o rotulo.
   * Balista tem detalhes de MADEIRA; Templo tem pedra e cristal. Medido nos
   * sprites base: Balista 52% madeira e 0% cristal, Templo 19% madeira e 15%
   * cristal. O disco em questao deu 18% madeira e 30% cristal -- e Templo.
   *
   * Sem area e sem perfuracao de proposito: e a torre que so acerta, com as
   * duas escolas de dano, para o afixo nenhum resistir. */
  'altar+templo': {
    name: 'Oráculo Rúnico', color: '#c7d2fe', shape: 'templo',
    blurb: 'Dano híbrido constante, sem ponto fraco',
    base: { range: 165, cooldown: 0.98, projSpeed: 700, dmg: { fisico: 68, magico: 82 } }
  },

  /* O par de area e lentidao pelo lado FISICO. O Prisma Congelante
   * (altar+glacial) ja ocupa esse papel pelo lado magico, com 140 de alcance e
   * 132 de DPS; este fica mais perto e mais forte, como manda a curva. */
  'bombarda+glacial': {
    name: 'Bombarda Glacial', color: '#0ea5e9', shape: 'bombarda',
    blurb: 'Estilhaços de gelo em área, tudo sai lento',
    base: { range: 105, cooldown: 1.30, projSpeed: 360, dmg: { fisico: 120, magico: 75 },
            splash: 75, slow: 0.40, slowDur: 2.0 }
  },

  /* O irmao rapido do Morteiro Pesado: area menor, cadencia quase tres vezes
   * maior. A Arqueira entra com o ritmo, a Bombarda com o estouro. */
  'arqueira+bombarda': {
    name: 'Morteiro Ligeiro', color: '#bef264', shape: 'bombarda',
    blurb: 'Estouros pequenos e seguidos, sem pausa',
    base: { range: 138, cooldown: 0.70, projSpeed: 480, dmg: { fisico: 114, magico: 0 },
            splash: 50 }
  },

  /* A decima quinta. Hibrida de alcance longo, sem area: e a torre que acerta
   * de longe e nao tem afixo que a segure. A perfuracao 1 e um aceno a besta
   * da arte, nao a identidade dela -- perfurar de verdade e da Balista. */
  'arqueira+templo': {
    name: 'Sentinela Rúnica', color: '#e9d5ff', shape: 'arqueira',
    blurb: 'Precisão híbrida de longe, atravessa um alvo',
    base: { range: 170, cooldown: 0.89, projSpeed: 720, dmg: { fisico: 55, magico: 55 },
            pierce: 1 }
  },

  /* A decima quinta e ultima: fecha as 15 combinacoes possiveis.
   *
   * Lentidao forte SEM area, para nao repetir o Prisma Congelante, que ja faz
   * area com lentidao pelo lado magico. Esta e alvo unico, hibrida, e segura
   * um inimigo de cada vez por muito tempo. */
  'glacial+templo': {
    name: 'Estela Glacial', color: '#a5f3fc', shape: 'templo',
    blurb: 'Congela um alvo por vez, com as duas escolas',
    base: { range: 155, cooldown: 1.04, projSpeed: 560, dmg: { fisico: 45, magico: 70 },
            slow: 0.50, slowDur: 2.4 }
  }
};


/* ---------------------------------------------- evolucao das fusoes ------
 *
 * A fusao deixou de ser ponto final. Ela sobe ate o nivel 4, com TRES opcoes
 * por nivel em vez das duas das torres base -- mais escolha justamente onde o
 * jogador ja investiu mais.
 *
 * Os 135 ramos (15 fusoes x 3 niveis x 3 opcoes) sao GERADOS, nao escritos.
 * Escrever a mao seria 135 blocos de status para manter em sincronia, e o bug
 * das fusoes originais (seis receitas entregando 33% a 69% do que consumiam)
 * nasceu exatamente de numero escrito a mao sem medicao.
 *
 * Duas das tres opcoes sao sempre as mesmas -- potencia e alcance, os dois
 * eixos que toda torre tem. A terceira sai do que a fusao E: quem tem area
 * ganha area, quem tem lentidao ganha lentidao, quem perfura ganha perfuracao,
 * e quem nao tem nada disso ganha cadencia. Assim a escolha do terceiro ramo
 * fala da torre, e nao de uma lista generica.
 *
 * O custo sai da soma das duas torres de origem, entao fusao cara sobe caro. */
const FUSAO_ESCADA = { 2: 1.15, 3: 2.00, 4: 3.40 };

function ramoEspecial(def, nivel) {
  const b = def.base;
  if (b.splash) {
    return nivel === 2
      ? { key: 'estilhaco', name: 'Estilhaço Amplo', desc: '+40% área, +10% dano',
          mods: { splash: 1.40, damage: 1.10 } }
      : { key: 'onda', name: 'Onda de Choque', desc: '+35% área, -15% recarga',
          mods: { splash: 1.35, cooldown: 0.85 } };
  }
  if (b.slow) {
    return nivel === 2
      ? { key: 'frio', name: 'Frio Profundo', desc: '+30% lentidão e duração',
          mods: { slow: 1.30, slowDur: 1.35 } }
      : { key: 'nevasca', name: 'Nevasca', desc: '+25% lentidão, +20% dano',
          mods: { slow: 1.25, slowDur: 1.30, damage: 1.20 } };
  }
  if (b.pierce) {
    return nivel === 2
      ? { key: 'ponta', name: 'Ponta Afiada', desc: '+2 perfuração, +10% dano',
          mods: { pierce: 2, damage: 1.10 } }
      : { key: 'transpasse', name: 'Transpasse', desc: '+3 perfuração, +20% dano',
          mods: { pierce: 3, damage: 1.20 } };
  }
  return nivel === 2
    ? { key: 'cadencia', name: 'Cadência', desc: '-28% recarga',
        mods: { cooldown: 0.72 } }
    : { key: 'rajada', name: 'Rajada', desc: '-32% recarga',
        mods: { cooldown: 0.68 } };
}

function montaEvolucaoDasFusoes() {
  for (const chave of Object.keys(FUSIONS)) {
    const def = FUSIONS[chave];
    const partes = chave.split('+');
    const custoBase = TOWER_TYPES[partes[0]].cost + TOWER_TYPES[partes[1]].cost;
    const preco = n => Math.round(custoBase * FUSAO_ESCADA[n] / 5) * 5;

    def.upgrades = {
      2: [
        { key: 'potencia', name: 'Potência', desc: '+50% dano', cost: preco(2),
          mods: { damage: 1.50 } },
        { key: 'alcance', name: 'Alcance Estendido', desc: '+25% alcance, +10% dano',
          cost: preco(2), mods: { range: 1.25, damage: 1.10 } },
        Object.assign({ cost: preco(2) }, ramoEspecial(def, 2))
      ],
      3: [
        { key: 'fulgor', name: 'Fulgor', desc: '+65% dano', cost: preco(3),
          mods: { damage: 1.65 } },
        { key: 'precisao', name: 'Precisão', desc: '+18% alcance, +35% dano',
          cost: preco(3), mods: { range: 1.18, damage: 1.35 } },
        Object.assign({ cost: preco(3) }, ramoEspecial(def, 3))
      ],
      4: [
        { key: 'maestria', name: 'Maestria', desc: '+85% dano', cost: preco(4),
          mods: { damage: 1.85 } },
        { key: 'dominio', name: 'Domínio', desc: '+30% alcance, +45% dano',
          cost: preco(4), mods: { range: 1.30, damage: 1.45 } },
        { key: 'frenesi', name: 'Frenesi', desc: '-42% recarga', cost: preco(4),
          mods: { cooldown: 0.58 } }
      ]
    };
  }
}
montaEvolucaoDasFusoes();

/* ----------------------------------------------------------- inimigos ---- */

/* 5 silhuetas reaproveitadas. As variantes vem dos afixos, que trocam cor
 * E marcador de forma -- cor sozinha nao comunica resistencia rapido o
 * suficiente no meio de uma onda, e falha para quem tem daltonismo. */
/* Os raios foram calibrados quando a celula tinha 48px e reescalados por
 * 64/48 quando ela cresceu, para o inimigo manter a mesma proporcao do
 * tabuleiro -- sem isso os sprites nao teriam pixels para existir. */
/* medo: classe de sensibilidade ao campo de perigo (ver perigo.js).
 * E o que faz duas rotas aparecerem na mesma onda -- o Tanque corta reto pelo
 * corredor da morte enquanto o Bruxo contorna o mapa. Sem essa diferenca o
 * medo seria so um caminho novo, igual para todo mundo. */
/* paciencia: quantas vezes a rota pode ser mais longa que a viagem direta
 * antes deste inimigo parar de andar e atacar a parede. ataque: dano por
 * segundo contra torres.
 *
 * Nao e todo mundo que quebra, e isso e o ponto. O lixo da onda continua
 * fazendo o percurso inteiro -- o labirinto funciona contra ele. Quem cobra
 * o preco do comprimento e o Tanque e o Chefe, que tem musculo para isso.
 * O resultado legivel: sua serpentina segura as ondas comuns e apanha nas
 * ondas de Tanque. Ela deixa de ser construcao definitiva e vira uma coisa
 * que voce mantem.
 *
 * Os numeros sao medidos, nao escolhidos. Na primeira calibragem o Tanque
 * tinha paciencia 1.8 e o zigue-zague despencava da onda 25 para a 10 --
 * ficava PIOR que nao fazer labirinto, o que so inverte a dominancia em vez
 * de equilibrar. Com o dobro disso a serpentina chega inteira (54 passos) e
 * vai ate a onda 21 sem vencer, continuando a melhor estrategia do jogo sem
 * ser a unica. */
const ENEMY_TYPES = {
  grunt:  { name: 'Grunt',  hp: 62,   speed: 56,  gold: 8,   radius: 15, shape: 'triangulo',
            color: '#e2e8f0', leak: 1, medo: 'normal',    paciencia: 6.8, ataque: 10 },
  veloz:  { name: 'Veloz',  hp: 42,   speed: 104, gold: 11,  radius: 12, shape: 'losango',
            color: '#5eead4', leak: 1, medo: 'afoito',    paciencia: 9.0, ataque: 5 },
  tanque: { name: 'Tanque', hp: 245,  speed: 34,  gold: 24,  radius: 20, shape: 'hexagono',
            color: '#818cf8', leak: 2, medo: 'afoito',    paciencia: 3.6, ataque: 60 },
  bruxo:  { name: 'Bruxo',  hp: 120,  speed: 62,  gold: 18,  radius: 16, shape: 'estrela',
            color: '#f472b6', leak: 2, medo: 'cauteloso', paciencia: 5.6, ataque: 22,
            habilidade: 'pressa' },
  chefe:  { name: 'Chefe',  hp: 1700, speed: 31,  gold: 170, radius: 29, shape: 'chefe',
            color: '#f43f5e', leak: 6, medo: 'cauteloso', paciencia: 3.0, ataque: 170 },

  /* --------------------------------------------------------- sucessores --
   *
   * Cinco tipos com variacao de COR em 25 ondas nao e elenco, e papel de
   * parede: o jogador ve o mesmo bicho a partida inteira. Estes oito nao
   * SOMAM correntes novas -- cada um ASSUME a corrente de um dos cinco a
   * partir de uma onda (ver Waves.SUCESSORES). Somar correntes teria
   * inflado a vida por onda e jogado fora todo o balanceamento medido; o
   * jogador ganha uma cara nova a cada duas ondas e a curva nao se mexe.
   *
   * VIDA, OURO e LEAK sao identicos ao antecessor, de proposito.
   *
   * Duas tentativas antes desta erraram na mesma direcao. Com +10% de vida
   * por degrau a onda 21 subiu 25% e a corrida de referencia sem meta caiu
   * de 21 para 18 ondas; com +4% ainda subia 10% e caiu para 19. O degrau
   * COMPOE ao longo da corrente, e a corrente do Grunt e a mais numerosa
   * (5 + onda*1,2 chega a 35 bichos), entao um "so 10%" por bicho vira um
   * salto na onda inteira -- e quem paga e o jogador sem meta.
   *
   * O pedido era VARIEDADE, nao dificuldade. Entao a curva fica onde estava
   * e a identidade de cada bicho sai dos mostradores que nao a movem:
   * paciencia (quando cava a parede), medo (por onde roteia), ataque
   * (quanto machuca a torre) e raio. Subir a dificuldade continua possivel,
   * mas e uma decisao separada e explicita, nao um efeito colateral da arte.
   */

  // corrente do Grunt: 5 -> 14 -> 21
  carnical:  { name: 'Carniçal',  hp: 62,  speed: 59,  gold: 8,   radius: 15, shape: 'triangulo',
               color: '#cbd5e1', leak: 1, medo: 'afoito',    paciencia: 6.0, ataque: 12 },
  cavaleiro: { name: 'Cavaleiro', hp: 62,  speed: 53,  gold: 8,   radius: 16, shape: 'triangulo',
               color: '#a8a29e', leak: 1, medo: 'normal',    paciencia: 5.4, ataque: 16 },
  demonio:   { name: 'Demônio',   hp: 62,  speed: 60,  gold: 8,   radius: 16, shape: 'triangulo',
               color: '#fb923c', leak: 1, medo: 'afoito',    paciencia: 4.6, ataque: 20,
               habilidade: 'voo' },

  // corrente do Veloz: 8
  aranha:    { name: 'Aranha',    hp: 42,  speed: 108, gold: 11,  radius: 12, shape: 'losango',
               color: '#a3e635', leak: 1, medo: 'afoito',    paciencia: 10.5, ataque: 6,
               habilidade: 'passagem' },

  // corrente do Bruxo: 10 -> 16
  arqueiro:  { name: 'Arqueiro',  hp: 120, speed: 64,  gold: 18,  radius: 15, shape: 'estrela',
               color: '#e879f9', leak: 2, medo: 'cauteloso', paciencia: 5.2, ataque: 24,
               habilidade: 'pressa' },
  necromante:{ name: 'Necromante',hp: 120, speed: 59,  gold: 18,  radius: 16, shape: 'estrela',
               color: '#c084fc', leak: 2, medo: 'cauteloso', paciencia: 4.8, ataque: 28,
               habilidade: 'debuff' },

  // corrente do Tanque: 12 -> 18
  ogro:      { name: 'Ogro',      hp: 245, speed: 35,  gold: 24,  radius: 21, shape: 'hexagono',
               color: '#94a3b8', leak: 2, medo: 'afoito',    paciencia: 3.2, ataque: 70 },
  golem:     { name: 'Golem',     hp: 245, speed: 32,  gold: 24,  radius: 22, shape: 'hexagono',
               color: '#78716c', leak: 2, medo: 'afoito',    paciencia: 2.6, ataque: 88 }
};

/* --------------------------------------------------- habilidades ----------
 *
 * Uma habilidade por TIPO, e so em alguns tipos. Se todo monstro voasse ou
 * atravessasse, o labirinto -- que e a decisao central da partida -- viraria
 * decoracao. A graca e o jogador ter que responder a UMA excecao por vez:
 * "essa linha nao segura o Demonio", "aquela torre para de atirar quando o
 * Necromante chega".
 *
 * Todas custam O(n) num INTERVALO, nunca por quadro: numa onda cheia sao
 * dezenas de monstros a 60fps, e habilidade que roda todo quadro e um
 * orcamento de quadro que some.
 */
const HABILIDADES = {
  /* Necromante: cala a melhor torre por perto. */
  debuff: {
    nome: 'Maldição', cor: '#c084fc',
    raio: 2.6,          // em celulas
    intervalo: 5.0,     // s entre lancamentos
    duracao: 3.4,       // s de torre amaldicoada
    forca: 0.60         // recarga da torre fica 60% mais longa
  },

  /* Bruxo: apressa o aliado mais adiantado. */
  pressa: {
    nome: 'Pressa', cor: '#f59e0b',
    raio: 3.2,
    intervalo: 5.5,
    duracao: 3.6,
    forca: 0.50         // +50% de velocidade
  },

  /* Demonio: voa. Ignora o labirinto inteiro e vai reto para a saida.
   *
   * E a habilidade mais cara em equilibrio e a mais barata em codigo -- a
   * resposta do jogador e obvia e legitima: torre perto da saida. Por isso
   * ela entra num tipo so, e tarde (onda 21). */
  voo: { nome: 'Voo', cor: '#fb923c' },

  /* Aranha: escala UMA torre por travessia, e escolhe qual.
   *
   * Nao e passe livre: ela so gasta quando o labirinto ja custou caro
   * (folga acima do limite), e so uma vez. Depois disso anda como todo
   * mundo. A escolha e dela -- a primeira parede que valer a pena. */
  passagem: {
    nome: 'Escalada', cor: '#a3e635',
    /* O gatilho NAO e a folga, e foi preciso medir para descobrir.
     *
     * A folga e medida da celula atual ate a saida, entao ela e alta so na
     * largada e encolhe a cada passo. Medido: numa serpentina cheia, a
     * Aranha so via folga acima de 1,4 na PROPRIA casa de nascimento, onde
     * nao ha torre nenhuma encostada -- a condicao "folga alta E parede ao
     * lado" praticamente nunca coincidia, e ela nunca escalou nada.
     *
     * O gatilho certo e direto: quantos passos a escalada ECONOMIZA. Compara
     * a rota real que falta daqui com a rota real do outro lado da parede,
     * descontando as duas casas da travessia. Isso mede exatamente o que
     * interessa -- "essa parede esta no meu caminho" -- e e a escolha que o
     * jogador le como decisao: ela pula a parede que encurta, nao a primeira
     * que encosta.
     */
    ganho: 6,           // so escala se economizar pelo menos isso em casas
    usos: 1,
    tempo: 0.9          // s escalando, parada e vulneravel
  }
};

/* Rotulo legivel de cada classe, usado na dica do jogo. */
const MEDO_META = {
  afoito:    { label: 'Afoito',    desc: 'quase ignora o perigo', color: '#f97316' },
  normal:    { label: 'Comum',     desc: 'desvia do óbvio',       color: '#facc15' },
  cauteloso: { label: 'Cauteloso', desc: 'dá voltas enormes',     color: '#38bdf8' }
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
