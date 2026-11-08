import { describe, it, expect, vi } from 'vitest';
import { Session, AUTO_NEXT_DELAY } from '../../src/core/session.js';

const win = { outcome: 'win', reason: 'first' };
const lose = { outcome: 'lose', reason: 'exploded' };

describe('session flow (auto continue until losing)', () => {
  it('after a win the next stage starts automatically', () => {
    const s = new Session();
    const events = [];
    s.on((t, d) => events.push([t, d]));
    s.start('dog');
    expect(s.phase).toBe('playing');
    expect(s.busy).toBe(true);
    s.raceEnded(win);
    expect(s.phase).toBe('result');
    expect(s.busy).toBe(false);
    expect(s.stage).toBe(2);
    expect(s.tick(AUTO_NEXT_DELAY / 2)).toBe(false);
    expect(s.tick(AUTO_NEXT_DELAY)).toBe(true);
    expect(s.phase).toBe('playing');
    expect(events.filter((e) => e[0] === 'race').map((e) => e[1].stage)).toEqual([1, 2]);
  });

  it('keeps going stage after stage until a loss', () => {
    const s = new Session();
    s.start('cat');
    for (let k = 0; k < 5; k++) {
      s.raceEnded(win);
      s.tick(AUTO_NEXT_DELAY + 0.01);
    }
    expect(s.stage).toBe(6);
    expect(s.streak).toBe(5);
    expect(s.bestStage).toBe(5);
    s.raceEnded(lose);
    expect(s.phase).toBe('result');
    expect(s.autoContinue).toBe(false);
    for (let k = 0; k < 10; k++) expect(s.tick(1)).toBe(false);
    expect(s.phase).toBe('result');
    // retry the same stage
    s.next();
    expect(s.phase).toBe('playing');
    expect(s.stage).toBe(6);
    expect(s.streak).toBe(0);
  });

  it('stopping auto continue waits for the player', () => {
    const s = new Session();
    s.start('cat');
    s.raceEnded(win);
    s.stopAuto();
    expect(s.tick(100)).toBe(false);
    expect(s.phase).toBe('result');
    s.next();
    expect(s.phase).toBe('playing');
    expect(s.stage).toBe(2);
  });

  it('ignores results when not playing and can go back to title', () => {
    const s = new Session();
    const fn = vi.fn();
    s.on(fn);
    s.raceEnded(win);
    expect(fn).not.toHaveBeenCalled();
    s.start('cat');
    s.toTitle();
    expect(s.phase).toBe('title');
  });

  it('snapshot / restore', () => {
    const s = new Session();
    s.start('frog');
    s.raceEnded(win);
    const snap = s.snapshot();
    const t = new Session();
    t.restore(snap);
    expect(t.stage).toBe(2);
    expect(t.animal).toBe('frog');
    expect(t.streak).toBe(1);
    expect(snap.outcome).toBe('win');
  });
});
