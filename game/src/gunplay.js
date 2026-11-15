// gunplay.js — shooting, recoil, tracers, muzzle flash + smoke, shell casings,
// impact and blood particles, grenades. No per-frame allocations in hot loops:
// tracers, casings and particles live in fixed pools.
import * as THREE from 'three';

export class Gunplay {
  constructor(scene) {
    this.scene = scene;
    // tracer pool: stretched glowing lines from muzzle to hit point
    this.tracers = [];
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      l.frustumCulled = false; scene.add(l);
      this.tracers.push({ line: l, life: 0 });
    }
    this.tracerIdx = 0;
    // particle pool: impact sparks, blood, snow puffs, muzzle smoke
    const N = 320;
    this.pN = N;
    this.pPos = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pCol = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pGeo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95 }));
    this.points.frustumCulled = false; scene.add(this.points);
    this.pIdx = 0;
    // shell casing pool: small brass boxes that pop out and fall
    this.casings = [];
    const cGeo = new THREE.BoxGeometry(0.05, 0.05, 0.12);
    const cMat = new THREE.MeshStandardMaterial({ color: 0xc8a038, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(cGeo, cMat);
      m.visible = false; scene.add(m);
      this.casings.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    this.cIdx = 0;
    // muzzle flash light (one, reused) + flash quad at the gun
    this.flashLight = new THREE.PointLight(0xffc46b, 0, 14, 2);
    scene.add(this.flashLight);
    this.flashLife = 0;
    // grenades in flight
    this.grenades = [];
    const gGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const gMat = new THREE.MeshStandardMaterial({ color: 0x2a3a26, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(gGeo, gMat); m.visible = false; scene.add(m);
      this.grenades.push({ mesh: m, vel: new THREE.Vector3(), life: 0, fuse: 0, owner: null });
    }
  }
  fireTracer(from, to, color) {
    const t = this.tracers[this.tracerIdx]; this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z; p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color); t.line.material.opacity = 0.95; t.life = 0.07;
  }
  burst(pos, n, color, speed, up, life) {
    for (let k = 0; k < n; k++) {
      const i = this.pIdx; this.pIdx = (this.pIdx + 1) % this.pN;
      this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
      this.pVel[i * 3] = (Math.random() - 0.5) * speed;
      this.pVel[i * 3 + 1] = Math.random() * up;
      this.pVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.pCol[i * 3] = ((color >> 16) & 255) / 255;
      this.pCol[i * 3 + 1] = ((color >> 8) & 255) / 255;
      this.pCol[i * 3 + 2] = (color & 255) / 255;
      this.pLife[i] = life * (0.6 + Math.random() * 0.6);
    }
    this.pGeo.attributes.color.needsUpdate = true;
  }
  impact(pos, surface) {
    if (surface === 'snow') this.burst(pos, 10, 0xeaf2fa, 2.2, 1.6, 0.5);
    else if (surface === 'metal') this.burst(pos, 12, 0xffc46b, 4, 2.5, 0.35);
    else this.burst(pos, 10, 0x9a9a92, 2.6, 1.8, 0.5);
  }
  blood(pos) { this.burst(pos, 16, 0x8a0f0f, 2.4, 1.4, 0.6); }
  muzzleFlash(pos, dir) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 30; this.flashLife = 0.05;
    // smoke puff drifting up from the muzzle
    const s = new THREE.Vector3(pos.x + dir.x, pos.y + dir.y * 0.5, pos.z + dir.z);
    this.burst(s, 5, 0x8a8f96, 0.5, 0.9, 1.1);
  }
  ejectCasing(pos, right) {
    const c = this.casings[this.cIdx]; this.cIdx = (this.cIdx + 1) % this.casings.length;
    c.mesh.position.copy(pos); c.mesh.visible = true;
    c.vel.set(right.x * 1.6 + (Math.random() - 0.5), 1.8 + Math.random(), right.z * 1.6);
    c.life = 1.2;
  }
  throwGrenade(from, dir, owner) {
    const g = this.grenades.find((x) => x.life <= 0);
    if (!g) return null;
    g.mesh.position.copy(from); g.mesh.visible = true;
    g.vel.copy(dir).multiplyScalar(16); g.vel.y += 4.5;
    g.life = 3; g.fuse = 1.6; g.owner = owner;
    return g;
  }
  update(dt, gravityTargets) {
    // tracers fade
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.material.opacity = 0; }
    }
    // particles: integrate, gravity, expire by sinking below the scene
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 5 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pLife[i] <= 0 || this.pPos[i * 3 + 1] < 0.02) { this.pPos[i * 3 + 1] = -50; this.pLife[i] = 0; }
    }
    this.pGeo.attributes.position.needsUpdate = true;
    // casings tumble and rest
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += dt * 9; c.mesh.rotation.z += dt * 7;
      if (c.mesh.position.y < 0.05) { c.mesh.position.y = 0.05; c.vel.set(0, 0, 0); }
      if (c.life <= 0) c.mesh.visible = false;
    }
    if (this.flashLife > 0) { this.flashLife -= dt; if (this.flashLife <= 0) this.flashLight.intensity = 0; }
    // grenades: ballistic, bounce once, explode on fuse
    for (const g of this.grenades) {
      if (g.life <= 0) continue;
      g.life -= dt; g.fuse -= dt;
      g.vel.y -= 9.8 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.14) { g.mesh.position.y = 0.14; g.vel.y *= -0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      if (g.fuse <= 0) {
        const p = g.mesh.position.clone();
        this.burst(p, 40, 0xffa040, 9, 6, 0.8);
        this.burst(p, 20, 0x555550, 3, 4, 1.4);
        g.mesh.visible = false; g.life = 0;
        if (gravityTargets) gravityTargets(p, 90, 7, g.owner);
      }
    }
  }
}
