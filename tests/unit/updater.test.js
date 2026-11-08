import { describe, it, expect, vi } from 'vitest';
import { UpdateManager, saveResume, loadResume } from '../../src/core/updater.js';
import { Session } from '../../src/core/session.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('update manager', () => {
  it('never applies an update during a race; applies it at the next safe point', () => {
    const s = new Session();
    const apply = vi.fn();
    const before = vi.fn();
    const u = new UpdateManager({ isBusy: () => s.busy, apply, beforeApply: before });
    s.start('cat');
    expect(u.onUpdateAvailable()).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(u.tryApply()).toBe(false);
    s.raceEnded({ outcome: 'win' });
    expect(u.tryApply()).toBe(true);
    expect(before).toHaveBeenCalledBefore(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(u.tryApply()).toBe(false); // only once
  });

  it('applies immediately on the title screen', () => {
    const apply = vi.fn();
    const u = new UpdateManager({ isBusy: () => false, apply });
    expect(u.onUpdateAvailable()).toBe(true);
    expect(apply).toHaveBeenCalled();
  });

  it('does not even check for updates during a race', async () => {
    let busy = true;
    const checker = vi.fn(async () => {});
    const u = new UpdateManager({ isBusy: () => busy, apply: () => {} });
    u.setChecker(checker);
    expect(await u.check()).toBe(false);
    busy = false;
    expect(await u.check()).toBe(true);
    expect(checker).toHaveBeenCalledTimes(1);
  });

  it('resume state survives the reload once', () => {
    const st = memStorage();
    saveResume(st, { stage: 4, animal: 'pig', streak: 3, autoContinue: true, phase: 'result', outcome: 'win' });
    const r = loadResume(st);
    expect(r).toMatchObject({ stage: 4, animal: 'pig', streak: 3 });
    expect(loadResume(st)).toBeNull();
  });

  it('stale resume state is ignored', () => {
    const st = memStorage();
    st.setItem('slider.resume', JSON.stringify({ stage: 2, savedAt: Date.now() - 3600_000 }));
    expect(loadResume(st)).toBeNull();
  });
});
