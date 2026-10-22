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

  const ui = document.getElementById('touch-ui');
  const sticks = {};         // kosketuksen id -> tikku
  let moveId = null;

  const base = document.createElement('div');
  base.className = 'stick';
  const knob = document.createElement('div');
  knob.className = 'knob';
  base.appendChild(knob);
  ui.appendChild(base);

  function showStick(x, y) {
    base.style.left = x + 'px';
    base.style.top = y + 'px';
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
    const len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const v = Math.min(1, len / STICK_R);
    if (v > MOVE_DEAD) { touch.mx = dx / (v * STICK_R); touch.my = dy / (v * STICK_R); }
    else touch.mx = touch.my = 0;
  }

  addEventListener('touchstart', (e) => {
    setTouchMode(true);
    e.preventDefault();        // estää zoomauksen, vierityksen ja selaimen hiiriemulaation
    for (const t of e.changedTouches) {
      const s = { x: t.clientX, y: t.clientY, startState: state, move: false };
      sticks[t.identifier] = s;
      if (state !== 'play' || moveId !== null) continue;
      s.move = true; moveId = t.identifier;
      showStick(s.x, s.y);
      stickUpdate(s, t);
    }
  }, { passive: false });

  addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = sticks[t.identifier];
      if (s && s.move) stickUpdate(s, t);
    }
  }, { passive: false });

  function touchEnd(e) {
    e.preventDefault();
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
      e.preventDefault(); e.stopPropagation();
      setTouchMode(true);
      b.classList.add('down');
      if (!onEnd) action();
    }, { passive: false });
    b.addEventListener('touchend', (e) => {
      e.preventDefault(); e.stopPropagation();
      b.classList.remove('down');
      initAudio();
      if (onEnd) action();
    }, { passive: false });
    b.addEventListener('touchcancel', () => b.classList.remove('down'));
  }

  button('btn-rod', () => { if (state === 'play') pressed.KeyR = true; });
  button('btn-light', () => { if (state === 'play') pressed.KeyF = true; });
  button('btn-sleep', () => { if (canSleep()) pressed.KeyE = true; });
  button('btn-cut', () => { if (state === 'play') pressed.KeyC = true; });
  button('btn-lure', () => { if (state === 'play') pressed.KeyQ = true; });
  button('btn-boat', () => { if (state === 'play') pressed.KeyE = true; });
  button('btn-wood', () => { if (state === 'play') pressed.KeyE = true; });
  button('btn-ignite', () => { if (state === 'play') pressed.KeyZ = true; });
  // Heittonappia pidetään pohjassa: heitto lähtee sormen noustessa katsesuuntaan
  const castBtn = document.getElementById('btn-cast');
  castBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    setTouchMode(true);
    castBtn.classList.add('down');
    touch.cast = state === 'play';
  }, { passive: false });
  const castUp = (e) => { e.preventDefault(); e.stopPropagation(); castBtn.classList.remove('down'); touch.cast = false; initAudio(); };
  castBtn.addEventListener('touchend', castUp, { passive: false });
  castBtn.addEventListener('touchcancel', castUp, { passive: false });
  button('btn-pause', () => { if (state === 'play') { pressed.KeyP = true; releaseAll(); } });
  button('btn-sound', () => { pressed.KeyM = true; });
  button('btn-full', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else goFullscreen();
  }, true);
  if (!document.fullscreenEnabled) document.getElementById('btn-full').hidden = true;

  // Napit näyttävät, onko onki kädessä ja valo päällä
  const rodBtn = document.getElementById('btn-rod'), lightBtn = document.getElementById('btn-light');
  setInterval(() => {
    rodBtn.classList.toggle('on', !!(player && player.rod));
    lightBtn.classList.toggle('on', !!(player && player.light));
    document.body.classList.toggle('menu', state !== 'play' && state !== 'pause');
    document.body.classList.toggle('can-sleep', canSleep());
    document.body.classList.toggle('near-fire', !!player && nearFire());
    document.body.classList.toggle('can-ignite', !!player && canLightFire());
    document.body.classList.toggle('can-boat', !!player && (canBoard() || (player.boat && canLeave())));
    document.body.classList.toggle('can-lure', !!(player && player.rod) && !(cast && cast.lure) && state === 'play');
    document.body.classList.toggle('has-rod', !!(player && player.rod) && state === 'play');
    castBtn.textContent = cast && cast.lure ? 'REEL' : 'CAST';
    document.body.classList.toggle('line-out', !!(cast && cast.lure && cast.lure.st === 'float') && state === 'play');
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
