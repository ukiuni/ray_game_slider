// Update policy: updates are detected any time, but only applied when no race is running.
export const RESUME_KEY = 'slider.resume';
export const CHECK_INTERVAL_MS = 60 * 1000;

export class UpdateManager {
  /**
   * @param {object} o
   * @param {() => boolean} o.isBusy  true while a race is being played
   * @param {() => void} o.apply  actually activates the new version (reloads the page)
   * @param {() => void} [o.beforeApply] persist state before reloading
   */
  constructor({ isBusy, apply, beforeApply = () => {} }) {
    this.isBusy = isBusy;
    this.apply = apply;
    this.beforeApply = beforeApply;
    this.pending = false;
    this.applied = false;
    this.checker = null;
  }

  setChecker(fn) {
    this.checker = fn;
  }

  /** ask the server whether a new version exists (no-op while busy, to avoid network jank mid race) */
  async check() {
    if (!this.checker || this.isBusy()) return false;
    try {
      await this.checker();
      return true;
    } catch {
      return false;
    }
  }

  /** a new version has been downloaded and is waiting */
  onUpdateAvailable() {
    this.pending = true;
    return this.tryApply();
  }

  /** call whenever the game reaches a safe point (title / result screens) */
  tryApply() {
    if (!this.pending || this.applied || this.isBusy()) return false;
    this.applied = true;
    this.beforeApply();
    this.apply();
    return true;
  }
}

export function saveResume(storage, snap) {
  try {
    storage.setItem(RESUME_KEY, JSON.stringify({ ...snap, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function loadResume(storage, maxAgeMs = 10 * 60 * 1000) {
  try {
    const raw = storage.getItem(RESUME_KEY);
    if (!raw) return null;
    storage.removeItem(RESUME_KEY);
    const snap = JSON.parse(raw);
    if (!snap || Date.now() - snap.savedAt > maxAgeMs) return null;
    return snap;
  } catch {
    return null;
  }
}
