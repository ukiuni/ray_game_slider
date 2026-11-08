import { Vector3, CatmullRomCurve3 } from 'three';
import { createRng } from './rng.js';

export const TUBE_R = 2.2; // half-pipe radius (m)
export const RIM = 1.75; // half-pipe edge angle from the bottom (rad, ~100deg)
export const WATER_Y = 0.35; // pool water surface height
export const GROUND_Y = 0;
const SAMPLE_DS = 0.5;
const CELL = 3;

export function stageSeed(stage) {
  return (stage * 7919 + 1234567) >>> 0;
}

/**
 * Builds the control points of a spiral water slider for a stage.
 * The slider spirals around a central tower and finally runs out into a pool on the ground.
 */
export function buildControlPoints(stage, seed = stageSeed(stage)) {
  const rng = createRng(seed);
  const lv = Math.min(stage - 1, 12);
  const H = 48 + lv * 6 + rng.range(0, 4);
  const bottomY = 7.5;
  const dropPerTurn = rng.range(13, 15.5);
  const turns = (H - bottomY) / dropPerTurn;
  const baseR = rng.range(13, 16);
  const amp = Math.min(4.5, 1.5 + stage * 0.3);
  const freq = rng.range(0.45, 0.8); // radius waves per turn (non integer => loops do not stack exactly)
  const phase = rng.range(0, Math.PI * 2);
  const dir = rng() < 0.5 ? 1 : -1;
  const m = rng.int(2, 4);
  const slopeWobble = 0.3;
  const startAngle = rng.range(0, Math.PI * 2);

  const pts = [];
  const steps = Math.ceil(turns * 14);
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    const phi = startAngle + dir * u * turns * Math.PI * 2;
    const r = baseR + amp * Math.sin(u * turns * freq * Math.PI * 2 + phase);
    const g = 1 - u + (slopeWobble / (2 * Math.PI * m)) * Math.sin(2 * Math.PI * m * u);
    const y = bottomY + (H - bottomY) * g;
    pts.push(new Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
  }
  // Start ramp: a flat platform on top of the tower followed by a steep drop into the spiral.
  const p0 = pts[0], p1 = pts[1];
  const ts = new Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();
  pts.unshift(new Vector3(p0.x - ts.x * 12, H + 8.5, p0.z - ts.z * 12));
  pts.unshift(new Vector3(p0.x - ts.x * 20, H + 9, p0.z - ts.z * 20));
  // Run-out: leave the spiral tangentially and descend towards the pool.
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const th = new Vector3(last.x - prev.x, 0, last.z - prev.z).normalize();
  const endY = 2.4;
  pts.push(new Vector3(last.x + th.x * 7, bottomY - 2.2, last.z + th.z * 7));
  pts.push(new Vector3(last.x + th.x * 15, endY + 1.0, last.z + th.z * 15));
  pts.push(new Vector3(last.x + th.x * 22, endY, last.z + th.z * 22));
  return { pts, H, baseR, amp, turns, endDir: th, startIndex: 2 };
}

export function generateTrack(stage, seed = stageSeed(stage)) {
  const cp = buildControlPoints(stage, seed);
  const curve = new CatmullRomCurve3(cp.pts, false, 'centripetal');
  const approxLen = curve.getLength();
  const n = Math.max(2, Math.round(approxLen / SAMPLE_DS) + 1);
  const spaced = curve.getSpacedPoints(n - 1);
  const length = (n - 1) * SAMPLE_DS; // treat spacing as exact

  const P = new Float32Array(n * 3);
  const T = new Float32Array(n * 3);
  const S = new Float32Array(n * 3);
  const U = new Float32Array(n * 3);
  const K = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    P[i * 3] = spaced[i].x;
    P[i * 3 + 1] = spaced[i].y;
    P[i * 3 + 2] = spaced[i].z;
  }
  const t = new Vector3();
  const s = new Vector3();
  const u = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    t.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]).normalize();
    s.crossVectors(t, up).normalize();
    u.crossVectors(s, t).normalize();
    T.set([t.x, t.y, t.z], i * 3);
    S.set([s.x, s.y, s.z], i * 3);
    U.set([u.x, u.y, u.z], i * 3);
  }
  // curvature vector dT/ds, smoothed
  const raw = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(n - 1, i + 2);
    const d = (b - a) * SAMPLE_DS;
    for (let c = 0; c < 3; c++) raw[i * 3 + c] = (T[b * 3 + c] - T[a * 3 + c]) / d;
  }
  const W = 4;
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, z = 0, cnt = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) {
      x += raw[j * 3]; y += raw[j * 3 + 1]; z += raw[j * 3 + 2]; cnt++;
    }
    K[i * 3] = x / cnt; K[i * 3 + 1] = y / cnt; K[i * 3 + 2] = z / cnt;
  }

  // spatial hash for nearest-sample queries
  const grid = new Map();
  const key = (ix, iy, iz) => `${ix},${iy},${iz}`;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(P[i * 3] / CELL), Math.floor(P[i * 3 + 1] / CELL), Math.floor(P[i * 3 + 2] / CELL));
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(i);
  }

  const endI = n - 1;
  const endPos = new Vector3(P[endI * 3], P[endI * 3 + 1], P[endI * 3 + 2]);
  const endDir = new Vector3(T[endI * 3], 0, T[endI * 3 + 2]).normalize();
  const pool = {
    x: endPos.x + endDir.x * 9,
    z: endPos.z + endDir.z * 9,
    r: 13,
    y: WATER_Y,
  };

  const track = {
    stage,
    seed,
    n,
    ds: SAMPLE_DS,
    length,
    P, T, S, U, K,
    pool,
    startHeight: P[1],
    towerRadius: Math.max(2.5, cp.baseR - cp.amp - TUBE_R - 4),
    controlPoints: cp.pts,
    frameAt(sv, out = createFrame()) {
      const x = Math.min(Math.max(sv / SAMPLE_DS, 0), n - 1.0001);
      const i = Math.floor(x);
      const f = x - i;
      lerp3(P, i, f, out.pos);
      lerp3(T, i, f, out.T).normalize();
      lerp3(S, i, f, out.S).normalize();
      lerp3(U, i, f, out.U).normalize();
      lerp3(K, i, f, out.K);
      return out;
    },
    sampleIndexAt(sv) {
      return Math.min(n - 1, Math.max(0, Math.round(sv / SAMPLE_DS)));
    },
    /** nearest sample to a world position (within ~CELL*1.5), or -1 */
    nearest(pos, maxDist = CELL * 1.5) {
      const cx = Math.floor(pos.x / CELL), cy = Math.floor(pos.y / CELL), cz = Math.floor(pos.z / CELL);
      let best = -1;
      let bestD = maxDist * maxDist;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const arr = grid.get(key(cx + dx, cy + dy, cz + dz));
            if (!arr) continue;
            for (const i of arr) {
              const ex = P[i * 3] - pos.x, ey = P[i * 3 + 1] - pos.y, ez = P[i * 3 + 2] - pos.z;
              const d = ex * ex + ey * ey + ez * ez;
              if (d < bestD) { bestD = d; best = i; }
            }
          }
      return best;
    },
    isInPool(x, z, margin = 0) {
      const dx = x - pool.x, dz = z - pool.z;
      return dx * dx + dz * dz < (pool.r - margin) * (pool.r - margin);
    },
  };
  return track;
}

export function createFrame() {
  return { pos: new Vector3(), T: new Vector3(), S: new Vector3(), U: new Vector3(), K: new Vector3() };
}

function lerp3(arr, i, f, out) {
  const a = i * 3, b = (i + 1) * 3;
  out.set(
    arr[a] + (arr[b] - arr[a]) * f,
    arr[a + 1] + (arr[b + 1] - arr[a + 1]) * f,
    arr[a + 2] + (arr[b + 2] - arr[a + 2]) * f,
  );
  return out;
}
