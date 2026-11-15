// bots.js — human-like opponents: they peek angles, hold sites, rotate together,
// react to gunfire sound, flank, and get sharper as rounds go on (difficulty ramp).
import * as THREE from 'three';
import { WEAPONS } from './state.js';

const NAMES_JAC = ['Vex', 'Rook', 'Frost', 'Havoc'];
const NAMES_SEN = ['Iris', 'Boreal'];

function losClear(a, b, station) {
  // 2D segment vs wall AABBs, sampled — cheap and good enough for bot vision.
  for (let t = 0.1; t < 1; t += 0.09) {
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (const c of station.colliders) {
      if (c.top > 1.6 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
    }
  }
  return true;
}

export class Bot {
  constructor(scene, team, name, idx, station, rng) {
    this.team = team; this.name = name; this.idx = idx;
    this.station = station; this.rng = rng;
    this.health = 100; this.alive = true;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.speed = 0;
    this.weaponId = team === 'jac' ? ['frost', 'aurora', 'blizzard', 'longnight'][idx % 4] : ['aurora', 'frost'][idx % 2];
    this.ammo = WEAPONS[this.weaponId].mag;
    this.state = 'advance';       // advance | hold | peek | rotate | plant | defuse | retreat
    this.target = null;           // current waypoint
    this.holdTimer = 0; this.peekTimer = 0; this.fireCd = 0; this.reloadT = 0;
    this.heard = null;            // {x,z,at} last gunfire heard
    this.strafeDir = 1; this.strafeT = 0;
    this.reactT = 0;              // reaction delay before first shot
    this.kills = 0;
    // body: weathered parka capsule + head + visor + gun — reads as a person, not a box.
    const coat = team === 'jac' ? 0x5a3a30 : 0x2e4a5e;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 10),
      new THREE.MeshStandardMaterial({ color: coat, roughness: 0.85 }));
    body.position.y = 1.05; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc8a888, roughness: 0.7 }));
    head.position.y = 1.82; head.castShadow = true; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.6 }));
    visor.position.set(0, 1.84, 0.2); g.add(visor);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.35, 10),
      new THREE.MeshStandardMaterial({ color: coat, roughness: 0.9 }));
    hood.position.y = 2.0; g.add(hood);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x1a1d1f, roughness: 0.4, metalness: 0.8 }));
    gun.position.set(0.28, 1.35, 0.35); g.add(gun);
    this.mesh = g; scene.add(g);
    // name tag sprite above the head (canvas, no assets)
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = team === 'jac' ? '#ffb08a' : '#7fd4ff';
    ctx.fillText(name, 64, 22);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(1.1, 0.28, 1); spr.position.y = 2.35; g.add(spr);
    this.tag = spr;
  }
  spawn(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.health = 100; this.alive = true;
    this.ammo = WEAPONS[this.weaponId].mag;
    this.state = 'advance'; this.target = null; this.fireCd = 0; this.reloadT = 0;
    this.mesh.visible = true; this.tag.visible = true;
  }
  die() { this.alive = false; this.mesh.visible = false; }
  headPos() { return new THREE.Vector3(this.pos.x, 1.75, this.pos.z); }
  chestPos() { return new THREE.Vector3(this.pos.x, 1.2, this.pos.z); }
  // difficulty: round 1 bots are slow and wild; round 5+ they snap and group up.
  difficulty(round) {
    const r = Math.min(round, 6);
    return {
      accuracy: 0.24 + r * 0.045,      // hit probability per shot at mid range
      reaction: Math.max(0.25, 0.75 - r * 0.08),
      speed: 2.6 + r * 0.22,
      peek: r >= 3,
      group: r >= 2,
    };
  }
  hear(x, z, now) { this.heard = { x, z, at: now }; }
}

// Bot update: one fixed-step tick. `world` gives {station, player, bots, spike, round,
// onBotShoot, onBotKill, sound} — the sim in main.js owns damage and scoring.
export function updateBot(bot, dt, world) {
  if (!bot.alive) return;
  const st = world.station, d = bot.difficulty(world.round);
  const w = WEAPONS[bot.weaponId];
  bot.fireCd -= dt; bot.holdTimer -= dt; bot.peekTimer -= dt; bot.strafeT -= dt;
  // --- pick a target: nearest visible enemy ---
  let enemy = null, enemyDist = 1e9;
  const foes = world.bots.filter((b) => b.alive && b.team !== bot.team);
  if (bot.team === 'jac') foes.push(world.player);
  else if (world.player.team === 'jac') foes.push(world.player);
  const playerFoe = bot.team === 'jac' ? world.player : null;
  const candidates = playerFoe && playerFoe.alive ? [playerFoe, ...foes] : foes;
  for (const f of candidates) {
    if (!f.alive) continue;
    const fp = f.pos || f.position;
    const dist = Math.hypot(fp.x - bot.pos.x, fp.z - bot.pos.z);
    if (dist < enemyDist && losClear(bot.pos, fp, st)) { enemy = f; enemyDist = dist; }
  }
  // --- objective logic ---
  const spike = world.spike;
  if (bot.team === 'jac' && spike.state === 'carried' && world.spikeCarrier === bot) {
    bot.state = 'plant';
  } else if (bot.team === 'jac' && spike.state === 'planted') {
    bot.state = 'hold'; // guard the planted spike together
  } else if (bot.team === 'sen' && spike.state === 'planted') {
    bot.state = 'rotate'; // retake together
  } else if (enemy && enemyDist < 26) {
    bot.state = d.peek && bot.peekTimer <= 0 ? 'peek' : 'advance';
  } else if (bot.state === 'peek' && bot.peekTimer <= 0) {
    bot.state = 'advance';
  }
  // --- choose a waypoint for the current state ---
  const wps = st.waypoints;
  const pick = (zone) => {
    const list = wps.filter((p) => p.zone === zone);
    return list.length ? list[Math.floor(bot.rng() * list.length)] : wps[0];
  };
  if (!bot.target || bot.state === 'rotate' || (bot.state === 'plant' && bot.target?.zone !== spike.site)) {
    if (bot.state === 'plant') bot.target = pick(spike.site);
    else if (bot.state === 'rotate') bot.target = pick(spike.site);
    else if (bot.state === 'hold') bot.target = pick(spike.state === 'planted' ? spike.site : (bot.team === 'jac' ? 'A' : 'mid'));
    else if (bot.heard && world.time - bot.heard.at < 4) bot.target = { x: bot.heard.x, z: bot.heard.z, zone: 'heard' };
    else bot.target = bot.team === 'jac' ? pick(bot.rng() < 0.5 ? 'A' : 'B') : pick(bot.rng() < 0.5 ? 'mid' : 'lane');
  }
  // --- movement: walk to target, strafe while fighting, peek = quick lean out and back ---
  let mx = 0, mz = 0;
  if (bot.state === 'hold') {
    if (bot.holdTimer <= 0) { bot.holdTimer = 2 + bot.rng() * 2; bot.yaw += (bot.rng() - 0.5) * 1.6; }
  } else if (bot.state === 'peek') {
    if (bot.peekTimer <= 0) bot.peekTimer = 0.7 + bot.rng() * 0.5;
    const s = Math.sin(world.time * 3 + bot.idx) * 0.8;
    mx = Math.cos(bot.yaw) * s; mz = -Math.sin(bot.yaw) * s;
  } else if (bot.target) {
    const dx = bot.target.x - bot.pos.x, dz = bot.target.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) { bot.target = null; }
    else {
      mx = dx / dist; mz = dz / dist;
      const wantYaw = Math.atan2(dx, dz);
      let dy = wantYaw - bot.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      bot.yaw += dy * Math.min(1, dt * 4);
      // group up: drift toward the nearest same-team bot when rotating
      if (d.group && bot.state === 'rotate') {
        const mates = world.bots.filter((b) => b.alive && b.team === bot.team && b !== bot);
        if (mates.length) {
          const m = mates[0];
          mx += (m.pos.x - bot.pos.x) * 0.02; mz += (m.pos.z - bot.pos.z) * 0.02;
        }
      }
    }
  }
  if (enemy) { // face the enemy, strafe sideways while firing
    const dx = enemy.pos.x - bot.pos.x, dz = enemy.pos.z - bot.pos.z;
    const wantYaw = Math.atan2(dx, dz);
    let dy = wantYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, dt * 6);
    if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 0.5 + bot.rng() * 0.8; }
    mx += Math.cos(bot.yaw + Math.PI / 2) * bot.strafeDir * 0.55;
    mz += -Math.sin(bot.yaw + Math.PI / 2) * bot.strafeDir * 0.55;
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01) {
    const sp = d.speed * (enemy ? 0.55 : 1);
    bot.pos.x += (mx / ml) * sp * dt;
    bot.pos.z += (mz / ml) * sp * dt;
    const [nx, nz] = st.solidAt(bot.pos.x, bot.pos.z, 0.45);
    bot.pos.x = nx; bot.pos.z = nz;
    // footprints in the snow
    if (world.time - (bot.lastStep || 0) > 0.42 && st.surfaceAt(bot.pos.x, bot.pos.z) === 'snow') {
      st.stampFootprint(bot.pos.x, bot.pos.z, bot.yaw); bot.lastStep = world.time;
    }
  }
  bot.mesh.position.copy(bot.pos);
  bot.mesh.rotation.y = bot.yaw;
  // --- shooting ---
  if (bot.reloadT > 0) { bot.reloadT -= dt; if (bot.reloadT <= 0) bot.ammo = w.mag; return; }
  if (enemy && enemyDist < w.range && bot.fireCd <= 0) {
    if (bot.reactT <= 0) bot.reactT = d.reaction;
    bot.reactT -= dt;
    if (bot.reactT <= 0) {
      bot.fireCd = 60 / w.rpm;
      const spread = (enemyDist / w.range) * 0.5 + 0.12;
      if (bot.rng() < d.accuracy * (1 - spread) + 0.08) {
        const hs = bot.rng() < 0.16;
        world.onBotShoot(bot, enemy, hs);
      } else {
        world.onBotMiss(bot, enemy);
      }
      bot.ammo--;
      if (bot.ammo <= 0) bot.reloadT = w.reload;
    }
  }
}
export { losClear };
