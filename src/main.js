import './style.css';
import { Race } from './core/race.js';
import { Session } from './core/session.js';
import { ANIMALS, animalById } from './core/animals.js';
import { UpdateManager, saveResume, loadResume, CHECK_INTERVAL_MS } from './core/updater.js';
import { GameView } from './render/gameView.js';
import { Sfx } from './audio.js';
import { lockViewport } from './viewport.js';

/* global __APP_VERSION__ */
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const RESULT_DELAY = 1.6; // seconds to watch the splash / explosion before the result panel

const $ = (id) => document.getElementById(id);
lockViewport();

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : v;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, String(v));
    } catch {
      /* ignore */
    }
  },
};

const sfx = new Sfx();
const view = new GameView($('game'), sfx);
const session = new Session({ bestStage: Number(store.get('slider.best', 0)) });
session.animal = store.get('slider.animal', 'cat');

let race = null;
let demo = null;
let resultTimer = -1;
let lastCount = null;
let goShown = 0;

// ---------------- update handling ----------------
const updater = new UpdateManager({
  isBusy: () => session.busy,
  apply: () => location.reload(),
  beforeApply: () => {
    saveResume(sessionStorage, session.snapshot());
    toast('アップデートを適用しています…', 3000);
  },
});

async function setupPWA() {
  if (DEBUG && params.has('nosw')) return;
  if (!('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        updater.apply = () => updateSW(true);
        if (!updater.onUpdateAvailable()) toast('新しいバージョンがあります。レース後に更新します', 3500);
      },
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        updater.setChecker(() => reg.update());
        setInterval(() => updater.check(), CHECK_INTERVAL_MS);
      },
    });
  } catch (e) {
    console.warn('PWA registration failed', e);
  }
}
setupPWA();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updater.check();
    updater.tryApply();
  }
});

// ---------------- UI ----------------
function toast(msg, ms = 2000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.add('hidden'), ms);
}

function show(id, on) {
  $(id).classList.toggle('hidden', !on);
}

function buildAnimalGrid() {
  const grid = $('animal-grid');
  grid.innerHTML = '';
  for (const a of ANIMALS) {
    const b = document.createElement('button');
    b.className = 'animal-btn' + (a.id === session.animal ? ' selected' : '');
    b.dataset.animal = a.id;
    b.innerHTML = `<span class="em">${a.emoji}</span>${a.name}`;
    b.addEventListener('click', () => {
      session.animal = a.id;
      store.set('slider.animal', a.id);
      grid.querySelectorAll('.animal-btn').forEach((x) => x.classList.toggle('selected', x === b));
    });
    grid.appendChild(b);
  }
}

function refreshTitle() {
  $('best').textContent = session.bestStage > 0 ? `ベスト: STAGE ${session.bestStage}` : 'ベスト: -';
  $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
  $('version').textContent = `v${VERSION}`;
}

function showTitle() {
  show('title', true);
  show('hud', false);
  show('result', false);
  refreshTitle();
  startDemo();
}

function startDemo() {
  demo = new Race({ stage: Math.max(1, session.bestStage || 1), playerAnimal: session.animal, autopilot: { skill: 0.9, shortcutRate: 0.3 } });
  demo.time = 0;
  demo.phase = 'running';
  view.setRace(demo);
}

$('btn-start').addEventListener('click', () => {
  sfx.unlock();
  session.start(session.animal, 1);
});
$('btn-mute').addEventListener('click', () => {
  sfx.unlock();
  sfx.toggleMute();
  refreshTitle();
});
$('btn-help').addEventListener('click', () => show('help', true));
$('btn-help-close').addEventListener('click', () => show('help', false));
$('btn-stop-auto').addEventListener('click', () => {
  session.stopAuto();
  show('auto-next', false);
  show('btn-stop-auto', false);
});
$('btn-next').addEventListener('click', () => {
  sfx.unlock();
  session.next();
});
$('btn-title').addEventListener('click', () => session.toTitle());

session.on((type, data) => {
  if (type === 'race') beginRace(data.stage);
  if (type === 'result') showResult(data);
  if (type === 'title') {
    race = null;
    showTitle();
    updater.tryApply();
  }
});

function beginRace(stage) {
  demo = null;
  race = new Race({ stage, playerAnimal: session.animal });
  view.setRace(race);
  resultTimer = -1;
  lastCount = null;
  goShown = 0;
  show('title', false);
  show('help', false);
  show('result', false);
  show('hud', true);
  $('hud-stage').textContent = stage;
  $('hud-total').textContent = race.racers.length;
  buildProgress();
}

function buildProgress() {
  const bar = $('hud-progress');
  bar.innerHTML = '<span class="goal">🏁</span>';
  race.racers.forEach((r) => {
    const s = document.createElement('span');
    s.className = 'pin' + (r.isPlayer ? ' me' : '');
    s.textContent = animalById(r.animal).emoji;
    s.dataset.id = r.id;
    bar.appendChild(s);
  });
}

function showResult(res) {
  const win = res.outcome === 'win';
  const panel = document.querySelector('.result-panel');
  panel.classList.toggle('win', win);
  panel.classList.toggle('lose', !win);
  $('result-title').textContent = win ? 'クリア！🎉' : res.reason === 'exploded' ? 'ドカーン！💥' : 'ざんねん…';
  let msg;
  if (win) msg = `STAGE ${res.stage} で一番乗り！`;
  else if (res.reason === 'exploded') msg = 'プール以外の場所に落ちて爆散してしまった…';
  else msg = `${animalById(race.racers[res.by].animal).name}が先にゴール！（${res.rank}位）`;
  $('result-msg').textContent = msg;
  $('result-streak').textContent = session.streak > 0 ? `${session.streak} 連勝中！` : '';
  $('btn-next').textContent = win ? '次へ' : 'リトライ';
  show('auto-next', win && session.autoContinue);
  show('btn-stop-auto', win && session.autoContinue);
  show('result', true);
  show('hud', false);
  store.set('slider.best', session.bestStage);
  if (win) sfx.win();
  else sfx.lose();
  // safe point: look for / apply updates now (never during a race)
  updater.check().then(() => updater.tryApply());
  updater.tryApply();
}

// ---------------- input ----------------
const input = { left: false, right: false, jump: false };
function bindHold(id, key) {
  const el = $(id);
  const on = (e) => {
    e.preventDefault();
    sfx.unlock();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    input[key] = true;
    el.classList.add('active');
    if (key === 'jump') input.jumpQueued = true;
  };
  const off = (e) => {
    e.preventDefault();
    input[key] = false;
    el.classList.remove('active');
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindHold('btn-left', 'left');
bindHold('btn-right', 'right');
bindHold('btn-jump', 'jump');
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    input.jumpQueued = true;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  input.left = input.right = false;
});
function steerValue() {
  const l = input.left || keys.has('ArrowLeft') || keys.has('KeyA');
  const r = input.right || keys.has('ArrowRight') || keys.has('KeyD');
  return (r ? 1 : 0) - (l ? 1 : 0);
}

// ---------------- HUD ----------------
function updateHud(dt) {
  const p = race.player;
  $('hud-rank').textContent = race.rankOf(0);
  $('hud-speed').textContent = Math.round(p.vel.length() * 3.6);
  const L = race.track.length;
  for (const pin of $('hud-progress').querySelectorAll('.pin')) {
    const r = race.racers[pin.dataset.id];
    pin.style.left = `${Math.min(100, (Math.min(r.progress, L) / L) * 100)}%`;
    pin.classList.toggle('out', r.mode === 'exploded');
  }
  // countdown
  const cd = $('countdown');
  if (race.time < 0) {
    const n = Math.ceil(-race.time);
    if (n !== lastCount) {
      lastCount = n;
      sfx.beep(false);
    }
    cd.textContent = n;
    cd.classList.remove('hidden');
  } else if (goShown < 0.8) {
    if (goShown === 0) sfx.beep(true);
    goShown += dt;
    cd.textContent = 'GO!';
    cd.classList.remove('hidden');
  } else cd.classList.add('hidden');

  const alert = $('hud-alert');
  let txt = '';
  let danger = false;
  if (p.mode === 'track' && Math.abs(p.th) > 1.25) {
    txt = 'はみ出しそう！';
    danger = true;
  } else if (p.mode === 'air' && view.landing) {
    const t = view.landing.type;
    if (t === 'ground' || t === 'none') {
      txt = '⚠ 地面に激突しそう！ ◀▶で調整！';
      danger = true;
    } else if (t === 'pool') txt = 'プールへ一直線！';
    else txt = 'スライダーに着地できそう！';
  }
  alert.textContent = txt;
  alert.classList.toggle('hidden', !txt);
  alert.classList.toggle('danger', danger);
}

// ---------------- main loop ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  perf.sample(dt);
  if (dt > 0.25) dt = 0.25;
  if (document.visibilityState === 'hidden') return;

  const steer = steerValue();
  if (race && (session.phase === 'playing' || session.phase === 'result')) {
    race.setInput(steer, !!input.jumpQueued);
    input.jumpQueued = false;
    race.update(dt * timeScale);
    view.handleEvents(race.drainEvents());
    view.update(dt, steer);
    if (session.phase === 'playing') {
      updateHud(dt);
      if (race.result) {
        if (resultTimer < 0) resultTimer = RESULT_DELAY;
        resultTimer -= dt;
        if (resultTimer <= 0) session.raceEnded(race.result);
      }
    } else if (session.phase === 'result') {
      const auto = session.lastResult?.outcome === 'win' && session.autoContinue;
      if (auto) {
        $('auto-count').textContent = Math.max(1, Math.ceil(session.autoTimer));
        $('auto-bar').style.width = `${Math.min(100, (1 - session.autoTimer / 3.5) * 100)}%`;
      }
      session.tick(dt);
    }
  } else if (demo) {
    demo.update(dt);
    demo.drainEvents();
    view.updateIdle(dt);
    if (demo.result && demo.time > demo.doneAt + 4) startDemo();
  }
  view.render();
}
let timeScale = DEBUG && params.has('speed') ? Number(params.get('speed')) : 1;

// adaptive quality: lower the resolution / disable shadows when the device can't keep up
const perf = {
  acc: 0,
  frames: 0,
  sample(dt) {
    if (document.visibilityState !== 'visible' || dt > 1) return;
    this.acc += dt;
    this.frames++;
    if (this.acc >= 2) {
      const avg = this.acc / this.frames;
      const q = view.world.getQuality();
      if (avg > 1 / 40 && q < 3) {
        view.world.setQuality(q + 1);
        view.effects.setViewportHeight(window.innerHeight);
      }
      this.acc = 0;
      this.frames = 0;
    }
  },
};
if (params.get('quality') === 'low') view.world.setQuality(3);

window.addEventListener('resize', () => view.resize());
window.addEventListener('orientationchange', () => setTimeout(() => view.resize(), 200));

// ---------------- boot ----------------
buildAnimalGrid();
const resume = loadResume(sessionStorage);
if (resume) {
  session.restore(resume);
  if (resume.phase === 'result' && resume.outcome === 'win' && resume.autoContinue) {
    // an update was applied right after a win: continue the winning streak
    toast('アップデートしました！続きからスタート', 2500);
    session.beginRace();
  } else {
    toast('アップデートしました！', 2500);
    showTitle();
  }
} else {
  showTitle();
}
requestAnimationFrame(frame);

// ---------------- test / debug hooks ----------------
window.__slider = {
  version: VERSION,
  state: () => ({
    phase: session.phase,
    stage: session.stage,
    streak: session.streak,
    autoContinue: session.autoContinue,
    autoTimer: session.autoTimer,
    lastResult: session.lastResult,
    raceTime: race?.time ?? null,
    player: race ? { mode: race.player.mode, s: race.player.s, y: race.player.pos.y } : null,
    updatePending: updater.pending,
    updateApplied: updater.applied,
  }),
};
if (DEBUG) {
  window.__slider.debug = {
    session,
    updater,
    getRace: () => race,
    /** put the player just above the pool (will finish first) */
    forceWin() {
      const p = race.player;
      if (race.time < 0) race.time = 0.001;
      race.phase = 'running';
      p.mode = 'air';
      p.pos.set(race.track.pool.x, 2, race.track.pool.z);
      p.vel.set(0, -2, 0);
      p.cooldown = 5;
    },
    /** drop the player onto the grass far away from the pool */
    forceLose() {
      const p = race.player;
      if (race.time < 0) race.time = 0.001;
      race.phase = 'running';
      p.mode = 'air';
      p.pos.set(race.track.pool.x + race.track.pool.r + 30, 2, race.track.pool.z);
      p.vel.set(0, -2, 0);
      p.cooldown = 5;
    },
    /** simulate "a new service worker is waiting" */
    fakeUpdate() {
      updater.apply = () => location.reload();
      return updater.onUpdateAvailable();
    },
    setTimeScale(s) {
      timeScale = s;
    },
  };
}
