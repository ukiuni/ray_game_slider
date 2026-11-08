import { describe, it, expect } from 'vitest';
import { Race, COUNTDOWN } from '../../src/core/race.js';
import { cpuParams } from '../../src/core/ai.js';
import { ANIMALS } from '../../src/core/animals.js';

const runRace = (race, max = 300) => {
  while (!race.result && race.time < max) race.update(1 / 30);
  return race.result;
};

describe('race', () => {
  it('has a countdown before racers move', () => {
    const race = new Race({ stage: 1, rngSeed: 1 });
    const s0 = race.player.s;
    race.update(1);
    expect(race.phase).toBe('countdown');
    expect(race.player.s).toBe(s0);
    for (let k = 0; k < COUNTDOWN * 10 + 5; k++) race.update(0.1);
    expect(race.phase).toBe('running');
  });

  it('player is a selected animal and CPUs are other different animals', () => {
    const race = new Race({ stage: 1, playerAnimal: 'panda', rngSeed: 5 });
    expect(race.racers).toHaveLength(4);
    expect(race.player.animal).toBe('panda');
    const ids = race.racers.map((r) => r.animal);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(ANIMALS.some((a) => a.id === id)).toBe(true);
  });

  it('steering into the outside of the curves throws the player off -> explodes -> loss', () => {
    const race = new Race({ stage: 1, rngSeed: 2 });
    while (!race.result && race.time < 300) {
      const f = race.track.frameAt(race.player.s);
      race.setInput(-Math.sign(f.K.dot(f.S)) || 1, false);
      race.update(1 / 30);
    }
    expect(race.result).toMatchObject({ outcome: 'lose', reason: 'exploded' });
  });

  it('a skilled player wins stage 1 every time', () => {
    for (let k = 1; k <= 10; k++) {
      const race = new Race({ stage: 1, rngSeed: k, autopilot: { skill: 1, shortcutRate: 0 } });
      const res = runRace(race);
      expect(res.outcome).toBe('win');
      expect(res.rank).toBe(1);
    }
  });

  it('later stages are winnable but harder', () => {
    let wins = 0;
    for (let k = 1; k <= 10; k++) {
      const race = new Race({ stage: 5, rngSeed: k, autopilot: { skill: 1, shortcutRate: 1 } });
      if (runRace(race).outcome === 'win') wins++;
    }
    expect(wins).toBeGreaterThan(0);
    expect(cpuParams(8).dragMul).toBeLessThan(cpuParams(1).dragMul);
    expect(cpuParams(8).skill).toBeGreaterThan(cpuParams(1).skill);
    expect(cpuParams(1).shortcutRate).toBe(0);
    expect(cpuParams(6).shortcutRate).toBeGreaterThan(0);
  });

  it('CPUs reach the pool on their own', () => {
    const race = new Race({ stage: 2, rngSeed: 9 });
    race.setInput(0, false);
    // let the race go on until all CPUs have finished or exploded
    for (let k = 0; k < 120 * 200; k++) {
      race.fixedStep(1 / 120);
      if (race.racers.slice(1).every((r) => r.mode === 'finished' || r.mode === 'exploded')) break;
    }
    expect(race.racers.slice(1).filter((r) => r.mode === 'finished').length).toBeGreaterThan(0);
  });

  it('player exploding ends the race as a loss', () => {
    const race = new Race({ stage: 1, rngSeed: 3 });
    for (let k = 0; k < 40; k++) race.update(0.1);
    const p = race.player;
    p.mode = 'air';
    p.pos.set(race.track.pool.x + 60, 3, race.track.pool.z);
    p.vel.set(0, 0, 0);
    runRace(race);
    expect(race.result).toMatchObject({ outcome: 'lose', reason: 'exploded' });
    expect(race.drainEvents().some((e) => e.type === 'explode' && e.racer === 0)).toBe(true);
  });

  it('ranking puts finished racers first', () => {
    const race = new Race({ stage: 1, rngSeed: 3 });
    race.racers[2].mode = 'finished';
    race.racers[2].finishTime = 10;
    race.racers[1].progress = 50;
    expect(race.ranking()[0].id).toBe(2);
  });
});
