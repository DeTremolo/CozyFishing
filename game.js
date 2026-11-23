'use strict';
// Cozy Fishing — © 2026 DeTremolo Games. All rights reserved.

// ---------------------------------------------------------------------------
// Perusasetukset. Peli piirretään pieneen puskuriin, joka skaalataan
// kokonaislukukertoimella isoksi -> terävät pikselit.
// Mittakaava: yksi ruutu on yksi metri.
// ---------------------------------------------------------------------------
let W = 384, H = 216;      // pelipuskurin koko; lasketaan selainikkunan mukaan (ks. resize)
const HW = 8, HH = 4;      // puolikas isometrisestä ruudusta (ruutu on 16x8 px)
const N = 112;             // kartan koko ruutuina (metreinä)
const C = N / 2;           // lammen keskipiste
const POND_R = 25;         // lammen keskisäde: halkaisija noin 50 m
const POND_RMAX = POND_R + 5.5;   // rantaviivan suurin etäisyys keskipisteestä (lahdet)
const WALK = 0.063;        // kävelynopeus (ruutua / päivitys)

const T_WATER = 0, T_BANK = 1, T_FOREST = 2, T_CLEAR = 3, T_TENT = 4, T_CAMP = 5, T_SHED = 6;
// Vuorokausi: kellossa CYCLE yksikköä vuorokaudessa (ks. advanceClock). Kellonaika = 4.30 + osuus * 24 h
const CYCLE = 10 * 60 * 60;
const START_TOD = 0.12;    // peli alkaa aamulla noin kello 7
// Aukea lammen vasemmalla rannalla. Se määritellään ruudun suuntaisilla koordinaateilla
// u = x - y (vaakasuunta) ja v = x + y (pystysuunta): aukea ulottuu rannasta vasemmalle.
const CLEARING = { u0: -48.5, u1: -30, v0: 104, v1: 122 };
const TENT = { cx: 31, cy: 77 };   // teltta vie 2x2 ruutua aukean takaosassa
const CAMP = { cx: 36, cy: 77 };   // nuotio teltan ja lammen välissä

const view = document.getElementById('screen');
const vctx = view.getContext('2d');
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const mainCtx = buf.getContext('2d');
// Pelaajan edessä olevat puut ja kasvit piirretään omalle kerrokselleen, johon leikataan aukko pelaajan kohdalle
const front = document.createElement('canvas');
front.width = W; front.height = H;
const frontCtx = front.getContext('2d');
let ctx = mainCtx;
mainCtx.imageSmoothingEnabled = false;
frontCtx.imageSmoothingEnabled = false;
let S = 3;

// Peli täyttää koko selainikkunan. Pikselikoko S (näytön oikeina pikseleinä, devicePixelRatio huomioiden)
// valitaan niin, että ikkunaan mahtuu vähintään 384 x 216 pelipikseliä, ja puskurin leveys ja korkeus
// lasketaan ikkunan mukaan: leveämmässä ikkunassa näkyy enemmän maisemaa. Kokonaisluvullinen S pitää
// pikselit tasakokoisina myös Windowsin näyttöskaalauksella (esim. 125 % tai 150 %).
let buffersReady = false;
function resize() {
  const dpr = window.devicePixelRatio || 1, pw = Math.round(innerWidth * dpr), ph = Math.round(innerHeight * dpr);
  S = Math.max(1, Math.floor(Math.min(ph / 216, pw / 384)));
  const nw = Math.ceil(pw / S), nh = Math.ceil(ph / S);
  view.width = nw * S;
  view.height = nh * S;
  view.style.width = (nw * S) / dpr + 'px';
  view.style.height = (nh * S) / dpr + 'px';
  if (nw === W && nh === H && buffersReady) return;
  W = nw; H = nh;
  buf.width = W; buf.height = H; front.width = W; front.height = H;
  mainCtx.imageSmoothingEnabled = false; frontCtx.imageSmoothingEnabled = false;
  if (buffersReady) resizeBuffers();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Apufunktiot
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function disc(g, cx, cy, r) {
  r = Math.round(r);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
  }
}

function plotLine(g, x0, y0, x1, y1, color) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  g.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
  }
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Monikulmio pikseli kerrallaan, jotta reunat pysyvät terävinä
function polyFill(g, pts, color) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  g.fillStyle = color;
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      if (inPoly(x + 0.5, y + 0.5, pts)) g.fillRect(x, y, 1, 1);
    }
  }
}

// Isometrinen projektio: maailman (x, y) -> absoluuttinen pikselipaikka
const isoX = (x, y) => (x - y) * HW + N * HW;
const isoY = (x, y) => (x + y) * HH;
const cellIdx = (x, y) => clamp(Math.floor(y), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1);
// Absoluuttinen pikselipaikka -> maailman koordinaatit (maan tasolla)
const absToWorld = (ax, ay) => { const u = ax - N * HW; return [(u / HW + ay / HH) / 2, (ay / HH - u / HW) / 2]; };

// Maailman suunta -> näytön yksikkövektori
function screenDir(dx, dy) {
  const sx = (dx - dy) * HW, sy = (dx + dy) * HH, l = Math.hypot(sx, sy) || 1;
  return [sx / l, sy / l];
}

// ---------------------------------------------------------------------------
// Hahmosprite: jokainen merkki on yksi pikseli, '.' on läpinäkyvä
// ---------------------------------------------------------------------------
function makeSprite(rows, pal, override) {
  const c = makeCanvas(rows[0].length, rows.length);
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = override || pal[ch];
      g.fillRect(x, y, 1, 1);
    });
  });
  return c;
}
const sprite = (rows, pal) => ({ img: makeSprite(rows, pal) });

// Varjoja varten mustat siluetit
function silhouette(img) {
  const c = makeCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Pelaaja: valkoihoinen retkeilijä lierihatussa, oliivinvihreä takki, ruskeat housut ja iso ruskea selkäreppu,
// jonka päällä on makuualusta. Edestä repun sivut näkyvät olkapäiden takaa, takaa reppu peittää selän.
// Värit ovat kirkkaampia ja kontrastisempia kuin maaston sävyt, ja hahmon ympärillä on tumma ääriviiva,
// jotta se erottuu metsästä ja rannasta selvästi.
const PLAYER_PAL = {
  h: '#b0925a', H: '#5e4226', b: '#8c7046',
  s: '#f6d0ac', S: '#d29c7c', e: '#2a2018', r: '#8a6440',
  j: '#6c8c40', J: '#94b25c', d: '#40541e', p: '#3a2a1a', k: '#2a2018',
  P: '#a8662c', L: '#cc8a48', q: '#6a3e1a', Q: '#3e7090', w: '#74a8c4',
  c: '#6a523a', C: '#4a3a2a', x: '#22180e',
};
const PLAYER_FRONT = [
  '.....hhhh.....',
  '....hHHHHh....',
  '..bbbbbbbbbb..',
  '...PSSSSSSP...',
  '...PsessesP...',
  '...PssssssP...',
  '...PPsSSsPP...',
  '..PjjjjjjjjP..',
  '..jJjpjjpjJj..',
  '..jjdpjjpdjj..',
  '..jj.pjjp.jj..',
  '..jj.jjjj.jj..',
  '..ss.jjjj.ss..',
  '.....kkkk.....',
];
const PLAYER_BACK = [
  '.....hhhh.....',
  '....hHHHHh....',
  '..bbbbbbbbbb..',
  '....rrrrrr....',
  '...QwQQQQwQ...',
  '...QQQQQQQQ...',
  '..qPPPPPPPPq..',
  '.jqPPLLLLPPqj.',
  '.jqPPLLLLPPqj.',
  '.jqPPPPPPPPqj.',
  '.jqPPPPPPPPqj.',
  '.sqPPPPPPPPqs.',
  '..qqqqqqqqqq..',
  '.....kkkk.....',
];
// Viistosti eteen oikealle (kaakko ruudulla): kasvot kääntyneet oikealle, reppu näkyy vasemman olan takana
const PLAYER_FRONT_SIDE = [
  '......hhhh....',
  '.....hHHHHh...',
  '...bbbbbbbbbb.',
  '..PPrSSSSSS...',
  '..PPrssesse...',
  '..PPrssssss...',
  '..PPPPsSSs....',
  '..PPjjjjjjj...',
  '..PPjpjjJjjj..',
  '..PPjpjjjjjj..',
  '..Pjjpjjjj.jj.',
  '..qjjjjjjj.jj.',
  '...ss.jjjj.ss.',
  '......kkkk....',
];
// Sivulta (itä ruudulla): profiili, nenä oikealla ja iso reppu selässä vasemmalla
const PLAYER_SIDE = [
  '.......hhhh...',
  '......hHHHHh..',
  '....bbbbbbbbbb',
  '...QQQrrSSSS..',
  '..QwQQrrssse..',
  '..PPPPrsssss..',
  '..PPPPPssS....',
  '..PLLPPjjjj...',
  '..PLLPPjJjj...',
  '..PPPPPjjjj...',
  '..qPPPPjjjj...',
  '..qPPPPjdjj...',
  '...qqqqjsj....',
  '.......kkk....',
];
// Viistosti taakse oikealle (koillinen ruudulla): selkä ja reppu, oikeasta reunasta pilkistää poski
const PLAYER_BACK_SIDE = [
  '......hhhh....',
  '.....hHHHHh...',
  '...bbbbbbbbbb.',
  '.....rrrrrS...',
  '...QwQQQQwQs..',
  '...QQQQQQQQ...',
  '..qPPPPPPPPq..',
  '..qPPLLLLPPqj.',
  '..qPPLLLLPPqj.',
  '..qPPPPPPPPqj.',
  '..qPPPPPPPPqj.',
  '..qPPPPPPPPqs.',
  '...qqqqqqqq...',
  '.....kkkk.....',
];
const PLAYER_LEGS = [
  ['.....cccC.....', '.....cC.Cc....', '.....Cc.cC....', '.....cc.cc....', '....xxx.xxx...'],
  ['.....cccC.....', '....cC...Cc...', '....Cc...cC...', '...cc.....cc..', '..xxx.....xxx.'],
];
const PLAYER_LEGS_SIDE = [
  ['.......ccC....', '.......cCC....', '.......ccC....', '.......ccC....', '.......xxxx...'],
  ['.......cccC...', '......cC..Cc..', '.....Cc....cC.', '.....cc....cc.', '....xxx....xxx'],
];
// Viisi katsesuuntaa; länsipuolen suunnat saadaan peilaamalla. Kullekin suunnalle:
// lamp = otsalampun sarake (-1 = ei näy), away = katsooko hahmo poispäin katsojasta.
// Ongen paikat eivät saa peilautua mukana (peilikuvassa oikea käsi olisi vasen), joten ne ovat
// omissa taulukoissaan kaikille kahdeksalle suunnalle (ROD_BACK, HAND).
const VIEW_ORDER = ['N', 'NE', 'E', 'SE', 'S'];
const VIEW_INFO = {
  S: { rows: PLAYER_FRONT, legs: PLAYER_LEGS, lamp: 6, away: false },
  SE: { rows: PLAYER_FRONT_SIDE, legs: PLAYER_LEGS, lamp: 8, away: false },
  E: { rows: PLAYER_SIDE, legs: PLAYER_LEGS_SIDE, lamp: 10, away: false },
  NE: { rows: PLAYER_BACK_SIDE, legs: PLAYER_LEGS, lamp: -1, away: true },
  N: { rows: PLAYER_BACK, legs: PLAYER_LEGS, lamp: -1, away: true },
};
// Hahmon todellinen katsesuunta ruudulla (länsipuolen suunnat ovat peilattuja kuvia)
const MIRROR_DIR = { SE: 'SW', E: 'W', NE: 'NW' };
const playerDir = () => (player.flip && MIRROR_DIR[player.view]) || player.view;
// Selässä oleva onki on aina repun oikeassa reunassa (hahmon oma oikea puoli): x = paikka hahmon keskeltä
// ruudulla (ei peilata), front = onko onki hahmon edessä (muuten repun ja hahmon takana). Itään
// katsottaessa oikea puoli on kameraa kohti, länteen katsottaessa poispäin kamerasta.
const ROD_BACK = {
  S: { x: -4, front: false }, SE: { x: -5, front: false }, E: { x: -3, front: true }, NE: { x: 3, front: true },
  N: { x: 4, front: true }, NW: { x: 4, front: true }, W: { x: 3, front: false }, SW: { x: 1, front: false },
};
// Oikean käden ote ongen kahvasta [x, y] hahmon jalkapisteestä: kädessä pidetty onki on aina hahmon oikeassa
// kädessä, joka on koukistettuna hieman hahmon edessä (ei suorana alaspäin). Poispäin katsottaessa (NE, N, NW)
// ote on kyljellä.
const HAND = { S: [-2, -7], SE: [-2, -8], E: [3, -8], NE: [4, -9], N: [3, -9], NW: [3, -9], W: [-3, -8], SW: [-3, -8] };
// Hahmon kuva saa yhden pikselin reunuksen, johon piirretään tumma ääriviiva (kuva on 16 x 21)
function playerSprite(rows) {
  const base = makeSprite(rows, PLAYER_PAL), c = makeCanvas(base.width + 2, base.height + 2);
  c.getContext('2d').drawImage(base, 1, 1);
  outlineSprite(c, '#120c0a');
  return { img: c };
}
const PLAYER_SPR = Object.fromEntries(VIEW_ORDER.map((v) => [v, VIEW_INFO[v].legs.map((l) => playerSprite([...VIEW_INFO[v].rows, ...l]))]));
// Onki kädessä: molemmat kädet piirretään koukistettuina onkea pitämään (drawArms), joten kuvan roikkuvat
// kädet poistetaan. Alueet [x0, x1, y0, y1] ovat kuvan sarakkeita ja rivejä; fill on poistettujen
// pikselien tilalle tuleva merkki ('.' = läpinäkyvä). Esim. S: molemmat roikkuvat kädet, SE: ruudun oikea
// käsi ja repun takaa pilkistävän käden ihopikselit, E/W: sivukuvan käden ihopikseli peitetään takilla.
// Kuviin ei saa jäädä ihonvärisiä käsipikseleitä (alla olevat kädet piirretään uudelleen).
const HELD_ARMS = {
  S: ['S', [[2, 3, 10, 12], [10, 11, 10, 12]], '.'], SE: ['SE', [[11, 12, 10, 12], [3, 4, 12, 12]], '.'], E: ['E', [[8, 8, 12, 12]], 'j'],
  NE: ['NE', [[12, 12, 7, 11]], '.'], N: ['N', [[1, 1, 7, 11], [12, 12, 7, 11]], '.'], NW: ['NE', [[12, 12, 7, 11]], '.'],
  W: ['E', [[8, 8, 12, 12]], 'j'], SW: ['SE', [[11, 12, 10, 12], [3, 4, 12, 12]], '.'],
};
const PLAYER_SPR_HELD = Object.fromEntries(Object.entries(HELD_ARMS).map(([dir, [view, boxes, fill]]) => {
  const rows = VIEW_INFO[view].rows.map((r, y) => boxes.reduce((row, [x0, x1, y0, y1]) => (y >= y0 && y <= y1 ? row.slice(0, x0) + fill.repeat(x1 - x0 + 1) + row.slice(x1 + 1) : row), r));
  return [dir, VIEW_INFO[view].legs.map((l) => playerSprite([...rows, ...l]))];
}));
// Hahmon kuva: onki kädessä käytetään kuvaa, josta roikkuvat kädet on poistettu
const playerSpr = (p) => {
  const k = p.moving ? Math.floor(p.anim / 5) % 2 : 0;
  return p.rod || p.tool ? PLAYER_SPR_HELD[playerDir()][k] : PLAYER_SPR[p.view][k];
};

// Sorsat (sinisorsa): koiras vihreäpäinen, naaras ruskea. Kaikki kuvat nokka oikealle.
const DUCK_PAL_M = { g: '#1f5a3a', G: '#2f7a4a', y: '#e0b030', w: '#f0f0e8', r: '#6a3a2a', m: '#a8a8a0', M: '#74746e', n: '#5a4a3a', k: '#1a1a1a', u: '#3a4aa0' };
const DUCK_PAL_F = { g: '#7a5a38', G: '#5a4028', y: '#c08040', w: '#8a6a44', r: '#8a6a44', m: '#9a7a50', M: '#6a4e30', n: '#5a4430', k: '#4a3a28', u: '#3a4aa0' };
const DUCK_ROWS = {
  swim: ['......gg.', '.....gGgy', '.....wg..', 'knnnnrrr.', 'kmmmumrr.', '.MMMMMM..'],
  dabble: ['..k......', '..kn.....', '...nmm...', '....mmM..', '.....MMr.', '.........'],
  fly0: ['...nn......', '....nn.....', 'kmmmmmrwgGy', '.MMMMMm....', '...........'],
  fly1: ['...........', '.......wgGy', 'kmmmmmrr...', '....nn.....', '...nn......'],
  sleep: ['.........', '.........', '....ngg..', 'knnnnnrr.', 'kmmmumrr.', '.MMMMMM..'],   // pää selän päällä
};
const duckSet = (pal) => Object.fromEntries(Object.entries(DUCK_ROWS).map(([k, rows]) => [k, makeSprite(rows, pal)]));
const DUCK_SPR = { m: duckSet(DUCK_PAL_M), f: duckSet(DUCK_PAL_F) };

// Metsän pikkueläimet: orava, jänis ja hiiri. Kuvat kuono oikealle: kaksi liikeasentoa ja kaksi lepoasentoa.
const SQUIRREL_PAL = { r: '#b0602a', R: '#7a3e1a', w: '#e8d0a0', k: '#1a1010', t: '#c06a30', T: '#8a4420' };
const HARE_PAL = { h: '#8a7658', H: '#5e5040', l: '#c4b498', k: '#2a2018', e: '#1a1010', w: '#f0ece0' };
const MOUSE_PAL = { m: '#8a8278', M: '#5e5850', p: '#d8a0a0', e: '#1a1010' };
const ANIMAL_ROWS = {
  squirrel: {
    walk0: ['.tt......', 'tTTt..R..', 'tT.t.rRr.', '.t..rrrkr', '..trrrrww', '..rrrRrw.', '..R...R..'],
    walk1: ['.tt......', 'tTTt..R..', 'tT.t.rRr.', '.t..rrrkr', '..trrrrww', '..rrrRrw.', '.R.....R.'],
    idle0: ['.tt...R..', 'tTTt.rRr.', 'tT.t.rrkr', '.t..rrww.', '..t.rrww.', '..trrrrw.', '...RR.R..'],
    idle1: ['..tt..R..', '.tTTtrRr.', '.tT.trrkr', '..t.rrww.', '..t.rrww.', '..trrrrw.', '...RR.R..'],
  },
  hare: {
    walk0: ['.......k...', '.......hk..', '.......hh..', '......hhhh.', '.hhhhhhhheh', 'whhhhhhhhh.', '.HlllllhH..', '..H.H..H.H.'],
    walk1: ['........k..', '.......hk..', '.......hh..', '......hhhh.', '.hhhhhhhheh', 'whhhhhhhhh.', '.HlllllhH..', '.H......H.H'],
    idle0: ['......k.k..', '......h.h..', '......hHh..', '.....hhhhh.', '..hhhhhhehh', '.whhhhhhhh.', '..Hhhhhlh..', '..HHH..HH..'],
    idle1: ['.....k..k..', '.....h..h..', '......hHh..', '.....hhhhh.', '..hhhhhhehh', '.whhhhhhhh.', '..Hhhhhlh..', '..HHH..HH..'],
  },
  mouse: {
    walk0: ['....pm.', 'pmmmmme', '..M.M..'],
    walk1: ['....pm.', 'pmmmmme', '.M...M.'],
    idle0: ['....pm.', 'pmmmmme', '.MM..M.'],
    idle1: ['....pmm', 'pmmmmme', '.MM..M.'],
  },
};
const ANIMAL_PAL = { squirrel: SQUIRREL_PAL, hare: HARE_PAL, mouse: MOUSE_PAL };
const ANIMAL = {
  squirrel: { walk: 0.032, run: 0.09, hop: 2, shy: 1 },
  hare: { walk: 0.024, run: 0.12, hop: 3, shy: 1.15 },
  mouse: { walk: 0.03, run: 0.075, hop: 0, shy: 0.75 },
};
for (const k in ANIMAL) {
  const rows = ANIMAL_ROWS[k];
  const spr = Object.fromEntries(Object.entries(rows).map(([f, r]) => [f, makeSprite(r, ANIMAL_PAL[k])]));
  ANIMAL[k].spr = spr;
  ANIMAL[k].sil = silhouette(spr.walk0);
  ANIMAL[k].w = spr.walk0.width;
  ANIMAL[k].h = spr.walk0.height;
}

// ---------------------------------------------------------------------------
// Maaruudut, puut, kivet, ruohot ja teltta piirretään kerran valmiiksi
// ---------------------------------------------------------------------------
const inDiamond = (px, py) => Math.abs(px + 0.5 - HW) / HW + Math.abs(py + 0.5 - HH) / HH < 1;

function makeTile(rnd, base, specks, n) {
  const c = makeCanvas(HW * 2, HH * 2), g = c.getContext('2d');
  for (let py = 0; py < HH * 2; py++) {
    for (let px = 0; px < HW * 2; px++) {
      if (!inDiamond(px, py)) continue;
      g.fillStyle = rnd() < 0.7 ? base[0] : base[1 + Math.floor(rnd() * (base.length - 1))];
      g.fillRect(px, py, 1, 1);
    }
  }
  for (let k = 0; k < n; k++) {
    const px = Math.floor(rnd() * HW * 2), py = Math.floor(rnd() * HH * 2);
    if (!inDiamond(px, py)) continue;
    g.fillStyle = specks[Math.floor(rnd() * specks.length)];
    g.fillRect(px, py, 1, 1);
  }
  return c;
}

function makeTiles(seed, base, specks, n) {
  const rnd = mulberry32(seed);
  return Array.from({ length: 4 }, () => makeTile(rnd, base, specks, n));
}

const TILES = {
  needles: makeTiles(11, ['#262214', '#2c2717', '#211d11'], ['#3a3220', '#17140b', '#2c3a1e', '#4a3e26'], 10),
  grass: makeTiles(12, ['#4a6a32', '#527438', '#43612d'], ['#6a8c44', '#34502a', '#8a9a52'], 8),
  shore: makeTiles(13, ['#3e4a2a', '#46502e', '#363f24'], ['#5a5a38', '#2a3020', '#6a7040'], 8),
  path: makeTiles(14, ['#5a5234', '#4e5a30', '#625636'], ['#7a6a44', '#3e4a28', '#6a7a40'], 8),
  dirt: makeTiles(15, ['#5e4a30', '#6a5434', '#53422a'], ['#7a6440', '#3e3020'], 6),
  mud: makeTiles(16, ['#22261c', '#262a1e', '#1e2218'], ['#2e3224'], 3),
};

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => clamp(Math.round(v * (1 + f)), 0, 255);
  return '#' + [ch(n >> 16), ch((n >> 8) & 255), ch(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Ääriviiva läpinäkyviin pikseleihin, jotka koskettavat kuvaa
function outlineSprite(c, col) {
  const w = c.width, h = c.height, g = c.getContext('2d');
  const a = g.getImageData(0, 0, w, h).data;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
  g.fillStyle = col;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) g.fillRect(x, y, 1, 1);
  }
}

// Kuusi: kapea, suippo latvus, joka rakentuu yksittäisistä oksista. Oksat lähtevät rungolta epäsäännöllisin
// välein vuorotellen kummallekin puolelle, taipuvat alas ja niiden kärki kääntyy hieman ylös. Oksien alta
// roikkuu tummempi neulasverho, ja latvuksen sisäosa on varjossa. Ylempien oksien verhot peittävät
// alempia oksia. Valo tulee vasemmalta ylhäältä. Latvassa on ohut kasvain ja lyhyet oksat.
// Muunnelmia: kapea tai tuuhea, tiheä tai harva oksisto, vino latva, kuivia alaoksia ja aukkoja latvuksessa.
const SPRUCE_PALS = [
  ['#07120b', '#0c1d13', '#13291b', '#1c3825', '#2a4d33'],
  ['#08130d', '#0e2016', '#162d1f', '#203d2a', '#2f5439'],
  ['#071009', '#0b1a10', '#122617', '#1a3320', '#27472c'],
  ['#08120f', '#0d1e17', '#152b20', '#1e3a2b', '#2c4f3a'],   // hieman sinertävä
  ['#0a130a', '#121f10', '#1b2c17', '#263b1f', '#36502b'],   // hieman kellertävä
];
function makeSpruce(rnd, big) {
  const h = big ? Math.round(50 + rnd() * 26) : Math.round(20 + rnd() * 14);
  const slim = big ? 0.34 + rnd() * 0.14 : 0.42 + rnd() * 0.12;
  const w = Math.round(h * slim) + 7;
  const step = big ? 1.5 + rnd() * 0.7 : 1.4 + rnd() * 0.5;           // oksien pystyväli
  const droopK = 0.35 + rnd() * 0.3;                                  // kuinka paljon oksat roikkuvat
  const lean = big && rnd() < 0.4 ? (rnd() - 0.5) * 4 : 0;            // vino latva
  const bare = big && rnd() < 0.3 ? 4 + Math.floor(rnd() * 7) : 0;    // kuivunut alaosa (pikseleinä)
  const c = makeCanvas(w, h + 2), g = c.getContext('2d');
  const T = SPRUCE_PALS[Math.floor(rnd() * SPRUCE_PALS.length)];
  const ax = w >> 1, ay = h - 1;
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  // Runko pilkistää alimpien oksien alta
  for (let y = ay - (big ? 7 : 4) - bare; y <= ay; y++) {
    px(ax - 1, y, '#3a2616'); px(ax, y, '#24170c');
    if (big) px(ax - 2, y, '#4a3220');
  }
  // Kuivat, harmaat oksantyngät rungon alaosassa
  for (let y = ay - 5; y > ay - 5 - bare; y -= 2 + Math.floor(rnd() * 2)) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.3) continue;
      const len = 2 + Math.floor(rnd() * (w / 2 - 3));
      for (let k = 1; k <= len; k++) px(ax + side * (k + (side < 0 ? 1 : 0)), y + Math.floor(k * 0.35), k === len ? '#3e3830' : '#5a5048');
    }
  }
  const top = 2, bottom = ay - (big ? 4 : 2) - bare, span = bottom - top;
  const maxHW = w / 2 - 2;
  const hwAt = (f) => Math.max(0.8, maxHW * Math.pow(1 - f, 0.9) * (f < 0.06 ? 0.85 + f * 2.5 : 1));
  const cxAt = (f) => ax + lean * f * f;
  // Latvuksen varjoisa sisäosa, jottei oksien väleistä näy läpi
  for (let y = top + 3; y <= bottom + 1; y++) {
    const f = (bottom - y) / span, ci = hwAt(f) * 0.42;
    for (let dx = -Math.round(ci); dx <= Math.round(ci); dx++) px(cxAt(f) + dx, y, rnd() < 0.25 ? T[1] : T[0]);
  }
  // Oksat alhaalta ylös: ylempien oksien neulasverhot jäävät alempien päälle
  let side = rnd() < 0.5 ? -1 : 1;
  for (let y0 = bottom; y0 > top + span * 0.1; y0 -= step * (0.7 + rnd() * 0.6)) {
    const f = (bottom - y0) / span;
    side = rnd() < 0.8 ? -side : side;
    if (big && f > 0.12 && f < 0.8 && rnd() < 0.05) continue;         // aukko oksistossa
    const len = hwAt(f) * (0.75 + rnd() * 0.35), cx = cxAt(f) + side * 0.5;
    const droop = (1 + len * droopK) * (0.7 + rnd() * 0.6);
    const lit = side < 0;
    for (let k = 0; k <= len; k++) {
      const t = k / Math.max(1, len), x = cx + side * k;
      const y = y0 + droop * Math.pow(t, 1.5) - (t > 0.82 ? 1 : 0);
      // Yläpinta valossa, oksa ja sen alta roikkuva verho varjossa
      px(x, y - 1, lit ? (rnd() < 0.55 ? T[4] : T[3]) : (rnd() < 0.5 ? T[3] : T[2]));
      px(x, y, lit ? T[3] : T[2]);
      const hang = Math.floor(rnd() * (1 + (big ? 3.2 : 2) * Math.sin(Math.PI * Math.min(1, t * 1.15))));
      for (let q = 1; q <= hang; q++) px(x, y + q, q === hang ? T[0] : lit && q === 1 ? T[2] : T[1]);
    }
    // Lyhyt sivuoksa, joka tekee reunasta rosoisen
    if (len > 3 && rnd() < 0.5) {
      const k0 = Math.floor(len * (0.4 + rnd() * 0.4)), y = y0 + droop * Math.pow(k0 / len, 1.5);
      px(cx + side * k0, y - 2, lit ? T[4] : T[3]); px(cx + side * (k0 + 1), y - 2, lit ? T[3] : T[2]);
    }
  }
  // Latva: ohut kasvain ja muutama lyhyt oksa sen ympärillä
  const tx = ax + Math.round(lean);
  for (let y = 0; y <= top + span * 0.12; y++) px(tx, y, y < 2 ? T[3] : T[2]);
  for (let y = top + 2; y <= top + span * 0.12; y += 2) {
    px(tx - 1, y + 1, T[3]);
    if (rnd() < 0.8) px(tx + 1, y + 1, T[2]);
  }
  outlineSprite(c, '#040a06');
  const spr = { full: c, ax, ay };
  spr.sil = silhouette(c);
  return spr;
}

// Pyöreähkö lehvästö- tai neulasmöykky: rosoinen reuna ja valo vasemmalta ylhäältä
function blob(g, rnd, cx, cy, rx, ry, T) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
      const nx = dx / rx, ny = dy / ry, d = nx * nx + ny * ny;
      if (d > 1 - rnd() * 0.3) continue;
      const l = -0.5 * nx - 0.8 * ny + (rnd() - 0.5) * 0.5;
      g.fillStyle = T[l > 0.55 ? 4 : l > 0.15 ? 3 : l > -0.25 ? 2 : l > -0.65 ? 1 : 0];
      g.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
    }
  }
}

// Mänty: pitkä runko, joka on alhaalta harmaanruskea ja ylhäältä oranssi. Latvus on korkealla
// ja koostuu muutamasta litteästä, hieman sinivihreästä neulasmöykystä oksien päissä.
const PINE_PAL = ['#0c1a14', '#16291e', '#203a29', '#2c4c34', '#3e6444'];
function makePine(rnd) {
  const h = Math.round(64 + rnd() * 18), w = 30 + Math.floor(rnd() * 6);
  const c = makeCanvas(w, h + 2), g = c.getContext('2d');
  const ax = w >> 1, ay = h - 1, lean = (rnd() - 0.5) * 5;
  const crownBot = Math.round(h * (0.36 + rnd() * 0.12));
  const X = (y) => ax + lean * ((ay - y) / ay) ** 2;
  for (let y = ay; y >= 6; y--) {
    const f = (ay - y) / ay, x = Math.round(X(y)), wd = f < 0.4 ? 3 : 2;
    const upper = f > 0.45 + Math.sin(y * 0.7) * 0.05;
    const cols = upper ? ['#d08848', '#b06a34', '#7a4420'] : ['#5e4c3c', '#4a3c30', '#2a2018'];
    for (let j = 0; j < wd; j++) {
      g.fillStyle = j === wd - 1 ? cols[2] : (y + j * 3) % 5 === 0 ? cols[2] : cols[j === 0 ? 0 : 1];
      g.fillRect(x - 1 + j, y, 1, 1);
    }
  }
  // Oksat rungosta latvusmöykkyihin: ylimmät möykyt muodostavat leveän, epätasaisen sateenvarjon,
  // alempana on muutama erillinen oksa neulastupsuineen
  const clumps = [];
  const n = 7 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1), y = 7 + (crownBot - 9) * f * f + (rnd() - 0.5) * 2;
    const spread = (w / 2 - 6) * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, f + 0.35)));
    const x = X(y) + (k === 0 ? 0 : (rnd() * 2 - 1) * spread);
    clumps.push({ x, y, rx: 3.5 + rnd() * 3 + (1 - f) * 2, ry: 2.2 + rnd() * 1.4 });
    if (k) plotLine(g, X(y + 3), y + 3, x, y + 1, '#6a4428');
  }
  clumps.sort((p, q) => p.y - q.y);
  for (const cl of clumps) blob(g, rnd, cl.x, cl.y, cl.rx, cl.ry, PINE_PAL);
  outlineSprite(c, '#050c08');
  const spr = { full: c, ax, ay };
  spr.sil = silhouette(c);
  return spr;
}

// Koivu: valkoinen runko mustine laikkuineen ja ilmava, vaaleanvihreä lehvästö, josta roikkuu oksia
const BIRCH_PAL = ['#1a3214', '#284a1c', '#3c6428', '#568434', '#7aa448'];
function makeBirch(rnd) {
  const h = Math.round(58 + rnd() * 16), w = 32 + Math.floor(rnd() * 6);
  const c = makeCanvas(w, h + 2), g = c.getContext('2d');
  const ax = w >> 1, ay = h - 1, lean = (rnd() - 0.5) * 4;
  const ccy = h * (0.3 + rnd() * 0.06), crx = w / 2 - 3, cry = h * 0.26;
  const X = (y) => ax + lean * ((ay - y) / ay);
  for (let y = ay; y >= ccy - cry * 0.5; y--) {
    const x = Math.round(X(y)), low = y > ay - 6;
    for (let j = 0; j < 3; j++) {
      let col = low ? ['#7a766c', '#5a564e', '#3a3832'][j] : ['#f2f0e6', '#d8d6cc', '#9a988e'][j];
      if (!low && rnd() < 0.18) col = '#2a2a28';   // tuohen mustat laikut
      g.fillStyle = col; g.fillRect(x - 1 + j, y, 1, 1);
    }
  }
  // Ohuet oksat latvukseen
  for (let k = 0; k < 4; k++) {
    const y0 = ccy + cry * (0.1 + rnd() * 0.5), side = k % 2 ? -1 : 1;
    plotLine(g, X(y0), y0, X(y0) + side * (3 + rnd() * crx * 0.35), y0 - 3 - rnd() * cry * 0.4, '#4a4640');
  }
  const cl = [];
  for (let k = 0; k < 20; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
    cl.push({ x: ax + Math.cos(a) * d * (crx - 3), y: ccy + Math.sin(a) * d * (cry - 2), r: 2.6 + rnd() * 2.2 });
  }
  cl.sort((p, q) => p.y - q.y);
  for (const b of cl) blob(g, rnd, b.x, b.y, b.r * 1.15, b.r, BIRCH_PAL);
  // Riippuvat oksat ja niiden lehdet
  for (let k = 0; k < 9; k++) {
    const b = cl[Math.floor(rnd() * cl.length)], x = Math.round(b.x + (rnd() - 0.5) * b.r * 2), y0 = Math.round(b.y + b.r * 0.6);
    for (let y = y0; y < y0 + 2 + rnd() * 4; y++) { g.fillStyle = rnd() < 0.5 ? BIRCH_PAL[2] : BIRCH_PAL[3]; g.fillRect(x, y, 1, 1); }
  }
  outlineSprite(c, '#0e1a0a');
  const spr = { full: c, ax, ay };
  spr.sil = silhouette(c);
  return spr;
}

// Iso kivi: kulmikas lohkare, jonka pinta jakautuu lohkopintoihin. Valo tulee vasemmalta
// ylhäältä: yläpinnat vaaleita, oikeat ja alemmat pinnat tummia. Saumoissa halkeamat, päällä jäkälää.
const ROCK_PAL = ['#c4beb2', '#a39d92', '#857f75', '#68635b', '#4e4a44', '#383531'];
function makeRock(rnd, small) {
  const w = small ? 18 : 28, h = small ? 15 : 22, c = makeCanvas(w, h), g = c.getContext('2d');
  const ax = w >> 1, ay = h - 3;
  const cx = ax + (rnd() - 0.5) * 2, cy = ay - (small ? 4 : 7);
  const rx = small ? 5 + rnd() * 2.5 : 9.5 + rnd() * 2.5, ry = small ? 3.5 + rnd() * 1.5 : 6.5 + rnd() * 2;
  const pts = [];
  const nv = 8 + Math.floor(rnd() * 3);
  for (let k = 0; k < nv; k++) {
    const a = (k / nv) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const r = 0.78 + rnd() * 0.28;
    pts.push([cx + Math.cos(a) * rx * r, Math.min(ay + 0.5, cy + Math.sin(a) * ry * r * (Math.sin(a) < 0 ? 1.25 : 0.85))]);
  }
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inPoly(x + 0.5, y + 0.5, pts);
  const seeds = [];
  for (let k = 0; k < 7; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.85;
    seeds.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r - 1 });
  }
  seeds.push({ x: cx - rx * 0.2, y: cy - ry * 0.75 });   // aina yksi yläpinta
  for (const sd of seeds) {
    const nx = (sd.x - cx) / rx, ny = (sd.y - cy) / ry;
    const light = -0.55 * nx - 0.85 * ny + (rnd() - 0.5) * 0.35;
    sd.tone = clamp(Math.round(2.4 - light * 2.2), 0, 4);
    sd.top = ny < -0.25;
  }
  const facet = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    let best = 0, bd = 1e9;
    seeds.forEach((sd, k) => { const d = (x + 0.5 - sd.x) ** 2 + ((y + 0.5 - sd.y) * 1.4) ** 2; if (d < bd) { bd = d; best = k; } });
    facet[y * w + x] = best;
  }
  const F = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : facet[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = F(x, y);
    if (f < 0) continue;
    let tone = seeds[f].tone;
    if (y >= ay - 1) tone = Math.max(tone, 4);
    const above = F(x, y - 1), left = F(x - 1, y);
    if ((above >= 0 && above !== f) || (left >= 0 && left !== f)) tone = seeds[f].tone <= 1 ? 0 : Math.min(5, tone + 2);
    let col = ROCK_PAL[tone];
    const r = rnd();
    if (r < 0.12) col = ROCK_PAL[Math.min(5, tone + 1)];
    else if (r < 0.18) col = ROCK_PAL[Math.max(0, tone - 1)];
    if (F(x, y - 2) < 0 && seeds[f].top) col = ROCK_PAL[0];
    const edge = F(x - 1, y) < 0 || F(x + 1, y) < 0 || F(x, y - 1) < 0 || F(x, y + 1) < 0;
    g.fillStyle = edge ? '#1e1d1a' : col;
    g.fillRect(x, y, 1, 1);
  }
  // Sammalta ja jäkälää yläpinnoilla
  for (let k = 0; k < 5; k++) {
    const sd = seeds[Math.floor(rnd() * seeds.length)];
    if (!sd.top) continue;
    let x = Math.floor(sd.x + (rnd() - 0.5) * 4), y = Math.floor(sd.y);
    for (let n = 0; n < 5 + rnd() * 6; n++) {
      const f = F(x, y);
      if (f >= 0 && seeds[f].top && F(x, y - 1) >= 0) { g.fillStyle = rnd() < 0.4 ? '#4f6a32' : rnd() < 0.5 ? '#3e5a2a' : '#8a946a'; g.fillRect(x, y, 1, 1); }
      x += Math.floor(rnd() * 3) - 1; y += rnd() < 0.3 ? 1 : 0;
    }
  }
  const spr = { full: c, ax, ay };
  spr.sil = silhouette(c);
  return spr;
}

// Ruohotuppaat penkereellä ja rantakaislikko. Kaislikossa on järviruokoa (lehdet varressa ja
// röyhy latvassa), osmankäämiä (ruskea tähkä) ja kaarevia saran lehtiä. Huojunta on esilaskettu
// SWAY_FRAMES vaiheeseen: tuuli taivuttaa korsia sitä enemmän, mitä korkeampi ja notkeampi korsi on.
const SWAY_FRAMES = 9;
function makeGrass(rnd, reed, short) {
  const w = reed ? 19 : short ? 11 : 15, h = reed ? 22 : short ? 9 : 13, ax = w >> 1, ay = h - 2;
  const T = reed ? ['#3a5426', '#56762f', '#7c9a44', '#a8b664'] : ['#35502a', '#4c6c32', '#6a8a40', '#94a856'];
  const parts = [];
  if (reed) {
    const n = 5 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const r = rnd();
      parts.push({
        kind: r < 0.45 ? 'reed' : r < 0.65 ? 'cattail' : 'sedge',
        x0: ax + Math.round((rnd() - 0.5) * 9), len: (r < 0.65 ? 13 + rnd() * 11 : 7 + rnd() * 7) * 0.75,
        lean: (rnd() - 0.5) * (r < 0.65 ? 0.25 : 1.1), flex: 0.7 + rnd() * 0.7, dry: rnd() < 0.18, side: rnd() < 0.5 ? -1 : 1,
      });
    }
  } else {
    // Lyhyt ruoho: matalia, tiheitä korsia; tavallinen tuppas on pidempi
    const n = short ? 4 + Math.floor(rnd() * 5) : 5 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) parts.push({ kind: 'blade', x0: ax + Math.round((rnd() - 0.5) * (short ? 7 : 9)), len: short ? 2 + rnd() * 3.5 : 4 + rnd() * 6, lean: (rnd() - 0.5) * 0.6, flex: 0.7 + rnd() * 0.6, dry: rnd() < 0.12 });
  }
  parts.sort((a, b) => b.len - a.len);   // pitkät taakse
  const frames = [];
  for (let f = 0; f < SWAY_FRAMES; f++) {
    const sw = (f / (SWAY_FRAMES - 1)) * 2 - 1;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
    for (const b of parts) {
      // Korren muoto: kaartuva käyrä, jonka taipuma kasvaa latvaa kohti
      const P = (t) => {
        const bend = b.kind === 'sedge' ? b.lean * t * t * b.len * 0.6 : b.lean * t * b.len;
        return [b.x0 + bend + sw * 2.2 * b.flex * t * t * (b.len / 12), ay - t * b.len * (b.kind === 'sedge' ? 1 - Math.abs(b.lean) * 0.35 * t : 1)];
      };
      const steps = Math.ceil(b.len * 1.3);
      let tip = P(1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, [x, y] = P(t);
        px(x, y, b.dry ? (t > 0.6 ? '#c4b478' : '#9a8a58') : T[Math.min(3, Math.floor(t * 3.4))]);
        tip = [x, y];
      }
      if (b.kind === 'reed') {
        // Järviruo'on lehdet sojottavat vuorotellen varren sivuille ja latvassa on ruskehtava röyhy
        for (let t = 0.25, side = b.side; t < 0.8; t += 0.18, side = -side) {
          const [x, y] = P(t);
          for (let q = 1; q <= 3; q++) px(x + side * q, y + q * 0.45 - (q === 3 ? 0 : 0), q === 3 ? T[3] : T[2]);
        }
        const [x, y] = tip;
        px(x, y - 1, '#8a6a5a'); px(x + 1, y, '#7a5a4e'); px(x - 1, y, '#9a7a68'); px(x + sw * 0.6, y + 1, '#7a5a4e'); px(x, y + 2, '#6e5246');
      } else if (b.kind === 'cattail') {
        // Osmankäämin ruskea, paksu tähkä ja sen päällä ohut piikki
        const [x, y] = P(0.82);
        g.fillStyle = '#4e3220'; g.fillRect(Math.round(x), Math.round(y) - 3, 2, 4);
        g.fillStyle = '#6e4a2e'; g.fillRect(Math.round(x), Math.round(y) - 3, 1, 3);
        px(tip[0], tip[1], '#8a9a50');
      }
    }
    frames.push(c);
  }
  return { frames, ax, ay };
}

// Puiden huojunta: latvus taipuu tuulen mukana, runko pysyy paikallaan (rivikohtainen siirtymä)
const TREE_SWAY = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
function addSwayFrames(spr) {
  const c = spr.full, w = c.width, h = c.height;
  spr.frames = TREE_SWAY.map((k) => {
    const f = makeCanvas(w + 4, h), g = f.getContext('2d');
    for (let y = 0; y < h; y++) {
      const t = Math.max(0, (spr.ay - y) / spr.ay);
      g.drawImage(c, 0, y, w, 1, 2 + Math.round(k * t * t), y, w, 1);
    }
    return f;
  });
  return spr;
}

// Metsäruudun sisältö (kind): indeksi FOREST_SPR-taulukkoon
const K_SPRUCE = 0, K_YOUNG = 1, K_ROCK = 2, K_NONE = 3, K_PINE = 4, K_BIRCH = 5;
const FOREST_SPR = (() => {
  const rnd = mulberry32(21);
  return [
    Array.from({ length: 16 }, () => makeSpruce(rnd, true)),   // isot kuuset
    Array.from({ length: 8 }, () => makeSpruce(rnd, false)),   // nuoret kuuset
    Array.from({ length: 5 }, () => makeRock(rnd)),            // kivet metsän laidassa
    [],                                                        // tyhjä ruutu
    Array.from({ length: 5 }, () => makePine(rnd)),            // männyt
    Array.from({ length: 5 }, () => makeBirch(rnd)),           // koivut
  ].map((set, k) => (k === K_ROCK ? set : set.map(addSwayFrames)));
})();
const WATER_ROCK_SPR = (() => { const rnd = mulberry32(33); return Array.from({ length: 6 }, () => makeRock(rnd, true)); })();
const GRASS_SPR = (() => {
  const rnd = mulberry32(41);
  return [Array.from({ length: 6 }, () => makeGrass(rnd, false)), Array.from({ length: 6 }, () => makeGrass(rnd, true)), Array.from({ length: 8 }, () => makeGrass(rnd, false, true))];
})();
const SIL = { player: silhouette(PLAYER_SPR.S[0].img) };

// Ruosteenoranssi retkiteltta, ovi päädyssä lammen puolella
function buildTent() {
  const c = makeCanvas(40, 40), g = c.getContext('2d');
  const ox = 20, oy = 20, Z = 15;
  const P = (u, v, z) => [(u - v) * HW + ox, (u + v) * HH - z + oy];
  const L = (p, q, col) => plotLine(g, p[0], p[1], q[0], q[1], col);
  // Varjo maassa
  polyFill(g, [P(-0.15, -0.1, 0), P(2.1, -0.1, 0), P(2.1, 2.25, 0), P(-0.15, 2.25, 0)], 'rgba(0, 0, 0, 0.28)');
  L(P(0, 1, Z), P(-0.7, 0.6, 0), '#b8aa80');
  g.fillStyle = '#4a2f1a'; g.fillRect(Math.round(P(-0.7, 0.6, 0)[0]), Math.round(P(-0.7, 0.6, 0)[1]) - 1, 1, 2);
  const back = [P(0, 0, 0), P(2, 0, 0), P(2, 1, Z), P(0, 1, Z)];
  const frontS = [P(0, 1, Z), P(2, 1, Z), P(2, 2, 0), P(0, 2, 0)];
  const end = [P(2, 0, 0), P(2, 2, 0), P(2, 1, Z)];
  polyFill(g, back, '#7e3e1c');
  polyFill(g, frontS, '#b0602c');
  polyFill(g, end, '#984e24');
  // Kangaskaistaleiden saumat ja valoisampi yläosa etulappeessa
  for (const u of [0.5, 1, 1.5]) {
    L(P(u, 1, Z), P(u, 2, 0), '#9a5226');
    L(P(u, 1, Z), P(u, 0, 0), '#6a3418');
  }
  polyFill(g, [P(0, 1, Z), P(2, 1, Z), P(2, 1.3, Z * 0.7), P(0, 1.3, Z * 0.7)], '#c8763c');
  for (const u of [0.5, 1, 1.5]) L(P(u, 1, Z), P(u, 1.3, Z * 0.7), '#b06630');
  L(P(0, 1.92, 1), P(2, 1.92, 1), '#8a4620');
  // Oviaukko päädyssä: tumma sisäpuoli ja sivulle käännetty ovilappu
  polyFill(g, [P(2, 0.62, 0), P(2, 1.38, 0), P(2, 1, Z * 0.62)], '#1e120a');
  polyFill(g, [P(2, 1.38, 0), P(2.02, 1.72, 0), P(2, 1, Z * 0.62)], '#c27038');
  L(P(2, 1, Z * 0.62), P(2.02, 1.72, 0), '#d88a4e');
  // Ääriviivat ja harjalinja
  for (const [a, b] of [[P(0, 1, Z), P(0, 0, 0)], [P(0, 1, Z), P(0, 2, 0)], [P(0, 2, 0), P(2, 2, 0)], [P(2, 2, 0), P(2, 0, 0)]]) L(a, b, '#3a1e0e');
  for (const [a, b] of [[P(2, 0, 0), P(0, 0, 0)], [P(2, 1, Z), P(2, 2, 0)], [P(2, 1, Z), P(2, 0, 0)]]) L(a, b, '#4a2612');
  L(P(0, 1, Z), P(2, 1, Z), '#e09a5a');
  // Tukinarut ja kiilat
  for (const [a, b] of [[P(2, 1, Z), P(2.75, 1.55, 0)], [P(2, 1, Z), P(2.75, 0.45, 0)]]) {
    L(a, b, '#d8c99a');
    g.fillStyle = '#4a2f1a'; g.fillRect(Math.round(b[0]), Math.round(b[1]) - 1, 1, 2);
  }
  for (const t of [P(0, 1, Z), P(2, 1, Z)]) { g.fillStyle = '#5a3b22'; g.fillRect(Math.round(t[0]), Math.round(t[1]) - 2, 1, 2); }
  return c;
}
const TENT_IMG = buildTent();

// ---------------------------------------------------------------------------
// Kartta: pyöreä lampi, sitä kiertävä rantapenger, aukea vasemmalla rannalla ja synkkä kuusimetsä
// ---------------------------------------------------------------------------
const type = new Uint8Array(N * N);
const kind = new Uint8Array(N * N);     // metsäruudun sisältö (K_SPRUCE, K_YOUNG, K_ROCK, K_NONE, K_PINE, K_BIRCH)
const vari = new Uint8Array(N * N);     // maaruudun muunnelma (0–3)
const pvar = new Uint8Array(N * N);     // puun tai kiven muunnelma
const gkind = new Uint8Array(N * N);    // maaruudun laji (ks. drawTile)
const ground = makeCanvas(N * HW * 2, N * HH * 2);
const gctx = ground.getContext('2d');
let decor = [];                          // ruohot ja kaislat: { x, y, spr, reed }
let waterRocks = [];                     // kivet rantavedessä: { x, y, spr }
let shoreA = 0, shoreB = 0, shoreC = 0, shoreD = 0, shoreE = 0;  // rantaviivan satunnaiset vaiheet
const DOCK_ANG = Math.PI * 0.75;          // laiturin suunta lammen keskipisteestä (aukean kohdalla)

// Rantaviiva on epäsäännöllinen: lampi on hieman soikea, rannassa on lahtia ja niemiä sekä pientä
// mutkittelua. Aukean ja laiturin kohdalla ranta pysyy lähes paikallaan, jotta aukea rajautuu lampeen.
const pondR = (a) => {
  const v = Math.sin(a * 2 + shoreA) * 2.1 + Math.sin(a * 3 + shoreB) * 1.4 + Math.sin(a * 5 + shoreD) * 0.8
    + Math.sin(a * 9 + shoreE) * 0.35 + Math.sin(a * 14 + shoreC) * 0.15;
  return POND_R + v * (0.3 + 0.7 * smooth(Math.abs(angDiff(a, DOCK_ANG)) / 0.7));
};
const bankW = (a) => 3.25 + Math.sin(a * 5 + shoreC) * 0.55 + Math.sin(a * 11 + shoreA) * 0.2;
// Etäisyys rantaviivasta: negatiivinen vedessä
function shoreDist(x, y) {
  const dx = x - C, dy = y - C;
  return Math.hypot(dx, dy) - pondR(Math.atan2(dy, dx));
}
// Etäisyys penkereen ulkoreunasta (metsän rajasta): positiivinen metsässä
function forestDist(x, y) {
  const dx = x - C, dy = y - C, a = Math.atan2(dy, dx);
  return Math.hypot(dx, dy) - pondR(a) - bankW(a);
}
function inClearing(x, y) {
  // Pyöristetty suorakaide (superellipsi), jonka reuna mutkittelee hieman
  const u = x - y, v = x + y;
  const uc = (CLEARING.u0 + CLEARING.u1) / 2, vc = (CLEARING.v0 + CLEARING.v1) / 2;
  const du = (u - uc) / ((CLEARING.u1 - CLEARING.u0) / 2), dv = (v - vc) / ((CLEARING.v1 - CLEARING.v0) / 2);
  const wobble = Math.sin(u * 1.3 + v * 0.4) * 0.18 + Math.sin(v * 1.7 - u * 0.6) * 0.14;
  return du ** 4 + dv ** 4 < 1 + wobble;
}
// Laituri aukean kohdalla: lähtee penkereeltä suoraan kohti lammen keskustaa (ruudulla oikealle).
// Paikallinen koordinaatisto: t = matka rannasta laiturin suuntaan, s = poikittainen etäisyys keskilinjasta.
const DOCK_LEN = 8, DOCK_W = 1.6, DOCK_Z = 4, DOCK_BEAM = 2;   // kannen korkeus ja reunapalkin paksuus (px)
const dock = { x0: 0, y0: 0, ux: 0, uy: 0, px: 0, py: 0 };
function dockLocal(x, y) {
  const dx = x - dock.x0, dy = y - dock.y0;
  return [dx * dock.ux + dy * dock.uy, dx * dock.px + dy * dock.py];
}
// Onko piste laiturilla; m kasvattaa (tai negatiivisena kaventaa) aluetta
function onDock(x, y, m = 0) {
  const [t, s] = dockLocal(x, y);
  return t > -m && t < DOCK_LEN + m && Math.abs(s) < DOCK_W / 2 + m;
}
const nearCamp = (x, y, r) => Math.hypot(x - CAMP.cx - 0.5, y - CAMP.cy - 0.5) < r || Math.hypot(x - TENT.cx - 1, y - TENT.cy - 1) < r;
// Aukean edessä (ruudulla sen alapuolella) kasvaa vain nuorta kuusikkoa, jotta korkeat kuuset eivät peitä telttaa ja nuotiota
const belowClearing = (x, y) => x - y > CLEARING.u0 - 2.5 && x - y < CLEARING.u1 && x + y >= CLEARING.v1 - 1 && x + y < CLEARING.v1 + 14;

// Metsän reunassa (näin monta ruutua lähimmästä metsättömästä ruudusta: penger, aukea, vesi) puu on joka
// ruudussa, sen takana vain joka kolmannessa ja syvimmällä (yli FOREST_SPARSE_DEPTH) vain joka neljännessä
// (parillinen x ja y). Varjot piirretään vain reunan puille.
const FOREST_FULL_DEPTH = 2, FOREST_SPARSE_DEPTH = 7;
const forestEdge = new Uint8Array(N * N);   // metsäruudun etäisyys (ruutuina) lähimpään metsättömään ruutuun
function calcForestEdge() {
  forestEdge.fill(255);
  const q = [];
  for (let i = 0; i < N * N; i++) if (type[i] !== T_FOREST) { forestEdge[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], cx = i % N, cy = (i / N) | 0, d = forestEdge[i] + 1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const x = cx + ox, y = cy + oy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const j = y * N + x;
      if (forestEdge[j] > d) { forestEdge[j] = d; q.push(j); }
    }
  }
}

function genMap() {
  const rnd = mulberry32(Math.floor(Math.random() * 1e9));
  shoreA = rnd() * 6.28; shoreB = rnd() * 6.28; shoreC = rnd() * 6.28; shoreD = rnd() * 6.28; shoreE = rnd() * 6.28;
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      const i = cy * N + cx, x = cx + 0.5, y = cy + 0.5;
      vari[i] = Math.floor(rnd() * 4);
      const s = shoreDist(x, y), f = forestDist(x, y);
      gkind[i] = 0;
      if (s < 0) type[i] = T_WATER;
      else if (inClearing(x, y)) type[i] = T_CLEAR;
      else if (f < 0 && cx > 1 && cy > 1 && cx < N - 2 && cy < N - 2) {
        type[i] = T_BANK;
        // Penkereellä kulkee kulunut polku vähän rantaviivan takana
        if (s < 0.9) gkind[i] = 1;
        else if (Math.abs(s - bankW(Math.atan2(y - C, x - C)) * 0.55) < 0.45 && rnd() < 0.7) gkind[i] = 2;
      } else {
        type[i] = T_FOREST;
        const k = rnd();
        // Metsän laidalla kasvaa enemmän nuoria kuusia ja koivuja, syvemmällä isoja kuusia.
        // Mäntyjä ja koivuja on selvästi harvemmassa kuin kuusia.
        if (f < 1.6) kind[i] = k < 0.32 ? K_SPRUCE : k < 0.7 ? K_YOUNG : k < 0.76 ? K_ROCK : k < 0.795 ? K_BIRCH : k < 0.81 ? K_PINE : K_NONE;
        else kind[i] = k < 0.66 ? K_SPRUCE : k < 0.82 ? K_YOUNG : k < 0.84 ? K_ROCK : k < 0.855 ? K_PINE : k < 0.868 ? K_BIRCH : K_NONE;
        if (belowClearing(x, y)) kind[i] = k < 0.62 ? K_YOUNG : k < 0.7 ? K_ROCK : K_NONE;
        pvar[i] = Math.floor(rnd() * FOREST_SPR[kind[i]].length);
      }
    }
  }
  for (let ox = 0; ox < 2; ox++) for (let oy = 0; oy < 2; oy++) type[(TENT.cy + oy) * N + TENT.cx + ox] = T_TENT;
  type[CAMP.cy * N + CAMP.cx] = T_CAMP;
  placeShed();
  calcForestEdge();
  // Syvemmällä metsässä puita on harvemmin: kevyempi piirtää
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const i = cy * N + cx, d = forestEdge[i];
    if (type[i] !== T_FOREST || d <= FOREST_FULL_DEPTH) continue;
    if (d > FOREST_SPARSE_DEPTH ? ((cx | cy) & 1) : (cx + 2 * cy) % 3) kind[i] = K_NONE;
  }

  // Laituri lähtee penkereeltä aukean kohdalla (ruudulla lammen vasen reuna) kohti lammen keskustaa
  const da = DOCK_ANG, r0 = pondR(da) + 0.8;
  Object.assign(dock, { x0: C + Math.cos(da) * r0, y0: C + Math.sin(da) * r0, ux: -Math.cos(da), uy: -Math.sin(da), px: -Math.sin(da), py: Math.cos(da) });

  // Ruohotuppaita siellä täällä penkereellä ja aukealla (ei nuotion ja teltan ympärillä eikä laiturin kohdalla),
  // kaisloja matalassa rantavedessä
  decor = [];
  for (let i = 0; i < N * N; i++) {
    if ((type[i] !== T_BANK && type[i] !== T_CLEAR) || rnd() > 0.09) continue;
    const x = (i % N) + rnd(), y = ((i / N) | 0) + rnd();
    if (nearCamp(x, y, 2.7) || onDock(x, y, 1)) continue;
    if (type[cellIdx(x, y)] === T_BANK || type[cellIdx(x, y)] === T_CLEAR) decor.push({ x, y, spr: GRASS_SPR[0][Math.floor(rnd() * 6)], reed: false });
  }
  // Lyhyttä ruohoa tiheämmin, myös lähempänä nuotiota (ei aivan tulisijan vieressä)
  for (let i = 0; i < N * N; i++) {
    if ((type[i] !== T_BANK && type[i] !== T_CLEAR) || rnd() > 0.55) continue;
    const x = (i % N) + rnd(), y = ((i / N) | 0) + rnd();
    if (nearCamp(x, y, 1.9) || onDock(x, y, 0.6) || shoreDist(x, y) < 0.2) continue;
    if (type[cellIdx(x, y)] === T_BANK || type[cellIdx(x, y)] === T_CLEAR) decor.push({ x, y, spr: GRASS_SPR[2][Math.floor(rnd() * 8)], reed: false });
  }
  for (let a = 0; a < Math.PI * 2; a += 0.012) {
    // Kaislikko kasvaa vain vedessä ja laikuittain: paikoin leveänä tiheänä vyönä, paikoin kapeana ja harvana.
    // Kaislikon väliin jää avoimia rantakohtia, joista pääsee kalastamaan vapaasti.
    if (Math.sin(a * 9 + shoreC) + 0.6 * Math.sin(a * 23 + shoreA) > 0.45) continue;
    const dense = 0.5 + 0.5 * Math.sin(a * 6 + shoreB) * Math.cos(a * 2.3 + shoreD);
    if (rnd() > 0.5 + 0.6 * dense) continue;
    const r = pondR(a) - (0.15 + Math.pow(rnd(), 1.4) * (0.8 + dense * 2.2)), x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    if (shoreDist(x, y) > -0.1 || onDock(x, y, 1.2)) continue;
    decor.push({ x, y, spr: GRASS_SPR[1][Math.floor(rnd() * 6)], reed: true });
  }
  // Kiviä rantavedessä, yksittäin ja pieninä ryhminä
  waterRocks = [];
  for (let tries = 0; tries < 200 && waterRocks.length < 14; tries++) {
    let a = rnd() * Math.PI * 2;
    for (let n = rnd() < 0.35 ? 2 : 1; n > 0; n--) {
      const r = pondR(a) - (0.5 + rnd() * 3.5), x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
      if (onDock(x, y, 2.5) || waterRocks.some((o) => Math.hypot(o.x - x, o.y - y) < 1.1)) continue;
      waterRocks.push({ x, y, spr: WATER_ROCK_SPR[Math.floor(rnd() * WATER_ROCK_SPR.length)] });
      a += (rnd() < 0.5 ? -1 : 1) * 0.05;
    }
  }
}

function drawTile(cx, cy) {
  const i = cy * N + cx, t = type[i];
  let set;
  if (t === T_WATER) set = TILES.mud;
  else if (t === T_FOREST) set = TILES.needles;
  else if (t === T_CAMP) set = TILES.dirt;
  else if (t === T_CLEAR || t === T_TENT || t === T_SHED) set = Math.hypot(cx + 0.5 - CAMP.cx - 0.5, cy + 0.5 - CAMP.cy - 0.5) < 1.6 ? TILES.dirt : TILES.grass;
  else set = gkind[i] === 1 ? TILES.shore : gkind[i] === 2 ? TILES.path : TILES.grass;
  gctx.drawImage(set[vari[i]], isoX(cx, cy) - HW, isoY(cx, cy));
}

function buildGround() {
  gctx.clearRect(0, 0, ground.width, ground.height);
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) drawTile(cx, cy);
}

const playerSolid = (t) => t === T_FOREST || t === T_TENT || t === T_CAMP || t === T_SHED;

// ---------------------------------------------------------------------------
// Maaston korkeus. Maa on tasaista (korkeus 0) paitsi lammen kohdalla, jossa pohja laskee.
// Korkeus näkyy ruudulla pystysiirtymänä: Z_PX pikseliä metriä kohden, joten syvä kohta piirtyy
// alemmas. Lammen pohja piirretään kerran valmiiksi sarake kerrallaan kaukaa lähelle, jolloin
// lähempänä olevat rinteet peittävät taaempana olevat. Näin syntyy syvyysilluusio ilman 3D-mallia.
// ---------------------------------------------------------------------------
// Mittakaava: hahmo on noin 20 px ja 180 cm, joten 1 m = 100 / 9 px (≈ 11,1 px). Kiinteät esineet (spritet, laituri, puut) pidetään pikselikooltaan
// ennallaan; korkeudet ja syvyydet (metreinä) piirtyvät tällä mittakaavalla.
const Z_PX = 100 / 9;
const DEPTH_RES = 0.25, DEPTH_X0 = C - POND_RMAX - 1, DEPTH_N = Math.ceil(((POND_RMAX + 1) * 2) / DEPTH_RES) + 2;
let depthGrid = null;
// Syvä kohta: kaksi päällekkäistä lohkoa, joiden reunaa aaltoilevat satunnaiset vaiheet (p1–p3)
const deepHole = { x: 0, y: 0, x2: 0, y2: 0, r: 5, depth: 4, p1: 0, p2: 0, p3: 0 };

// Lammen syvyysmalli: matala rantaterassi, loivasti syvenevä rinne ja lähes tasainen keskipohja
// pienine kumpuiluineen sekä yksi syvä kuoppa, jonka reunat ovat jyrkemmät. Kaikki siirtymät ovat
// pehmeitä (smoothstep), joten pohjassa ei ole teräviä reunoja.
function depthModel(x, y) {
  const s = shoreDist(x, y);
  if (s >= 0) return 0;
  const e = -s;
  let d = 0.22 * Math.min(e, 3.5)        // rantaterassi: noin 0,8 m kolmen metrin päässä rannasta
    + 2.9 * smooth((e - 2.5) / 8)        // rinne
    + 0.5 * smooth((e - 10) / 12);       // keskiosa syvenee vielä hieman (noin 4 m)
  d += Math.sin(x * 0.23 + shoreA) * Math.cos(y * 0.19 + shoreB) * 0.35 * smooth(e / 6);
  // Syvänne on epämääräisen muotoinen: reunan säde vaihtelee suunnan mukaan ja sivulla on toinen,
  // matalampi lohko. Pohja kumpuilee hieman.
  const H = deepHole, a = Math.atan2(y - H.y, x - H.x);
  const rr = H.r * (1 + 0.28 * Math.sin(2 * a + H.p1) + 0.16 * Math.sin(3 * a + H.p2) + 0.08 * Math.sin(5 * a + H.p3));
  const h1 = Math.hypot(x - H.x, y - H.y) / rr, h2 = Math.hypot(x - H.x2, y - H.y2) / (H.r * 0.6);
  const hole = Math.max(smooth((1 - h1) / 0.62), 0.7 * smooth((1 - h2) / 0.7));
  d += H.depth * hole * (1 + 0.12 * Math.sin(x * 0.9) * Math.cos(y * 0.7));
  return Math.max(0, d);
}

function buildDepth() {
  const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 5, b = Math.random() * Math.PI * 2;
  deepHole.x = C + Math.cos(a) * r; deepHole.y = C + Math.sin(a) * r;
  deepHole.x2 = deepHole.x + Math.cos(b) * deepHole.r * 0.95; deepHole.y2 = deepHole.y + Math.sin(b) * deepHole.r * 0.95;
  deepHole.p1 = Math.random() * 6.28; deepHole.p2 = Math.random() * 6.28; deepHole.p3 = Math.random() * 6.28;
  depthGrid = new Float32Array(DEPTH_N * DEPTH_N);
  for (let j = 0; j < DEPTH_N; j++) for (let i = 0; i < DEPTH_N; i++) depthGrid[j * DEPTH_N + i] = depthModel(DEPTH_X0 + i * DEPTH_RES, DEPTH_X0 + j * DEPTH_RES);
}

// Syvyys metreinä (bilineaarinen interpolointi ruudukosta); 0 lammen ulkopuolella
function depthAt(x, y) {
  const fx = (x - DEPTH_X0) / DEPTH_RES, fy = (y - DEPTH_X0) / DEPTH_RES;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= DEPTH_N - 1 || j >= DEPTH_N - 1) return 0;
  const tx = fx - i, ty = fy - j, k = j * DEPTH_N + i;
  return lerp(lerp(depthGrid[k], depthGrid[k + 1], tx), lerp(depthGrid[k + DEPTH_N], depthGrid[k + DEPTH_N + 1], tx), ty);
}
// Maaston korkeus metreinä (negatiivinen lammen pohjassa). Maastoon asetettavat asiat siirtyvät
// ruudulla terrainZ * Z_PX pikseliä ylöspäin.
const terrainZ = (x, y) => -depthAt(x, y);

// Pohjan väri: rannassa hiekkaa ja somerikkoa, syvemmällä liejua, syvänteessä lähes mustaa.
// Rinteet varjostetaan pinnan normaalin mukaan (valo vasemmalta ylhäältä).
const BOTTOM_KEYS = [[0, [128, 116, 84]], [0.8, [100, 92, 64]], [2, [74, 70, 48]], [4, [50, 48, 36]], [7, [34, 34, 30]]];
const hash2 = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
function bottomColor(x, y, d) {
  let k = 0;
  while (k < BOTTOM_KEYS.length - 2 && BOTTOM_KEYS[k + 1][0] <= d) k++;
  const [d0, c0] = BOTTOM_KEYS[k], [d1, c1] = BOTTOM_KEYS[k + 1];
  let c = lerp3(c0, c1, clamp((d - d0) / (d1 - d0), 0, 1));
  const gx = (depthAt(x + 0.25, y) - depthAt(x - 0.25, y)) * 2 * 2.4, gy = (depthAt(x, y + 0.25) - depthAt(x, y - 0.25)) * 2 * 2.4;
  const nl = Math.hypot(gx, gy, 1), shade = 0.55 + 0.6 * ((gx * -0.6 + gy * -0.2 + 0.77) / nl);
  const n = hash2(Math.floor(x * 4), Math.floor(y * 4));
  if (d < 1 && n > 0.95) c = lerp3(c, [150, 144, 128], 0.6);  // kiviä ja soraa rantaterassilla
  else if (d > 1 && n > 0.975) c = lerp3(c, [20, 18, 14], 0.6); // uponneita risuja ja lehtiä
  const t = 0.92 + n * 0.16;
  return [c[0] * shade * t, c[1] * shade * t, c[2] * shade * t];
}

let basinCanvas = null, contourCanvas = null;
let seenDepth = null;   // kunkin lammen pikselin kohdalla näkyvän pohjan syvyys (veden paksuus)
function buildBasin() {
  basinCanvas = makeCanvas(PB.w, PB.h); contourCanvas = makeCanvas(PB.w, PB.h);
  const bctx = basinCanvas.getContext('2d'), cctx = contourCanvas.getContext('2d');
  const img = bctx.createImageData(PB.w, PB.h), cimg = cctx.createImageData(PB.w, PB.h), bd = img.data, cd = cimg.data;
  seenDepth = new Float32Array(PB.w * PB.h);
  const STEP = 0.5, n = Math.ceil(PB.h / STEP) + 1;
  const sy = new Float32Array(n), dd = new Float32Array(n), wxA = new Float32Array(n), wyA = new Float32Array(n), inP = new Uint8Array(n);
  for (let x = 0; x < PB.w; x++) {
    const u = (PB.x0 + x + 0.5 - N * HW) / HW;
    for (let i = 0; i < n; i++) {
      const v = (PB.y0 + i * STEP) / HH;
      wxA[i] = (u + v) / 2; wyA[i] = (v - u) / 2;
      inP[i] = shoreDist(wxA[i], wyA[i]) < 0.05 ? 1 : 0;
      dd[i] = inP[i] ? depthAt(wxA[i], wyA[i]) : 0;
      sy[i] = i * STEP + dd[i] * Z_PX;
    }
    // Kaukaa lähelle: jokainen näyte täyttää pikselit omasta paikastaan seuraavan näytteen paikkaan,
    // ja myöhemmin piirretty (lähempi) näyte peittää aiemmin piirretyn
    for (let i = 0; i < n; i++) {
      if (!inP[i]) continue;
      const top = Math.floor(sy[i]), bot = i + 1 < n && sy[i + 1] > sy[i] ? Math.max(top, Math.floor(sy[i + 1]) - 1) : top;
      const col = bottomColor(wxA[i], wyA[i], dd[i]);
      // Syvyyskäyrä joka metrin välein (arviointia varten)
      const grad = i > 0 && i + 1 < n ? Math.abs(dd[i + 1] - dd[i - 1]) : 0, fr = dd[i] % 1, wdt = 0.02 + grad * 0.5;
      const contour = dd[i] > 0.3 && (fr < wdt || fr > 1 - wdt);
      for (let py = Math.max(0, top); py <= bot && py < PB.h; py++) {
        const k = py * PB.w + x, m = pondMask[k];
        if (m !== 1 && m !== 2) continue;
        bd[k * 4] = col[0]; bd[k * 4 + 1] = col[1]; bd[k * 4 + 2] = col[2]; bd[k * 4 + 3] = 255;
        seenDepth[k] = dd[i];
        if (contour) { cd[k * 4] = 235; cd[k * 4 + 1] = 222; cd[k * 4 + 2] = 160; cd[k * 4 + 3] = Math.floor(dd[i] + 0.5) % 5 === 0 ? 140 : 75; }
        else cd[k * 4 + 3] = 0;
      }
    }
  }
  bctx.putImageData(img, 0, 0);
  cctx.putImageData(cimg, 0, 0);
}

// ---------------------------------------------------------------------------
// Lammen vesi. Vesi piirretään joka ruudunpäivitys pikseli kerrallaan läpinäkyvänä kerroksena
// pohjan päälle: mitä syvempää ja sameampaa vesi on, sitä vähemmän pohjaa näkyy. Pintaan heijastuvat
// taivas ja kauimman rannan kuuset, tuuli piirtää pintaan väreitä ja vääristää heijastusta.
// ---------------------------------------------------------------------------
// show = piirretäänkö vesi (vesi on aina olemassa: piilotettuna kalat uivat "ilmassa" ja linnut
// näkymättömällä pinnalla), turb = sameus (valon vaimeneminen metriä kohden), contours = syvyyskäyrät
const water = { show: true, turb: 2.5, contours: false };
const PB = { x0: 0, y0: 0, w: 0, h: 0 };   // lammen alue absoluuttisina pikseleinä
let pondMask = null;    // 0 = ei vettä, 1 = vesi, 2 = rantaviiva, 3 = märkä rantakaista
let pondRefl = null;    // kuusten heijastus: < 100 = heijastuksen sisällä (arvo = suhteellinen syvyys)
const NOISE_W = 128, NOISE_H = 64;
// Aaltojen väreet: lyhyitä vaakasuoria viiruja, joilla jokaisella oma kynnysarvo
const WAVE_NOISE = (() => {
  const rnd = mulberry32(5), a = new Float32Array(NOISE_W * NOISE_H);
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(rnd() * NOISE_W), y = Math.floor(rnd() * NOISE_H), len = 2 + Math.floor(rnd() * 5), v = rnd();
    for (let j = 0; j < len; j++) { const i = y * NOISE_W + ((x + j) % NOISE_W); a[i] = Math.max(a[i], v); }
  }
  return a;
})();
const waterCanvas = makeCanvas(W, H);
const waterCtx = waterCanvas.getContext('2d');
let waterImg = waterCtx.createImageData(W, H);
const waveOff = { x: 0, y: 0 };

function buildPond() {
  const R = POND_RMAX + 1;
  const pcx = isoX(C, C), pcy = isoY(C, C);
  PB.x0 = Math.floor(pcx - R * 11.4); PB.w = Math.ceil(R * 22.8);
  PB.y0 = Math.floor(pcy - R * 5.7); PB.h = Math.ceil(R * 11.4);
  pondMask = new Uint8Array(PB.w * PB.h);
  pondRefl = new Uint8Array(PB.w * PB.h).fill(255);
  for (let y = 0; y < PB.h; y++) {
    for (let x = 0; x < PB.w; x++) {
      const [wx, wy] = absToWorld(PB.x0 + x + 0.5, PB.y0 + y + 0.5);
      const s = shoreDist(wx, wy), wa = Math.atan2(wy - C, wx - C);
      // Märkä rantakaista vaihtelee leveydeltään, jotta rantaan ei synny tasaista viivaa
      const wet = 0.05 + 0.3 * smooth(0.5 + 0.5 * Math.sin(wa * 17 + shoreA) * Math.sin(wa * 6 + shoreE)) * hash2(Math.floor(wx * 3), Math.floor(wy * 3)) * 2;
      pondMask[y * PB.w + x] = s < -0.13 ? 1 : s < 0 ? 2 : s < wet ? 3 : 0;
    }
  }
  // Kuusten heijastus: jokaiselle sarakkeelle oma korkeus, jossa vuorottelevat latvojen kärjet
  const rnd = mulberry32(9), peaks = [];
  for (let px = -10; px < PB.w + 10; px += 6 + rnd() * 7) peaks.push([px, 26 + rnd() * 26]);
  for (let x = 0; x < PB.w; x++) {
    let th = 14;
    for (const [p, h] of peaks) th = Math.max(th, h - Math.abs(x - p) * 1.9);
    let top = -1;
    for (let y = 0; y < PB.h; y++) {
      const m = pondMask[y * PB.w + x];
      if (m !== 1 && m !== 2) continue;
      if (top < 0) top = y;
      pondRefl[y * PB.w + x] = Math.min(255, Math.round(((y - top) / th) * 100));
    }
  }
  // Tähtien heijastuskohdat: satunnaisia pisteitä avoimella vedellä (ei rannan puiden heijastuksessa)
  const srnd = mulberry32(17);
  stars = [];
  for (let k = 0; k < pondMask.length; k++) {
    if (pondMask[k] !== 1 || pondRefl[k] < 115 || srnd() > 0.0035) continue;
    stars.push({ x: PB.x0 + (k % PB.w), y: PB.y0 + Math.floor(k / PB.w), b: 0.35 + srnd() * 0.65, ph: srnd() * 6.28, sp: 0.5 + srnd() });
  }
  buildDepth();
  buildBasin();
  buildDock();
  placeBoat();
  placeLilies();
  turbFor = -1;
  pondMaskCanvas = makeCanvas(PB.w, PB.h);
  const mctx = pondMaskCanvas.getContext('2d'), mimg = mctx.createImageData(PB.w, PB.h);
  for (let k = 0; k < pondMask.length; k++) if (pondMask[k] === 1 || pondMask[k] === 2) mimg.data[k * 4 + 3] = 255;
  mctx.putImageData(mimg, 0, 0);
}

// Laituri: lankkukansi, kyljet ja veteen menevät paalut. Kuva piirretään kerran absoluuttisiin koordinaatteihin.
let dockImg = null, dockBX = 0, dockBY = 0;
function buildDock() {
  const P0 = (t, s, z) => { const x = dock.x0 + dock.ux * t + dock.px * s, y = dock.y0 + dock.uy * t + dock.py * s; return [isoX(x, y), isoY(x, y) - z]; };
  const w2 = DOCK_W / 2;
  const pts = [[0, -w2], [DOCK_LEN, -w2], [DOCK_LEN, w2], [0, w2]].map(([t, s]) => P0(t, s, 0));
  dockBX = Math.floor(Math.min(...pts.map((q) => q[0]))) - 4; dockBY = Math.floor(Math.min(...pts.map((q) => q[1]))) - 8;
  const wd = Math.ceil(Math.max(...pts.map((q) => q[0]))) - dockBX + 8, ht = Math.ceil(Math.max(...pts.map((q) => q[1]))) - dockBY + 12 + 30;
  dockImg = makeCanvas(wd, ht);
  const g = dockImg.getContext('2d');
  const P = (t, s, z) => { const [x, y] = P0(t, s, z); return [x - dockBX, y - dockBY]; };
  const L = (a, b, col) => plotLine(g, a[0], a[1], b[0], b[1], col);
  // s < 0 on katsojaa kohti oleva kylki, laiturin pää on ruudulla oikealla.
  // Paalujen pinnan yläpuolinen osa (reunapalkin alta vedenpintaan) kuuluu laiturin kuvaan; veden alla
  // oleva osa piirretään vedenalaiselle kerrokselle ja häivytetään syvyyden mukaan (drawDockPosts).
  dock.posts = [];
  const zb = DOCK_Z - DOCK_BEAM;
  for (const t of [1.6, 3.8, 6, DOCK_LEN - 0.15]) {
    const [x, y] = P(t, -w2 + 0.08, 0);
    const wx = dock.x0 + dock.ux * t + dock.px * (-w2 + 0.08), wy = dock.y0 + dock.uy * t + dock.py * (-w2 + 0.08);
    const xr = Math.round(x), yr = Math.round(y);
    g.fillStyle = '#3a2a1a'; g.fillRect(xr, yr - zb, 1, zb + 1);
    g.fillStyle = '#5a442c'; g.fillRect(xr - 1, yr - zb, 1, zb + 1);
    dock.posts.push({ ax: xr + dockBX, ay: yr + dockBY, len: Math.round(depthAt(wx, wy) * Z_PX) });
  }
  // Reunapalkit: kylki ja pää ovat kannen alla vain palkin paksuiset, joten paalut näkyvät niiden alla
  polyFill(g, [P(0, -w2, DOCK_Z), P(DOCK_LEN, -w2, DOCK_Z), P(DOCK_LEN, -w2, zb), P(0, -w2, zb)], '#4a3420');
  polyFill(g, [P(DOCK_LEN, -w2, DOCK_Z), P(DOCK_LEN, w2, DOCK_Z), P(DOCK_LEN, w2, zb), P(DOCK_LEN, -w2, zb)], '#5e4228');
  polyFill(g, [P(0, -w2, DOCK_Z), P(DOCK_LEN, -w2, DOCK_Z), P(DOCK_LEN, w2, DOCK_Z), P(0, w2, DOCK_Z)], '#8a6a44');
  // Lankut poikittain, niiden väleissä tummat raot; osa lankuista vaaleampia ja haalistuneita
  const rnd = mulberry32(55);
  for (let t = 0.18; t < DOCK_LEN; t += 0.36) {
    if (rnd() < 0.3) L(P(t - 0.12, -w2 + 0.05, DOCK_Z), P(t - 0.12, w2 - 0.05, DOCK_Z), rnd() < 0.5 ? '#a08058' : '#7e6040');
    L(P(t, -w2, DOCK_Z), P(t, w2, DOCK_Z), '#5e4430');
  }
  // Reunojen kantopuut
  L(P(0, -w2, DOCK_Z), P(DOCK_LEN, -w2, DOCK_Z), '#a88660');
  L(P(0, w2, DOCK_Z), P(DOCK_LEN, w2, DOCK_Z), '#6a4e30');
  L(P(0, -w2, zb), P(DOCK_LEN, -w2, zb), '#2a1c10');
}

// Laiturin paalujen vedenalainen osa: häipyy syvyyden ja sameuden mukaan (vedenalaiselle kerrokselle)
function drawDockPosts(g, camXr, camYr) {
  for (const o of dock.posts || []) {
    const x = o.ax - camXr, y = o.ay - camYr;
    if (x < -2 || x > W + 2 || y > H || y + o.len < 0) continue;
    for (let k = 1; k <= o.len; k++) {
      g.globalAlpha = underVis(k / Z_PX);
      g.fillStyle = '#2e2216'; g.fillRect(x, y + k, 1, 1);
      g.fillStyle = '#4a3826'; g.fillRect(x - 1, y + k, 1, 1);
    }
  }
  g.globalAlpha = 1;
}

// Lumpeet (valkoinen kukka) ja ulpukat (keltainen kukka) kelluvat rannan tuntumassa matalassa
// vedessä ryhminä. Lehdet ovat litistettyjä soikioita, joissa on lovi; valo tulee vasemmalta ylhäältä.
function makeLilyPad(rnd, yellow) {
  const rx = 2.6 + rnd() * 1.8, ry = rx * 0.5, w = Math.ceil(rx * 2) + 2, h = Math.ceil(ry * 2) + 2;
  const c = makeCanvas(w, h), g = c.getContext('2d'), cx = w / 2, cy = h / 2, notch = rnd() * Math.PI * 2;
  const T = yellow ? ['#2e4a1c', '#4a6e2a', '#6a8c3a', '#86a848'] : ['#264a22', '#3e6a2e', '#5a8a3c', '#78a64c'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    if (d > 0.08 && Math.abs(angDiff(Math.atan2(ny, nx), notch)) < 0.32) continue;   // lehden lovi
    const l = -0.5 * nx - 0.8 * ny + (rnd() - 0.5) * 0.4;
    g.fillStyle = d > 0.7 && ny > 0 ? T[0] : T[l > 0.5 ? 3 : l > -0.1 ? 2 : 1];
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
const LILY_SPR = (() => {
  const rnd = mulberry32(61);
  return { white: Array.from({ length: 6 }, () => makeLilyPad(rnd, false)), yellow: Array.from({ length: 6 }, () => makeLilyPad(rnd, true)) };
})();
let lilies = [];
function placeLilies() {
  const rnd = mulberry32(Math.floor(Math.random() * 1e9));
  lilies = [];
  for (let c = 0; c < 17; c++) {
    const yellow = rnd() < 0.45, a = rnd() * Math.PI * 2;
    const r0 = pondR(a) - (0.8 + rnd() * 2.2), cx = C + Math.cos(a) * r0, cy = C + Math.sin(a) * r0;
    if (onDock(cx, cy, 2.5)) continue;
    for (let n = 0, m = 4 + Math.floor(rnd() * 8); n < m; n++) {
      const x = cx + (rnd() - 0.5) * 3, y = cy + (rnd() - 0.5) * 3, d = depthAt(x, y);
      if (shoreDist(x, y) > -0.4 || d < 0.2 || d > 1.8 || onDock(x, y, 1.5) || (boat && Math.hypot(x - boat.x, y - boat.y) < 2.4)) continue;
      if (lilies.some((o) => Math.hypot(o.x - x, o.y - y) < 0.55) || waterRocks.some((o) => Math.hypot(o.x - x, o.y - y) < 0.9)) continue;
      const set = LILY_SPR[yellow ? 'yellow' : 'white'];
      lilies.push({ x, y, pad: set[Math.floor(rnd() * set.length)], flower: rnd() < 0.3 ? (yellow ? 'yellow' : 'white') : null, ph: rnd() * 6.28 });
    }
  }
}
// Lumpeiden ja ulpukoiden varret sekä kaislojen vedenalaiset varret ulottuvat lammen pohjaan. Ne
// piirretään vedenalaiselle kerrokselle, joten ne himmenevät syvyyden ja sameuden mukaan.
function drawStems(g, camXr, camYr) {
  const stem = (wx, wy, col, bend) => {
    const x = Math.round(isoX(wx, wy) - camXr), y = Math.round(isoY(wx, wy) - camYr);
    if (x < -6 || x > W + 6 || y < -4 || y > H + 2) return;
    const len = Math.round(depthAt(wx, wy) * Z_PX);
    g.fillStyle = col;
    for (let k = 1; k <= len; k++) {
      g.globalAlpha = underVis(k / Z_PX);
      g.fillRect(x + Math.round(Math.sin((k / Math.max(1, len)) * Math.PI) * bend), y + k, 1, 1);
    }
  };
  for (const o of lilies) stem(o.x, o.y, '#4a6a2c', o.ph > 3.14 ? 1 : -1);
  for (const o of decor) if (o.reed) { stem(o.x, o.y, '#6a6a38', 0); stem(o.x + 0.06, o.y - 0.06, '#56602e', 0); }
  g.globalAlpha = 1;
}

function drawLilies(camXr, camYr) {
  for (const o of lilies) {
    const x = Math.round(isoX(o.x, o.y) - camXr), y = Math.round(isoY(o.x, o.y) - camYr);
    if (x < -8 || x > W + 8 || y < -6 || y > H + 6) continue;
    // Tuulella lehdet keinuvat hiukan
    const dx = wind.gust > 0.35 && Math.sin(time * 0.04 + o.ph) > 0.7 ? 1 : 0;
    ctx.drawImage(o.pad, x - (o.pad.width >> 1) + dx, y - (o.pad.height >> 1));
    if (o.flower === 'white') {
      dot(x - 1 + dx, y - 1, '#f4f2ea'); dot(x + 1 + dx, y - 1, '#e8e6dc'); dot(x + dx, y - 2, '#ffffff'); dot(x + dx, y, '#d8d6cc'); dot(x + dx, y - 1, '#e8c040');
    } else if (o.flower === 'yellow') {
      dot(x + dx, y - 2, '#f0d040'); dot(x - 1 + dx, y - 1, '#d8b028'); dot(x + 1 + dx, y - 1, '#e8c030'); dot(x + dx, y - 1, '#b88a18');
    }
  }
}

// Tähtien heijastukset piirretään yön pimennyksen jälkeen omalta kerrokseltaan. Ne näkyvät vain kirkkaana
// yönä; tuuli himmentää ja heiluttaa niitä.
let stars = [];
const starCanvas = makeCanvas(W, H), starCtx = starCanvas.getContext('2d');
// Tähdet piirretään vain sinne, missä vedenpinta näkyy. Ruutu kopioidaan heti veden ja vedenalaisten asioiden
// jälkeen (starSnap.a). Kun kaikki muu on piirretty, kopiota verrataan ruutuun erotuksena (difference), erotus
// vahvistetaan kyllästymään asti ja käännetään maskiksi: valkoinen = pinta näkyy, musta = päällä on jotain
// (puu, kaisla, lumme, kivi, hahmo, lintu…). Kaikki tehdään piirtokomennoilla näytönohjaimella, ilman
// pikselien lukemista, joten vertailu ei hidasta peliä.
// Maski lasketaan puolella resoluutiolla (2 px:n tarkkuus; ohut kohde peittää tähden silti, koska erotus vahvistetaan
// kyllästymään) ja vain kun kamera liikkuu tai STAR_EVERY ruudun välein: paikallaan seistessä tähtikerros
// (maski ja tuikkiminen) päivittyy 15 kertaa sekunnissa, ja muina ruutuina piirretään valmis kerros yhdellä piirrolla.
const STAR_EVERY = 4;
const starSnap = { a: makeCanvas(1, 1), mask: makeCanvas(1, 1), ok: false, redo: false, valid: false, key: '', tick: 0 };
const starVis = () => (water.show ? smooth((env.dark - 0.55) / 0.35) * (1 - env.overcast) * (1 - weather.fog) * (1 - wind.gust * 0.6) : 0);
function snapStars(which) {
  if (starVis() < 0.03 || !stars.length) { starSnap.ok = starSnap.valid = false; return; }
  const hw = (W + 1) >> 1, hh = (H + 1) >> 1, A = starSnap.a, M = starSnap.mask;
  if (which === 'a') {
    const key = Math.round(cam.x) + ',' + Math.round(cam.y) + ',' + W + ',' + H;
    starSnap.redo = key !== starSnap.key || !starSnap.valid || ++starSnap.tick >= (gfxLow ? 8 : STAR_EVERY);
    if (!starSnap.redo) return;
    starSnap.key = key; starSnap.tick = 0;
    if (A.width !== hw || A.height !== hh) { A.width = M.width = hw; A.height = M.height = hh; }
    A.getContext('2d').drawImage(buf, 0, 0, W, H, 0, 0, hw, hh);
    return;
  }
  if (!starSnap.redo) { starSnap.ok = starSnap.valid; return; }
  const ga = A.getContext('2d');
  ga.globalCompositeOperation = 'difference';
  ga.drawImage(buf, 0, 0, W, H, 0, 0, hw, hh);
  ga.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k++) ga.drawImage(A, 0, 0);   // erotus x64 -> pienikin muutos kyllästyy
  ga.globalCompositeOperation = 'source-over';
  const gm = M.getContext('2d');
  gm.globalCompositeOperation = 'source-over';
  gm.fillStyle = '#fff'; gm.fillRect(0, 0, hw, hh);
  gm.globalCompositeOperation = 'difference';
  gm.drawImage(A, 0, 0);
  gm.globalCompositeOperation = 'source-over';
  starSnap.ok = true;
}
// Tähtikerroksen värit: alfa kvantisoidaan 32 tasoon, jolloin värimerkkijonoja ei tarvitse rakentaa tähti kerrallaan
const starStyle = Array.from({ length: 33 }, (_, i) => `rgba(225, 232, 255, ${(i / 32).toFixed(3)})`);
const starStyle2 = Array.from({ length: 33 }, (_, i) => `rgba(200, 210, 255, ${(i / 32 * 0.35).toFixed(3)})`);
function drawStarReflections(camXr, camYr) {
  const vis = starVis();
  if (vis < 0.03 || !starSnap.ok) return;
  if (starSnap.redo) {
    starSnap.redo = false;
    const g = starCtx;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    // Aallokossa heijastus heiluu pikselin tai kaksi; tyynellä vain tuikkii
    const amp = wind.gust < 0.1 ? 0 : Math.min(2, (wind.gust - 0.1) * 3);
    for (const st of stars) {
      const y = st.y - camYr;
      if (y < 0 || y >= H) continue;
      const x = st.x - camXr + (amp ? Math.round(Math.sin(st.y * 0.55 + time * 0.07) * amp) : 0);
      if (x < 1 || x >= W - 1) continue;
      // Tähti pysyy paikallaan; väreilevä pinta vain himmentää ja kirkastaa sitä
      const a = vis * st.b * (0.6 + 0.4 * Math.sin(time * 0.05 * st.sp + st.ph)) * (1 - wind.gust * 0.5 * (0.5 + 0.5 * Math.sin(time * 0.11 + st.ph * 3)));
      const q = clamp(Math.round(a * 32), 0, 32);
      g.fillStyle = starStyle[q];
      g.fillRect(x, y, 1, 1);
      if (st.b > 0.85) { g.fillStyle = starStyle2[q]; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); }
    }
    // Maski poistaa tähdet kohdista, joiden päälle on piirretty jotain; musta tausta ei lisää mitään
    g.globalCompositeOperation = 'multiply';
    g.imageSmoothingEnabled = false;   // puoliresoluution maski suurennetaan teräväreunaisesti
    g.drawImage(starSnap.mask, 0, 0, starSnap.mask.width, starSnap.mask.height, 0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'source-over';
    starSnap.valid = true;
  }
  starSnap.ok = false;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(starCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

// Onko absoluuttinen pikseli veden päällä
function waterPx(ax, ay) {
  const x = ax - PB.x0, y = ay - PB.y0;
  if (x < 0 || y < 0 || x >= PB.w || y >= PB.h) return false;
  const m = pondMask[y * PB.w + x];
  return m === 1 || m === 2;
}

// Sameuden aiheuttama peittävyys kullekin lammen pikselille (lasketaan uudelleen, kun sameus muuttuu)
let turbAlpha = null, turbFor = -1;
function updateTurbidity() {
  if (turbFor === water.turb) return;
  turbFor = water.turb;
  turbAlpha = new Uint8Array(PB.w * PB.h);
  for (let k = 0; k < turbAlpha.length; k++) turbAlpha[k] = Math.round((1 - Math.exp(-water.turb * (seenDepth[k] + 0.15) * 1.3)) * 255);
}

// Veden pikselikohtainen laskenta on raskas, joten valmis vesikuva käytetään uudelleen: uusi kuva lasketaan vain kameran
// liikkuessa tai joka 2. ruudussa (kevyessä tilassa joka 4.). Aallot liikkuvat hitaasti, joten 30 Hz riittää.
let rowWob = new Int8Array(H), waterKey = '', waterTick = 0;
function drawWater(camXr, camYr) {
  const wkey = camXr + ',' + camYr + ',' + W + ',' + H;
  if (wkey === waterKey && ++waterTick < (gfxLow ? 4 : 2)) { ctx.drawImage(waterCanvas, 0, 0); return; }
  waterKey = wkey; waterTick = 0;
  updateTurbidity();
  const x0 = Math.max(0, PB.x0 - camXr), x1 = Math.min(W, PB.x0 + PB.w - camXr);
  const y0 = Math.max(0, PB.y0 - camYr), y1 = Math.min(H, PB.y0 + PB.h - camYr);
  if (x0 >= x1 || y0 >= y1) return;
  const d = waterImg.data;
  d.fill(0);
  const g = wind.gust;
  // Tyynellä vesi on lähes peilityyni; tuulella heijastus väreilee ja pintaan tulee enemmän väreitä
  for (let y = y0; y < y1; y++) rowWob[y] = Math.round(Math.sin((y + camYr) * 0.55 + time * 0.07) * (0.25 + g * 1.9));
  const thrA = 1 - (0.006 + g * 0.2 + weather.rain * 0.04), thrB = thrA + 0.02;
  const oAx = Math.floor(waveOff.x), oAy = Math.floor(waveOff.y), oBx = Math.floor(-waveOff.x * 0.6 + 37), oBy = Math.floor(waveOff.y * 0.5 + 23);
  const E = env;
  for (let y = y0; y < y1; y++) {
    const ay = y + camYr, row = (ay - PB.y0) * PB.w;
    // Kauimmainen osa heijastaa horisontin taivasta, lähin osa taivaan lakea ja on tummempi
    const f = clamp((ay - PB.y0) / PB.h, 0, 1), sk = 0.55 + (1 - f) * 0.3;
    const sr = lerp(E.sky[0], E.zen[0], f), sg = lerp(E.sky[1], E.zen[1], f), sb = lerp(E.sky[2], E.zen[2], f);
    const wr = sr * sk, wg = sg * sk, wb = sb * sk;
    // Aaltojen kohokohta: veden oman värin sävyinen, vain hieman vettä vaaleampi (aiemmin lähes valkoinen)
    const hr = lerp(wr, sr, 0.5) + 3, hg = lerp(wg, sg, 0.5) + 3, hb = lerp(wb, sb, 0.5) + 3;
    const mr = lerp(wr, sr, 0.5), mg = lerp(wg, sg, 0.5), mb = lerp(wb, sb, 0.5);
    const nA = ((ay + oAy) & (NOISE_H - 1)) * NOISE_W, nB = ((ay + oBy) & (NOISE_H - 1)) * NOISE_W;
    const wob = rowWob[y];
    for (let x = x0; x < x1; x++) {
      const ax = x + camXr, k = row + ax - PB.x0, m = pondMask[k];
      if (!m) continue;
      const p = (y * W + x) * 4;
      if (m === 3) { d[p] = 22; d[p + 1] = 24; d[p + 2] = 16; d[p + 3] = 105; continue; }
      const rx = ax - PB.x0 + wob;
      const refl = rx >= 0 && rx < PB.w ? pondRefl[k + wob] : 255;
      const a = WAVE_NOISE[nA + ((ax + oAx) & (NOISE_W - 1))], b = WAVE_NOISE[nB + ((ax + oBx) & (NOISE_W - 1))];
      // Pinnan heijastus (väri r, gg, bb ja voimakkuus aR) ja veden oma, sameudesta riippuva väri (aT)
      let r, gg, bb, aR;
      if (refl < 100) {
        // Kuusten tumma heijastus; väreet näkyvät siinä himmeinä
        if (a > thrA) { r = E.reflHi[0]; gg = E.reflHi[1]; bb = E.reflHi[2]; aR = 0.75; }
        else if (refl > 90 || b > 0.93) { r = E.reflMid[0]; gg = E.reflMid[1]; bb = E.reflMid[2]; aR = 0.6; }
        else { r = E.refl[0]; gg = E.refl[1]; bb = E.refl[2]; aR = 0.5; }
      } else if (a > thrA) { r = hr; gg = hg; bb = hb; aR = 0.55; }
      else if (b > thrB) { r = mr; gg = mg; bb = mb; aR = 0.35; }
      else { r = wr; gg = wg; bb = wb; aR = E.reflK; }
      const aT = turbAlpha[k] / 255, kb = (1 - aR) * aT, A = aR + kb;
      d[p] = (r * aR + E.body[0] * kb) / A; d[p + 1] = (gg * aR + E.body[1] * kb) / A; d[p + 2] = (bb * aR + E.body[2] * kb) / A;
      d[p + 3] = A * 255;
    }
  }
  waterCtx.putImageData(waterImg, 0, 0);
  ctx.drawImage(waterCanvas, 0, 0);
}

// Renkaat vedessä (sadepisarat, sorsat, roiskeet) ja sorsien vanavedet
function drawRipples(camXr, camYr) {
  for (const r of ripples) {
    const k = r.t / r.life, rad = 0.5 + r.max * Math.sqrt(k);
    const cx = isoX(r.x, r.y) - camXr, cy = isoY(r.x, r.y) - camYr;
    if (cx < -20 || cx > W + 20 || cy < -12 || cy > H + 12) continue;
    ctx.fillStyle = `rgba(${env.ring}, ${((1 - k) * r.a).toFixed(3)})`;
    const n = Math.max(8, Math.round(rad * 5));
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2, px = Math.round(cx + Math.cos(a) * rad), py = Math.round(cy + Math.sin(a) * rad * 0.5);
      if (waterPx(px + camXr, py + camYr)) ctx.fillRect(px, py, 1, 1);
    }
    // Ison pisaran keskeltä hypähtää pieni roiske
    if (r.drop && r.t < 4) { const px = Math.round(cx), py = Math.round(cy) - 1; if (waterPx(px + camXr, py + camYr + 1)) ctx.fillRect(px, py, 1, 1); }
  }
  for (const w of wakes) {
    const k = w.t / w.life, x = Math.round(isoX(w.x, w.y) - camXr), y = Math.round(isoY(w.x, w.y) - camYr);
    if (!waterPx(x + camXr, y + camYr)) continue;
    ctx.fillStyle = `rgba(${env.ring}, ${((1 - k) * 0.55).toFixed(3)})`;
    ctx.fillRect(x, y, k < 0.4 ? 2 : 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Syöte: WASD / nuolinäppäimet = kävely, hiiri = katse ja tähtäin, R = onki, F = otsalamppu, E = nukkumaan
// ---------------------------------------------------------------------------
const keys = {};
let pressed = {};
// Kosketusohjaus (touch.js): on = kosketustila päällä, mx/my = liiketikku (-1..1)
const touch = { on: false, mx: 0, my: 0, cast: false };
// Hiiren paikka pelipuskurin pikseleinä; mouseOn = hiirtä on liikutettu pelin päällä
let mouseX = W / 2, mouseY = H / 2, mouseOn = false, mouseHeld = false, mouseHeld2 = false;
const aiming = () => mouseOn && !touch.on;
view.addEventListener('mousemove', (e) => {
  const r = view.getBoundingClientRect();
  mouseX = ((e.clientX - r.left) * W) / r.width;
  mouseY = ((e.clientY - r.top) * H) / r.height;
  mouseOn = true;
});

addEventListener('keydown', (e) => {
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  initAudio();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseHeld = mouseHeld2 = false; });
view.addEventListener('mousedown', (e) => {
  initAudio();
  if (state === 'title') newGame();
  else if (state === 'pause') state = 'play';
  else if (state === 'sleep') pressed.Mouse = true;
  else if (state === 'play' && e.button === 0) { mouseHeld = true; pressed.MouseL = true; }
  else if (state === 'play' && e.button === 2) mouseHeld2 = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; if (e.button === 2) mouseHeld2 = false; });
// Hiiren rulla säätää koukun syvyyttä
view.addEventListener('wheel', (e) => { e.preventDefault(); if (state === 'play') pressed[e.deltaY < 0 ? 'WheelUp' : 'WheelDown'] = true; }, { passive: false });
view.addEventListener('contextmenu', (e) => e.preventDefault());

const keyDown = (...c) => c.some((k) => keys[k]);
const keyHit = (...c) => c.some((k) => pressed[k]);

// ---------------------------------------------------------------------------
// Äänet: kaikki syntetisoidaan Web Audiolla
// ---------------------------------------------------------------------------
let actx = null, master = null, noiseBuf = null, amb = null, muted = false;

function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; return; }
  master = actx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(actx.destination);

  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // Sateen kohina
  const rs = actx.createBufferSource(); rs.buffer = noiseBuf; rs.loop = true;
  const rhp = actx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1400;
  const rainVol = actx.createGain(); rainVol.gain.value = 0;
  rs.connect(rhp).connect(rainVol).connect(master);
  // Tuulen humina kuusikossa: matala, hitaasti aaltoileva kohina
  const ws = actx.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true;
  const wlp = actx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 420; wlp.Q.value = 0.6;
  const wbp = actx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 900; wbp.Q.value = 0.4;
  const windVol = actx.createGain(); windVol.gain.value = 0;
  const windHiss = actx.createGain(); windHiss.gain.value = 0.25;
  ws.connect(wlp).connect(windVol);
  ws.connect(wbp).connect(windHiss).connect(windVol);
  windVol.connect(master);
  rs.start(); ws.start(0, 0.7);
  amb = { rainVol, windVol, wlp };
}

function updateAmbientAudio() {
  if (!amb) return;
  const t = actx.currentTime;
  amb.rainVol.gain.setTargetAtTime(Math.min(1.2, weather.rain) * 0.12, t, 0.4);
  amb.windVol.gain.setTargetAtTime(0.012 + wind.gust * 0.09, t, 0.5);
  amb.wlp.frequency.setTargetAtTime(300 + wind.gust * 500, t, 0.5);
  // Nuotion rätinä kuuluu lähellä
  const dc = Math.hypot(player.x - CAMP.cx - 0.5, player.y - CAMP.cy - 0.5);
  if (dc < 10 && Math.random() < 0.18 * fireLevel()) noiseBurst(rand(0.01, 0.04), rand(1800, 5000), 'bandpass', 0.09 * (1 - dc / 10), 4);
  // Laineiden liplatus rannassa tuulella
  if (shoreDist(player.x, player.y) < 1.6 && wind.gust > 0.3 && Math.random() < 0.012 * wind.gust) noiseBurst(rand(0.25, 0.45), rand(350, 600), 'lowpass', 0.05 * wind.gust, 1);
}

function noiseBurst(dur, freq, ftype = 'bandpass', vol = 0.2, q = 1, dest = master) {
  if (!actx) return;
  const t = actx.currentTime;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur);
}

function tone(freq, dur, wave = 'square', vol = 0.06, endFreq = 0, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur);
}

// Pehmeä kohina: nousee hitaasti ja vaimenee, jolloin alussa ei ole terävää iskua
function softNoise(dur, freq, ftype = 'lowpass', vol = 0.1, q = 1, attack = 0.05, delay = 0, endFreq = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur);
}

// Pieni vesipisaran "plip": lyhyt siniääni, jonka sävel nousee
function droplet(delay, vol) {
  if (!actx) return;
  const t = actx.currentTime + delay, f0 = rand(500, 900), dur = rand(0.05, 0.09);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * rand(1.8, 2.6), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur);
}

// Ulostulo, joka sijoittuu stereokuvaan (pan -1..1) ja kuulostaa kaukaiselta (alipäästö)
function outNode(pan = 0, vol = 1, far = 8000) {
  const g = actx.createGain(); g.gain.value = vol;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = far;
  g.connect(lp);
  if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); lp.connect(p).connect(master); }
  else lp.connect(master);
  return g;
}

// Yksi sävel: pehmeä alku ja liukuma f0 -> f1
function note(dest, t, f0, f1, dur, vol, wave = 'sine') {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

// Käheä ääni (varis, lokki, sorsa): sahalaita formanttisuotimen läpi
function harsh(dest, t, f0, f1, dur, vol, formant, q = 3) {
  const o = actx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = formant; bp.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(bp).connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

// Yksi sorsan kvaak (mitattu ääninäytteestä): sahalaidan perussävel ~240 Hz laskee ~190 Hz:iin pienen satunnaisen värinän kera, ja
// ylipäästön jälkeen energia keskittyy kapeiden muotoutuvien suodattimien kautta alueelle 1,3-2,5 kHz (näytteessä ~80 % energiasta).
// Verhokäyrä: alku ~22 ms, huippu ja pehmeä, nopeasti hiipuva häntä (ei tasaista ylläpitoa); mukana vähän suhinaa.
function duckQuack(dest, t, f0, dur, vol) {
  const o = actx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * 0.97, t + dur * 0.45);
  o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
  // Karheus: epäsäännöllinen sävelkorkeuden värinä (ei tasaista värähtelyä, joka kuulostaisi surinalta)
  for (let k = 0; k * 0.009 < dur; k++) o.detune.setValueAtTime(rand(-22, 22), t + k * 0.009);
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100; hp.Q.value = 0.7;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.022);
  env.gain.setTargetAtTime(vol * 0.18, t + 0.022, dur * 0.3);
  env.gain.setTargetAtTime(0.0001, t + dur, 0.015);
  o.connect(hp);
  for (const [freq, q, gn] of [[1750, 2.6, 1], [2150, 3, 0.8]]) {
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = actx.createGain(); g.gain.value = gn;
    hp.connect(bp).connect(g).connect(env);
  }
  env.connect(dest);
  o.start(t); o.stop(t + dur + 0.08);
  // Suhina
  if (noiseBuf) {
    const s = actx.createBufferSource(); s.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 1.2;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.3, t + 0.022); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
}

// Metsän ja lammen linnut
const SONGS = {
  // Peippo: nopea, laskeva liverrys ja loppukiekaisu
  chaffinch(d, t) {
    let f = rand(4200, 4800);
    for (let k = 0; k < 9; k++) { note(d, t, f, f * 0.92, 0.06, 0.05); t += 0.075; f *= 0.97; }
    note(d, t, 3000, 4600, 0.12, 0.05);
    note(d, t + 0.13, 4400, 2600, 0.16, 0.05);
  },
  // Talitiainen: "ti-tyy, ti-tyy"
  tit(d, t) {
    const a = rand(4600, 5200), b = a * 0.74;
    for (let k = 0, n = 3 + Math.floor(rand(0, 3)); k < n; k++) { note(d, t, a, a, 0.08, 0.045); note(d, t + 0.12, b, b * 0.98, 0.12, 0.045); t += 0.3; }
  },
  // Laulurastas: lyhyt säe toistetaan pari kertaa
  thrush(d, t) {
    const phrase = Array.from({ length: 2 + Math.floor(rand(0, 3)) }, () => [rand(1800, 3600), rand(1800, 3600), rand(0.06, 0.13)]);
    for (let r = 0, n = 2 + (Math.random() < 0.5 ? 1 : 0); r < n; r++) {
      for (const [f0, f1, dur] of phrase) { note(d, t, f0, f1, dur, 0.05); t += dur + 0.03; }
      t += 0.18;
    }
  },
  // Käki kukkuu kaukana: kaksi lähes puhdasta siniääntä ("ku-kuu"), joista ensimmäinen nousee ja on napakka ja toinen
  // on matalampi, tasainen ja hiljaisempi. Mitattu oikeasta käen kutsusta; perässä metsän kaiku (kaksi himmeää viivettä).
  cuckoo(d, t) {
    const bus = actx.createGain();
    bus.connect(d);
    for (const [dl, gn] of [[0.17, 0.2], [0.39, 0.1], [0.68, 0.05]]) {
      const dn = actx.createDelay(1), lp = actx.createBiquadFilter(), gg = actx.createGain();
      dn.delayTime.value = dl; lp.type = 'lowpass'; lp.frequency.value = 1700; gg.gain.value = gn;
      bus.connect(dn); dn.connect(lp); lp.connect(gg); gg.connect(d);
    }
    // Yksi sävel: sini + heikko 2. yläsävel, liukuma f0 -> f1 (glide s), nopea tai hidas alku, tasanne ja pehmeä pää
    const tone1 = (t0, f0, f1, glide, dur, att, vol, tail) => {
      for (const [mul, v] of [[1, 1], [2, 0.025], [3, 0.008]]) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0 * mul, t0);
        o.frequency.linearRampToValueAtTime(f1 * mul, t0 + glide);
        o.frequency.linearRampToValueAtTime(f1 * mul * 0.985, t0 + dur);   // sävel painuu loppua kohden hieman
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol * v, t0 + att);
        g.gain.setTargetAtTime(vol * v * tail, t0 + att, dur * 0.35);
        g.gain.setTargetAtTime(0.0001, t0 + dur, 0.03);
        o.connect(g).connect(bus);
        o.start(t0); o.stop(t0 + dur + 0.2);
      }
    };
    const base = rand(0.96, 1.05);
    for (let k = 0, n = 3 + Math.floor(rand(0, 4)); k < n; k++) {
      const j = rand(0.985, 1.015);
      tone1(t, 545 * base * j, 612 * base * j, 0.06, 0.13, 0.012, 0.1, 0.35);
      tone1(t + 0.35, 506 * base * j, 501 * base * j, 0.03, 0.22, 0.04, 0.056, 0.75);
      t += rand(1.5, 1.8);
    }
  },
  // Huuhkaja yöllä
  owl(d, t) {
    note(d, t, 330, 300, 0.55, 0.14);
    note(d, t + 0.9, 350, 310, 0.3, 0.09);
    note(d, t + 1.25, 340, 300, 0.7, 0.14);
  },
  crow(d, t) { for (let k = 0, n = 2 + Math.floor(rand(0, 2)); k < n; k++) { harsh(d, t, 420, 330, 0.28, 0.12, 1100, 2); t += 0.42; } },
  gull(d, t) { for (let k = 0, n = 1 + Math.floor(rand(0, 3)); k < n; k++) { harsh(d, t, 900, 1300, 0.12, 0.08, 1800, 2); harsh(d, t + 0.12, 1300, 950, 0.3, 0.08, 1800, 2); t += 0.55; } },
  // Silkkiuikku: sarja lyhyitä, käheitä haukahduksia "rak-rak-rak" ja välillä venytetty "raaah"
  grebe(d, t) {
    const n = 3 + Math.floor(rand(0, 3)), f = rand(560, 700);
    for (let k = 0; k < n; k++) { harsh(d, t, f * 1.5, f, 0.11, 0.13, 1500, 2.2); t += rand(0.3, 0.38); }
    if (Math.random() < 0.5) harsh(d, t + 0.05, f * 1.3, f * 0.8, 0.45, 0.1, 1300, 1.6);
  },
  grebe1(d, t) { harsh(d, t, 900, 600, 0.13, 0.12, 1700, 2.2); harsh(d, t + 0.2, 880, 560, 0.15, 0.1, 1700, 2.2); },
  // Sinisorsa: naaraan "kvaak"-sarja, mitattu ääninäytteestä. Perussävel noin 240 Hz laskee loivasti ~190 Hz:iin, ääni on
  // karhea (nopea sävelkorkeuden värinä) ja sen painopiste on kahdella laajalla alueella (~450 Hz ja ~1,8 kHz). Yksi kvaak kestää
  // 0,1-0,2 s, ja sarja tulee noin 0,29 s välein hiipuen ja lyhentyen.
  quack(d, t) {
    const n = 2 + Math.floor(rand(0, 3)), f0 = rand(215, 250);
    let vol = 0.05, dur = rand(0.16, 0.2);
    for (let k = 0; k < n; k++) {
      duckQuack(d, t, f0 * rand(0.96, 1.04), dur, vol);
      t += rand(0.27, 0.31); vol *= 0.88; dur = Math.max(0.09, dur * 0.88);
    }
  },
};

function sing(song, pan, vol = 1, far = 8000) {
  if (!actx || muted) return;
  SONGS[song](outNode(pan, vol, far), actx.currentTime + 0.05);
}

const SFX = {
  rodOut: () => { noiseBurst(0.15, 2200, 'bandpass', 0.12, 2); tone(900, 0.03, 'triangle', 0.04, 0, 0.1); },
  rodIn: () => { noiseBurst(0.12, 1800, 'bandpass', 0.1, 2); tone(700, 0.03, 'triangle', 0.04, 0, 0.08); },
  click: () => { tone(2200, 0.015, 'square', 0.05); tone(1500, 0.02, 'square', 0.04, 0, 0.03); },
  cast: (pw) => noiseBurst(0.18 + pw * 0.15, 1800 + pw * 1500, 'bandpass', 0.12, 1.5),
  plop: () => { tone(520, 0.09, 'sine', 0.12, 260); noiseBurst(0.12, 1200, 'bandpass', 0.08, 2); },
  thud: () => noiseBurst(0.06, 400, 'lowpass', 0.12, 1),
  reel: () => tone(rand(2600, 3000), 0.012, 'square', 0.025),
  release: () => tone(rand(1500, 1900), 0.01, 'square', 0.018),
  bite: () => { tone(380, 0.12, 'sine', 0.14, 180); noiseBurst(0.15, 900, 'bandpass', 0.12, 2); },
  // Pohjaongen vavan päässä oleva pieni kilikello: nopea sarja korkeita, hopeisia kilahduksia
  bell: () => { for (let k = 0; k < 7; k++) { const f = rand(2900, 3500), d = k * 0.065 + rand(0, 0.02); tone(f, 0.22, 'sine', 0.07, 0, d); tone(f * 1.62, 0.12, 'sine', 0.025, 0, d); } },
  ratchet: () => { tone(rand(3400, 4200), 0.01, 'square', 0.035); noiseBurst(0.02, 5000, 'bandpass', 0.05, 3); },
  snip: () => { tone(2400, 0.03, 'square', 0.05, 1200); noiseBurst(0.05, 4000, 'highpass', 0.06); },
  catch: () => { tone(660, 0.1, 'triangle', 0.09); tone(880, 0.1, 'triangle', 0.09, 0, 0.1); tone(1320, 0.18, 'triangle', 0.08, 0, 0.2); },
  step: (wood) => (wood ? noiseBurst(0.06, rand(250, 380), 'bandpass', 0.07, 2) : noiseBurst(0.05, rand(700, 1100), 'bandpass', 0.035, 1.2)),
  rustle: () => { for (let k = 0; k < 4; k++) setTimeout(() => noiseBurst(0.05, rand(2500, 4500), 'bandpass', 0.05, 2), k * 45); },
  splash: (v = 1) => { noiseBurst(0.35, 900, 'lowpass', 0.25 * v, 1); noiseBurst(0.2, 3000, 'bandpass', 0.1 * v, 1); },
  // Sorsan lasku tai lentoonlähtö: pehmeä veden kohahdus, roiskeen suhina ja muutama pisara.
  // Laskeutuessa liuku pinnalla kestää pidempään, lentoon lähtiessä siivet piiskaavat vettä.
  duckWater: (land, v = 1) => {
    if (land) {
      softNoise(0.7, 700, 'lowpass', 0.13 * v, 0.7, 0.09, 0, 260);
      softNoise(0.5, 1800, 'bandpass', 0.035 * v, 0.8, 0.12, 0.03, 900);
    } else {
      for (let k = 0; k < 4; k++) softNoise(0.22, rand(500, 800), 'lowpass', rand(0.07, 0.1) * v, 0.8, 0.04, k * 0.11);
      softNoise(0.6, 1600, 'bandpass', 0.03 * v, 0.8, 0.1, 0, 700);
    }
    for (let k = 0, n = Math.floor(rand(4, 8)); k < n; k++) droplet(rand(0.1, 0.75), rand(0.012, 0.03) * v);
  },
  // Norpan veteen pyörähdys: raskas läsähdys, matala molahdus ja pisaroiden ropina; hengitys on pehmeä puhahdus
  sealSplash: (v = 1) => {
    noiseBurst(0.5, 650, 'lowpass', 0.3 * v, 1); noiseBurst(0.3, 2400, 'bandpass', 0.12 * v, 1);
    tone(170, 0.2, 'sine', 0.13 * v, 60);
    for (let k = 0, n = Math.floor(rand(6, 11)); k < n; k++) droplet(rand(0.12, 0.9), rand(0.015, 0.04) * v);
  },
  sealBreath: () => { softNoise(0.4, 1500, 'bandpass', 0.05, 1.2, 0.06, 0, 600); softNoise(0.55, 450, 'lowpass', 0.04, 0.8, 0.1, 0.08, 250); },
  // Nuotion ritinä: joukko lyhyitä napsahduksia
  crackle: (v = 1) => { for (let k = 0, n = Math.floor(rand(3, 8)); k < n; k++) setTimeout(() => noiseBurst(rand(0.008, 0.02), rand(2500, 6500), 'bandpass', rand(0.04, 0.11) * v, 3), rand(0, 220)); },
  // Kirveen isku: pieni hiljainen heilautuksen suhahdus ja puun hakkaamisen tömähdys
  whoosh: () => softNoise(0.17, 1500, 'bandpass', 0.05, 1.1, 0.06, 0, 650),
  chop: () => { noiseBurst(0.05, 1500, 'bandpass', 0.2, 1.5); tone(190, 0.09, 'triangle', 0.17, 95); noiseBurst(0.12, 380, 'lowpass', 0.17, 1); setTimeout(() => noiseBurst(0.03, 2800, 'bandpass', 0.07, 3), 40); },
  logDone: () => { tone(270, 0.08, 'triangle', 0.1, 140); noiseBurst(0.12, 500, 'lowpass', 0.14, 1); setTimeout(() => SFX.crackle(0.5), 60); },
  flap: () => { for (let k = 0; k < 8; k++) setTimeout(() => noiseBurst(0.05, rand(900, 1600), 'bandpass', 0.12, 2), k * 70); },
};

// ---------------------------------------------------------------------------
// Pelin tila
// ---------------------------------------------------------------------------
let state = 'title';
let grebes = [];
let player, line, particles, ripples, wakes, drops, ducks, animals, skyBirds, banners;
let time, clock, timeScale = 1, clockSync = false, clockStep = 0, weather, wind, birdT, skyBirdT, duckT, animalT, phaseName, sleep, cast;
const LINE_SEG = 1.6, BOB_I = 7;   // siiman nivelet: koho nivelessä BOB_I, koukku viimeisessä
const HOOK_MIN = 0.1, HOOK_MAX = 1.5;   // koukun syvyyden säätöalue kohon alapuolella (metreinä)
let fishes, catches, fire;
const ui = { fishBar: false };  // kalan voimapalkki (vain huijaustilassa, H)
const cam = { x: 0, y: 0 };

function setupWorld() {
  genMap();
  buildGround();
  buildRevealMask();
  buildPond();
  player = {
    x: 37.5, y: 76, fa: -Math.PI / 4, gux: 1, guy: 0, anim: 0, moving: false, view: 'E', flip: false,
    rod: false, light: false, stillT: 0, lure: 'bobber',
    tool: null, wood: 0, chop: null, kswing: -1,   // käsissä oleva työkalu (axe / knife), repun polttopuut ja kesken oleva hakkuu
  };
  SHED.logs = 10;
  [player.gux, player.guy] = screenDir(Math.cos(player.fa), Math.sin(player.fa));
  line = [];
  cast = { charging: false, power: 0, pdir: 1, flick: 0, lure: null, reelT: 0, releaseT: 0, needRelease: false, hookDepth: 0.5, reelSpeed: 40, rigDist: 1.0 };
  particles = []; ripples = []; wakes = []; drops = []; animals = []; skyBirds = []; banners = []; loose = [];
  spawnFish();
  catches = [];
  fire = { wood: 3, emb: 1, lit: true, barT: 0 };
  ducks = [makeDuck(C + rand(-8, 8), C + rand(-8, 8), true, false), makeDuck(C + rand(-8, 8), C + rand(-8, 8), false, false)];
  spawnGrebes();
  seal = makeSeal();
  weatherSeed = Math.floor(Math.random() * 1e9); weatherPlans.clear();
  weather = { kind: 'clear', rain: 0, fog: 0 };
  wind = { a: rand(0, Math.PI * 2), s: 0.25, ta: 0, ts: 0.25, t: 0, gust: 0.25, sx: 0, sy: 0, wx: 0, wy: 0 };
  wind.ta = wind.a;
  time = 0; clock = 0; birdT = 120; skyBirdT = 600; duckT = rand(1800, 3600); animalT = 300;
  weather.kind = weatherKindNow(); weather.rain = WEATHER[weather.kind].rain; weather.fog = WEATHER[weather.kind].fog;
  buildSunShadows();
  mistWisps = [];
  phaseName = phaseOf(todNow());
  updateEnv();
  cam.x = isoX(player.x, player.y) - W / 2;
  cam.y = isoY(player.x, player.y) - 12 - H / 2;
}

function newGame() {
  setupWorld();
  state = 'play';
  banners = [{ text: 'A quiet morning by the forest pond.', t: 240 }, { text: 'R = take the rod  ·  F = headlamp', t: 260 }];
}

function blocked(x, y) {
  if (shoreDist(x, y) < 0.32 && !onDock(x, y, -0.3)) return true;   // veteen ei voi kävellä, laiturille voi
  const r = 0.28;
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const cx = Math.floor(x + ox), cy = Math.floor(y + oy);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return true;
    if (playerSolid(type[cy * N + cx])) return true;
  }
  return false;
}

// Liikuttaa hahmoa törmäykset huomioiden; palauttaa true jos liike onnistui
function moveBody(o, vx, vy) {
  let moved = false;
  if (!blocked(o.x + vx, o.y)) { o.x += vx; moved = true; }
  if (!blocked(o.x, o.y + vy)) { o.y += vy; moved = true; }
  return moved;
}

// ---------------------------------------------------------------------------
// Pelaaja, onki ja siima
// ---------------------------------------------------------------------------
function updatePlayer() {
  const p = player;
  if (keyHit('KeyR')) toggleRod();
  if (keyHit('KeyF')) toggleLight();
  if (keyHit('KeyE')) {
    // Teltan, nuotion ja katoksen välissä valitaan lähin
    const a = eAction();
    if (a) { if (a.label === 'SLEEP') { startSleep(); return; } a.run(); }
    else if (nearShed() && SHED.logs > 0 && p.wood >= MAX_WOOD) notify('Backpack full (' + MAX_WOOD + ' logs)', 100, 'wood');
  }
  if (keyHit('KeyX')) toggleTool('axe');
  if (keyHit('KeyK')) toggleTool('knife');
  if (keyHit('KeyY') && canStoreWood()) storeWood();
  if (keyHit('KeyN') && canMakeWood()) startChop();
  if (keyHit('KeyZ') && canLightFire()) lightFire();
  if (keyHit('KeyC')) cutLine();
  // Kalan voimapalkin voi näyttää vain huijaustilassa (vesi piilotettuna)
  if (keyHit('KeyH') && !water.show) { ui.fishBar = !ui.fishBar; notify(ui.fishBar ? 'Fish strength bar shown' : 'Fish strength bar hidden', 90, 'fishbar'); }
  if (keyHit('KeyQ')) switchLure();
  // Rulla ja -/+: koholla koukun syvyys, uistimilla kelausnopeus, pohjaongella syötin etäisyys puntista
  const adj = keyHit('Minus', 'NumpadSubtract', 'WheelDown') ? -1 : keyHit('Equal', 'NumpadAdd', 'WheelUp') ? 1 : 0;
  if (adj) { if (isArt(player.lure)) adjustReel(adj * 10); else if (isRig(player.lure)) adjustRig(adj * 0.1); else adjustHook(adj * 0.1); }
  let kx = (keyDown('KeyD', 'ArrowRight') ? 1 : 0) - (keyDown('KeyA', 'ArrowLeft') ? 1 : 0);
  let ky = (keyDown('KeyS', 'ArrowDown') ? 1 : 0) - (keyDown('KeyW', 'ArrowUp') ? 1 : 0);
  if (!kx && !ky) { kx = touch.mx; ky = touch.my; }
  p.moving = false;
  if (p.boat) {
    // Veneessä liikkeet ohjaavat venettä; seisova kalastaja kääntyy tähtäimen mukaan
    if (boat.rider === 'drive') {
      driveBoat(kx, ky);
      p.fa = boat.a; [p.gux, p.guy] = screenDir(Math.cos(boat.a), Math.sin(boat.a)); faceTo(Math.cos(boat.a), Math.sin(boat.a));
    } else if (aiming()) {
      const [tx, ty] = absToWorld(mouseX + Math.round(cam.x), mouseY + Math.round(cam.y));
      if (Math.hypot(tx - p.x, ty - p.y) > 0.25) faceTo(tx - p.x, ty - p.y);
    } else if (kx || ky) faceTo(kx / HW + ky / HH, ky / HH - kx / HW);
    p.stillT = 0;
    updateCast();
    if (p.rod && !cast.lure) updateLine();
    return;
  }
  if (p.tool === 'knife') {
    // Puukon heilautus (ei vielä käyttöä): sama liike kuin kirveellä mutta pienempi; välilyönti / hiiri / SLASH
    if (p.kswing >= 0) { if (++p.kswing === KNIFE_HIT - 4) SFX.whoosh(); if (p.kswing >= KNIFE_T) p.kswing = -1; }
    else if (keyHit('Space', 'MouseL')) p.kswing = 0;
  }
  if (p.chop) { updateChop(kx, ky); if (p.chop) kx = ky = 0; }   // hakatessa hahmo ei liiku (kävely keskeyttää hakkuun)
  if (kx || ky) {
    // Näytön suunta -> maailman suunta
    let vx = kx / HW + ky / HH, vy = ky / HH - kx / HW;
    const l = Math.hypot(vx, vy);
    vx = (vx / l) * WALK; vy = (vy / l) * WALK;
    if (!aiming()) faceTo(vx, vy);
    if (moveBody(p, vx, vy)) {
      p.moving = true;
      if (++p.anim % 10 === 0) SFX.step(onDock(p.x, p.y));
    }
  }
  // Hiirellä pelattaessa hahmo katsoo tähtäimen suuntaan (myös otsalamppu ja onki osoittavat sinne)
  if (aiming()) {
    const [tx, ty] = absToWorld(mouseX + Math.round(cam.x), mouseY + Math.round(cam.y));
    if (Math.hypot(tx - p.x, ty - p.y) > 0.25) faceTo(tx - p.x, ty - p.y);
  }
  p.stillT = p.moving ? 0 : p.stillT + 1;
  updateCast();
  if (p.rod && !cast.lure) updateLine();
}

// Hahmo kääntyy katsomaan maailman suuntaan (dx, dy)
function faceTo(dx, dy) {
  const p = player;
  p.fa = Math.atan2(dy, dx);
  [p.gux, p.guy] = screenDir(dx, dy);
  p.flip = p.gux < 0;
  // Katsesuunta ruudulla pyöristetään lähimpään kahdeksasta ilmansuunnasta
  const a = Math.atan2(p.guy, Math.abs(p.gux));
  p.view = VIEW_ORDER[clamp(Math.round((a + Math.PI / 2) / (Math.PI / 4)), 0, 4)];
}

// Laiturilla seisova hahmo on kannen korkeudella
const playerLift = () => (player.boat ? 1 : onDock(player.x, player.y) ? DOCK_Z : 0);
// Otsalampun valo näkyy pelin ja tauon aikana
const lampOn = () => player.light && (state === 'play' || state === 'pause');

// Viehe vaihdetaan (koho ja mato / vaappu / lippa / pohjaonki ja mato / pohjaonki ja boilie), kun siima on kelattu kokonaan sisään
function switchLure() {
  if (cast.lure) { notify('Reel in fully to change the lure.', 100, 'hint'); return; }
  player.lure = { bobber: 'wobbler', wobbler: 'spoon', spoon: 'rigworm', rigworm: 'rigboilie', rigboilie: 'bobber' }[player.lure];
  notify({ bobber: 'Lure: bobber and worm', wobbler: 'Lure: wobbler', spoon: 'Lure: spoon', rigworm: 'Lure: bottom rig, worm', rigboilie: 'Lure: bottom rig, boilie' }[player.lure], 100, 'lure');
  if (player.rod) resetLine();
  SFX.click();
}

// Vaapun kelausnopeus (cm/s) säädetään rullalla tai -/+ -näppäimillä
const REEL_MIN = 10, REEL_MAX = 100;
function adjustReel(dv) {
  cast.reelSpeed = clamp(Math.round(cast.reelSpeed / 10) * 10 + dv, REEL_MIN, REEL_MAX);   // rulla ja näppäimet säätävät 10 cm/s askelin, kosketuksen liukusäädin portaattomasti
  notify('Reel-in speed ' + Math.round(cast.reelSpeed) + ' cm/s', 90, 'reel');
  SFX.reel();
}
// Kelaus metreinä päivitystä kohden: koholla nopea vakio, vaapulla säädetty nopeus
const WOB_DIVE = 0.52, WOB_RISE = 0.156;   // vaapun sukellus (m / kuljettu m) ja nousu (m/s)
const SPOON_SINK = 0.3;                       // lipan uppoamisnopeus (m/s)
// Uistimet (vaappu ja lippa): kelausnopeus säädetään, ja ne kiinnostavat kaloja vain liikkuessaan
const isArt = (kind) => kind === 'wobbler' || kind === 'spoon';
// Pohjaonki: puntti siiman päässä ja siitä RIG_DIST ylöspäin sivuhaara, jossa on koukku ja syötti
// (rigworm = mato, rigboilie = syöttipallo). Siima kulkee ongen kärjestä suoraan puntille kuten uistimilla.
const isRig = (kind) => kind === 'rigworm' || kind === 'rigboilie';
const isDirect = (kind) => isArt(kind) || isRig(kind);
const RIG_MIN = 0.5, RIG_MAX = 1.5;   // syötin korkeus puntista (m): 50–150 cm (5,6–16,7 px), säädetään rullalla 10 cm:n välein
const RIG_ARM = 3.2 / Z_PX;           // sivuhaaran pituus (m) = 3,2 px kuten roikkuvassa tilassa: syötti roikkuu vapaana haaran kiinnityskohdan alapuolella
const RIG_SINK = 1.0;                 // puntin uppoamisnopeus (m/s)
const RIG_REEL = 1.2 / 60;            // pohjaongen kelausnopeus (m / päivitys)
const RIG_CAST_MAX = 24;              // pohjaongen heiton enimmäispituus (m); muilla vieheillä CAST_MAX
const RIG_TIP = 2.1;                   // ongen kärjen korkeus veden yläpuolella (m), määrää siiman kulman
// Ongen kärjen korkeus veden pinnasta (m): kärki on RIG_TIP metriä seisontapinnan yläpuolella, ja laituri / vene nostavat sitä vielä
const tipHeight = () => RIG_TIP + playerLift() / Z_PX;
const SNAP_T = 14;   // vieheen nosto ongen kärkeen kelauksen lopussa (ruutua)
const reelStep = (L) => (isRig(L.kind) ? RIG_REEL : isArt(L.kind) ? cast.reelSpeed / 100 / 60 : REEL);

function toggleRod() {
  const p = player;
  if (cast.lure) { notify('Reel in the line first.', 120, 'hint'); return; }
  if (p.boat) {
    // Veneessä onki otetaan vain pysähtyneenä: hahmo nousee seisomaan kalastamaan
    if (!p.rod && !boatStopped()) { notify('Stop the boat to fish.', 100, 'hint'); return; }
    boat.rider = p.rod ? 'drive' : 'stand';
  }
  if (p.tool && !p.rod) { p.tool = null; p.chop = null; }   // ongen ottaminen laittaa työkalun pois
  p.rod = !p.rod;
  cast.charging = false;
  if (p.rod) {
    resetLine();
    SFX.rodOut();
  } else SFX.rodIn();
}

// ---------------------------------------------------------------------------
// Työkalut ja polttopuut. Pelaajalla on kirves ja puukko; työkalu otetaan oikeaan käteen (onki menee silloin aina
// repun kylkeen) eikä sitä voi ottaa, jos viehe on heitetty. Kirves roikkuu repun vasemmassa reunassa, kun se ei ole
// kädessä; puukkoa ei piirretä muulloin kuin kädessä (sillä ei vielä voi tehdä mitään). Polttopuita otetaan katoksesta
// (inventaario `player.wood`), lisätään nuotioon tai takaisin katokseen (20 klapia), ja niitä tehdään lisää hakkaamalla
// metsän laidassa: viisi kirveeniskua (yksi iskua sekunnissa) tekee yhden klapin.
// ---------------------------------------------------------------------------
function putAwayTool() {
  const p = player;
  if (!p.tool) return;
  p.tool = null; p.chop = null; p.kswing = -1;
  SFX.rodIn();
}
function toggleTool(kind) {
  const p = player;
  if (p.tool === kind) { putAwayTool(); return; }
  if (cast.lure) { notify('Reel in the line first.', 120, 'hint'); return; }
  if (p.boat) { notify('Not in the boat.', 90, 'hint'); return; }
  p.rod = false; cast.charging = false;
  p.tool = kind; p.chop = null; p.kswing = -1;
  SFX.rodOut();
}

// Katos: etäisyys sen avoimen puolen edessä olevaan pisteeseen
const shedDist = () => Math.hypot(player.x - SHED.x0 - SHED.D - 0.9, player.y - SHED.y0 - SHED.L / 2);
const nearShed = () => state === 'play' && !player.boat && shedDist() < 2.0;
const MAX_WOOD = 5;   // reppuun mahtuu enintään viisi polttopuuta
const canTakeWood = () => nearShed() && SHED.logs > 0 && player.wood < MAX_WOOD;
const canStoreWood = () => nearShed() && player.wood > 0 && SHED.logs < SHED.cap;
function takeWood() {
  SHED.logs--; player.wood++;
  SFX.thud();
  notify('Firewood ' + player.wood + '   (rack ' + SHED.logs + ')', 100, 'wood');
}
function storeWood() {
  SHED.logs++; player.wood--;
  SFX.thud();
  notify('Firewood ' + player.wood + '   (rack ' + SHED.logs + ' / ' + SHED.cap + ')', 100, 'wood');
}

// E-näppäimen toiminto: lähin mahdollinen (teltta, nuotio, katos), muuten vene
function eAction() {
  const p = player, c = [];
  if (canSleep()) c.push({ d: Math.hypot(p.x - TENT_DOOR.x, p.y - TENT_DOOR.y), label: 'SLEEP', run: startSleep });
  if (nearFire()) c.push({ d: Math.hypot(p.x - CAMP.cx - 0.5, p.y - CAMP.cy - 0.5), label: 'ADD WOOD', run: addFirewood });
  if (canTakeWood()) c.push({ d: shedDist(), label: 'TAKE WOOD', run: takeWood });
  if (c.length) return c.sort((a, b) => a.d - b.d)[0];
  if (canBoard()) return { label: 'BOAT', run: boardBoat };
  if (p.boat && canLeave()) return { label: 'GO ASHORE', run: leaveBoat };
  return null;
}
// Kosketusnäytön tee-painikkeet: sama valinta kuin näppäimillä (Z, E, Y, N); ei onki kädessä
function contextActions() {
  const out = [];
  if (!player || state !== 'play' || player.rod) return out;
  if (canLightFire()) out.push({ label: 'LIGHT FIRE', key: 'KeyZ' });
  const e = eAction();
  if (e && !(e.label === 'ADD WOOD' && fireFull())) out.push({ label: e.label, key: 'KeyE' });
  if (canStoreWood()) out.push({ label: 'STORE WOOD', key: 'KeyY' });
  if (canMakeWood()) out.push({ label: 'MAKE WOOD', key: 'KeyN' });
  return out;
}

// Hakkuu: kirves kädessä metsän laidassa (lähin metsäruutu enintään ~1,9 m päässä)
function forestNearDir() {
  const p = player;
  let best = null, bd = 1e9;
  for (let dx = -2; dx <= 2; dx += 0.5) for (let dy = -2; dy <= 2; dy += 0.5) {
    const d = Math.hypot(dx, dy);
    if (d > 1.9 || d >= bd || type[cellIdx(p.x + dx, p.y + dy)] !== T_FOREST) continue;
    bd = d; best = [dx, dy];
  }
  return best;
}
const canMakeWood = () => state === 'play' && !player.boat && player.tool === 'axe' && !player.chop && player.wood < MAX_WOOD && !!forestNearDir();
function startChop() {
  const f = forestNearDir();
  if (!f) return;
  player.chop = { hits: 0, swing: -1, cd: 0 };
  faceTo(f[0], f[1]);
  notify(touch.on ? 'Press CHOP to swing the axe' : 'SPACE or click: swing the axe', 150, 'hint');
}
const SWING_SPEED = 1.25;   // hakkuu 25 % nopeammin kuin alkuperäinen (30 ruudun isku, 60 ruudun väli)
const SWING_T = Math.round(30 / SWING_SPEED), SWING_HIT = Math.round(14 / SWING_SPEED), SWING_CD = Math.round(60 / SWING_SPEED), CHOPS_PER_LOG = 5;   // iskun kesto, osumahetki, väli (0,8 s) ja iskut / klapi
function updateChop(kx, ky) {
  const p = player, c = p.chop;
  if (c.cd > 0) c.cd--;
  if (c.swing >= 0) {
    c.swing++;
    if (c.swing === SWING_HIT - Math.round(7 / SWING_SPEED)) SFX.whoosh();
    if (c.swing === SWING_HIT) {
      SFX.chop();
      c.hits++;
      const ex = isoX(p.x, p.y) + p.gux * 10, ey = isoY(p.x, p.y) - 3 + p.guy * 3;
      for (let n = 0; n < 5; n++) particles.push({ x: ex + rand(-2, 2), y: ey + rand(-2, 1), vx: rand(-0.7, 0.7) + p.gux * 0.3, vy: rand(-1.2, -0.3), g: 0.1, life: 26, color: pick(['#c9a066', '#e0bc84', '#8a6a3c']), floor: ey + 3, splash: true });
      if (c.hits >= CHOPS_PER_LOG) {
        c.hits = 0; p.wood++;
        SFX.logDone();
        notify('+1 firewood   (' + p.wood + ')', 100, 'wood');
        if (p.wood >= MAX_WOOD) { p.chop = null; notify('Backpack full (' + MAX_WOOD + ' logs)', 130, 'wood'); }
      }
    }
    if (c.swing >= SWING_T) c.swing = -1;
    return;   // iskun aikana hahmoa ei voi liikuttaa
  }
  // Kävely keskeyttää hakkuun (edistyminen nollautuu)
  if (kx || ky) { p.chop = null; return; }
  if (c.cd <= 0 && keyHit('Space', 'MouseL')) { c.swing = 0; c.cd = SWING_CD; }
}
// Kirveen / puukon kulma pystysuunnasta (rad, positiivinen = eteenpäin) = oikean käden kyynärvarren suunta: lepoasento, nosto
// taakse, isku ja palautus. Puukon liike on pienempi (kyynärpää taipuu vain vähän).
const KNIFE_T = 20, KNIFE_HIT = 9;
function toolAngle(p) {
  if (p.tool === 'knife') {
    const t = p.kswing;
    if (t < 0) return 0.5;
    if (t < 5) return lerp(0.5, 0.0, t / 5);
    if (t < KNIFE_HIT) return lerp(0.0, 1.45, ((t - 5) / (KNIFE_HIT - 5)) ** 2);
    if (t < KNIFE_HIT + 3) return 1.45;
    return lerp(1.45, 0.5, (t - KNIFE_HIT - 3) / (KNIFE_T - KNIFE_HIT - 3));
  }
  const c = p.chop;
  if (!c || c.swing < 0) return 0.5;
  // Animaation vaiheet on mitoitettu 30 ruudun iskulle (nosto 0-7, isku 7-14, pito 14-17, palautus 17-30); aika skaalataan
  const t = c.swing * SWING_SPEED, HIT = 14, T = 30;
  if (t < 7) return lerp(0.5, -0.95, t / 7);
  if (t < HIT) return lerp(-0.95, 2.1, ((t - 7) / (HIT - 7)) ** 2);
  if (t < HIT + 3) return 2.1;
  return lerp(2.1, 0.5, (t - HIT - 3) / (T - HIT - 3));
}

// Asetusviesti: saman asetuksen (key) aiempi viesti korvataan, jotta jonoon ei jää vanhoja arvoja,
// jotka näkyisivät uusimman viestin jälkeen
function notify(text, t, key) {
  banners = banners.filter((b) => b.key !== key);
  banners.unshift({ text, t, key });
}

function toggleLight() {
  player.light = !player.light;
  SFX.click();
}

// Kädessä olevan ongen kahva ja kärki absoluuttisina pikseleinä. Heittoa ladattaessa vapa
// taipuu taaksepäin sitä enemmän, mitä enemmän voimaa on, ja heiton jälkeen se heilahtaa eteen.
function rodGeom() {
  const p = player, ax = isoX(p.x, p.y), ay = isoY(p.x, p.y) - playerLift();
  const step = p.moving ? Math.floor(p.anim / 5) % 2 : 0;
  const hand = HAND[playerDir()], hx = ax + hand[0], hy = ay + hand[1] + step;
  const sway = Math.sin(time * 0.035) * 0.7;
  const reach = 11 - (cast.charging ? cast.power * 13 : 0) + cast.flick * 0.5;
  return { hx, hy, tx: hx + p.gux * reach + sway, ty: hy + p.guy * 5 * (reach / 11) - 15 + step + Math.sin(time * 0.05) * 0.4, gy: ay + p.guy * 5 * (reach / 11) };
}
// Pohjaongen siima roikkuu ongen kärjestä suoraan alas: siiman vaakaetäisyydet mitataan kärjen kohdalta
// maan pinnalle (hahmon edessä), ei hahmon jalkojen kohdalta
function rigOrigin() {
  const g = rodGeom(), [x, y] = absToWorld(g.tx, g.gy);
  return { x, y };
}

// ---------------------------------------------------------------------------
// Heitto ja kelaus. Hiiren nappi pohjassa ladataan heittoa: voima nousee täyteen, laskee nollaan
// ja nousee taas. Heitto lähtee napin vapautuessa tähtäimen suuntaan. Vedessä koho kelluu; jos
// pelaaja loittonee, siima kiristyy ja vetää kohoa perässään. Nappi pohjassa siimaa kelataan sisään.
// Löysä siima jää kasaan, ja koko heitetty siima pitää kelata ennen seuraavaa heittoa.
// ---------------------------------------------------------------------------
const CAST_MIN = 2.5, CAST_MAX = 16;   // heiton pituus metreinä
const REEL = 0.05;                     // kelausnopeus (m / päivitys)
const LINE_MAX = 30, RELEASE = 0.06;    // kelalla olevan siiman määrä ja vapautusnopeus (hiiren oikea nappi)

// Hiiren oikea nappi vapauttaa siimaa kelalta (enintään LINE_MAX metriä ulos)
function releaseLine(L) {
  if (L.out < LINE_MAX) {
    L.out = Math.min(LINE_MAX, L.out + RELEASE);
    if (++cast.releaseT % 5 === 0) SFX.release();
  } else if (!L.maxMsg) { L.maxMsg = true; banners.unshift({ text: 'All ' + LINE_MAX + ' m of line is out.', t: 120 }); }
}
const lureInWater = (x, y) => shoreDist(x, y) < -0.15 && !onDock(x, y, 0.1);
// Kohon paikka ruudulla (absoluuttinen y): pinnalla, laiturilla tai kalan vetämänä pinnan alla (L.sub metriä)
const lureY = (L) => isoY(L.x, L.y) - lureLift(L) + (L.sub || 0) * Z_PX;

function updateCast() {
  const p = player, c = cast, held = mouseHeld || touch.cast;
  if (c.flick > 0) c.flick--;
  if (!held) c.needRelease = false;
  if (!p.rod) { c.charging = false; return; }
  const L = c.lure;
  if (!L) {
    if (held && !c.needRelease) {
      // Tähdätyssä heitossa kehä alkaa suurimmasta koosta ja pienenee; muuten voima alkaa nollasta
      if (!c.charging) { c.charging = true; if (aimCast()) { c.power = 1; c.pdir = -1; } else { c.power = 0; c.pdir = 1; } }
      c.power += c.pdir / (aimCast() ? 30 : 70);   // tähdätyn heiton kehä: suurin -> piste 0,5 s
      if (c.power >= 1) { c.power = 1; c.pdir = -1; } else if (c.power <= 0) { c.power = 0; c.pdir = 1; }
    } else if (c.charging) {
      c.charging = false;
      if (aimCast()) {
        // Tähdätty koho-ongen heitto: liian pitkä heitto perutaan
        const [tx, ty, d] = castTarget();
        if (d > CAST_AIM_MAX) { notify('Too far to cast.', 90, 'hint'); SFX.click(); }
        else castLureAt(tx, ty, c.power);
      } else castLure(c.power);
    }
    return;
  }
  if (L.st === 'fly') {
    // Viehe lentää kaarena kohti määränpäätä
    L.t++;
    const k = Math.min(1, L.t / L.T), ex = isoX(L.x, L.y), ey = lureY(L);
    L.ax = lerp(L.ax0, ex, k); L.ay = lerp(L.ay0, ey, k) - L.h * 4 * k * (1 - k);
    if (k >= 1) {
      L.st = 'float';
      L.onWater = lureInWater(L.x, L.y);
      const O = rigOrigin();   // siima lähtee ongen kärjestä (kaikilla vieheillä)
      L.out = Math.hypot(Math.hypot(L.x - O.x, L.y - O.y), tipHeight()) + 0.3;   // siiman todellinen (3D) pituus kärjestä vieheeseen
      if (L.onWater) {
        ripples.push({ x: L.x, y: L.y, t: 0, life: 55, max: 7, a: 0.75 }, { x: L.x, y: L.y, t: -12, life: 50, max: 4.5, a: 0.5 });
        for (let n = 0; n < 6; n++) particles.push({ x: ex + rand(-1, 1), y: ey - 1, vx: rand(-0.4, 0.4), vy: rand(-1.1, -0.4), g: 0.1, life: 40, color: pick(['#d8e4ec', '#ffffff']), floor: ey + rand(-1, 1), splash: true });
        SFX.plop();
      } else {
        SFX.thud();
        // Maahan osuessa pöllähtää hieman pölyä
        for (let n = 0; n < 4; n++) particles.push({ x: ex + rand(-1, 1), y: ey - 1, vx: rand(-0.3, 0.3), vy: rand(-0.5, -0.1), g: 0.05, life: 25, color: pick(['#8a7a5a', '#a08c66']), floor: ey + 1, splash: true });
      }
    }
    return;
  }
  if (L.fish) { updateFight(L, held); return; }
  // Kelaus vähentää ulkona olevaa siimaa; ensin kiristyy löysä siima, sitten koho alkaa liikkua
  if (mouseHeld2 && !held) releaseLine(L);
  if (held) { L.out = Math.max(0, L.out - reelStep(L)); if (++c.reelT % 6 === 0) SFX.reel(); }
  // Pohjaongen puntti uppoaa nopeasti (RIG_SINK), mutta siima kulkee ongen kärjestä (RIG_TIP) puntille: jos
  // siimaa ei ole riittävästi, puntti ei voi uppoamaan suoraan alas vaan kaartuu kireän siiman varassa kohti
  // vapaa (vaakasuora ulottuma lim = sqrt(siima² - (syvyys + kärki)²)); jos siima on liian lyhyt syvyydelle,
  // puntti pysyy ylempänä.
  // Kaikilla vieheillä siima on kärjestä vieheeseen kulkeva suora: vaakaetäisyys on enintään sqrt(siima² - (syvyys + kärjen korkeus)²),
  // joten viehe ei voi olla syvemmällä kuin siimaa on (siima miinus kärjen korkeus veden pintaan)
  const tipH = tipHeight();
  let lim;
  if (isRig(L.kind) && L.onWater) {
    L.z = clamp(L.z + RIG_SINK / 60, -tipH, Math.max(0, depthAt(L.x, L.y) - 0.03));
    if (L.z + tipH > L.out) L.z = L.out - tipH;   // liian lyhyellä siimalla puntti nousee ylös ilmaan (z < 0) ongen kärjen alle
    lim = Math.sqrt(Math.max(0, L.out * L.out - (L.z + tipH) * (L.z + tipH)));
  } else {
    const zl = L.onWater && isDirect(L.kind) ? L.z || 0 : 0;
    lim = Math.sqrt(Math.max(0, L.out * L.out - (zl + tipH) * (zl + tipH)));
  }
  const O = rigOrigin();   // siiman alkupää on ongen kärjen kohdalla maassa (ei hahmon jalkojen kohdalla)
  const dx = O.x - L.x, dy = O.y - L.y, d = Math.hypot(dx, dy) || 0.001;
  let moved = 0;
  if (d > lim) {
    moved = d - lim;   // vieheen siirtymä tällä ruudulla (kelaus, kävely tai vene)
    L.x += (dx / d) * moved; L.y += (dy / d) * moved;
  } else if (L.onWater) {
    // Löysällä siimalla tuuli ajelehtii kohoa hiljalleen
    const nx = L.x + wind.wx * wind.gust * 0.002, ny = L.y + wind.wy * wind.gust * 0.002;
    if (Math.hypot(O.x - nx, O.y - ny) < lim && lureInWater(nx, ny)) { L.x = nx; L.y = ny; }
  }
  L.onWater = lureInWater(L.x, L.y);
  L.moving = moved > 0.0005;
  // Vaapun / lipan syvyyteen vaikuttaa vain todellinen veto (kelaus, kävely tai vene), ei kärjen heilunta eikä uppoamisen aiheuttama heiluriliike
  const pm = held || player.moving || (player.boat && Math.abs(boat.v) > 0.004) ? moved : 0;
  if (L.kind === 'wobbler') {
    // Vaappu kelluu ja nousee koko ajan pintaa kohti (WOB_RISE). Vedettäessä kieli painaa sitä alas
    // sitä nopeammin, mitä kovempaa kelataan (WOB_DIVE metriä kuljettua metriä kohden). Kelaamalla
    // vaappu painuu yhä syvemmälle, kunnes se kulkee pohjaa pitkin; noin 30 cm/s nopeudella
    // sukellus ja nousu ovat tasapainossa ja vaappu ui samalla syvyydellä.
    L.z += (L.onWater ? pm * WOB_DIVE : 0) - WOB_RISE / 60;
    L.z = L.onWater ? clamp(L.z, 0, Math.max(0, depthAt(L.x, L.y) - 0.06)) : 0;
  } else if (L.kind === 'spoon') {
    // Lippa uppoaa koko ajan kohti pohjaa (SPOON_SINK). Kelattaessa kireä siima vetää sitä ongen kärkeä
    // kohti, jolloin lippa nousee siiman kulman mukaan: mitä jyrkemmin siima laskee veteen, sitä enemmän
    // lippa nousee kuljettua matkaa kohden. Kelaamisen loputtua lippa painuu pohjaan ja jää paikalleen.
    if (L.onWater) {
      // Vedossa lippa ei juuri uppoa: noin 0,5 m/s vauhdissa uppoaminen lakkaa kokonaan
      const slope = (L.z + tipH) / Math.max(1, d);
      L.z += (SPOON_SINK / 60) * (1 - Math.min(1, (pm * 60) / 0.5)) - pm * slope;
      L.z = clamp(L.z, 0, Math.max(0, depthAt(L.x, L.y) - 0.03));
    } else L.z = 0;
  } else if (isRig(L.kind)) {
    // Syvyys rajataan uuteen paikkaan; kelattaessa puntti kulkee pohjaa pitkin ja nousee, kun siima on liian lyhyt
    L.z = L.onWater ? clamp(L.z, -tipH, Math.max(0, depthAt(L.x, L.y) - 0.03)) : 0;
  }
  if (L.onWater && !isRig(L.kind) && L.z) {
    // Viehe ei voi olla syvemmällä kuin siimaa on (syvyys <= siima - kärjen korkeus), ja syvemmälle sukeltanut viehe vedetään siiman
    // 3D-pituuden vaatimalle vaakaetäisyydelle: sukellus lyhentää vaakaetäisyyttä (siima on suora kärjestä vieheeseen)
    L.z = Math.min(L.z, Math.max(0, L.out - tipH));
    const lim2 = Math.sqrt(Math.max(0, L.out * L.out - (L.z + tipH) * (L.z + tipH))), dd = Math.hypot(O.x - L.x, O.y - L.y);
    if (dd > lim2 && dd > 0.0001) { const m2 = dd - lim2; L.x += ((O.x - L.x) / dd) * m2; L.y += ((O.y - L.y) / dd) * m2; }   // heilurimainen veto ei ole kelausta (ei lasketa moved:iin)
  }
  if (L.onWater) {
    // Liikkuva koho jättää vanaveden ja renkaita, paikallaan oleva keinuu ja väreilee välillä
    if (moved > 0.004 && (L.z || 0) < 0.15 && ++L.wakeT % 6 === 0) {
      const a = Math.atan2(dy, dx), sp = Math.min(0.03, moved);
      for (const side of [-1, 1]) wakes.push({ x: L.x - Math.cos(a) * 0.15, y: L.y - Math.sin(a) * 0.15, vx: (-Math.sin(a) * side * 0.6 - Math.cos(a) * 0.3) * sp, vy: (Math.cos(a) * side * 0.6 - Math.sin(a) * 0.3) * sp, t: 0, life: 90 });
      if (L.wakeT % 24 === 0) ripples.push({ x: L.x, y: L.y, t: 0, life: 40, max: 3.5, a: 0.5 });
    } else if (moved <= 0.004 && Math.random() < 1 / 240) ripples.push({ x: L.x, y: L.y, t: 0, life: 40, max: 3, a: 0.35 });
  }
  // Kokonaan kelattu viehe palaa roikkumaan ongen kärkeen. Pohjaonki nousee vedestä vasta, kun puntti on
  // kelattu pintaan aivan pelaajan lähelle; puntin voi siis päästää pohjaan myös aivan pelaajan edestä
  // (kelaamatta se ei nouse, vaikka etäisyys menisi nollaan).
  // Kun kelalla ulkona oleva siima on lyhyempi kuin ongen kärjen korkeus veden pinnasta, viehe ei enää yllä veteen: se napataan nopeasti
  // (SNAP_T ruudussa) ongen kärkeen ja siima palautetaan heti lepotilaan, joten sitä ei tarvitse kelata kärkeen asti
  if (!isRig(L.kind) && !L.fish) {
    if (!(L.snap >= 0) && held && L.out <= tipH + 0.15) { L.snap = 0; L.sx = L.x; L.sy = L.y; L.sz = L.z || 0; L.out0 = L.out; }
    if (L.snap >= 0) {
      const u = Math.min(1, ++L.snap / SNAP_T), e = u * u * (3 - 2 * u);
      L.x = lerp(L.sx, O.x, e); L.y = lerp(L.sy, O.y, e); L.z = L.sz * (1 - e); L.sub = (-16 / Z_PX) * e; L.out = lerp(L.out0, 0.3, e);
      if (u >= 1) L.out = 0;
    } else L.sub = 0;
  }
  // Pohjaongella pikakelaus tapahtuu vasta, kun puntti on pois vedestä (ilmassa tai maalla) ja siimaa on ulkona enintään metri enemmän
  // kuin ongen kärjestä puntille on matkaa (esim. kävelemällä maalle vedetty puntti ei pikakelaudu, jos siimaa on paljon)
  if (isRig(L.kind) ? held && (L.z <= -0.1 || !L.onWater) && L.out <= Math.hypot(Math.hypot(O.x - L.x, O.y - L.y), tipH + Math.max(0, L.z)) + 1 : L.out <= 0.4 || L.snap >= SNAP_T) {
    c.lure = null; c.needRelease = true;
    resetLine();
    SFX.rodIn();
  }
}

// Siima roikkuu suoraan alas ongen kärjestä. Kohon ja koukun väli vastaa koukun syvyyttä
// (sama mittakaava kuin pohjan syvyydellä: Z_PX pikseliä metriä kohden).
const hookSegs = () => Math.max(1, Math.round((cast.hookDepth * Z_PX) / LINE_SEG));
function resetLine() {
  // Pohjaongen roikkuva siima: ylhäällä pääsiima, sen alla säädettävä syötin korkeus (puntista haaran kiinnityskohtaan, rigVisPx) ja
  // alimpana puntti ketjun päässä; ketjun pituus seuraa säätöä, jotta kiinnityskohta on aina oikealla korkeudella puntin yläpuolella
  const g = rodGeom(), n = isRig(player.lure) ? RIG_SEGS + 1 : BOB_I + 1 + (isDirect(player.lure) ? 0 : hookSegs());
  line = Array.from({ length: n }, (_, i) => ({ x: g.tx, y: g.ty + i * LINE_SEG, px: g.tx, py: g.ty + i * LINE_SEG }));
  rigArm = [];
  if (isRig(player.lure)) {
    const j = rigJunction();
    rigArm = Array.from({ length: 3 }, (_, i) => ({ x: j.x, y: j.y + i * RIG_ARM_SEG, px: j.x, py: j.y + i * RIG_ARM_SEG }));
  }
}

// Pohjaongen sivuhaara: oma pieni siimaketju (Verlet), joka on kiinni pääsiimassa RIG_DIST puntin yläpuolella,
// mutta liikkuu pääsiimasta erillään. Kun onkea heilutellaan, haara ja syötti heiluvat vapaasti.
// Piirrossa sivuhaara on suurennettu (kolme pikseliä; 10 cm olisi alle pikselin), samoin syötti.
const RIG_ARM_SEG = 1.6;   // syöttihaaran nivel (px); haaran kokonaispituus 2 nivelta = 3,2 px (pienimmän korkeuden 5,6 px:n sisällä, joten syötti ei roiku puntin alapuolelle)
// Piirrettävä pituus (px) = syötin korkeus (m) kertaa Z_PX (9 cm / px), ei vääristelyä. Roikkuva siima on aina RIG_SEGS nivelen (22,4 px)
// pituinen ongen kärjestä puntille, jolloin puntti roikkuu melkein maassa; säätö siirtää haaran kiinnityskohtaa:
// pienin korkeus 50 cm (5,6 px), suurin 150 cm (16,7 px)
const rigVisPx = (d) => d * Z_PX;
const RIG_SEGS = 14;
let rigArm = [];
// Haaran kiinnityskohta pääsiimaketjussa: rigVisPx(cast.rigDist) pikseliä ketjun (puntin) päästä ylöspäin
function rigJunction() {
  const n = line.length, idx = Math.max(0, n - 1 - rigVisPx(cast.rigDist) / LINE_SEG), i0 = Math.min(n - 2, Math.floor(idx)), f = idx - i0;
  const a = line[i0], b = line[i0 + 1];
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
}

// Pohjaongen syötin etäisyyttä puntista (20–120 cm) voi säätää vain, kun koko siima on kelattu sisään
function adjustRig(dv) {
  if (cast.lure) { notify('Reel in fully to adjust the bait distance.', 100, 'hint'); return; }
  cast.rigDist = clamp(Math.round((cast.rigDist + dv) * 100) / 100, RIG_MIN, RIG_MAX);
  notify('Bait height ' + Math.round(cast.rigDist * 100) + ' cm', 90, 'hook');
  if (player.rod) resetLine();
  SFX.reel();
}

// Koukun syvyyttä voi säätää vain, kun koko siima on kelattu sisään
function adjustHook(dv) {
  if (cast.lure) { notify('Reel in fully to adjust the hook depth.', 100, 'hint'); return; }
  cast.hookDepth = clamp(Math.round((cast.hookDepth + dv) * 10) / 10, HOOK_MIN, HOOK_MAX);
  notify('Hook depth ' + cast.hookDepth.toFixed(1) + ' m', 90, 'hook');
  if (player.rod) resetLine();
  SFX.reel();
}

// Koho-ongen tähdätty heitto: tähtäin osoittaa paikan vedenpinnalla. Napin ollessa pohjassa tähtäimen
// ympärillä oleva kehä pienenee ja kasvaa vuorotellen (halkaisija 0–5 m); napin vapautuessa koho
// laskeutuu kehän kokoiselle ympyrälle tähtäimen ympärille, eli epätarkin heitto menee 2,5 m ohi.
// Heiton enimmäispituus on 15 m. Kosketusohjauksessa ja muilla vieheillä heitto toimii kuten ennen.
const CAST_AIM_MAX = 15, CAST_SPREAD = 2.5;   // heiton enimmäispituus ja kehän suurin säde (m)
const aimCast = () => player.lure === 'bobber' && aiming();
function castTarget() {
  const [tx, ty] = absToWorld(mouseX + Math.round(cam.x), mouseY + Math.round(cam.y));
  return [tx, ty, Math.hypot(tx - player.x, ty - player.y)];
}
const castError = (power) => clamp(power, 0, 1);
function castLureAt(tx, ty, power) {
  const p = player, g = rodGeom(), r = castError(power) * CAST_SPREAD, a = rand(0, Math.PI * 2);
  const x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r, dist = Math.max(1, Math.hypot(x - p.x, y - p.y));
  cast.lure = {
    st: 'fly', ax0: g.tx, ay0: g.ty, ax: g.tx, ay: g.ty, t: 0, T: Math.round(18 + dist * 2), h: 10 + dist * 2.2,
    x, y, out: 0, onWater: false, wakeT: 0, sub: 0, fish: null, clickT: 0,
    kind: p.lure, z: 0, moving: false, dist: rigVisPx(cast.rigDist) / Z_PX,
  };
  cast.flick = 12;
  SFX.cast(clamp(dist / CAST_AIM_MAX, 0, 1));
}

function castLure(power) {
  const p = player, dist = CAST_MIN + power * ((isRig(p.lure) ? RIG_CAST_MAX : CAST_MAX) - CAST_MIN), g = rodGeom();
  cast.lure = {
    st: 'fly', ax0: g.tx, ay0: g.ty, ax: g.tx, ay: g.ty, t: 0, T: Math.round(18 + dist * 2), h: 10 + dist * 2.2,
    x: p.x + Math.cos(p.fa) * dist, y: p.y + Math.sin(p.fa) * dist, out: 0, onWater: false, wakeT: 0, sub: 0, fish: null, clickT: 0,
    kind: p.lure, z: 0, moving: false, dist: rigVisPx(cast.rigDist) / Z_PX,
  };
  cast.flick = 12;
  SFX.cast(power);
}

// Siima on ketju pisteitä (Verlet): painovoima ja tuuli liikuttavat niitä,
// ja pelaajan liikkuessa ongen kärki vetää siimaa perässään, jolloin koho heiluu
function updateLine() {
  const g = rodGeom();
  if (line.length < 2 || Math.hypot(line[1].x - g.tx, line[1].y - g.ty) > 24) resetLine();
  const pts = line;
  pts[0].x = g.tx; pts[0].y = g.ty;
  const wx = wind.sx * wind.gust * 0.02;
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    const vx = (q.x - q.px) * 0.965, vy = (q.y - q.py) * 0.965;
    q.px = q.x; q.py = q.y;
    q.x += vx + wx * (i / pts.length); q.y += vy + 0.16;
  }
  for (let it = 0; it < 6; it++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, diff = (d - LINE_SEG) / d;
      if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
      else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
    }
  }
  if (isRig(player.lure)) updateRigArm();
}
// Sivuhaara: ensimmäinen piste on pääsiimassa kiinni, muut roikkuvat vapaasti (painovoima, tuuli, hitaus)
function updateRigArm() {
  if (rigArm.length < 3) return;
  const j = rigJunction(), wx = wind.sx * wind.gust * 0.02;
  rigArm[0].px = rigArm[0].x; rigArm[0].py = rigArm[0].y; rigArm[0].x = j.x; rigArm[0].y = j.y;
  for (let i = 1; i < rigArm.length; i++) {
    const q = rigArm[i], vx = (q.x - q.px) * 0.94, vy = (q.y - q.py) * 0.94;
    q.px = q.x; q.py = q.y;
    q.x += vx + wx; q.y += vy + 0.2;
  }
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < rigArm.length; i++) {
      const a = rigArm[i - 1], b = rigArm[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, diff = (d - RIG_ARM_SEG) / d;
      if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
      else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
    }
  }
}

// ---------------------------------------------------------------------------
// Vuorokausi: aamu, päivä, ilta ja yö. Avainkohdat: osuus, taivaan väri horisontissa (heijastuu
// lammen kauimpaan osaan), taivaan väri laella (heijastuu lähimpään osaan), koko ruudun sävytys
// [r, g, b, alfa] ja pimeys (0 = päivä, 1 = yö).
// ---------------------------------------------------------------------------
const TOD_KEYS = [
  [0.00, [70, 66, 100], [40, 44, 72], [60, 50, 110, 0.16], 0.55],
  [0.04, [240, 160, 115], [90, 120, 140], [255, 130, 90, 0.2], 0.15],     // aamurusko
  [0.08, [252, 210, 120], [100, 158, 152], [255, 180, 80, 0.2], 0.02],     // kultainen aamu, lähivesi turkoosi
  [0.14, [220, 210, 165], [110, 155, 160], [255, 215, 140, 0.1], 0],
  [0.25, [145, 178, 192], [95, 135, 160], [255, 255, 255, 0], 0],
  [0.56, [145, 178, 192], [95, 135, 160], [255, 255, 255, 0], 0],
  [0.62, [250, 210, 120], [100, 152, 148], [255, 190, 90, 0.16], 0],      // kultainen hetki
  [0.67, [252, 165, 80], [70, 128, 134], [255, 130, 50, 0.24], 0.05],     // auringonlasku
  [0.71, [190, 90, 110], [60, 56, 95], [170, 60, 120, 0.2], 0.4],          // iltarusko
  [0.78, [26, 32, 56], [18, 22, 42], [20, 30, 80, 0.14], 1],
  [0.96, [26, 32, 56], [18, 22, 42], [20, 30, 80, 0.14], 1],
  [1.00, [70, 66, 100], [40, 44, 72], [60, 50, 110, 0.16], 0.55],
];
// Vuorokaudenaika lasketaan kellosta (clock; CYCLE yksikköä vuorokaudessa). Nopeudella 1x pelin kello
// etenee todellisen ajan tahtia (vuorokausi kestää 24 tuntia), 10x kymmenen kertaa nopeammin.
// Animaatiot käyttävät tasaisesti etenevää time-laskuria.
const todNow = () => ((clock + START_TOD * CYCLE) % CYCLE) / CYCLE;
const GAME_MIN = CYCLE / (24 * 60);             // kellon yksikköä pelin minuuttia kohden
const CLOCK_REAL = CYCLE / (24 * 60 * 60 * 60); // kellon eteneminen päivitystä kohden nopeudella 1x
const SYNC_STEP = GAME_MIN;                     // pikakelaus selaimen kellonaikaan: 60 min / s

// Selaimen paikallinen kellonaika vuorokauden osuutena (pelin vuorokausi alkaa kello 4.30)
function localTod() {
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return (((h - 4.5) / 24) % 1 + 1) % 1;
}
// Kellon eteneminen tällä päivityksellä: pikakelaus etenee kohti selaimen kellonaikaa ja pysähtyy
// siihen, minkä jälkeen nopeus palaa arvoon 1x
function advanceClock() {
  if (clockSync) {
    const left = ((localTod() - todNow() + 1) % 1) * CYCLE;
    if (left <= SYNC_STEP || left > CYCLE - SYNC_STEP) {
      clockStep = left <= SYNC_STEP ? left : 0;
      clockSync = false; timeScale = 1;
      notify('Clock set to local time · time speed 1x', 150, 'time');
    } else clockStep = SYNC_STEP;
  } else clockStep = timeScale * CLOCK_REAL;
  clock += clockStep;
}
const phaseOf = (t) => (t < 0.03 || t >= 0.76 ? 'NIGHT' : t < 0.25 ? 'MORNING' : t < 0.58 ? 'DAY' : 'EVENING');
// Ympäristön värit lasketaan kerran ruudunpäivityksessä (vuorokaudenaika + sää)
let env = null;
function updateEnv() {
  const t = todNow();
  let k = 0;
  while (k < TOD_KEYS.length - 2 && TOD_KEYS[k + 1][0] <= t) k++;
  const A = TOD_KEYS[k], B = TOD_KEYS[k + 1], f = clamp((t - A[0]) / (B[0] - A[0]), 0, 1);
  const tint = [...lerp3(A[3], B[3], f), lerp(A[3][3], B[3][3], f)];
  const dark = lerp(A[4], B[4], f);
  // Pilvisellä säällä taivas on harmaampi ja sävytys haaleampi
  const overcast = clamp(Math.max(weather.rain * 0.9, weather.fog * 0.7), 0, 1);
  const grey = (c) => { const lum = (c[0] + c[1] + c[2]) / 3; return lerp3(c, [lum * 0.85 + 12, lum * 0.9 + 14, lum * 0.95 + 16], overcast * 0.75); };
  const sky = grey(lerp3(A[1], B[1], f)), zen = grey(lerp3(A[2], B[2], f));
  tint[3] *= 1 - overcast * 0.6;
  const water = lerp3([18, 32, 36], sky, 0.45);
  const refl = lerp3([9, 19, 14], sky, 0.06);
  env = {
    tod: t, sky, zen, tint, dark, overcast,
    // Aamu- ja iltavalossa vedenpinta heijastaa värikästä taivasta voimakkaammin
    reflK: 0.15 + 0.35 * clamp(tint[3] * 4, 0, 1) * (1 - dark),
    refl: refl.map(Math.round), reflMid: lerp3(refl, sky, 0.12).map(Math.round), reflHi: lerp3(refl, sky, 0.3).map(Math.round),
    ring: lerp3(sky, [235, 240, 245], 0.55).map(Math.round).join(', '),
    body: lerp3([26, 38, 30], sky, 0.12).map(Math.round),   // humuspitoisen lammen ruskeanvihreä vesi
  };
}
const nightAmt = () => env.dark;

function updateDayPhase() {
  const ph = phaseOf(env.tod);
  if (ph === phaseName) return;
  phaseName = ph;
}

// ---------------------------------------------------------------------------
// Sää ja tuuli: selkeä, tihkusade, kova sade tai usva. Tuulen suunta ja voimakkuus
// vaihtelevat hitaasti ja vaikuttavat sateen suuntaan, savuun, kaisloihin ja aaltoihin.
// ---------------------------------------------------------------------------
const WEATHER = {
  clear: { rain: 0, fog: 0 },
  drizzle: { rain: 0.35, fog: 0.12 },
  rain: { rain: 1.15, fog: 0.18 },
  fog: { rain: 0, fog: 1 },
};

// Sää määräytyy pelin kellon mukaan päiväkohtaisesta suunnitelmasta, joten se toimii myös nopeutetulla
// ajalla ja unen aikana. Noin 40 %:na päivistä sataa kerran (tihkua tai kovaa sadetta 0,7–4 tuntia),
// muina päivinä ei lainkaan. Usvaa voi olla vain aamulla 3.30–9.30 ja illalla 19.30–23.30; se on
// todennäköisempää, jos on satanut (aamulla edellisenä päivänä, illalla samana päivänä).
const RAIN_DAY = 0.4, FOG_P = 0.2, FOG_P_WET = 0.6;
const weatherPlans = new Map();
// Päivän sade (tai null): arvotaan päivän numerosta, joten edellisenkin päivän sade tiedetään
function rainOf(day) {
  const rnd = mulberry32(((day + 1000) * 2654435761) ^ weatherSeed);
  if (rnd() >= RAIN_DAY) return null;
  const start = rnd() * 22, len = 0.7 + rnd() * 3.3;
  return { start, end: Math.min(24, start + len), kind: rnd() < 0.6 ? 'drizzle' : 'rain' };
}
function weatherPlan(day) {
  if (weatherPlans.has(day)) return weatherPlans.get(day);
  const rnd = mulberry32(((day + 1000) * 2246822519) ^ weatherSeed ^ 0x5bd1e995);
  const plan = { rain: rainOf(day), fogs: [] };
  if (rnd() < (rainOf(day - 1) ? FOG_P_WET : FOG_P)) {
    const start = 3.5 + rnd() * 3, end = Math.min(9.5, start + 1 + rnd() * 2.5);
    plan.fogs.push({ start, end });
  }
  if (rnd() < (plan.rain && plan.rain.end < 19.5 ? FOG_P_WET : FOG_P)) {
    const start = 19.5 + rnd() * 2, end = Math.min(23.5, start + 1 + rnd() * 2);
    plan.fogs.push({ start, end });
  }
  weatherPlans.set(day, plan);
  return plan;
}
let weatherSeed = 0;
// Pelin päivä ja kellonaika tunteina (keskiyöstä)
function gameDayHour() {
  const abs = 4.5 + ((clock + START_TOD * CYCLE) / CYCLE) * 24, day = Math.floor(abs / 24);
  return [day, abs - day * 24];
}
function weatherKindNow() {
  const [day, h] = gameDayHour(), plan = weatherPlan(day);
  if (plan.rain && h >= plan.rain.start && h < plan.rain.end) return plan.rain.kind;
  if (plan.fogs.some((f) => h >= f.start && h < f.end)) return 'fog';
  return 'clear';
}
function setWeatherKind(kind) {
  if (kind === weather.kind) return;
  weather.kind = kind;
  if (kind === 'rain') wind.ts = Math.max(wind.ts, rand(0.55, 0.9));
}

function updateWeather() {
  const w = weather;
  setWeatherKind(weatherKindNow());
  const target = WEATHER[w.kind];
  w.rain += (target.rain - w.rain) * 0.004;
  w.fog += (target.fog - w.fog) * 0.003;

  // Tuuli: uusi tavoitesuunta ja -voimakkuus 20–50 sekunnin välein, puuskat päälle
  if (--wind.t <= 0) nextWind();
  wind.s += (wind.ts - wind.s) * 0.002;
  wind.a += angDiff(wind.a, wind.ta) * 0.0015;
  wind.gust = clamp(wind.s * (0.85 + Math.sin(time * 0.021) * 0.12 + Math.sin(time * 0.057) * 0.08), 0, 1);
  wind.wx = Math.cos(wind.a); wind.wy = Math.sin(wind.a);
  [wind.sx, wind.sy] = screenDir(wind.wx, wind.wy);
  // Väreet kulkevat tuulen mukana
  waveOff.x -= wind.sx * (0.04 + wind.gust * 0.3);
  waveOff.y -= wind.sy * (0.02 + wind.gust * 0.15);

  // Sadepisarat ruudun koordinaatistossa. Tuuli kallistaa niiden putoamissuuntaa hieman.
  // Veteen osuva pisara jättää pinnalle laajenevan renkaan.
  const heavy = w.rain > 0.6;
  const want = Math.floor(240 * Math.min(1.3, w.rain));
  while (drops.length < want) drops.push(newDrop(rand(-H, H)));
  if (drops.length > want) drops.length = want;
  const drift = wind.sx * wind.gust * 1.6;
  const camXr = Math.round(cam.x), camYr = Math.round(cam.y);
  for (const d of drops) {
    d.y += d.sp; d.x += drift * (d.sp / 5);
    if (d.y > d.floor) {
      const ax = Math.round(d.x) + camXr, ay = Math.round(d.y) + camYr;
      if (waterPx(ax, ay)) {
        const [x, y] = absToWorld(ax, ay);
        if (ripples.length < 400) ripples.push({ x, y, t: 0, life: heavy ? 30 : 26, max: heavy ? rand(3, 4.5) : rand(2, 3.2), a: heavy ? 0.6 : 0.45, drop: heavy });
      } else { d.splash = 3; d.sx = d.x; d.sy = d.y; }
      Object.assign(d, newDrop(rand(-30, -4)), { splash: d.splash, sx: d.sx, sy: d.sy });
    }
    if (d.splash > 0) d.splash--;
  }
}

function nextWind() {
  wind.t = rand(20, 50) * 60;
  wind.ts = weather.kind === 'rain' ? rand(0.5, 1) : Math.random() < 0.3 ? rand(0, 0.12) : rand(0.1, 0.75);
  wind.ta = wind.a + rand(-1.2, 1.2);
}

function newDrop(y) {
  const heavy = weather.rain > 0.6;
  return { x: rand(-40, W + 40), y, sp: heavy ? rand(5, 7) : rand(2.6, 3.6), floor: rand(10, H), len: heavy ? 3 : 1, splash: 0, sx: 0, sy: 0 };
}

// Vedenpinnan usva: usvan aikana lammen päällä leijuu ohut usvakerros ja sen päällä pehmeitä usvalauttoja,
// jotka ajelehtivat tuulen mukana. Usva piirretään puolella resoluutiolla (pikselimäinen) ja rajataan
// lammen alueelle. Kaislat, lumpeet ja rannan puut jäävät usvan yläpuolelle.
let mistWisps = [];
const mistLow = makeCanvas(1, 1), mistLowCtx = mistLow.getContext('2d');
const mistCanvas = makeCanvas(1, 1), mistCtx = mistCanvas.getContext('2d');
function mistSpot() {
  for (let k = 0; k < 50; k++) {
    const x = C + rand(-POND_RMAX, POND_RMAX), y = C + rand(-POND_RMAX, POND_RMAX);
    if (shoreDist(x, y) < -1) return { x, y, r: rand(3, 7), a: rand(0.5, 1) };
  }
  return { x: C, y: C, r: 5, a: 0.7 };
}
function drawWaterMist(camXr, camYr) {
  const f = weather.fog;
  if (f < 0.03 || !water.show || gfxLow) return;   // kevyessä tilassa lammen usvakerrosta ei piirretä (jää yleinen usvaverho)
  if (!mistWisps.length) mistWisps = Array.from({ length: 22 }, mistSpot);
  const lw = Math.ceil(W / 2), lh = Math.ceil(H / 2);
  if (mistLow.width !== lw || mistLow.height !== lh) { mistLow.width = lw; mistLow.height = lh; mistCanvas.width = W; mistCanvas.height = H; }
  const lum = 1 - env.dark * 0.75, base = lerp3([214, 222, 224], env.sky, 0.35).map((v) => Math.round(v * lum));
  const g = mistLowCtx;
  g.clearRect(0, 0, lw, lh);
  g.fillStyle = `rgba(${base[0]}, ${base[1]}, ${base[2]}, 0.32)`;
  g.fillRect(0, 0, lw, lh);
  for (const o of mistWisps) {
    o.x += wind.wx * (0.002 + wind.gust * 0.006); o.y += wind.wy * (0.002 + wind.gust * 0.006);
    if (shoreDist(o.x, o.y) > 1.5) Object.assign(o, mistSpot());
    const sx = (isoX(o.x, o.y) - camXr) / 2, sy = (isoY(o.x, o.y) - camYr) / 2, rx = o.r * 8 / 2, ry = o.r * 2.2 / 2;
    if (sx < -rx || sx > lw + rx || sy < -ry || sy > lh + ry) continue;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${0.55 * o.a})`);
    gr.addColorStop(1, `rgba(${base[0]}, ${base[1]}, ${base[2]}, 0)`);
    g.save(); g.translate(sx, sy); g.scale(1, ry / rx); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
  }
  const m = mistCtx;
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, W, H);
  m.imageSmoothingEnabled = false;
  m.drawImage(mistLow, 0, 0, lw * 2, lh * 2);
  m.globalCompositeOperation = 'destination-in';
  m.drawImage(pondMaskCanvas, PB.x0 - camXr, PB.y0 - camYr);
  ctx.globalAlpha = Math.min(1, f * 1.1);
  ctx.drawImage(mistCanvas, 0, 0);
  ctx.globalAlpha = 1;
}

// Usva piirretään matalalla resoluutiolla -> pikselimäinen "sumuverho"
const fogCanvas = makeCanvas(W / 4, H / 4);
const fogCtx = fogCanvas.getContext('2d');

const tintCanvas = makeCanvas(1, 1), tintCtx = tintCanvas.getContext('2d');
let tintKey = '', tintCx = 0, tintCy = 0, tintTick = 0;
function drawWeather(camXr, camYr) {
  const w = weather;
  if (w.rain > 0.02) {
    ctx.fillStyle = `rgba(15, 25, 38, ${Math.min(0.35, w.rain * 0.25)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // Pisarat ja roiskeet maassa: viiru kallistuu tuulen mukana
  if (drops.length) {
    const slant = wind.sx * wind.gust * 1.6 / 5;
    // Kaikki pisarat yhtenä polkuna (yksi piirtokomento tuhansien sijaan)
    ctx.fillStyle = 'rgba(170, 195, 220, 0.5)';
    ctx.beginPath();
    for (const d of drops) {
      const x = Math.round(d.x), y = Math.round(d.y);
      ctx.rect(x, y, 1, 1);
      for (let k = 1; k <= d.len; k++) ctx.rect(Math.round(x - slant * k * 1.5), y - k, 1, 1);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(210, 225, 240, 0.55)';
    ctx.beginPath();
    for (const d of drops) if (d.splash > 0) { ctx.rect(Math.round(d.sx) - 1, Math.round(d.sy), 1, 1); ctx.rect(Math.round(d.sx) + 1, Math.round(d.sy), 1, 1); }
    ctx.fill();
  }
  // Usva: tasainen verho, jossa tuulen mukana ajelehtivia sumulauttoja ja näkyvä alue pelaajan ympärillä
  if (w.fog > 0.02) {
    const fw = fogCanvas.width, fh = fogCanvas.height;
    fogCtx.clearRect(0, 0, fw, fh);
    fogCtx.globalCompositeOperation = 'source-over';
    const lum = 1 - env.dark * 0.75;
    fogCtx.fillStyle = `rgba(${Math.round(185 * lum)}, ${Math.round(196 * lum)}, ${Math.round(190 * lum)}, ${w.fog * 0.36})`;
    fogCtx.fillRect(0, 0, fw, fh);
    fogCtx.fillStyle = `rgba(${Math.round(215 * lum)}, ${Math.round(222 * lum)}, ${Math.round(218 * lum)}, ${w.fog * 0.15})`;
    for (let k = 0; k < 7; k++) {
      const x = ((k * 37 + waveOff.x * -0.6 * (1 + k * 0.1) - camXr / 4) % (fw + 30) + fw + 30) % (fw + 30) - 15;
      const y = ((k * 23 - camYr / 4) % fh + fh) % fh;
      disc(fogCtx, x, y, 6 + (k % 3) * 3);
    }
    const px = (isoX(player.x, player.y) - camXr) / 4, py = (isoY(player.x, player.y) - camYr - 8) / 4;
    const grad = fogCtx.createRadialGradient(px, py, 6, px, py, 26);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.fillStyle = grad;
    fogCtx.fillRect(0, 0, fw, fh);
    fogCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogCanvas, 0, 0, W, H);
  }
  // Aamun ja illan värisävy
  // Sävytys sekoitetaan pehmeällä valolla (soft-light), joka värittää kuvaa mutta säilyttää kontrastin:
  // aamu- ja iltavalo hehkuu kultaisena ja oranssina ilman, että kuva haalistuu ruskeaksi.
  // Vedenpinnalla sävytys on miedompi, jolloin lähivesi jää turkoosiksi ja heijastaa kultaista taivasta.
  const [tr, tg, tb, ta] = env.tint;
  if (ta > 0.005) {
    // Sävykerros (väri, josta lampi on leikattu pois) rakennetaan uudelleen vain kun väri tai kamera muuttuu
    const tcol = `rgba(${Math.round(tr)}, ${Math.round(tg)}, ${Math.round(tb)}, ${Math.min(0.6, ta * 2.2).toFixed(3)})`;
    // Kameran liikkuessa kerros rakennetaan vain joka 3. ruudussa ja välillä vanhaa siirretään kameran liikkeen verran
    const tkey = tcol + ',' + W + ',' + H;
    ++tintTick;
    if (tkey !== tintKey || ((camXr !== tintCx || camYr !== tintCy) && tintTick >= 3)) {
      tintKey = tkey; tintTick = 0; tintCx = camXr; tintCy = camYr;
      if (tintCanvas.width !== W || tintCanvas.height !== H) { tintCanvas.width = W; tintCanvas.height = H; }
      const tc = tintCtx;
      tc.globalCompositeOperation = 'source-over';
      tc.clearRect(0, 0, W, H);
      tc.fillStyle = tcol;
      tc.fillRect(0, 0, W, H);
      tc.globalCompositeOperation = 'destination-out';
      tc.globalAlpha = 0.65;
      tc.drawImage(pondMaskCanvas, PB.x0 - camXr, PB.y0 - camYr);
      tc.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'soft-light';
    const tox = tintCx - camXr, toy = tintCy - camYr;
    ctx.drawImage(tintCanvas, tox, toy);
    if (tox || toy) {
      ctx.fillStyle = tcol;
      if (toy > 0) ctx.fillRect(0, 0, W, toy); else if (toy < 0) ctx.fillRect(0, H + toy, W, -toy);
      if (tox > 0) ctx.fillRect(0, 0, tox, H); else if (tox < 0) ctx.fillRect(W + tox, 0, -tox, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${Math.round(tr)}, ${Math.round(tg)}, ${Math.round(tb)}, ${(ta * 0.12).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawNight(camXr, camYr);
  drawStarReflections(camXr, camYr);
  drawEmbers(camXr, camYr);
  drawGlows();
}

// Kohon valopisteen hehku: pimeällä pieni vihreä kehä, päivällä vain kirkas piste
// Hahmon takana olevien kohojen hehku piirretään omalle kerrokselleen, josta leikataan hahmon kuva pois
const glowCanvas = makeCanvas(1, 1), glowCtx = glowCanvas.getContext('2d');
function drawGlows() {
  const back = glows.filter((o) => o.behind), front = glows.filter((o) => !o.behind);
  if (back.length && shownPlayer.img && playerShown()) {
    if (glowCanvas.width !== W || glowCanvas.height !== H) { glowCanvas.width = W; glowCanvas.height = H; }
    const g = glowCtx;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    paintGlows(g, back);
    g.globalCompositeOperation = 'destination-out';
    const P = shownPlayer;
    if (P.flip) { g.save(); g.translate(P.x + P.img.width, P.y); g.scale(-1, 1); g.drawImage(P.img, 0, 0); g.restore(); }
    else g.drawImage(P.img, P.x, P.y);
    g.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  } else front.push(...back);
  ctx.globalCompositeOperation = 'lighter';
  paintGlows(ctx, front);
  ctx.globalCompositeOperation = 'source-over';
  glows = [];
}
function paintGlows(c, list) {
  const night = nightAmt();
  for (const o of list) {
    const a = o.a * (0.85 + 0.15 * Math.sin(time * 0.1));
    if (night > 0.05) {
      c.fillStyle = `rgba(70, 255, 60, ${(0.1 * night * a).toFixed(3)})`;
      disc(c, o.x, o.y, 5);
      c.fillStyle = `rgba(70, 255, 60, ${(0.16 * night * a).toFixed(3)})`;
      disc(c, o.x, o.y, 3);
      c.fillStyle = `rgba(90, 255, 70, ${(0.5 * night * a).toFixed(3)})`;
      c.fillRect(o.x - 1, o.y, 3, 1); c.fillRect(o.x, o.y - 1, 1, 3);
    }
    c.fillStyle = `rgba(190, 255, 160, ${(0.9 * a).toFixed(3)})`;
    c.fillRect(o.x, o.y, 1, 1);
  }
}

// Kipinät piirretään yön pimennyksen päälle, joten ne hehkuvat pimeässä. Kipinän väri kulkee
// vaaleankeltaisesta punaiseen sen jäähtyessä, ja pimeällä sen ympärille tulee himmeä hehku.
function drawEmbers(camXr, camYr) {
  const night = nightAmt();
  ctx.globalCompositeOperation = 'lighter';
  for (const q of particles) {
    if (!q.ember) continue;
    const x = Math.round(q.x - camXr), y = Math.round(q.y - camYr);
    if (x < -2 || x > W + 2 || y < -2 || y > H + 2) continue;
    const k = q.life / q.max, fl = 0.75 + 0.25 * Math.sin(time * 0.4 + q.ph), b = Math.min(1, k * 1.6) * fl;
    if (night > 0.05) {
      ctx.fillStyle = `rgba(255, 120, 30, ${(0.4 * night * b).toFixed(3)})`;
      ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
    }
    const col = k > 0.75 ? [255, 240, 170] : k > 0.45 ? [255, 180, 64] : k > 0.2 ? [255, 106, 26] : [170, 40, 16];
    ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(0.55 + 0.45 * b).toFixed(3)})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------
// Yö: pimeys, jota valaisevat nuotio ja otsalamppu
// ---------------------------------------------------------------------------
// Liekin leimuaminen (0,6–1,15): hidas aaltoilu, nopea väpätys ja satunnaiset leimahdukset
function fireFlicker(i) {
  const t = time + i * 13.7;
  return 0.82 + Math.sin(t * 0.21) * 0.08 + Math.sin(t * 0.57 + i) * 0.07 + Math.sin(t * 1.33) * 0.05
    + (Math.random() - 0.5) * 0.08 + (Math.sin(t * 0.047) > 0.93 ? 0.12 : 0);
}

// Valokartta lasketaan pelin täydellä resoluutiolla ja pimeys rasteroidaan Bayer-matriisilla:
// pehmeä valo saa pikselitaiteelle tyypillisen porrastetun, kuvioidun reunan.
const lightCanvas = makeCanvas(W, H);
const lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true });
const darkCanvas = makeCanvas(W, H);
const darkCtx = darkCanvas.getContext('2d');
let darkImg = darkCtx.createImageData(W, H);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const DARK_LEVELS = 6;
// Valoläiskät piirretään valmiista gradienttikuvista (skaalataan drawImagella) eikä luomalla gradienttia joka ruudussa
const LIGHT_SPR = 128;
function makeLightSprite(r, g, b, stops) {
  const c = makeCanvas(LIGHT_SPR, LIGHT_SPR), x = c.getContext('2d'), h = LIGHT_SPR / 2;
  const gr = x.createRadialGradient(h, h, 0, h, h, h);
  for (const [pos, a] of stops) gr.addColorStop(pos, `rgba(${r}, ${g}, ${b}, ${a})`);
  x.fillStyle = gr;
  x.fillRect(0, 0, LIGHT_SPR, LIGHT_SPR);
  return c;
}
const lightBlob = makeLightSprite(255, 255, 255, [[0, 1], [0.3, 0.62], [0.65, 0.22], [1, 0]]);
// Valoläiskän säteittäinen profiili (0 = keskellä, 1 = reunalla) luetaan kerran; valokartta lasketaan sillä suoraan
// ilman GPU-canvaksen lukua joka ruudussa (getImageData on puhelimella hidas)
const lightProf = new Float32Array(257);
{ const g = lightBlob.getContext('2d'), h = LIGHT_SPR >> 1, row = g.getImageData(h, h, h, 1).data;
  for (let i = 0; i <= 256; i++) lightProf[i] = row[Math.min(h - 1, Math.floor(i / 256 * h)) * 4 + 3] / 255; }
let lightBuf = new Uint16Array(0);
const colorBlobs = {};   // väriläiskät värin mukaan: alfa 0,3 -> 0,1 -> 0
const colorBlob = (col) => colorBlobs[col] || (colorBlobs[col] = makeLightSprite(col[0], col[1], col[2], [[0, 0.3], [0.5, 0.1], [1, 0]]));
// Pimeyskerroksen hakutaulu: (valon arvo 0–255, Bayer-kohta 0–15) -> valmis 32-bittinen pikseli
let darkLut = new Uint32Array(256 * 16), darkLutKey = -1, dark32 = null;
const clamp8 = new Uint8ClampedArray(1);
function buildDarkLut(maxDark) {
  for (let v = 0; v < 256; v++) {
    const f = (1 - Math.min(1, v / 255)) * DARK_LEVELS, fl = Math.floor(f);
    for (let b = 0; b < 16; b++) {
      clamp8[0] = (fl + (f - fl > BAYER[b] ? 1 : 0)) * maxDark;
      darkLut[(v << 4) | b] = ((clamp8[0] << 24) | (22 << 16) | (6 << 8) | 4) >>> 0;
    }
  }
  darkLutKey = maxDark;
}
// Yön valokerros (valokartta, pimeys, lampun sävy) lasketaan uudelleen heti kun kamera, hahmo tai
// valaistus muuttuu; muuten (paikallaan seistessä) vain joka NIGHT_EVERY. ruudussa, jolloin vain nuotion
// välke päivittyy harvemmin.
let nightEvery = 4, nightTick = 0, nightKey = '', nightMKey = '', nightCx = 0, nightCy = 0;
const spriteAlphas = new WeakMap();
function spriteAlpha(img) {
  let a = spriteAlphas.get(img);
  if (!a) {
    const c = makeCanvas(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    a = new Uint8Array(img.width * img.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    spriteAlphas.set(img, a);
  }
  return a;
}
let lampFa = 0, lampT = 0, lampKey = '', lampLum = new Uint8Array(0);
let nightLampBox = null;   // otsalampun valon rajauslaatikko ruudulla [x, y, w, h]

function collectLights(camXr, camYr) {
  const L = [];
  const add = (x, y, r, a, col) => { if (x > -r && x < W + r && y > -r && y < H + r) L.push({ x, y, r, a, col }); };
  const flick = Math.sin(time * 0.31) * 2.5 + Math.sin(time * 0.73) * 1.5 + Math.random() * 2;
  const fg = fireGlow();   // nuotion valo seuraa palavan puun määrää; hiillos hohtaa heikosti
  if (fg > 0.01) add(isoX(CAMP.cx + 0.5, CAMP.cy + 0.5) - camXr, isoY(CAMP.cx + 0.5, CAMP.cy + 0.5) - camYr - 3, 14 + 50 * fg + flick * fg, 0.95 * Math.min(1, fg * 1.15), fireLevel() > 0 ? [255, 140, 50] : [255, 60, 25]);
  // Pelaajan oma hahmo erottuu hämärästi; päällä oleva otsalamppu valaisee myös hattua ja kasvoja
  add(isoX(player.x, player.y) - camXr, isoY(player.x, player.y) - camYr - 9, 16, 0.35, null);
  if (lampOn()) add(isoX(player.x, player.y) - camXr, isoY(player.x, player.y) - camYr - 16, 7, 0.3, null);
  return L;
}

// Otsalampun valo. Lamppu on hatussa, joten maahan osuva valoläikkä alkaa vasta noin metrin päästä
// jaloista ja ulottuu noin 10 metriin. Lampusta läikkään kulkee ilmassa himmeä keila. Hahmo itse
// leikataan valosta pois, jolloin poispäin osoittava keila jää hahmon taakse.
const lampCanvas = makeCanvas(W, H), lampCtx = lampCanvas.getContext('2d', { willReadFrequently: true });
const lampTint = makeCanvas(W, H), lampTintCtx = lampTint.getContext('2d');
function drawLampLight(dx, dy) {
  const g = lampCtx, fa = lampFa;
  const psx = W >> 1, psy = H >> 1;   // piirretään aina ruudun keskelle; sijoitus ruudulle tehdään vasta käytettäessä
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.save();
  g.setTransform(HW, HH, -HW, HH, psx, psy);
  for (const [len, spread, alpha] of [[10, 0.5, 0.39], [9.5, 0.27, 0.63]]) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, len);
    gr.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gr.addColorStop(0.08, 'rgba(255, 255, 255, 0)');
    gr.addColorStop(0.2, `rgba(255, 255, 255, ${alpha * 0.85})`);
    gr.addColorStop(0.55, `rgba(255, 255, 255, ${alpha * 0.75})`);
    gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, len, fa - spread, fa + spread);
    g.closePath();
    g.fill();
  }
  g.restore();
  // Keila ilmassa: lampusta valoläikän lähireunaan
  const P = (r, a) => [psx + (Math.cos(a) - Math.sin(a)) * r * HW, psy + (Math.cos(a) + Math.sin(a)) * r * HH];
  const [ax, ay] = P(1.6, fa - 0.4), [bx, by] = P(1.6, fa + 0.4), hx = shownPlayer.hx + dx, hy = shownPlayer.hy + dy;
  const gr = g.createLinearGradient(hx, hy, (ax + bx) / 2, (ay + by) / 2);
  gr.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  gr.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(ax, ay); g.lineTo(bx, by); g.closePath(); g.fill();
  // Hahmo ei ole oman lamppunsa valossa: leikkaus tehdään valokarttaan käytettäessä (ks. drawNight, spriteAlpha)
  return lampCanvas;
}

function drawNight(camXr, camYr) {
  const night = nightAmt();
  if (night <= 0.01) return;
  const lights = collectLights(camXr, camYr);
  const lc = lightCtx, lamp = lampOn();
  // Heti uusiksi: lampun kytkentä, yön määrä, ruudun koko. Liikkuessa (kamera, hahmo, suunta muuttuu) vain joka
  // 2. (kevyessä tilassa 3.) ruudussa, ja välillä vanhaa kerrosta siirretään kameran liikkeen verran
  const key = [lamp, (night * 400) | 0, W, H].join();
  const mkey = [camXr, camYr, player.x.toFixed(3), player.y.toFixed(3), player.fa.toFixed(3), shownPlayer.x, shownPlayer.y].join();
  const moved = mkey !== nightMKey;
  ++nightTick;
  const redo = key !== nightKey || nightTick >= (moved ? (gfxLow ? 3 : 2) : (gfxLow ? 8 : nightEvery));
  if (redo) {
    nightKey = key; nightMKey = mkey; nightTick = 0; nightCx = camXr; nightCy = camYr;
    // 1) Valon voimakkuus lasketaan suoraan taulukkoon (blob-valot). Otsalampun valo piirretään ja luetaan vain kun
    // suunta, korkeus, sijainti ruudulla tai yön määrä muuttuu (käveltäessä kamera seuraa hahmoa, joten se pysyy samana).
    // 2) Pimeyskerros: rasteroidaan valon mukaan porrastetuiksi tasoiksi, laatikko kerrallaan.
    // Valon määrä porrastetaan ja rasteroidaan, pimeyden voimakkuus ei: tasainen hämärä pysyy tasaisena
    // eikä muutu pistekuvioksi, ja vain valokeilojen reunoille tulee porrastettu, kuvioitu liuku.
    const maxDark = 0.84 * night * 255 / DARK_LEVELS;
    if (darkLutKey !== maxDark) buildDarkLut(maxDark);
    if (!dark32 || dark32.buffer !== darkImg.data.buffer) dark32 = new Uint32Array(darkImg.data.buffer);
    const boxes = [];
    const addBox = (x0, y0, x1, y1) => {
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
      if (x1 > x0 && y1 > y0) boxes.push([x0, y0, x1, y1]);
    };
    for (const l of lights) addBox(l.x - l.r - 1, l.y - l.r - 1, l.x + l.r + 1, l.y + l.r + 1);
    nightLampBox = null;
    if (lamp) {
      // Lampun valo ulottuu enintään ±113 x ±56 px hahmon pään kohdalta (mitattu kaikilla suunnilla)
      const psx = Math.round(isoX(player.x, player.y) - camXr), psy = Math.round(isoY(player.x, player.y) - camYr - playerLift());
      nightLampBox = [psx - 117, psy - 60, 234, 120];   // koko laatikko (voi ulottua ruudun ulkopuolelle)
      addBox(psx - 117, psy - 60, psx + 117, psy + 60);
      // Lampun valo piirretään uudelleen vasta kun suunta on kääntynyt yli 1,4° ja edellisestä on vähintään 3 päivitystä
      const lk = [(night * 400) | 0, W, H].join();
      if (lk !== lampKey || (Math.cos(player.fa - lampFa) < 0.9997 && time - lampT >= 3)) {
        lampKey = lk; lampFa = player.fa; lampT = time;
        drawLampLight((W >> 1) - psx, (H >> 1) - psy);
        const rx = (W >> 1) - 117, ry = (H >> 1) - 60;
        const ld = lampCtx.getImageData(rx, ry, 234, 120).data;
        if (lampLum.length !== 234 * 120) lampLum = new Uint8Array(234 * 120);
        for (let q = 0, j = 0; j < 234 * 120; j++, q += 4) lampLum[j] = ld[q] * ld[q + 3] / 255;
        // Otsalampun kellertävä sävy valmiiksi (hahmo itse jää sen ulkopuolelle); vain lampun laatikko
        lampTintCtx.globalCompositeOperation = 'source-over';
        lampTintCtx.clearRect(0, 0, W, H);
        lampTintCtx.drawImage(lampCanvas, rx, ry, 234, 120, rx, ry, 234, 120);
        lampTintCtx.globalCompositeOperation = 'source-in';
        lampTintCtx.fillStyle = `rgba(255, 240, 200, ${(0.16 * night).toFixed(3)})`;
        lampTintCtx.fillRect(rx, ry, 234, 120);
      }
    }
    darkCtx.clearRect(0, 0, W, H);
    darkCtx.fillStyle = `rgba(4, 6, 22, ${((darkLut[0] >>> 24) / 255).toFixed(4)})`;
    darkCtx.fillRect(0, 0, W, H);
    if (boxes.length) {
      if (lightBuf.length !== W * H) lightBuf = new Uint16Array(W * H);
      for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) lightBuf.fill(0, y * W + x0, y * W + x1);
      for (const l of lights) {
        const x0 = Math.max(0, Math.floor(l.x - l.r)), x1 = Math.min(W, Math.ceil(l.x + l.r));
        const y0 = Math.max(0, Math.floor(l.y - l.r)), y1 = Math.min(H, Math.ceil(l.y + l.r));
        const k = 256 / l.r, amp = 255 * l.a;
        for (let y = y0; y < y1; y++) {
          const dy = y + 0.5 - l.y, dy2 = dy * dy;
          for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
            const dx = x + 0.5 - l.x, d = Math.sqrt(dx * dx + dy2) * k;
            if (d < 256) lightBuf[i] += amp * lightProf[d | 0] + 0.5;
          }
        }
      }
      if (nightLampBox) {
        const [lx, ly] = nightLampBox;
        for (let y = Math.max(0, -ly); y < 120 && ly + y < H; y++) {
          const u0 = Math.max(0, -lx), u1 = Math.min(234, W - lx);
          for (let u = u0, i = (ly + y) * W + lx + u0, q = y * 234 + u0; u < u1; u++, i++, q++) lightBuf[i] += lampLum[q];
        }
        // Hahmo ei ole oman lamppunsa valossa: vähennetään lampun osuus hahmon peittämiltä pikseleiltä
        const sp = shownPlayer, al = sp.img && spriteAlpha(sp.img);
        if (al) {
          const sw = sp.img.width, sh = sp.img.height;
          for (let y = 0; y < sh; y++) {
            const py = sp.y + y, qy = py - ly;
            if (py < 0 || py >= H || qy < 0 || qy >= 120) continue;
            for (let x = 0; x < sw; x++) {
              if (!al[y * sw + (sp.flip ? sw - 1 - x : x)]) continue;
              const px = sp.x + x, qx = px - lx;
              if (px < 0 || px >= W || qx < 0 || qx >= 234) continue;
              lightBuf[py * W + px] -= Math.min(lightBuf[py * W + px], lampLum[qy * 234 + qx]);
            }
          }
        }
      }
      for (const [x0, y0, x1, y1] of boxes) {
        for (let y = y0; y < y1; y++) {
          const row = (y & 3) * 4;
          for (let x = x0, i = y * W + x0; x < x1; x++, i++) dark32[i] = darkLut[(Math.min(255, lightBuf[i]) << 4) | (row + (x & 3))];
        }
        darkCtx.putImageData(darkImg, 0, 0, x0, y0, x1 - x0, y1 - y0);
      }
    }
  }
  const ox = nightCx - camXr, oy = nightCy - camYr;
  ctx.drawImage(darkCanvas, ox, oy, W, H);
  if (ox || oy) {
    // Siirretyn kerroksen paljastamat reunat täytetään tasaisella pimeydellä
    ctx.fillStyle = `rgba(4, 6, 22, ${((darkLut[0] >>> 24) / 255).toFixed(4)})`;
    if (oy > 0) ctx.fillRect(0, 0, W, oy); else if (oy < 0) ctx.fillRect(0, H + oy, W, -oy);
    if (ox > 0) ctx.fillRect(0, 0, ox, H); else if (ox < 0) ctx.fillRect(W + ox, 0, -ox, H);
  }

  // 3) Värillinen valo päälle: nuotio lämmin, otsalamppu kellertävän valkoinen
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (!l.col) continue;
    const rr = l.r * 0.85;
    ctx.globalAlpha = l.a * night;
    ctx.drawImage(colorBlob(l.col), l.x - rr, l.y - rr, rr * 2, rr * 2);
  }
  ctx.globalAlpha = 1;
  if (lamp && nightLampBox) {
    const [lx, ly] = nightLampBox, u0 = Math.max(0, -lx), v0 = Math.max(0, -ly), u1 = Math.min(234, W - lx), v1 = Math.min(120, H - ly);
    if (u1 > u0 && v1 > v0) ctx.drawImage(lampTint, (W >> 1) - 117 + u0, (H >> 1) - 60 + v0, u1 - u0, v1 - v0, lx + u0 + ox, ly + v0 + oy, u1 - u0, v1 - v0);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------
// Nuotio ja sen savu. Nuotioon lisätään klapeja yksi kerrallaan (E nuotion vieressä), enintään 5.
// Täysi nuotio (5 klapia) palaa loppuun tunnissa pelin aikaa, ja sen liekit ovat 20 % tavallista
// korkeammat; liekit pienenevät puiden kuluessa. Kun puut loppuvat, jää hehkuva hiillos, joka sammuu
// 30 minuutissa. Hiillokseen lisätty klapi syttyy itsestään, mutta sammunut nuotio sytytetään erikseen
// (Z). Pelaajalla on toistaiseksi loputtomasti klapeja.
// ---------------------------------------------------------------------------
const FIRE_MAX = 5, FIRE_BURN = 5 / (60 * GAME_MIN), EMBER_FADE = 1 / (30 * GAME_MIN);
// Liekkien koko (0 = ei liekkejä, 1,2 = täysi nuotio) ja valon voimakkuus (0–1)
const fireLevel = () => (fire.lit && fire.wood > 0 ? Math.max(0.35, 1.2 * Math.sqrt(fire.wood / FIRE_MAX)) : 0);
const fireGlow = () => (fire.lit && fire.wood > 0 ? 0.45 + 0.55 * Math.sqrt(fire.wood / FIRE_MAX) : fire.lit ? 0.42 * fire.emb : 0);
// Puiden palaminen ja hiilloksen hiipuminen; dt kellon yksikköinä (pelin aika)
function burnFire(dt) {
  if (!fire.lit) return;
  if (fire.wood > 0) {
    fire.wood -= dt * FIRE_BURN;
    if (fire.wood <= 0) { fire.wood = 0; fire.emb = 1; }
  } else {
    fire.emb -= dt * EMBER_FADE;
    if (fire.emb <= 0) { fire.emb = 0; fire.lit = false; }
  }
}
const FIRE_REACH = 1.6;
// Uuden klapin mahtuminen: nuotioon voi lisätä klapin vain, kun puuta on enintään 4,5 (ylimenevä osa
// menee hukkaan). Täyteen nuotioon lisääminen ei tee mitään.
const FIRE_FULL = 4.5;
const fireFull = () => fire.wood > FIRE_FULL;
const nearFire = () => state === 'play' && !player.boat && Math.hypot(player.x - CAMP.cx - 0.5, player.y - CAMP.cy - 0.5) < FIRE_REACH;
const canLightFire = () => nearFire() && !fire.lit && fire.wood > 0;
function fireSparks(n) {
  const a = { x: isoX(CAMP.cx + 0.5, CAMP.cy + 0.5), y: isoY(CAMP.cx + 0.5, CAMP.cy + 0.5) - 6 };
  for (let k = 0; k < n; k++) {
    const life = rand(60, 170);
    particles.push({ x: a.x + rand(-3, 3), y: a.y + rand(0, 4), vx: rand(-0.35, 0.35), vy: rand(-1.3, -0.5), g: 0, life, max: life, ember: true, ph: rand(0, 6.28) });
  }
}
function addFirewood() {
  if (fireFull()) { notify('The fire is full.', 90, 'hint'); return; }
  if (player.wood <= 0) { notify('No firewood. Take some from the rack or chop more.', 130, 'hint'); return; }
  player.wood--;
  const burning = fire.lit;
  fire.wood = Math.min(FIRE_MAX, fire.wood + 1);
  fire.barT = 150;
  SFX.thud();
  if (burning) {
    // Hehkuva hiillos sytyttää klapin; lisäys pöllähtää kipinöinä
    fire.emb = 1;
    fireSparks(14);
    SFX.crackle(1);
  } else notify('Z  light the fire', 120, 'hint');
}
function lightFire() {
  fire.lit = true; fire.emb = 1;
  fireSparks(6);
  noiseBurst(0.12, 3200, 'highpass', 0.08, 1);   // tulitikun raapaisu
  setTimeout(() => SFX.crackle(0.7), 250);
}

function updateCampfire() {
  const lvl = fireLevel();
  const a = { x: isoX(CAMP.cx + 0.5, CAMP.cy + 0.5), y: isoY(CAMP.cx + 0.5, CAMP.cy + 0.5) - 9 };
  // Nouseva savupatsas: ohut alhaalla, levenee ja haalistuu noustessaan, tuuli kuljettaa sitä.
  // Savua tulee sitä enemmän, mitä enemmän puuta palaa; hiillos savuaa vain vähän.
  const smokeP = lvl > 0 ? 0.12 + 0.18 * lvl : fire.lit ? 0.06 * fire.emb : 0;
  if (particles.length < 1500 && Math.random() < smokeP) {
    const life = rand(170, 250);
    particles.push({ x: a.x + rand(-1, 1), y: a.y, vx: rand(-0.03, 0.03), vy: rand(-0.4, -0.28), g: 0, life, max: life, color: pick(['#8a8f96', '#9aa0a8', '#6f747c']), smoke: true, big: Math.random() < 0.6 });
  }
  // Hehkuvat kipinät: yksittäisiä silloin tällöin ja välillä ritisevä ryöppy. Ne nousevat savun mukana.
  if (lvl <= 0) return;
  const burst = Math.random() < 0.008 * lvl;
  for (let n = burst ? Math.floor(rand(4, 11)) : Math.random() < 0.05 * lvl ? 1 : 0; n > 0; n--) {
    const life = rand(70, 190);
    particles.push({ x: a.x + rand(-2, 2), y: a.y + rand(2, 5), vx: rand(-0.25, 0.25), vy: rand(-0.9, -0.45), g: 0, life, max: life, ember: true, ph: rand(0, 6.28) });
  }
  if (burst) {
    const d = Math.hypot(player.x - CAMP.cx - 0.5, player.y - CAMP.cy - 0.5);
    if (d < 22) SFX.crackle(1 - d / 22);
  }
}

function updateParticles() {
  const wx = wind.sx * wind.gust, wy = wind.sy * wind.gust;
  for (const q of particles) {
    q.life--;
    if (q.smoke || q.ember) {
      // Savu kiihtyy tuulen suuntaan sitä enemmän, mitä korkeammalle se on noussut
      q.vx += wx * 0.006; q.vy += wy * 0.0025;
      q.vx *= 0.993;
    }
    if (q.ember) {
      // Kipinä leijailee savun mukana ja hidastuu noustessaan
      q.vx += rand(-0.03, 0.03); q.vy = q.vy * 0.99 - 0.002;
    }
    q.x += q.vx; q.y += q.vy;
    if (q.g) q.vy += q.g;
    if (q.floor !== undefined && q.y > q.floor) {
      q.y = q.floor;
      if (q.splash) { q.life = 0; continue; }
      q.vy = 0; q.vx = 0; q.g = 0;
    }
  }
  particles = particles.filter((q) => q.life > 0);
  for (const r of ripples) r.t++;
  ripples = ripples.filter((r) => r.t < r.life);
  for (const w of wakes) { w.t++; w.x += w.vx; w.y += w.vy; }
  wakes = wakes.filter((w) => w.t < w.life);
}

// ---------------------------------------------------------------------------
// Kalat. Lajien tiedot ovat SPECIES-taulussa (ensimmäisenä ahven). Kalat uivat veden alla ja
// vaihtavat välillä uintisyvyyttä. Syötin lähelle osuva kala voi kiinnostua siitä (melko harvoin)
// ja syö sen lajilleen tyypillisesti. Koukkuun tarttunut kala yrittää pakoon ja kuluttaa
// energiaansa; väsyttyään se ui hetken rauhassa ja jatkaa taistelua, kun voimat palaavat.
// ---------------------------------------------------------------------------
const SPECIES = {
  perch: {
    name: 'perch', count: 24,
    weight: { median: 80, sigma: 0.75, min: 12, max: 1600 },   // paino grammoina (lognormaalijakauma)
    lenK: 0.0089, lenE: 3.1,          // paino = lenK * pituus^lenE (pituus senttimetreinä)
    depth: [0.4, 3.5],                // mieluisin uintisyvyys metreinä
    speed: 0.013, fight: 0.034,       // uinti- ja pakonopeus (m / päivitys)
    bite: 'instant',                  // ahven nielaisee syötin heti
    interest: 1.1 / (60 * 22),          // todennäköisyys kiinnostua lähellä olevasta syötistä päivitystä kohden
    lures: { bobber: 1, wobbler: 0.3, spoon: 0.7, rigworm: 0.75, rigboilie: 0.12 },   // kiinnostus vieheittäin: ahven pitää madosta
    energy: 4, regen: 2,              // voimien ja niiden palautumisen kertoimet
    pull: 0.8,                        // lajin vetovoima siiman rasitukseen
    pal: { back: '#34421f', body: '#7c8a3c', belly: '#d4cca4', bar: '#202a14', fin: '#d4542a', eye: '#101010' },
  },
  // Hauki lymyilee paikallaan rantakaislikossa tai syvänteessä ja iskee syöttiin nopealla syöksyllä
  pike: {
    name: 'pike', count: 5, shape: 'pike',
    weight: { median: 1100, sigma: 0.7, min: 250, max: 12000 },
    lenK: 0.0045, lenE: 3.08,
    depth: [0.3, 1.2],                // kaislikossa; syvänteessä hauki ui syvemmällä (ks. pikeHome)
    speed: 0.005, fight: 0.05, strike: 0.075,
    bite: 'instant',
    interest: 1.1 / (60 * 30), sight: 4.5,
    lures: { bobber: 0.35, wobbler: 1.6, spoon: 1.3, rigworm: 0.2, rigboilie: 0.04 },   // hauki iskee mieluummin uistimiin
    energy: 3, regen: 4, pull: 1.1,
    pal: { back: '#2a3a1c', body: '#5c7434', belly: '#d8d4b0', bar: '#c8c878', fin: '#8a6a2a', eye: '#101010' },
  },
  // Lahna: litteä ja korkea, ui lähellä pohjaa (yleensä rantojen lähellä) ja syö syöttiä hetken ennen kuin tarttuu koukkuun:
  // koho painuu hetkeksi veden alle (enintään 20 cm) tai kellahtaa poikittain ja kulkee kalan mukana, pohjaongen kello kilahtaa.
  // Pitää eniten boiliesta, hieman vähemmän pohjaongen madosta ja koho-ongen madosta; uistimiin se ei yleensä tartu.
  // Nuori lahna on hopeinen, vanhempi kuparinvärinen ja tummanpuhuva; evät ovat tummanharmaat.
  bream: {
    name: 'bream', count: 10, shape: 'bream', bottom: true, shore: true,
    weight: { median: 420, sigma: 0.65, min: 120, max: 6000 },   // yleensä enintään kilon painoinen, suurimmat jopa kuusikiloisia
    lenK: 0.0094, lenE: 3.07,         // 30 cm ~ 320 g, 40 cm ~ 780 g, 50 cm ~ 1,5 kg, 70 cm ~ 4,3 kg
    depth: [0.6, 3], speed: 0.008, fight: 0.028,
    bite: 'nibble', interest: 1.2 / (60 * 20), sight: 3,
    lures: { bobber: 0.55, wobbler: 0.03, spoon: 0.04, rigworm: 0.65, rigboilie: 1.3 },
    energy: 3.5, regen: 2.5, pull: 0.9,
    pal: { back: '#5a6672', body: '#b4c0c8', belly: '#e6ebee', bar: '#b4c0c8', fin: '#4a525a', eye: '#101010' },
    palAges: [   // ikäkausi pituuden mukaan: < 30 cm hopeinen, 30-40 cm himmeämpi, yli 40 cm kuparinvärinen ja tumma
      { back: '#56626e', body: '#b4c0c8', belly: '#eef2f4', hi: '#d4dee4', bar: '#b4c0c8', fin: '#4a525a', pec: '#c8785a', ring: '#d8c070', eye: '#101010' },
      { back: '#454538', body: '#9a9078', belly: '#d2cbb2', hi: '#b8ae90', bar: '#9a9078', fin: '#46484e', pec: '#8a6a50', ring: '#c8b060', eye: '#101010' },
      { back: '#2a261e', body: '#7a6438', belly: '#b09c6a', hi: '#94784a', bar: '#7a6438', fin: '#3a3c42', pec: '#5a4a38', ring: '#c8a850', eye: '#101010' },
    ],
  },
};
// Lajin kuvasarjan avain: lahnalla ikäkausi (0 = hopeinen, 1, 2 = kuparinvärinen) valitsee paletin
const fishSprKey = (f) => (f.age ? f.kind + f.age : f.kind);

// Hauen kotipaikka: joko rantakaislikon reuna tai syvänne. Hauki pysyttelee sen lähellä.
function pikeHome() {
  const reeds = Math.random() < 0.65 ? decor.filter((o) => o.reed) : [];   // noin kaksi kolmesta kaislikkoon
  for (let k = 0; k < 40 && reeds.length; k++) {
    const o = pick(reeds), a = Math.atan2(o.y - C, o.x - C), r = Math.hypot(o.x - C, o.y - C) - rand(0.6, 1.6);
    const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    if (depthAt(x, y) > 0.6 && fishFree(x, y, 0.3)) return { x, y, r: 1.2, deep: false };
  }
  return { x: deepHole.x, y: deepHole.y, r: deepHole.r * 1.3, deep: true };
}

// Kala sivulta, pää oikealla. L = pituus pikseleinä, frame = pyrstön asento.
function makeFishSprite(pal, L, frame, shape) {
  if (shape === 'pike') return makePikeSprite(pal, L, frame);
  if (shape === 'bream') return makeBreamSprite(pal, L, frame);
  const h = Math.max(3, Math.round(L * 0.36)), cw = L + 2, ch = h + 4, mid = Math.floor(ch / 2);
  const c = makeCanvas(cw, ch), g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let x = 2; x < cw; x++) {
    const t = (x - 2) / Math.max(1, L - 1);
    const prof = Math.sin(Math.PI * clamp((t + 0.05) / 1.02, 0, 1)) ** 0.6;
    const top = mid - Math.max(1, Math.round((h / 2) * prof * 1.1)), bot = mid + Math.max(0, Math.round((h / 2) * prof * 0.85));
    for (let y = top; y <= bot; y++) {
      let col = y === top ? pal.back : y === bot ? pal.belly : y > mid ? pal.belly : pal.body;
      if ((x - 2) % 3 === 1 && t > 0.2 && t < 0.8 && y <= mid) col = pal.bar;   // ahvenen tummat poikkijuovat
      px(x, y, col);
    }
    if (t > 0.35 && t < 0.72 && (x % 2 === 0)) px(x, top - 1, pal.back);         // piikikäs selkäevä
    if (Math.abs(t - 0.5) < 0.06 || Math.abs(t - 0.72) < 0.06) px(x, bot + 1, pal.fin);
  }
  px(cw - 2, mid - 1, pal.eye);
  // Pyrstö: haarukka vasemmalla, asento vaihtuu uidessa
  const o = frame ? 1 : 0;
  px(1, mid - 1 + o, pal.fin); px(0, mid - 2 + o, pal.fin); px(1, mid + 1 + o, pal.fin); px(0, mid + 2 + o, pal.fin); px(1, mid + o, pal.fin);
  return c;
}
// Lahna: korkea ja litteä vartalo, jonka selkä on kyttyrä (korkeimmillaan selkäevän kohdalla) ja pää pieni ja suippo alasuuntaisella suulla.
// Kyljessä on suomutekstuuri ja vaaleampi sivujuova, silmässä kullanvärinen rengas, kidusluukulla tumma viiva; selkäevä on korkea kolmio,
// peräevä pitkä, rinta- ja vatsaevät pienet (nuorilla punertavat) ja pyrstö syvä haarukka, jonka alalohko on pidempi.
function makeBreamSprite(pal, L, frame) {
  const h = Math.max(4, Math.round(L * 0.52)), cw = L + 3, ch = h + 7, mid = Math.floor(ch / 2) + 1;
  const c = makeCanvas(cw, ch), g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const lighten = (col, k) => { const n = parseInt(col.slice(1), 16); return '#' + [16, 8, 0].map((sh) => Math.min(255, ((n >> sh) & 255) + k).toString(16).padStart(2, '0')).join(''); };
  const hi = pal.hi || lighten(pal.body, 22);
  let topAt = [], botAt = [];
  for (let x = 3; x < cw; x++) {
    const t = (x - 3) / Math.max(1, L - 1);
    // Epäsymmetrinen profiili: kyttyrä selkä (huippu t ≈ 0,4), pää (t > 0,8) kapenee nopeasti suippoon kuonoon
    const body = Math.sin(Math.PI * clamp((t + 0.03) / 1.03, 0, 1)) ** 0.8;
    const hump = 1 + 0.28 * Math.exp(-((t - 0.4) ** 2) / 0.035);
    const snout = t > 0.82 ? 1 - (t - 0.82) * 2.2 : 1;
    const top = mid - Math.max(1, Math.round(h * 0.52 * body * hump * snout)), bot = mid + Math.max(0, Math.round(h * 0.4 * body * (t > 0.88 ? 0.8 : 1)));
    topAt[x] = top; botAt[x] = bot;
    for (let y = top; y <= bot; y++) {
      const r = (y - top) / Math.max(1, bot - top);   // 0 = selkä, 1 = vatsa
      let col = r < 0.28 ? pal.back : r > 0.7 ? pal.belly : pal.body;
      if (Math.abs(r - 0.48) < 0.09 && t > 0.15 && t < 0.8) col = hi;                    // vaalea sivujuova
      else if (L >= 9 && col === pal.body && t > 0.12 && t < 0.8 && (x + y) % 2 === 0) col = lighten(pal.body, 10);   // suomut
      px(x, y, col);
    }
  }
  // Kidusluukku ja pää
  const gx = cw - 1 - Math.max(2, Math.round(L * 0.2));
  for (let y = topAt[gx] + 1; y < botAt[gx]; y++) px(gx, y, pal.back);
  // Silmä: kullanvärinen rengas ja tumma pupilli
  const ex = cw - 1 - Math.max(1, Math.round(L * 0.1)), ey = mid - Math.max(1, Math.round(h * 0.12));
  if (L >= 10) { px(ex - 1, ey, pal.ring || '#c8b060'); px(ex, ey - 1, pal.ring || '#c8b060'); }
  px(ex, ey, pal.eye);
  // Suu: pieni tumma piste kuonon alapuolella
  px(cw - 1, botAt[cw - 1] - 1 - (L >= 12 ? 1 : 0), pal.back);
  // Selkäevä (korkea kolmio hyppyrin kohdalla), peräevä (pitkä), rinta- ja vatsaevä
  const dorsalH = Math.max(2, Math.round(h * 0.27));
  for (let x = 3; x < cw; x++) {
    const t = (x - 3) / Math.max(1, L - 1);
    if (t > 0.32 && t < 0.56) { const k = 1 - Math.abs(t - 0.36) / 0.2, hh = Math.max(1, Math.round(dorsalH * clamp(k, 0.3, 1))); for (let q = 1; q <= hh; q++) px(x, topAt[x] - q, pal.fin); }
    if (t > 0.14 && t < 0.5) { const k = 1 - (t - 0.14) / 0.36 * 0.5, hh = Math.max(1, Math.round(h * 0.2 * k)); for (let q = 1; q <= hh; q++) px(x, botAt[x] + q, pal.fin); }
  }
  const pec = pal.pec || pal.fin;
  px(gx - 1, mid + 1, pec); px(gx - 2, mid + 2, pec);                       // rintaevä
  px(3 + Math.round(L * 0.5), botAt[3 + Math.round(L * 0.5)] + 1, pec);   // vatsaevä
  // Pyrstö: syvä haarukka, alalohko pidempi
  const o = frame ? 1 : 0, up = Math.max(2, Math.round(h * 0.42)), dn = up + 1;
  px(2, mid + o, pal.fin);
  for (let k = 1; k <= dn; k++) {
    const xd = Math.max(0, 2 - Math.floor(k * 0.7));
    if (k <= up) { px(xd, mid - k + o, pal.fin); if (xd < 2) px(xd + 1, mid - k + o, pal.fin); }
    px(xd, mid + k + o, pal.fin); if (xd < 2) px(xd + 1, mid + k + o, pal.fin);
  }
  return c;
}
// Hauki: pitkä ja kapea, litteä nokka, vaaleita täpliä kyljessä, selkä- ja peräevä pyrstön lähellä
function makePikeSprite(pal, L, frame) {
  const h = Math.max(2, Math.round(L * 0.2)), cw = L + 2, ch = h + 4, mid = Math.floor(ch / 2);
  const c = makeCanvas(cw, ch), g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let x = 2; x < cw; x++) {
    const t = (x - 2) / Math.max(1, L - 1);
    const prof = t > 0.85 ? (1 - t) / 0.15 * 0.8 + 0.2 : t < 0.12 ? 0.55 + t * 3.5 : 1;
    const top = mid - Math.max(1, Math.round((h / 2) * prof)), bot = mid + Math.max(0, Math.round((h / 2) * prof * 0.8));
    for (let y = top; y <= bot; y++) {
      let col = y === top ? pal.back : y === bot || y > mid ? pal.belly : pal.body;
      if (y === mid && t > 0.15 && t < 0.8 && (x * 7 + y * 3) % 5 === 0) col = pal.bar;   // vaaleat täplät
      px(x, y, col);
    }
    if (t > 0.12 && t < 0.24) px(x, top - 1, pal.fin);   // selkäevä aivan pyrstön edessä
    if (t > 0.14 && t < 0.22) px(x, bot + 1, pal.fin);   // peräevä
  }
  px(cw - 3, mid - 1, pal.eye);
  const o = frame ? 1 : 0;
  px(1, mid - 1 + o, pal.fin); px(0, mid - 2 + o, pal.fin); px(1, mid + 1 + o, pal.fin); px(0, mid + 2 + o, pal.fin); px(1, mid + o, pal.fin);
  return c;
}
const FISH_PX_MAX = 22;
// Kala muissa ruudun suunnissa: viistosti (kaakko/koillinen, 3/4-kuva, jossa näkyy selkä ja kylki) ja
// pystysuunnassa (etelä/pohjoinen, kala näkyy lyhentyneenä ylhäältä). Länsipuoliset suunnat peilataan.
// Kuva lasketaan pikseli kerrallaan: t = paikka pyrstöstä päähän, rel = etäisyys keskilinjasta.
const FISH_DIRS = { se: [2, 1], ne: [2, -1], s: [0, 1], n: [0, -1] };
function makeFishDirSprite(pal, L, frame, shape, key) {
  const pike = shape === 'pike', bream = shape === 'bream', vert = key === 's' || key === 'n';
  const [vx, vy] = FISH_DIRS[key], vl = Math.hypot(vx, vy), ux = vx / vl, uy = vy / vl, nx = -uy, ny = ux;
  const Lp = Math.max(3, Math.round(L * (vert ? 0.7 : 0.9)));
  const hh = Math.max(2, L * (pike ? 0.2 : bream ? 0.5 : 0.36)) / 2, hw = Math.max(1, hh * (vert ? 0.6 : 0.85));
  const size = Math.ceil(Lp + hw * 2 + 6), c = makeCanvas(size, size), g = c.getContext('2d');
  const cx = size / 2, cy = size / 2, tx0 = cx - ux * Lp / 2, ty0 = cy - uy * Lp / 2;
  // Lahnan profiili: kyttyrä selkä (huippu t ≈ 0,4) ja suippo kuono (sama muoto kuin sivukuvassa)
  const hump = (t) => 1 + 0.28 * Math.exp(-((t - 0.4) ** 2) / 0.035), snout = (t) => (t > 0.82 ? 1 - (t - 0.82) * 2.2 : 1);
  const prof = (t) => pike ? (t > 0.85 ? (1 - t) / 0.15 * 0.8 + 0.2 : t < 0.12 ? 0.55 + t * 3.5 : 1)
    : bream ? Math.sin(Math.PI * clamp((t + 0.03) / 1.03, 0, 1)) ** 0.8 * snout(t)
    : Math.sin(Math.PI * clamp((t + 0.05) / 1.02, 0, 1)) ** 0.6;
  const lighten = (col, k) => { const n = parseInt(col.slice(1), 16); return '#' + [16, 8, 0].map((sh) => Math.min(255, ((n >> sh) & 255) + k).toString(16).padStart(2, '0')).join(''); };
  const hiCol = pal.hi || lighten(pal.body, 22), scaleCol = lighten(pal.body, 10);
  const wig = frame ? 0.8 : -0.8;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x + 0.5 - tx0, py = y + 0.5 - ty0, t = (px * ux + py * uy) / Lp, d = px * nx + py * ny;
    let col = null;
    if (t >= 0 && t <= 1) {
      // Lahnalla selän puoli (d < 0) on korkeampi kuin vatsan puoli
      const wd = hw * prof(t) * (vert && t > 0.75 ? 1 - (t - 0.75) * 2 : 1) * (bream && !vert ? (d < 0 ? hump(t) : 0.78) : 1) + 0.45, rel = d / wd;
      if (Math.abs(rel) <= 1) {
        if (vert) col = Math.abs(rel) < 0.45 ? pal.back : pal.body;
        else if (bream) {
          const r = (rel + 1) / 2;   // 0 = selkä, 1 = vatsa
          col = r < 0.28 ? pal.back : r > 0.7 ? pal.belly : pal.body;
          if (Math.abs(r - 0.48) < 0.09 && t > 0.15 && t < 0.8) col = hiCol;                                  // vaalea sivujuova
          else if (L >= 9 && col === pal.body && t > 0.12 && t < 0.8 && (x + y) % 2 === 0) col = scaleCol;   // suomut
          if (t > 0.78 && t < 0.82) col = pal.back;                                                           // kidusluukku
        }
        else col = rel < -0.3 ? pal.back : rel < 0.4 ? pal.body : pal.belly;
        // Ahvenen poikkijuovat ja hauen vaaleat täplät
        if (!pike && !bream && t > 0.2 && t < 0.8 && Math.floor(t * L) % 3 === 1 && rel < 0.4) col = pal.bar;
        if (pike && t > 0.15 && t < 0.8 && rel > -0.6 && rel < 0.6 && (Math.floor(t * L * 1.3) * 7 + Math.floor(rel * 3 + 3) * 3) % 5 === 0) col = pal.bar;
        // Silmät pään lähellä
        if (bream && L >= 10 && t > 0.84 && t < 0.99 && (vert ? Math.abs(Math.abs(rel) - 0.75) < 0.5 : Math.abs(rel + 0.35) < 0.55)) col = pal.ring || '#c8b060';   // silmän kultainen rengas
        if (t > 0.86 && t < 0.97 && (vert ? Math.abs(Math.abs(rel) - 0.75) < 0.3 : Math.abs(rel + 0.35) < 0.3)) col = pal.eye;
      } else if (bream && !vert && rel < -1 && t > 0.32 && t < 0.56 && rel > -1 - 1.0 * Math.max(0.25, 1 - Math.abs(t - 0.36) / 0.2)) col = pal.fin;   // korkea kolmiomainen selkäevä
      else if (bream && !vert && rel > 1 && t > 0.14 && t < 0.5 && rel < 1 + 0.9 * (1 - (t - 0.14) / 0.36 * 0.5)) col = pal.fin;   // pitkä peräevä
      else if (bream && vert && Math.abs(rel) > 1 && Math.abs(rel) < 2.2 && Math.abs(t - 0.7) < 0.07) col = pal.pec || pal.fin;   // rintaevät
      else if (!vert && !pike && !bream && rel < -1 && rel > -1.9 && t > 0.35 && t < 0.7 && Math.floor(t * L) % 2 === 0) col = pal.back;   // selkäevä
      else if (!vert && pike && rel < -1 && rel > -1.9 && t > 0.12 && t < 0.24) col = pal.fin;
      else if (!vert && !bream && rel > 1 && rel < 1.9 && Math.abs(t - (pike ? 0.18 : 0.55)) < 0.06) col = pal.fin;   // vatsaevä
      else if (vert && !bream && Math.abs(rel) > 1 && Math.abs(rel) < 2.2 && Math.abs(t - 0.7) < 0.07) col = pal.fin;   // rintaevät
    } else if (t < 0 && t > -0.16) {
      // Pyrstö: haarukka, joka heilahtaa sivulle uidessa
      const dd = d - wig * (-t) * 6, spread = (0.7 + (-t) * L * 0.45) * (bream ? 1.35 : 1);
      if (Math.abs(dd) <= spread && !(t < -0.08 && Math.abs(dd) < spread * 0.35)) col = pal.fin;
    }
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
const fishSet = (sp, L) => {
  const o = { side: [makeFishSprite(sp.pal, L, 0, sp.shape), makeFishSprite(sp.pal, L, 1, sp.shape)] };
  for (const k in FISH_DIRS) o[k] = [makeFishDirSprite(sp.pal, L, 0, sp.shape, k), makeFishDirSprite(sp.pal, L, 1, sp.shape, k)];
  return o;
};
const FISH_SPR = {};
for (const [k, sp] of Object.entries(SPECIES)) {
  const pals = sp.palAges || [sp.pal];
  pals.forEach((pal, age) => { FISH_SPR[age ? k + age : k] = Array.from({ length: FISH_PX_MAX + 1 }, (_, L) => (L < 4 ? null : fishSet({ ...sp, pal }, L))); });
}
// Kalan suunta ruudulla kahdeksaan suuntaan: 0 = itä, 1 = kaakko, 2 = etelä, … 7 = koillinen
function fishDir(f) {
  const [sx, sy] = screenDir(Math.cos(f.a), Math.sin(f.a));
  return ((Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) % 8) + 8) % 8;
}
// Suunnan kuva, peilaus ja pään suunta ruudulla
const DIR_VIEW = [['side', false, 1, 0], ['se', false, 2, 1], ['s', false, 0, 1], ['se', true, -2, 1], ['side', true, -1, 0], ['ne', true, -2, -1], ['n', false, 0, -1], ['ne', false, 2, -1]];
// Suun paikka ruudulla kalan keskipisteestä (pikseleinä)
function fishMouthScreen(f) {
  const [, , vx, vy] = DIR_VIEW[fishDir(f)];
  if (!vy) return [vx * ((f.px >> 1) + 1), 0];
  const vl = Math.hypot(vx, vy), Lp = Math.max(3, Math.round(f.px * (vx ? 0.9 : 0.7)));
  return [Math.round((vx / vl) * (Lp / 2 + 0.5)), Math.round((vy / vl) * (Lp / 2 + 0.5))];
}

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
// Missä kala voi uida: vedessä, pohjan yläpuolella eikä kivien kohdalla
const fishFree = (x, y, z) => shoreDist(x, y) < -0.3 && depthAt(x, y) > z + 0.1 && !waterRocks.some((r) => Math.hypot(r.x - x, r.y - y) < 0.6);

function makeFish(kind) {
  const sp = SPECIES[kind];
  const w = clamp(Math.exp(Math.log(sp.weight.median) + gauss() * sp.weight.sigma), sp.weight.min, sp.weight.max);
  const len = Math.pow(w / sp.lenK, 1 / sp.lenE);
  // Yli 1,5 kilon lahna ui aina lammen syvimmässä kohdassa (syvänne), muut lahnat rantojen lähellä
  const home = kind === 'pike' ? pikeHome() : kind === 'bream' && w > 1500 ? { x: deepHole.x, y: deepHole.y, r: deepHole.r, deep: true } : null;
  let x = C, y = C, z = 1;
  for (let k = 0; k < 200; k++) {
    const a = rand(0, Math.PI * 2), r = home ? rand(0, home.r) : rand(2, POND_R - 2);
    x = (home ? home.x : C) + Math.cos(a) * r; y = (home ? home.y : C) + Math.sin(a) * r;
    if (sp.shore && !home) { const rr = pondR(a) - rand(1.5, 7); x = C + Math.cos(a) * rr; y = C + Math.sin(a) * rr; }   // lahna rantojen lähellä
    const bd = depthAt(x, y);
    z = sp.bottom ? bd - 0.25 : Math.min(fishDepth(sp, home), bd - 0.2);
    if (z > 0.25 && fishFree(x, y, z)) break;
  }
  return {
    kind, w, len, age: kind === 'bream' ? (len < 30 ? 0 : len < 40 ? 1 : 2) : 0, px: clamp(Math.round(len * 0.3), 4, FISH_PX_MAX), x, y, z, tz: z, a: rand(0, Math.PI * 2), sp: 0, tx: x, ty: y, home,
    t: rand(60, 400), mode: 'roam', energy: 0, maxE: (120 + Math.min(w * 0.5, 900)) * sp.energy, anim: Math.floor(rand(0, 100)),
    dirT: 0, hop: 0, hopT: 0, hvx: 0, hvy: 0, flopT: 0, caughtT: 0,
  };
}

// Uintisyvyys: syvänteen hauki ui syvällä, muut lajinsa mieluisimmalla syvyydellä
const fishDepth = (sp, home) => (home && home.deep ? rand(1.5, 4) : rand(sp.depth[0], sp.depth[1]));

function spawnFish() {
  fishes = [];
  for (const k in SPECIES) for (let n = 0; n < SPECIES[k].count; n++) fishes.push(makeFish(k));
}

// Pohjaongen tila vedessä. Siima kulkee ongen kärjestä vedenpinnan läpäisykohdan (E0) kautta puntille (L).
// Kun siima on kireä (löysää alle 0,5 m), se on suora ja nousee puntilta ylöspäin kulmassa; löysä siima
// vajoaa pohjalle ja makaa sitä pitkin. Sivuhaara on kiinni siimassa L.dist puntin yläpuolella (siiman
// pituutta pitkin) ja haaran päässä oleva syötti roikkuu RIG_ARM (10 cm) haaran kiinnityskohdan alapuolella,
// mutta ei pohjan läpi. Syötti makaa pohjassa (lying), jos se ylettyy pohjaan asti.
//   tf = siiman kireys 0–1, df(t) = siiman syvyys pinnan (t = 0) ja puntin (t = 1) välillä osuutena puntin syvyydestä
function rigState(L) {
  const p = rigOrigin(), d = Math.hypot(L.x - p.x, L.y - p.y) || 0.001, zS = L.z, tipH = RIG_TIP + playerLift() / Z_PX;
  const slack = Math.max(0, L.out - Math.hypot(d, zS + tipH));   // siimaa ongen kärjestä puntille ylimääräisenä
  const tf = clamp(1 - slack / 0.5, 0, 1), zW = Math.max(0, zS), fe = zS < 0 ? 1 : tipH / (tipH + zW);
  const ex = p.x + (L.x - p.x) * fe, ey = p.y + (L.y - p.y) * fe;
  const dh = d * (1 - fe), Lw = Math.hypot(dh, zW);
  const df = (t) => tf * t + (1 - tf) * Math.min(1, t / 0.15);
  const tj = Lw > 0.01 ? clamp(1 - L.dist / Lw, 0, 1) : 0;
  // Jos haara on kauempana puntista kuin veden alla kulkevan siiman pituus, se on jo veden yläpuolella ilmassa kulkevalla osalla
  // (ua = osuus pinnan läpäisykohdasta ongen kärkeen); nostettu puntti (z < 0) on itse ilmassa, ja haara on sen yläpuolella
  const hE = Math.max(0, -zS), La = Math.hypot(d * fe, tipH - hE), over = L.dist - Lw;
  const ua = over > 0 && La > 0.01 ? clamp(over / La, 0, 1) * (zS < 0 ? 1 : tf) : 0;
  const jx = lerp(ex, ua > 0 ? p.x : L.x, ua > 0 ? ua : tj), jy = lerp(ey, ua > 0 ? p.y : L.y, ua > 0 ? ua : tj), floor = depthAt(jx, jy);
  const zJ = ua > 0 ? -(hE + ua * (tipH - hE)) : Math.min(zS * df(tj), Math.max(0, floor - 0.01));
  return { d, slack, tf, ex, ey, tj, ua, df, jx, jy, zJ, zB: Math.min(zJ + RIG_ARM, floor - 0.02), lying: zJ + RIG_ARM >= floor - 0.04 };
}

// Siiman löysä (m): pohjaongella ongen kärjestä puntille kulkevan siiman pituus (3D), muilla vaakaetäisyys
const lineSlack = (L) => {
  const O = rigOrigin(), d = Math.hypot(L.x - O.x, L.y - O.y);
  return Math.max(0, L.out - Math.hypot(d, (L.onWater && isDirect(L.kind) ? L.z || 0 : isRig(L.kind) ? L.z : 0) + tipHeight()));
};

// Syötin paikka (x, y ja syvyys z), kun koho kelluu vedessä ilman kalaa
function baitPoint() {
  const L = cast.lure;
  if (!L || L.st !== 'float' || !L.onWater || L.fish) return null;
  if (isArt(L.kind)) return { x: L.x, y: L.y, z: L.z, lure: L.kind, moving: L.moving };
  if (isRig(L.kind)) {
    const r = rigState(L);
    if (r.zB < 0.02) return null;   // syötti ei ole vedessä (noussut ilmaan kelattaessa): kalat eivät huomaa eivätkä syö sitä
    return { x: r.jx, y: r.jy, z: r.zB, lure: L.kind, moving: false, lying: r.lying };
  }
  return { x: L.x, y: L.y, z: Math.min(cast.hookDepth, depthAt(L.x, L.y) - 0.05), lure: 'bobber', moving: false };
}

// Uinti suuntaan f.a nopeudella v; este käännyttää kalan
function moveFish(f, v, z) {
  f.sp += (v - f.sp) * 0.05;
  const nx = f.x + Math.cos(f.a) * f.sp, ny = f.y + Math.sin(f.a) * f.sp;
  if (fishFree(nx, ny, z === undefined ? f.z : z)) { f.x = nx; f.y = ny; }
  else { f.a += (Math.random() < 0.5 ? -1 : 1) * rand(1, 2.4); f.t = 0; }
}

function updateFishes() {
  const bait = baitPoint();
  for (const f of fishes) {
    if ((cast.lure && cast.lure.fish === f) || f.loose) continue;   // koukussa olevaa kalaa ohjaa updateFight
    const sp = SPECIES[f.kind];
    f.anim++;
    if (f.shy > 0) f.shy--;
    if (f.mode === 'roam') {
      // Uusi kohde muutaman metrin päästä ja välillä uusi uintisyvyys
      if (--f.t <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 0.5) {
        // Kaislikon hauki vaanii pienellä alueella ja palaa aina kaislikon suojaan; syvänteen hauki
        // partioi syvännettä koko ajan uiden. Ahvenet uivat vilkkaasti paikasta toiseen.
        const H = f.home;
        for (let k = 0; k < 20; k++) {
          const a = rand(0, Math.PI * 2), r = H ? rand(H.deep ? H.r * 0.4 : 0, H.r) : rand(3, 10);
          let tx = (H ? H.x : f.x) + Math.cos(a) * r, ty = (H ? H.y : f.y) + Math.sin(a) * r;
          if (sp.shore && !H) { const aa = Math.atan2(f.y - C, f.x - C) + rand(-0.9, 0.9), rr = pondR(aa) - rand(1.5, 7); tx = C + Math.cos(aa) * rr; ty = C + Math.sin(aa) * rr; }
          if (fishFree(tx, ty, 0.3)) { f.tx = tx; f.ty = ty; break; }
        }
        f.tz = sp.bottom ? Math.max(0.3, depthAt(f.tx, f.ty) - 0.25) : Math.min(fishDepth(sp, H), depthAt(f.tx, f.ty) - 0.2);
        f.t = H && !H.deep ? rand(300, 900) : rand(200, 500);
        f.lurk = H && !H.deep ? rand(400, 1400) : 0;
      }
      if (f.lurk > 0) { f.lurk--; f.sp *= 0.95; if (Math.random() < 0.01) f.a += rand(-0.3, 0.3); }
      else {
        f.a += angDiff(f.a, Math.atan2(f.ty - f.y, f.tx - f.x)) * 0.04 + rand(-0.02, 0.02);
        const patrol = f.home && f.home.deep ? 2.2 : 1;
        moveFish(f, sp.speed * patrol * (0.7 + 0.3 * Math.sin(f.anim * 0.01)));
      }
      // Kala voi kiinnostua lähellä olevasta syötistä, jos se ui suunnilleen samalla syvyydellä
      if (bait && Math.hypot(f.x - bait.x, f.y - bait.y) < (sp.sight || 3) && Math.abs(f.z - bait.z) < 1.2
        && !(f.shy > 0) && (!isArt(bait.lure) || bait.moving) && Math.random() < sp.interest * sp.lures[bait.lure] * (bait.lying ? 0.2 : 1)) {
        f.mode = 'interest'; f.t = rand(240, 720);
      }
    } else if (f.mode === 'interest') {
      // Kala ui syötin luo niin, että sen suu osuu syöttiin; ahven nielaisee sen heti perille päästyään
      if (!bait || --f.t <= 0) { f.mode = 'roam'; f.t = 0; continue; }
      const [mx, my] = fishMouth(f), ax = bait.x - (mx - f.x), ay = bait.y - (my - f.y);
      f.tx = ax; f.ty = ay; f.tz = bait.z;
      f.a += angDiff(f.a, Math.atan2(ay - f.y, ax - f.x)) * 0.08;
      // Hauki hiipii lähemmäs ja iskee viimeiset puolitoista metriä nopealla syöksyllä
      const bd = Math.hypot(mx - bait.x, my - bait.y);
      // Liikkuvaa vaappua kala jahtaa uintinopeuttaan nopeammin
      moveFish(f, sp.strike && bd < 1.5 ? sp.strike : bait.moving ? sp.fight * 1.1 : sp.speed * 0.8);
      const [nx, ny] = fishMouth(f);
      if (Math.hypot(nx - bait.x, ny - bait.y, (f.z - bait.z) * 0.5) < (isArt(bait.lure) ? 0.3 : 0.22)) {
        if (sp.bite === 'instant') hookFish(f);
        else { f.mode = 'nibble'; f.t = rand(240, 540); f.tugT = rand(20, 60); f.tug = null; }   // lahna maistelee syöttiä ennen koukkuun jäämistä
      }
    } else if (f.mode === 'nibble') {
      nibbleBait(f, bait, sp);
      if (f.mode !== 'nibble') continue;
    }
    // Pohjakala (lahna) seuraa pohjan muotoa: uintisyvyys on aina noin 25 cm pohjan yläpuolella, myös jyrkissä rinteissä
    if (sp.bottom && f.mode === 'roam') f.tz = Math.max(0.3, depthAt(f.x, f.y) - 0.25);
    const vz = sp.bottom ? 0.012 : 0.004;
    f.z += clamp(f.tz - f.z, -vz, vz);
    f.z = clamp(f.z, 0.15, Math.max(0.15, depthAt(f.x, f.y) - 0.1));
  }
}

// Lahnan maistelu: kala pysyttelee syötin luona ja nykii sitä. Koholla koho painuu hetkeksi veden alle (enintään 20 cm) tai kellahtaa
// poikittain ja kulkee kalan mukana; pohjaongen kello kilahtaa, vaikka kala ei ole vielä koukussa. Lopuksi kala jää koukkuun
// (80 %) tai jättää syötin (20 %).
function nibbleBait(f, bait, sp) {
  const L = cast.lure;
  const stop = () => { if (L && !L.fish) { L.sub = 0; L.flat = false; } f.mode = 'roam'; f.t = 0; };
  if (!bait || !L || L.fish) { stop(); return; }
  const [mx, my] = fishMouth(f), ax = bait.x - (mx - f.x), ay = bait.y - (my - f.y);
  f.tz = bait.z;
  f.a += angDiff(f.a, Math.atan2(ay - f.y, ax - f.x)) * 0.06 + rand(-0.03, 0.03);
  const far = Math.hypot(ax - f.x, ay - f.y);
  moveFish(f, far > 0.12 ? 0.007 : 0.001);
  // Nykäykset: koho painuu (dip), kellahtaa ja kulkee kalan mukana (drag) tai pohjaongen kello kilahtaa (bell)
  if (!f.tug && --f.tugT <= 0) {
    f.tug = { t: 0, len: Math.round(rand(24, 70)), kind: bait.lure === 'bobber' ? (Math.random() < 0.35 ? 'drag' : 'dip') : 'bell', dip: rand(0.05, 0.2) };
    if (f.tug.kind === 'bell') { SFX.bell(); bellT = 70; }
  }
  const tg = f.tug;
  if (tg) {
    tg.t++;
    if (L.kind === 'bobber') {
      const u = Math.sin(Math.PI * clamp(tg.t / tg.len, 0, 1));
      if (tg.kind === 'dip') L.sub = tg.dip * u;
      else { L.flat = true; L.x = lerp(L.x, mx, 0.1); L.y = lerp(L.y, my, 0.1); }
    }
    if (tg.t >= tg.len) { f.tug = null; f.tugT = rand(25, 100); L.flat = false; if (L.kind === 'bobber') L.sub = 0; }
  }
  if (--f.t <= 0) {
    if (L.kind === 'bobber') { L.sub = 0; L.flat = false; }
    if (Math.random() < 0.8) hookFish(f);
    else { stop(); f.shy = 900; }
  }
}

// Kalan suun paikka maailmassa. Kala piirretään sivulta, pää ruudulla menosuunnan puolella, joten suu
// on puolen kuvan leveyden päässä keskipisteestä ruudun vaakasuunnassa (1 px vaakaan = 1/16 m x:ssä ja -y:ssä).
function fishMouth(f) {
  const [dx, dy] = fishMouthScreen(f);
  return [f.x + dx / 16 + dy / 8, f.y + dy / 8 - dx / 16];
}

function hookFish(f) {
  const L = cast.lure;
  L.fish = f;
  if (isRig(L.kind)) { SFX.bell(); bellT = 150; }   // pohjaongen kello ilmoittaa syönnistä
  f.mode = 'fight'; f.energy = f.maxE * rand(0.85, 1); f.dirT = 0;
  L.tension = 0;
  ripples.push({ x: L.x, y: L.y, t: 0, life: 45, max: 5, a: 0.75 });
  banners.unshift({ text: 'Fish on!', t: 90 });
  SFX.bite();
}

// Koukkuun tarttunut kala. Se voi vetää siimaa vain ulkona olevan määrän verran ja vetää kohon
// veden alle, mikä kuluttaa sen voimia (koho kelluu). Pelaajan lähelle kelattu kala nousee
// roikkumaan ilmaan ja kerätään talteen. Kuivalle maalle vedetty kala sätkii satunnaisiin suuntiin.
function updateFight(L, held) {
  const p = player, f = L.fish, sp = SPECIES[f.kind];
  if (!f.dead) f.anim++;
  if (f.mode === 'caught') { if (--f.caughtT <= 0) collectFish(f); return; }
  if (mouseHeld2 && !held) releaseLine(L);
  if (held) { L.out = Math.max(0, L.out - reelStep(L) * (f.mode === 'fight' ? 0.55 : 1)); if (++cast.reelT % 6 === 0) SFX.reel(); }
  if (f.mode === 'fight') {
    if (--f.dirT <= 0) {
      f.dirT = rand(40, 110);
      f.a = Math.atan2(f.y - p.y, f.x - p.x) + rand(-1.3, 1.3);
      f.tz = clamp(rand(0.4, 2.6), 0.3, Math.max(0.3, depthAt(f.x, f.y) - 0.15));
    }
    moveFish(f, sp.fight * (0.45 + 0.55 * f.energy / f.maxE), 0.1);
    f.z += clamp(f.tz - f.z, -0.012, 0.012);
    f.energy -= 0.6 + (isDirect(L.kind) ? 0 : Math.max(0, f.z - cast.hookDepth) * 1.6);
    // Kala taistelee ainakin, kunnes alle puolet voimista on jäljellä; sen jälkeen se voi lopettaa
    // satunnaisella hetkellä, viimeistään kun voimat loppuvat
    if (f.energy <= 0 || (f.energy < f.maxE * 0.5 && Math.random() < 1 / 240)) {
      f.energy = Math.max(0, f.energy); f.mode = 'tired';
      f.tz = Math.max(0.3, f.z * 0.6);
    }
  } else if (f.mode === 'tired') {
    // Väsynyt kala ui hetken rauhassa koukku suussa, kunnes voimat palaavat
    if (Math.random() < 0.02) f.a += rand(-0.8, 0.8);
    moveFish(f, 0.004, 0.1);
    f.z += clamp(f.tz - f.z, -0.004, 0.004);
    // Taistelu alkaa uudelleen satunnaisesti, kun voimista on palautunut vähintään puolet; joskus kala
    // odottaa, kunnes voimat ovat täysin palautuneet
    f.energy = Math.min(f.maxE, f.energy + rand(0.15, 0.45) * sp.regen);
    if (f.energy >= f.maxE || (f.energy >= f.maxE * 0.5 && Math.random() < 1 / 300)) { f.mode = 'fight'; f.dirT = 0; SFX.splash(0.3); ripples.push({ x: f.x, y: f.y, t: 0, life: 40, max: 5, a: 0.6 }); }
  } else if (f.mode === 'land') {
    flopFish(f);
    // Kuivalla maalla olevan kalan voi kerätä talteen kävelemällä sen päälle
    if (Math.hypot(p.x - f.x, p.y - f.y) < 0.5) { collectFish(f); return; }
  }
  // Kala ei pääse kauemmas kuin ulkona olevan siiman verran; kelattaessa se vedetään lähemmäs
  const O = rigOrigin(), zl = isDirect(L.kind) ? f.z : 0, th = tipHeight();
  const limF = Math.sqrt(Math.max(0, L.out * L.out - (zl + th) * (zl + th)));   // siiman 3D-pituus rajaa vaakaetäisyyden ongen kärjestä
  const dx = O.x - f.x, dy = O.y - f.y, d = Math.hypot(dx, dy) || 0.001;
  let taut = false;
  if (d > limF) {
    const m = d - limF;
    f.x += (dx / d) * m; f.y += (dy / d) * m;
    taut = m > 0.002;
    if (f.mode === 'fight') {
      f.energy -= 0.4;
      // Kala vetää kireää siimaa: kela ritisee (kelan lukko ei vielä luista)
      if (++L.clickT % 4 === 0) SFX.ratchet();
    }
  }
  // Siiman kesto: jos kalaa kelataan tai vedetään (kävellen tai veneellä) samaan aikaan kun se
  // taistelee vastaan, siiman rasitus kasvaa kalan painon, lajin ja voimien mukaan. Täynnä siima
  // katkeaa. Kun kala ei taistele tai vetoa ei ole, rasitus laskee: väsynyttä kalaa voi kelata turvallisesti.
  // Voimakas kala (painava, vetävä laji, paljon voimia) rasittaa kireää siimaa myös ilman kelausta.
  // Siimaa pitää silloin päästää kelalta (hiiren oikea nappi), mikä keventää kuormaa; kun kaikki siima
  // on ulkona, siimaa ei voi enää päästää ja lopulta se katkeaa.
  const pulling = held || (d >= limF - 0.01 && (p.moving || (p.boat && Math.abs(boat.v) > 0.004)));
  const e = f.energy / f.maxE, strength = Math.pow(f.w / 1000, 0.7) * sp.pull * e;
  const paying = mouseHeld2 && !held && L.out < LINE_MAX;
  if (f.mode === 'fight' && pulling) L.tension = (L.tension || 0) + 0.004 * Math.pow(f.w / 1000, 0.7) * sp.pull * (0.3 + 0.7 * e);
  else if (f.mode === 'fight' && taut && !paying && strength > 0.35) L.tension = (L.tension || 0) + 0.0036 * (strength - 0.35);
  else L.tension = Math.max(0, (L.tension || 0) - (paying ? 0.012 : f.mode === 'fight' ? 0.003 : 0.006));
  if (L.tension >= 1) { cutLine(true); return; }
  if (f.mode !== 'land' && shoreDist(f.x, f.y) > -0.1) { f.mode = 'land'; f.z = 0; f.flopT = 8; f.hopT = 0; }
  if (f.mode !== 'land') f.z = clamp(f.z, 0.1, Math.max(0.1, depthAt(f.x, f.y) - 0.08));
  // Koho seuraa kalaa; jos kala ui koukun syvyyttä syvemmälle, se vetää kohon pinnan alle
  L.x = f.x; L.y = f.y;
  L.onWater = f.mode !== 'land';
  L.sub = f.mode === 'land' || isDirect(L.kind) ? 0 : Math.max(0, f.z - cast.hookDepth);
  if (L.onWater && f.mode === 'fight' && ++L.wakeT % 10 === 0) ripples.push({ x: L.x, y: L.y, t: 0, life: 35, max: L.sub > 0 ? 5 : 3, a: 0.55 });
  // Lähelle kelattu kala nostetaan ilmaan
  if (limF <= 1.2 && d < 1.9) { f.mode = 'caught'; f.caughtT = 75; SFX.splash(0.4); }
}

// Siiman katkaisu. Koukussa ollut kala ui lopun siiman ja kohon kanssa hetken ja katoaa sitten
// (tilalle syntyy uusi kala); ilman kalaa koho ajelehtii hetken. Ongen kärkeen solmitaan uusi koho ja koukku.
let loose = [];
let bellT = 0;   // pohjaongen kellon heilumisen kesto syönnin jälkeen (päivityksiä)
function cutLine(snapped) {
  const L = cast.lure;
  if (!L || L.st === 'fly' || (L.fish && L.fish.mode === 'caught')) return;
  const f = L.fish;
  if (f) { f.loose = true; if (f.mode !== 'land') { f.mode = 'dragline'; f.tz = Math.min(1.5, depthAt(f.x, f.y) - 0.2); } }
  loose.push({ x: L.x, y: L.y, a: f ? f.a : 0, fish: f, t: rand(200, 360), onWater: L.onWater, kind: L.kind });
  cast.lure = null; cast.needRelease = true;
  resetLine();
  banners.unshift({ text: snapped ? 'The line snapped!' : 'Line cut.', t: snapped ? 160 : 100 });
  SFX.snip();
}

function updateLoose() {
  for (const o of loose) {
    const f = o.fish;
    // Kuivalle maalle jäänyt kala ei katoa, ja sen voi kerätä talteen kävelemällä sen päälle
    if (!(f && f.mode === 'land')) o.t--;
    if (f && f.mode === 'land' && Math.hypot(player.x - f.x, player.y - f.y) < 0.5) {
      o.t = 0; o.picked = true;
      catches.push({ kind: f.kind, w: f.w, len: f.len });
      banners.unshift({ text: 'Picked up a ' + SPECIES[f.kind].name + '! ' + fmtWeight(f.w) + ', ' + Math.round(f.len) + ' cm', t: 220 });
      SFX.catch();
    }
    if (f) {
      if (!f.dead) f.anim++;
      if (f.mode === 'land') flopFish(f);
      else {
        // Karannut kala ui siiman ja kohon kanssa poispäin
        f.mode = 'dragline';
        if (Math.random() < 0.02) f.a += rand(-0.7, 0.7);
        moveFish(f, SPECIES[f.kind].fight * 0.5, 0.1);
        f.z += clamp(f.tz - f.z, -0.006, 0.006);
        f.z = clamp(f.z, 0.1, Math.max(0.1, depthAt(f.x, f.y) - 0.08));
      }
      f.fade = clamp(o.t / 60, 0, 1);
      o.x = f.x; o.y = f.y; o.a = f.a; o.onWater = f.mode !== 'land';
      if (o.onWater && o.t % 14 === 0) ripples.push({ x: o.x, y: o.y, t: 0, life: 30, max: 3, a: 0.45 * f.fade });
    } else if (o.onWater) {
      const nx = o.x + wind.wx * wind.gust * 0.003, ny = o.y + wind.wy * wind.gust * 0.003;
      if (lureInWater(nx, ny)) { o.x = nx; o.y = ny; }
    }
  }
  for (const o of loose) {
    if (o.t > 0 || !o.fish) continue;
    // Siiman kanssa karannut kala katoaa; lampeen syntyy tilalle uusi
    fishes = fishes.filter((q) => q !== o.fish);
    fishes.push(makeFish(o.fish.kind));
  }
  loose = loose.filter((o) => o.t > 0);
}

// Irti katkaistut kohot (ja niiden perässä laahaava siiman pätkä) haalistuvat lopuksi pois
function drawLoose(camXr, camYr) {
  for (const o of loose) {
    const f = o.fish;
    if (f && f.mode === 'land') {
      const fx = Math.round(isoX(f.x, f.y) - camXr), fy = Math.round(isoY(f.x, f.y) - camYr - f.hop);
      ctx.globalAlpha = f.fade;
      drawFishImg(f, fx, fy, (f.anim >> 3) % 2 === 0, f.anim >> 2);
      ctx.globalAlpha = 1;
    }
    const x = Math.round(isoX(o.x, o.y) - camXr), y = Math.round(isoY(o.x, o.y) - camYr);
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    ctx.globalAlpha = clamp(o.t / 60, 0, 1);
    const [ux, uy] = screenDir(-Math.cos(o.a), -Math.sin(o.a));
    if (o.onWater) plotLine(ctx, x, y, x + ux * 8, y + uy * 8 + 1, 'rgba(225, 230, 235, 0.45)');
    if (isArt(o.kind)) { if (!f) drawArtAt(o.kind, x, y - 1, 1, false); }
    else if (isRig(o.kind)) { if (!f) drawSinkerAt(x, y - 1); }
    else { bobberBehind = behindPlayer(o.x, o.y); drawBobberAt(x, y, o.onWater, !o.onWater, ctx.globalAlpha); }
    ctx.globalAlpha = 1;
  }
}

// Maalla kala sätkii: pomppaa satunnaiseen suuntaan; jos se pääsee veteen, uinti jatkuu
const LAND_DEATH = 60 * 60 * CLOCK_REAL;   // kuivalla maalla yli minuutin (1x nopeudella) ollut kala lakkaa liikkumasta
function flopFish(f) {
  f.z = 0;
  f.landT = (f.landT || 0) + clockStep;
  if (f.landT > LAND_DEATH) { f.dead = true; f.hop = 0; f.hopT = 0; return; }
  if (f.hopT > 0) {
    f.hopT--;
    const nx = f.x + f.hvx, ny = f.y + f.hvy;
    if (!playerSolid(type[cellIdx(nx, ny)])) { f.x = nx; f.y = ny; } else { f.hvx = -f.hvx; f.hvy = -f.hvy; }
    f.hop = Math.sin((Math.PI * f.hopT) / 18) * 4;
  } else {
    f.hop = 0;
    if (--f.flopT <= 0) {
      const a = rand(0, Math.PI * 2), v = rand(0.015, 0.035);
      f.hvx = Math.cos(a) * v; f.hvy = Math.sin(a) * v; f.hopT = 18; f.flopT = rand(12, 40);
      SFX.thud();
    }
  }
  f.energy = Math.min(f.maxE, f.energy + 0.1);
  if (shoreDist(f.x, f.y) < -0.25 && !onDock(f.x, f.y)) {
    f.landT = 0;
    f.mode = f.energy > f.maxE * 0.25 ? 'fight' : 'tired'; f.z = 0.2; f.tz = 0.5; f.hop = 0;
    ripples.push({ x: f.x, y: f.y, t: 0, life: 40, max: 5, a: 0.7 });
    SFX.splash(0.3);
  }
}

const fmtWeight = (g) => (g >= 1000 ? (g / 1000).toFixed(2) + ' kg' : Math.round(g) + ' g');

function collectFish(f) {
  catches.push({ kind: f.kind, w: f.w, len: f.len });
  // Saaliiksi saadun kalan tilalle syntyy heti uusi, satunnainen kala
  fishes = fishes.filter((q) => q !== f);
  fishes.push(makeFish(f.kind));
  banners.unshift({ text: 'Caught a ' + SPECIES[f.kind].name + '! ' + fmtWeight(f.w) + ', ' + Math.round(f.len) + ' cm', t: 220 });
  cast.lure = null; cast.needRelease = true;
  resetLine();
  SFX.catch();
}

// Kalan kuva (flip = pää vasemmalle); koukussa riuhtova kala vipattaa pyrstöään nopeammin
function drawFishImg(f, x, y, flip, beat, dir) {
  let set = FISH_SPR[fishSprKey(f)][f.px].side;
  if (dir !== undefined) { const v = DIR_VIEW[dir]; set = FISH_SPR[fishSprKey(f)][f.px][v[0]]; flip = v[1]; }
  const img = set[(beat >> 2) % 2];
  drawImg(img, x - (img.width >> 1), y - (img.height >> 1), flip);
}

// Veden alla olevat asiat (kalat, syötti ja koukku, pinnan alle vedetty koho) piirretään omalle
// kerrokselleen: kukin sitä himmeämpänä, mitä syvemmällä ja sameammassa vedessä se on. Kerros
// rajataan lammen alueelle. Piilotetussa vedessä kaikki näkyy täysin.
const underCanvas = makeCanvas(W, H), underCtx = underCanvas.getContext('2d');
let pondMaskCanvas = null;
const underVis = (z) => (water.show ? Math.exp(-water.turb * z * 1.3) : 1);
function drawUnderwater(camXr, camYr) {
  const g = underCtx;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  ctx = g;
  const L = cast.lure;
  const list = fishes.filter((f) => f.mode !== 'land' && f.mode !== 'caught').sort((a, b) => b.z - a.z);
  for (const f of list) {
    const x = Math.round(isoX(f.x, f.y) - camXr), y = Math.round(isoY(f.x, f.y) - camYr + f.z * Z_PX);
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    g.globalAlpha = underVis(f.z) * (f.fade === undefined ? 1 : f.fade);
    const [sx] = screenDir(Math.cos(f.a), Math.sin(f.a));
    const hooked = L && L.fish === f;
    drawFishImg(f, x, y, sx < 0, f.anim * (hooked && f.mode === 'fight' ? 3 : 1), fishDir(f));
  }
  drawSealUnder(g, camXr, camYr);
  if (L && L.st === 'float' && L.onWater) {
    const lx = Math.round(isoX(L.x, L.y) - camXr), ly = Math.round(isoY(L.x, L.y) - camYr);
    if (L.fish) {
      // Siima kohosta kalan suuhun ja pinnan alle vedetty koho
      const f = L.fish, [mdx, mdy] = fishMouthScreen(f);
      const fx = Math.round(isoX(f.x, f.y) - camXr + mdx), fy = Math.round(isoY(f.x, f.y) - camYr + mdy + f.z * Z_PX);
      const wl = wobblerLine(camXr, camYr);
      g.globalAlpha = underVis(f.z * 0.5);
      if (wl) plotPts(g, wl.dn, 'rgba(225, 230, 235, 0.6)');
      else plotLine(g, lx, ly + L.sub * Z_PX, fx, fy, 'rgba(225, 230, 235, 0.6)');
      if (L.sub > 0.05) { g.globalAlpha = underVis(L.sub); bobberBehind = behindPlayer(L.x, L.y); drawBobberAt(lx, Math.round(ly + L.sub * Z_PX), false, false, underVis(L.sub) * 0.6); }
    } else if (isArt(L.kind)) {
      // Pinnan alle sukeltanut vaappu ja siima pinnasta vaappuun
      const wl = wobblerLine(camXr, camYr);
      if (wl && wl.depth > 0.02) { g.globalAlpha = underVis(wl.depth * 0.5); plotPts(g, wl.dn, 'rgba(225, 230, 235, 0.6)'); }
      if (L.z > 0.05) {
        g.globalAlpha = underVis(L.z);
        drawArtAt(L.kind, lx, Math.round(ly + L.z * Z_PX), wobblerDir(L, camXr), L.moving);
      }
    } else if (isRig(L.kind)) {
      drawRigUnder(g, L, camXr, camYr);
    } else {
      // Syötti ja koukku riippuvat kohon alla koukun syvyydellä (tai pohjassa, jos vesi on matalampaa)
      const hz = Math.min(cast.hookDepth, depthAt(L.x, L.y) - 0.03), hy = Math.round(ly + hz * Z_PX);
      g.globalAlpha = underVis(hz * 0.5);
      plotLine(g, lx, ly, lx, hy, 'rgba(200, 205, 210, 0.55)');
      g.globalAlpha = underVis(hz);
      drawHookBait(lx, hy);
      // Maistelevan kalan veden alle painama koho (lahna)
      if (L.sub > 0.05) { g.globalAlpha = underVis(L.sub); bobberBehind = behindPlayer(L.x, L.y); drawBobberAt(lx, Math.round(ly + L.sub * Z_PX), false, false, underVis(L.sub) * 0.6); }
    }
  }
  drawStems(g, camXr, camYr);
  drawDockPosts(g, camXr, camYr);
  drawBoatUnder(g, camXr, camYr);
  g.globalAlpha = 1;
  ctx = mainCtx;
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(pondMaskCanvas, PB.x0 - camXr, PB.y0 - camYr);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(underCanvas, 0, 0);
}

// Pohjaonki veden alla: siima pinnalta puntille (kireänä suora, löysänä pohjalle vajoava ja pohjaa pitkin
// makaava), sivuhaara siimassa RIG_DIST puntin yläpuolella ja haaran päässä roikkuva syötti. Syötti makaa
// sivulla pohjassa, kun haara ulottuu pohjaan; muuten se roikkuu alaspäin ja heiluu hieman.
function drawRigUnder(g, L, camXr, camYr) {
  if (L.z < 0) return;   // nostettu puntti on ilmassa (drawLure)
  const wl = wobblerLine(camXr, camYr);
  if (!wl) return;
  const rs = rigState(L), zS = L.z, sy = wl.ey - zS * Z_PX, N = 14;
  const P = (t) => [lerp(wl.wx, wl.ex, t), lerp(wl.wy, sy, t) + zS * rs.df(t) * Z_PX];
  g.globalAlpha = underVis(zS * 0.5);
  let [px, py] = P(0);
  for (let i = 1; i <= N; i++) { const [qx, qy] = P(i / N); plotLine(g, px, py, qx, qy, 'rgba(225, 230, 235, 0.6)'); px = qx; py = qy; }
  g.globalAlpha = underVis(zS);
  drawSinkerAt(Math.round(wl.ex), Math.round(wl.ey));
  if (rs.zJ < 0) return;   // haara ja syötti ovat ilmassa (drawLure)
  const [jx0, jy0] = P(rs.tj), jx = Math.round(jx0), jy = Math.round(jy0);
  g.globalAlpha = underVis(rs.zJ);
  // Sivuhaara roikkuu vapaana siiman kiinnityskohdasta alas (pohjalla lyhyempänä) ja heiluu hieman
  const bx = jx + Math.round(Math.sin(time * 0.03 + L.x * 3) * 0.7), by = jy + Math.max(0, Math.round((rs.zB - rs.zJ) * Z_PX));
  plotLine(g, jx, jy, bx, by, 'rgba(200, 205, 210, 0.6)');
  drawRigBait(L.kind, bx, by);
}

// Veden yläpuolelle noussut haara ja syötti (kelattaessa): haara on ilmassa kulkevalla siimalla ja roikkuu vapaana alas.
// Pinnan läpäisykohdan (wl) ja ongen kärjen välinen siima on piirretty jo; piirtää myös nostetun puntin.
function drawRigAir(L, camXr, camYr, x, y) {
  const rs = rigState(L);
  if (L.z < -0.05) drawSinkerAt(x, y + Math.round(L.z * Z_PX));
  if (rs.zJ >= 0) return;
  const g = rodGeom(), tx = g.tx - camXr, ty = g.ty - camYr, wl = wobblerLine(camXr, camYr);
  const sx = L.z < 0 ? x : wl ? wl.wx : x, sy = L.z < 0 ? y + L.z * Z_PX : wl ? wl.wy : y;
  const jx = Math.round(lerp(sx, tx, rs.ua)), jy = Math.round(lerp(sy, ty, rs.ua));
  const bx = jx + Math.round(Math.sin(time * 0.03 + L.x * 3) * 0.7), by = jy + Math.round(RIG_ARM * Z_PX);
  plotLine(ctx, jx, jy, bx, by, 'rgba(210, 214, 218, 0.8)');
  drawRigBait(L.kind, bx, by);
}

// Debug-tila (vesi piilotettuna): jokaisesta kalasta ja vedessä olevasta vaapusta pystyviiva pintaan ja
// pohjaan, pinnan kohdalla rengas. Tähtäimen kohdalta (lammen päällä) viiva pohjaan.
function drawDebugLines(camXr, camYr) {
  const depthLine = (wx, wy, z, col) => {
    const x = Math.round(isoX(wx, wy) - camXr), sy = Math.round(isoY(wx, wy) - camYr);
    if (x < -6 || x > W + 6 || sy < -6 || sy > H + 40) return;
    const fy = Math.round(sy + z * Z_PX), by = Math.round(sy + depthAt(wx, wy) * Z_PX);
    ctx.fillStyle = `rgba(${col}, 0.55)`;
    for (let y = sy + 1; y < fy - 1; y++) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = `rgba(${col}, 0.3)`;
    for (let y = fy + 2; y <= by; y++) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = `rgba(${col}, 0.8)`;
    ctx.fillRect(x - 1, by, 3, 1);                                  // pohjan kohta
    for (let k = 0; k < 12; k++) {                                  // rengas pinnalla
      const a = (k / 12) * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(a) * 3), Math.round(sy + Math.sin(a) * 1.5), 1, 1);
    }
  };
  for (const f of fishes) {
    if (f.mode === 'land' || f.mode === 'caught') continue;
    depthLine(f.x, f.y, f.z, f.kind === 'pike' ? '120, 230, 140' : '255, 200, 90');
  }
  // Vedessä oleva vaappu (violetti)
  const L = cast.lure;
  if (L && isArt(L.kind) && L.st === 'float' && L.onWater && !L.fish) depthLine(L.x, L.y, L.z, '230, 130, 240');
  // Pohjaongen puntti (violetti) ja syötti (keltainen)
  if (L && isRig(L.kind) && L.st === 'float' && L.onWater && !L.fish) {
    const rs = rigState(L);
    depthLine(L.x, L.y, L.z, '230, 130, 240'); depthLine(rs.jx, rs.jy, rs.zB, '255, 220, 120');
  }
  if (state === 'play' && aiming()) {
    const mx = Math.round(mouseX), my = Math.round(mouseY);
    if (waterPx(mx + camXr, my + camYr)) {
      const [wx, wy] = absToWorld(mx + camXr, my + camYr), by = Math.round(my + depthAt(wx, wy) * Z_PX);
      ctx.fillStyle = 'rgba(200, 230, 255, 0.6)';
      for (let y = my + 4; y <= by; y++) ctx.fillRect(mx, y, 1, 1);
      ctx.fillRect(mx - 1, by, 3, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Sorsat: uiskentelevat, jättävät vanaveden, sukeltavat pää edellä syömään,
// pyrähtävät lentoon pelaajan tullessa liian lähelle ja laskeutuvat takaisin.
// Yöksi ne uivat rantakaislikkoon nukkumaan; säikähtäessään ne heräävät ja pakenevat
// siipiä räpyttäen veden pintaa pitkin.
// ---------------------------------------------------------------------------
function makeDuck(x, y, male, arriving) {
  return { x, y, z: 0, a: rand(0, Math.PI * 2), sp: 0, mode: arriving ? 'arrive' : 'swim', t: rand(60, 300), male, nerve: 0, anim: 0, flip: false, wakeT: 0, tx: 0, ty: 0, vz: 0, quackT: rand(900, 2400), sx: 0, sy: 0, dist0: 1 };
}

function spawnArrivingDucks() {
  const ang = rand(0, Math.PI * 2), n = Math.random() < 0.6 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const d = makeDuck(C + Math.cos(ang) * 58 + rand(-1.5, 1.5), C + Math.sin(ang) * 58 + rand(-1.5, 1.5), k === 0 ? Math.random() < 0.6 : !ducks[ducks.length - 1].male, true);
    d.tx = C + rand(-12, 12); d.ty = C + rand(-12, 12);
    d.z = 46 + rand(-4, 4);
    d.dist0 = Math.hypot(d.tx - d.x, d.ty - d.y);
    d.a = Math.atan2(d.ty - d.y, d.tx - d.x);
    ducks.push(d);
  }
}

function duckSplash(d, n, big) {
  const a = { x: isoX(d.x, d.y), y: isoY(d.x, d.y) };
  for (let k = 0; k < n; k++) {
    particles.push({ x: a.x + rand(-3, 3), y: a.y - 1, vx: rand(-0.7, 0.7), vy: rand(-1.6, -0.4), g: 0.12, life: 60, color: pick(['#d8e4ec', '#a8c0cc', '#ffffff']), floor: a.y + rand(-1, 2), splash: true });
  }
  ripples.push({ x: d.x, y: d.y, t: 0, life: big ? 60 : 40, max: big ? 9 : 6, a: 0.7 });
  if (big) ripples.push({ x: d.x, y: d.y, t: -10, life: 60, max: 6, a: 0.5 });
}

// Mihin sorsa voi uida: ei rantaan, laiturin alle eikä kivien päälle
const duckFree = (x, y) => shoreDist(x, y) < -0.8 && !onDock(x, y, 0.8) && !waterRocks.some((r) => Math.hypot(r.x - x, r.y - y) < 0.9);

// Uintiliike: nopeus kiihtyy kohti tavoitetta, ja perään jää vanavesi
function paddle(d, want) {
  d.sp += (want - d.sp) * 0.03;
  const nx = d.x + Math.cos(d.a) * d.sp, ny = d.y + Math.sin(d.a) * d.sp;
  if (duckFree(nx, ny)) { d.x = nx; d.y = ny; }
  else d.a += 0.2;
  // Vanavesi: kaksi pisaraa kummallekin puolelle hieman taaksepäin
  if (d.sp > 0.004 && ++d.wakeT % 7 === 0) {
    const bx = d.x - Math.cos(d.a) * 0.3, by = d.y - Math.sin(d.a) * 0.3;
    for (const side of [-1, 1]) {
      const vx = (-Math.sin(d.a) * side * 0.6 - Math.cos(d.a) * 0.25) * d.sp, vy = (Math.cos(d.a) * side * 0.6 - Math.sin(d.a) * 0.25) * d.sp;
      wakes.push({ x: bx, y: by, vx, vy, t: 0, life: 110 });
    }
  }
  if (d.wakeT % 70 === 0 && d.sp > 0.004) ripples.push({ x: d.x, y: d.y, t: 0, life: 50, max: 4, a: 0.35 });
}

// Yöpaikka kaislikon vierestä, kaukana pelaajasta; parin toinen sorsa asettuu toisen viereen
function roostSpot(d, pool = ducks) {
  const mate = pool.find((o) => o !== d && (o.mode === 'roost' || o.mode === 'sleep'));
  const reeds = decor.filter((o) => o.reed && Math.hypot(o.x - player.x, o.y - player.y) > 8);
  for (let k = 0; k < 40 && reeds.length; k++) {
    const o = mate && k < 20 ? { x: mate.tx, y: mate.ty } : pick(reeds);
    const a = Math.atan2(o.y - C, o.x - C) + (mate && k < 20 ? rand(-0.06, 0.06) : 0);
    const r = pondR(a) - 1.05, x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    if (duckFree(x, y) && ![...ducks, ...grebes].some((q) => q !== d && (q.mode === 'roost' || q.mode === 'sleep') && Math.hypot(q.tx - x, q.ty - y) < 0.7)) return [x, y];
  }
  return null;
}

// Säikähtänyt sorsa pakenee siipiä räpyttäen pitkin veden pintaa
function scramble(d) {
  const p = player;
  d.mode = 'scramble'; d.t = rand(90, 130); d.sp = 0.07;
  const away = Math.atan2(d.y - p.y, d.x - p.x), center = Math.atan2(C - d.y, C - d.x);
  d.a = away + angDiff(away, center) * 0.4;
  duckSplash(d, 8, true);
  SFX.duckWater(false, 0.8); SFX.flap();
  const dp = Math.hypot(d.x - p.x, d.y - p.y);
  sing('quack', clamp((isoX(d.x, d.y) - isoX(p.x, p.y)) / 200, -1, 1), clamp(1.2 - dp / 25, 0.3, 1));
}

function updateDucks() {
  const p = player, night = phaseName === 'NIGHT';
  for (const d of ducks) {
    d.anim++;
    const dp = Math.hypot(d.x - p.x, d.y - p.y);
    if (d.mode === 'swim' || d.mode === 'dabble' || d.mode === 'roost') {
      // Lähistöllä liikkuva pelaaja hermostuttaa sorsia: ne väistävät uimalla, ja jos pelaaja jatkaa
      // lähestymistä tai tulee aivan lähelle, ne pyrähtävät lentoon (yöllä pakenevat veden pintaa pitkin).
      // Paikallaan oleva pelaaja ei pelota.
      d.nerve = clamp(d.nerve + (p.moving && dp < 8 ? (8 - dp) * 0.0028 : -0.002), 0, 1);
      if (d.nerve >= 1 || dp < 2.4) { d.nerve = 0; if (night) scramble(d); else takeOff(d); continue; }
      if (night && d.mode !== 'roost') {
        const spot = roostSpot(d);
        if (spot) { d.mode = 'roost'; [d.tx, d.ty] = spot; }
      }
      if (d.mode === 'roost') {
        // Uidaan kaislikon viereen ja asetutaan nukkumaan
        const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
        d.a += angDiff(d.a, Math.atan2(dy, dx)) * 0.08;
        paddle(d, dist < 1 ? 0.006 : 0.013);
        if (dist < 0.25) { d.mode = 'sleep'; d.sp = 0; }
        if (!night) d.mode = 'swim';
      } else if (d.mode === 'dabble') {
        if (--d.t <= 0) { d.mode = 'swim'; d.t = rand(120, 400); ripples.push({ x: d.x, y: d.y, t: 0, life: 30, max: 3, a: 0.5 }); }
        continue;
      } else {
        let want = 0.008;
        d.a += rand(-0.03, 0.03);
        if (shoreDist(d.x, d.y) > -2.4) d.a += angDiff(d.a, Math.atan2(C - d.y, C - d.x)) * 0.06;
        if (dp < 6) { d.a += angDiff(d.a, Math.atan2(d.y - p.y, d.x - p.x)) * 0.05; want = 0.018; }
        paddle(d, want);
        if (--d.t <= 0) {
          const r = Math.random();
          if (r < 0.25) { d.mode = 'dabble'; d.t = rand(70, 160); d.sp = 0; ripples.push({ x: d.x, y: d.y, t: 0, life: 30, max: 3, a: 0.5 }); }
          else { d.a += rand(-1.5, 1.5); d.t = rand(200, 600); }
        }
        // Toisinaan sorsat lähtevät omia aikojaan (päivällä)
        if (!night && Math.random() < 1 / (60 * 300)) takeOff(d);
      }
      if (--d.quackT <= 0) { d.quackT = rand(1200, 3600); if (dp < 30) sing('quack', clamp((isoX(d.x, d.y) - isoX(p.x, p.y)) / 200, -1, 1), clamp(1 - dp / 30, 0.2, 1)); }
    } else if (d.mode === 'sleep') {
      // Nukkuva sorsa herää aamulla; lähelle tuleva tai lähistöllä liikkuva pelaaja säikäyttää sen
      if (!night) { d.mode = 'swim'; d.t = rand(100, 300); }
      else if (dp < 2.4 || (p.moving && dp < 5)) {
        scramble(d);
        for (const o of ducks) if (o !== d && o.mode === 'sleep' && Math.hypot(o.x - d.x, o.y - d.y) < 4) scramble(o);
      }
    } else if (d.mode === 'scramble') {
      // Siivet räpyttävät ja jalat polkevat: vauhti hiipuu hiljalleen, roiskeita ja vanavettä
      d.a += angDiff(d.a, Math.atan2(C - d.y, C - d.x)) * (shoreDist(d.x, d.y) > -3 ? 0.06 : 0);
      paddle(d, 0.04);
      if (d.anim % 4 === 0) duckSplash(d, 2, false);
      if (--d.t <= 0) { d.mode = 'swim'; d.t = rand(200, 500); d.sp = 0.02; }
    } else if (d.mode === 'takeoff') {
      // Siivet räpyttävät ja jalat juoksevat veden pinnalla, kunnes sorsa nousee ilmaan
      d.sp = Math.min(0.12, d.sp + 0.003);
      d.vz = Math.min(0.75, d.vz + 0.018);
      d.z += d.vz;
      d.x += Math.cos(d.a) * d.sp; d.y += Math.sin(d.a) * d.sp;
      if (d.z < 4 && d.anim % 4 === 0) { duckSplash(d, 2, false); }
      if (Math.hypot(d.x - C, d.y - C) > 75 || d.z > 140) d.gone = true;
    } else if (d.mode === 'arrive') {
      // Lento lammelle ja liukuva lasku veteen
      const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
      d.a = Math.atan2(dy, dx);
      const sp = 0.035 + Math.min(0.065, dist * 0.004);
      d.x += (dx / dist) * sp; d.y += (dy / dist) * sp;
      d.z = 46 * clamp(dist / d.dist0, 0, 1) ** 1.3;
      if (dist < 0.3 || d.z <= 0.5) {   // lasku heti, kun lintu osuu veteen (kuva vaihtuu lentävästä uivaan)
        d.mode = 'swim'; d.z = 0; d.sp = 0.03; d.t = rand(200, 500);
        duckSplash(d, 14, true);
        SFX.duckWater(true);
        sing('quack', 0, 0.7);
      }
    }
    // Kuvan suunta liikkeen mukaan
    const [sx] = screenDir(Math.cos(d.a), Math.sin(d.a));
    if (Math.abs(sx) > 0.15) d.flip = sx < 0;
  }
  ducks = ducks.filter((d) => !d.gone);
  // Uusia sorsia lentää lammelle silloin tällöin (ei yöllä)
  const swimming = ducks.filter((d) => d.mode !== 'takeoff').length;
  if (swimming < 3 && --duckT <= 0) {
    duckT = rand(1800, 4800);
    if (!night && env.dark < 0.5) spawnArrivingDucks();
  }
}

function takeOff(d) {
  const p = player;
  d.mode = 'takeoff';
  d.a = Math.atan2(d.y - p.y, d.x - p.x) + rand(-0.4, 0.4);
  d.vz = 0; d.sp = Math.max(d.sp, 0.02);
  duckSplash(d, 10, true);
  SFX.duckWater(false); SFX.flap();
  const dp = Math.hypot(d.x - p.x, d.y - p.y);
  sing('quack', clamp((isoX(d.x, d.y) - isoX(p.x, p.y)) / 200, -1, 1), clamp(1.2 - dp / 25, 0.3, 1));
  // Muut lähellä olevat sorsat lähtevät mukaan
  for (const o of ducks) if (o !== d && (o.mode === 'swim' || o.mode === 'dabble') && Math.hypot(o.x - d.x, o.y - d.y) < 7 && Math.random() < 0.8) {
    o.mode = 'takeoff'; o.a = d.a + rand(-0.3, 0.3); o.vz = -0.1; o.sp = 0.01;
    duckSplash(o, 8, true);
  }
}

function drawDuck(d, sx, sy) {
  const set = DUCK_SPR[d.male ? 'm' : 'f'];
  sx = Math.round(sx); sy = Math.round(sy);
  if (d.mode === 'scramble') {
    // Pakeneva sorsa räpyttää siipiään aivan veden pinnassa
    drawImg(Math.floor(d.anim / 3) % 2 ? set.fly0 : set.fly1, sx - 5, sy - 4, d.flip);
    return;
  }
  if (d.z > 0.5) {
    // Lentävä sorsa: varjo veden tai maan pinnalla
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.05, 0.3 - d.z * 0.004).toFixed(3)})`;
    ctx.fillRect(sx - 3, sy, 7, 1);
    const img = Math.floor(d.anim / 5) % 2 ? set.fly0 : set.fly1;
    drawImg(img, sx - 5, sy - Math.round(d.z) - 3, d.flip);
    return;
  }
  const img = d.mode === 'dabble' ? set.dabble : d.mode === 'sleep' ? set.sleep : set.swim;
  const bob = Math.round(Math.sin(d.anim * (d.mode === 'sleep' ? 0.03 : 0.06)) * 0.5);
  drawImg(img, sx - 4, sy - img.height + 1 + bob, d.flip);
  // Vesiraja: alin pikselirivi jää veden alle
  ctx.fillStyle = `rgba(${env.ring}, 0.35)`;
  ctx.fillRect(sx - 4, sy + 1, 7, 1);
}

// ---------------------------------------------------------------------------
// Silkkiuikut: pari sorsan kokoista uikkua uiskentelee lammella pitkä valkoinen kaula pystyssä, tupsupää ja
// ruskea kaulus. Ne sukeltavat välillä ja ilmestyvät pinnalle kauempana. Kun pelaaja tulee kävellen tai
// veneellä liian lähelle, uikut juoksevat siivet räpyttäen veden pintaa pitkin lentoon, lentävät ison
// kaaren ja laskeutuvat johonkin toiseen kohtaan lampea (eivät poistu). Yöllä ne säikähtäessään vain sukeltavat.
// Tilat: swim, dive (sukellus: uppoaa, on pinnan alla, nousee), takeoff (lentoonlähtö), fly, (lasku -> swim).
// ---------------------------------------------------------------------------
const GREBE_PAL = { k: '#16181c', K: '#101216', r: '#c0662c', R: '#7e3e1e', w: '#f0ece0', e: '#c8281e', p: '#aaa2a6', P: '#564c56', b: '#6a5a4c', n: '#463c34', m: '#bab4a6', M: '#7c8088',
  g: '#4a4a54', G: '#6a6c76', c: '#e2d6bc', t: '#a8642e', f: '#f0ece0', S: '#d4e4ee' };
const GREBE_SPR = {
  swim: makeSprite(['....K.K.....', '...KKKKK....', '..rrKwewp...', '..RrrwwwpppP', '...KRrww....', '....gcw.....', 'gGgggcww....', 'fGGGGgcc....', 'fttttttcc...'], GREBE_PAL),
  dip1: makeSprite(['............', '............', '............', '.....cww....', '......cwKKK.', '......gcrwe.', 'gGgggcwwRwwp', 'fGGGGgcc..pP', 'fttttttcc..P'], GREBE_PAL),   // sukellus: kaula kaartuu alas ja pää painuu veteen
  sleep: makeSprite(['............', '............', '............', '............', '......KK....', '.....rrw....', 'gGgggRrwgg..', 'fGGGGGGcc...', 'fttttttcc...'], GREBE_PAL),   // nukkuva uikku: pää selkäsulkien alla
  dip2: makeSprite(['............', '............', '............', '............', 'ff..........', 'fGGgg....S..', 'ttGGGg.S.S..', 'tttGGGgcc.S.', 'ttttttttcc..'], GREBE_PAL),   // pää veden alla, peräpää nousee, roiskeet
  fly0: makeSprite(['......gg.........', '.....gwwg........', '....gwwwwg.......', '...gwwwwg........', '..gwwwg..........', 'ggGGGGGGwwwwwKrpP', '..cccccccc.......'], GREBE_PAL),
  fly1: makeSprite(['ggGGGGGGwwwwwKrpP', '..ccccwwcc.......', '...gwwwwg........', '....gwwwwg.......', '.....gwwwg.......', '......gwwg.......', '.......gg........'], GREBE_PAL),
};
GREBE_SPR.fly0.body = 5; GREBE_SPR.fly1.body = 0;   // rungon rivi (kuvan korkeus vaihtelee siipien mukaan)
function makeGrebe(x, y) {
  return { x, y, z: 0, a: rand(0, Math.PI * 2), sp: 0, mode: 'swim', t: rand(120, 400), nerve: 0, anim: 0, flip: false, wakeT: 0, vz: 0, callT: rand(900, 2400),
    wx: 0, wy: 0, tx: 0, ty: 0, leg: 0, fly: 0, dive: 0, dx: 0, dy: 0 };
}
function spawnGrebes() {
  grebes = [];
  for (let k = 0; k < 40 && grebes.length < 2; k++) {
    const a = rand(0, Math.PI * 2), r = rand(4, POND_R * 0.6);
    const x = C + Math.cos(a) * r + (grebes[0] ? rand(-1, 1) : 0), y = C + Math.sin(a) * r;
    if (duckFree(x, y) && Math.hypot(x - player.x, y - player.y) > 8 && (!grebes[0] || Math.hypot(x - grebes[0].x, y - grebes[0].y) < 6)) grebes.push(makeGrebe(x, y));
  }
}
const grebePan = (d) => clamp((isoX(d.x, d.y) - isoX(player.x, player.y)) / 200, -1, 1);
function grebeCall(d, vol) {
  const dp = Math.hypot(d.x - player.x, d.y - player.y);
  if (dp < 40) sing(Math.random() < 0.75 ? 'grebe' : 'grebe1', grebePan(d), clamp((vol || 1) * (1.2 - dp / 40), 0.15, 1));
}
// Uikun lähestyvä häiriö: kävelevä pelaaja tai liikkuva vene
const grebeDisturb = () => player.moving || (player.boat && boat && Math.abs(boat.v) > 0.004);

// Mihin uikku laskeutuu: vapaa vesikohta kaukana pelaajasta ja lähtöpaikasta
function grebeLanding(d) {
  let best = null, bs = -1;
  for (let k = 0; k < 40; k++) {
    const a = rand(0, Math.PI * 2), r = rand(3, POND_R * 0.8), x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    if (!duckFree(x, y)) continue;
    const sc = Math.min(Math.hypot(x - player.x, y - player.y), 1.6 * Math.hypot(x - d.x, y - d.y)) + rand(0, 4);
    if (sc > bs) { bs = sc; best = [x, y]; }
  }
  return best || [C, C];
}

function takeOffGrebe(d, partner) {
  const p = player;
  d.mode = 'takeoff'; d.leg = 0; d.vz = 0; d.sp = Math.max(d.sp, 0.02); d.nerve = 0;
  d.a = (partner ? partner.a : Math.atan2(d.y - p.y, d.x - p.x)) + rand(-0.3, 0.3);
  const [tx, ty] = partner ? [partner.tx + rand(-2, 2), partner.ty + rand(-2, 2)] : grebeLanding(d);
  d.tx = tx; d.ty = ty;
  // Ensimmäinen reittipiste: pitkälle lähtösuuntaan, joten lento kaartaa laajasti
  const L = rand(18, 30);
  d.wx = d.x + Math.cos(d.a) * L; d.wy = d.y + Math.sin(d.a) * L;
  d.fly = 0;
  duckSplash(d, 10, true);
  SFX.duckWater(false); SFX.flap();
  grebeCall(d, 1);
  if (!partner) for (const o of grebes) if (o !== d && o.mode === 'swim' && Math.hypot(o.x - d.x, o.y - d.y) < 12) takeOffGrebe(o, d);
}

function grebeDive(d, flee) {
  d.mode = 'dive'; d.dive = 0; d.sp = 0; d.nerve = 0;
  d.t = Math.round(flee ? rand(260, 420) : rand(160, 380));   // kokonaisluku, koska vaiheet tunnistetaan vertaamalla ruutulaskuria
  d.up = false;
  // Nousupaikka: eteenpäin tai poispäin pelaajasta, vapaaseen veteen
  for (let k = 0; k < 20; k++) {
    const a = flee ? Math.atan2(d.y - player.y, d.x - player.x) + rand(-0.8, 0.8) : d.a + rand(-1.2, 1.2), L = flee ? rand(8, 16) : rand(3, 9);
    const x = d.x + Math.cos(a) * L, y = d.y + Math.sin(a) * L;
    if (duckFree(x, y) && !grebes.some((o) => o !== d && Math.hypot(o.x - x, o.y - y) < 1.2)) { d.dx = x; d.dy = y; d.a = a; break; }
    d.dx = d.x; d.dy = d.y;
  }
  ripples.push({ x: d.x, y: d.y, t: 0, life: 45, max: 5, a: 0.6 });
  duckSplash(d, 4, false);
  SFX.duckWater(false, 0.35);
}

function updateGrebes() {
  const p = player, night = phaseName === 'NIGHT';
  for (const d of grebes) {
    d.anim++;
    const dp = Math.hypot(d.x - p.x, d.y - p.y);
    if (d.mode === 'swim') {
      d.nerve = clamp(d.nerve + (grebeDisturb() && dp < 9 ? (9 - dp) * 0.0028 : -0.002), 0, 1);
      if (d.nerve >= 1 || dp < 3) { if (night) grebeDive(d, true); else takeOffGrebe(d); continue; }
      // Yöksi uikut uivat kaislikon viereen nukkumaan sorsien tapaan
      if (night) {
        const spot = roostSpot(d, grebes);
        if (spot) { d.mode = 'roost'; [d.tx, d.ty] = spot; continue; }
      }
      let want = 0.008;
      d.a += rand(-0.03, 0.03);
      if (shoreDist(d.x, d.y) > -2.4) d.a += angDiff(d.a, Math.atan2(C - d.y, C - d.x)) * 0.06;
      // Pari pysyy lähekkäin
      const mate = grebes.find((o) => o !== d && o.mode === 'swim');
      if (mate) { const md = Math.hypot(mate.x - d.x, mate.y - d.y); if (md > 5) { d.a += angDiff(d.a, Math.atan2(mate.y - d.y, mate.x - d.x)) * 0.04; want = 0.011; } else if (md < 1.2) d.a += angDiff(d.a, Math.atan2(d.y - mate.y, d.x - mate.x)) * 0.05; }
      if (dp < 7) { d.a += angDiff(d.a, Math.atan2(d.y - p.y, d.x - p.x)) * 0.05; want = 0.016; }
      paddle(d, want);
      if (--d.t <= 0) { if (Math.random() < 0.5) grebeDive(d, false); else { d.a += rand(-1.5, 1.5); d.t = rand(200, 600); } }
      if (--d.callT <= 0) { d.callT = rand(1800, 5000) * (night ? 3 : 1); grebeCall(d, night ? 0.5 : 0.9); }
    } else if (d.mode === 'roost' || d.mode === 'sleep') {
      // Uidaan kaislikon viereen ja nukutaan aamuun; lähelle tuleva tai lähistöllä liikkuva pelaaja herättää ja uikku sukeltaa pakoon
      if (!night) { d.mode = 'swim'; d.t = rand(100, 300); d.nerve = 0; continue; }
      if (dp < 2.8 || (grebeDisturb() && dp < 6)) { grebeDive(d, true); continue; }
      if (d.mode === 'roost') {
        const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
        d.a += angDiff(d.a, Math.atan2(dy, dx)) * 0.08;
        paddle(d, dist < 1 ? 0.006 : 0.012);
        if (dist < 0.25) { d.mode = 'sleep'; d.sp = 0; }
      }
    } else if (d.mode === 'dive') {
      d.dive++;
      if (d.dive === DIVE_SINK) d.hidden = true;
      if (!d.up && d.dive >= d.t - SURF) {
        d.up = true;
        // Nousu pinnalle uudessa paikassa: aaltorengas, pisaroita ja hiljainen molahdus; kuva kohoaa vedestä
        d.x = d.dx; d.y = d.dy; d.hidden = false;
        ripples.push({ x: d.x, y: d.y, t: 0, life: 50, max: 5, a: 0.6 }, { x: d.x, y: d.y, t: -12, life: 50, max: 4, a: 0.45 });
        duckSplash(d, 4, false);
        SFX.duckWater(false, 0.25);
      }
      if (d.dive === d.t - SURF + 24) duckSplash(d, 3, false);   // pää nousee pinnalle: pisaroita
      if (d.dive === d.t - 14) ripples.push({ x: d.x, y: d.y, t: 0, life: 40, max: 3, a: 0.4 });
      if (d.dive > d.t) {
        d.mode = 'swim'; d.t = rand(200, 600); d.sp = 0.006;
        if (Math.random() < 0.4) grebeCall(d, 0.8);
      }
    } else if (d.mode === 'takeoff') {
      // Juoksee siivet räpyttäen veden pinnalla, kunnes nousee ilmaan
      d.sp = Math.min(0.1, d.sp + 0.0025);
      d.vz = Math.min(0.6, d.vz + 0.014);
      d.z += d.vz;
      d.x += Math.cos(d.a) * d.sp; d.y += Math.sin(d.a) * d.sp;
      if (d.z < 4 && d.anim % 4 === 0) duckSplash(d, 2, false);
      if (d.z > 14) { d.mode = 'fly'; d.fly = 0; }
    } else if (d.mode === 'fly') {
      d.fly++;
      const goal = d.leg === 0 ? [d.wx, d.wy] : [d.tx, d.ty];
      const dx = goal[0] - d.x, dy = goal[1] - d.y, dist = Math.hypot(dx, dy);
      if (d.leg === 0 && dist < 5) d.leg = 1;
      const want = Math.atan2(dy, dx), last = d.leg === 1 && dist < 3.5;
      d.a += last ? angDiff(d.a, want) : clamp(angDiff(d.a, want), -0.032, 0.032);
      const sp = d.leg === 1 ? Math.min(0.1, 0.035 + dist * 0.004) : 0.1;
      d.x += Math.cos(d.a) * sp; d.y += Math.sin(d.a) * sp;
      // Korkeus: nousu matkalentokorkeuteen, loppulähestymisessä liukuva lasku
      const cruise = 24 + Math.sin(d.fly * 0.03) * 2;
      const zt = d.leg === 1 ? cruise * clamp((dist - 0.3) / 13, 0, 1) ** 1.2 : cruise;
      d.z += clamp(zt - d.z, -0.5, 0.35);
      if ((d.leg === 1 && (dist < 0.4 || d.z <= 0.5)) || d.fly > 2200) {   // lasku heti vesikosketuksessa
        if (!duckFree(d.x, d.y)) { const g = grebeLanding(d); d.x = g[0]; d.y = g[1]; }
        d.mode = 'swim'; d.z = 0; d.sp = 0.04; d.t = rand(200, 500); d.nerve = 0;
        duckSplash(d, 14, true);
        SFX.duckWater(true);
        grebeCall(d, 1);
      }
    }
    const [sx] = screenDir(Math.cos(d.a), Math.sin(d.a));
    if (Math.abs(sx) > 0.15) d.flip = sx < 0;
  }
}

// Sukelluksen vaiheet (ruutua, 60 = 1 s): 0-15 pää taipuu (dip1), 15-30 pää veden alla ja peräpää ylhäällä (dip2), 30-60 uppoaa, sitten piilossa;
// pinnalle noustessa viimeiset 60 ruutua kuva nousee tasaisesti vedestä
const DIVE_SINK = 60, SURF = 60;
function grebeDiveFrame(d) {
  // Nousu: pää ilmestyy ensin, kaula ja vartalo kohoavat perässä (hidastuva liike)
  if (d.dive > d.t - SURF) return [GREBE_SPR.swim, clamp((d.t - d.dive) / SURF, 0, 1)];   // nousee tasaisesti pinnan alta uintikorkeuteen (1 s)
  if (d.dive < 15) return [GREBE_SPR.dip1, 0];
  if (d.dive < 30) return [GREBE_SPR.dip2, 0];
  return [GREBE_SPR.dip2, clamp((d.dive - 30) / (DIVE_SINK - 30), 0, 1)];
}
function drawGrebe(d, sx, sy) {
  sx = Math.round(sx); sy = Math.round(sy);
  if (d.mode === 'dive' && d.hidden) return;
  if (d.z > 0.5) {
    // Lentävä uikku: varjo veden tai maan pinnalla
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.05, 0.3 - d.z * 0.004).toFixed(3)})`;
    ctx.fillRect(sx - 4, sy, 9, 1);
    const fi = Math.floor(d.anim / 3) % 2 ? GREBE_SPR.fly0 : GREBE_SPR.fly1;
    drawImg(fi, sx - 8, sy - Math.round(d.z) - 3 - fi.body, d.flip);
    return;
  }
  const img = d.mode === 'sleep' ? GREBE_SPR.sleep : GREBE_SPR.swim, bob = Math.round(Math.sin(d.anim * (d.mode === 'sleep' ? 0.03 : 0.06)) * 0.5);
  if (d.mode === 'dive') {
    // Uppoaa ja nousee: kuvasta näkyy vain vedenpinnan yläpuolinen osa
    const [di, k] = grebeDiveFrame(d);
    ctx.save();
    ctx.beginPath(); ctx.rect(sx - 8, sy - 12, 18, 12 + 1); ctx.clip();
    drawImg(di, sx - 4, sy - di.height + 1 + Math.round(k * di.height), d.flip);
    ctx.restore();
    return;
  }
  drawImg(img, sx - 4, sy - img.height + 1 + bob, d.flip);
  ctx.fillStyle = `rgba(${env.ring}, 0.35)`;
  ctx.fillRect(sx - 4, sy + 1, 7, 1);
}

function drawGrebeReflection(d, camXr, camYr) {
  if (d.mode === 'dive' && d.hidden) return;
  const sx = Math.round(isoX(d.x, d.y) - camXr), sy = Math.round(isoY(d.x, d.y) - camYr);
  if (sx < -12 || sx > W + 12 || sy < -4 || sy > H + 40 || !waterPx(sx + camXr, sy + camYr)) return;
  const flying = d.z > 0.5;
  const img = flying ? (Math.floor(d.anim / 3) % 2 ? GREBE_SPR.fly0 : GREBE_SPR.fly1) : d.mode === 'dive' ? grebeDiveFrame(d)[0] : d.mode === 'sleep' ? GREBE_SPR.sleep : GREBE_SPR.swim;
  const top = flying ? sy - Math.round(d.z) - 3 - img.body : sy - img.height + 1;
  const ox = flying ? sx - 8 : sx - 4, mirrorTop = 2 * (sy + 1) - (top + img.height);
  const g = reflCtxAll;
  g.save();
  g.globalAlpha = flying ? Math.max(0, 1 - d.z / 24) : 1;
  g.translate(ox + (d.flip ? img.width : 0), mirrorTop + img.height); g.scale(d.flip ? -1 : 1, -1);
  g.drawImage(img, 0, 0);
  g.restore();
}

// ---------------------------------------------------------------------------
// Norppa (saimaannorppa): lepää pelin alussa laiturin nokassa naama oikealle. Jos pelaaja tulee lähelle, se
// hypähtelee makuultaan laiturin nokkaan ja pyörähtää veteen (läsähdys ja pyöreät aallot); se voi myös lähteä
// uimaan ilman syytä. Vedessä se uiskentelee veden alla ja tulee välillä pinnalle hengittämään, jolloin vain
// pää näkyy. Kun pelaaja ei ole lähellä, se voi nousta takaisin laiturin nokkaan (hypähtää laiturille), mutta
// ei koskaan maalle. Tilat: rest (lepää), hop (hypähtelee laiturilla), roll (pyörähtää veteen), swim (uiskentelee
// veden alla), surf (pää pinnalla), haul (hypähtää takaisin laiturille).
// ---------------------------------------------------------------------------
const SEAL_PAL = { k: '#14181c', d: '#262c32', m: '#38414a', g: '#535d66', r: '#7a838b', l: '#9aa2a8', w: '#d8dde0', f: '#1c2126' };
function sealCanvas(w, h, pts, rings, extra) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  polyFill(g, pts, SEAL_PAL.m);
  // Selkä tummempi, vatsa vaaleampi: sävy lasketaan sarakkeen ylä- ja alareunasta
  const d = g.getImageData(0, 0, w, h).data, top = [], bot = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3]) { if (top[x] === undefined) top[x] = y; bot[x] = y; }
  for (let x = 0; x < w; x++) {
    if (top[x] === undefined) continue;
    g.fillStyle = SEAL_PAL.d; g.fillRect(x, top[x], 1, Math.min(2, bot[x] - top[x] + 1));
    g.fillStyle = SEAL_PAL.g; g.fillRect(x, bot[x], 1, 1);
  }
  g.fillStyle = SEAL_PAL.r;
  for (const [x, y] of rings) g.fillRect(x, y, 1, 1);
  for (const [x, y, ch] of extra) { g.fillStyle = SEAL_PAL[ch]; g.fillRect(x, y, 1, 1); }
  return c;
}
const SEAL_SPR = (() => {
  // Makaava norppa (22 x 10), naama oikealle: häntäevät vasemmalla, selkä kaartuu, kaula painuu ja pää on kohotettuna.
  // Monikulmion reunan x on pikselin vasen reuna, joten oikeanpuoleisin pikselisarake (21) vaatii x = 22.
  const rest = sealCanvas(22, 10,
    [[0, 9], [0, 8], [2, 7], [4, 5], [7, 3], [10, 2], [13, 2], [15, 2], [16, 1], [18, 0], [20, 0], [22, 1], [22, 4], [21, 5], [19, 6], [17, 7], [17, 10], [0, 10]],
    [[5, 6], [6, 5], [7, 6], [9, 4], [10, 4], [11, 5], [12, 4], [13, 5], [8, 7], [10, 7], [3, 8], [12, 7], [14, 7], [6, 8], [15, 6], [16, 4], [14, 4]],
    [[16, 3, 'l'], [16, 2, 'r'], [17, 2, 'g'], [17, 3, 'r'], [17, 4, 'l'], [16, 5, 'r'], [18, 3, 'g'], [19, 3, 'g'], [19, 2, 'k'], [20, 2, 'g'], [21, 2, 'k'], [20, 3, 'l'], [21, 3, 'l'], [18, 4, 'l'], [19, 4, 'l'], [20, 4, 'l'], [21, 4, 'w'], [20, 5, 'w'], [19, 5, 'l'], [1, 9, 'f'], [0, 9, 'f'], [2, 9, 'f'], [15, 8, 'f'], [16, 8, 'f']]);
  // Veden alla uiva norppa (20 x 7) kahdella pyrstön asennolla
  const swimPts = [[0, 3], [2, 2], [5, 1], [9, 0], [13, 1], [16, 2], [19, 3], [16, 4], [13, 5], [9, 6], [5, 5], [2, 4]];
  const swimRings = [[6, 2], [9, 2], [12, 3], [8, 4], [11, 4]];
  const swim = [0, 1].map((k) => sealCanvas(20, 7, swimPts, swimRings, [[k ? 0 : 1, k ? 1 : 5, 'f'], [k ? 0 : 1, k ? 5 : 1, 'f'], [10, 6, 'f'], [17, 2, 'k']]));
  // Pää veden pinnalla (9 x 8): kupera pää, kaksi silmää, tumma nenä, vaalea kuono ja viikset
  const head = sealCanvas(9, 8, [[1, 8], [0, 5], [1, 2], [3, 0], [6, 0], [8, 2], [9, 5], [8, 8]], [[3, 1], [5, 1]],
    [[2, 3, 'k'], [6, 3, 'k'], [2, 2, 'g'], [6, 2, 'g'], [4, 4, 'g'], [3, 5, 'l'], [5, 5, 'l'], [4, 5, 'k'], [3, 6, 'l'], [4, 6, 'l'], [5, 6, 'l'], [0, 6, 'w'], [1, 6, 'w'], [7, 6, 'w'], [8, 6, 'w'], [0, 5, 'w'], [8, 5, 'w']]);
  // Pää edellä sukellus: laiturin reunalla taipunut norppa (22 x 14, selkä kaarella, pää alhaalla oikealla) ja pystyssä veteen
  // painuva norppa (12 x 20, pää alaspäin, takaevät ylhäällä)
  const bend = sealCanvas(22, 14,
    [[0, 13], [0, 11], [2, 9], [4, 6], [7, 3], [10, 1], [13, 0], [16, 0], [18, 1], [20, 3], [21, 6], [22, 9], [22, 12], [21, 14], [19, 14], [18, 11], [17, 8], [15, 7], [12, 7], [9, 8], [6, 10], [3, 12], [1, 14], [0, 14]],
    [[8, 3], [11, 2], [14, 2], [16, 3], [12, 4], [9, 5], [15, 5], [5, 7], [18, 5]],
    [[0, 12, 'f'], [1, 12, 'f'], [0, 11, 'f'], [19, 11, 'k'], [21, 13, 'k'], [20, 13, 'l'], [20, 12, 'l'], [21, 11, 'w'], [19, 13, 'w'], [18, 12, 'g']]);
  const plunge = sealCanvas(12, 20,
    [[2, 0], [4, 1], [6, 0], [8, 1], [10, 0], [10, 2], [9, 5], [10, 10], [10, 15], [8, 19], [6, 20], [4, 19], [2, 15], [2, 10], [3, 5], [2, 2]],
    [[4, 6], [7, 8], [5, 11], [8, 12], [6, 3]],
    [[3, 0, 'f'], [9, 0, 'f'], [4, 17, 'k'], [8, 17, 'k'], [6, 19, 'k'], [5, 18, 'l'], [7, 18, 'l'], [3, 18, 'w'], [9, 18, 'w']]);
  return { rest, swim, head, bend, plunge };
})();

let seal = null;
const dockPt = (t, s) => [dock.x0 + dock.ux * t + dock.px * s, dock.y0 + dock.uy * t + dock.py * s];
const SEAL_T = DOCK_LEN - 1.0;   // lepopaikka laiturin nokassa (etäisyys rannasta)
const sealFree = (x, y) => shoreDist(x, y) < -1.2 && depthAt(x, y) > 0.4 && !onDock(x, y, 0.6) && !waterRocks.some((r) => Math.hypot(r.x - x, r.y - y) < 0.9);
const sealFace = (a) => (screenDir(Math.cos(a), Math.sin(a))[0] >= 0 ? 1 : -1);

function makeSeal() {
  const [x, y] = dockPt(SEAL_T, 0);
  return { st: 'rest', x, y, t: SEAL_T, z: 0, a: 0, face: 1, anim: 0, timer: 0, hopT: rand(1500, 3500), leaveT: rand(4000, 10000),
    target: SEAL_T, flee: false, from: null, to: null, tx: x, ty: y, tz: 1.2, swimT: 0, waterT: 0, haulAfter: 0, haul: false, lookT: 0 };
}

function sealSplash(S, n, big) {
  duckSplash(S, n, big);   // roiskeet ja renkaat
  ripples.push({ x: S.x, y: S.y, t: -9, life: 75, max: big ? 12 : 8, a: 0.6 }, { x: S.x, y: S.y, t: -18, life: 75, max: big ? 15 : 10, a: 0.42 });
  SFX.sealSplash(big ? 1 : 0.5);
}

const SEAL_BREATH_T = 40 * 60;   // yöunen aikana norppa nousee hengittämään 40 s välein
const SEAL_HEAD_T = 60;   // pään nousu ja lasku pinnalla (ruutua = 1,0 s)
const SEAL_BEND = 12, SEAL_TOUCH = 26, SEAL_ROLL = 34;   // sukelluksen vaiheet (ruutua)
function startSealRoll(S) {
  // Pyörähtää laiturin sivulta veteen (venettä vastapäiseltä puolelta), tai nokan yli
  const bs = boat ? Math.sign(dockLocal(boat.x, boat.y)[1]) || 1 : 1;
  let to = dockPt(S.t, -bs * (DOCK_W / 2 + 0.9));
  if (shoreDist(to[0], to[1]) > -0.3) to = dockPt(DOCK_LEN + 1.0, 0);
  S.st = 'roll'; S.timer = 0; S.from = [S.x, S.y]; S.to = to;
}
function startSealHop(S, t, flee) {
  S.st = 'hop'; S.target = t; S.flee = flee; S.timer = 0;
  S.face = (t >= S.t ? 1 : -1) * (screenDir(dock.ux, dock.uy)[0] >= 0 ? 1 : -1);
}
function newSealTarget(S) {
  for (let k = 0; k < 30; k++) {
    const a = rand(0, Math.PI * 2), r = rand(3, POND_R * 0.75);
    const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    if (sealFree(x, y) && depthAt(x, y) > 1.0) { S.tx = x; S.ty = y; return; }
  }
}
function sealDive(S) {
  if (phaseName === 'NIGHT') { S.st = 'nap'; S.z = 0.25; S.breathT = SEAL_BREATH_T; S.napCool = 0; }   // yöllä palataan nukkumaan pohjan lähelle
  else { S.st = 'swim'; S.z = 0.25; S.swimT = rand(1200, 3000); newSealTarget(S); }
  ripples.push({ x: S.x, y: S.y, t: 0, life: 45, max: 5, a: 0.6 });
  SFX.duckWater(false, 0.5);
}

function updateSeal() {
  const S = seal, p = player;
  if (!S) return;
  S.anim++;
  const dp = Math.hypot(p.x - S.x, p.y - S.y), [pt] = dockLocal(p.x, p.y);
  const night = phaseName === 'NIGHT';
  // Yöllä norppa ei ole laiturilla: laiturilla lepäävä norppa pyörähtää veteen illan tullen
  if (night && (S.st === 'rest' || S.st === 'hop')) { startSealRoll(S); return; }
  if (S.st === 'rest') {
    [S.x, S.y] = dockPt(S.t, 0);
    if (dp < 2.4) startSealRoll(S);
    else if (dp < 5.2) {
      // Pelaaja lähestyy rannan puolelta: hypähtele nokkaan ja pyörähdä veteen
      if (S.t < DOCK_LEN - 0.55 && pt < S.t) startSealHop(S, DOCK_LEN - 0.5, true); else if (dp < 3.6) startSealRoll(S);
    } else {
      if (--S.leaveT <= 0) startSealRoll(S);                       // lähtee uimaan omia aikojaan
      else if (--S.hopT <= 0) {                                    // pieni hypähdys laiturilla
        S.hopT = rand(1500, 3500);
        const t = rand(DOCK_LEN - 3.2, DOCK_LEN - 0.7);
        if (Math.abs(t - S.t) > 0.4) startSealHop(S, t, false);
      }
    }
  } else if (S.st === 'hop') {
    // Makuultaan hypähtelevä liike: jokainen hypähdys (26 päivitystä) siirtää 0,42 m ja päättyy tömähdykseen
    const HOP = 26, dir = S.target >= S.t ? 1 : -1;
    if (dp < 2.4) { startSealRoll(S); return; }
    if (S.timer < 18) S.t = clamp(S.t + dir * (0.42 / 18), 0, DOCK_LEN - 0.35);
    [S.x, S.y] = dockPt(S.t, 0);
    if (++S.timer >= HOP) {
      S.timer = 0; SFX.thud();
      if (Math.abs(S.target - S.t) < 0.25 || (dir > 0 ? S.t >= S.target : S.t <= S.target)) {
        if (S.flee) startSealRoll(S); else S.st = 'rest';
      }
    }
  } else if (S.st === 'roll') {
    // Pää edellä sukellus: 0-12 taipuu laiturin reunalla, 12-26 putoaa pää edellä veteen (roiske pään osuessa veteen), 26-34 painuu pinnan alle
    ++S.timer;
    const w = Math.min(1, S.timer / SEAL_TOUCH);
    S.x = lerp(S.from[0], S.to[0], w * w); S.y = lerp(S.from[1], S.to[1], w * w);
    if (S.timer === SEAL_TOUCH) sealSplash(S, 12, true);
    if (S.timer >= SEAL_ROLL) {
      S.x = S.to[0]; S.y = S.to[1]; S.st = 'swim'; S.z = 0.2; S.swimT = rand(1200, 3000); S.waterT = 0;
      S.haulAfter = rand(3600, 9000); S.haul = false; newSealTarget(S); S.a = Math.atan2(S.ty - S.y, S.tx - S.x);
    }
  } else if (S.st === 'swim') {
    S.waterT++; S.swimT--;
    // Takaisin laiturille vain kun pelaaja ei ole lähellä nokkaa
    const [hx, hy] = dockPt(DOCK_LEN + 1.0, 0), dTip = Math.hypot(p.x - hx, p.y - hy);
    if (!S.haul && S.waterT > S.haulAfter && dTip > 9 && !night) S.haul = true;
    if (night) S.haul = false;
    if (S.haul && dTip < 6) S.haul = false;
    // Yöllä uidaan syvään veteen (ei laiturin lähelle) ja vaivutaan uneen pohjan lähelle
    if (night && !S.haul && (S.napCool || 0) <= 0 && S.waterT > 60) {
      if (!S.napSpot) { newSealTarget(S); S.napSpot = [S.tx, S.ty]; }
      S.tx = S.napSpot[0]; S.ty = S.napSpot[1];
      if (Math.hypot(S.tx - S.x, S.ty - S.y) < 1.0) { S.st = 'nap'; S.napSpot = null; S.breathT = SEAL_BREATH_T; return; }
    }
    if (S.napCool > 0) S.napCool--;
    const tx = S.haul ? hx : S.tx, ty = S.haul ? hy : S.ty;
    S.a += angDiff(S.a, Math.atan2(ty - S.y, tx - S.x)) * 0.05;
    const v = 0.03, nx = S.x + Math.cos(S.a) * v, ny = S.y + Math.sin(S.a) * v;
    if (sealFree(nx, ny) || (S.haul && Math.hypot(nx - hx, ny - hy) < 2.5 && shoreDist(nx, ny) < -0.3)) { S.x = nx; S.y = ny; }
    else { S.a += (Math.random() < 0.5 ? -1 : 1) * rand(0.8, 1.8); newSealTarget(S); }
    S.face = sealFace(S.a);
    S.tz = clamp(1.2 + Math.sin(S.anim * 0.01) * 0.6, 0.4, Math.max(0.2, depthAt(S.x, S.y) - 0.25));
    S.z += clamp(S.tz - S.z, -0.012, 0.012);
    if (Math.hypot(S.tx - S.x, S.ty - S.y) < 0.8 && !S.haul) newSealTarget(S);
    if (S.haul && Math.hypot(hx - S.x, hy - S.y) < 0.7) {
      S.st = 'haul'; S.timer = 0; S.from = [S.x, S.y]; S.to = dockPt(SEAL_T, 0); S.face = screenDir(dock.ux, dock.uy)[0] >= 0 ? 1 : -1;
      sealSplash(S, 6, false);
    } else if (S.swimT <= 0 && !S.haul && depthAt(S.x, S.y) > 0.6) {
      // Pinnalle hengittämään: pelkkä pää näkyy
      S.st = 'surf'; S.timer = rand(150, 290); S.lookT = rand(50, 100); S.z = 0; S.surfAge = 0; S.sinkT = 0;
      ripples.push({ x: S.x, y: S.y, t: 0, life: 50, max: 4.5, a: 0.55 }, { x: S.x, y: S.y, t: -10, life: 50, max: 7, a: 0.35 });
      SFX.sealBreath();
    }
  } else if (S.st === 'surf') {
    S.timer--;
    S.x += Math.cos(S.a) * 0.004; S.y += Math.sin(S.a) * 0.004;
    if (--S.lookT <= 0) { S.face = -S.face; S.lookT = rand(60, 120); }
    S.surfAge++;
    // Pää nousee pinnan yläpuolelle 1,0 s aikana (surfAge) ja painuu hitaasti veden alle 1,0 s aikana ennen sukellusta (sinkT)
    if (!S.sinkT && (dp < 2.4 || S.timer <= 0) && S.surfAge >= SEAL_HEAD_T) S.sinkT = SEAL_HEAD_T;
    if (S.sinkT && --S.sinkT <= 0) sealDive(S);
  } else if (S.st === 'nap') {
    // Uni pohjan lähellä: paikallaan, hengitys 40 s välein (nousu pintaan); aamulla herää päivätoimintaan, lähellä oleva pelaaja herättää
    S.napSpot = null;
    S.z += clamp(Math.max(0.3, depthAt(S.x, S.y) - 0.3) - S.z, -0.01, 0.01);
    if (!night) { S.st = 'swim'; S.swimT = rand(600, 1500); S.waterT = 0; S.haul = false; newSealTarget(S); S.a = Math.atan2(S.ty - S.y, S.tx - S.x); }
    else if (dp < 2.4) { S.st = 'swim'; S.napCool = 1200; S.swimT = rand(400, 900); S.waterT = 0; newSealTarget(S); S.a = Math.atan2(S.ty - S.y, S.tx - S.x); }
    else if (--S.breathT <= 0) {
      S.st = 'surf'; S.timer = rand(90, 140); S.lookT = rand(50, 100); S.surfAge = 0; S.sinkT = 0;
      ripples.push({ x: S.x, y: S.y, t: 0, life: 50, max: 4.5, a: 0.55 }, { x: S.x, y: S.y, t: -10, life: 50, max: 7, a: 0.35 });
      SFX.sealBreath();
    }
  } else if (S.st === 'haul') {
    const u = ++S.timer / 18;
    S.x = lerp(S.from[0], S.to[0], u); S.y = lerp(S.from[1], S.to[1], u);
    if (u >= 1) {
      S.st = 'rest'; S.t = SEAL_T; S.leaveT = rand(4000, 10000); S.hopT = rand(1500, 3500);
      [S.x, S.y] = dockPt(S.t, 0); SFX.thud();
    }
  }
}

// Norppa laiturilla, lentoradalla tai pinnalla pää esillä (syvyyslajitellussa listassa)
const sealShown = () => seal && (seal.st === 'rest' || seal.st === 'hop' || seal.st === 'roll' || seal.st === 'haul' || seal.st === 'surf');
function drawSeal(camXr, camYr) {
  const S = seal, sx = Math.round(isoX(S.x, S.y) - camXr), sy = isoY(S.x, S.y) - camYr;
  if (S.st === 'surf') {
    // Pää veden pinnalla pieni keinunta mukana; pinnan rengas ja tumma heijastus pään alla
    const bob = Math.round(Math.sin(S.anim * 0.05) * 0.6), y = Math.round(sy);
    ctx.fillStyle = 'rgba(8, 14, 18, 0.35)'; ctx.fillRect(sx - 3, y + 1, 7, 1);
    ctx.fillStyle = `rgba(${env.ring}, 0.5)`; ctx.fillRect(sx - 4, y, 9, 1);
    const hk = S.sinkT ? S.sinkT / SEAL_HEAD_T : clamp(S.surfAge / SEAL_HEAD_T, 0, 1);   // pään korkeus: 0 = veden alla, 1 = täysin pinnalla
    ctx.save(); ctx.beginPath(); ctx.rect(sx - 6, y - 9, 13, 9 + bob); ctx.clip();
    drawImg(SEAL_SPR.head, sx - 4, y - 7 + bob + Math.round((1 - hk) * 8), S.face < 0);
    ctx.restore();
    return;
  }
  const img = SEAL_SPR.rest, flip = S.face < 0;
  if (S.st === 'roll') {
    // Sukellus pää edellä: ensin taipuu laiturin reunalla (bend), sitten putoaa pystyssä pää alaspäin (plunge) ja painuu veteen
    if (S.timer < SEAL_BEND) {
      const b = SEAL_SPR.bend;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(sx - 9, Math.round(sy - DOCK_Z) - 1, 19, 2);
      drawImg(b, sx - (b.width >> 1), Math.round(sy - DOCK_Z) - b.height + 2, flip);
      return;
    }
    const pl = SEAL_SPR.plunge, v = clamp((S.timer - SEAL_BEND) / (SEAL_TOUCH - SEAL_BEND), 0, 1);
    const sink = clamp((S.timer - SEAL_TOUCH) / (SEAL_ROLL - SEAL_TOUCH), 0, 1);
    const lift = DOCK_Z * (1 - v * v);
    ctx.save();
    ctx.beginPath(); ctx.rect(sx - 16, sy - 60, 32, 60 + 1); ctx.clip();   // vedenpinnan alapuolinen osa piiloon
    drawImg(pl, sx - (pl.width >> 1), Math.round(sy - lift) - pl.height + 2 + Math.round(sink * pl.height), flip);
    ctx.restore();
    return;
  }
  if (S.st === 'haul') {
    // Hyppy laiturille: lähtö- ja tulopisteen välillä kaarella, kuva kallistuu
    const u = S.st === 'roll' ? Math.min(1, S.timer / 22) : Math.min(1, S.timer / 18);
    const lift = S.st === 'roll' ? DOCK_Z * (1 - u * u) : DOCK_Z * u - Math.sin(Math.PI * u) * 4;
    const side = Math.sign(isoX(S.to[0], S.to[1]) - isoX(S.from[0], S.from[1])) || 1;
    ctx.save();
    ctx.translate(sx, Math.round(sy - lift));
    ctx.rotate((S.st === 'roll' ? u * u : 1 - u) * 1.1 * side);
    drawImg(img, -(img.width >> 1), -img.height + 2, flip);
    ctx.restore();
    return;
  }
  // Laiturilla makaava norppa: varjo ja kuva; hypähdyksessä kuva nousee kaarella
  const arc = S.st === 'hop' ? Math.round(Math.sin(Math.PI * Math.min(1, S.timer / 18)) * 3) : 0;
  const base = Math.round(sy - DOCK_Z);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(sx - 9, base - 1, 19, 2);
  drawImg(img, sx - (img.width >> 1), base - img.height + 1 - arc, flip);
}

// Veden alla uiva norppa (tumma hahmo, häivytys syvyyden mukaan); pinnalla olevan pään alla näkyy vaalea vartalo
function drawSealUnder(g, camXr, camYr) {
  const S = seal;
  if (!S || (S.st !== 'swim' && S.st !== 'surf' && S.st !== 'nap')) return;
  const x = Math.round(isoX(S.x, S.y) - camXr), z = S.st === 'surf' ? 0.5 : S.z, y = Math.round(isoY(S.x, S.y) - camYr + z * Z_PX);
  if (x < -14 || x > W + 14 || y < -10 || y > H + 20) return;
  g.globalAlpha = underVis(z) * (S.st === 'surf' ? 0.8 : 0.95);
  drawImg(SEAL_SPR.swim[S.st === 'nap' ? 0 : (S.anim >> 3) % 2], x - 10, y - 3, S.face < 0);
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Metsän pikkueläimet: kurkkivat metsän laidasta ja uskaltautuvat välillä penkereelle.
// Liian lähelle tuleva pelaaja säikäyttää ne karkuun; paikallaan pysyvän pelaajan luo ne tulevat lähemmäs.
// ---------------------------------------------------------------------------
const playerAng = () => Math.atan2(player.y - C, player.x - C);
// Päivällä liikkuvat eläimet; yöllä metsän eläimet nukkuvat (tänne voi myöhemmin lisätä yöeläimiä)
const ANIMAL_KINDS = { day: ['squirrel', 'squirrel', 'hare', 'mouse'], night: [] };

function spawnAnimal() {
  const kinds = ANIMAL_KINDS[phaseName === 'NIGHT' ? 'night' : 'day'];
  if (!kinds.length) return;
  for (let tries = 0; tries < 60; tries++) {
    const ang = playerAng() + rand(-0.7, 0.7);
    const r = pondR(ang) + bankW(ang) + rand(1.2, 4.5);
    const x = C + Math.cos(ang) * r, y = C + Math.sin(ang) * r;
    if (type[cellIdx(x, y)] !== T_FOREST) continue;
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < 7 || d > 18) continue;
    animals.push({ kind: pick(kinds), x, y, mode: 'lurk', t: rand(120, 600), anim: 0, flip: Math.random() < 0.5, moving: false, tx: x, ty: y, altT: 0, alt: false });
    return;
  }
}

// Kohde penkereeltä eläimen läheltä. Paikallaan pysyvä pelaaja houkuttelee kohteen lähemmäs itseään.
function bankTarget(a) {
  const pa = playerAng();
  const calm = clamp((player.stillT - 120) / 900, 0, 1);
  let ang = Math.atan2(a.y - C, a.x - C) + rand(-0.12, 0.12);
  ang += angDiff(ang, pa) * calm * rand(0.3, 0.85);
  const minD = (6 - calm * 4.3) * ANIMAL[a.kind].shy;
  const away = angDiff(pa, ang) >= 0 ? 1 : -1;
  for (let k = 0; k < 60; k++) {
    const r = pondR(ang) + clamp(rand(0.6, bankW(ang) - 0.2), 0.6, 4);
    const x = C + Math.cos(ang) * r, y = C + Math.sin(ang) * r;
    if (Math.hypot(x - player.x, y - player.y) >= minD) {
      const t = type[cellIdx(x, y)];
      if (t === T_BANK || t === T_CLEAR) return [x, y];
    }
    ang += away * 0.02;
  }
  return null;
}

function forestTarget(a, deep) {
  const out = Math.atan2(a.y - C, a.x - C);
  const flee = Math.atan2(a.y - player.y, a.x - player.x);
  const ang = deep ? out + angDiff(out, flee) * 0.4 : out + rand(-0.15, 0.15);
  const r = Math.hypot(a.x - C, a.y - C) + (deep ? rand(5, 8) : rand(2.5, 4.5));
  return [C + Math.cos(ang) * r, C + Math.sin(ang) * r];
}

function updateAnimals() {
  const p = player;
  if (--animalT <= 0) {
    animalT = rand(800, 2200);
    if (animals.length < 2) spawnAnimal();
  }
  const scare = p.moving ? 4.6 : Math.max(1.3, 3.2 - p.stillT / 400);
  const night = phaseName === 'NIGHT';
  for (const a of animals) {
    const A = ANIMAL[a.kind], d = Math.hypot(a.x - p.x, a.y - p.y);
    // Illan pimetessä eläimet palaavat metsään nukkumaan
    if (night && !ANIMAL_KINDS.night.includes(a.kind) && a.mode !== 'flee' && a.mode !== 'home') {
      a.mode = 'home'; [a.tx, a.ty] = forestTarget(a, true); a.moving = true;
    }
    if (a.mode !== 'flee' && d < scare * A.shy) {
      a.mode = 'flee';
      [a.tx, a.ty] = forestTarget(a, true);
      if (d < 9) SFX.rustle();
    }
    let speed = A.walk;
    switch (a.mode) {
      case 'lurk':
        // Kuljeskelee metsän laidassa ja päättää välillä lähteä penkereelle
        if (!a.moving && Math.random() < 0.006) { [a.tx, a.ty] = forestTarget(a, false); a.tx += rand(-1.5, 1.5); a.ty += rand(-1.5, 1.5); a.moving = true; }
        if (--a.t <= 0) {
          if (d > 24) { a.gone = true; break; }
          const tg = Math.random() < 0.7 ? bankTarget(a) : null;
          if (tg) { [a.tx, a.ty] = tg; a.mode = 'approach'; a.moving = true; }
          else a.t = rand(200, 600);
        }
        break;
      case 'approach':
        if (!a.moving) { a.mode = 'forage'; a.t = rand(300, 900); }
        break;
      case 'forage':
        // Syö ja tähyilee; joskus siirtyy hieman tai uskaltautuu lähemmäs paikallaan pysyvää pelaajaa
        if (--a.altT <= 0) { a.alt = !a.alt; a.altT = rand(20, 120); }
        if (!a.moving && Math.random() < 0.004) {
          const tg = p.stillT > 300 && Math.random() < 0.6 ? bankTarget(a) : [a.x + rand(-0.7, 0.7), a.y + rand(-0.7, 0.7)];
          if (tg && shoreDist(tg[0], tg[1]) > 0.3 && forestDist(tg[0], tg[1]) < 0.5) { [a.tx, a.ty] = tg; a.moving = true; }
        }
        if (--a.t <= 0) { a.mode = 'leave'; [a.tx, a.ty] = forestTarget(a, false); a.moving = true; }
        break;
      case 'leave':
        if (!a.moving) { a.mode = 'lurk'; a.t = rand(400, 1200); }
        break;
      case 'flee':
        speed = A.run;
        a.moving = true;
        if (Math.hypot(a.tx - a.x, a.ty - a.y) < 0.2) { a.mode = 'lurk'; a.t = rand(900, 2000); a.moving = false; if (d > 14 || night) a.gone = true; }
        break;
      case 'home':
        if (!a.moving) a.gone = true;
        break;
    }
    if (a.moving) {
      const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy);
      if (dist <= speed) { a.x = a.tx; a.y = a.ty; if (a.mode !== 'flee') a.moving = false; }
      else {
        const nx = a.x + (dx / dist) * speed, ny = a.y + (dy / dist) * speed;
        // Metsässä saa kulkea; teltta, nuotio ja liiteri ovat esteitä
        const ct = type[cellIdx(nx, ny)];
        if (shoreDist(nx, ny) > 0.15 && (ct === T_FOREST || !playerSolid(ct))) { a.x = nx; a.y = ny; }
        else { a.tx = a.x; a.ty = a.y; a.moving = false; }
      }
      const [sx] = screenDir(dx, dy);
      if (Math.abs(sx) > 0.1) a.flip = sx < 0;
      a.anim++;
    }
    if (d > 30) a.gone = true;
  }
  animals = animals.filter((a) => !a.gone);
}

function drawAnimal(a, sx, sy) {
  const A = ANIMAL[a.kind];
  sx = Math.round(sx); sy = Math.round(sy);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(sx - (A.w >> 1) + 1, sy, A.w - 2, 1);
  let img, hop = 0;
  if (a.moving) {
    const ph = a.anim * (a.mode === 'flee' ? 0.32 : 0.22);
    img = Math.sin(ph) > 0 ? A.spr.walk0 : A.spr.walk1;
    hop = Math.round(Math.abs(Math.sin(ph)) * A.hop);
  } else img = a.alt ? A.spr.idle1 : A.spr.idle0;
  drawImg(img, sx - (A.w >> 1), sy - A.h + 1 - hop, a.flip);
}

// ---------------------------------------------------------------------------
// Taivaalla lentävät linnut ja metsän linnunlaulu
// ---------------------------------------------------------------------------
function spawnSkyBirds() {
  const r = Math.random();
  const kind = r < 0.5 ? 'small' : r < 0.75 ? 'crow' : 'gull';
  const fromLeft = Math.random() < 0.5, dir = fromLeft ? 1 : -1;
  const x0 = cam.x + (fromLeft ? -24 : W + 24), y0 = cam.y + rand(12, H * 0.55);
  const vx = dir * (kind === 'small' ? rand(0.6, 0.9) : rand(0.4, 0.6)), vy = rand(-0.12, 0.12);
  const n = kind === 'small' ? 3 + Math.floor(rand(0, 6)) : kind === 'gull' ? 1 + Math.floor(rand(0, 3)) : 1;
  for (let k = 0; k < n; k++) {
    skyBirds.push({ kind, x: x0 - dir * k * rand(5, 10), y: y0 + rand(-8, 8), vx: vx + rand(-0.05, 0.05), vy, ph: Math.floor(rand(0, 20)), life: 1400 });
  }
  if (kind === 'crow') setTimeout(() => sing('crow', fromLeft ? -0.7 : 0.7, 0.8, 5000), 1200);
  if (kind === 'gull') setTimeout(() => sing('gull', fromLeft ? -0.6 : 0.6, 0.7, 6000), 900);
}

let cuckooT = 0;   // aikaisin milloin käki saa taas kukkua (time)
function updateBirds() {
  if (--skyBirdT <= 0) {
    skyBirdT = rand(900, 2400);
    if (phaseName !== 'NIGHT' && env.dark < 0.5 && weather.rain < 0.8) spawnSkyBirds();
  }
  for (const b of skyBirds) {
    b.life--;
    b.x += b.vx + wind.sx * wind.gust * 0.15;
    b.y += b.vy + Math.sin((time + b.ph * 7) * 0.05) * 0.08;
  }
  skyBirds = skyBirds.filter((b) => b.life > 0);

  // Linnunlaulu: aamulla vilkkainta, yöllä vain huuhkaja. Sade hiljentää metsän.
  if (--birdT <= 0) {
    const ph = phaseName;
    const base = ph === 'MORNING' ? [90, 300] : ph === 'DAY' ? [200, 600] : ph === 'EVENING' ? [180, 520] : [900, 2000];
    birdT = rand(base[0], base[1]) * (1 + weather.rain * 2.5);
    if (state !== 'play') return;
    let song;
    if (ph === 'NIGHT') song = Math.random() < 0.6 ? 'owl' : null;
    else {
      const pool = ['chaffinch', 'chaffinch', 'tit', 'tit', 'thrush', 'thrush'];
      // Käki kukkuu vain yksi kerrallaan ja harvoin (kutsu kestää enintään ~12 s, sen jälkeen tauko 1,5-4 min)
      if (ph !== 'DAY' && time >= cuckooT) pool.push('cuckoo');
      song = pick(pool);
      if (song === 'cuckoo') cuckooT = time + 60 * 12 + rand(5400, 14400);
    }
    // Käen ääni on puolet muiden lintujen voimakkuudesta
    if (song) sing(song, rand(-0.9, 0.9), rand(0.35, 0.9) * (song === 'cuckoo' ? 0.5 : 1), rand(3500, 9000));
  }
}

// Taivaan linnut lentävät siivet levällään: kumpikin siipi on taitettu "kyynärpäästä" (M-muoto), ja
// siivenisku nostaa ja laskee kyynärpäätä ja siivenkärkeä vuorotellen. Vartalo on pieni ja pää osoittaa
// lentosuuntaan. Pikkulintu (tumma, vaalea vatsa), varis (musta, leveät siivet ja harottavat kärkisulat)
// ja lokki (valkoinen, harmaat siivet, mustat kärjet ja keltainen nokka).
const BIRD_LOOK = {
  small: { span: 4, col: '#262a34', wing: '#2e323c', tip: '#262a34', belly: '#d8d4c8', beak: '#4a4038', rate: 4, thick: 0 },
  crow: { span: 6, col: '#121216', wing: '#18181e', tip: '#121216', belly: null, beak: '#2e2e30', rate: 8, thick: 2 },
  gull: { span: 7, col: '#f2f4f4', wing: '#c8cfd4', tip: '#26282c', belly: null, beak: '#e8b830', rate: 9, thick: 1 },
};
// Siiveniskun vaiheet: [kyynärpään korkeus, kärjen korkeus] (negatiivinen = ylös)
const BIRD_FLAP = [[-2, -4], [-2, 0], [0, 2], [1, 1]];
function drawSkyBirds(camXr, camYr) {
  for (const b of skyBirds) {
    const x = Math.round(b.x - camXr), y = Math.round(b.y - camYr);
    if (x < -12 || x > W + 12 || y < -10 || y > H + 10) continue;
    const L = BIRD_LOOK[b.kind] || BIRD_LOOK.small, dir = b.vx < 0 ? -1 : 1;
    const [ey, ty] = BIRD_FLAP[Math.floor((time + b.ph) / L.rate) % 4];
    const ex = Math.max(2, Math.round(L.span * 0.45));
    for (const side of [-1, 1]) {
      // Olkapäästä kyynärpäähän leveämpi siiven sisäosa, kyynärpäästä kärkeen ohuempi ulko-osa
      const sx = x + side, exx = x + side * ex, txx = x + side * L.span;
      plotLine(ctx, sx, y, exx, y + ey, L.wing);
      for (let t = 1; t <= L.thick; t++) plotLine(ctx, sx, y + t, exx, y + ey + Math.min(t, 1), L.wing);
      plotLine(ctx, exx, y + ey, txx, y + ty, L.wing);
      ctx.fillStyle = L.tip; ctx.fillRect(txx, y + ty, 1, 1);
      if (b.kind === 'gull') ctx.fillRect(txx - side, y + Math.round((ey + ty * 2) / 3), 1, 1);
      if (b.kind === 'crow') { ctx.fillRect(txx + side, y + ty + 1, 1, 1); ctx.fillRect(txx, y + ty + 1, 1, 1); }   // kärkisulat
    }
    // Vartalo, pää, nokka ja pyrstö
    ctx.fillStyle = L.col;
    ctx.fillRect(x - 1, y, 3, 2);
    ctx.fillRect(x + dir * 2, y, 1, 1);
    ctx.fillRect(x - dir * 2, y + 1, 1, 1);
    if (L.belly) { ctx.fillStyle = L.belly; ctx.fillRect(x, y + 1, 1, 1); }
    ctx.fillStyle = L.beak; ctx.fillRect(x + dir * 3, y, 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Nukkuminen teltassa: ruutu pimenee ja aika kuluu nopeasti seuraavaan aamuun kello 7.00 asti.
// Uni keskeytyy mistä tahansa näppäimestä, napautuksesta tai hiiren napista.
// ---------------------------------------------------------------------------
const WAKE_TOD = (7 - 4.5) / 24;   // kello 7.00 vuorokauden osuutena
const FADE = 45;                    // pimeneminen ja valkeneminen (päivityksiä)
const TENT_DOOR = { x: TENT.cx + 2.6, y: TENT.cy + 1 };
const canSleep = () => state === 'play' && !cast.lure && Math.hypot(player.x - TENT_DOOR.x, player.y - TENT_DOOR.y) < 1.7;

function startSleep() {
  state = 'sleep';
  sleep = { phase: 'in', t: 0 };
  player.moving = false;
  cast.charging = false; mouseHeld = false;
  touch.mx = touch.my = 0;
  SFX.rodIn();
}

// Nukkumaan ei voi mennä siima vedessä
// Kuinka monta päivitystä seuraavaan aamuun kello 7.00
function framesToWake() {
  let d = WAKE_TOD - todNow();
  // Vain jo ohitettu (tai täsmälleen nyt oleva) aamu siirtyy seuraavaan päivään. Pieni positiivinen jäännös
  // (nopea kelaus jättää loppumatkan alle askelen) ei saa lisätä kokonaista vuorokautta.
  if (d <= 1e-7) d += 1;
  return Math.round(d * CYCLE);
}

// Aika kuluu n päivitystä kerralla: sää ja tuuli vaihtuvat taustalla ilman ilmoituksia
function fastForward(n) {
  time += n; clock += n;
  burnFire(n);
  setWeatherKind(weatherKindNow());
  wind.t -= n;
  if (wind.t <= 0) nextWind();
  wind.s = wind.ts; wind.a = wind.ta;
  weather.rain = WEATHER[weather.kind].rain; weather.fog = WEATHER[weather.kind].fog;
  updateEnv();
  phaseName = phaseOf(env.tod);
}

function updateSleep() {
  const s = sleep, woke = Object.keys(pressed).length > 0;
  s.t++;
  if (s.phase === 'in') {
    if (woke) { s.phase = 'out'; s.t = 0; }
    else if (s.t >= FADE) { s.phase = 'zz'; s.t = 0; }
  } else if (s.phase === 'zz') {
    // Pitkä uni kelataan nopeammin, jotta yö menee ohi muutamassa sekunnissa
    const left = framesToWake(), n = Math.min(left, Math.max(45, Math.ceil(left / 220)));
    fastForward(n);
    if (n >= left || (woke && s.t > 10)) wakeUp(n >= left);
  } else if (s.t >= FADE) state = 'play';
  updateAmbientAudio();
}

function wakeUp(morning) {
  sleep.phase = 'out'; sleep.t = 0;
  particles = []; ripples = []; wakes = []; drops = []; animals = []; skyBirds = [];
  for (const d of ducks) if (d.mode === 'roost' || (d.mode === 'sleep' && phaseName !== 'NIGHT')) { d.mode = 'swim'; d.t = rand(100, 300); }
  for (const d of grebes) if (d.mode === 'roost' || (d.mode === 'sleep' && phaseName !== 'NIGHT')) { d.mode = 'swim'; d.t = rand(100, 300); }
  banners = [{ text: morning ? 'Good morning!' : 'You wake up.', t: 200 }];
  player.stillT = 0;
  // Herätessä astutaan ulos teltan ovesta
  player.x = TENT_DOOR.x + 0.4; player.y = TENT_DOOR.y;
  faceTo(1, -0.2);
  if (player.rod) resetLine();
}

// ---------------------------------------------------------------------------
// Päivitys (60 kertaa sekunnissa)
// ---------------------------------------------------------------------------
function updateCamera() {
  // Hiirellä kamera kurkottaa hieman tähtäimen suuntaan, muuten katsesuuntaan
  const lx = aiming() ? (mouseX - W / 2) * 0.15 : player.gux * 18, ly = aiming() ? (mouseY - H / 2) * 0.15 : player.guy * 10;
  const tx = isoX(player.x, player.y) - W / 2 + lx;
  const ty = isoY(player.x, player.y) - 12 - H / 2 + ly;
  cam.x += (tx - cam.x) * 0.06;
  cam.y += (ty - cam.y) * 0.06;
}

function update() {
  if (keyHit('KeyM')) { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; }
  if (state === 'title') {
    if (keyHit('Enter', 'Space')) newGame();
    pressed = {};
    return;
  }
  if (state === 'pause') {
    if (keyHit('KeyP', 'Escape', 'Enter', 'Space')) state = 'play';
    pressed = {};
    return;
  }
  if (state === 'sleep') { updateSleep(); pressed = {}; return; }
  if (keyHit('KeyP', 'Escape')) { state = 'pause'; pressed = {}; return; }

  // Huijaustila (V): vesi piilotetaan, jolloin kalat, pohja ja debug-viivat näkyvät. Vain huijaustilassa
  // voi säätää veden sameutta ([ ja ]) ja näyttää syvyyskäyrät (B).
  if (keyHit('KeyV')) {
    water.show = !water.show;
    if (water.show) water.contours = false;
    notify(water.show ? 'Cheat mode off' : 'Cheat mode on: fish and the bottom are fully visible', 150, 'water');
  }
  const cheat = !water.show;
  if (cheat && keyHit('KeyB')) water.contours = !water.contours;
  if (cheat && keyHit('BracketLeft', 'BracketRight')) {
    water.turb = clamp(+(water.turb + (keyHit('BracketRight') ? 0.15 : -0.15)).toFixed(2), 0.05, 2.5);
    notify('Water murkiness ' + water.turb.toFixed(2), 100, 'water');
  }
  if (keyHit('KeyO')) toggleProf();
  if (keyHit('KeyG')) setGfx(!gfxLow, true);
  if (keyHit('KeyT')) {
    clockSync = false;
    timeScale = keyDown('ShiftLeft', 'ShiftRight') ? (timeScale > 1 ? timeScale - 1 : 10) : (timeScale < 10 ? timeScale + 1 : 1);
    notify('Time speed ' + timeScale + 'x', 90, 'time');
  }
  if (keyHit('KeyL')) {
    clockSync = !clockSync;
    notify(clockSync ? 'Fast-forwarding to local time…' : 'Fast-forward stopped', 90, 'time');
  }
  time++;
  advanceClock();
  updateEnv();
  updateDayPhase();
  updatePlayer();
  if (isReeling()) handCrank.a += 0.22;
  if (bellT > 0) bellT--;
  if (state === 'sleep') { pressed = {}; return; }
  updateWeather();
  burnFire(clockStep);
  if (fire.barT > 0) fire.barT--;
  updateSway();
  updateCampfire();
  updateBoat();
  updateDucks();
  updateGrebes();
  updateSeal();
  updateFishes();
  updateLoose();
  updateAnimals();
  updateBirds();
  updateParticles();
  updateAmbientAudio();
  updateCamera();
  if (banners.length && --banners[0].t <= 0) banners.shift();
  pressed = {};
}

// ---------------------------------------------------------------------------
// Piirto
// ---------------------------------------------------------------------------
function drawImg(img, x, y, flip) {
  x = Math.round(x); y = Math.round(y);
  if (flip) {
    ctx.save();
    ctx.translate(x + img.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  } else ctx.drawImage(img, x, y);
}

function drawShadow(sx, sy) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(sx - 3, sy - 2, 7, 1);
  ctx.fillRect(sx - 5, sy - 1, 11, 2);
  ctx.fillRect(sx - 3, sy + 1, 7, 1);
}

const dot = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };

// Onki repun kyljessä pystyssä: korkkikahva, kela ja tumma vapa, jonka kärki kurottaa hatun yli
function drawBackRod(sx, sy, flip, rodX) {
  const x = Math.round(sx + rodX), y0 = Math.round(sy - 5), lean = rodX >= 0 ? 1 : -1;
  for (let y = y0; y > y0 - 27; y--) {
    const h = y0 - y, xx = x + (h > 16 ? lean : 0);
    if (h >= 4 && h <= 25) dot(xx + (flip ? -1 : 1), y, 'rgba(14, 10, 8, 0.7)');   // tumma reuna erottaa vavan taustasta
    dot(xx, y, h < 4 ? (h % 2 ? '#e0b880' : '#b88a50') : h > 25 ? '#f4f4ec' : h % 5 === 0 ? '#e8e0c8' : '#c89a5a');
  }
  dot(x - lean, y0 - 4, '#3a3e44'); dot(x - lean, y0 - 5, '#6a7078');   // kela
}

// Kirves (kuvan mukainen metsästyskirves): hieman kaareva, lämpimän ruskea kahva ja leveä harmaa teräspää, jonka terä on kirkas.
const AXE_COL = { handle: '#b8733a', light: '#d9904e', dark: '#7e4a22', knob: '#9a5c2c', poll: '#5e646a', cheek: '#9097a0', cheek2: '#a8afb6', edge: '#e6ecf0', edgeEnd: '#b8c0c6' };
// Kirves repun vasemmassa reunassa (vastakkaisella puolella kuin onki). Piirretään vain kun kirves ei ole kädessä. Paikka x (ruudulla
// hahmon keskeltä) on ongen paikan peilikuva; sivusta katsottaessa vastakkainen laita on repun toisella puolella (edessä <-> takana).
// Kahvan reunassa on ongen tapaan kevyt, puoliläpinäkyvä tumma reuna.
const AXE_POS = {
  S: { x: 4, front: false }, SE: { x: 5, front: false }, E: { x: -3, front: false }, NE: { x: -3, front: true },
  N: { x: -4, front: true }, NW: { x: -4, front: true }, W: { x: 3, front: true }, SW: { x: 6, front: false },
};
function drawBackAxe(sx, sy, pos, flip) {
  const bx = Math.round(sx + pos.x), y0 = Math.round(sy - 5), o = pos.x < 0 ? -1 : 1;
  for (let h = 0; h < 10; h++) {
    if (h >= 2) dot(bx + (flip ? -1 : 1), y0 - h, 'rgba(14, 10, 8, 0.7)');   // tumma reuna erottaa kahvan taustasta (kuten ongella)
    dot(bx, y0 - h, h < 2 ? AXE_COL.knob : h % 3 ? AXE_COL.handle : AXE_COL.light);   // varsi
  }
  // Teräpää varren päässä: pieni kiila, jonka terä osoittaa ulospäin
  dot(bx, y0 - 10, AXE_COL.poll); dot(bx, y0 - 11, AXE_COL.poll);
  dot(bx + o, y0 - 9, AXE_COL.cheek); dot(bx + o, y0 - 10, AXE_COL.cheek2); dot(bx + o, y0 - 11, AXE_COL.cheek);
  dot(bx + o * 2, y0 - 9, AXE_COL.edgeEnd); dot(bx + o * 2, y0 - 10, AXE_COL.edge); dot(bx + o * 2, y0 - 11, AXE_COL.edgeEnd);
}
// Oikean käden asento työkalua pitäessä: olkapää (SHOULDER_R) on paikallaan, kyynärpää roikkuu olkapään alla ja kyynärvarsi
// kääntyy kyynärpäästä toolAnglen mukaan; käsi on kyynärvarren päässä ja työkalu jatkaa samaa suuntaa.
function toolPose(sx, sy) {
  const p = player, dir = playerDir(), s0 = SHOULDER_R[dir], a = toolAngle(p);
  const S = [sx + s0[0], sy + s0[1]], E = [S[0] + p.gux * 1.5, S[1] + 4];
  let ux = p.gux * Math.sin(a), uy = -Math.cos(a) + p.guy * Math.sin(a) * 0.6;
  const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
  const side = p.gux < 0 ? -1 : 1;
  return { S, E, H: [E[0] + ux * 4, E[1] + uy * 4], ux, uy, px: -uy * side, py: ux * side };
}
function drawHeldTool(sx, sy) {
  const T = toolPose(sx, sy), { ux, uy, px, py } = T, [hx, hy] = T.H;
  // Piste työkalun koordinaateissa: s = matka kahvaa pitkin kädestä, q = sivusuunta (terä eteenpäin)
  const pt = (s, q, col) => dot(hx + ux * s + px * q, hy + uy * s + py * q, col);
  if (player.tool === 'axe') {
    const len = 8;   // kahvasta näkyy nyrkin ulkopuolella aiempaa 3 px vähemmän
    plotLine(ctx, hx - ux * 1, hy - uy * 1 + 1, hx + ux * len, hy + uy * len + 1, 'rgba(14, 10, 8, 0.65)');
    for (let s = -2; s <= len; s++) pt(s, 0, s < 0 ? AXE_COL.knob : s % 4 === 3 ? AXE_COL.light : AXE_COL.handle);
    for (let s = 0; s <= len - 3; s += 2) pt(s, -0.6, AXE_COL.dark);
    // Teräpää (kuvan mukainen kiila): kapea niska kahvan päässä, joka levenee eteenpäin kohti kaarevaa, kirkasta terää
    pt(len - 1, -1, AXE_COL.poll); pt(len, -1, AXE_COL.poll);
    for (let s = len - 1; s <= len + 1; s++) pt(s, 0, AXE_COL.poll);
    for (let s = len - 1; s <= len + 1; s++) pt(s, 1, s === len ? AXE_COL.cheek2 : AXE_COL.cheek);
    for (let s = len - 2; s <= len + 2; s++) pt(s, 2, s === len - 2 || s === len + 2 ? AXE_COL.cheek : AXE_COL.cheek2);
    pt(len - 1, 3, AXE_COL.edgeEnd); pt(len, 3, AXE_COL.edge); pt(len + 1, 3, AXE_COL.edgeEnd);
  } else {
    // Puukko (lyhytteräinen, puukahvainen): ruskea kahva ja lyhyt tumma terä, jonka selkä on vaaleampi
    for (let s = -1; s <= 3; s++) { pt(s, 0, s === -1 || s === 3 ? '#5a3a1c' : s % 2 ? '#8a5a30' : '#a06c3a'); }
    pt(4, 0, '#c8a060');   // sorkkarauta
    for (let s = 5; s <= 8; s++) pt(s, 0, '#aab2ba');
    pt(9, 0, '#d8e0e6');
    for (let s = 5; s <= 7; s++) pt(s, 1, '#4a5058');
  }
}
// Käsivarsi olkapäästä kyynärpään kautta käteen: kaksi suoraa osaa; poispäin katsottaessa näkyy vain olkavarsi (kuten drawArm)
function drawArmElbow(S, E, H, away, out) {
  const [sx0, sy0] = S, ex = Math.round(E[0]), ey = Math.round(E[1]), hx = Math.round(H[0]), hy = Math.round(H[1]);
  if (away) {
    const o = out < 0 ? -1 : 1;
    plotLine(ctx, sx0 + o, sy0, ex + o, ey, '#120c0a'); dot(ex + o, ey + 1, '#120c0a'); dot(ex, ey + 1, '#120c0a');
    plotLine(ctx, sx0, sy0, ex, ey, '#6c8c40'); dot(ex, ey, '#40541e');
    return;
  }
  plotLine(ctx, sx0, sy0 + 1, ex, ey + 1, '#22300f'); plotLine(ctx, ex, ey + 1, hx, hy + 1, '#22300f');
  plotLine(ctx, sx0, sy0, ex, ey, '#6c8c40'); plotLine(ctx, ex, ey, hx, hy, '#6c8c40');
  plotLine(ctx, sx0, sy0 - 1, ex, ey - 1, '#8aa856');
  ctx.fillStyle = '#2a2018'; ctx.fillRect(hx - 1, hy - 1, 4, 1); ctx.fillRect(hx + 2, hy, 1, 3); ctx.fillRect(hx - 1, hy + 2, 3, 1); ctx.fillRect(hx - 1, hy, 1, 2);
  ctx.fillStyle = '#f6d0ac'; ctx.fillRect(hx, hy, 2, 2);
  ctx.fillStyle = '#d29c7c'; ctx.fillRect(hx, hy + 1, 2, 1);
}
// Kädet työkalun kanssa: oikea käsi heiluu kyynärpäästä (toolPose), vasen roikkuu rentona vartalon vieressä
function drawToolArms(sx, sy, phase) {
  const dir = playerDir(), depth = ARM_DEPTH[dir], away = VIEW_INFO[player.view].away;
  const outwards = (x) => (dir === 'E' || dir === 'W' ? 0 : x < 0 ? -1.5 : 1.5);
  // Kauempana oleva vasen käsi (SE, E) jää vartalon taakse, joten sitä ei piirretä (kämmen näkyisi vartalon läpi)
  if (depth.L === phase && depth.L === 'near' && SHOULDER_L[dir]) {
    const s0 = SHOULDER_L[dir], o = outwards(s0[0]);
    // Vapaa vasen käsi: lyhyt, kämmen 3 px olkapään alla (4 px aiempaa ylempänä) ja 1 px lähempänä vartaloa
    drawArm(sx + s0[0], sy + s0[1], sx + s0[0] + o * 0.4 - Math.sign(s0[0]), sy + s0[1] + 3, o, away);
  }
  if (depth.R === phase) { const T = toolPose(sx, sy); drawArmElbow(T.S, T.E, T.H, away, outwards(SHOULDER_R[dir][0])); }
}

// Kädessä oleva onki ja siima: kärjestä roikkuu siima, jossa puna-valkoinen koho ja koukku
function drawHeldRod(camXr, camYr) {
  const g = rodGeom();
  bobberBehind = VIEW_INFO[player.view].away;   // poispäin katsottaessa onki ja siima ovat hahmon takana
  const hx = g.hx - camXr, hy = g.hy - camYr, tx = g.tx - camXr, ty = g.ty - camYr;
  const dx = tx - hx, dy = ty - hy, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
  // Pohjaongen kello ongen kärjessä; syönnin jälkeen se heiluu
  if (isRig(player.lure)) {
    const sh = bellT > 0 ? Math.round(Math.sin(time * 1.3) * 1.6) : 0, bx = Math.round(tx) + sh;
    dot(Math.round(tx), Math.round(ty) + 1, '#d8d8d0');
    dot(bx, Math.round(ty) + 2, '#e8c040'); dot(bx + 1, Math.round(ty) + 2, '#c89828'); dot(bx, Math.round(ty) + 3, '#a87818'); dot(bx + 1, Math.round(ty) + 3, '#e8c040');
  }
  // Vapa on vaalea, ja sen alla kulkee tumma reunaviiva, jotta se erottuu sekä metsästä että vedestä
  plotLine(ctx, hx + ux * 2, hy + uy * 2 + 1, tx, ty + 1, 'rgba(14, 10, 8, 0.7)');
  plotLine(ctx, hx - ux * 3, hy - uy * 3, hx + ux * 1, hy + uy * 1, '#d8a868');   // korkkikahva
  plotLine(ctx, hx + ux * 2, hy + uy * 2, tx, ty, '#c89a5a');                     // vapa
  for (const k of [5, 9, 13]) if (k < l - 1) dot(hx + ux * k, hy + uy * k, '#f0ece0');   // siimanohjaimet
  dot(hx + ux * 1, hy + uy * 1 + 1, '#3a3e44'); dot(hx + ux * 1 + 1, hy + uy * 1 + 1, '#6a7078');   // kela
  dot(tx, ty, '#d8d8d0');
  if (cast.lure) { drawCastLine(g, camXr, camYr); return; }
  // Siima
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    plotLine(ctx, a.x - camXr, a.y - camYr, b.x - camXr, b.y - camYr, i <= BOB_I ? 'rgba(225, 230, 235, 0.6)' : 'rgba(200, 205, 210, 0.45)');
  }
  if (isRig(player.lure)) {
    // Puntti roikkuu siiman päässä; sivuhaara roikkuu pääsiimasta erillään ja heiluu vapaasti, päässä syötti
    const e = line[line.length - 1];
    for (let i = 1; i < rigArm.length; i++) plotLine(ctx, rigArm[i - 1].x - camXr, rigArm[i - 1].y - camYr, rigArm[i].x - camXr, rigArm[i].y - camYr, 'rgba(210, 214, 218, 0.8)');
    if (rigArm.length) { const t = rigArm[rigArm.length - 1]; drawRigBait(player.lure, Math.round(t.x - camXr), Math.round(t.y - camYr)); }
    drawSinkerAt(Math.round(e.x - camXr), Math.round(e.y - camYr + 1));
    return;
  }
  if (player.lure === 'spoon') {
    // Lippa roikkuu siiman päässä: pieni vihreä-oranssi lehti ja koukku alla
    const k = line[line.length - 1], kx = Math.round(k.x - camXr), ky = Math.round(k.y - camYr);
    dot(kx, ky + 1, '#9aa0a8'); dot(kx, ky + 2, '#3c9a3c'); dot(kx + 1, ky + 2, '#f08a24'); dot(kx, ky + 3, '#f08a24'); dot(kx + 1, ky + 3, '#2e7a30');
    dot(kx, ky + 4, '#c0c6cc');
    return;
  }
  if (player.lure === 'wobbler') {
    // Vaappu roikkuu siiman päässä nokka alaspäin
    const k = line[line.length - 1], kx = Math.round(k.x - camXr), ky = Math.round(k.y - camYr);
    dot(kx, ky + 1, '#4c6276'); dot(kx, ky + 2, '#7890a8'); dot(kx, ky + 3, '#7890a8');
    dot(kx + 1, ky + 2, '#b8c8d8'); dot(kx + 1, ky + 3, '#101418'); dot(kx, ky + 4, 'rgba(208, 224, 232, 0.8)');
    return;
  }
  // Koho: punainen yläosa, valkoinen alaosa ja ohut tikku päällä
  const bx = Math.round(line[BOB_I].x - camXr), by = Math.round(line[BOB_I].y - camYr);
  dot(bx, by - 3, '#7dff5a'); glows.push({ x: bx, y: by - 3, a: 1, behind: bobberBehind });
  ctx.fillStyle = '#d8241c'; ctx.fillRect(bx - 1, by - 2, 2, 2);
  ctx.fillStyle = '#ff6a50'; ctx.fillRect(bx - 1, by - 2, 1, 1);
  ctx.fillStyle = '#f0f0ea'; ctx.fillRect(bx - 1, by, 2, 1);
  // Koukku ja syöttinä mato
  const k = line[line.length - 1], kx = Math.round(k.x - camXr), ky = Math.round(k.y - camYr);
  drawHookBait(kx, ky);
}

// Puntti (lyijypainon): rengas ylhäällä ja pyöreähkö, tumma harmaa runko
function drawSinkerAt(x, y) {
  dot(x, y - 2, '#c8ccd0');
  ctx.fillStyle = '#4e525a'; ctx.fillRect(x - 1, y - 1, 3, 2);
  dot(x - 1, y - 1, '#8e929a'); dot(x, y + 1, '#3a3e44');
}
// Syöttipallo (boilie): ruskea pallo (suurennettu kaksi pikseliä), koukun kärki sen vieressä
function drawBoilieAt(kx, ky) {
  dot(kx - 1, ky - 1, '#9aa0a8');
  ctx.fillStyle = '#6a3c1c'; ctx.fillRect(kx - 1, ky, 2, 2);
  dot(kx - 1, ky, '#9a6234'); dot(kx, ky + 1, '#44250f');
}
const drawRigBait = (kind, x, y) => (kind === 'rigboilie' ? drawBoilieAt(x, y) : drawHookBait(x, y));

function drawHookBait(kx, ky) {
  dot(kx, ky, '#c8ccd0'); dot(kx + 1, ky, '#9aa0a8'); dot(kx + 1, ky - 1, '#c8ccd0');
  const w = Math.sin(time * 0.15) > 0 ? 1 : 0;
  dot(kx - 1, ky + 1, '#c86a78'); dot(kx, ky + 1, '#e08a96'); dot(kx - 1 - w, ky + 2, '#b85a68');
}

// ---------------------------------------------------------------------------
// Moottorivene: pieni vaalea soutuveneen kokoinen vene, jonka perässä on perämoottori. Veneen kuvat
// lasketaan valmiiksi 16 suuntaan (BOAT_SPR[i], suunta i * 22,5 astetta maailman x-akselista):
//   full  = vedenpäällinen osa (laidat, sisäpuoli, istuimet ja perämoottori)
//   front = katsojaa lähempi laita, joka piirretään kyydissä olevan hahmon päälle
//   under = veden alle jäävä pohja ja moottorin vetolaite (häivytetään syvyyden mukaan)
// Kuvien ankkuri (ax, ay) on veneen keskikohta vesirajassa. Vene on aluksi kiinni laiturissa keula
// oikealle. Ajomallia ei ole vielä: rider = null | 'stand' (seisoo kalastamassa) | 'drive' (istuu perässä
// ja ohjaa perämoottoria oikealla kädellä).
// ---------------------------------------------------------------------------
const BOAT_N = 16, BOAT_PX = 10;   // suuntien määrä; korkeudet pikseleinä metriä kohden
const BOAT_HULL = [[-1.5, -0.56], [-0.5, -0.64], [0.5, -0.56], [1.15, -0.32], [1.6, 0], [1.15, 0.32], [0.5, 0.56], [-0.5, 0.64], [-1.5, 0.56]];
const boatH = (u) => 4 + Math.max(0, u - 0.6) * 1.8;   // laidan korkeus (px): keula nousee hieman
function makeBoatSprites(a) {
  const W2 = 72, H2 = 52, ax = 36, ay = 30, ca = Math.cos(a), sa = Math.sin(a);
  const P = (u, v, z) => { const dx = u * ca - v * sa, dy = u * sa + v * ca; return [ax + (dx - dy) * 8, ay + (dx + dy) * 4 - z]; };
  const mk = () => { const c = makeCanvas(W2, H2); return [c, c.getContext('2d')]; };
  const [full, gf] = mk(), [front, gr] = mk(), [under, gu] = mk();
  const light = (nu, nv) => { const nx = nu * ca - nv * sa, ny = nu * sa + nv * ca; return -0.7 * nx - 0.7 * ny; };
  const n = BOAT_HULL.length;
  // Laitojen pinnat: kukin laidan pätkä vesirajasta reunaan, kauimmat ensin
  const faces = [];
  for (let i = 0; i < n; i++) {
    const [u0, v0] = BOAT_HULL[i], [u1, v1] = BOAT_HULL[(i + 1) % n];
    const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, nu = v1 - v0, nv = -(u1 - u0);
    const nl = Math.hypot(nu, nv) || 1, out = (nu * mu + nv * mv) > 0 ? 1 : -1;
    faces.push({ i, u0, v0, u1, v1, depth: P(mu, mv, 0)[1], l: light(out * nu / nl, out * nv / nl), toward: P(mu * 1.2, mv * 1.2, 0)[1] > P(mu, mv, 0)[1] });
  }
  faces.sort((p, q) => p.depth - q.depth);
  const wl = 0.9;   // vesirajan ääriviiva on hieman laitaa kapeampi
  const sideCol = (l) => (l > 0.3 ? '#f2f0e6' : l > -0.3 ? '#d8d6ca' : '#b4b2a6');
  const drawSide = (g, f) => {
    const top0 = P(f.u0, f.v0, boatH(f.u0)), top1 = P(f.u1, f.v1, boatH(f.u1));
    const bot0 = P(f.u0 * wl, f.v0 * wl, 0), bot1 = P(f.u1 * wl, f.v1 * wl, 0);
    polyFill(g, [top0, top1, bot1, bot0], sideCol(f.l));
    plotLine(g, top0[0], top0[1] + 1, top1[0], top1[1] + 1, '#3a6a9a');   // sininen raita laidan alla
  };
  // Moottori: kotelo, varsi ja ohjauskahva perässä keskellä
  const motor = (g) => {
    const [mx, my] = P(-1.66, 0, boatH(-1.5) + 3), [sx0, sy0] = P(-1.66, 0, boatH(-1.5)), [sx1, sy1] = P(-1.66, 0, 0);
    plotLine(g, sx0, sy0, sx1, sy1, '#3a3e44');
    g.fillStyle = '#26292e'; g.fillRect(Math.round(mx) - 2, Math.round(my) - 3, 5, 5);
    g.fillStyle = '#4e545c'; g.fillRect(Math.round(mx) - 2, Math.round(my) - 3, 2, 4);
    g.fillStyle = '#8a9098'; g.fillRect(Math.round(mx) - 1, Math.round(my) - 3, 3, 1);
    const [tx, ty] = P(-1.15, 0.12, boatH(-1.5) + 2);
    plotLine(g, mx, my, tx, ty, '#1e2024');
    g.fillStyle = '#c83a2a'; g.fillRect(Math.round(tx), Math.round(ty), 1, 1);
  };
  const sternY = P(-1.5, 0, 0)[1], midY = P(0, 0, 0)[1], motorBehind = sternY < midY;
  if (motorBehind) motor(gf);
  for (const f of faces) if (!f.toward) drawSide(gf, f);
  // Sisäpuoli: laitojen sisäpinta, puinen pohja ja kaksi istuinta
  const rim = BOAT_HULL.map(([u, v]) => P(u, v, boatH(u)));
  polyFill(gf, rim, '#cfcabb');
  polyFill(gf, BOAT_HULL.map(([u, v]) => P(u * 0.8, v * 0.72, 1)), '#a8916a');
  for (const u of [0.35, -1.1]) {
    const w = 0.6 * (u > 0 ? 0.95 : 0.9), [x0, y0] = P(u, -w, boatH(u) - 1), [x1, y1] = P(u, w, boatH(u) - 1);
    plotLine(gf, x0, y0, x1, y1, '#8a6a44'); plotLine(gf, x0, y0 - 1, x1, y1 - 1, '#b08c5a');
  }
  for (const f of faces) if (f.toward) { drawSide(gf, f); drawSide(gr, f); }
  for (let i = 0; i < n; i++) {
    const a0 = rim[i], a1 = rim[(i + 1) % n];
    plotLine(gf, a0[0], a0[1], a1[0], a1[1], '#fbf9f2');
    if (faces.find((f) => f.i === i && f.toward)) plotLine(gr, a0[0], a0[1], a1[0], a1[1], '#fbf9f2');
  }
  if (!motorBehind) { motor(gf); motor(gr); }
  outlineSprite(full, 'rgba(20, 24, 26, 0.75)');
  // Veden alla: pohja vesirajasta köliin ja moottorin vetolaite potkureineen
  const keel = 0.55;
  for (const f of faces) {
    const t0 = P(f.u0 * wl, f.v0 * wl, 0), t1 = P(f.u1 * wl, f.v1 * wl, 0), b0 = P(f.u0 * keel, f.v0 * keel * 0.6, -3), b1 = P(f.u1 * keel, f.v1 * keel * 0.6, -3);
    polyFill(gu, [t0, t1, b1, b0], f.l > 0 ? '#c8c6ba' : '#a4a298');
  }
  const [px0, py0] = P(-1.66, 0, 0), [px1, py1] = P(-1.66, 0, -6);
  plotLine(gu, px0, py0, px1, py1, '#3a3e44');
  gu.fillStyle = '#5a6068'; gu.fillRect(Math.round(px1) - 1, Math.round(py1), 3, 1);
  // Heijastus: jokainen vedenpäällinen piste peilataan vedenpinnan alle omassa kohdassaan (z -> -z).
  // Näkyvissä ovat vain laitojen ulkopinnat ja moottori (veneen sisäpuolta ei näe alhaalta); kauimmat
  // laidat piirretään ensin kuten itse veneessä. Heijastus tummennetaan piirrettäessä.
  const [refl, gp] = mk(), R = (u, v, z) => P(u, v, -z);
  for (const f of faces) {
    const t0 = R(f.u0, f.v0, boatH(f.u0)), t1 = R(f.u1, f.v1, boatH(f.u1)), b0 = R(f.u0 * wl, f.v0 * wl, 0), b1 = R(f.u1 * wl, f.v1 * wl, 0);
    polyFill(gp, [t0, t1, b1, b0], sideCol(f.l));
    plotLine(gp, t0[0], t0[1] - 1, t1[0], t1[1] - 1, '#3a6a9a');
  }
  // Perämoottorin heijastus omalla kuvallaan: se jää sekä veneen että hahmon heijastuksen alle
  const [reflMotor, gm] = mk(), [rmx, rmy] = R(-1.66, 0, boatH(-1.5) + 3), [rs0x, rs0y] = R(-1.66, 0, 0);
  plotLine(gm, rs0x, rs0y, rmx, rmy, '#3a3e44');
  gm.fillStyle = '#26292e'; gm.fillRect(Math.round(rmx) - 2, Math.round(rmy) - 1, 5, 5);
  return { full, front, under, refl, reflMotor, ax, ay, P };
}
const BOAT_SPR = Array.from({ length: BOAT_N }, (_, i) => makeBoatSprites((i / BOAT_N) * Math.PI * 2));
const boatIdx = (a) => ((Math.round(a / (Math.PI * 2 / BOAT_N)) % BOAT_N) + BOAT_N) % BOAT_N;
let boat = null;
function placeBoat() {
  // Kiinni laiturin katsojan puoleisessa kyljessä, keula laiturin suuntaan (ruudulla oikealle)
  const t = 4.6, s = -(DOCK_W / 2 + 0.75);
  boat = { x: dock.x0 + dock.ux * t + dock.px * s, y: dock.y0 + dock.uy * t + dock.py * s, a: Math.atan2(dock.uy, dock.ux), rider: null, moored: true, v: 0, th: 0, steer: 0, wakeT: 0 };
}

// ---------------------------------------------------------------------------
// Veneen ajomalli. Kaasu (W / S tai liiketikku ylös/alas) kiihdyttää eteen tai peruuttaa, ja A / D
// kääntää venettä; kääntyminen on sitä tehokkaampaa, mitä nopeammin vene kulkee. Vesi jarruttaa venettä
// koko ajan. Runko ei pääse rantaan, laituriin eikä kiviin: törmätessä vene kimpoaa hieman takaisin.
// Pysähtyneessä veneessä R ottaa ongen ja hahmo nousee seisomaan kalastamaan; R uudelleen palaa ajoon.
// E nousee veneeseen laiturilta tai rannasta ja nousee maihin, kun vene on pysähtynyt rannan tai laiturin viereen.
// ---------------------------------------------------------------------------
const BOAT_MAX = 0.045, BOAT_REV = 0.012;   // huippunopeus eteen (noin 2,7 m/s) ja taakse (m / päivitys)
function hullFree(x, y, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (const [u, v] of [[1.55, 0], [1.0, -0.36], [1.0, 0.36], [0, -0.64], [0, 0.64], [-1.55, -0.5], [-1.55, 0.5], [-1.7, 0]]) {
    const px = x + u * ca - v * sa, py = y + u * sa + v * ca;
    if (shoreDist(px, py) > -0.12 || onDock(px, py, 0.05) || waterRocks.some((r) => Math.hypot(r.x - px, r.y - py) < 0.55)) return false;
  }
  return true;
}
const boatStopped = () => Math.abs(boat.v) < 0.004;
const canBoard = () => state === 'play' && boat && !player.boat && !cast.lure && boatStopped() && Math.hypot(player.x - boat.x, player.y - boat.y) < 2.4;
// Maihinnousupaikka: lähin kohta veneen ympäriltä, jossa voi seistä (penger, aukea tai laituri)
function landingSpot() {
  for (const r of [1.0, 1.4, 1.8, 2.2, 2.6]) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, x = boat.x + Math.cos(a) * r, y = boat.y + Math.sin(a) * r;
      if (!blocked(x, y)) return [x, y];
    }
  }
  return null;
}
const canLeave = () => state === 'play' && player.boat && !cast.lure && boatStopped() && !!landingSpot();
function boardBoat() {
  const p = player;
  p.boat = true; p.rod = false; p.tool = null; p.chop = null; p.moving = false;
  boat.rider = 'drive'; boat.moored = false; boat.th = boat.steer = 0;
  p.x = boat.x; p.y = boat.y; p.fa = boat.a;
  [p.gux, p.guy] = screenDir(Math.cos(boat.a), Math.sin(boat.a));
  notify('In the boat: W / S throttle, A / D steer', 200, 'boat');
  SFX.thud();
}
function leaveBoat() {
  const spot = landingSpot();
  if (!spot) return;
  const p = player;
  p.boat = false; p.rod = false; boat.rider = null; boat.th = boat.steer = 0;
  [p.x, p.y] = spot;
  faceTo(p.x - boat.x, p.y - boat.y);
  SFX.step(true);
}
// Kuljettajan ohjaus: kx = ohjaus (-1 vasen … 1 oikea), ky = kaasu (-1 eteen … 1 taakse)
function driveBoat(kx, ky) {
  const b = boat;
  b.th += (clamp(-ky, -1, 1) - b.th) * 0.08;
  b.steer += (clamp(kx, -1, 1) - b.steer) * 0.15;
}
function updateBoat() {
  const b = boat;
  if (!b) return;
  if (!(player.boat && b.rider === 'drive')) { b.th *= 0.9; b.steer *= 0.9; }
  // Kaasu kiihdyttää, vesi jarruttaa; peruutus on hitaampaa
  b.v += b.th > 0 ? b.th * 0.0009 : b.th * 0.0011;
  b.v *= 0.985;
  b.v = clamp(b.v, -BOAT_REV, BOAT_MAX);
  if (Math.abs(b.v) < 0.0002 && Math.abs(b.th) < 0.05) b.v = 0;
  // Kääntyminen: liikkeessä tehokkaampaa, paikallaan moottori kääntää venettä hitaasti
  const turn = b.steer * 0.022 * clamp(Math.abs(b.v) / 0.02, 0.18, 1) * (b.v < -0.001 ? -1 : 1);
  if (turn && hullFree(b.x, b.y, b.a + turn)) b.a += turn;
  const nx = b.x + Math.cos(b.a) * b.v, ny = b.y + Math.sin(b.a) * b.v;
  if (hullFree(nx, ny, b.a)) { b.x = nx; b.y = ny; }
  else if (Math.abs(b.v) > 0.004) { b.v = -b.v * 0.3; SFX.thud(); }
  else b.v = 0;
  // Vanavesi perästä ja keulasta
  if (Math.abs(b.v) > 0.005 && ++b.wakeT % 3 === 0) {
    const sp = Math.min(0.04, Math.abs(b.v)), a = b.a, sx = b.x - Math.cos(a) * 1.6, sy = b.y - Math.sin(a) * 1.6;
    for (const side of [-1, 1]) wakes.push({ x: sx + -Math.sin(a) * side * 0.45, y: sy + Math.cos(a) * side * 0.45, vx: (-Math.sin(a) * side * 0.5 - Math.cos(a) * 0.4) * sp, vy: (Math.cos(a) * side * 0.5 - Math.sin(a) * 0.4) * sp, t: 0, life: 110 });
    if (b.wakeT % 12 === 0) ripples.push({ x: sx, y: sy, t: 0, life: 45, max: 3 + sp * 60, a: 0.45 });
  }
  if (player.boat) { player.x = b.x; player.y = b.y; }
  updateEngineSound();
}

// Perämoottorin ääni: kaksi matalaa värähtelijää alipäästösuotimen läpi; kierrokset ja voimakkuus
// seuraavat kaasua ja vauhtia. Moottori käy, kun kuljettaja on veneessä ajoasennossa.
let engine = null;
function updateEngineSound() {
  if (!actx) return;
  const on = player.boat && boat.rider === 'drive' && state === 'play';
  if (!engine) {
    if (!on) return;
    const o1 = actx.createOscillator(), o2 = actx.createOscillator(), lp = actx.createBiquadFilter(), g = actx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 520; g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(master);
    o1.start(); o2.start();
    engine = { o1, o2, lp, g };
  }
  const t = actx.currentTime, rev = Math.abs(boat.th) * 0.6 + Math.abs(boat.v) / BOAT_MAX * 0.4;
  engine.o1.frequency.setTargetAtTime(42 + rev * 70, t, 0.15);
  engine.o2.frequency.setTargetAtTime(21 + rev * 35, t, 0.15);
  engine.lp.frequency.setTargetAtTime(380 + rev * 700, t, 0.2);
  engine.g.gain.setTargetAtTime(on ? 0.035 + rev * 0.05 : 0, t, on ? 0.2 : 0.4);
}
const boatBob = () => Math.round(Math.sin(time * 0.045) * 0.6);
function drawBoat(camXr, camYr) {
  const b = boat, spr = BOAT_SPR[boatIdx(b.a)];
  const x = Math.round(isoX(b.x, b.y) - camXr) - spr.ax, y = Math.round(isoY(b.x, b.y) - camYr) - spr.ay + boatBob();
  if (x > W || y > H || x + spr.full.width < 0 || y + spr.full.height < 0) return;
  ctx.drawImage(spr.full, x, y);
  if (!b.rider) return;
  if (b.rider === 'drive') drawBoatRod(spr, x, y);
  drawBoatRider(spr, x, y);
  ctx.drawImage(spr.front, x, y);
}
// Ajon ajaksi onki lasketaan veneeseen: kahva pohjalla kuljettajan vieressä ja kärki roikkuu keulan yli
function drawBoatRod(spr, x, y) {
  // Vapa on lähes suora: kärki jatkaa kahvasta keulan laitaan kulkevaa linjaa, vain pieni notko lopussa
  const B = [-0.7, 0.36, 1.5], R = [1.5, 0.08, boatH(1.5) + 0.5], ext = 0.38;
  const butt = spr.P(...B), rest = spr.P(...R), tip = spr.P(R[0] + (R[0] - B[0]) * ext, R[1] + (R[1] - B[1]) * ext, R[2] + (R[2] - B[2]) * ext - 0.6);
  const ln = (a, c, col, oy = 0) => plotLine(ctx, x + a[0], y + a[1] + oy, x + c[0], y + c[1] + oy, col);
  ln(butt, rest, 'rgba(14, 10, 8, 0.7)', 1); ln(rest, tip, 'rgba(14, 10, 8, 0.6)', 1);   // tumma reuna
  ln(butt, rest, '#c89a5a'); ln(rest, tip, '#c89a5a');
  const k = spr.P(-0.45, 0.33, 1.7);
  ln(butt, k, '#d8a868');                                                               // korkkikahva
  dot(x + butt[0] + 1, y + butt[1], '#6a7078');                                        // kela
  dot(x + tip[0], y + tip[1], '#f4f4ec');
}

// Istuvan hahmon yläruumis (hahmon kuvan ylimmät rivit) omana kuvanaan
const seatedCache = new Map();
function seatedImg(img, h) {
  if (!seatedCache.has(img)) { const c = makeCanvas(img.width, h); c.getContext('2d').drawImage(img, 0, 0); seatedCache.set(img, c); }
  return seatedCache.get(img);
}

// Kyydissä oleva hahmo. Seisova hahmo on veneen keskellä; kuljettaja istuu perässä kasvot menosuuntaan
// ja pitää oikealla kädellä perämoottorin ohjauskahvasta.
function drawBoatRider(spr, x, y) {
  const b = boat, [hx, hy] = screenDir(Math.cos(b.a), Math.sin(b.a));
  const av = Math.atan2(hy, Math.abs(hx)), view = VIEW_ORDER[clamp(Math.round((av + Math.PI / 2) / (Math.PI / 4)), 0, 4)], flip = hx < 0;
  if (b.rider === 'stand' && player.boat && playerShown()) {
    // Pelaaja seisoo veneessä: tavallinen hahmo onkineen ja siimoineen
    const cr = Math.round(cam.x), cyr = Math.round(cam.y);
    drawPlayer(isoX(player.x, player.y) - cr, isoY(player.x, player.y) - cyr, cr, cyr);
    return;
  }
  if (b.rider === 'stand') {
    const [px, py] = spr.P(0, 0, 1), img = PLAYER_SPR[view][0].img;
    drawImg(img, x + px - 8, y + py - 20, flip);
    return;
  }
  // Istuva kuljettaja peräistuimella: hahmon kuvasta yläruumis, ja jalat piirretään erikseen veneen
  // suunnassa: reidet istuimelta eteenpäin hieman koholla oleviin polviin ja sääret polvista pohjalle.
  const seatU = -1.1, seatZ = boatH(seatU) - 1;
  const [px, py] = spr.P(seatU + 0.08, 0, seatZ), img = PLAYER_SPR[view][0].img, h = 15;
  const dx = Math.round(x + px - 8), dy = Math.round(y + py - h);
  const legs = () => {
    for (const side of [-0.14, 0.14]) {
      const hip = spr.P(seatU + 0.1, side, seatZ + 1), knee = spr.P(seatU + 0.55, side, seatZ + 2.5), foot = spr.P(seatU + 0.7, side, 1);
      // Paksu jalka: kolme pikseliä korkea ja kaksi leveä viiva
      const L = (a, c, col) => { for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]) plotLine(ctx, x + a[0] + ox, y + a[1] + oy, x + c[0] + ox, y + c[1] + oy, col); };
      L(hip, knee, side < 0 ? '#6a523a' : '#5a4632');
      L(knee, foot, side < 0 ? '#5a4632' : '#4a3a2a');
      ctx.fillStyle = '#22180e'; ctx.fillRect(Math.round(x + foot[0]) - 1, Math.round(y + foot[1]) + 1, 4, 2);   // saapas
    }
  };
  const legsFront = spr.P(seatU + 0.55, 0, 0)[1] > spr.P(seatU, 0, 0)[1];   // polvet katsojaa kohti
  if (!legsFront) legs();
  const top = seatedImg(img, h);
  drawImg(top, dx, dy, flip);
  if (legsFront) legs();
  // Otsalamppu ja sen valo lähtevät istuvan kuljettajan päästä; valosta leikataan hahmon yläruumis
  if (b === boat && player.boat) {
    Object.assign(shownPlayer, { img: top, x: dx, y: dy, flip, hx: dx + 8, hy: dy + 3 });
    const V = VIEW_INFO[view];
    if (player.light && V.lamp >= 0) {
      const lx = dx + 1 + (flip ? 13 - V.lamp : V.lamp), ly = dy + 2;
      shownPlayer.hx = lx; shownPlayer.hy = ly;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 245, 210, ${(0.06 + nightAmt() * 0.12).toFixed(3)})`;
      ctx.fillRect(lx - 1, ly - 1, 3, 3);
      ctx.globalCompositeOperation = 'source-over';
      dot(lx, ly, '#ffffff');
    }
  }
  // Oikea käsi ohjauskahvalla: hihasta kahvaan
  const [gx, gy] = spr.P(-1.15, 0.12, boatH(-1.5) + 2), sh = [x + px + (flip ? -3 : 3), y + py - 8];
  plotLine(ctx, sh[0], sh[1], x + gx, y + gy, '#6c8c40');
  dot(x + gx, y + gy, '#f6d0ac');
}
// Veneen veden alle jäävä osa (vedenalaiselle kerrokselle, häivytettynä)
function drawBoatUnder(g, camXr, camYr) {
  if (!boat) return;
  const spr = BOAT_SPR[boatIdx(boat.a)];
  const x = Math.round(isoX(boat.x, boat.y) - camXr) - spr.ax, y = Math.round(isoY(boat.x, boat.y) - camYr) - spr.ay + boatBob();
  g.globalAlpha = underVis(0.3);
  g.drawImage(spr.under, x, y);
  g.globalAlpha = 1;
}
// Veneen heijastus: valmiiksi peilattu kuva (refl) samaan ankkuriin kuin vene; kuljettajan yläruumis
// peilataan istuimen kohdalla vedenpinnan alle. Heijastus tummennetaan ja rajataan veden alueelle.
const boatReflC = makeCanvas(72, 72), boatReflCtx = boatReflC.getContext('2d');
function drawBoatReflection(camXr, camYr) {
  if (!boat || !water.show) return;
  const spr = BOAT_SPR[boatIdx(boat.a)], g = boatReflCtx;
  const rx = Math.round(isoX(boat.x, boat.y) - camXr) - spr.ax + Math.round(Math.sin(time * 0.05) * wind.gust);
  const ry = Math.round(isoY(boat.x, boat.y) - camYr) - spr.ay - boatBob();
  if (rx > W || ry > H || rx + 72 < 0 || ry + 72 < 0) return;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, 72, 72);
  // Alimmaisena perämoottori, sen päällä kyydissä olevan hahmon heijastus ja päällimmäisenä veneen laidat
  g.drawImage(spr.reflMotor, 0, 0);
  if (boat.rider) {
    // Kyydissä olevan hahmon heijastus: kuva käännetään ylösalaisin vedenpinnan kohdalla
    const [hx, hy] = screenDir(Math.cos(boat.a), Math.sin(boat.a));
    const av = Math.atan2(hy, Math.abs(hx)), view = VIEW_ORDER[clamp(Math.round((av + Math.PI / 2) / (Math.PI / 4)), 0, 4)];
    const sit = boat.rider === 'drive', img = PLAYER_SPR[player.boat && !sit ? player.view : view][0].img, flip = player.boat && !sit ? player.flip : hx < 0;
    const [sx, sy] = spr.P(sit ? -1.02 : 0, 0, 0), base = sit ? boatH(-1.1) - 1 : 1, h = sit ? 15 : 21;
    g.save();
    g.translate(Math.round(sx - 8) + (flip ? 16 : 0), Math.round(sy + base + h));
    g.scale(flip ? -1 : 1, -1);
    g.drawImage(img, 0, 0, 16, h, 0, 0, 16, h);
    g.restore();
  }
  g.drawImage(spr.refl, 0, 0);
  reflCtxAll.drawImage(boatReflC, rx, ry);
}

// Sorsien heijastukset: uivan sorsan peilikuva vesirajan alla ja matalalla lentävän sorsan peilikuva
// yhtä syvällä pinnan alla kuin sorsa on sen yläpuolella (himmenee korkeuden mukaan). Heijastukset
// piirretään tähtien vertailukuvan jälkeen, joten tähdet eivät näy niiden kohdalla.
const duckReflC = makeCanvas(16, 16), duckReflCtx = duckReflC.getContext('2d');
function drawDuckReflection(d, camXr, camYr) {
  const sx = Math.round(isoX(d.x, d.y) - camXr), sy = Math.round(isoY(d.x, d.y) - camYr);
  if (sx < -10 || sx > W + 10 || sy < -4 || sy > H + 40 || !waterPx(sx + camXr, sy + camYr)) return;
  const set = DUCK_SPR[d.male ? 'm' : 'f'], flying = d.z > 0.5 || d.mode === 'scramble';
  const img = d.mode === 'scramble' ? (Math.floor(d.anim / 3) % 2 ? set.fly0 : set.fly1)
    : d.z > 0.5 ? (Math.floor(d.anim / 5) % 2 ? set.fly0 : set.fly1)
    : d.mode === 'dabble' ? set.dabble : d.mode === 'sleep' ? set.sleep : set.swim;
  // Kuvan yläreuna ruudulla ja sen peilaus vedenpinnan (sy + 1) suhteen
  const top = d.mode === 'scramble' ? sy - 4 : flying ? sy - Math.round(d.z) - 3 : sy - img.height + 1;
  const ox = flying ? sx - 5 : sx - 4, mirrorTop = 2 * (sy + 1) - (top + img.height);
  const g = reflCtxAll;
  g.save();
  g.globalAlpha = flying ? Math.max(0, 1 - d.z / 24) : 1;
  g.translate(ox + (d.flip ? img.width : 0), mirrorTop + img.height); g.scale(d.flip ? -1 : 1, -1);
  g.drawImage(img, 0, 0);
  g.restore();
}

// Kaikki heijastukset (hahmo, vene ja sorsat) kootaan yhdelle kerrokselle kaukaa lähelle, jolloin lähempi
// heijastus peittää taaemman. Kerros tummennetaan, rajataan veden alueelle ja piirretään läpikuultavana.
const reflAll = makeCanvas(1, 1), reflCtxAll = reflAll.getContext('2d');
function drawReflections(camXr, camYr) {
  if (!water.show) return;
  if (gfxLow && (time & 1) && reflAll.width === W && reflAll.height === H) { ctx.globalAlpha = 0.42; ctx.drawImage(reflAll, 0, 0); ctx.globalAlpha = 1; return; }   // kevyt tila: edellinen kuva
  if (reflAll.width !== W || reflAll.height !== H) { reflAll.width = W; reflAll.height = H; }
  const g = reflCtxAll;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  const items = [{ d: player.x + player.y, fn: () => drawPlayerReflection(camXr, camYr) }];
  if (boat) items.push({ d: boat.x + boat.y, fn: () => drawBoatReflection(camXr, camYr) });
  for (const dk of ducks) if (dk.z <= 24) items.push({ d: dk.x + dk.y, fn: () => drawDuckReflection(dk, camXr, camYr) });
  for (const gb of grebes) if (gb.z <= 24) items.push({ d: gb.x + gb.y, fn: () => drawGrebeReflection(gb, camXr, camYr) });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.fn();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(16, 26, 34, 0.45)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(pondMaskCanvas, PB.x0 - camXr, PB.y0 - camYr);
  g.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.42;
  ctx.drawImage(reflAll, 0, 0);
  ctx.globalAlpha = 1;
}

// Pelaajan heijastus vedenpinnasta: hahmon kuva peilataan vedenpinnan tasossa (laiturilla kannen alta)
// ja rajataan lammen alueelle. Heijastus on tumma ja läpikuultava ja väreilee tuulessa; se näkyy esim.
// laiturilla ja lammen pohjoisrannalla, kun vettä on hahmon edessä ruudulla.
const reflCanvas = makeCanvas(16, 21), reflCtx = reflCanvas.getContext('2d');
function drawPlayerReflection(camXr, camYr) {
  if (!water.show || !playerShown() || player.boat || shoreDist(player.x, player.y) > 4) return;
  const p = player, spr = playerSpr(p).img;
  const sx = Math.round(isoX(p.x, p.y) - camXr), sy = Math.round(isoY(p.x, p.y) - camYr), lift = playerLift();
  // Peilikuva: kuvan rivi y siirtyy vedenpinnan (sy) alle samalle etäisyydelle
  const rx = sx - 8 + Math.round(Math.sin(time * 0.05) * wind.gust), ry = sy + lift - 2;
  const g = reflCtx;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, 16, 21);
  g.save(); g.translate(p.flip ? 16 : 0, 21); g.scale(p.flip ? -1 : 1, -1); g.drawImage(spr, 0, 0); g.restore();
  reflCtxAll.drawImage(reflCanvas, rx, ry);
}

// Pelaajan viimeksi piirretty kuva ja pään paikka ruudulla (otsalampun valo lasketaan niiden mukaan)
const shownPlayer = { img: null, x: 0, y: 0, flip: false, hx: 0, hy: 0 };

function drawPlayer(sx, sy, camXr, camYr) {
  const p = player, V = VIEW_INFO[p.view];
  sx = Math.round(sx); sy = Math.round(sy) - playerLift();
  drawShadow(sx, sy);
  const spr = playerSpr(p);
  // Selässä oleva onki on suunnasta riippuen repun takana tai edessä. Kädessä oleva onki
  // osoittaa katsesuuntaan: poispäin katsottaessa se on hahmon takana.
  const RB = ROD_BACK[playerDir()];
  const AB = AXE_POS[playerDir()];
  if (!p.rod && !RB.front) drawBackRod(sx, sy, p.flip, RB.x);
  if (p.tool !== 'axe' && !AB.front) drawBackAxe(sx, sy, AB, p.flip);
  if (p.rod && V.away) drawHeldRod(camXr, camYr);
  // Työkalu on oikeassa kädessä: kun oikea puoli on vartalon takana (W, SW) tai hahmo katsoo poispäin, työkalu ja käsi piirretään
  // vartalon taakse, jolloin vartalo peittää ne iskun aikana osittain
  // Oikealle katsottaessa (E, SE, NE) työkalu on aina vartalon edessä.
  const rFar = !!p.tool && ARM_DEPTH[playerDir()].R === 'far', behind = rFar || (V.away && playerDir() !== 'NE');
  if (p.tool && rFar) drawToolArms(sx, sy, 'far');
  if (p.tool && behind) drawHeldTool(sx, sy);
  drawImg(spr.img, sx - 8, sy - 19, p.flip);
  Object.assign(shownPlayer, { img: spr.img, x: sx - 8, y: sy - 19, flip: p.flip, hx: sx, hy: sy - 16 });
  // Otsalamppu hatun etuosassa: valkoinen piste näkyy vain, kun hahmo ei katso poispäin
  if (p.light && V.lamp >= 0) {
    const lx = sx - 7 + (p.flip ? 13 - V.lamp : V.lamp), ly = sy - 17;
    shownPlayer.hx = lx; shownPlayer.hy = ly;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255, 245, 210, ${(0.06 + nightAmt() * 0.12).toFixed(3)})`;
    ctx.fillRect(lx - 1, ly - 1, 3, 3);
    ctx.globalCompositeOperation = 'source-over';
    dot(lx, ly, '#ffffff');
  }
  if (!p.rod && RB.front) drawBackRod(sx, sy, p.flip, RB.x);
  if (p.tool !== 'axe' && AB.front) drawBackAxe(sx, sy, AB, p.flip);
  if (p.tool) {
    // Työkalu oikeassa kädessä: kauempi käsi ennen työkalua, lähempi sen päällä
    if (!rFar) { drawToolArms(sx, sy, 'far'); if (!behind) drawHeldTool(sx, sy); }
    drawToolArms(sx, sy, 'near');
  }
  // Kauempi käsi ennen onkea (onki peittää sen), lähempi käsi onkea pitämässä sen päällä
  if (p.rod) drawArms(sx, sy, camXr, camYr, 'far');
  if (p.rod && !V.away) drawHeldRod(camXr, camYr);
  if (p.rod) drawArms(sx, sy, camXr, camYr, 'near');
}

// Kelaus: onki on oikeassa kädessä ja vasen käsi pitää kelasta. Kelatessa (hiiri pohjassa, viehe vedessä)
// vasen käsi kiertää kampea; muulloin se lepää kelalla. Kelan kampi pyörii samaa vauhtia kuin tähtäimen kela.
const isReeling = () => player.rod && cast.lure && cast.lure.st !== 'fly' && (mouseHeld || touch.cast) && state === 'play';
const handCrank = { a: 0 };
// Olkapäiden paikat hahmon jalkapisteestä [x, y] kuvan suuntien mukaan (oikea ja vasen käsi). Vasen käsi
// puuttuu koillisesta, jossa se on repun takana. Käsivarsi on kaksiosainen: olkapäästä kyynärpäähän ja
// kyynärpäästä käteen; kyynärpää on olkapään ja käden puolivälissä hieman alempana ja ulompana.
const SHOULDER_R = { S: [-4, -10], SE: [-3, -10], E: [2, -10], NE: [5, -11], N: [5, -11], NW: [4, -10], W: [-1, -11], SW: [-5, -10] };
const SHOULDER_L = { S: [4, -10], SE: [4, -10], E: [1, -11], N: [-6, -11], NW: [-6, -11], W: [-3, -10], SW: [3, -10] };
// Kumpi käsi on ongen takana (far: piirretään ennen onkea, jolloin onki peittää sen) ja kumpi edessä (near).
// Itään katsottaessa oikea käsi on kameraa kohti ja vasen ongen takana, länteen katsottaessa päinvastoin.
// Kelaavan käden siirtymä ruudulla (x, y) suunnittain: kameraa kohti katsoessa oikea käsi on kahvassa suoraan kelan alla,
// joten kela-käsi siirretään vasemmalle, jotta kämmenet eivät ole päällekkäin
const REEL_HAND_OFF = { S: [4, 0] };
const ARM_DEPTH = {
  S: { L: 'near', R: 'near' }, SE: { L: 'far', R: 'near' }, E: { L: 'far', R: 'near' }, NE: { R: 'near' },
  N: { L: 'near', R: 'near' }, NW: { L: 'near' }, W: { L: 'near', R: 'far' }, SW: { L: 'near', R: 'far' },
};
// Käsivarsi (takin väri, tummempi alareuna) ja käsi (iho, tumma reuna oikealla ja alla sekä ylhäällä)
function drawArm(sx0, sy0, hx, hy, out, away, wx = 0, wy = 0) {
  hx = Math.round(hx); hy = Math.round(hy);
  if (away) {
    // Poispäin katsottaessa kädet ovat hahmon edessä: näkyy vain olkavarsi kiinni kehon kyljessä (kuten kuvan
    // omat käsivarret), ja kyynärtaipeessa kyynärvarsi kääntyy sisään vatsan taakse piiloon. Kämmentä ei näy.
    // Kyynärpää liikkuu hieman kelatessa (wx, wy).
    const o = out < 0 ? -1 : 1, ex = sx0 + Math.round(wx * 0.5), ey = sy0 + 3 + Math.round(wy * 0.5);
    plotLine(ctx, sx0 + o, sy0, ex + o, ey, '#120c0a'); dot(ex + o, ey + 1, '#120c0a'); dot(ex, ey + 1, '#120c0a');   // ääriviiva ulkoreunassa
    plotLine(ctx, sx0, sy0, ex, ey, '#6c8c40');
    dot(ex, ey, '#40541e'); dot(ex - o, ey, '#22300f');                                                                // kyynärtaive: käsi kääntyy sisään
    return;
  }
  const ex = Math.round((sx0 + hx) / 2 + out), ey = Math.round((sy0 + hy) / 2 + 2);
  plotLine(ctx, sx0, sy0 + 1, ex, ey + 1, '#22300f'); plotLine(ctx, ex, ey + 1, hx, hy + 1, '#22300f');   // tumma alareuna
  plotLine(ctx, sx0, sy0, ex, ey, '#6c8c40'); plotLine(ctx, ex, ey, hx, hy, '#6c8c40');
  plotLine(ctx, sx0, sy0 - 1, ex, ey - 1, '#8aa856');                                                      // valoisa yläreuna
  ctx.fillStyle = '#2a2018'; ctx.fillRect(hx - 1, hy - 1, 4, 1); ctx.fillRect(hx + 2, hy, 1, 3); ctx.fillRect(hx - 1, hy + 2, 3, 1); ctx.fillRect(hx - 1, hy, 1, 2);
  ctx.fillStyle = '#f6d0ac'; ctx.fillRect(hx, hy, 2, 2);
  ctx.fillStyle = '#d29c7c'; ctx.fillRect(hx, hy + 1, 2, 1);
}
// Piirtää kädet, joiden syvyys (far / near) on phase. Oikea käsi pitää ongen kahvasta, vasen kelasta
// (kela on ongen kahvan edessä); poispäin katsottaessa (N, NW) vasen käsi kiertää kampea kyljellä.
function drawArms(sx, sy, camXr, camYr, phase) {
  const dir = playerDir(), depth = ARM_DEPTH[dir], rate = isReeling() ? handCrank.a : null;
  const g = rodGeom(), gx = g.hx - camXr, gy = g.hy - camYr, l = Math.hypot(g.tx - g.hx, g.ty - g.hy) || 1;
  const outwards = (x) => (dir === 'E' || dir === 'W' ? 0 : x < 0 ? -1.5 : 1.5), away = VIEW_INFO[player.view].away;
  // Vasen käsi ensin, jolloin oikea käsi (ote kahvasta) jää sen päälle
  if (depth.L === phase && SHOULDER_L[dir]) {
    // Kampi pyörii pystytasossa ongen suuntaan: oikealle katsoessa kierto näkyy myötäpäivään, vasemmalle vastapäivään
    // (vaakakomponentti kerrotaan katsesuunnan x-komponentilla), ja kameraa kohti tai poispäin katsoessa taso on
    // sivuttain, jolloin käsi liikkuu vain ylös ja alas.
    const s0 = SHOULDER_L[dir], c = rate === null ? 0 : Math.cos(rate) * 1.6 * player.gux, d = rate === null ? 0 : Math.sin(rate) * 1.6;
    if (away) drawArm(sx + s0[0], sy + s0[1], 0, 0, outwards(s0[0]), true, c * 0.9, d * 0.9);
    else { const off = REEL_HAND_OFF[dir] || [0, 0]; drawArm(sx + s0[0], sy + s0[1], gx + ((g.tx - g.hx) / l) * 3 + 0.5 + c + off[0], gy + ((g.ty - g.hy) / l) * 3 + 1 + d + off[1], outwards(s0[0]), false); }
  }
  if (depth.R === phase) { const s0 = SHOULDER_R[dir]; drawArm(sx + s0[0], sy + s0[1], gx, gy, outwards(s0[0]), away); }
}

// Vaapulla kelattaessa siima kulkee ongen kärjestä lähes suorana (pieni painovoiman notko) vaappuun tai
// kalan suuhun asti myös veden alla, toisin kuin koho-onginnassa. Siima läpäisee pinnan kohdassa, jossa
// suora viiva kärjen korkeudelta vaapun syvyyteen leikkaa vedenpinnan. Palauttaa ruutupisteet tai null.
function wobblerLine(camXr, camYr) {
  const L = cast.lure;
  if (!L || !isDirect(L.kind) || L.st !== 'float' || !L.onWater) return null;
  const f = L.fish;
  if (f && (f.mode === 'land' || f.mode === 'caught')) return null;
  const slack = lineSlack(L);
  if (!f && L.z < 0.03 && slack > 0.3) return null;   // löysä siima pinnalla kelluvaan vaappuun
  // Veden pinnan taso ongen kärjen alla ruudulla: kärjen maapiste (g.gy) on seisontapinnan korkeudella, laituri ja vene nostavat sitä (playerLift)
  const g = rodGeom(), tx = g.tx - camXr, ty = g.ty - camYr, gy = g.gy + playerLift() - camYr;
  let sx, sy, ex, ey;
  if (f) {
    const [mdx, mdy] = fishMouthScreen(f);
    sx = isoX(f.x, f.y) - camXr + mdx; sy = isoY(f.x, f.y) - camYr + mdy; ey = sy + f.z * Z_PX;
  } else { sx = isoX(L.x, L.y) - camXr; sy = isoY(L.x, L.y) - camYr; ey = sy + L.z * Z_PX; }
  ex = sx;
  const H0 = Math.max(1, gy - ty), dz = ey - sy;   // kärjen korkeus pinnasta ja vieheen syvyys (px)
  // Siima on yksi jatkuva kaari kärjestä vieheeseen: suora (korkeus H0 -> -dz) josta löysän siiman verran notkoa keskellä.
  // Pinnan yläpuolinen ja alapuolinen osa ovat saman käyrän osia, joten pinnan kohdalla ei ole kulmaa.
  const sagPx = Math.min(8, slack * Z_PX * 0.8), n = 40, up = [[tx, ty]], dn = [];
  let prev = null, crossed = false, wx = sx, wy = sy;
  for (let i = 1; i <= n; i++) {
    const u = i / n, hh = H0 - (H0 + dz) * u - sagPx * 4 * u * (1 - u);
    const x = lerp(tx, sx, u), y = lerp(gy, sy, u) - hh;
    if (!crossed && hh < 0) {
      // Läpäisykohta: pinnan (hh = 0) ja edellisen pisteen välinen leikkaus
      const [ox, oy, oh] = prev || [tx, ty, H0], f = oh / (oh - hh || 1);
      wx = lerp(ox, x, f); wy = lerp(oy, y, f);
      up.push([wx, wy]); dn.push([wx, wy]); crossed = true;
    }
    (crossed ? dn : up).push([x, y]);
    prev = [x, y, hh];
  }
  if (!crossed) { wx = sx; wy = sy; }
  return { tx, ty, wx, wy, ex, ey, depth: dz / Z_PX, sag: 1 + Math.min(3, slack * 3), up, dn };
}
// Piirtää pisteketjun murtoviivana
function plotPts(g, pts, col) { for (let i = 1; i < pts.length; i++) plotLine(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col); }

// Heitetty siima: lennon aikana suora; vedessä kireä siima on lähes suora, löysä siima laskeutuu
// kärjestä pintaan ja loppumatka kiemurtelee kasana pinnalla
function drawCastLine(g, camXr, camYr) {
  const L = cast.lure, col = 'rgba(225, 230, 235, 0.55)';
  const tx = g.tx - camXr, ty = g.ty - camYr;
  if (L.st === 'fly') {
    plotLine(ctx, tx, ty, L.ax - camXr, L.ay - camYr, col);
    if (isArt(L.kind)) drawArtAt(L.kind, Math.round(L.ax - camXr), Math.round(L.ay - camYr), L.ax > L.ax0 ? 1 : -1, false);
    else if (isRig(L.kind)) {
      // Puntti lentää edellä, sivuhaara ja syötti perässä
      const fx = Math.round(L.ax - camXr), fy = Math.round(L.ay - camYr);
      plotLine(ctx, fx, fy - 2, fx + (L.ax > L.ax0 ? -3 : 3), fy - 4, 'rgba(210, 214, 218, 0.8)');
      drawRigBait(L.kind, fx + (L.ax > L.ax0 ? -3 : 3), fy - 4);
      drawSinkerAt(fx, fy);
    } else drawBobberAt(Math.round(L.ax - camXr), Math.round(L.ay - camYr), false);
    return;
  }
  if (L.fish && L.fish.mode === 'caught') {
    // Saalis roikkuu ilmassa ongen kärjestä pää ylöspäin ja sätkii
    const f = L.fish, img = FISH_SPR[fishSprKey(f)][f.px].side[(f.anim >> 2) % 2];
    plotLine(ctx, tx, ty, tx, ty + 6, col);
    if (!isArt(L.kind)) drawBobberAt(Math.round(tx), Math.round(ty + 4), false);
    ctx.save();
    ctx.translate(Math.round(tx) + Math.round(Math.sin(f.anim * 0.5)), Math.round(ty + 7));
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -img.width, -(img.height >> 1));
    ctx.restore();
    return;
  }
  const wl = wobblerLine(camXr, camYr);
  if (wl) {
    // Pinnan yläpuolinen osa kärjestä vedenpinnan läpäisykohtaan (sama kaari kuin veden alla)
    plotPts(ctx, wl.up, col);
    return;
  }
  const lx = isoX(L.x, L.y) - camXr, ly = lureY(L) - camYr;
  const slack = lineSlack(L);
  // Löysä siima lepää pinnalla tai laiturilla
  const restY = (wx, wy) => isoY(wx, wy) - camYr - (onDock(wx, wy) ? DOCK_Z : 0);
  const curve = (x0, y0, cx, cy, x1, y1) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      plotLine(ctx, px, py, x, y, col); px = x; py = y;
    }
  };
  // Siima roikkuu kärjen ja kohon välillä: notko syvenee löysän siiman mukana. Kun notkon pohja ulottuu
  // vedenpintaan (kärjen ja kohon välisen linjan alla oleva pinta), loppu löysä siima lepää pinnalla.
  const surfMid = (g.gy + playerLift() - camYr + ly) / 2, hMid = Math.max(2, surfMid - (ty + ly) / 2);
  const sag = 2 + slack * 16;
  if (sag < hMid) { curve(tx, ty, (tx + lx) / 2, (ty + ly) / 2 + sag * 2, lx, ly); return; }
  const rest = slack - (hMid - 2) / 16;   // pinnalle jäävä osa löysästä siimasta
  const f = clamp(0.3 - rest * 0.03, 0.06, 0.3);
  const O0 = rigOrigin(), wx = O0.x + (L.x - O0.x) * f, wy = O0.y + (L.y - O0.y) * f;
  const P = { x: isoX(wx, wy) - camXr, y: restY(wx, wy) };
  curve(tx, ty, tx + (P.x - tx) * 0.3, P.y, P.x, P.y);
  const n = Math.max(2, Math.ceil(Math.hypot(lx - P.x, ly - P.y) / 2)), amp = Math.min(3, rest * 0.7);
  const ux = (lx - P.x) / (n * 2 || 1), uy = (ly - P.y) / (n * 2 || 1), ul = Math.hypot(ux, uy) || 1;
  let px = P.x, py = P.y;
  for (let i = 1; i <= n; i++) {
    const t = i / n, w = Math.sin(i * 0.8) * amp * Math.sin(Math.PI * t);
    const qx = wx + (L.x - wx) * t, qy = wy + (L.y - wy) * t;
    const x = isoX(qx, qy) - camXr - (uy / ul) * w, y = (i === n ? ly : restY(qx, qy)) + (ux / ul) * w * 0.5;
    plotLine(ctx, px, py, x, y, col); px = x; py = y;
  }
}

// Laiturille pudonnut viehe on kannen korkeudella
const lureLift = (L) => (!L.onWater && onDock(L.x, L.y) ? DOCK_Z : 0);

// Koho: vedessä kelluessa näkyy punainen yläosa ja puolet valkoisesta, maassa se makaa kyljellään
// Kohon kärjessä on neonvihreä valopiste. Sen hehku piirretään yön pimennyksen päälle (drawGlows),
// jotta koho näkyy myös pimeällä; pinnan alle vedetyn kohon valo himmenee (glow = voimakkuus 0–1).
let glows = [];
// Onko seuraavaksi piirrettävä koho hahmon takana (silloin hahmo peittää valon hehkun)
let bobberBehind = false;
const behindPlayer = (x, y) => playerShown() && x + y < player.x + player.y;
function drawBobberAt(x, y, floating, lying, glow = 1) {
  if (lying) {
    dot(x - 2, y - 1, '#7dff5a'); glows.push({ x: x - 2, y: y - 1, a: glow * 0.8, behind: bobberBehind });
    ctx.fillStyle = '#d8241c'; ctx.fillRect(x - 1, y - 1, 2, 1);
    ctx.fillStyle = '#f0f0ea'; ctx.fillRect(x + 1, y - 1, 2, 1);
    return;
  }
  dot(x, y - 4, '#7dff5a'); glows.push({ x, y: y - 4, a: glow, behind: bobberBehind });
  ctx.fillStyle = '#d8241c'; ctx.fillRect(x - 1, y - 3, 2, 2);
  ctx.fillStyle = '#ff6a50'; ctx.fillRect(x - 1, y - 3, 1, 1);
  ctx.fillStyle = '#f0f0ea'; ctx.fillRect(x - 1, y - 1, 2, floating ? 1 : 2);
  if (floating) {
    ctx.fillStyle = `rgba(${env.ring}, 0.6)`; ctx.fillRect(x - 2, y, 4, 1);
    ctx.fillStyle = 'rgba(216, 36, 28, 0.3)'; ctx.fillRect(x - 1, y + 1, 2, 1);
  }
}

// Vaappu: pieni (noin 3 px) harmaansininen viehe, jonka nokan alla on läpikuultava kieli.
// dir = 1 nokka oikealle, -1 vasemmalle. Vedettäessä pyrstö heiluu puolelta toiselle (wiggle).
function drawWobblerAt(x, y, dir, wiggle) {
  const w = wiggle ? (Math.sin(time * 0.9) > 0 ? -1 : 1) : 0;
  dot(x - dir, y - 1 + w, '#4c6276');                 // pyrstö
  dot(x, y - 1, '#4c6276'); dot(x + dir, y - 1, '#5a7088');
  dot(x - dir, y + w, '#7890a8'); dot(x, y, '#b8c8d8'); dot(x + dir, y, '#101418');
  dot(x + dir * 2, y + 1, 'rgba(208, 224, 232, 0.8)'); // kieli
}
// Lippa: pieni (noin 3 px) vihreä lehti, jossa on oranssi kuvio; vedettäessä se kiepsahtelee ja välkkyy
function drawSpoonAt(x, y, dir, moving) {
  const flip = moving && Math.sin(time * 0.7) > 0;
  dot(x + dir, y - 1, '#9aa0a8');                                      // lenkki
  dot(x, y - 1, flip ? '#f08a24' : '#3c9a3c'); dot(x - dir, y - 1, '#2e7a30');
  dot(x, y, flip ? '#3c9a3c' : '#f08a24'); dot(x - dir, y, flip ? '#e0a040' : '#3c9a3c');
  dot(x - dir * 2, y + 1, '#c0c6cc');                                  // koukku
}
const drawArtAt = (kind, x, y, dir, moving) => (kind === 'spoon' ? drawSpoonAt(x, y, dir, moving) : drawWobblerAt(x, y, dir, moving));

// Vaappu osoittaa kohti pelaajaa (siihen suuntaan sitä vedetään)
const wobblerDir = (L, camXr) => (isoX(player.x, player.y) - camXr >= isoX(L.x, L.y) - camXr ? 1 : -1);

// Vedessä kelluva tai maassa makaava koho (lennossa oleva piirretään siiman kanssa, kalan veden alle
// vetämä vedenalaisten kanssa). Maalle vedetty kala sätkii kohon vieressä.
function drawLure(camXr, camYr) {
  const L = cast.lure;
  if (!L || L.st !== 'float') return;
  const f = L.fish;
  if (f && f.mode === 'land') {
    const fx = Math.round(isoX(f.x, f.y) - camXr), fy = Math.round(isoY(f.x, f.y) - camYr - f.hop);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(fx - (f.px >> 1), Math.round(isoY(f.x, f.y) - camYr), f.px, 1);
    drawFishImg(f, fx, fy, (f.anim >> 3) % 2 === 0, f.anim >> 2);
    return;
  }
  if (f && f.mode === 'caught') return;
  if (L.sub > 0.05) return;
  const x = Math.round(isoX(L.x, L.y) - camXr), y = Math.round(lureY(L) - camYr);
  if (isArt(L.kind)) {
    // Kalan suussa olevaa uistinta ei piirretä; pinnalla oleva uistin heiluu vedettäessä
    if (f) return;
    if (!L.onWater) { drawArtAt(L.kind, x, y - 1, 1, false); return; }
    if (L.z > 0.05) return;
    ctx.fillStyle = `rgba(${env.ring}, 0.5)`; ctx.fillRect(x - 2, y + 1, 5, 1);
    drawArtAt(L.kind, x, y, wobblerDir(L, camXr), L.moving);
    return;
  }
  if (isRig(L.kind)) {
    // Kalan suussa olevaa pohjaonkea ei piirretä; maalle jäänyt makaa kyljellään, vedessä puntti uppoaa heti
    if (f) return;
    if (!L.onWater) { drawSinkerAt(x, y - 1); drawRigBait(L.kind, x + 4, y); return; }
    drawRigAir(L, camXr, camYr, x, y);
    if (L.z > 0.05 || L.z < -0.05) return;
    ctx.fillStyle = `rgba(${env.ring}, 0.5)`; ctx.fillRect(x - 2, y + 1, 5, 1);
    drawSinkerAt(x, y);
    return;
  }
  // Kalan riuhtoessa koho nykii pinnalla
  const jerk = f && f.mode === 'fight' ? Math.round(rand(-1, 1)) : 0;
  bobberBehind = behindPlayer(L.x, L.y);
  if (L.onWater && L.flat) {
    // Poikittain pinnalla kelluva koho (kala kuljettaa sitä): piirretään 90 astetta kierrettynä
    ctx.save(); ctx.translate(x, y + 1); ctx.rotate(Math.PI / 2);
    drawBobberAt(0, 0, true);
    ctx.restore();
  } else if (L.onWater) drawBobberAt(x + jerk, y + Math.round(Math.sin(time * 0.08 + 1) * 0.6) + (jerk ? 1 : 0), true);
  else drawBobberAt(x, y, false, true);
}

// ---------------------------------------------------------------------------
// Polttopuukatos aukean takareunassa teltan oikealla puolella. Katos on 2,6 m pitkä ja 1,2 m syvä, ja sen
// avoin puoli osoittaa ruudulla oikealle eteen. Puu on vuosien säässä haalistunutta ja halkeillutta,
// pellissä on ruostetta ja reunoilla sammalta. Tolpat ovat suoraan maassa. Klapit pinotaan 5 klapin
// riveihin (4 riviä, enintään 20 klapia) ja jokainen klapi piirretään omana kuvanaan, joten katoksen kuva
// muuttuu klapien määrän mukaan.
// ---------------------------------------------------------------------------
// Paikalliset koordinaatit: a = pituussuunta (maailman y), b = syvyys (maailman x, avoin puoli b = D).
const SHED = { x0: 0, y0: 0, L: 2.6, D: 1.2, logs: 10, cap: 20, cols: 5 };
function placeShed() {
  // Haetaan aukean takaosasta paikka teltan oikealta puolelta, lähempää telttaa
  const tu = TENT.cx - TENT.cy;
  let best = null;
  for (let y0 = TENT.cy - 7; y0 <= TENT.cy + 1; y0++) for (let x0 = TENT.cx - 2; x0 <= TENT.cx + 7; x0++) {
    let ok = true;
    for (let cy = y0; cy < y0 + 3 && ok; cy++) for (let cx = x0; cx < x0 + 2 && ok; cx++) {
      if (type[cy * N + cx] !== T_CLEAR || !inClearing(cx + 0.5, cy + 0.5)) ok = false;
    }
    const mx = x0 + 0.6, my = y0 + 1.3;
    if (!ok || mx - my < tu + 0.5 || Math.hypot(mx - CAMP.cx - 0.5, my - CAMP.cy - 0.5) < 3 || Math.hypot(mx - TENT.cx - 1, my - TENT.cy - 1) < 2.6) continue;
    const score = (mx + my) + Math.abs(mx - my - tu - 1.5) * 0.6;   // takareuna (pieni x + y) ja lähellä telttaa
    if (!best || score < best.score) best = { x0, y0, score };
  }
  if (!best) best = { x0: TENT.cx + 2, y0: TENT.cy - 4 };
  SHED.x0 = best.x0 + 0.4; SHED.y0 = best.y0 + 0.2;
  for (let cy = best.y0; cy < best.y0 + 3; cy++) for (let cx = best.x0; cx < best.x0 + 2; cx++) type[cy * N + cx] = T_SHED;
}
// Vanha, haalistunut puu: sävy on harmaantuneen puun ja laiturin ruskean puun välimaastossa
const OLD = { lit: '#a18c70', mid: '#877257', dark: '#62513f', gap: '#2e2418', inner: '#5a4a38', floor: '#826d52', floorLine: '#57452f', post: '#8a7458', postLit: '#a68e6c' };
const shedCache = new Map();
function shedSprite(logs) {
  if (shedCache.has(logs)) return shedCache.get(logs);
  const { L, D } = SHED, ox = Math.ceil(L * 8) + 7, oy = 36, w = Math.ceil((L + D) * 8) + 14, h = Math.ceil((L + D) * 4) + oy + 6;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const P = (a, b, z) => [ox + (b - a) * 8, oy + (a + b) * 4 - z];
  const quad = (pts, col) => polyFill(g, pts, col);
  const ln = (p0, p1, col) => plotLine(g, p0[0], p0[1], p1[0], p1[1], col);
  const FLOOR = 3, WALL = 22, RF = 27, RB = 23;
  const post = (a, b, top) => { const p0 = P(a, b, 0), p1 = P(a, b, top); g.fillStyle = OLD.post; g.fillRect(Math.round(p0[0]) - 1, Math.round(p1[1]), 2, Math.round(p0[1] - p1[1]) + 1); g.fillStyle = OLD.postLit; g.fillRect(Math.round(p0[0]) - 1, Math.round(p1[1]), 1, Math.round(p0[1] - p1[1]) + 1); };
  // Takimmaiset tolpat ja takaseinä (sisäpuoli varjossa): vaakalaudat, joiden välissä raot
  post(0, 0, RB - 1);
  quad([P(0, 0, FLOOR), P(L, 0, FLOOR), P(L, 0, WALL), P(0, 0, WALL)], OLD.gap);
  for (let z = FLOOR + 1; z < WALL; z += 3) quad([P(0, 0, z), P(L, 0, z), P(L, 0, z + 2), P(0, 0, z + 2)], OLD.inner);
  // Kaukaisempi kylki (harvalaudoitus)
  for (let z = FLOOR + 1; z < WALL; z += 3) quad([P(0, 0, z), P(0, D, z), P(0, D, z + 2), P(0, 0, z + 2)], OLD.dark);
  // Lattia tolppien varassa vähän maan yläpuolella
  quad([P(0, 0, FLOOR), P(L, 0, FLOOR), P(L, D, FLOOR), P(0, D, FLOOR)], OLD.floor);
  for (let a = 0.18; a < L; a += 0.22) ln(P(a, 0, FLOOR), P(a, D, FLOOR), OLD.floorLine);
  // Klapit: rungot katoksen sisään (isometrinen syvyyssuunta) ja päädyt avoimelle puolelle, alimmasta rivistä ylöspäin.
  // Ensin kaikki rungot, sitten päädyt, jotta päädyt jäävät rungon päälle.
  const rnd = mulberry32(91), n = Math.min(logs, SHED.cap), logSh = Array.from({ length: n }, () => rnd());
  const logPos = (i) => { const col = i % SHED.cols, row = Math.floor(i / SHED.cols); return [0.34 + col * 0.48, FLOOR + 3 + row * 4]; };
  for (let i = 0; i < n; i++) {
    const [a0, z0] = logPos(i), sh = logSh[i];
    const [x0, y0] = P(a0, 0.14, z0), [x1, y1] = P(a0, D - 0.12, z0);
    const top = sh < 0.5 ? '#8a6040' : '#966a46', mid = sh < 0.5 ? '#66442a' : '#724c30', low = sh < 0.5 ? '#48301c' : '#533620', dk = '#33200f';
    for (let x = Math.round(x0); x < Math.round(x1) - 1; x++) {
      const y = Math.round(lerp(y0, y1, (x - x0) / (x1 - x0)));
      g.fillStyle = top; g.fillRect(x, y - 2, 1, 1);
      g.fillStyle = (x + i) % 3 === 0 ? low : mid; g.fillRect(x, y - 1, 1, 1);
      g.fillStyle = mid; g.fillRect(x, y, 1, 1);
      g.fillStyle = (x + i) % 4 === 1 ? dk : low; g.fillRect(x, y + 1, 1, 1);
    }
  }
  for (let i = 0; i < n; i++) {
    const [a0, z0] = logPos(i), sh = logSh[i];
    const [x, y] = P(a0, D - 0.12, z0);
    const bark = sh < 0.5 ? '#4a3020' : '#5a3a24', end = sh < 0.3 ? '#cfa46c' : sh < 0.7 ? '#bf9462' : '#ad8452';
    const X = Math.round(x), Y = Math.round(y);
    g.fillStyle = bark; g.fillRect(X - 1, Y - 2, 3, 1); g.fillRect(X - 2, Y - 1, 1, 2); g.fillRect(X + 2, Y - 1, 1, 2); g.fillRect(X - 1, Y + 1, 3, 1);
    g.fillStyle = end; g.fillRect(X - 1, Y - 1, 3, 2);
    g.fillStyle = '#ddb886'; g.fillRect(X - 1, Y - 1, 1, 1);
    g.fillStyle = '#93693c'; g.fillRect(X, Y, 1, 1);
  }
  // Lähempi kylki: umpinainen laudoitus, laudat hieman eri sävyisiä ja halkeilleita
  quad([P(L, 0, FLOOR), P(L, D, FLOOR), P(L, D, WALL), P(L, 0, WALL)], OLD.mid);
  for (let z = FLOOR + 3, k = 0; z < WALL; z += 3, k++) {
    if (k % 2) quad([P(L, 0, z - 2), P(L, D, z - 2), P(L, D, z), P(L, 0, z)], OLD.lit);
    ln(P(L, 0, z), P(L, D, z), OLD.gap);
  }
  // Etutolpat ja yläpalkki
  post(L, 0, RB - 1); post(0, D, RF - 1); post(L, D, RF - 1);
  quad([P(-0.05, D, WALL), P(L + 0.05, D, WALL), P(L + 0.05, D, RF - 1), P(-0.05, D, RF - 1)], OLD.mid);
  ln(P(-0.05, D, WALL), P(L + 0.05, D, WALL), OLD.gap);
  // Katto: tumma, ruosteinen profiilipelti, joka kallistuu eteenpäin; reunoilla sammalta
  const r0 = P(-0.18, -0.18, RB), r1 = P(L + 0.18, -0.18, RB), r2 = P(L + 0.18, D + 0.2, RF), r3 = P(-0.18, D + 0.2, RF);
  quad([r0, r1, r2, r3], '#38383c');
  for (let a = -0.1; a < L + 0.18; a += 0.16) ln(P(a, -0.18, RB), P(a, D + 0.2, RF), '#4a4a50');
  quad([r3, r2, P(L + 0.18, D + 0.2, RF - 2), P(-0.18, D + 0.2, RF - 2)], OLD.mid);
  quad([r1, r2, P(L + 0.18, D + 0.2, RF - 2), P(L + 0.18, -0.18, RB - 2)], OLD.dark);
  // Säänkulutus: kohinaa, puun syitä, ruostetta pellissä ja sammalta reunoilla
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const hsh = (x, y, k) => { const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = (y * w + x) * 4;
    if (!d[q + 3]) continue;
    const r = d[q], gg = d[q + 1], bb = d[q + 2], roof = r < 80 && Math.abs(r - bb) < 12;
    let v = (hsh(x, y, 1) - 0.5) * 16;
    if (!roof && hsh(x, Math.floor(y / 2), 2) > 0.86) v -= 14;           // halkeamat ja syyt
    d[q] = clamp(r + v, 0, 255); d[q + 1] = clamp(gg + v, 0, 255); d[q + 2] = clamp(bb + v, 0, 255);
    if (roof && hsh(x, y, 3) > 0.9) { d[q] = 110; d[q + 1] = 74; d[q + 2] = 50; }     // ruoste
    const n = hsh(Math.floor(x / 2), Math.floor(y / 2), 4);
    if (n > 0.93 && (roof || y > h - 14)) { d[q] = 86; d[q + 1] = 104; d[q + 2] = 58; }   // sammal
  }
  g.putImageData(img, 0, 0);
  outlineSprite(c, '#1a160f');
  const spr = { img: c, ax: ox, ay: oy, sil: silhouette(c) };
  shedCache.set(logs, spr);
  return spr;
}
function drawShed(camXr, camYr) {
  const spr = shedSprite(SHED.logs);
  ctx.drawImage(spr.img, Math.round(isoX(SHED.x0, SHED.y0) - camXr - spr.ax), Math.round(isoY(SHED.x0, SHED.y0) - camYr - spr.ay));
}

// Nuotio: varjostettu kivirengas, hiiltyneet halot, hehkuvat hiillos ja kerroksellinen liekki
const CAMP_STONES = (() => {
  const rnd = mulberry32(77);
  return Array.from({ length: 11 }, (_, k) => ({ a: (k / 11) * Math.PI * 2 + rnd() * 0.2, w: 2 + Math.floor(rnd() * 2) }));
})();
function drawCampfire(sx, sy) {
  sx = Math.round(sx); sy = Math.round(sy);
  const t = time;
  ctx.fillStyle = '#2a2420'; ctx.fillRect(sx - 5, sy - 1, 11, 3); ctx.fillRect(sx - 4, sy - 2, 9, 5);
  ctx.fillStyle = '#4a4440'; ctx.fillRect(sx - 3, sy, 2, 1); ctx.fillRect(sx + 2, sy + 1, 2, 1);
  // Hiillos: hehkuu palaessa ja hiipuessa, sammuneena harmaata tuhkaa ja hiiltä
  const lvl = fireLevel(), heat = lvl > 0 ? 1 : fire.lit ? fire.emb : 0;
  for (let k = 0; k < 9; k++) {
    const glow = (0.5 + 0.5 * Math.sin(t * 0.13 + k * 2.1)) * heat;
    ctx.fillStyle = heat <= 0 ? (k % 3 ? '#3a3632' : '#5a5650') : lvl > 0 ? (glow > 0.6 ? '#ffb340' : glow > 0.3 ? '#e0501c' : '#7a2010')
      : glow > 0.55 ? '#ff6a2a' : glow > 0.25 ? '#e8361a' : glow > 0.06 ? '#a81c10' : '#4a1e16';   // hiillos hehkuu punaisena
    ctx.fillRect(sx - 3 + ((k * 5) % 7), sy - 1 + (k % 3), 1, 1);
  }
  const stones = CAMP_STONES.map((st) => ({ ...st, x: sx + Math.cos(st.a) * 6, y: sy + Math.sin(st.a) * 2.8 })).sort((p, q) => p.y - q.y);
  for (const st of stones) {
    const x = Math.round(st.x - st.w / 2), y = Math.round(st.y);
    ctx.fillStyle = '#3a3d44'; ctx.fillRect(x, y, st.w, 2);
    ctx.fillStyle = '#8d939b'; ctx.fillRect(x, y, st.w, 1);
    ctx.fillStyle = Math.sin(st.a) < 0 ? '#c49a6a' : '#b4b9c0'; ctx.fillRect(x + (Math.cos(st.a) > 0 ? 0 : st.w - 1), y, 1, 1);
  }
  // Klapit: jokainen nuotiossa oleva (osittainenkin) klapi näkyy, viimeiset palavat hiiltyneinä
  const LOGS = [[-4, 1, 4, -1], [-4, -1, 4, 1], [-1, 2, 1, -2], [-4, 0, 3, 2], [-3, -2, 4, 0]];
  const nLogs = Math.ceil(fire.wood - 0.01);
  for (let k = 0; k < Math.min(nLogs, LOGS.length); k++) {
    const [x0, y0, x1, y1] = LOGS[k];
    plotLine(ctx, sx + x0, sy + y0, sx + x1, sy + y1, fire.lit ? '#5a3b22' : '#6a4a2c');
    dot(sx + x0, sy + y0, '#1a1410'); dot(sx + x1, sy + y1, '#1a1410');
  }
  if (lvl <= 0) {
    // Hiipuva hiillos hohtaa vain heikosti
    if (heat > 0.02) {
      const pulse = 0.8 + 0.2 * Math.sin(t * 0.07) + 0.08 * Math.sin(t * 0.31);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 50, 15, ${(0.22 * heat * pulse).toFixed(3)})`;
      disc(ctx, sx, sy, 5);
      ctx.fillStyle = `rgba(255, 70, 20, ${(0.38 * heat * pulse).toFixed(3)})`;
      disc(ctx, sx, sy, 3);
      ctx.globalCompositeOperation = 'source-over';
    }
    return;
  }
  ctx.globalCompositeOperation = 'lighter';
  const f = fireFlicker(7) * lvl;
  ctx.fillStyle = `rgba(255, 120, 30, ${0.25 + f * 0.15})`;
  disc(ctx, sx, sy - 2, 3 + Math.round(f));
  ctx.globalCompositeOperation = 'source-over';
  // Liekin kielet; tuuli kallistaa niitä hieman
  const lean = wind.sx * wind.gust * 1.5;
  for (let dx = -3; dx <= 3; dx++) {
    const n = Math.sin(t * 0.23 + dx * 1.7) * 0.5 + Math.sin(t * 0.61 + dx * 0.9) * 0.3 + (Math.random() - 0.5) * 0.5;
    const h = Math.max(1, Math.round((10 - Math.abs(dx) * 2.2) * (0.8 + n * 0.35) * f));
    for (let y = 0; y < h; y++) {
      const fr = y / h;
      const sway = Math.round(Math.sin(t * 0.19 + y * 0.6 + dx) * fr * 1.2 + lean * fr);
      let col;
      if (Math.abs(dx) <= 1 && fr < 0.35) col = '#fff6d0';
      else if (fr < 0.45) col = Math.abs(dx) <= 1 ? '#ffe08a' : '#ffb340';
      else if (fr < 0.75) col = '#ff8c1a';
      else col = fr < 0.9 ? '#ef5a20' : '#c0301c';
      ctx.fillStyle = col;
      ctx.fillRect(sx + dx + sway, sy - 1 - y, 1, 1);
    }
  }
  if (Math.random() < 0.35 * lvl) {
    ctx.fillStyle = Math.random() < 0.5 ? '#ff8c1a' : '#ef5a20';
    ctx.fillRect(sx + Math.round(rand(-2, 2) + lean), sy - Math.round(11 * lvl) - Math.round(Math.random() * 3), 1, 1);
  }
}

// Varjot: päivällä aurinko, yöllä nuotio heittää hahmoista pitkät varjot.
// Puiden auringonvarjot ovat valmiiksi piirrettyinä karttakokoisella kerroksella.
// Aurinko kiertää päivän mittaan: aamulla (noin klo 5) se nousee koillisesta, keskipäivällä (klo 13) se on
// etelässä korkeimmillaan ja illalla (noin klo 21.30) se laskee luoteeseen. Varjo osoittaa poispäin
// auringosta ja on sitä pidempi, mitä matalammalla aurinko on. Ruudulla itä on oikealla ja pohjoinen
// ylhäällä; maan pinta on isometrisesti litistynyt, joten varjon pystykomponentti puolitetaan.
// Palauttaa vinoutusmatriisin kertoimet [c, d]: piste korkeudella h siirtyy (-c * h, -d * h).
function sunShear(hour) {
  const t = clamp((hour - 5) / 16.5, 0, 1), az = (60 + t * 250) * Math.PI / 180;
  const elev = Math.max(0.12, Math.sin(Math.PI * t) * 0.87);
  const L = clamp(0.42 / Math.tan(elev), 0.4, 2.2);
  const vx = -Math.sin(az), vy = Math.cos(az) * 0.5;
  return [-vx * L, -vy * L];
}
const gameHour = () => (4.5 + todNow() * 24) % 24;

// Puiden varjot piirretään karttakokoiselle kerrokselle. Varjojen suunta päivitetään kerran tunnissa
// (pelin kellossa): uusi kerros piirretään taustalla muutaman ruudunpäivityksen aikana
// (ettei peli nyki) ja häivytetään sitten vanhan tilalle.
let sunA = makeCanvas(N * HW * 2, N * HH * 2), sunB = makeCanvas(N * HW * 2, N * HH * 2);
const sunShade = { key: null, job: null, fade: -1 };
function sunRows(canvas, key, r0, r1) {
  const g = canvas.getContext('2d'), [c, d] = sunShear(key);
  for (let cy = r0; cy < r1; cy++) for (let cx = 0; cx < N; cx++) {
    const i = cy * N + cx;
    if (type[i] !== T_FOREST || kind[i] === 3 || forestEdge[i] > FOREST_FULL_DEPTH) continue;   // syvän metsän varjoista ei ole hyötyä
    const spr = FOREST_SPR[kind[i]][pvar[i]];
    g.setTransform(1, 0, c, d, isoX(cx + 0.5, cy + 0.5), isoY(cx + 0.5, cy + 0.5) + 2);
    g.drawImage(spr.sil, -spr.ax, -spr.ay);
  }
  // Polttopuukatoksen varjo
  if (SHED.y0 >= r0 && SHED.y0 < r1) {
    const spr = shedSprite(SHED.logs);
    g.setTransform(1, 0, c, d, isoX(SHED.x0, SHED.y0), isoY(SHED.x0, SHED.y0) + 2);
    g.drawImage(spr.sil, -spr.ax, -spr.ay);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function buildSunShadows() {
  const key = Math.round(gameHour());
  sunA.getContext('2d').clearRect(0, 0, sunA.width, sunA.height);
  sunRows(sunA, key, 0, N);
  Object.assign(sunShade, { key, job: null, fade: -1 });
}
function tickSunShadows() {
  const S2 = sunShade, key = Math.round(gameHour());
  if (S2.job) {
    const r1 = Math.min(N, S2.job.row + 12);
    sunRows(sunB, S2.job.key, S2.job.row, r1);
    S2.job.row = r1;
    if (r1 >= N) { S2.key = S2.job.key; S2.job = null; S2.fade = 0; }
  } else if (S2.fade >= 0) {
    S2.fade += 1 / 90;
    if (S2.fade >= 1) { [sunA, sunB] = [sunB, sunA]; S2.fade = -1; }
  } else if (key !== S2.key) {
    sunB.getContext('2d').clearRect(0, 0, sunB.width, sunB.height);
    S2.job = { key, row: 0 };
  }
}

function drawShadows(camXr, camYr) {
  const night = nightAmt(), day = 1 - night;
  const ents = playerShown() && !player.boat ? [{ sx: isoX(player.x, player.y) - camXr, sy: isoY(player.x, player.y) - camYr - playerLift(), sil: SIL.player, ax: 8, ay: 19 }] : [];
  for (const a of animals) ents.push({ sx: isoX(a.x, a.y) - camXr, sy: isoY(a.x, a.y) - camYr, sil: ANIMAL[a.kind].sil, ax: ANIMAL[a.kind].w >> 1, ay: ANIMAL[a.kind].h - 1 });
  if (day > 0.05) {
    tickSunShadows();
    const a = 0.34 * day * (1 - env.overcast * 0.75), fd = sunShade.fade;
    ctx.globalAlpha = a * (fd >= 0 ? 1 - fd : 1);
    ctx.drawImage(sunA, -camXr, -camYr);
    if (fd >= 0) { ctx.globalAlpha = a * fd; ctx.drawImage(sunB, -camXr, -camYr); }
    ctx.globalAlpha = a;
    const [c, d] = sunShear(gameHour());
    for (const e of ents) {
      ctx.setTransform(1, 0, c, d, e.sx, e.sy);
      ctx.drawImage(e.sil, -e.ax, -e.ay);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }
  // Nuotio heittää hahmoista varjot poispäin tulesta; pituus ja tummuus elävät liekin mukana
  const fg = fireGlow();
  if (night > 0.05 && fg > 0.05) {
    const fx = isoX(CAMP.cx + 0.5, CAMP.cy + 0.5) - camXr, fy = isoY(CAMP.cx + 0.5, CAMP.cy + 0.5) - camYr;
    const flick = 0.9 + Math.sin(time * 0.31) * 0.06 + Math.sin(time * 0.73) * 0.04, reach = 130;
    for (const e of ents) {
      const dx = e.sx - fx, dy = (e.sy - fy) * 2, d = Math.hypot(dx, dy);
      if (d < 6 || d > reach) continue;
      const ux = dx / d, uy = dy / d, L = clamp((40 / d) * (0.85 + flick * 0.25), 0.5, 2.4);
      ctx.save();
      ctx.globalAlpha = clamp(0.6 * night * flick * fg * (1 - d / reach), 0, 0.7);
      ctx.setTransform(1, 0, -L * ux, -L * uy * 0.5, e.sx, e.sy);
      ctx.drawImage(e.sil, -e.ax, -e.ay);
      ctx.restore();
    }
  }
}

// Ruohon taipuma: tuuli kallistaa kortta tuulen alapuolelle ja puuskat heiluttavat sitä
// Näkymän aukko. Pelaajan edessä olevat puut häivytetään hahmon ympäriltä ja katsesuuntaan valokeilan
// verran, mutta vain kohdista, joiden takana on penger, aukea tai lampi: metsän pohjaa ei paljasteta.
// Aukon voimakkuus (0–1) rasteroidaan Bayer-matriisilla, jolloin reunat liukuvat pehmeästi.
let revealMask = null;   // 0–255 jokaiselle maakuvan pikselille: kuinka paljon kohdasta saa paljastaa
function buildRevealMask() {
  const gw = ground.width, gh = ground.height;
  revealMask = new Uint8Array(gw * gh);
  const offs = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]];
  for (let ay = 0; ay < gh; ay++) {
    for (let ax = 0; ax < gw; ax++) {
      const [wx, wy] = absToWorld(ax + 0.5, ay + 0.5);
      let n = 0;
      for (const [ox, oy] of offs) {
        const x = wx + ox, y = wy + oy;
        if (x >= 0 && y >= 0 && x < N && y < N && type[cellIdx(x, y)] !== T_FOREST) n++;
      }
      revealMask[ay * gw + ax] = n * 51;
    }
  }
}

const holeShape = makeCanvas(W, H), holeShapeCtx = holeShape.getContext('2d', { willReadFrequently: true });
const holeCanvas = makeCanvas(W, H), holeCtx = holeCanvas.getContext('2d');
let holeImg = holeCtx.createImageData(W, H);
let holeRect = [0, 0, W, H];   // viimeksi laskettu aukon alue (viewHole)
let holeKey = '';
function viewHole(psx, psy, camXr, camYr) {
  const g = holeShapeCtx, a0 = player.fa;
  // Aukko riippuu vain hahmon paikasta, katseesta ja kamerasta: valmis kuva käytetään uudelleen, kun ne eivät ole muuttuneet
  const hk = psx + ',' + psy + ',' + a0.toFixed(3) + ',' + camXr + ',' + camYr + ',' + W + ',' + H;
  if (hk === holeKey) return holeCanvas;
  holeKey = hk;
  // Aukko mahtuu laatikkoon: soikio (säde 38, y x1,15) ja keilat (r <= 10,5 ruutua, |cos a - sin a| <= 1,415);
  // mitattu: x -119..118, y -66..53 hahmon ympärillä. Vain tämä laatikko luetaan, lasketaan ja kopioidaan.
  const bx0 = Math.max(0, psx - 120), bx1 = Math.min(W, psx + 121), by0 = Math.max(0, psy - 66), by1 = Math.min(H, psy + 55);
  const bw = bx1 - bx0, bh = by1 - by0;
  holeRect = [bx0, by0, bw, bh];
  holeCtx.clearRect(0, 0, W, H);
  if (bw <= 0 || bh <= 0) return holeCanvas;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(bx0, by0, bw, bh);
  g.globalCompositeOperation = 'lighter';
  // Hahmon ympärillä: soikio, jonka keskiosa on täysin auki ja reuna liukuu
  g.save();
  g.translate(psx, psy - 10);
  g.scale(1, 1.15);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 38);
  gr.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gr.addColorStop(0.6, 'rgba(255, 255, 255, 1)');
  gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gr;
  g.fillRect(-38, -38, 76, 76);
  g.restore();
  // Katsesuuntaan: kolme päällekkäistä keilaa, joiden yhteinen voimakkuus hiipuu reunoja kohti
  const P = (r, a) => [psx + (Math.cos(a) - Math.sin(a)) * r * HW, psy - 6 + (Math.cos(a) + Math.sin(a)) * r * HH];
  g.fillStyle = 'rgba(255, 255, 255, 0.34)';
  for (const [r, sp] of [[10.5, 0.6], [8.8, 0.48], [7.2, 0.36]]) {
    g.beginPath();
    g.moveTo(...P(0.5, a0 + Math.PI / 2)); g.lineTo(...P(0.5, a0 - Math.PI / 2));
    for (let i = 0; i <= 14; i++) g.lineTo(...P(r, a0 - sp + (2 * sp * i) / 14));
    g.closePath();
    g.fill();
  }
  const src = g.getImageData(bx0, by0, bw, bh).data, dst = holeImg.data, gw = ground.width, gh = ground.height;
  for (let y = by0, q = 0; y < by1; y++) {
    const ay = y + camYr, row = ay * gw;
    for (let x = bx0, p = (y * W + bx0) * 4; x < bx1; x++, p += 4, q += 4) {
      const a = src[q + 3];
      if (!a) { dst[p + 3] = 0; continue; }
      const ax = x + camXr;
      const rv = ax >= 0 && ay >= 0 && ax < gw && ay < gh ? revealMask[row + ax] : 0;
      dst[p + 3] = (a * rv) / 65025 > BAYER[(y & 3) * 4 + (x & 3)] ? 255 : 0;
    }
  }
  holeCtx.putImageData(holeImg, 0, 0, bx0, by0, bw, bh);
  return holeCanvas;
}

// Pelaaja ei näy aloitusruudulla eikä nukkuessaan teltassa
const playerShown = () => state !== 'title' && !(state === 'sleep' && sleep.phase !== 'out');

// Kivet lammessa seisovat pohjassa. Ensin piirretään koko kivi pohjan päälle (vesi peittää sen
// syvyyden mukaan), ja vedellisessä lammessa pinnan yläpuolinen osa piirretään vielä veden päälle
// vesirajoineen ja heijastuksineen.
function drawWaterRocks(camXr, camYr) {
  for (const o of waterRocks) {
    const s = o.spr;
    const sx = Math.round(isoX(o.x, o.y) - camXr), sy = Math.round(isoY(o.x, o.y) - camYr);
    if (sx < -16 || sx > W + 16 || sy < -10 || sy > H + 50) continue;
    ctx.drawImage(s.full, sx - s.ax, sy - Math.round(terrainZ(o.x, o.y) * Z_PX) - s.ay + 1);
  }
}
// Kiven pinnan yläpuolinen osa piirretään muiden pystyjen asioiden joukossa syvyysjärjestyksessä,
// jolloin kiven takana seisova hahmo jää sen taakse
function drawWaterRockTop(o, camXr, camYr) {
  const s = o.spr, img = s.full;
  const sx = Math.round(isoX(o.x, o.y) - camXr), sy = Math.round(isoY(o.x, o.y) - camYr);
  const top = sy - Math.round(terrainZ(o.x, o.y) * Z_PX) - s.ay + 1;
  const cut = sy + 1 - top;   // vesirajan yläpuolella olevat rivit
  if (cut <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.translate(sx - s.ax, sy + 1 + cut);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0, img.width, cut, 0, 0, img.width, cut);
  ctx.restore();
  ctx.drawImage(img, 0, 0, img.width, cut, sx - s.ax, top, img.width, cut);
  ctx.fillStyle = `rgba(${env.ring}, ${(0.45 + Math.sin(time * 0.05 + o.x) * 0.15).toFixed(3)})`;
  ctx.fillRect(sx - 4, sy + 1, 9, 1);
}

// Huojunnan vaiheet kasvavat joka päivityksellä tuulen voimakkuuden mukaan. Kun vaihe kertyy näin (eikä
// kerrota aikaa tuulella), heilunta ei nytkähdä tuulen muuttuessa.
const swayPh = { grass: 0, tree: 0 };
function updateSway() {
  swayPh.grass += 0.009 + wind.gust * 0.016;
  swayPh.tree += 1 + wind.gust * 0.6;
}
function grassFrame(o) {
  const g = wind.gust, s = Math.sin(swayPh.grass + o.x * 0.7 + o.y * 0.4) + 0.3 * Math.sin(time * 0.027 + o.x * 1.3);
  const v = clamp(wind.sx * g * 1.1 + s * (0.15 + g * 0.6), -1, 1);
  return Math.round((v + 1) * 0.5 * (SWAY_FRAMES - 1));
}

// Puun huojuntavaihe: tuuli kallistaa latvusta hieman ja heiluttaa sitä rauhallisesti. Jokaisella
// puulla on oma tahtinsa ja vaiheensa, joten metsä ei heilu yhtä aikaa (koivut heiluvat enemmän).
function treeFrame(i, birch) {
  const g = wind.gust, r = hash2(i, 7);
  const amp = (0.1 + g * 0.85) * (birch ? 1.35 : 1);
  const v = wind.sx * g * (birch ? 0.8 : 0.55) + Math.sin(swayPh.tree * (0.006 + r * 0.007) + r * 40) * amp;
  return clamp(Math.round(v * 2), -3, 3) + 3;
}

let frontDirty = true;   // onko etukerrokselle piirretty jotain (tyhjennys ja yhdistäminen vain silloin)
function drawWorld() {
  const camXr = Math.round(cam.x), camYr = Math.round(cam.y);
  ctx.fillStyle = '#0c140e';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(ground, -camXr, -camYr);
  // Lammen pohja, sen päällä kivet ja pohjaan pudonnut viehe, sitten läpinäkyvä vesi
  ctx.drawImage(basinCanvas, PB.x0 - camXr, PB.y0 - camYr);
  if (water.contours) ctx.drawImage(contourCanvas, PB.x0 - camXr, PB.y0 - camYr);
  drawWaterRocks(camXr, camYr);
  if (water.show) {
    drawWater(camXr, camYr);
    drawRipples(camXr, camYr);
  }
  drawUnderwater(camXr, camYr);
  // Tähtien vertailukuva otetaan ennen heijastuksia, jolloin tähdet eivät näy hahmon, veneen eivätkä
  // perämoottorin heijastuksen kohdalla
  snapStars('a');
  drawReflections(camXr, camYr);
  if (!water.show) drawDebugLines(camXr, camYr);
  drawLilies(camXr, camYr);
  drawWaterMist(camXr, camYr);
  // Laiturin takana (kaukaisemmalla puolella) oleva vene piirretään ennen laituria, jolloin laituri peittää sen
  const boatBehindDock = boat && (() => { const [t, sd] = dockLocal(boat.x, boat.y); return sd > 0 && t > -2 && t < DOCK_LEN + 2; })();
  if (boatBehindDock) drawBoat(camXr, camYr);
  ctx.drawImage(dockImg, dockBX - camXr, dockBY - camYr);
  drawLure(camXr, camYr);
  drawLoose(camXr, camYr);
  drawShadows(camXr, camYr);

  // Kerätään kaikki pystyt asiat ja piirretään takaa eteen.
  // Käydään läpi vain ruudut, jotka voivat näkyä ruudulla.
  const list = [];
  const toWorld = (sx, sy) => absToWorld(sx + camXr, sy + camYr);
  const corners = [toWorld(-40, -20), toWorld(W + 40, -20), toWorld(-40, H + 90), toWorld(W + 40, H + 90)];
  const minX = clamp(Math.floor(Math.min(...corners.map((c) => c[0]))), 0, N - 1), maxX = clamp(Math.ceil(Math.max(...corners.map((c) => c[0]))), 0, N - 1);
  const minY = clamp(Math.floor(Math.min(...corners.map((c) => c[1]))), 0, N - 1), maxY = clamp(Math.ceil(Math.max(...corners.map((c) => c[1]))), 0, N - 1);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const i = cy * N + cx;
      if (type[i] !== T_FOREST || kind[i] === 3) continue;
      const sx = isoX(cx + 0.5, cy + 0.5) - camXr, sy = isoY(cx + 0.5, cy + 0.5) - camYr;
      // Piirretään vain puut, joiden kuva osuu ruudulle (kuvan todellisten mittojen mukaan)
      const spr = FOREST_SPR[kind[i]][pvar[i]], im = spr.frames ? spr.frames[0] : spr.full;
      const x0 = sx - spr.ax - 2, y0 = sy - spr.ay + 1;
      if (x0 >= W || x0 + im.width <= 0 || y0 >= H || y0 + im.height <= 0) continue;
      list.push({ d: cx + cy + 1, k: 0, i, sx, sy });
    }
  }
  for (const o of decor) {
    const sx = isoX(o.x, o.y) - camXr, sy = isoY(o.x, o.y) - camYr;
    const g = o.spr, gi = g.frames[0], gx = Math.round(sx) - g.ax, gy = Math.round(sy) - g.ay;
    if (gx >= W || gx + gi.width <= 0 || gy >= H || gy + gi.height <= 0) continue;
    list.push({ d: o.x + o.y, k: 1, o, sx, sy });
  }
  list.push({ d: TENT.cx + TENT.cy + 2, k: 2 });
  list.push({ d: SHED.x0 + SHED.y0 + (SHED.L + SHED.D) / 2, k: 9 });
  if (boat && !boatBehindDock) list.push({ d: boat.x + boat.y, k: 8 });
  list.push({ d: CAMP.cx + CAMP.cy + 1, k: 3 });
  if (sealShown()) list.push({ d: seal.x + seal.y + 0.02, k: 10 });
  for (const a of animals) list.push({ d: a.x + a.y, k: 4, a });
  if (water.show) for (const o of waterRocks) list.push({ d: o.x + o.y, k: 7, o });
  for (const dk of ducks) if (dk.z < 3) list.push({ d: dk.x + dk.y, k: 5, dk });
  for (const gb of grebes) if (gb.z < 3) list.push({ d: gb.x + gb.y, k: 11, gb });
  if (playerShown() && !player.boat) list.push({ d: player.x + player.y + 0.01, k: 6 });
  list.sort((a, b) => a.d - b.d);

  const playerD = player.x + player.y;
  if (frontDirty) { frontCtx.clearRect(0, 0, W, H); frontDirty = false; }
  for (const o of list) {
    // Pelaajan edessä olevat puut menevät etukerrokselle, josta aukko leikataan. Kivet, ruohot ja
    // kaislat näkyvät aina kokonaan ja peittävät niiden takana seisovan hahmon.
    const rock = o.k === 0 && kind[o.i] === K_ROCK;
    ctx = o.k === 0 && o.d > playerD && !rock && playerShown() ? frontCtx : mainCtx;
    if (ctx === frontCtx) frontDirty = true;
    if (o.k === 0) {
      const spr = FOREST_SPR[kind[o.i]][pvar[o.i]];
      if (rock) ctx.drawImage(spr.full, o.sx - spr.ax, o.sy - spr.ay + 1);
      else ctx.drawImage(spr.frames[treeFrame(o.i, kind[o.i] === K_BIRCH)], o.sx - spr.ax - 2, o.sy - spr.ay + 1);
    } else if (o.k === 1) {
      const g = o.o.spr;
      ctx.drawImage(g.frames[grassFrame(o.o)], Math.round(o.sx) - g.ax, Math.round(o.sy) - g.ay);
    } else if (o.k === 2) {
      ctx.drawImage(TENT_IMG, isoX(TENT.cx, TENT.cy) - camXr - 20, isoY(TENT.cx, TENT.cy) - camYr - 20);
    } else if (o.k === 3) {
      drawCampfire(isoX(CAMP.cx + 0.5, CAMP.cy + 0.5) - camXr, isoY(CAMP.cx + 0.5, CAMP.cy + 0.5) - camYr);
    } else if (o.k === 4) {
      drawAnimal(o.a, isoX(o.a.x, o.a.y) - camXr, isoY(o.a.x, o.a.y) - camYr);
    } else if (o.k === 5) {
      drawDuck(o.dk, isoX(o.dk.x, o.dk.y) - camXr, isoY(o.dk.x, o.dk.y) - camYr);
    } else if (o.k === 11) {
      drawGrebe(o.gb, isoX(o.gb.x, o.gb.y) - camXr, isoY(o.gb.x, o.gb.y) - camYr);
    } else if (o.k === 10) {
      drawSeal(camXr, camYr);
    } else if (o.k === 9) {
      drawShed(camXr, camYr);
    } else if (o.k === 8) {
      drawBoat(camXr, camYr);
    } else if (o.k === 7) {
      drawWaterRockTop(o.o, camXr, camYr);
    } else {
      drawPlayer(isoX(player.x, player.y) - camXr, isoY(player.x, player.y) - camYr, camXr, camYr);
    }
  }
  ctx = mainCtx;

  // Leikataan etukerrokseen aukko pelaajan kohdalle ja piirretään se päälle (vain jos etukerrokselle piirrettiin jotain,
  // esim. lammen keskellä veneessä ei piirretä)
  if (frontDirty && playerShown()) {
    const psx = Math.round(isoX(player.x, player.y) - camXr), psy = Math.round(isoY(player.x, player.y) - camYr);
    frontCtx.globalCompositeOperation = 'destination-out';
    const hc = viewHole(psx, psy, camXr, camYr), [hx, hy, hw, hh] = holeRect;
    if (hw > 0 && hh > 0) frontCtx.drawImage(hc, hx, hy, hw, hh, hx, hy, hw, hh);
    frontCtx.globalCompositeOperation = 'source-over';
  }
  if (frontDirty) ctx.drawImage(front, 0, 0);

  // Ilmassa lentävät sorsat ja taivaan linnut puiden yläpuolella
  for (const dk of ducks) if (dk.z >= 3) drawDuck(dk, isoX(dk.x, dk.y) - camXr, isoY(dk.x, dk.y) - camYr);
  for (const gb of grebes) if (gb.z >= 3) drawGrebe(gb, isoX(gb.x, gb.y) - camXr, isoY(gb.x, gb.y) - camYr);
  drawSkyBirds(camXr, camYr);

  // Partikkelit: savu, kipinät, vesiroiskeet
  for (const q of particles) {
    const x = Math.round(q.x - camXr), y = Math.round(q.y - camYr);
    if (q.ember || x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
    if (q.smoke) {
      const age = 1 - q.life / q.max;
      const s = 1 + Math.floor(age * (q.big ? 6 : 3));
      ctx.globalAlpha = (q.life / q.max) * (q.big ? 0.45 : 0.35);
      ctx.fillStyle = q.color;
      ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = q.color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  snapStars('b');
  drawWeather(camXr, camYr);
  if (state !== 'play' && state !== 'pause') return;
  drawWindVane();
  if (state === 'play' && aiming()) drawReticle();
  // Koukussa olevan kalan voimat hahmon yläpuolella
  // Nuotion puumäärä (0–5) näkyy hetken klapin lisäämisen jälkeen
  if (fire.barT > 0) {
    const x = Math.round(isoX(CAMP.cx + 0.5, CAMP.cy + 0.5) - camXr) - 9, y = Math.round(isoY(CAMP.cx + 0.5, CAMP.cy + 0.5) - camYr) - 24;
    ctx.globalAlpha = Math.min(1, fire.barT / 30);
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x, y, 18, 4);
    ctx.fillStyle = '#ff8c1a'; ctx.fillRect(x + 1, y + 1, Math.round(16 * fire.wood / FIRE_MAX), 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.fillRect(x + 1, y + 1, Math.round(16 * fire.wood / FIRE_MAX), 1);
    ctx.globalAlpha = 1;
  }
  // Polttopuun teon edistyminen hahmon yläpuolella: viisi iskua täyttää palkin
  if (player.chop) {
    const x = Math.round(isoX(player.x, player.y) - camXr) - 9, y = Math.round(isoY(player.x, player.y) - camYr) - playerLift() - 27;
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x, y, 18, 4);
    ctx.fillStyle = '#e0a85a'; ctx.fillRect(x + 1, y + 1, Math.round(16 * player.chop.hits / CHOPS_PER_LOG), 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.fillRect(x + 1, y + 1, Math.round(16 * player.chop.hits / CHOPS_PER_LOG), 1);
    ctx.fillStyle = '#1a1c2c'; for (let k = 1; k < CHOPS_PER_LOG; k++) ctx.fillRect(x + Math.round(1 + 16 * k / CHOPS_PER_LOG), y + 1, 1, 2);
  }
  // Kalan voimapalkki veden pinnalla kalan kohdalla; siiman kestopalkki hahmon yläpuolella
  const hf = cast.lure && cast.lure.fish;
  if (hf && hf.mode !== 'caught') {
    if (ui.fishBar && !water.show) {
      const x = Math.round(isoX(hf.x, hf.y) - camXr) - 9, y = Math.round(isoY(hf.x, hf.y) - camYr) - 7;
      ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x, y, 18, 4);
      ctx.fillStyle = hf.mode === 'tired' ? '#94b0c2' : '#ef7d57'; ctx.fillRect(x + 1, y + 1, Math.round(16 * hf.energy / hf.maxE), 2);
    }
    const tn = clamp(cast.lure.tension || 0, 0, 1), x = Math.round(isoX(player.x, player.y) - camXr) - 9, y = Math.round(isoY(player.x, player.y) - camYr) - playerLift() - 27;
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x, y, 18, 4);
    ctx.fillStyle = tn > 0.75 ? (Math.floor(time / 6) % 2 ? '#ff4030' : '#c82818') : tn > 0.45 ? '#ffcd75' : '#a7f070';
    ctx.fillRect(x + 1, y + 1, Math.round(16 * tn), 2);
  }
  // Heiton voimapalkki hahmon alla (muut vieheet ja kosketusohjaus; koho-ongen tarkkuus näkyy tähtäimessä)
  if (cast.charging && !aimCast()) {
    const x = Math.round(isoX(player.x, player.y) - camXr) - 9, y = Math.round(isoY(player.x, player.y) - camYr) + 4;
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x, y, 18, 4);
    ctx.fillStyle = cast.power > 0.9 ? '#ff8c1a' : '#ffcd75'; ctx.fillRect(x + 1, y + 1, Math.round(16 * cast.power), 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.fillRect(x + 1, y + 1, Math.round(16 * cast.power), 1);
  }
}

// ---------------------------------------------------------------------------
// Tähtäin. Ilman esinettä kädessä se on yksinkertainen risti; ongen kanssa sen muoto riippuu
// siimassa olevasta vieheestä. Uudet vieheet lisätään LURES-tauluun.
// ---------------------------------------------------------------------------
const LURES = {
  bobber: { name: 'BOBBER', reticle: drawBobberReticle },     // koho ja koukku
  wobbler: { name: 'WOBBLER', reticle: drawWobblerReticle },  // vaappu
  spoon: { name: 'SPOON', reticle: drawSpoonReticle },        // lippa
  rigworm: { name: 'BOTTOM RIG  WORM', reticle: (x, y) => drawRigReticle(x, y, 'rigworm') },        // pohjaonki ja mato
  rigboilie: { name: 'BOTTOM RIG  BOILIE', reticle: (x, y) => drawRigReticle(x, y, 'rigboilie') },  // pohjaonki ja boilie
};

function drawReticle() {
  const x = Math.round(mouseX), y = Math.round(mouseY);
  if (player.rod && !cast.lure && cast.charging && aimCast()) {
    const d = castTarget()[2];
    if (d > CAST_AIM_MAX) {
      // Liian pitkä heitto: kieltomerkki tähtäimen päällä
      LURES[player.lure].reticle(x, y);
      ctx.fillStyle = '#e83a2a';
      for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(a) * 6), Math.round(y - 2 + Math.sin(a) * 6), 1, 1); }
      plotLine(ctx, x - 4, y - 6, x + 4, y + 2, '#e83a2a');
      return;
    }
    // Tarkkuuskehä tähtäimen ympärillä (maan pinnan suuntainen ellipsi): pienenee ja kasvaa vuorotellen
    const r = castError(cast.power) * CAST_SPREAD;
    if (r > 0.1) {
      ctx.fillStyle = 'rgba(255, 220, 140, 0.85)';
      const n = Math.max(12, Math.round(r * 18));
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(a) * r * 11.3), Math.round(y + Math.sin(a) * r * 5.66), 1, 1); }
    }
  }
  if (player.rod && cast.lure && cast.lure.st === 'float' && cast.lure.onWater) drawReelReticle(x, y);
  else if (player.rod) LURES[player.lure].reticle(x, y);
  else drawCrossReticle(x, y);
}

function drawCrossReticle(x, y) {
  for (const [o, col] of [[1, 'rgba(10, 14, 12, 0.7)'], [0, '#f4f0e0']]) {
    ctx.fillStyle = col;
    ctx.fillRect(x - 4 + o, y + o, 3, 1); ctx.fillRect(x + 2 + o, y + o, 3, 1);
    ctx.fillRect(x + o, y - 4 + o, 1, 3); ctx.fillRect(x + o, y + 2 + o, 1, 3);
  }
}

// Kun koho on vedessä, tähtäimenä on ongen kela edestä päin. Kammen kahva pyörii kelattaessa
// tasaisesti ja muulloin silloin tällöin satunnaisen pätkän eteen- tai taaksepäin.
const crank = { a: -Math.PI / 2, v: 0, t: 0 };
function drawReelReticle(x, y) {
  if (mouseHeld) crank.v = 0.22;
  else if (--crank.t <= 0) { crank.t = rand(30, 140); crank.v = Math.random() < 0.5 ? rand(-0.12, 0.16) : 0; }
  else crank.v *= 0.97;
  crank.a += crank.v;
  const px = (dx, dy, col) => { ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, 1, 1); };
  // Varjo, kelan runko (tumma reuna, harmaa kylki ja vaalea kehä) ja keskiö
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const r = Math.hypot(dx, dy);
    if (r <= 5.3) px(dx + 1, dy + 1, 'rgba(10, 14, 12, 0.45)');
  }
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const r = Math.hypot(dx, dy);
    if (r > 5.3) continue;
    px(dx, dy, r > 4.4 ? '#24262a' : r > 3.4 ? (dx + dy < 0 ? '#d0d2d4' : '#8a8c90') : r > 1.2 ? '#5a5e64' : '#c8c8c8');
  }
  // Siimaa kelalla: muutama vaalea pikseli kehän sisällä
  px(-2, -3, '#e8e4d8'); px(2, 3, '#e8e4d8'); px(-3, 2, '#e8e4d8');
  // Kampi ja nuppi
  const ex = Math.round(Math.cos(crank.a) * 4), ey = Math.round(Math.sin(crank.a) * 4);
  plotLine(ctx, x, y, x + ex, y + ey, '#f0f0f0');
  ctx.fillStyle = '#1a1410'; ctx.fillRect(x + ex - 1, y + ey - 1, 3, 3);
  ctx.fillStyle = '#d8a850'; ctx.fillRect(x + ex - 1, y + ey - 1, 2, 2);
}

// Vaappu tähtäimenä: realistinen, pikkukalaa muistuttava uistin sivulta. Kapea runko suippenee pyrstöä
// kohti; tumma selkä suomukuvioineen, kiiltävä hopeansininen kylkiraita, vaalea vatsa, punainen
// kiduskohta, iso silmä ja nokan alta viistosti alas sojottava läpinäkyvä kieli. Vatsan alla ja perässä
// roikkuvat kolmihaarakoukut lenkkeineen. Takaosa heiluu puolelta toiselle kuin kelattaessa.
const WOB_ICON = (() => {
  // Rungon pystyprofiili x = -7…6: [ylin rivi, alin rivi]
  const prof = { '-7': [-1, 0], '-6': [-1, 0], '-5': [-2, 0], '-4': [-2, 1], '-3': [-2, 1], '-2': [-3, 1], '-1': [-3, 1], 0: [-3, 1], 1: [-3, 1], 2: [-3, 1], 3: [-3, 1], 4: [-2, 1], 5: [-2, 0], 6: [-1, 0] };
  const body = [];
  for (const k in prof) {
    const x = +k, [y0, y1] = prof[k];
    for (let y = y0; y <= y1; y++) {
      let col;
      if (y === y0) col = (x & 1) ? '#24364a' : '#2e4560';             // selkä ja suomut
      else if (y === y0 + 1 && y1 - y0 >= 3) col = (x & 1) ? '#4a6684' : '#41607c';
      else if (y === y1) col = x > -5 && x < 4 ? '#e6eef4' : '#9fb8d0';     // vatsa
      else col = (x + y) & 1 ? '#c4d6e6' : '#9fb8d0';                     // kiiltävä kylkiraita
      body.push([x, y, col]);
    }
  }
  const extra = [
    [4, -1, '#0c1016'], [4, -2, '#d8c068'], [5, -1, '#2a3a4c'],         // silmä ja nokka
    [3, 0, '#b8323a'], [3, -1, '#c84a4a'],                              // kiduskohta
    [6, 1, 'rgba(200, 220, 235, 0.55)'], [7, 1, 'rgba(200, 220, 235, 0.45)'], [7, 2, 'rgba(235, 245, 255, 0.7)'],   // kieli
    [6, -1, '#8a9098'],                                                   // siimalenkki nokassa
  ];
  // Kolmihaarakoukut: lenkki, varsi ja kaksi näkyvää kärkeä väkäsineen
  const hook = (x, y) => [[x, y, '#6a7078'], [x, y + 1, '#a8aeb4'], [x - 1, y + 2, '#8a9098'], [x, y + 2, '#c0c6cc'], [x + 1, y + 2, '#8a9098'], [x - 1, y + 1, '#5a6068'], [x + 1, y + 1, '#5a6068']];
  return { body, extra, hooks: [...hook(0, 2), ...hook(-6, 1)] };
})();
function drawWobblerReticle(x, y) {
  const sw = Math.sin(time * 0.2), w = Math.round(sw);
  const shift = (px, py) => (px <= -3 ? py + (px <= -5 ? w : Math.round(sw * 0.5)) : py);   // takaosan heilunta
  const all = [...WOB_ICON.hooks.map(([px, py, c]) => [px, px < -3 ? shift(px, py) : py, c]), ...WOB_ICON.body.map(([px, py, c]) => [px, shift(px, py), c]), ...WOB_ICON.extra];
  // Pyrstöevä
  all.push([-8, shift(-8, -2), '#2e4560'], [-8, shift(-8, 1), '#2e4560'], [-9, shift(-9, -3), 'rgba(46, 69, 96, 0.8)'], [-9, shift(-9, 2), 'rgba(46, 69, 96, 0.8)']);
  ctx.fillStyle = 'rgba(8, 12, 10, 0.5)';
  for (const [px, py] of all) ctx.fillRect(x + px + 1, y + py + 1, 1, 1);
  for (const [px, py, c] of all) { ctx.fillStyle = c; ctx.fillRect(x + px, y + py, 1, 1); }
  // Kiiltävä heijastus kyljessä vaihtelee heilunnan mukana
  ctx.fillStyle = `rgba(255, 255, 255, ${(0.35 + 0.35 * Math.max(0, sw)).toFixed(2)})`;
  ctx.fillRect(x - 1, y - 1, 2, 1);
}

// Lippa tähtäimenä: metallinharmaa pisaranmuotoinen lehti, jossa kiiltävä heijastus, edessä siimalenkki ja
// perässä kolmihaarakoukku. Lehti kiepsahtaa välillä, jolloin kiilto siirtyy.
function drawSpoonReticle(x, y) {
  const flip = Math.sin(time * 0.15) > 0;
  const px = [];
  const add = (dx, dy, col) => px.push([dx, dy, col]);
  const rows = [[-1, 3], [-3, 5], [-4, 6], [-4, 6], [-3, 5], [-1, 3]];   // [alku, loppu] riveittäin y = -3 … 2
  rows.forEach(([a0, a1], i) => {
    const dy = i - 3;
    for (let dx = a0; dx < a1; dx++) {
      const lit = flip ? dy < 0 && dx < 1 : dy >= 0 && dx > 0;
      add(dx, dy, i === 0 || i === 5 || dx === a0 || dx === a1 - 1 ? '#6a7078' : lit ? '#e8ecf0' : (dx + dy) & 1 ? '#a8b0b8' : '#8e969e');
    }
  });
  add(flip ? -1 : 2, flip ? -2 : 1, '#ffffff');                           // kiiltopiste
  add(6, -1, '#8a9098'); add(7, -1, '#6a7078');                         // siimalenkki (nokka oikealla)
  add(-5, 0, '#8a9098'); add(-6, 0, '#b0b6bc'); add(-7, -1, '#c0c6cc'); add(-7, 1, '#c0c6cc'); add(-8, -1, '#6a7078'); add(-8, 1, '#6a7078');   // koukku
  ctx.fillStyle = 'rgba(8, 12, 10, 0.5)';
  for (const [dx, dy] of px) ctx.fillRect(x + dx + 1, y + dy + 1, 1, 1);
  for (const [dx, dy, col] of px) { ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, 1, 1); }
}

// Pohjaonki tähtäimenä: siima, puntti ja sivuhaara, jonka päässä on syötti (mato tai boilie); haara heiluu hieman
function drawRigReticle(x, y, kind) {
  const sw = Math.round(Math.sin(time * 0.07) * 0.7);
  const px = [];
  const add = (dx, dy, col) => px.push([dx, dy, col]);
  for (let dy = -6; dy <= 1; dy++) add(0, dy, '#d8dcde');                       // pääsiima
  add(0, 2, '#c8ccd0'); for (const dx of [-1, 0, 1]) { add(dx, 3, '#4e525a'); add(dx, 4, '#4e525a'); }
  add(-1, 3, '#8e929a'); add(0, 5, '#3a3e44');                                   // puntti
  add(1, -2, '#d8dcde'); add(2, -2 + 0, '#d8dcde'); add(3 + sw, -1, '#d8dcde'); // sivuhaara
  if (kind === 'rigboilie') {
    for (const [dx, dy] of [[3, 0], [4, 0], [3, 1], [4, 1]]) add(dx + sw, dy, '#6a3c1c');
    add(3 + sw, 0, '#9a6234'); add(4 + sw, 1, '#44250f');
  } else {
    add(3 + sw, 0, '#c8ccd0'); add(4 + sw, 0, '#9aa0a8'); add(3 + sw, 1, '#e08a96'); add(3 + sw, 2, '#c86a78'); add(2 + sw, 2, '#b85a68');
  }
  ctx.fillStyle = 'rgba(8, 12, 10, 0.5)';
  for (const [dx, dy] of px) ctx.fillRect(x + dx + 1, y + dy + 1, 1, 1);
  for (const [dx, dy, col] of px) { ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, 1, 1); }
}

// Pieni keinuva koho. Sen alla oleva rengas on vaaleansininen veden päällä ja harmaa maalla.
function drawBobberReticle(x, y) {
  const t = time * 0.07, sway = Math.sin(t) * 0.7, bob = Math.round(Math.sin(t * 1.7) * 0.6);
  const onWater = waterPx(x + Math.round(cam.x), y + Math.round(cam.y));
  const rr = 4.5 + (onWater ? Math.sin(t * 0.8) * 0.8 : 0);
  ctx.fillStyle = onWater ? 'rgba(205, 232, 245, 0.85)' : 'rgba(205, 205, 195, 0.55)';
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + 1 + Math.sin(a) * rr * 0.5), 1, 1);
  }
  // Rivit ylhäältä: tikku, punainen yläosa, valkoinen alaosa ja kärki. Keinunta kallistaa ylärivejä.
  const rows = [['#2a2018', 1], ['#2a2018', 1], ['#d8241c', 3], ['#d8241c', 3], ['#f0f0ea', 3], ['#f0f0ea', 3], ['#f0f0ea', 1]];
  const top = y - 6 + bob;
  for (const pass of [0, 1]) {
    rows.forEach(([col, w], i) => {
      const lx = x - (w >> 1) + Math.round(sway * (6 - i) / 3);
      ctx.fillStyle = pass ? col : 'rgba(10, 14, 12, 0.55)';
      ctx.fillRect(lx + (pass ? 0 : 1), top + i + (pass ? 0 : 1), w, 1);
    });
  }
  ctx.fillStyle = '#ff7a60';
  ctx.fillRect(x - 1 + Math.round(sway * 4 / 3), top + 2, 1, 1);
}

// Sää- ja tuulikuvakkeet kellon vieressä. Kuvakkeet piirretään ensin pienelle apukankaalle, jolle tehdään
// tumma ääriviiva, jotta ne erottuvat maisemasta selvästi.
// Sää: aurinko (yöllä kuunsirppi ja tähti), tihkusade (vaalea pilvi ja muutama pisara), kova sade (tumma
// pilvi ja vinot sadeviirut) tai usva (kolme juovaa). Tuuli: kompassirengas, jonka sisällä nuoli näyttää
// tuulen kulkusuunnan ruudulla, ja sen vieressä kolme palkkia tuulen voimakkuudelle
// (tyyni = piste eikä palkkeja, heikko 1, kohtalainen 2, kova 3).
const ICON_N = 34;
// Kuvakkeet piirretään ja ääriviivat (pikselien luku) tehdään vain kun kuvake muuttuu; muuten piirretään
// valmis kuva. Piirtoavain (key) kuvaa kaiken, mikä vaikuttaa kuvakkeen pikseleihin.
const iconCanvas = makeCanvas(ICON_N, ICON_N), iconCtx = iconCanvas.getContext('2d', { willReadFrequently: true });   // työkangas
const iconCache = {};
for (const k of ['weather', 'wind']) {
  const cv = makeCanvas(ICON_N, ICON_N);
  iconCache[k] = { cv, ctx: cv.getContext('2d', { willReadFrequently: true }), key: null };
}
function iconBegin(C) { C.ctx.clearRect(0, 0, ICON_N, ICON_N); return C.ctx; }
const showIcon = (C, x, y) => ctx.drawImage(C.cv, Math.round(x - ICON_N / 2), Math.round(y - ICON_N / 2));

// Animaation vaiheet (käytetään sekä piirtoon että piirtoavaimeen)
const moonBig = () => Math.sin(time * 0.05) > 0.3;
const rainPhase = (i, heavy) => Math.floor((time * (heavy ? 0.09 : 0.05) + i * 0.6) % 3);
const fogShift = (r) => Math.round(Math.sin(time * 0.015 + r * 1.9));
function weatherIconKey() {
  const k = weather.kind, night = env.dark > 0.5;
  if (k === 'clear') return night ? 'cn' + (moonBig() ? 1 : 0) : 'cd';
  if (k === 'drizzle' || k === 'rain') {
    const heavy = k === 'rain', n = heavy ? 4 : 3;
    let key = k;
    for (let i = 0; i < n; i++) key += rainPhase(i, heavy);
    return key;
  }
  return 'f' + fogShift(0) + fogShift(1) + fogShift(2);
}

function drawWeatherIcon(x, y) {
  const C = iconCache.weather, key = weatherIconKey();
  if (key !== C.key) { paintWeatherIcon(C); C.key = key; }
  showIcon(C, x, y);
}
function paintWeatherIcon(C) {
  const g = iconBegin(C), c = ICON_N / 2, k = weather.kind, night = env.dark > 0.5;
  const fill = (col, fn) => { g.fillStyle = col; fn(); };
  const cloud = (dark) => {
    // Pilvi kolmesta pyöreästä möykystä ja tasaisesta pohjasta
    fill(dark ? '#5c6370' : '#aab2be', () => { disc(g, c - 5, c + 1, 4); disc(g, c + 5, c + 1, 4); g.fillRect(c - 5, c + 1, 11, 4); });
    fill(dark ? '#7a828f' : '#e6eaf0', () => { disc(g, c - 1, c - 2, 5); disc(g, c - 5, c, 3); disc(g, c + 4, c - 1, 4); });
    fill(dark ? '#99a1ad' : '#ffffff', () => { g.fillRect(c - 4, c - 6, 4, 1); g.fillRect(c - 6, c - 3, 1, 2); });
  };
  if (k === 'clear' && night) {
    fill('#efe8c4', () => {
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dy * dy <= 36 && (dx - 3) ** 2 + (dy + 2) ** 2 > 22) g.fillRect(c - 1 + dx, c + dy, 1, 1);
      }
    });
    fill('#fffbe8', () => g.fillRect(c - 6, c - 1, 1, 3));
    const big = moonBig();
    fill('#f4f4ff', () => { g.fillRect(c + 6, c - 5, 1, 1); if (big) { g.fillRect(c + 5, c - 5, 3, 1); g.fillRect(c + 6, c - 6, 1, 3); } });
  } else if (k === 'clear') {
    fill('#ffb63c', () => {
      for (let a = 0; a < 8; a++) {
        const ux = Math.cos(a * Math.PI / 4), uy = Math.sin(a * Math.PI / 4);
        for (const r of [7, 8]) g.fillRect(Math.round(c + ux * r), Math.round(c + uy * r), 1, 1);
      }
    });
    fill('#ffd23f', () => disc(g, c, c, 4));
    fill('#fff1a8', () => { g.fillRect(c - 2, c - 3, 3, 1); g.fillRect(c - 3, c - 2, 1, 2); });
  } else if (k === 'drizzle' || k === 'rain') {
    const heavy = k === 'rain';
    cloud(heavy);
    // Pisarat putoavat hitaasti pilven alla
    const n = heavy ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const px = c - (heavy ? 6 : 5) + i * (heavy ? 4 : 5), ph = rainPhase(i, heavy);
      fill(heavy ? '#5aa0e6' : '#8cc8f4', () => {
        if (heavy) { for (let q = 0; q < 3; q++) g.fillRect(px - q + 1, c + 7 + ph + q, 1, 1); }
        else g.fillRect(px, c + 7 + ph, 1, 2);
      });
    }
  } else {
    for (let r = 0; r < 3; r++) {
      const off = fogShift(r), w = r === 1 ? 14 : 11, yy = c - 4 + r * 4;
      fill(r === 1 ? '#e2e8ec' : '#c2ccd2', () => g.fillRect(c - (w >> 1) + off, yy, w, 2));
    }
  }
  outlineSprite(C.cv, 'rgba(8, 12, 16, 0.9)');
}

function drawWindIcon(x, y) {
  const gst = wind.gust, level = gst < 0.08 ? 0 : gst < 0.3 ? 1 : gst < 0.6 ? 2 : 3;
  const col = ['#9aa8ae', '#d8e4ea', '#ffffff', '#ffcd75'][level];
  // Nuolen suunta pyöristetään kahdeksaan ilmansuuntaan, jolloin nuolen pikselit pysyvät siisteinä
  // (vinot nuolet kulkevat tarkalleen 45 asteen kulmassa)
  const d = level === 0 ? 0 : ((Math.round(Math.atan2(wind.sy, wind.sx) / (Math.PI / 4)) % 8) + 8) % 8;
  const C = iconCache.wind, key = level + ',' + d;
  if (key !== C.key) {
    // Kompassin pohja ja rengas (ilman ääriviivaa), pääilmansuunnat pidempinä merkkeinä; niiden päälle ääriviivattu nuoli
    const cg = iconBegin(C), c = ICON_N / 2;
    cg.fillStyle = 'rgba(8, 14, 18, 0.5)'; disc(cg, c, c, 10);
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      cg.fillStyle = a % 8 === 0 ? '#c8d4da' : 'rgba(140, 158, 168, 0.75)';
      cg.fillRect(Math.round(c + Math.cos(ang) * 10), Math.round(c + Math.sin(ang) * 10), 1, 1);
    }
    const g = iconCtx;
    g.clearRect(0, 0, ICON_N, ICON_N);
    if (level === 0) { g.fillStyle = col; g.fillRect(c - 1, c - 1, 3, 3); }
    else {
      // Nuoli: paksu varsi ja täytetty kärki
      const dx = Math.round(Math.cos(d * Math.PI / 4)), dy = Math.round(Math.sin(d * Math.PI / 4)), nx = -dy, ny = dx;
      const L = dx && dy ? 5 : 7;   // vinossa askel on pidempi, joten pikselimäärä pienempi
      g.fillStyle = col;
      for (let k = -L; k <= 1; k++) {
        g.fillRect(c + dx * k, c + dy * k, 1, 1);
        g.fillRect(c + dx * k + (dx && dy ? dx : nx), c + dy * k + (dx && dy ? 0 : ny), 1, 1);
      }
      // Kärki: suorilla nuolilla kolmio, vinoilla suorakulmainen kolmio, jonka kateetit osoittavat taaksepäin
      if (dx && dy) {
        for (let yy = 0; yy <= 5; yy++) for (let xx = 0; xx <= 5; xx++) if (xx + yy >= 5) g.fillRect(c + xx * dx, c + yy * dy, 1, 1);
      } else {
        for (let k = 0; k <= 4; k++) {
          const half = 4 - k;
          for (let s = -half; s <= half + 1; s++) g.fillRect(c + dx * (2 + k) + nx * s, c + dy * (2 + k) + ny * s, 1, 1);
        }
      }
    }
    outlineSprite(iconCanvas, 'rgba(8, 12, 16, 0.9)');
    cg.drawImage(iconCanvas, 0, 0);
    C.key = key;
  }
  showIcon(C, x, y);
  // Voimakkuuspalkit kompassin oikealla puolella
  for (let b = 0; b < 3; b++) {
    const h = 4 + b * 2, bx = x + 13 + b * 4, by = y + 7 - h;
    ctx.fillStyle = 'rgba(8, 12, 16, 0.85)'; ctx.fillRect(bx - 1, by - 1, 4, h + 2);
    ctx.fillStyle = b < level ? col : 'rgba(150, 165, 175, 0.4)'; ctx.fillRect(bx, by, 2, h);
  }
}

// Kuvakkeet kellon oikealla puolella: sää ylempänä, tuuli sen alla
function drawWindVane() {
  const x = WATCH.x + WATCH.size + 14;
  drawWeatherIcon(x, WATCH.y + 11);
  drawWindIcon(x, WATCH.y + 36);
}

// Teksti piirretään isolle kankaalle, jotta pikselifontti pysyy terävänä
// Teksti piirretään suoraan, kunnes sama teksti on näkynyt kolmesti: sen jälkeen siitä tehdään valmis kuva, jota
// piirretään joka ruudussa (fillText on hidas etenkin puhelimissa; HUD-rivit muuttuvat harvoin). Joka ruudussa
// muuttuvia tekstejä ei välimuistiteta.
const textCache = new Map(), textSeen = new Map();
let textFrame = 0;
// Kun fontti on latautunut, välimuistiin ehtinyt vara-fontilla piirretty teksti unohdetaan
if (document.fonts) { document.fonts.addEventListener('loadingdone', () => { textCache.clear(); textSeen.clear(); }); document.fonts.ready.then(() => { textCache.clear(); textSeen.clear(); }); }
function textDirect(g, str, x, y, size, color, align) {
  g.font = `${size * S}px "Press Start 2P", monospace`;
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillStyle = '#1a1c2c';
  g.fillText(str, x + S, y + S);
  g.fillStyle = color;
  g.fillText(str, x, y);
}
function text(str, x, y, size = 8, color = '#ffffff', align = 'center') {
  const key = size * S + '|' + color + '|' + str;
  let c = textCache.get(key);
  if (!c) {
    const n = (textSeen.get(key) || 0) + 1;
    textSeen.set(key, n);
    if (n < 3) { textDirect(vctx, str, x * S, y * S, size, color, align); return; }
    vctx.font = `${size * S}px "Press Start 2P", monospace`;
    const w = Math.ceil(vctx.measureText(str).width) + S * 2, h = Math.ceil(size * S * 1.3) + S * 2;
    const cv = makeCanvas(w + 4, h + 4);
    textDirect(cv.getContext('2d'), str, 2, 2, size, color, 'left');
    if (textCache.size > 300) textCache.clear();
    c = { cv, w: w - S * 2 };
    textCache.set(key, c);
  }
  const dx = align === 'center' ? -c.w / 2 : align === 'right' ? -c.w : 0;
  vctx.drawImage(c.cv, Math.round(x * S + dx) - 2, Math.round(y * S) - 2);
}

function dim(a = 0.6) {
  vctx.fillStyle = `rgba(7, 18, 14, ${a})`;
  vctx.fillRect(0, 0, view.width, view.height);
}

// Rannekello vasemmassa yläkulmassa. Kellotaulu (img/watch.png) on valmiiksi pelin pikselikoossa,
// ja viisarit piirretään sen päälle pikseli kerrallaan. Valmis kuva suurennetaan ruudulle terävin
// pikselein, jolloin kello sopii pelin pixel-art-tyyliin.
const WATCH_IMG = new Image();
WATCH_IMG.src = 'img/watch.png';
const WATCH = { x: 3, y: 2, size: 49, cx: 24 / 49, cy: 24 / 49 };   // keskipikseli kuvan osuutena
const watchCanvas = makeCanvas(WATCH.size, WATCH.size), watchCtx = watchCanvas.getContext('2d');

let watchKey = -1;
function drawWatch(tod) {
  if (!WATCH_IMG.complete || !WATCH_IMG.naturalWidth) return;
  const g = watchCtx, n = WATCH.size;
  const h = (4.5 + tod * 24) % 24, m = (h % 1) * 60;
  // Viisarit piirretään uudelleen vain kun aika on edennyt neljännesminuutin (viisarin pikselit eivät muutu sitä tiheämmin)
  const wk = Math.floor(h * 240);
  if (wk === watchKey) { vctx.imageSmoothingEnabled = false; vctx.drawImage(watchCanvas, WATCH.x * S, WATCH.y * S, n * S, n * S); return; }
  watchKey = wk;
  g.clearRect(0, 0, n, n);
  g.drawImage(WATCH_IMG, 0, 0);
  const cx = WATCH.cx * n, cy = WATCH.cy * n;
  // Viisari pikseliviivana: tumma reunus ja kermanvärinen keskus
  const hand = (ang, len, col) => {
    const dx = Math.sin(ang), dy = -Math.cos(ang);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) plotLine(g, cx + ox * 0.6, cy + oy * 0.6, cx + dx * len + ox * 0.6, cy + dy * len + oy * 0.6, '#101010');
    plotLine(g, cx, cy, cx + dx * len, cy + dy * len, col);
  };
  hand(((h % 12) / 12) * Math.PI * 2, 8, '#ffffff');    // tuntiviisari
  hand((m / 60) * Math.PI * 2, 14, '#e8e8e8');             // minuuttiviisari
  g.fillStyle = '#b8b8b8'; g.fillRect(Math.round(cx), Math.round(cy), 1, 1);
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(watchCanvas, WATCH.x * S, WATCH.y * S, n * S, n * S);
}

// Tekijätiedot ja versio (näkyvät aloitusruudulla)
const VERSION = '0.1';
const CREDITS = { copyright: '© 2026 DeTremolo Games', rights: 'All rights reserved.' };

function render() {
  drawWorld();
  // Nukkuessa ruutu pimenee mustaksi ja herätessä valkenee
  if (state === 'sleep') {
    const a = sleep.phase === 'in' ? sleep.t / FADE : sleep.phase === 'zz' ? 1 : 1 - sleep.t / FADE;
    ctx.fillStyle = `rgba(0, 0, 0, ${clamp(a, 0, 1).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(buf, 0, 0, W * S, H * S);
  const blink = Math.floor(performance.now() / 500) % 2 === 0;

  if (state === 'title') {
    dim(0.5);
    const ty = Math.floor((H - 216) / 2);   // aloitusruutu ikkunan keskelle
    text('COZY', W / 2, ty + 40, 16, '#ffcd75');
    text('FISHING', W / 2, ty + 60, 16, '#a7d8f0');
    text('A QUIET POND IN THE SPRUCE FOREST', W / 2, ty + 92, 5, '#c8d8b0');
    if (blink) text(touch.on ? 'TAP TO START' : 'CLICK TO START', W / 2, ty + 118, 7);
    const help = touch.on
      ? ['drag anywhere = walk · ROD = rod · LAMP = headlamp', 'SLEEP = sleep in the tent until morning']
      : ['WASD = walk · mouse = look and aim · R = rod', 'F = headlamp · E = sleep in the tent until morning'];
    text(help[0], W / 2, ty + 140, 4, '#94b0c2');
    text(help[1], W / 2, ty + 148, 4, '#94b0c2');
    if (!touch.on) {
      text('Q lure · wheel hook / reel-in speed / bait · C cut line · E boat · V cheat', W / 2, ty + 156, 4, '#94b0c2');
      text('E wood · Z fire · X axe · K knife · N chop · T time · L clock · P pause · M sound', W / 2, ty + 164, 4, '#94b0c2');
    }
    text('stand still and the forest animals come closer', W / 2, ty + 175, 4, '#c0a070');
    text(CREDITS.copyright, W / 2, ty + 188, 5, '#a7f070');
    text(CREDITS.rights, W / 2, ty + 198, 4, '#94b0c2');
    text('v' + VERSION, W - 6, H - 10, 4, '#6f8a78', 'right');
    return;
  }

  drawWatch(env.tod);
  if (clockSync) text('>>', WATCH.x + WATCH.size + 28, 8, 5, '#ffcd75', 'left');
  else if (timeScale > 1) text(timeScale + 'x', WATCH.x + WATCH.size + 28, 8, 5, '#ffcd75', 'left');
  if (state !== 'sleep') {
    let ly = WATCH.y + WATCH.size + 4;
    const line = (str, col) => { text(str, 6, ly, 4, col, 'left'); ly += 8; };
    if (player.rod && isArt(player.lure)) {
      line(player.lure === 'spoon' ? 'SPOON' : 'WOBBLER', '#a8c0d8');
      line('REEL IN ' + Math.round(cast.reelSpeed) + ' cm/s' + (touch.on ? '' : '  (WHEEL)'), '#e0b0b8');
    } else if (player.rod && isRig(player.lure)) {
      line(LURES[player.lure].name, '#a8c0d8');
      line('BAIT ' + Math.round(cast.rigDist * 100) + ' cm' + (cast.lure ? '' : touch.on ? '' : '  (WHEEL)'), '#e0b0b8');
    } else if (player.rod) {
      // Koho-ongella koukun syvyyden perään tieto, jos syötti on pohjassa tai koho kuivalla maalla
      const L = cast.lure, out = L && L.st === 'float' && !L.fish;
      const where = !out ? '' : !L.onWater ? '  ON LAND' : cast.hookDepth >= depthAt(L.x, L.y) - 0.06 ? '  ON BOTTOM' : '';
      line('HOOK ' + cast.hookDepth.toFixed(1) + ' m' + (L ? '' : touch.on ? '' : '  (WHEEL)') + where, where ? '#ffcd75' : '#e0b0b8');
    }
    // Vaapun syvyys, ja perään tieto, jos vaappu kulkee pohjassa tai on kuivalla maalla;
    // matka pohjaan vain huijaustilassa
    const L = cast.lure;
    if (L && isArt(L.kind) && L.st === 'float' && !L.fish) {
      if (!L.onWater) line('DEPTH -  ON LAND', '#ffcd75');
      else {
        const bottom = L.z >= depthAt(L.x, L.y) - 0.07;
        line('DEPTH ' + (L.z * 100).toFixed(1) + ' cm' + (bottom ? '  ON BOTTOM' : '') + (water.show || bottom ? '' : '  BOTTOM +' + Math.max(0, depthAt(L.x, L.y) - L.z).toFixed(2) + ' m'), bottom ? '#ffcd75' : '#a8c0d8');
      }
    }
    // Pohjaongen puntin syvyys; kun puntti on pohjassa, muistutus kelata siima kireälle (syötti ei saa maata pohjassa)
    if (L && isRig(L.kind) && L.st === 'float' && !L.fish) {
      if (!L.onWater) line('SINKER -  ON LAND', '#ffcd75');
      else {
        const bottom = L.z >= depthAt(L.x, L.y) - 0.07, rs = rigState(L);
        line('SINKER ' + (L.z * 100).toFixed(1) + ' cm' + (bottom ? '  ON BOTTOM' : '') + (water.show || bottom ? '' : '  BOTTOM +' + Math.max(0, depthAt(L.x, L.y) - L.z).toFixed(2) + ' m'), bottom ? '#ffcd75' : '#a8c0d8');
        if (bottom && rs.lying) line(rs.tf < 1 ? 'BAIT ON BOTTOM - REEL IN TO TIGHTEN' : 'BAIT ON BOTTOM', '#e0a0a0');
      }
    }
    if (cast.lure && cast.lure.st === 'float') line('LINE ' + cast.lure.out.toFixed(1) + ' / ' + LINE_MAX + ' m', '#c8d8e0');
    if (player.boat && boat.rider === 'drive') line('BOAT ' + (boat.v * 60).toFixed(1) + ' m/s', '#c8d8e0');
    if (player.wood > 0) line('WOOD ' + player.wood, '#d8b080');
    if (catches.length) line('CATCH ' + catches.length + '  ' + fmtWeight(catches.reduce((s, c) => s + c.w, 0)), '#a7f070');
  }
  if (state === 'sleep') {
    // Nukkuessa näkyvät vain kellonaika, unikuplat ja herätyskehote
    const z = Math.floor(performance.now() / 400) % 4;
    if (sleep.phase === 'zz') text('Z' + 'z'.repeat(z), W / 2, H / 2 - 8, 10, '#94b0c2');
    if (sleep.phase !== 'out') text(touch.on ? 'TAP TO WAKE UP' : 'PRESS ANY KEY TO WAKE UP', 6, H - 11, 4, '#94b0c2', 'left');
    return;
  }
  if (muted) text('SOUND OFF', W - 6, 14, 4, '#94b0c2', 'right');
  if (!touch.on) {
    const inBoat = player.boat, driving = inBoat && boat.rider === 'drive';
    const dtt = Math.hypot(player.x - TENT_DOOR.x, player.y - TENT_DOOR.y), dff = Math.hypot(player.x - CAMP.cx - 0.5, player.y - CAMP.cy - 0.5);
    if (canLightFire()) text('Z  LIGHT THE FIRE', 6, H - 47, 4, blink ? '#ffcd75' : '#e0b060', 'left');
    if (nearFire() && !(canSleep() && dtt < dff)) text(fireFull() ? 'FIRE IS FULL' : 'E  ADD FIREWOOD', 6, H - 29, 4, fireFull() ? '#94b0c2' : blink ? '#ffcd75' : '#e0b060', 'left');
    else if (canSleep()) text('E  SLEEP IN THE TENT', 6, H - 29, 4, blink ? '#ffcd75' : '#e0b060', 'left');
    else if (canBoard()) text('E  BOARD THE BOAT', 6, H - 29, 4, blink ? '#ffcd75' : '#e0b060', 'left');
    else if (driving) text('W / S  THROTTLE   A / D  STEER', 6, H - 29, 4, '#c8d8e0', 'left');
    else if (player.rod) text(cast.lure ? 'HOLD MOUSE  REEL IN' : 'HOLD MOUSE  CAST', 6, H - 29, 4, '#c8d8e0', 'left');
    if (cast.lure && cast.lure.st === 'float') text('C  CUT LINE', 6, H - 38, 4, '#e0a0a0', 'left');
    else if (player.rod && !cast.lure) text('Q  CHANGE LURE', 6, H - 38, 4, '#a8c0d8', 'left');
    else if (inBoat && canLeave()) text('E  GO ASHORE', 6, H - 38, 4, blink ? '#ffcd75' : '#e0b060', 'left');
    if (inBoat) text(player.rod ? 'R  DRIVE THE BOAT' : boatStopped() ? 'R  STAND UP AND FISH' : 'R  FISH (STOP FIRST)', 6, H - 20, 4, player.rod ? '#ffcd75' : '#94b0c2', 'left');
    else text((player.rod ? 'R  STOW ROD' : 'R  TAKE ROD'), 6, H - 20, 4, player.rod ? '#ffcd75' : '#94b0c2', 'left');
    text((player.light ? 'F  LAMP ON' : 'F  LAMP OFF'), 6, H - 11, 4, player.light ? '#ffe9a0' : '#94b0c2', 'left');
    // Työkalut ja polttopuut: rivit pinotaan ylöspäin
    const extra = [];
    if (player.chop) extra.push(['SPACE / CLICK  SWING THE AXE', '#ffcd75'], ['MOVE  STOP CHOPPING', '#94b0c2']);
    if (player.tool === 'knife') extra.push(['SPACE / CLICK  SWING THE KNIFE', '#94b0c2']);
    if (!inBoat) {
      extra.push([player.tool === 'axe' ? 'X  STOW AXE' : 'X  TAKE AXE', player.tool === 'axe' ? '#ffcd75' : '#94b0c2']);
      extra.push([player.tool === 'knife' ? 'K  STOW KNIFE' : 'K  TAKE KNIFE', player.tool === 'knife' ? '#ffcd75' : '#94b0c2']);
    }
    const ea = eAction();
    if (ea && ea.label === 'TAKE WOOD') extra.push(['E  TAKE WOOD (RACK ' + SHED.logs + ')', blink ? '#ffcd75' : '#e0b060']);
    if (canStoreWood()) extra.push(['Y  PUT WOOD ON THE RACK', blink ? '#ffcd75' : '#e0b060']);
    if (canMakeWood()) extra.push(['N  MAKE FIREWOOD', blink ? '#ffcd75' : '#e0b060']);
    extra.forEach(([t, c], i) => text(t, 6, H - 56 - i * 9, 4, c, 'left'));
  }
  if (banners.length) text(banners[0].text, W / 2, 34, 6, '#ffcd75');
  // Tähdätyn heiton etäisyys tähtäimen vieressä
  if (state === 'play' && player.rod && !cast.lure && cast.charging && aimCast()) {
    const d = castTarget()[2];
    text(d > CAST_AIM_MAX ? 'TOO FAR' : d.toFixed(1) + ' m', Math.round(mouseX) + 9, Math.round(mouseY) + 3, 4, d > CAST_AIM_MAX ? '#ff6a50' : '#ffe9a0', 'left');
  }
  // Debug-tilassa (vesi piilotettuna) tähtäimen vieressä veden syvyys siinä pinnan kohdassa, johon
  // tähtäin osuu; lisäksi veden kehitysnäppäimet
  if (state === 'play' && aiming() && !touch.on) {
    const ax = Math.round(mouseX) + Math.round(cam.x) - PB.x0, ay = Math.round(mouseY) + Math.round(cam.y) - PB.y0;
    if (!water.show && ax >= 0 && ay >= 0 && ax < PB.w && ay < PB.h && (pondMask[ay * PB.w + ax] === 1 || pondMask[ay * PB.w + ax] === 2)) {
      const [wx, wy] = absToWorld(Math.round(mouseX) + Math.round(cam.x), Math.round(mouseY) + Math.round(cam.y));
      text(depthAt(wx, wy).toFixed(1) + ' m', Math.round(mouseX) + 9, Math.round(mouseY) - 9, 4, '#e8dca0', 'left');
    }
    if (water.show) text('V CHEAT MODE', W - 6, H - 9, 4, '#94b0c2', 'right');
    else text('V CHEAT MODE ON  [ ] MURK ' + water.turb.toFixed(2) + '  B LINES  H FISH BAR' + (ui.fishBar ? ' ON' : ''), W - 6, H - 9, 4, '#e0a0a0', 'right');
  }

  if (state === 'pause') {
    dim();
    text('PAUSED', W / 2, 86, 12, '#ffcd75');
    text(touch.on ? 'Tap to resume' : 'P to resume', W / 2, 110, 6, '#94b0c2');
  }
}

// Ikkunan koon muuttuessa ruudun kokoiset apukerrokset luodaan uudelleen
function resizeBuffers() {
  for (const c of [waterCanvas, starCanvas, lightCanvas, darkCanvas, lampCanvas, lampTint, underCanvas, holeShape, holeCanvas]) { c.width = W; c.height = H; }
  fogCanvas.width = W / 4; fogCanvas.height = H / 4;
  waterImg = waterCtx.createImageData(W, H);
  darkImg = darkCtx.createImageData(W, H);
  holeImg = holeCtx.createImageData(W, H);
  rowWob = new Int8Array(H);
  if (player) { cam.x = isoX(player.x, player.y) - W / 2; cam.y = isoY(player.x, player.y) - 12 - H / 2; }
}
buffersReady = true;

// ---------------------------------------------------------------------------
// Pelisilmukka: kiinteä 60 Hz päivitys, piirto joka ruudunpäivityksellä
// ---------------------------------------------------------------------------
setupWorld();
const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
// Laatutaso: hidas laite (ruudun aika pitkään yli 22 ms) siirtyy automaattisesti kevyeen tilaan, jossa veden
// ja yön valokerrokset, tähdet ja heijastukset päivitetään harvemmin eikä usvaa piirretä lammella.
// G-näppäin vaihtaa tilaa käsin. Tila säilyy, kunnes peli ladataan uudelleen.
function setGfx(low, manual) {
  if (low === gfxLow) return;
  gfxLow = low; if (manual) gfxManual = true;
  waterKey = ''; starSnap.valid = false; nightKey = '';
  notify(low ? (manual ? 'Graphics: low' : 'Slow device: graphics set to low (G = toggle)') : 'Graphics: normal', 160, 'gfx');
}
// Ajoitusnäkymä (O-näppäin tai napautus FPS-lukemaan): kunkin piirto-osan ruudun aika millisekunteina (kaikkien
// ruutujen keskiarvo, sisältää sisäkkäiset kutsut), jolla löydetään hitaan laitteen todellinen pullonkaula
const prof = { on: false, t: {}, n: 0, orig: {}, lines: [] };
const PROF_FUNCS = ['update', 'render', 'drawWorld', 'drawWater', 'drawUnderwater', 'drawReflections', 'drawWeather', 'drawNight', 'viewHole', 'snapStars', 'drawStarReflections', 'drawWaterMist', 'drawShadows', 'drawSeal', 'drawCampfire', 'drawPlayer'];
function toggleProf() {
  prof.on = !prof.on;
  if (prof.on) {
    prof.t = {}; prof.n = 0;
    for (const f of PROF_FUNCS) {
      const o = window[f]; if (typeof o !== 'function') continue;
      prof.orig[f] = o; prof.t[f] = 0;
      window[f] = function (...a) { const t = performance.now(); const r = o.apply(this, a); prof.t[f] += performance.now() - t; return r; };
    }
  } else {
    for (const f in prof.orig) window[f] = prof.orig[f];
    prof.orig = {}; prof.lines = [];
  }
}
function drawProf() {
  if (++prof.n >= 30) {
    prof.lines = Object.entries(prof.t).map(([k, v]) => [k, v / prof.n]).sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const k in prof.t) prof.t[k] = 0;
    prof.n = 0;
  }
  prof.lines.forEach(([k, v], i) => text(k.replace(/^draw/, '').toUpperCase() + ' ' + v.toFixed(1), W - 6, 22 + i * 7, 4, '#e0c070', 'right'));
}
// FPS ja yhden ruudun laskenta-aika (päivitykset + piirtokomennot, ei selaimen omaa rasterointia),
// keskiarvo puolen sekunnin ajalta; näkyy oikeassa yläkulmassa
const perf = { n: 0, ms: 0, t0: 0, fps: 0, avg: 0, slow: 0 };
let gfxLow = false, gfxManual = false;
function drawPerf() {
  text(perf.fps + ' FPS  ' + perf.avg.toFixed(1) + ' MS' + (gfxLow ? '  LOW' : ''), W - 6, 6, 4, '#94b0c2', 'right');
  if (prof.on) drawProf();
}
function frame(t) {
  const t0 = performance.now();
  if (++textFrame % 900 === 0) textSeen.clear();
  acc += Math.min(100, t - last);
  last = t;
  while (acc >= STEP) { update(); acc -= STEP; }
  render();
  const t1 = performance.now();
  perf.n++; perf.ms += t1 - t0;
  if (!perf.t0) perf.t0 = t1;
  else if (t1 - perf.t0 >= 500) {
    perf.fps = Math.round((perf.n * 1000) / (t1 - perf.t0)); perf.avg = perf.ms / perf.n;
    perf.n = 0; perf.ms = 0; perf.t0 = t1;
    // Hidas laite: ruudun aika yli 22 ms (tai fps alle 40 ja aika yli 12 ms) kolme mittausta (1,5 s) peräkkäin -> kevyt tila
    if (!gfxLow && !gfxManual && state === 'play' && (perf.avg > 22 || (perf.fps < 40 && perf.avg > 12) || (perf.fps < 50 && perf.fps > 0 && perf.avg > 7))) { if (++perf.slow >= 3) setGfx(true, false); } else perf.slow = 0;
  }
  drawPerf();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
