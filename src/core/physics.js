import { Vector3 } from 'three';
import { TUBE_R, RIM, WATER_Y, GROUND_Y, createFrame } from './track.js';

export const G = 9.8;
export const MU = 0.025; // water slide friction
export const DRAG = 0.004; // air/water drag
export const STEER_ACC = 5.5; // lateral angular acceleration from steering (rad/s^2)
export const TH_DAMP = 1.6;
export const JUMP_V = 6.5;
export const JUMP_SIDE = 5.0;
export const AIR_ACC = 7.0;
export const MIN_V = 2.0;
export const JUMP_COOLDOWN = 0.6;
export const FIXED_DT = 1 / 120;

const UP = new Vector3(0, 1, 0);
const tmpF = createFrame();
const tmpF2 = createFrame();
const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

export function createRacer({ id, animal, isPlayer = false, dragMul = 1, name = '' }) {
  return {
    id,
    animal,
    name,
    isPlayer,
    dragMul,
    mode: 'track', // 'track' | 'air' | 'finished' | 'exploded'
    s: 0,
    v: 0,
    th: 0,
    thv: 0,
    pos: new Vector3(),
    vel: new Vector3(),
    heading: new Vector3(0, 0, 1),
    normal: new Vector3(0, 1, 0),
    cooldown: 0,
    jumpCd: 0,
    airTime: 0,
    prevInside: false,
    progress: 0,
    finishTime: null,
    failReason: null,
    events: [],
  };
}

/** Place a racer on the track at arc length s with lateral angle th */
export function placeOnTrack(r, track, s, th = 0, v = 0) {
  r.mode = 'track';
  r.s = s;
  r.th = th;
  r.thv = 0;
  r.v = v;
  r.progress = s;
  updateTrackPose(r, track);
}

function updateTrackPose(r, track) {
  const f = track.frameAt(r.s, tmpF);
  const sn = Math.sin(r.th), cs = Math.cos(r.th);
  r.pos.copy(f.pos).addScaledVector(f.S, TUBE_R * sn).addScaledVector(f.U, -TUBE_R * cs);
  // inward surface normal
  r.normal.copy(f.U).multiplyScalar(cs).addScaledVector(f.S, -sn);
  r.heading.copy(f.T);
  // world velocity
  v1.copy(f.S).multiplyScalar(cs).addScaledVector(f.U, sn); // d(pos)/d(th) direction
  r.vel.copy(f.T).multiplyScalar(r.v).addScaledVector(v1, TUBE_R * r.thv);
  return f;
}

function launch(r, cooldown) {
  r.mode = 'air';
  r.cooldown = cooldown;
  r.airTime = 0;
  r.prevInside = true;
}

/**
 * Advance one racer by dt.
 * input: { steer: -1..1 (right positive), jump: boolean (pressed this step) }
 */
export function stepRacer(r, track, input, dt, time = 0) {
  if (r.mode === 'finished' || r.mode === 'exploded') return;
  const steer = Math.max(-1, Math.min(1, input?.steer || 0));
  if (r.jumpCd > 0) r.jumpCd -= dt;

  if (r.mode === 'track') {
    const f = track.frameAt(r.s, tmpF);
    const slopeAcc = -G * f.T.y;
    r.v += (slopeAcc - MU * G - DRAG * r.dragMul * r.v * r.v) * dt;
    if (r.v < MIN_V) r.v = MIN_V;
    const sn = Math.sin(r.th), cs = Math.cos(r.th);
    // effective acceleration in the moving frame: gravity + centrifugal pseudo force
    v2.set(0, -G, 0).addScaledVector(f.K, -r.v * r.v);
    v1.copy(f.S).multiplyScalar(cs).addScaledVector(f.U, sn); // tangent of the cross-section circle
    const thAcc = v2.dot(v1) / TUBE_R + steer * STEER_ACC - TH_DAMP * r.thv;
    r.thv += thAcc * dt;
    r.th += r.thv * dt;
    r.s += r.v * dt;
    r.progress = r.s;
    updateTrackPose(r, track);

    if (r.s >= track.length) {
      r.s = track.length;
      launch(r, 10);
      r.events.push({ type: 'launch_end', time });
      return;
    }
    if (Math.abs(r.th) > RIM) {
      launch(r, 0.25);
      r.events.push({ type: 'overflow', time });
      return;
    }
    if (input?.jump && r.jumpCd <= 0) {
      const ff = track.frameAt(r.s, tmpF);
      r.vel.addScaledVector(UP, JUMP_V).addScaledVector(ff.S, steer * JUMP_SIDE);
      r.jumpCd = JUMP_COOLDOWN;
      launch(r, 0.15);
      r.events.push({ type: 'jump', time });
    }
    return;
  }

  // ---- airborne ----
  stepAir(r, track, steer, dt, time);
}

function stepAir(r, track, steer, dt, time) {
  r.airTime += dt;
  r.cooldown -= dt;
  r.vel.y -= G * dt;
  v1.set(r.vel.x, 0, r.vel.z);
  if (v1.lengthSq() > 0.01) v1.normalize();
  else v1.set(r.heading.x, 0, r.heading.z).normalize();
  v2.crossVectors(v1, UP); // right
  r.vel.addScaledVector(v2, steer * AIR_ACC * dt);
  r.vel.multiplyScalar(1 - 0.05 * dt);
  r.pos.addScaledVector(r.vel, dt);
  if (r.vel.lengthSq() > 0.01) r.heading.copy(r.vel).normalize();
  r.normal.lerp(UP, Math.min(1, dt * 3)).normalize();

  // pool / ground
  if (r.pos.y <= WATER_Y && track.isInPool(r.pos.x, r.pos.z, 0.4)) {
    r.mode = 'finished';
    r.finishTime = time;
    r.progress = track.length + 100;
    r.events.push({ type: 'splash', time });
    return;
  }
  if (r.pos.y <= GROUND_Y) {
    r.pos.y = GROUND_Y;
    r.mode = 'exploded';
    r.failReason = 'ground';
    r.events.push({ type: 'explode', time });
    return;
  }

  // re-attach to the slider
  const i = track.nearest(r.pos, TUBE_R + 2);
  if (i < 0) {
    r.prevInside = false;
    return;
  }
  const s0 = i * track.ds;
  let f = track.frameAt(s0, tmpF2);
  v3.copy(r.pos).sub(f.pos);
  const along = v3.dot(f.T);
  const sl = Math.min(track.length, Math.max(0, s0 + along));
  f = track.frameAt(sl, tmpF2);
  v3.copy(r.pos).sub(f.pos);
  const x = v3.dot(f.S);
  const y = v3.dot(f.U);
  const rr = Math.hypot(x, y);
  const inside = rr < TUBE_R;
  const ang = Math.atan2(x, -y);
  if (r.cooldown <= 0 && r.prevInside && rr >= TUBE_R * 0.97 && rr < TUBE_R + 0.6 && Math.abs(ang) < RIM && sl < track.length - 0.5) {
    const radial = (x * v3.copy(f.S).dot(r.vel) + y * f.U.dot(r.vel)) / rr;
    if (radial > 0) {
      const impact = radial;
      r.mode = 'track';
      r.s = sl;
      r.th = ang;
      const sn = Math.sin(ang), cs = Math.cos(ang);
      v1.copy(f.S).multiplyScalar(cs).addScaledVector(f.U, sn);
      r.v = Math.max(MIN_V, r.vel.dot(f.T));
      r.thv = Math.max(-3, Math.min(3, r.vel.dot(v1) / TUBE_R));
      r.progress = r.s;
      updateTrackPose(r, track);
      r.events.push({ type: 'land_track', time, impact });
      return;
    }
  }
  r.prevInside = inside;
}

export function cloneRacer(r) {
  const c = { ...r };
  c.pos = r.pos.clone();
  c.vel = r.vel.clone();
  c.heading = r.heading.clone();
  c.normal = r.normal.clone();
  c.events = [];
  return c;
}

/**
 * Predict where an airborne (or about-to-jump) racer will land.
 * Returns { type: 'track'|'pool'|'ground'|'none', pos, s, t }
 */
export function predictLanding(r, track, steer = 0, { jump = false, maxT = 6, dt = 1 / 60 } = {}) {
  const c = cloneRacer(r);
  let t = 0;
  let first = true;
  while (t < maxT) {
    stepRacer(c, track, { steer, jump: first && jump }, dt, t);
    first = false;
    t += dt;
    if (c.mode === 'track') {
      const last = c.events[c.events.length - 1];
      if (last && last.type === 'land_track') return { type: 'track', pos: c.pos.clone(), s: c.s, t };
      return { type: r.mode === 'track' ? 'none' : 'track', pos: c.pos.clone(), s: c.s, t };
    }
    if (c.mode === 'finished') return { type: 'pool', pos: c.pos.clone(), s: track.length, t };
    if (c.mode === 'exploded') return { type: 'ground', pos: c.pos.clone(), s: -1, t };
  }
  return { type: 'none', pos: c.pos.clone(), s: -1, t };
}
