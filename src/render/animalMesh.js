import * as THREE from 'three';

const sphere = new THREE.SphereGeometry(1, 20, 14);
const cone = new THREE.ConeGeometry(1, 1, 12);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const matCache = new Map();
let gradientMap = null;

function gradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 170, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function toon(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradient() });
    matCache.set(color, m);
  }
  return m;
}

function blob(geo, color, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, toon(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

/**
 * Build a chibi animal. Faces +Z, up is +Y, origin at the bottom (seat).
 */
export function buildAnimal(def) {
  const g = new THREE.Group();
  const body = def.body;
  const dark = new THREE.Color(body).multiplyScalar(0.55).getHex();
  const parts = [];
  const add = (m) => {
    g.add(m);
    parts.push(m);
    return m;
  };

  // body + belly
  add(blob(sphere, body, 0.42, 0.38, 0.4, 0, 0.36, 0));
  add(blob(sphere, def.belly, 0.3, 0.28, 0.12, 0, 0.34, 0.31));
  // head (big = deformed)
  const headY = 0.95;
  const head = add(blob(sphere, body, 0.56, 0.5, 0.52, 0, headY, 0.05));
  // feet + hands
  for (const sx of [-1, 1]) {
    add(blob(sphere, def.belly, 0.13, 0.1, 0.18, sx * 0.2, 0.08, 0.32));
    add(blob(sphere, body, 0.11, 0.11, 0.11, sx * 0.4, 0.5, 0.15));
  }

  const darkEar = def.ear === 'round-dark' ? 0x222222 : body;
  switch (def.ear) {
    case 'pointy':
      for (const sx of [-1, 1]) {
        const e = add(blob(cone, body, 0.17, 0.32, 0.12, sx * 0.3, headY + 0.48, 0.0));
        e.rotation.z = -sx * 0.35;
        const inner = add(blob(cone, 0xffc0cb, 0.09, 0.18, 0.05, sx * 0.3, headY + 0.45, 0.06));
        inner.rotation.z = -sx * 0.35;
      }
      break;
    case 'pointy-small':
      for (const sx of [-1, 1]) {
        const e = add(blob(cone, body, 0.13, 0.2, 0.08, sx * 0.32, headY + 0.42, 0.05));
        e.rotation.z = -sx * 0.6;
        e.rotation.x = 0.4;
      }
      break;
    case 'floppy':
      for (const sx of [-1, 1]) {
        const e = add(blob(sphere, dark, 0.12, 0.3, 0.1, sx * 0.52, headY + 0.05, 0.0));
        e.rotation.z = sx * 0.3;
      }
      break;
    case 'round':
    case 'round-dark':
      for (const sx of [-1, 1]) add(blob(sphere, darkEar, 0.16, 0.16, 0.08, sx * 0.38, headY + 0.42, 0));
      break;
    case 'long':
      for (const sx of [-1, 1]) {
        const e = add(blob(sphere, body, 0.11, 0.42, 0.08, sx * 0.18, headY + 0.75, -0.02));
        e.rotation.z = -sx * 0.15;
        const inner = add(blob(sphere, 0xffc0cb, 0.06, 0.32, 0.03, sx * 0.18, headY + 0.75, 0.05));
        inner.rotation.z = -sx * 0.15;
      }
      break;
    case 'tuft':
      add(blob(cone, body, 0.08, 0.2, 0.08, 0, headY + 0.55, 0.05));
      break;
    default:
      break;
  }

  // eyes
  const eyeR = def.extra === 'bigeyes' ? 0.13 : 0.085;
  const eyeY = def.extra === 'bigeyes' ? headY + 0.38 : headY + 0.06;
  for (const sx of [-1, 1]) {
    if (def.extra === 'eyepatch') add(blob(sphere, 0x222222, 0.13, 0.16, 0.06, sx * 0.21, headY + 0.04, 0.5)).rotation.z = sx * 0.5;
    if (def.extra === 'bigeyes') add(blob(sphere, 0xffffff, eyeR, eyeR, eyeR, sx * 0.24, eyeY, 0.3));
    add(blob(sphere, 0x1a1a1a, eyeR * (def.extra === 'bigeyes' ? 0.6 : 1), eyeR * 1.1, 0.05, sx * 0.21, eyeY, def.extra === 'bigeyes' ? 0.42 : 0.52));
    add(blob(sphere, 0xffffff, 0.025, 0.025, 0.02, sx * 0.21 + 0.025, eyeY + 0.035, def.extra === 'bigeyes' ? 0.46 : 0.565));
    // cheeks
    add(blob(sphere, 0xff8fa3, 0.07, 0.045, 0.03, sx * 0.34, headY - 0.1, 0.44));
  }

  switch (def.snout) {
    case 'small':
      add(blob(sphere, def.belly, 0.13, 0.09, 0.08, 0, headY - 0.1, 0.49));
      add(blob(sphere, 0x332222, 0.04, 0.03, 0.03, 0, headY - 0.06, 0.56));
      break;
    case 'long':
      add(blob(sphere, def.belly, 0.16, 0.12, 0.14, 0, headY - 0.1, 0.5));
      add(blob(sphere, 0x222222, 0.06, 0.045, 0.04, 0, headY - 0.04, 0.63));
      break;
    case 'pig':
      add(blob(cyl, 0xf58aa2, 0.14, 0.08, 0.1, 0, headY - 0.1, 0.52)).rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) add(blob(sphere, 0x9b4a5b, 0.025, 0.035, 0.02, sx * 0.05, headY - 0.1, 0.57));
      break;
    case 'beak':
      add(blob(cone, 0xffa024, 0.09, 0.18, 0.07, 0, headY - 0.08, 0.6)).rotation.x = Math.PI / 2;
      break;
    default:
      // frog smile
      add(blob(sphere, 0x2f6b1f, 0.22, 0.025, 0.03, 0, headY - 0.1, 0.48));
  }
  if (def.extra === 'whiskers') {
    for (const sx of [-1, 1])
      for (const k of [-1, 1]) {
        const w = add(blob(cyl, 0x553322, 0.006, 0.22, 0.006, sx * 0.3, headY - 0.08 + k * 0.03, 0.47));
        w.rotation.z = Math.PI / 2 + k * 0.15 * sx;
      }
  }
  if (def.id === 'penguin') {
    for (const sx of [-1, 1]) add(blob(sphere, def.belly, 0.24, 0.22, 0.1, sx * 0.0, headY - 0.05, 0.36));
  }
  if (def.id === 'fox' || def.id === 'cat' || def.id === 'dog') {
    const tail = add(blob(sphere, def.id === 'fox' ? body : dark, 0.12, 0.12, 0.35, 0, 0.3, -0.45));
    tail.rotation.x = -0.5;
  }

  head.userData.isHead = true;
  g.userData.parts = parts;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}
