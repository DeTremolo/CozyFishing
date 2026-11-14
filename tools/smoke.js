// Savutesti: avaa pelin Chromiumissa (Playwright), aloittaa pelin, antaa sen pyöriä hetken,
// ottaa kuvakaappauksen ja raportoi JavaScript-virheet ja ruudunpäivitysnopeuden.
//
// Käyttö repon juuresta:
//   NODE_PATH=$(npm root -g) node tools/smoke.js [kellonaika] [kuva.png]
//   esim. NODE_PATH=$(npm root -g) node tools/smoke.js 22.5 shots/yo.png
// kellonaika on tunteina (0–24); oletuksena keskipäivä 12.
//
// Pelin globaalit muuttujat (player, clock, fire, animals, ducks, ...) ovat käytettävissä
// page.evaluate()-kutsuissa, koska game.js on tavallinen (ei-moduuli) skripti.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const hour = parseFloat(process.argv[2] || '12');
const out = process.argv[3] || 'shots/smoke.png';
const root = path.resolve(__dirname, '..');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1152, height: 648 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.join(root, 'index.html'));
  await p.waitForTimeout(600);
  // Aloitusruudulta peliin
  await p.mouse.click(500, 300);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  // Kellonaika: tod (0–1) alkaa kello 4.5:stä (ks. WAKE_TOD ja START_TOD game.js:ssä)
  await p.evaluate((h) => {
    const tod = (((h - 4.5) / 24) % 1 + 1) % 1;
    clock = ((tod - START_TOD + 1) % 1) * CYCLE;
  }, hour);
  const f0 = await p.evaluate(() => time);
  await p.waitForTimeout(3000);
  const info = await p.evaluate(() => ({ phase: phaseName, updates: time, animals: animals.length, ducks: ducks.length, fishes: fishes.length }));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await p.screenshot({ path: out });
  await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => (++n < 60 ? requestAnimationFrame(f) : r((window.__fps = 60000 / (performance.now() - t0)))); requestAnimationFrame(f); }));
  const fps = await p.evaluate(() => window.__fps);
  console.log('tila', JSON.stringify({ ...info, updatesIn3s: info.updates - f0, fps: Math.round(fps) }));
  console.log('kuva', out);
  console.log(errs.length ? 'VIRHEET\n' + errs.join('\n') : 'ei virheitä');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
