import * as THREE from 'three';
import { dotTexture } from './textures.js';

const MAX = 1500;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTexture() }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;
        void main(){ vC=color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); if(t.a<0.05) discard; gl_FragColor = vec4(vC, t.a); }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.cursor = 0;
    this.rings = [];
    this.debris = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1.0, 40);
  }

  setViewportHeight(h) {
    this.points.material.uniforms.scale.value = h * 0.9;
  }

  spawn(x, y, z, vx, vy, vz, color, life, size, grav = 9.8) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = color;
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.grav[i] = grav;
  }

  splash(p, strength = 1, color = new THREE.Color(0xdff6ff)) {
    const n = Math.floor(60 * strength);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 5) * strength;
      this.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * sp, 4 + Math.random() * 8 * strength, Math.sin(a) * sp, color, 0.8 + Math.random() * 0.8, 0.25 + Math.random() * 0.35);
    }
    this.ring(p, strength);
  }

  ring(p, strength = 1) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, p.y + 0.05, p.z);
    m.userData = { t: 0, strength };
    this.scene.add(m);
    this.rings.push(m);
  }

  spray(p, vel, amount) {
    const c = new THREE.Color(0xe8f8ff);
    for (let k = 0; k < amount; k++) {
      this.spawn(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.6, -vel.x * 0.1 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, -vel.z * 0.1 + (Math.random() - 0.5) * 2, c, 0.4, 0.15 + Math.random() * 0.1);
    }
  }

  explode(p, animalGroup) {
    const fire = [new THREE.Color(0xffdd33), new THREE.Color(0xff7a1a), new THREE.Color(0xff3300), new THREE.Color(0x555555)];
    for (let k = 0; k < 220; k++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.5;
      const sp = 3 + Math.random() * 14;
      const c = fire[Math.floor(Math.random() * fire.length)];
      this.spawn(p.x, p.y + 0.5, p.z, Math.cos(th) * Math.cos(ph) * sp, Math.sin(ph) * sp + 3, Math.sin(th) * Math.cos(ph) * sp, c, 0.6 + Math.random() * 1.2, 0.5 + Math.random() * 1.0, c.r < 0.5 ? -1 : 4);
    }
    if (animalGroup) {
      animalGroup.updateMatrixWorld(true);
      const parts = [...(animalGroup.userData.parts || [])];
      for (const part of parts) {
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        const ws = new THREE.Vector3();
        part.matrixWorld.decompose(wp, wq, ws);
        part.removeFromParent();
        part.position.copy(wp);
        part.quaternion.copy(wq);
        part.scale.copy(ws);
        this.scene.add(part);
        const dir = wp.clone().sub(p).normalize();
        this.debris.push({
          mesh: part,
          vel: dir.multiplyScalar(6 + Math.random() * 8).add(new THREE.Vector3(0, 6 + Math.random() * 6, 0)),
          spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
          t: 0,
        });
      }
    }
  }

  confetti(p) {
    for (let k = 0; k < 150; k++) {
      const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
      this.spawn(p.x, p.y + 2, p.z, (Math.random() - 0.5) * 10, 6 + Math.random() * 10, (Math.random() - 0.5) * 10, c, 2 + Math.random(), 0.3, 4);
    }
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
    for (const r of this.rings) this.scene.remove(r);
    this.rings = [];
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.debris = [];
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0) this.pos[i * 3 + 1] = 0;
      this.size[i] = this.baseSize[i] * Math.min(1, (this.life[i] / this.maxLife[i]) * 2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;

    this.rings = this.rings.filter((r) => {
      r.userData.t += dt;
      const s = 1 + r.userData.t * 8 * r.userData.strength;
      r.scale.set(s, s, s);
      r.material.opacity = Math.max(0, 0.8 - r.userData.t * 0.6);
      if (r.material.opacity <= 0) {
        this.scene.remove(r);
        r.material.dispose();
        return false;
      }
      return true;
    });
    for (const d of this.debris) {
      d.t += dt;
      if (d.mesh.position.y > 0.1) {
        d.vel.y -= 9.8 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += d.spin.x * dt;
        d.mesh.rotation.y += d.spin.y * dt;
        d.mesh.rotation.z += d.spin.z * dt;
      } else {
        d.mesh.position.y = 0.1;
      }
    }
  }
}
