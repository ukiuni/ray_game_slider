import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function grassTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#6fbf4a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const l = 35 + Math.random() * 25;
    g.fillStyle = `hsl(${95 + Math.random() * 25}, 50%, ${l}%)`;
    g.fillRect(x, y, 2, 3 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function waterStreakTexture() {
  const c = canvas(64, 256);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(120,200,255,0.55)';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 2, 10 + Math.random() * 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function poolTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, '#5fd3ff');
  grd.addColorStop(1, '#1f8fd6');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    g.bezierCurveTo(x + 10, y - 8, x + 20, y + 8, x + 34, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dotTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function emojiTexture(emoji, ring = '#ffffff') {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = ring;
  g.stroke();
  g.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
