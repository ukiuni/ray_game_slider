import { generateTrack, stageSeed, TUBE_R } from './track.js';
import { createRacer, placeOnTrack, stepRacer, FIXED_DT } from './physics.js';
import { createAI, aiInput, cpuParams } from './ai.js';
import { createRng } from './rng.js';
import { ANIMALS } from './animals.js';

export const COUNTDOWN = 3;

/**
 * Headless race simulation: one player vs CPU racers on a stage's slider.
 */
export class Race {
  constructor({ stage = 1, playerAnimal = 'cat', cpuCount = 3, seed, rngSeed, autopilot = null } = {}) {
    this.stage = stage;
    this.track = generateTrack(stage, seed ?? stageSeed(stage));
    this.rng = createRng(rngSeed ?? (Math.random() * 2 ** 32) >>> 0);
    this.time = -COUNTDOWN; // negative while counting down
    this.phase = 'countdown';
    this.acc = 0;
    this.result = null;
    this.events = [];
    this.playerInput = { steer: 0, jump: false };
    this.jumpLatch = false;

    const params = cpuParams(stage);
    const others = ANIMALS.filter((a) => a.id !== playerAnimal);
    const picks = [];
    while (picks.length < cpuCount) {
      const a = this.rng.pick(others);
      if (!picks.includes(a)) picks.push(a);
    }
    const player = createRacer({ id: 0, animal: playerAnimal, isPlayer: true, dragMul: 1, name: 'あなた' });
    this.racers = [player];
    this.ais = [autopilot ? createAI({ ...autopilot, rng: this.rng }) : null];
    picks.forEach((a, k) => {
      this.racers.push(createRacer({ id: k + 1, animal: a.id, dragMul: params.dragMul, name: a.name }));
      this.ais.push(
        createAI({ skill: params.skill * this.rng.range(0.85, 1.05), shortcutRate: params.shortcutRate, rng: this.rng }),
      );
    });
    // starting grid
    const ths = [-0.9, -0.3, 0.3, 0.9];
    const order = [...this.racers.keys()];
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(this.rng() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    order.forEach((ri, slot) => placeOnTrack(this.racers[ri], this.track, 2, ths[slot % 4], 0));
  }

  get player() {
    return this.racers[0];
  }

  setInput(steer, jumpPressed) {
    this.playerInput.steer = steer;
    if (jumpPressed) this.jumpLatch = true;
  }

  update(dt) {
    dt = Math.min(dt, 0.25);
    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      this.fixedStep(FIXED_DT);
    }
  }

  fixedStep(dt) {
    this.time += dt;
    if (this.phase === 'countdown') {
      if (this.time >= 0) {
        this.phase = 'running';
        this.events.push({ type: 'go', racer: null, time: 0 });
      }
      return;
    }
    if (this.phase === 'done' && this.time > this.doneAt + 8) return;
    this.racers.forEach((r, i) => {
      let input;
      if (i === 0 && !this.ais[0]) {
        input = { steer: this.playerInput.steer, jump: this.jumpLatch };
        this.jumpLatch = false;
      } else {
        input = aiInput(this.ais[i], r, this.track, this.time);
      }
      stepRacer(r, this.track, input, dt, this.time);
      for (const e of r.events) this.events.push({ ...e, racer: r.id });
      r.events.length = 0;
    });
    this.collide();
    this.judge();
  }

  collide() {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.mode !== 'track') continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.mode !== 'track') continue;
        const ds = b.s - a.s;
        const dl = (b.th - a.th) * TUBE_R;
        if (Math.abs(ds) < 1.1 && Math.abs(dl) < 1.0) {
          // bump: exchange some speed and push sideways
          const push = (1.0 - Math.abs(dl)) * 0.8 * (dl >= 0 ? 1 : -1);
          a.thv -= push;
          b.thv += push;
          if (ds > 0) {
            const dv = (a.v - b.v) * 0.2;
            if (dv > 0) { a.v -= dv; b.v += dv; }
          } else {
            const dv = (b.v - a.v) * 0.2;
            if (dv > 0) { b.v -= dv; a.v += dv; }
          }
        }
      }
    }
  }

  judge() {
    if (this.result) return;
    const p = this.player;
    const firstCpu = this.racers.find((r) => !r.isPlayer && r.mode === 'finished');
    if (p.mode === 'finished') {
      const earlier = this.racers.filter((r) => !r.isPlayer && r.mode === 'finished' && r.finishTime < p.finishTime);
      this.finish(earlier.length === 0 ? { outcome: 'win', reason: 'first' } : { outcome: 'lose', reason: 'beaten', by: earlier[0].id });
    } else if (p.mode === 'exploded') {
      this.finish({ outcome: 'lose', reason: 'exploded' });
    } else if (firstCpu) {
      this.finish({ outcome: 'lose', reason: 'beaten', by: firstCpu.id });
    }
  }

  finish(res) {
    this.result = { ...res, time: this.time, stage: this.stage, rank: this.rankOf(0) };
    this.phase = 'done';
    this.doneAt = this.time;
  }

  ranking() {
    return [...this.racers].sort((a, b) => {
      const fa = a.mode === 'finished', fb = b.mode === 'finished';
      if (fa && fb) return a.finishTime - b.finishTime;
      if (fa !== fb) return fa ? -1 : 1;
      const ea = a.mode === 'exploded', eb = b.mode === 'exploded';
      if (ea !== eb) return ea ? 1 : -1;
      return b.progress - a.progress;
    });
  }

  rankOf(id) {
    return this.ranking().findIndex((r) => r.id === id) + 1;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
