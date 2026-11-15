// map.js — Aurora Station: an original Arctic research outpost.
// Procedural canvas textures (weathered metal, concrete, snow, hazard stripes,
// real signage) so the game ships zero image files and loads nothing over the network.
import * as THREE from 'three';
import { mulberry32 } from './state.js';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, w, h, n, colors, s0, s1, rng) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rng() * colors.length)];
    g.globalAlpha = 0.12 + rng() * 0.5;
    const s = s0 + rng() * (s1 - s0);
    g.fillRect(rng() * w, rng() * h, s, s * (0.4 + rng()));
  }
  g.globalAlpha = 1;
}
function streaks(g, w, h, n, color, rng) { // rust runs dripping downward
  for (let i = 0; i < n; i++) {
    g.strokeStyle = color; g.globalAlpha = 0.1 + rng() * 0.35;
    g.lineWidth = 1 + rng() * 3;
    const x = rng() * w, y = rng() * h * 0.6, len = 20 + rng() * 90;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 8, y + len); g.stroke();
  }
  g.globalAlpha = 1;
}
// Weathered painted metal: cold blue-grey panels, rust at seams, chipped paint.
export function metalTexture(base, rust, rng) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#2a3438', '#4a5a60', '#1c2428', '#5d6d72'], 1, 5, rng);
    streaks(g, w, h, 26, rust, rng);
    g.strokeStyle = 'rgba(10,14,18,0.55)'; g.lineWidth = 3;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, 30 + i * 48); g.lineTo(w, 30 + i * 48); g.stroke(); }
    // rivets
    g.fillStyle = 'rgba(200,215,225,0.5)';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(12 + (i % 4) * 78, 12 + Math.floor(i / 4) * 232, 3, 0, 7); g.fill(); }
  }, [2, 2]);
}
// Poured concrete: pale grey, stains, hairline cracks.
export function concreteTexture(rng) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8b8f8c'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1400, ['#6f7370', '#a2a6a1', '#7d817d', '#5c605d'], 1, 6, rng);
    g.strokeStyle = 'rgba(40,42,40,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      g.beginPath(); let x = rng() * w, y = rng() * h;
      g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
  }, [3, 3]);
}
// Snow: white-blue with sparkle and soft drifts.
export function snowTexture(rng) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#dfe9f2'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['#ffffff', '#c3d4e4', '#b8cde0', '#eef5fb'], 1, 4, rng);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 60; i++) { g.fillRect(rng() * w, rng() * h, 1, 1); }
  }, [6, 6]);
}
// Yellow/black hazard chevrons for site edges and catwalk lips.
export function hazardTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8a419'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#151515';
    for (let i = -2; i < 5; i++) {
      g.beginPath();
      g.moveTo(i * 32, h); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 16, h);
      g.fill();
    }
  }, [4, 1]);
}
// Real signage: readable warning text painted on a plate.
export function signTexture(lines, bg, fg, accent) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = accent; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = 'bold 64px sans-serif';
    g.fillText(lines[0], w / 2, 92);
    g.font = 'bold 40px sans-serif';
    g.fillStyle = accent;
    g.fillText(lines[1] || '', w / 2, 158);
    g.font = '28px sans-serif'; g.fillStyle = fg;
    g.fillText(lines[2] || '', w / 2, 210);
  });
}
function box(w, h, d, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); if (ry) m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Aurora borealis skybox: a big inverted sphere with an animated shader —
// green/violet curtains rippling over a deep blue-hour sky.
function auroraMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform float uTime;
      void main(){
        vec3 d = normalize(vP);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(vec3(0.11,0.17,0.32), vec3(0.03,0.05,0.12), h);
        vec3 horizon = vec3(0.45,0.28,0.12) * (1.0 - smoothstep(0.0, 0.22, d.y)) * 0.55;
        sky += horizon;
        float band = sin(d.x*3.0 + uTime*0.12 + sin(d.z*2.0+uTime*0.07)*1.5);
        float curtain = smoothstep(0.55, 0.95, band) * smoothstep(0.05, 0.35, d.y) * (1.0 - smoothstep(0.55, 0.9, d.y));
        vec3 aur = mix(vec3(0.1,0.9,0.45), vec3(0.55,0.25,0.9), clamp(0.5+0.5*sin(d.z*2.0-uTime*0.05),0.0,1.0));
        vec3 col = sky + aur * curtain * 1.5;
        float star = step(0.9985, fract(sin(dot(floor(d.xz*240.0), vec2(12.9898,78.233)))*43758.5453));
        col += vec3(star) * smoothstep(0.15, 0.5, d.y) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export class Station {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.colliders = [];   // {minX,maxX,minZ,maxZ,top} AABBs the player/bots collide with
    this.waypoints = [];   // {x,z} navigation graph nodes
    this.lamps = [];       // {pos, light, shaft}
    this.surfaces = [];    // {minX,maxX,minZ,maxZ,surface} for footstep sounds
    this.footprints = [];  // footprint decal meshes, oldest recycled
    this.build();
  }
  addCollider(x, z, w, d, top) { this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top }); }
  addSurface(x, z, w, d, s) { this.surfaces.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, surface: s }); }
  surfaceAt(x, z) {
    for (const s of this.surfaces) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s.surface;
    return 'snow';
  }
  solidAt(x, z, r) { // circle vs AABB; returns corrected position
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); x = nx + dx / d * r; z = nz + dz / d * r; }
        else { x += r; }
      }
    }
    return [x, z];
  }
  build() {
    const rng = this.rng, scene = this.scene;
    scene.fog = new THREE.FogExp2(0x0d1a28, 0.011);
    // --- lighting: low blue-hour moon + warm lamps; soft shadows, dark corners ---
    const moon = new THREE.DirectionalLight(0x8fb4e8, 0.95);
    moon.position.set(-30, 42, -18); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -45; moon.shadow.camera.right = 45;
    moon.shadow.camera.top = 45; moon.shadow.camera.bottom = -45;
    moon.shadow.camera.far = 120; moon.shadow.bias = -0.0006;
    moon.shadow.radius = 4; // PCFSoft soft shadows
    scene.add(moon);
    scene.add(new THREE.HemisphereLight(0x4a6488, 0x141c26, 0.85));
    this.auroraMat = auroraMaterial();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), this.auroraMat);
    scene.add(sky); this.sky = sky;
    // --- materials ---
    const snowMat = new THREE.MeshStandardMaterial({ map: snowTexture(rng), roughness: 0.95, metalness: 0 });
    const concMat = new THREE.MeshStandardMaterial({ map: concreteTexture(rng), roughness: 0.9, metalness: 0.05 });
    const hullMat = new THREE.MeshStandardMaterial({ map: metalTexture('#3d4a52', '#7a4a28', rng), roughness: 0.62, metalness: 0.35 });
    const hull2Mat = new THREE.MeshStandardMaterial({ map: metalTexture('#4a3f38', '#6e3f22', rng), roughness: 0.7, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ map: metalTexture('#232a2e', '#5a3a20', rng), roughness: 0.55, metalness: 0.4 });
    const rustMat = new THREE.MeshStandardMaterial({ map: metalTexture('#5a3a26', '#8a5426', rng), roughness: 0.85, metalness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.08, metalness: 0.4, emissive: 0x2a4a5e, emissiveIntensity: 0.7 });
    const hazMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8, metalness: 0.1 });
    this.mats = { snowMat, concMat, hullMat, hull2Mat, darkMat, rustMat, glassMat, hazMat };
    // --- ground: snowfield with drift mounds + concrete pads under buildings ---
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), snowMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    this.addSurface(0, 0, 150, 150, 'snow');
    for (let i = 0; i < 26; i++) { // snowdrifts
      const a = rng() * Math.PI * 2, r = 18 + rng() * 42;
      const mound = new THREE.Mesh(new THREE.SphereGeometry(1.5 + rng() * 3.2, 10, 6), snowMat);
      mound.scale.y = 0.28; mound.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      mound.receiveShadow = true; scene.add(mound);
    }
    // ice patches — slick, faintly blue, near the mid lane
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xaacfee, roughness: 0.12, metalness: 0.1 });
    for (const [x, z, s] of [[-2, 6, 5], [10, -14, 4], [-14, 16, 4.5]]) {
      const ice = new THREE.Mesh(new THREE.CircleGeometry(s, 20), iceMat);
      ice.rotation.x = -Math.PI / 2; ice.position.set(x, 0.02, z); ice.receiveShadow = true; scene.add(ice);
    }
    this.buildHalls(hullMat, hull2Mat, darkMat, rustMat, glassMat, hazMat, concMat);
    this.buildProps(rustMat, darkMat, hull2Mat, hazMat);
    this.buildLamps();
    this.buildSnow();
    this.buildWaypoints();
  }
  wall(x, z, w, d, h, mat, ry) {
    const m = box(w, h, d, mat, x, h / 2, z, ry);
    this.scene.add(m); this.addCollider(x, z, w, d, h);
    return m;
  }
  sign(tex, w, h, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }));
    m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m);
  }
  buildHalls(hull, hull2, dark, rust, glass, haz, conc) {
    const S = this.scene, rng = this.rng;
    // SITE A — REACTOR HALL (north, z = -26): big hall, glowing reactor core, hazard floor edge.
    const padA = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), conc);
    padA.rotation.x = -Math.PI / 2; padA.position.set(0, 0.03, -26); padA.receiveShadow = true; S.add(padA);
    this.addSurface(0, -26, 26, 18, 'concrete');
    this.wall(0, -35, 26, 1, 7, hull, 0); this.wall(-13, -26, 1, 18, 7, hull, 0); this.wall(13, -26, 1, 18, 7, hull, 0);
    this.wall(-8, -17.5, 9, 1, 6, hull, 0); this.wall(8.5, -17.5, 8, 1, 6, hull, 0); // front wall, gap = A entrance
    const roofA = box(27, 0.6, 19, dark, 0, 7.2, -26, 0); S.add(roofA);
    // lit window strips on the hall front — warm interior light spilling out
    const winMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb35c, emissiveIntensity: 2.2 });
    for (const wx of [-11, -4, 4, 11]) {
      const win = box(2.4, 1.1, 0.15, winMat, wx, 4.2, -16.95, 0); S.add(win);
    }
    // reactor core: emissive cylinder + pipes
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 4.4, 18),
      new THREE.MeshStandardMaterial({ color: 0x224455, emissive: 0x2fb8ff, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.6 }));
    core.position.set(0, 2.2, -30); core.castShadow = true; S.add(core);
    this.addCollider(0, -30, 5, 5, 4.4);
    for (let i = 0; i < 4; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 10), rust);
      pipe.rotation.z = Math.PI / 2; pipe.position.set(-4 + i * 2.6, 6.4, -31.5); pipe.castShadow = true; S.add(pipe);
    }
    const hazA = box(10, 0.08, 0.5, haz, 0, 0.06, -17.5, 0); S.add(hazA);
    this.sign(signTexture(['SITE A', 'REACTOR HALL', 'HIGH VOLTAGE — AUTHORIZED CREW ONLY'], '#1c2a33', '#e8f2f8', '#ffb35c'),
      6, 3, -6, 4.6, -17.0, 0);
    this.sign(signTexture(['DANGER', 'RADIATION', 'KEEP OUT — 400 kV'], '#2a1c14', '#ffd9a0', '#ff5a3c'),
      4, 2, 6.5, 3.4, -17.0, 0);
    // SITE B — COMMS DOME (south, z = +26): low dome, dish, crates, warm interior lamp.
    const padB = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), conc);
    padB.rotation.x = -Math.PI / 2; padB.position.set(0, 0.03, 26); padB.receiveShadow = true; S.add(padB);
    this.addSurface(0, 26, 24, 16, 'concrete');
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: metalTexture('#46545c', '#7a4a28', rng), roughness: 0.55, metalness: 0.3 }));
    dome.position.set(0, 0, 26); dome.castShadow = true; dome.receiveShadow = true; S.add(dome);
    // lit porthole ring around the dome base
    const winMatB = new THREE.MeshStandardMaterial({ color: 0x1a2418, emissive: 0x9fd4ff, emissiveIntensity: 2.0 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const win = box(1.1, 0.9, 0.15, winMatB, Math.sin(a) * 7.6, 2.2, 26 + Math.cos(a) * 7.6, a);
      S.add(win);
    }
    this.wall(-9, 26, 1, 12, 5, hull2, 0); this.wall(9, 26, 1, 12, 5, hull2, 0);
    // south wall in two segments: a gap at the centre so the Sentinel spawn
    // looks straight into the dome instead of at a blank wall
    this.wall(-6.5, 33.5, 6, 1, 5, hull2, 0); this.wall(6.5, 33.5, 6, 1, 5, hull2, 0);
    // satellite dish on a mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 7, 8), dark);
    mast.position.set(6, 3.5, 30); mast.castShadow = true; S.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3),
      new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }));
    dish.position.set(6, 7.4, 30); dish.rotation.x = -0.9; dish.castShadow = true; S.add(dish);
    this.sign(signTexture(['SITE B', 'COMMS DOME', 'UPLINK 7 — SATCOM ARRAY'], '#1c2a33', '#e8f2f8', '#7fd4ff'),
      6, 3, -5, 3.6, 18.6, Math.PI);
    // MID CONNECTOR (z = 0): low hut joining the lanes, plus a crawl VENT tunnel.
    this.wall(-16, 0, 1, 10, 4.5, hull2, 0); this.wall(16, 0, 1, 10, 4.5, hull2, 0);
    const midRoof = box(33, 0.5, 11, dark, 0, 4.7, 0, 0); S.add(midRoof);
    const midFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), conc);
    midFloor.rotation.x = -Math.PI / 2; midFloor.position.set(0, 0.03, 0); midFloor.receiveShadow = true; S.add(midFloor);
    this.addSurface(0, 0, 30, 10, 'metal');
    // vent tunnel: dark tube under the connector, east side — a flank route
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 12, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2a2f30, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
    vent.rotation.z = Math.PI / 2; vent.position.set(20, 1.1, 8); S.add(vent);
    this.addCollider(20, 8, 12, 2.2, 2.2);
    this.sign(signTexture(['VENT 03', 'MAINTENANCE', 'MIND THE GRATING'], '#22281f', '#cfe8c8', '#d8a419'),
      4, 2, 14.2, 2.6, 8, Math.PI / 2);
    // CATWALK: raised metal walkway along the west side, with stairs — verticality.
    const walk = box(2.2, 0.25, 22, dark, -20, 3.4, -2, 0); S.add(walk);
    this.addCollider(-20, -2, 2.2, 22, 3.4);
    const rail = box(0.12, 1, 22, rust, -21, 4.1, -2, 0); S.add(rail);
    for (let i = 0; i < 6; i++) { // stair steps up to the catwalk
      const st = box(2.2, 0.3, 1, dark, -20, 0.45 + i * 0.5, 10.5 - i * 1.1, 0); S.add(st);
    }
    this.sign(signTexture(['CATWALK', 'KEEP CLEAR', 'MAX LOAD 400 KG'], '#22281f', '#cfe8c8', '#d8a419'),
      4, 2, -18.8, 2.4, -10, Math.PI / 2);
    // perimeter fence posts + outer walls so the map reads as a compound
    for (const [x, z] of [[-24, -14], [24, -14], [-24, 14], [24, 14]]) this.wall(x, z, 1, 1, 3, dark, 0);
    this.wall(0, -40, 60, 1, 3, dark, 0); this.wall(0, 40, 60, 1, 3, dark, 0);
    this.wall(-30, 0, 1, 80, 3, dark, 0); this.wall(30, 0, 1, 80, 3, dark, 0);
  }
  buildProps(rust, dark, hull2, haz) {
    const S = this.scene, rng = this.rng;
    const crateMat = new THREE.MeshStandardMaterial({ map: metalTexture('#5a4a2e', '#7a4a28', rng), roughness: 0.8, metalness: 0.2 });
    const contMat = new THREE.MeshStandardMaterial({ map: metalTexture('#274b5e', '#6e3f22', rng), roughness: 0.7, metalness: 0.25 });
    // shipping containers — mid cover and lane blocks
    const conts = [[-8, -8, 0.4, 6, 2.6, 2.6], [9, -6, -0.3, 6, 2.6, 2.6], [-9, 10, 0.2, 6, 2.6, 2.6], [8, 12, 0, 6, 2.6, 2.6], [18, -20, 0, 4, 2.4, 2.4]];
    for (const [x, z, ry, w, h, d] of conts) {
      const c = box(w, h, d, contMat, x, h / 2, z, ry); S.add(c);
      this.addCollider(x, z, w, d, h);
    }
    // crates — stackable cover
    const crates = [[-4, -20, 1.2], [-3, -21.4, 1.2], [4, -20, 1.2], [-5, 20, 1.2], [5, 21, 1.2], [14, 2, 1.2], [-14, -4, 1.2], [2, 8, 1.2], [-2, -8, 1.2]];
    for (const [x, z, s] of crates) {
      const c = box(s, s, s, crateMat, x, s / 2, z, rng() * 0.6); S.add(c);
      this.addCollider(x, z, s, s, s);
    }
    // barrels, pipes, antenna masts, a snowmobile silhouette
    const barrelMat = new THREE.MeshStandardMaterial({ map: metalTexture('#3e2f26', '#8a5426', rng), roughness: 0.85, metalness: 0.25 });
    for (const [x, z] of [[-12, -12], [12, 16], [-18, 6], [20, -2]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 12), barrelMat);
      b.position.set(x, 0.65, z); b.castShadow = true; S.add(b); this.addCollider(x, z, 1.1, 1.1, 1.3);
    }
    for (const [x, z, ry] of [[-24, -24, 0], [24, 24, 1.57]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 10), rust);
      p.rotation.z = Math.PI / 2; p.rotation.y = ry; p.position.set(x, 1.2, z); p.castShadow = true; S.add(p);
    }
    // snowmobile: dark body + windshield, parked by the mid hut
    const sm = box(2.4, 0.6, 0.9, dark, 12, 0.5, -12, 0.5); S.add(sm);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.7 }));
    ws.position.set(11.4, 0.95, -12.4); ws.rotation.y = 0.5; S.add(ws);
    this.addCollider(12, -12, 2.4, 1, 0.8);
  }
  buildLamps() {
    const S = this.scene;
    // Amber sodium lamps: warm point light + visible volumetric shaft (additive cone)
    // + a bright emissive bulb the tone mapper blooms.
    const lampSpots = [
      [0, -17.5, 5.2, 0xffb35c], [-10, -26, 5.2, 0xffb35c], [10, -26, 5.2, 0xffc978],
      [0, 18.5, 5.0, 0xffb35c], [-8, 26, 4.6, 0xffc978], [8, 26, 4.6, 0xffb35c],
      [0, -5, 4.4, 0xffd9a0], [0, 5, 4.4, 0xffd9a0], [-20, -2, 4.6, 0xffb35c],
      [14, 8, 3.4, 0xffb35c], [-14, -8, 3.4, 0xffc978],
    ];
    for (const [x, z, h, color] of lampSpots) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, h, 8), this.mats.darkMat);
      pole.position.set(x, h / 2, z); pole.castShadow = true; S.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x332211, emissive: color, emissiveIntensity: 4 }));
      bulb.position.set(x, h, z); S.add(bulb);
      const light = new THREE.PointLight(color, 26, 22, 1.8);
      light.position.set(x, h - 0.3, z); light.castShadow = false; S.add(light);
      // light shaft: additive cone, faint, wider at the ground
      const shaftMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const shaft = new THREE.Mesh(new THREE.ConeGeometry(3.4, h, 16, 1, true), shaftMat);
      shaft.position.set(x, h / 2, z); S.add(shaft);
      this.lamps.push({ pos: new THREE.Vector3(x, h, z), light, shaft });
    }
    // cool blue floodlight over the reactor core
    const flood = new THREE.PointLight(0x66b8ff, 40, 26, 1.6);
    flood.position.set(0, 6.5, -30); S.add(flood);
    this.lamps.push({ pos: new THREE.Vector3(0, 6.5, -30), light: flood, shaft: null });
  }
  buildSnow() {
    const N = 2400; // denser snow: two layers, near + far
    const pos = new Float32Array(N * 3);
    this.snowVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (this.rng() - 0.5) * 110;
      pos[i * 3 + 1] = this.rng() * 26;
      pos[i * 3 + 2] = (this.rng() - 0.5) * 110;
      this.snowVel[i] = 1.2 + this.rng() * 2.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // soft round snowflakes, not squares: a radial-gradient sprite map
    const sc = document.createElement('canvas'); sc.width = sc.height = 32;
    const sg = sc.getContext('2d');
    const grad = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = grad; sg.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ color: 0xeaf2fa, size: 0.16, transparent: true, opacity: 0.9, sizeAttenuation: true, map: new THREE.CanvasTexture(sc), depthWrite: false });
    this.snow = new THREE.Points(geo, mat);
    this.scene.add(this.snow);
    // footprint decals: dark ovals pressed into the snow, recycled ring buffer
    const fpGeo = new THREE.CircleGeometry(0.16, 8);
    const fpMat = new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(fpGeo, fpMat);
      m.rotation.x = -Math.PI / 2; m.position.y = -10; m.visible = false;
      this.scene.add(m); this.footprints.push(m);
    }
    this.fpIndex = 0;
  }
  stampFootprint(x, z, yaw) {
    const m = this.footprints[this.fpIndex];
    this.fpIndex = (this.fpIndex + 1) % this.footprints.length;
    m.position.set(x, 0.045, z); m.rotation.z = yaw; m.visible = true;
  }
  buildWaypoints() {
    // Navigation graph: spawn lanes, mid, both sites, catwalk, vent, flanks.
    const pts = [
      [0, -38, 'A'], [0, -26, 'A'], [-8, -20, 'A'], [8, -20, 'A'], [-13, -30, 'A'], [13, -30, 'A'],
      [0, 38, 'B'], [0, 26, 'B'], [-8, 20, 'B'], [8, 20, 'B'], [-6, 30, 'B'], [6, 30, 'B'],
      [0, 0, 'mid'], [-10, 0, 'mid'], [10, 0, 'mid'], [-16, -8, 'mid'], [16, 8, 'mid'],
      [-20, -2, 'cat'], [-20, 8, 'cat'], [20, 8, 'vent'], [14, 8, 'vent'],
      [-24, -14, 'flank'], [24, -14, 'flank'], [-24, 14, 'flank'], [24, 14, 'flank'],
      [0, -12, 'lane'], [0, 12, 'lane'], [-6, -8, 'lane'], [6, 8, 'lane'],
    ];
    for (const [x, z, zone] of pts) this.waypoints.push({ x, z, zone });
  }
  update(dt, time, storm, wind) {
    // aurora shimmer
    this.auroraMat.uniforms.uTime.value = time;
    // wind-blown snow: fall + lateral gust drift; gusts cut visibility via fog density
    const pos = this.snow.geometry.attributes.position;
    const arr = pos.array;
    const gust = storm * (0.6 + 0.4 * Math.sin(time * 0.7));
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= this.snowVel[i / 3] * dt * (1 + storm);
      arr[i] += (wind * 6 * gust + Math.sin(time * 0.9 + i) * 0.6) * dt;
      arr[i + 2] += Math.cos(time * 0.6 + i * 0.7) * 0.4 * dt;
      if (arr[i + 1] < 0) { arr[i + 1] = 24 + this.rng() * 2; arr[i] = (this.rng() - 0.5) * 110; arr[i + 2] = (this.rng() - 0.5) * 110; }
      if (arr[i] > 55) arr[i] = -55; if (arr[i] < -55) arr[i] = 55;
    }
    pos.needsUpdate = true;
    this.snow.material.opacity = 0.55 + storm * 0.45;
    this.scene.fog.density = 0.008 + storm * 0.012;
    // lamp shafts breathe faintly with the wind
    for (const l of this.lamps) if (l.shaft) l.shaft.material.opacity = 0.04 + 0.02 * Math.sin(time * 1.3 + l.pos.x);
  }
}
