// Game flow state machine (pure; no DOM).
// title -> playing -> result(win) -> (auto) playing next stage ... -> result(lose) -> retry / title
export const AUTO_NEXT_DELAY = 3.5; // seconds before the next stage starts automatically after a win

export class Session {
  constructor({ bestStage = 0 } = {}) {
    this.phase = 'title';
    this.stage = 1;
    this.animal = 'cat';
    this.streak = 0;
    this.bestStage = bestStage;
    this.autoContinue = true;
    this.autoTimer = 0;
    this.lastResult = null;
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners) fn(type, data, this);
  }

  /** true while a race is in progress (must not be interrupted by updates) */
  get busy() {
    return this.phase === 'playing';
  }

  start(animal, stage = 1) {
    this.animal = animal;
    this.stage = stage;
    this.streak = 0;
    this.autoContinue = true;
    this.beginRace();
  }

  beginRace() {
    this.phase = 'playing';
    this.lastResult = null;
    this.emit('race', { stage: this.stage });
  }

  /** called by the game when the race is decided */
  raceEnded(result) {
    if (this.phase !== 'playing') return;
    this.lastResult = result;
    this.phase = 'result';
    if (result.outcome === 'win') {
      this.streak += 1;
      this.bestStage = Math.max(this.bestStage, this.stage);
      this.stage += 1;
      this.autoTimer = this.autoContinue ? AUTO_NEXT_DELAY : 0;
    } else {
      this.autoContinue = false;
      this.autoTimer = 0;
    }
    this.emit('result', result);
  }

  /** advance timers; returns true if the next race was started automatically */
  tick(dt) {
    if (this.phase === 'result' && this.lastResult?.outcome === 'win' && this.autoContinue) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.beginRace();
        return true;
      }
    }
    return false;
  }

  /** player pressed "stop auto" on the win screen */
  stopAuto() {
    this.autoContinue = false;
    this.emit('autostop');
  }

  /** manually go to next stage (after a win) or retry (after a loss) */
  next() {
    if (this.phase !== 'result') return;
    if (this.lastResult?.outcome === 'win') this.autoContinue = true;
    else this.streak = 0;
    this.autoContinue = true;
    this.beginRace();
  }

  toTitle() {
    this.phase = 'title';
    this.lastResult = null;
    this.emit('title');
  }

  /** state that survives a page reload (used when an update is applied between races) */
  snapshot() {
    return { stage: this.stage, animal: this.animal, streak: this.streak, autoContinue: this.autoContinue, phase: this.phase, outcome: this.lastResult?.outcome ?? null };
  }

  restore(snap) {
    this.stage = snap.stage;
    this.animal = snap.animal;
    this.streak = snap.streak;
    this.autoContinue = snap.autoContinue;
  }
}
