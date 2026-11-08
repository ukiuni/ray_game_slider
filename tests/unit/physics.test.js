import { describe, it, expect } from 'vitest';
import { generateTrack, TUBE_R, RIM } from '../../src/core/track.js';
import { createRacer, placeOnTrack, stepRacer, predictLanding, FIXED_DT } from '../../src/core/physics.js';

const track = generateTrack(1);
const run = (r, input, seconds, t0 = 0) => {
  let t = t0;
  for (let k = 0; k < seconds / FIXED_DT; k++) {
    stepRacer(r, track, typeof input === 'function' ? input(r, t) : input, FIXED_DT, t);
    t += FIXED_DT;
    if (r.mode === 'finished' || r.mode === 'exploded') break;
  }
  return t;
};

describe('racer physics', () => {
  it('slides down the slider by gravity and gains speed', () => {
    const r = createRacer({ id: 0, animal: 'cat' });
    placeOnTrack(r, track, 2);
    run(r, { steer: 0 }, 5);
    expect(r.mode).toBe('track');
    expect(r.s).toBeGreaterThan(20);
    expect(r.v).toBeGreaterThan(8);
    // stays on the tube surface
    const f = track.frameAt(r.s);
    expect(r.pos.distanceTo(f.pos)).toBeCloseTo(TUBE_R, 1);
  });

  it('a careful racer reaches the end and splashes into the pool', () => {
    const r = createRacer({ id: 0, animal: 'cat' });
    placeOnTrack(r, track, 2);
    run(r, (rr) => ({ steer: Math.max(-1, Math.min(1, -2 * rr.th - 0.8 * rr.thv)) }), 120);
    expect(r.mode).toBe('finished');
    expect(r.finishTime).toBeGreaterThan(5);
    expect(r.events.map((e) => e.type)).toContain('splash');
  });

  it('steering towards the outside of a curve makes the racer overflow the rim and fly off', () => {
    const r = createRacer({ id: 0, animal: 'cat' });
    placeOnTrack(r, track, 40, 0, 10);
    let left = false;
    const outward = -Math.sign(track.frameAt(60).K.dot(track.frameAt(60).S));
    run(r, (rr) => {
      if (rr.mode === 'air') left = true;
      return { steer: outward };
    }, 6);
    expect(left).toBe(true);
    expect(r.events.some((e) => e.type === 'overflow')).toBe(true);
    expect(Math.abs(r.th)).toBeGreaterThan(RIM - 0.1);
  });

  it('jumping straight up lands back on the slider', () => {
    const r = createRacer({ id: 0, animal: 'cat' });
    placeOnTrack(r, track, 60, 0, 10);
    stepRacer(r, track, { steer: 0, jump: true }, FIXED_DT, 0);
    expect(r.mode).toBe('air');
    run(r, { steer: 0 }, 3);
    expect(r.mode).toBe('track');
    expect(r.events.some((e) => e.type === 'land_track')).toBe(true);
  });

  it('falling onto the grass explodes (failure)', () => {
    const r = createRacer({ id: 0, animal: 'cat' });
    r.mode = 'air';
    r.pos.set(track.pool.x + track.pool.r + 40, 20, track.pool.z);
    r.vel.set(0, 0, 0);
    run(r, { steer: 0 }, 5);
    expect(r.mode).toBe('exploded');
    expect(r.failReason).toBe('ground');
  });

  it('falling into the pool from high up is a finish', () => {
    const r = createRacer({ id: 0, animal: 'cat' });
    r.mode = 'air';
    r.cooldown = 10;
    r.pos.set(track.pool.x, 30, track.pool.z);
    r.vel.set(0, 0, 0);
    run(r, { steer: 0 }, 5);
    expect(r.mode).toBe('finished');
  });

  it('free fall from an upper loop can land on a lower loop (shortcut)', () => {
    // find a sample with another part of the slider straight below it
    let found = null;
    for (let i = 100; i < track.n && !found; i += 5) {
      for (let j = i + 150; j < track.n; j += 2) {
        const dx = track.P[i * 3] - track.P[j * 3], dz = track.P[i * 3 + 2] - track.P[j * 3 + 2];
        if (dx * dx + dz * dz < 0.25) { found = [i, j]; break; }
      }
    }
    expect(found).not.toBeNull();
    const [i, j] = found;
    const r = createRacer({ id: 0, animal: 'cat' });
    r.mode = 'air';
    r.prevInside = false;
    r.pos.set(track.P[i * 3], track.P[i * 3 + 1] - TUBE_R - 1, track.P[i * 3 + 2]);
    r.vel.set(0, 0, 0);
    const p = predictLanding(r, track, 0);
    expect(p.type).toBe('track');
    expect(p.s).toBeGreaterThan(i * track.ds + 50); // skipped a big part of the course
    expect(p.s).toBeLessThanOrEqual(j * track.ds + 10);
    run(r, { steer: 0 }, 4);
    expect(r.mode).toBe('track');
    expect(r.s).toBeGreaterThan(p.s - 1);
    expect(r.events.some((e) => e.type === "land_track")).toBe(true);
  });

  it('predictLanding reports ground when falling over grass', () => {
    const r = createRacer({ id: 0, animal: 'cat' });
    r.mode = 'air';
    r.pos.set(200, 10, 200);
    r.vel.set(0, 0, 0);
    expect(predictLanding(r, track, 0).type).toBe('ground');
  });
});
