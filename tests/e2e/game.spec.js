import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__slider.state());

async function open(page, query = '?debug=1') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(query);
  await expect(page.locator('#btn-start')).toBeVisible();
  await page.waitForFunction(() => !!window.__slider);
  return errors;
}

async function startRace(page) {
  await page.locator('#btn-start').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForFunction(() => window.__slider.state().phase === 'playing');
}

test('title screen renders a WebGL scene with animal selection', async ({ page }) => {
  const errors = await open(page);
  const hasGL = await page.evaluate(() => {
    const c = document.getElementById('game');
    return c.width > 0 && c.height > 0 && !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  expect(hasGL).toBe(true);
  await expect(page.locator('.animal-btn')).toHaveCount(10);
  await page.locator('.animal-btn[data-animal="panda"]').click();
  await expect(page.locator('.animal-btn[data-animal="panda"]')).toHaveClass(/selected/);
  await page.locator('#btn-help').click();
  await expect(page.locator('#help')).toBeVisible();
  await page.locator('#btn-help-close').click();
  expect(errors).toEqual([]);
});

test('viewport is fixed (no zoom, no scroll)', async ({ page }) => {
  await open(page);
  const vp = await page.locator('meta[name=viewport]').getAttribute('content');
  expect(vp).toContain('user-scalable=no');
  expect(vp).toContain('maximum-scale=1');
  const css = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { overflow: s.overflow, touch: s.touchAction, position: s.position };
  });
  expect(css).toEqual({ overflow: 'hidden', touch: 'none', position: 'fixed' });
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  // touchmove outside panels is cancelled (prevents rubber band / pinch zoom)
  const prevented = await page.evaluate(() => {
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    ev.touches = [{}, {}];
    document.getElementById('game').dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('PWA: manifest and service worker', async ({ page, browserName }) => {
  await open(page, './');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await page.request.get(href)).json();
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const i of manifest.icons) expect((await page.request.get(i.src)).ok()).toBe(true);
  test.skip(browserName === 'webkit', 'service worker check runs on chromium');
  const ok = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  expect(ok).toBe(true);
});

test('race: countdown, touch controls steer and jump the player', async ({ page }) => {
  const errors = await open(page);
  await startRace(page);
  await expect(page.locator('#countdown')).toBeVisible();
  await page.waitForFunction(() => window.__slider.state().raceTime > 1, null, { timeout: 15_000 });
  const steerOf = () => page.evaluate(() => window.__slider.debug.getRace().playerInput.steer);
  for (const [id, dir] of [['#btn-right', 1], ['#btn-left', -1]]) {
    const btn = page.locator(id);
    await btn.dispatchEvent('pointerdown', { pointerId: 7 });
    await expect(btn).toHaveClass(/active/);
    await expect.poll(steerOf).toBe(dir);
    await btn.dispatchEvent('pointerup', { pointerId: 7 });
    await expect.poll(steerOf).toBe(0);
  }
  const jumpWatch = page.waitForFunction(() => {
    const r = window.__slider.debug.getRace().player;
    return r.mode === 'air' || r.jumpCd > 0;
  }, null, { timeout: 5000, polling: 'raf' });
  await page.locator('#btn-jump').dispatchEvent('pointerdown', { pointerId: 8 });
  await page.locator('#btn-jump').dispatchEvent('pointerup', { pointerId: 8 });
  await jumpWatch;
  expect(await page.locator('#hud-rank').textContent()).toMatch(/[1-4]/);
  expect(errors).toEqual([]);
});

test('winning auto-starts the next stage until the player loses', async ({ page }) => {
  await open(page);
  await startRace(page);
  // win stage 1
  await page.evaluate(() => window.__slider.debug.forceWin());
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result-title')).toContainText('クリア');
  await expect(page.locator('#auto-next')).toBeVisible();
  // the next stage starts by itself
  await page.waitForFunction(() => window.__slider.state().phase === 'playing' && window.__slider.state().stage === 2, null, { timeout: 10_000 });
  await expect(page.locator('#hud-stage')).toHaveText('2');
  // win stage 2 -> stage 3 also auto starts
  await page.evaluate(() => window.__slider.debug.forceWin());
  await page.waitForFunction(() => window.__slider.state().phase === 'playing' && window.__slider.state().stage === 3, null, { timeout: 10_000 });
  expect((await state(page)).streak).toBe(2);
  // lose -> stops
  await page.evaluate(() => window.__slider.debug.forceLose());
  await expect(page.locator('#result-title')).toContainText('ドカーン');
  await expect(page.locator('#auto-next')).toBeHidden();
  await page.waitForTimeout(5000);
  const s = await state(page);
  expect(s.phase).toBe('result');
  expect(s.autoContinue).toBe(false);
  // retry same stage
  await expect(page.locator('#btn-next')).toHaveText('リトライ');
  await page.locator('#btn-next').click();
  await page.waitForFunction(() => window.__slider.state().phase === 'playing');
  expect((await state(page)).stage).toBe(3);
});

test('auto continue can be stopped', async ({ page }) => {
  await open(page);
  await startRace(page);
  await page.evaluate(() => window.__slider.debug.forceWin());
  await expect(page.locator('#btn-stop-auto')).toBeVisible();
  await page.locator('#btn-stop-auto').click();
  await page.waitForTimeout(5000);
  expect((await state(page)).phase).toBe('result');
  await page.locator('#btn-title').click();
  await expect(page.locator('#title')).toBeVisible();
});

test('updates are deferred during a race and applied after it (streak continues)', async ({ page }) => {
  await open(page);
  await startRace(page);
  await page.waitForFunction(() => window.__slider.state().raceTime > 0.5, null, { timeout: 15_000 });
  const marker = await page.evaluate(() => (window.__marker = Math.random()));
  const applied = await page.evaluate(() => window.__slider.debug.fakeUpdate());
  expect(applied).toBe(false);
  await page.waitForTimeout(1500);
  // still the same page, still racing
  expect(await page.evaluate(() => window.__marker)).toBe(marker);
  let s = await state(page);
  expect(s.phase).toBe('playing');
  expect(s.updatePending).toBe(true);
  // finishing the race reaches a safe point -> reload -> resumes with stage 2
  const nav = page.waitForEvent('framenavigated');
  await page.evaluate(() => window.__slider.debug.forceWin());
  await nav;
  await page.waitForFunction(() => window.__slider && window.__slider.state().phase === 'playing', null, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__marker)).toBeUndefined();
  s = await state(page);
  expect(s.stage).toBe(2);
  expect(s.streak).toBe(1);
});

test('update on the title screen is applied right away', async ({ page }) => {
  await open(page);
  const nav = page.waitForEvent('framenavigated');
  await page.evaluate(() => window.__slider.debug.fakeUpdate());
  await nav;
  await expect(page.locator('#title')).toBeVisible();
});
