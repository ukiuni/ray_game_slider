import * as THREE from 'three';
import { createWorld } from './world.js';
import { buildAnimal } from './animalMesh.js';
import { Effects } from './effects.js';
import { emojiTexture } from './textures.js';
import { animalById } from '../core/animals.js';
import { predictLanding } from '../core/physics.js';
import { createFrame } from '../core/track.js';

const RING_COLORS = [0xffd400, 0x00c2ff, 0xff4fa3, 0x7cdb3a];
const m4 = new THREE.Matrix4();
const qTmp = new THREE.Quaternion();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const camFrame = createFrame();

export class GameView {
  constructor(canvas, sfx) {
    this.world = createWorld(canvas);
    this.sfx = sfx;
    this.effects = new Effects(this.world.scene);
    this.effects.setViewportHeight(window.innerHeight);
    this.racerViews = [];
    this.race = null;
    this.camHeading = new THREE.Vector3(0, 0, 1);
    this.camLook = new THREE.Vector3();
    this.shake = 0;
    this.predictT = 0;
    this.landing = null;
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.3, 32),
      new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }),
    );
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    this.world.scene.add(this.marker);
    this.idleT = 0;
  }

  resize() {
    this.world.resize();
    this.effects.setViewportHeight(window.innerHeight);
  }

  setRace(race) {
    const scene = this.world.scene;
    for (const v of this.racerViews) scene.remove(v.root);
    this.racerViews = [];
    this.effects.clear();
    this.race = race;
    this.landing = null;
    this.world.setTrack(race.track);
    race.racers.forEach((r, i) => {
      const def = animalById(r.animal);
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 10, 20), new THREE.MeshLambertMaterial({ color: RING_COLORS[i % 4] }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.2;
      ring.castShadow = true;
      body.add(ring);
      const animal = buildAnimal(def);
      animal.position.y = 0.15;
      animal.rotation.x = -0.25;
      body.add(animal);
      let label = null;
      if (!r.isPlayer) {
        label = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(def.emoji, '#' + RING_COLORS[i % 4].toString(16).padStart(6, '0')), depthTest: false }));
        label.scale.set(1.1, 1.1, 1);
        label.position.y = 2.4;
        label.renderOrder = 9;
        root.add(label);
      }
      scene.add(root);
      this.racerViews.push({ root, body, animal, ring, label, racer: r, exploded: false, finished: false });
    });
    this.syncRacers(0);
    const p = race.player;
    this.camHeading.set(p.heading.x, 0, p.heading.z).normalize();
    this.placeCamera(1, true);
  }

  syncRacers(dt) {
    for (const v of this.racerViews) {
      const r = v.racer;
      if (r.mode === 'exploded') {
        v.root.visible = false;
        continue;
      }
      v.root.position.copy(r.pos);
      const fwd = vA.copy(r.heading);
      const up = vB.copy(r.normal);
      // orthonormalize
      const right = vC.crossVectors(up, fwd).normalize();
      fwd.crossVectors(right, up).normalize();
      m4.makeBasis(right, up, fwd);
      qTmp.setFromRotationMatrix(m4);
      if (dt === 0) v.root.quaternion.copy(qTmp);
      else v.root.quaternion.slerp(qTmp, 1 - Math.exp(-dt * 12));
      // wobble / spin when airborne
      if (r.mode === 'air') v.body.rotation.y += dt * 2;
      else v.body.rotation.y *= Math.exp(-dt * 6);
      if (r.mode === 'finished') {
        v.root.position.y = 0.35 + Math.sin(performance.now() / 300 + r.id) * 0.1;
        v.root.quaternion.slerp(qTmp.identity(), 1 - Math.exp(-dt * 3));
      }
    }
  }

  handleEvents(events) {
    for (const e of events) {
      const r = e.racer == null ? null : this.race.racers[e.racer];
      const v = r ? this.racerViews[e.racer] : null;
      const near = r ? r.pos.distanceTo(this.world.camera.position) < 60 : false;
      switch (e.type) {
        case 'splash':
          this.effects.splash(r.pos, 1.3);
          if (near || r.isPlayer) this.sfx.splash();
          if (r.isPlayer) this.effects.confetti(r.pos);
          break;
        case 'explode':
          this.effects.explode(r.pos, v.animal);
          v.root.visible = false;
          if (near || r.isPlayer) this.sfx.explode();
          if (r.isPlayer) this.shake = 1.2;
          break;
        case 'land_track':
          this.effects.splash(r.pos, 0.35);
          if (r.isPlayer) this.sfx.smallSplash();
          break;
        case 'jump':
        case 'overflow':
          if (r.isPlayer) this.sfx.jump();
          break;
        default:
          break;
      }
    }
  }

  placeCamera(dt, snap = false) {
    const cam = this.world.camera;
    const p = this.race.player;
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    let dist = 7.5, height = 3.2, ahead = 5;
    if (p.mode === 'air') {
      dist = 9;
      height = 7;
      ahead = 3;
    }
    if (p.mode === 'finished' || p.mode === 'exploded' || this.race.phase === 'done') {
      // orbit around the end point
      this.idleT += dt;
      const target = p.mode === 'exploded' || p.mode === 'finished' ? p.pos : p.pos;
      const a = this.idleT * 0.3;
      vA.set(target.x + Math.cos(a) * 14, Math.max(target.y, 0) + 7, target.z + Math.sin(a) * 14);
      cam.position.lerp(vA, snap ? 1 : 1 - Math.exp(-dt * 2));
      this.camLook.lerp(target, snap ? 1 : 1 - Math.exp(-dt * 3));
      cam.lookAt(this.camLook);
      return;
    }
    this.idleT = 0;
    vA.set(p.heading.x, 0, p.heading.z);
    if (vA.lengthSq() > 0.001) {
      vA.normalize();
      this.camHeading.lerp(vA, snap ? 1 : 1 - Math.exp(-dt * 3)).normalize();
    }
    const h = this.camHeading;
    if (p.mode === 'track') {
      // follow the slider centre line so the camera never ends up outside the tube or inside the tower
      const f = this.race.track.frameAt(Math.max(0, p.s - dist), camFrame);
      vB.copy(f.pos).addScaledVector(f.U, 2.6);
      vB.y += 1.2;
      cam.position.lerp(vB, k);
      const f2 = this.race.track.frameAt(Math.min(this.race.track.length, p.s + ahead), camFrame);
      vC.copy(f2.pos).addScaledVector(f2.U, 0.4);
      vC.lerp(p.pos, 0.4);
      if (snap) this.camLook.copy(vC);
      else this.camLook.lerp(vC, 1 - Math.exp(-dt * 6));
      cam.lookAt(this.camLook);
      return;
    }
    vB.set(p.pos.x - h.x * dist, p.pos.y + height, p.pos.z - h.z * dist);
    if (vB.y < 1) vB.y = 1;
    cam.position.lerp(vB, k);
    vC.set(p.pos.x + h.x * ahead, p.pos.y + (p.mode === 'air' ? -2 : 0.8), p.pos.z + h.z * ahead);
    if (snap) this.camLook.copy(vC);
    else this.camLook.lerp(vC, 1 - Math.exp(-dt * 6));
    cam.lookAt(this.camLook);
  }

  updateLandingMarker(dt, steer) {
    const p = this.race.player;
    if (p.mode !== 'air') {
      this.marker.visible = false;
      this.landing = null;
      return;
    }
    this.predictT -= dt;
    if (this.predictT <= 0) {
      this.predictT = 0.08;
      this.landing = predictLanding(p, this.race.track, steer, { maxT: 6, dt: 1 / 60 });
    }
    const L = this.landing;
    if (!L || L.type === 'none') {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.copy(L.pos);
    this.marker.position.y += 0.15;
    this.marker.lookAt(L.pos.x, L.pos.y + 10, L.pos.z);
    const col = L.type === 'ground' ? 0xff3333 : L.type === 'pool' ? 0x33ddff : 0x33ff66;
    this.marker.material.color.setHex(col);
    const s = 1 + Math.sin(performance.now() / 120) * 0.15;
    this.marker.scale.set(s, s, s);
  }

  update(dt, steer = 0) {
    if (!this.race) return;
    this.syncRacers(dt);
    // water spray trails
    for (const r of this.race.racers) {
      if (r.mode === 'track' && r.v > 4 && Math.random() < 0.6) this.effects.spray(r.pos, r.vel, 1);
    }
    this.updateLandingMarker(dt, steer);
    this.effects.update(dt);
    this.placeCamera(dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.6;
      this.world.camera.position.x += (Math.random() - 0.5) * s;
      this.world.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.world.update(dt, this.race.player.pos);
  }

  /** Title-screen fly-around */
  updateIdle(dt) {
    if (!this.race) return;
    this.idleT += dt;
    const t = this.race.track;
    const cam = this.world.camera;
    const a = this.idleT * 0.12;
    const R = 55;
    cam.position.set(Math.cos(a) * R, t.startHeight * 0.6 + 10, Math.sin(a) * R);
    vA.set(0, t.startHeight * 0.45, 0);
    cam.lookAt(vA);
    this.syncRacers(dt);
    this.effects.update(dt);
    this.world.update(dt, vA);
  }

  render() {
    this.world.renderer.render(this.world.scene, this.world.camera);
  }
}
