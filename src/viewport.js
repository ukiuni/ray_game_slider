// Keep the viewport fixed: no pinch zoom, no double-tap zoom, no scrolling / rubber-banding.
export function lockViewport(doc = document) {
  const prevent = (e) => e.preventDefault();
  // iOS Safari pinch gestures
  doc.addEventListener('gesturestart', prevent, { passive: false });
  doc.addEventListener('gesturechange', prevent, { passive: false });
  doc.addEventListener('gestureend', prevent, { passive: false });
  // multi-touch zoom and page scrolling (allow scrolling inside panels only)
  doc.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 || !(e.target instanceof Element) || !e.target.closest('.panel')) e.preventDefault();
    },
    { passive: false },
  );
  // double-tap zoom
  let lastTouch = 0;
  doc.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouch < 350 && e.target instanceof Element && !e.target.closest('button')) e.preventDefault();
      lastTouch = now;
    },
    { passive: false },
  );
  doc.addEventListener('dblclick', prevent, { passive: false });
  // ctrl + wheel zoom on desktop
  doc.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
  doc.addEventListener('contextmenu', prevent);
  // keep the visual viewport anchored at 0,0 (iOS keyboard / toolbar quirks)
  window.addEventListener('scroll', () => window.scrollTo(0, 0));
}
