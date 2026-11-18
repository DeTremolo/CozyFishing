'use strict';
// Cozy Fishing — © 2026 DeTremolo Games. All rights reserved.

// ---------------------------------------------------------------------------
// Kosketusohjaus puhelimille ja tableteille (esim. Brave / Chrome / Safari).
// Liiketikku syntyy siihen kohtaan, johon sormi painetaan (missä tahansa näytöllä).
// ROD- ja LAMP-napit (onki ja otsalamppu) vastaavat näppäimiä R ja F; SLEEP (teltalla) näppäintä E
// ja LURE (vieheen vaihto, kun siima on kelattu sisään) näppäintä Q.
// CAST-nappi vastaa hiiren nappia: pohjassa pitäminen lataa heittoa tai kelaa siimaa sisään.
// ---------------------------------------------------------------------------
(() => {
  const STICK_R = 56;        // tikun säde CSS-pikseleinä
  const MOVE_DEAD = 0.2;     // liiketikun kuollut alue
  const SQUARE_DEAD = 0.12;  // veneen neliötikun kuollut alue (akselikohtainen)

  const ui = document.getElementById('touch-ui');
  const sticks = {};         // kosketuksen id -> tikku
  let moveId = null;

  const base = document.createElement('div');
  base.className = 'stick';
  const knob = document.createElement('div');
  knob.className = 'knob';
  base.appendChild(knob);
  ui.appendChild(base);

  function showStick(x, y, square) {
    base.style.left = x + 'px';
    base.style.top = y + 'px';
    base.classList.toggle('square', !!square);
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.add('show');
  }
  function hideStick() { base.classList.remove('show'); }

  function setTouchMode(on) {
    if (touch.on === on) return;
    touch.on = on;
    document.body.classList.toggle('touch', on);
    if (!on) releaseAll();
    resize();
  }

  function releaseAll() {
    for (const id in sticks) delete sticks[id];
    moveId = null;
    touch.mx = touch.my = 0;
    touch.cast = false;
    mouseHeld2 = false;
    hideStick();
  }

  // Koko näytön tila + vaakasuunta (Android). iPhonella ei tueta, jolloin ei tehdä mitään.
  function goFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  }

  function stickUpdate(s, t) {
    let dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (s.square) {
      // Veneen ohjaus: nuppi liikkuu neliömäisellä alueella, ylös / alas = kaasu eteen / taakse ja vasen / oikea = ohjaus
      // erikseen, jolloin täysi vauhti ja täysi käännös onnistuvat yhtä aikaa (pyöreä alue rajaisi niiden summan)
      dx = Math.max(-STICK_R, Math.min(STICK_R, dx)); dy = Math.max(-STICK_R, Math.min(STICK_R, dy));
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const axis = (v) => { const a = Math.abs(v) / STICK_R; return a > SQUARE_DEAD ? Math.sign(v) * Math.min(1, (a - SQUARE_DEAD) / (1 - SQUARE_DEAD)) : 0; };
      touch.mx = axis(dx); touch.my = axis(dy);
      return;
    }
    const len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const v = Math.min(1, len / STICK_R);
    if (v > MOVE_DEAD) { touch.mx = dx / (v * STICK_R); touch.my = dy / (v * STICK_R); }
    else touch.mx = touch.my = 0;
  }

  addEventListener('touchstart', (e) => {
    setTouchMode(true);
    if (e.cancelable) e.preventDefault();        // estää zoomauksen, vierityksen ja selaimen hiiriemulaation
    for (const t of e.changedTouches) {
      // Napautus oikean yläkulman FPS-lukemaan: ajoitusnäkymä päälle / pois
      if (state === 'play' && t.clientX > innerWidth - 190 && t.clientY < 46) { pressed.KeyO = true; continue; }
      const s = { x: t.clientX, y: t.clientY, startState: state, move: false, square: !!(player && player.boat && boat && boat.rider === 'drive') };
      sticks[t.identifier] = s;
      if (state !== 'play' || moveId !== null) continue;
      s.move = true; moveId = t.identifier;
      showStick(s.x, s.y, s.square);
      stickUpdate(s, t);
    }
  }, { passive: false });

  addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      const s = sticks[t.identifier];
      if (s && s.move) stickUpdate(s, t);
    }
  }, { passive: false });

  function touchEnd(e) {
    if (e.cancelable) e.preventDefault();
    // Ääni ja koko näyttö sallitaan vasta sormen noston jälkeen
    initAudio();
    for (const t of e.changedTouches) {
      const s = sticks[t.identifier];
      if (!s) continue;
      delete sticks[t.identifier];
      if (s.move) { moveId = null; touch.mx = touch.my = 0; hideStick(); }
      else if (e.type === 'touchend' && s.startState === state) {
        // Napautus valikossa: aloittaa pelin tai jatkaa taukoa
        if (state === 'title') { pressed.Enter = true; goFullscreen(); }
        else if (state === 'pause') pressed.KeyP = true;
        else if (state === 'sleep') pressed.Enter = true;   // napautus herättää
      }
    }
  }
  addEventListener('touchend', touchEnd, { passive: false });
  addEventListener('touchcancel', touchEnd, { passive: false });

  // Napit: toiminto heti kosketuksesta, eikä kosketus päädy tikulle
  function button(id, action, onEnd) {
    const b = document.getElementById(id);
    b.addEventListener('touchstart', (e) => {
      if (e.cancelable) e.preventDefault(); e.stopPropagation();
      setTouchMode(true);
      b.classList.add('down');
      if (!onEnd) action();
    }, { passive: false });
    b.addEventListener('touchend', (e) => {
      if (e.cancelable) e.preventDefault(); e.stopPropagation();
      b.classList.remove('down');
      initAudio();
      if (onEnd) action();
    }, { passive: false });
    b.addEventListener('touchcancel', () => b.classList.remove('down'));
  }

  // Napit: ROD ottaa ongen käteen / laittaa sen pois, LAMP otsalamppu, LURE vaihtaa vieheen, CUT katkaisee siiman
  button('btn-rod', () => { if (state === 'play') pressed.KeyR = true; });
  button('btn-light', () => { if (state === 'play') pressed.KeyF = true; });
  button('btn-cut', () => { if (state === 'play') pressed.KeyC = true; });
  button('btn-lure', () => { if (state === 'play') pressed.KeyQ = true; });

  // Työkalut: AXE / KNIFE ottavat työkalun käteen, STOW laittaa kädessä olevan pois, CHOP iskee kirveellä (sama kuin välilyönti)
  button('btn-axe', () => { if (state === 'play') pressed.KeyX = true; });
  button('btn-knife', () => { if (state === 'play') pressed.KeyK = true; });
  button('btn-stow', () => { if (state === 'play' && player.tool) pressed[player.tool === 'axe' ? 'KeyX' : 'KeyK'] = true; });
  button('btn-chop', () => { if (state === 'play') pressed.Space = true; });

  // Tee-painikkeet (enintään kolme): näyttävät sen, minkä pelaaja voi juuri nyt tehdä (valinta tehdään pelissä, contextActions)
  const actKeys = [null, null, null];
  const actBtns = ['btn-act', 'btn-act2', 'btn-act3'].map((id, i) => {
    button(id, () => { if (state === 'play' && actKeys[i]) pressed[actKeys[i]] = true; });
    return document.getElementById(id);
  });

  // Heitto- ja kelausnappia pidetään pohjassa: heitto lähtee sormen noustessa katsesuuntaan, ja heitetyn
  // vieheen kanssa pohjassa pitäminen kelaa siimaa sisään (sama kuin hiiren vasen nappi).
  // Uistimella (vaappu, lippa) kelaus-painike muuttuu pohjassa pidettäessä pystysuoraksi liukusäätimeksi: sormen siirto ylös / alas
  // säätää kelausnopeutta (alhaalla pienin 10 cm/s, ylhäällä suurin 100 cm/s), ja sormen noston jälkeen painikkeet palaavat.
  const castBtn = document.getElementById('btn-cast'), slider = document.getElementById('reel-slider'), sliderKnob = document.getElementById('reel-knob');
  let sliderId = null;
  function sliderShow() {
    // Nuppi sormen (tai nykyisen nopeuden) kohdalle
    const r = slider.getBoundingClientRect(), kh = sliderKnob.offsetHeight, f = (cast.reelSpeed - 10) / 90;
    sliderKnob.style.bottom = Math.round(f * (r.height - 4 - kh)) + 'px';
  }
  function sliderSet(clientY) {
    const r = slider.getBoundingClientRect(), f = Math.max(0, Math.min(1, (r.bottom - clientY) / r.height));
    cast.reelSpeed = 10 + f * 90;   // portaaton 10-100 cm/s
    sliderShow();
  }
  castBtn.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault(); e.stopPropagation();
    setTouchMode(true);
    castBtn.classList.add('down');
    touch.cast = state === 'play';
    if (state === 'play' && player && cast && cast.lure && isArt(player.lure)) {
      sliderId = e.changedTouches[0].identifier;
      slider.classList.add('on'); document.body.classList.add('sliding');
      sliderSet(e.changedTouches[0].clientY);   // kelaus alkaa nopeudella, joka vastaa kohtaa, johon painiketta painettiin
    }
  }, { passive: false });
  addEventListener('touchmove', (e) => {
    if (sliderId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== sliderId) continue;
      sliderSet(t.clientY);
    }
  }, { passive: false });
  const castUp = (e) => {
    if (e.cancelable) e.preventDefault(); e.stopPropagation();
    castBtn.classList.remove('down'); touch.cast = false; initAudio();
    sliderId = null; slider.classList.remove('on'); document.body.classList.remove('sliding');
  };
  castBtn.addEventListener('touchend', castUp, { passive: false });
  castBtn.addEventListener('touchcancel', castUp, { passive: false });

  // Siiman vapautus: pohjassa pitäminen päästää siimaa kelalta (sama kuin hiiren oikea nappi)
  const releaseBtn = document.getElementById('btn-release');
  releaseBtn.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault(); e.stopPropagation();
    setTouchMode(true);
    releaseBtn.classList.add('down');
    if (state === 'play') mouseHeld2 = true;
  }, { passive: false });
  const releaseUp = (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); releaseBtn.classList.remove('down'); mouseHeld2 = false; initAudio(); };
  releaseBtn.addEventListener('touchend', releaseUp, { passive: false });
  releaseBtn.addEventListener('touchcancel', releaseUp, { passive: false });

  // Plus ja miinus: koho-ongella koukun syvyys, pohjaongella syötin etäisyys, uistimilla kelausnopeus
  // (sama kuin hiiren rulla). Pohjassa pitäminen toistaa askeleen.
  function repeatButton(id, key) {
    const b = document.getElementById(id);
    let t1 = 0, t2 = 0;
    const stop = (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); b.classList.remove('down'); clearTimeout(t1); clearInterval(t2); initAudio(); };
    b.addEventListener('touchstart', (e) => {
      if (e.cancelable) e.preventDefault(); e.stopPropagation();
      setTouchMode(true);
      b.classList.add('down');
      const step = () => { if (state === 'play') pressed[key] = true; };
      step();
      t1 = setTimeout(() => { t2 = setInterval(step, 130); }, 400);
    }, { passive: false });
    b.addEventListener('touchend', stop, { passive: false });
    b.addEventListener('touchcancel', stop, { passive: false });
  }
  repeatButton('btn-minus', 'Minus');
  repeatButton('btn-plus', 'Equal');

  button('btn-pause', () => { if (state === 'play') { pressed.KeyP = true; releaseAll(); } });
  button('btn-sound', () => { pressed.KeyM = true; });
  button('btn-full', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else goFullscreen();
  }, true);
  if (!document.fullscreenEnabled) document.getElementById('btn-full').hidden = true;

  // Napit seuraavat pelin tilaa: st-hand (ei onkea kädessä), st-ready (onki kädessä, ei heitetty), st-out (heitetty)
  const rodBtn = document.getElementById('btn-rod'), lightBtn = document.getElementById('btn-light');
  const chopBtn = document.getElementById('btn-chop'), stowBtn = document.getElementById('btn-stow'), stepLabel = document.getElementById('step-label');
  setInterval(() => {
    const play = state === 'play', rod = !!(player && player.rod), out = !!(cast && cast.lure), tool = player && player.tool;
    const b = document.body.classList;
    lightBtn.classList.toggle('on', !!(player && player.light));
    b.toggle('menu', state !== 'play' && state !== 'pause');
    b.toggle('st-hand', play && !rod && !tool);
    b.toggle('st-tool', play && !rod && !!tool);
    b.toggle('chopping', play && !!(player && player.chop));
    b.toggle('knife', play && tool === 'knife');
    chopBtn.textContent = tool === 'knife' ? 'SLASH' : 'CHOP';
    b.toggle('st-ready', play && rod && !out);
    b.toggle('st-out', play && rod && out);
    b.toggle('art', !!(player && isArt(player.lure)));
    rodBtn.textContent = rod ? 'STOW ROD' : 'TAKE ROD';
    castBtn.textContent = out ? 'REEL IN' : 'CAST';
    stowBtn.textContent = 'STOW ' + (tool === 'knife' ? 'KNIFE' : 'AXE');
    const acts = contextActions();
    actBtns.forEach((btn, i) => {
      actKeys[i] = acts[i] ? acts[i].key : null;
      b.toggle(i ? 'has-act' + (i + 1) : 'has-act', !!acts[i]);
      if (acts[i]) btn.textContent = acts[i].label;
    });
    if (player && cast) {
      stepLabel.textContent = isRig(player.lure) ? 'BAIT ' + Math.round(cast.rigDist * 100) : 'HOOK ' + cast.hookDepth.toFixed(1);
    }
  }, 100);

  // Oikea hiiri käytössä (esim. kosketusnäytöllinen läppäri) -> takaisin näppäimistöohjaukseen
  view.addEventListener('mousemove', () => setTouchMode(false));

  // Puhelin lukittuu tai sovellus vaihtuu -> tauko
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseAll();
      if (touch.on && state === 'play') state = 'pause';
    }
  });
  addEventListener('blur', releaseAll);

  if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches) {
    setTouchMode(true);
  }
})();
