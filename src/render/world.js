import * as THREE from 'three';
import { TUBE_R, RIM, WATER_Y } from '../core/track.js';
import { grassTexture, waterStreakTexture, poolTexture } from './textures.js';
import { createRng } from '../core/rng.js';

const THEMES = [
  { inner: [0xffffff, 0xffe066], outer: 0xff7a1a, support: 0xe8e8e8 },
  { inner: [0xffffff, 0x9ae6ff], outer: 0x2f80ed, support: 0xdedede },
  { inner: [0xffffff, 0xffb3d1], outer: 0xe8457c, support: 0xeeeeee },
  { inner: [0xffffff, 0xb6f09c], outer: 0x2fae5b, support: 0xe0e0e0 },
  { inner: [0xffffff, 0xd9b3ff], outer: 0x8e44ec, support: 0xe6e6e6 },
];

export function createWorld(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const skyTop = new THREE.Color(0x3d9cff);
  const skyBottom = new THREE.Color(0xcfeeff);
  scene.fog = new THREE.Fog(skyBottom, 120, 420);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: skyTop }, bottom: { value: skyBottom } },
      vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vP,1.0);}',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP - cameraPosition).y*1.6+0.1,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0);}',
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x5a8f3a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -25;
  sc.right = sc.top = 25;
  sc.near = 1;
  sc.far = 200;
  scene.add(sun);
  scene.add(sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ map: grassTexture() }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const clouds = makeClouds();
  scene.add(clouds);

  const streakTex = waterStreakTexture();
  const poolTex = poolTexture();
  let stageGroup = null;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 75 : 62;
    camera.updateProjectionMatrix();
  }
  resize();

  function setTrack(track) {
    if (stageGroup) {
      scene.remove(stageGroup);
      stageGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    stageGroup = buildStage(track, streakTex, poolTex);
    scene.add(stageGroup);
  }

  function update(dt, focus) {
    streakTex.offset.y -= dt * 1.6;
    poolTex.offset.x += dt * 0.02;
    poolTex.offset.y += dt * 0.013;
    clouds.children.forEach((c) => {
      c.position.x += dt * c.userData.speed;
      if (c.position.x > 400) c.position.x = -400;
    });
    if (focus) {
      sun.position.set(focus.x + 40, focus.y + 80, focus.z + 30);
      sun.target.position.copy(focus);
    }
    sky.position.copy(camera.position);
  }

  return { renderer, scene, camera, resize, setTrack, update };
}

function makeClouds() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const rng = createRng(42);
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, mat);
      const s = 6 + rng() * 6;
      m.scale.set(s * 1.4, s * 0.8, s);
      m.position.set(k * 7 - n * 3.5, rng() * 3, rng() * 6);
      c.add(m);
    }
    c.position.set(rng() * 800 - 400, 90 + rng() * 60, rng() * 800 - 400);
    c.userData.speed = 1 + rng() * 2;
    g.add(c);
  }
  return g;
}

function buildStage(track, streakTex, poolTex) {
  const group = new THREE.Group();
  const theme = THEMES[(track.stage - 1) % THEMES.length];
  group.add(buildSlideMesh(track, theme));
  group.add(buildWater(track, streakTex));
  group.add(buildSupports(track, theme));
  group.add(buildPool(track, poolTex));
  group.add(buildTrees(track));
  return group;
}

function frameArrays(track, i) {
  const P = track.P, S = track.S, U = track.U;
  return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], S[i * 3], S[i * 3 + 1], S[i * 3 + 2], U[i * 3], U[i * 3 + 1], U[i * 3 + 2]];
}

function buildSlideMesh(track, theme) {
  const step = 2; // every 1m
  const rows = [];
  for (let i = 0; i < track.n; i += step) rows.push(i);
  if (rows[rows.length - 1] !== track.n - 1) rows.push(track.n - 1);
  const M = 18;
  const radii = [TUBE_R, TUBE_R + 0.2];
  const pos = [];
  const col = [];
  const idx = [];
  const cA = new THREE.Color(theme.inner[0]);
  const cB = new THREE.Color(theme.inner[1]);
  const cO = new THREE.Color(theme.outer);
  const vertsPerRow = (M + 1) * 2;
  rows.forEach((i, rIdx) => {
    const [px, py, pz, sx, sy, sz, ux, uy, uz] = frameArrays(track, i);
    for (let layer = 0; layer < 2; layer++) {
      const R = radii[layer];
      for (let j = 0; j <= M; j++) {
        const a = -RIM + (2 * RIM * j) / M;
        const sn = Math.sin(a), cs = Math.cos(a);
        pos.push(px + R * (sn * sx - cs * ux), py + R * (sn * sy - cs * uy), pz + R * (sn * sz - cs * uz));
        let c = layer === 1 ? cO : Math.floor(j / 3) % 2 === 0 ? cA : cB;
        if (layer === 0 && (j === 0 || j === M)) c = cO;
        col.push(c.r, c.g, c.b);
      }
    }
    if (rIdx > 0) {
      const b0 = (rIdx - 1) * vertsPerRow, b1 = rIdx * vertsPerRow;
      for (let layer = 0; layer < 2; layer++) {
        const o = layer * (M + 1);
        for (let j = 0; j < M; j++) {
          const a = b0 + o + j, b = b0 + o + j + 1, c = b1 + o + j, d = b1 + o + j + 1;
          if (layer === 0) idx.push(a, c, b, b, c, d);
          else idx.push(a, b, c, b, d, c);
        }
      }
      // rim lips
      for (const j of [0, M]) {
        const a = b0 + j, b = b0 + M + 1 + j, c = b1 + j, d = b1 + M + 1 + j;
        if (j === 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWater(track, tex) {
  const step = 2;
  const M = 6;
  const W = 0.75;
  const R = TUBE_R - 0.03;
  const pos = [];
  const uv = [];
  const idx = [];
  let row = 0;
  for (let i = 0; i < track.n; i += step, row++) {
    const [px, py, pz, sx, sy, sz, ux, uy, uz] = frameArrays(track, i);
    for (let j = 0; j <= M; j++) {
      const a = -W + (2 * W * j) / M;
      const sn = Math.sin(a), cs = Math.cos(a);
      pos.push(px + R * (sn * sx - cs * ux), py + R * (sn * sy - cs * uy), pz + R * (sn * sz - cs * uz));
      uv.push(j / M, (i * track.ds) / 6);
    }
    if (row > 0) {
      const b0 = (row - 1) * (M + 1), b1 = row * (M + 1);
      for (let j = 0; j < M; j++) idx.push(b0 + j, b1 + j, b0 + j + 1, b0 + j + 1, b1 + j, b1 + j + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

function buildSupports(track, theme) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: theme.support });
  const every = Math.round(14 / track.ds);
  const list = [];
  for (let i = every; i < track.n - 4; i += every) {
    const [px, py, pz, , , , ux, uy, uz] = frameArrays(track, i);
    const bx = px - ux * (TUBE_R + 0.2), by = py - uy * (TUBE_R + 0.2), bz = pz - uz * (TUBE_R + 0.2);
    if (track.isInPool(bx, bz, -1)) continue;
    list.push([bx, by, bz]);
  }
  const geo = new THREE.CylinderGeometry(0.25, 0.35, 1, 8);
  geo.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4();
  list.forEach(([x, y, z], k) => {
    m4.makeScale(1, Math.max(0.1, y), 1);
    m4.setPosition(x, 0, z);
    inst.setMatrixAt(k, m4);
  });
  inst.castShadow = true;
  g.add(inst);

  // central tower + start deck
  const towerH = track.startHeight + 1;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(track.towerRadius, track.towerRadius + 0.6, towerH, 16), new THREE.MeshLambertMaterial({ color: 0xf2e6d0 }));
  tower.position.y = towerH / 2;
  tower.castShadow = true;
  g.add(tower);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(track.towerRadius + 1.2, 4, 16), new THREE.MeshLambertMaterial({ color: theme.outer }));
  roof.position.y = towerH + 2;
  g.add(roof);
  const [sx, sy, sz] = frameArrays(track, 0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 7), new THREE.MeshLambertMaterial({ color: 0xc9a46b }));
  deck.position.set(sx, sy - TUBE_R - 0.3, sz);
  deck.castShadow = true;
  g.add(deck);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 8), mat);
  pole.scale.y = sy - TUBE_R - 0.5;
  pole.position.set(sx, pole.scale.y / 2, sz);
  g.add(pole);
  // flag
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
  flagPole.position.set(sx + 3, sy - TUBE_R + 2, sz + 3);
  g.add(flagPole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: 0xff3355, side: THREE.DoubleSide }));
  flag.position.set(sx + 3.8, sy - TUBE_R + 3.5, sz + 3);
  g.add(flag);
  return g;
}

function buildPool(track, tex) {
  const g = new THREE.Group();
  const p = track.pool;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 0.8, p.r + 1.0, WATER_Y + 0.35, 48, 1, true), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  rim.position.set(p.x, (WATER_Y + 0.35) / 2, p.z);
  g.add(rim);
  const edge = new THREE.Mesh(new THREE.RingGeometry(p.r, p.r + 1.0, 48), new THREE.MeshLambertMaterial({ color: 0xf6f0e0 }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.set(p.x, WATER_Y + 0.35, p.z);
  g.add(edge);
  const water = new THREE.Mesh(new THREE.CircleGeometry(p.r, 48), new THREE.MeshPhongMaterial({ map: tex, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.95 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(p.x, WATER_Y, p.z);
  water.receiveShadow = true;
  g.add(water);
  // goal buoys
  const buoyGeo = new THREE.SphereGeometry(0.5, 12, 8);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const b = new THREE.Mesh(buoyGeo, new THREE.MeshLambertMaterial({ color: k % 2 ? 0xff4444 : 0xffffff }));
    b.position.set(p.x + Math.cos(a) * (p.r - 0.6), WATER_Y + 0.1, p.z + Math.sin(a) * (p.r - 0.6));
    g.add(b);
  }
  return g;
}

function buildTrees(track) {
  const rng = createRng(track.seed ^ 0x55);
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 6);
  trunkGeo.translate(0, 1, 0);
  const leafGeo = new THREE.ConeGeometry(2.2, 5, 8);
  leafGeo.translate(0, 4.2, 0);
  const N = 140;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), N);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x2e8b3d }), N);
  const m4 = new THREE.Matrix4();
  let k = 0;
  let guard = 0;
  while (k < N && guard++ < 2000) {
    const a = rng() * Math.PI * 2;
    const d = 40 + rng() * 220;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (track.isInPool(x, z, -6)) continue;
    const s = 0.7 + rng() * 0.9;
    m4.makeScale(s, s, s);
    m4.setPosition(x, 0, z);
    trunks.setMatrixAt(k, m4);
    leaves.setMatrixAt(k, m4);
    k++;
  }
  trunks.count = leaves.count = k;
  const g = new THREE.Group();
  g.add(trunks, leaves);
  return g;
}
