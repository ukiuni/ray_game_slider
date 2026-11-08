import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { generateTrack, TUBE_R, WATER_Y } from '../../src/core/track.js';

describe('track generation', () => {
  for (const stage of [1, 2, 5, 10, 20]) {
    it(`stage ${stage}: descends from a tower to a pool on the ground`, () => {
      const t = generateTrack(stage);
      expect(t.length).toBeGreaterThan(200);
      const firstY = t.P[1];
      const lastY = t.P[(t.n - 1) * 3 + 1];
      expect(firstY).toBeGreaterThan(40);
      expect(lastY).toBeLessThan(4); // slider meets the ground...
      expect(lastY).toBeGreaterThan(1.5);
      // ...at the pool
      const ex = t.P[(t.n - 1) * 3], ez = t.P[(t.n - 1) * 3 + 2];
      expect(t.isInPool(ex, ez)).toBe(true);
      expect(t.pool.y).toBe(WATER_Y);
      // never below ground
      for (let i = 0; i < t.n; i++) expect(t.P[i * 3 + 1]).toBeGreaterThan(TUBE_R);
    });

    it(`stage ${stage}: stacked loops never intersect`, () => {
      const t = generateTrack(stage);
      const step = 4;
      for (let i = 0; i < t.n; i += step) {
        for (let j = i + 120; j < t.n; j += step) {
          const dx = t.P[i * 3] - t.P[j * 3], dz = t.P[i * 3 + 2] - t.P[j * 3 + 2];
          if (dx * dx + dz * dz < (2 * TUBE_R + 1) ** 2) {
            expect(Math.abs(t.P[i * 3 + 1] - t.P[j * 3 + 1])).toBeGreaterThan(2 * TUBE_R + 1.5);
          }
        }
      }
    });
  }

  it('is deterministic per stage and differs between stages', () => {
    const a = generateTrack(3), b = generateTrack(3), c = generateTrack(4);
    expect(a.length).toBe(b.length);
    expect(a.P[100]).toBe(b.P[100]);
    expect(c.length).not.toBe(a.length);
  });

  it('later stages are higher / longer', () => {
    expect(generateTrack(10).startHeight).toBeGreaterThan(generateTrack(1).startHeight);
    expect(generateTrack(10).length).toBeGreaterThan(generateTrack(1).length);
  });

  it('frames are orthonormal with U pointing up-ish', () => {
    const t = generateTrack(2);
    for (let s = 0; s < t.length; s += 10) {
      const f = t.frameAt(s);
      expect(f.T.length()).toBeCloseTo(1, 3);
      expect(Math.abs(f.T.dot(f.S))).toBeLessThan(1e-3);
      expect(Math.abs(f.S.dot(f.U))).toBeLessThan(1e-3);
      expect(f.U.y).toBeGreaterThan(0.5);
    }
  });

  it('nearest() finds the sample closest to a point', () => {
    const t = generateTrack(1);
    const i = 300;
    const p = new Vector3(t.P[i * 3], t.P[i * 3 + 1] + 0.3, t.P[i * 3 + 2]);
    expect(Math.abs(t.nearest(p) - i)).toBeLessThanOrEqual(2);
    expect(t.nearest(new Vector3(500, 500, 500))).toBe(-1);
  });
});
