import { Vector3 } from 'three';
import { G, predictLanding } from './physics.js';
import { createFrame } from './track.js';

const f = createFrame();
const a = new Vector3();

export function cpuParams(stage) {
  return {
    skill: Math.min(0.95, 0.45 + stage * 0.06),
    dragMul: Math.max(0.95, 1.35 - stage * 0.04),
    shortcutRate: stage >= 3 ? Math.min(0.6, (stage - 2) * 0.07) : 0,
  };
}

export function createAI({ skill = 0.7, shortcutRate = 0, rng = Math.random, safety = 0.4 } = {}) {
  return {
    skill,
    shortcutRate,
    rng,
    safety,
    steer: 0,
    nextReact: 0,
    nextDecide: 1.5 + rng() * 2,
    plan: null,
    wobblePhase: rng() * 10,
  };
}

/** Equilibrium angle of the racer in the half-pipe at arc length s for speed v */
export function equilibriumAngle(track, s, v) {
  track.frameAt(s, f);
  a.set(0, -G, 0).addScaledVector(f.K, -v * v);
  const As = a.dot(f.S);
  const Au = a.dot(f.U);
  return Math.atan2(As, -Au);
}

/** Returns {steer, jump} for a CPU (or autopilot) racer */
export function aiInput(ai, r, track, time) {
  const out = { steer: 0, jump: false };
  if (r.mode === 'track') {
    ai.plan = null;
    if (time >= ai.nextReact) {
      ai.nextReact = time + 0.04 + (1 - ai.skill) * 0.25;
      const look = r.s + r.v * 0.35;
      const eq = equilibriumAngle(track, Math.min(look, track.length), r.v);
      const target = Math.max(-1.0, Math.min(1.0, eq * ai.safety));
      let st = 2.4 * (target - r.th) - 0.9 * r.thv;
      st += Math.sin(time * 1.7 + ai.wobblePhase) * (1 - ai.skill) * 0.9;
      if (Math.abs(r.th) > 1.25 && Math.sign(r.thv) === Math.sign(r.th)) st = -Math.sign(r.th);
      ai.steer = Math.max(-1, Math.min(1, st));
    }
    out.steer = ai.steer;

    if (ai.shortcutRate > 0 && time >= ai.nextDecide && r.jumpCd <= 0) {
      ai.nextDecide = time + 0.8;
      if (ai.rng() < ai.shortcutRate) {
        let best = null;
        for (const st of [-1, 0, 1]) {
          const p = predictLanding(r, track, st, { jump: true, maxT: 5 });
          const gain = p.type === 'pool' ? 1e6 : p.type === 'track' ? p.s - r.s : -1;
          if (gain > 25 && (!best || gain > best.gain)) best = { st, gain };
        }
        if (best) {
          ai.plan = { steer: best.st };
          out.steer = best.st;
          out.jump = true;
        }
      }
    }
    return out;
  }
  if (r.mode === 'air') {
    if (ai.plan) {
      out.steer = ai.plan.steer;
      return out;
    }
    // accidental fall: try to find something safe
    if (time >= ai.nextReact) {
      ai.nextReact = time + 0.2;
      let best = null;
      for (const st of [-1, 0, 1]) {
        const p = predictLanding(r, track, st, { maxT: 5 });
        const score = p.type === 'pool' ? 1e6 : p.type === 'track' ? p.s : -1e6;
        if (!best || score > best.score) best = { st, score };
      }
      ai.steer = best.st;
    }
    out.steer = ai.steer;
  }
  return out;
}
