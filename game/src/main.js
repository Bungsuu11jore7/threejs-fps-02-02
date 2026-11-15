// main.js — WHITEOUT: Aurora Station. Entry point: renderer, input, player,
// fixed-step simulation, rounds, plant/defuse, economy and the deterministic
// ?shot= screenshot mode. Simulation (tick) is kept apart from rendering.
import * as THREE from 'three';
import { makeState, WEAPONS, WEAPON_ORDER, TICK, WIN_ROUNDS, ROUND_TIME, BUY_TIME,
  PLANT_TIME, DEFUSE_TIME, HEADSHOT_MULT, KILL_REWARD, ROUND_WIN_REWARD,
  ROUND_LOSS_REWARD, PLANT_REWARD, GRENADE_PRICE, mulberry32 } from './state.js';
import { Station } from './map.js';
import { AudioSys } from './audio.js';
import { Gunplay } from './gunplay.js';
import { Bot, updateBot } from './bots.js';
import { Hud } from './hud.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection:' + String(e.reason)));

const params = new URLSearchParams(location.search);
const SHOT = parseInt(params.get('shot') || '0', 10) || 0;
const AUTO = params.has('auto');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic curve: lamps bloom, corners stay dark
renderer.toneMappingExposure = 1.35;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1420);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';

const rng = mulberry32(20261115);
const station = new Station(scene, rng);
// Environment reflections: bake the aurora sky into a PMREM env map so
// weathered metal reads as metal instead of black, with no external asset.
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), station.auroraMat.clone()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.5;
}
// Helmet headlamp: a small warm light on the camera — lights the viewmodel
// and the ground at the player's feet, as a real night-op lamp would.
const headlamp = new THREE.PointLight(0xffe0b0, 7, 9, 1.6);
headlamp.position.set(0.25, 0.25, 0.1);
camera.add(headlamp);
const audio = new AudioSys();
const gun = new Gunplay(scene);
const hud = new Hud();
const state = makeState();
state.shot = SHOT;

const player = {
  team: 'sen', name: 'YOU', alive: true,
  pos: new THREE.Vector3(0, 1.62, 34), yaw: Math.PI, pitch: 0,
  health: 100, weaponId: 'aurora', mag: 30, reserve: 90, grenades: 0,
  vel: new THREE.Vector3(), crouch: false, stamina: 100, ads: false,
  recoilP: 0, recoilY: 0, recoilIdx: 0, spreadBloom: 0, fireCd: 0, reloadT: 0,
  swayT: 0, breathT: 0, lastStep: 0, stepSide: 1, moving: false, onGround: true,
};
player.pos = new THREE.Vector3(0, 1.62, 34);

const bots = [];
['Vex', 'Rook', 'Frost', 'Havoc'].forEach((n, i) => bots.push(new Bot(scene, 'jac', n, i, station, rng)));
['Iris', 'Boreal'].forEach((n, i) => bots.push(new Bot(scene, 'sen', n, i, station, rng)));

// --- weapon viewmodel: simple low-poly gun that sways, breathes, kicks and reloads ---
const view = new THREE.Group();
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62),
  new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.35, metalness: 0.85 }));
const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8),
  new THREE.MeshStandardMaterial({ color: 0x111314, roughness: 0.3, metalness: 0.9 }));
gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.set(0, 0.02, -0.45);
const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.1),
  new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.5, metalness: 0.6 }));
gunMag.position.set(0, -0.16, -0.05);
const gunSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02),
  new THREE.MeshStandardMaterial({ color: 0x111314, emissive: 0x88ffaa, emissiveIntensity: 0.6 }));
gunSight.position.set(0, 0.1, -0.2);
view.add(gunBody, gunBarrel, gunMag, gunSight);
view.position.set(0.28, -0.26, -0.5);
camera.add(view); scene.add(camera);
const muzzle = new THREE.Object3D(); muzzle.position.set(0.28, -0.2, -0.9); camera.add(muzzle);

// --- input ---
const keys = {};
let mouseDown = false, mouseRight = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyB') toggleBuy();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' ||
      e.code === 'Digit4' || e.code === 'Digit5' || e.code === 'Digit6') buyWeapon(WEAPON_ORDER[+e.code.slice(-1) - 1]);
  if (e.code === 'Digit7') buyGrenade();
  if (e.code === 'Escape') hud.hideBuy();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) mouseRight = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) mouseRight = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || !player.alive) return;
  const s = player.ads ? 0.0009 : 0.0021;
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
document.getElementById('play').addEventListener('click', () => {
  audio.init();
  hud.hideMenu();
  canvas.requestPointerLock();
  if (state.phase === 'menu') startMatch();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// --- rounds, spawns, economy ---
function startMatch() {
  state.score = { sen: 0, jac: 0 }; state.round = 1; state.money = 800;
  state.kills = {}; state.deaths = {};
  startBuyPhase();
}
function spawnPositions() {
  return {
    sen: [[-4, 34], [0, 36], [4, 34]],
    jac: [[-6, -36], [0, -38], [6, -36], [2, -33]],
  };
}
function startBuyPhase() {
  state.phase = 'buy'; state.timeLeft = BUY_TIME;
  state.spike = { state: 'carried', site: null, timer: 0, plantedAt: 0 };
  state.spikeCarrier = bots.find((b) => b.team === 'jac');
  const sp = spawnPositions();
  player.pos.set(0, 1.62, 34); player.yaw = 0; player.pitch = 0;
  player.health = 100; player.alive = true; player.reloadT = 0;
  player.mag = WEAPONS[player.weaponId].mag;
  player.reserve = WEAPONS[player.weaponId].reserve;
  bots.forEach((b, i) => {
    const arr = b.team === 'jac' ? sp.jac : sp.sen;
    const p = arr[b.team === 'jac' ? b.idx : b.idx % arr.length];
    b.spawn(p[0], p[1], b.team === 'jac' ? 0 : Math.PI);
  });
  state.roundKills = {};
  hud.setMoney(state.money);
  hud.setScore(state.score.sen, state.score.jac, state.round);
  hud.banner(`ROUND ${state.round}`, state.round === 1 ? 'Buy your gear — B opens the armoury' : 'Buy phase — 15 seconds', 2600);
  if (state.round > 1) audio.radioChatter();
  updateAliveHud();
}
function startCombat() {
  state.phase = 'combat'; state.timeLeft = ROUND_TIME;
  hud.hideBuy();
  hud.msg(state.spikeCarrier ? `${state.spikeCarrier.name} carries the spike — stop the plant!` : '', 4000);
  audio.radioChatter();
}
function endRound(winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.phase = 'roundEnd'; state.timeLeft = 4;
  state.score[winner]++;
  const isPlayerWin = winner === 'sen';
  state.money += isPlayerWin ? ROUND_WIN_REWARD : ROUND_LOSS_REWARD;
  // round MVP: most kills this round
  let mvp = null, mk = -1;
  for (const [n, k] of Object.entries(state.roundKills)) if (k > mk) { mk = k; mvp = n; }
  state.mvp = mvp;
  const title = isPlayerWin ? 'ROUND WON' : 'ROUND LOST';
  const sub = `${reason} · MVP: ${mvp || '—'} (${mk} kills) · +$${isPlayerWin ? ROUND_WIN_REWARD : ROUND_LOSS_REWARD}`;
  hud.banner(title, sub, 3800);
  hud.setScore(state.score.sen, state.score.jac, state.round);
  hud.setMoney(state.money);
  if (state.score.sen >= WIN_ROUNDS || state.score.jac >= WIN_ROUNDS) {
    state.phase = 'matchEnd'; state.timeLeft = 6;
    state.winner = state.score.sen >= WIN_ROUNDS ? 'sen' : 'jac';
    hud.banner(state.winner === 'sen' ? 'VICTORY — AURORA HELD' : 'DEFEAT — STATION LOST',
      `Final ${state.score.sen} — ${state.score.jac} · Sentinels ${state.winner === 'sen' ? 'hold' : 'fall'} at Aurora Station`, 6000);
  }
}
function nextRound() {
  state.round++;
  startBuyPhase();
}
function updateAliveHud() {
  const sen = bots.filter((b) => b.team === 'sen' && b.alive).length + (player.alive ? 1 : 0);
  const jac = bots.filter((b) => b.team === 'jac' && b.alive).length;
  hud.setAlive(sen, 3, jac, 4);
  return { sen, jac };
}
function checkRoundEnd() {
  const { sen, jac } = updateAliveHud();
  if (state.phase !== 'combat') return;
  if (jac === 0) endRound('sen', 'Jackals eliminated');
  else if (sen === 0) endRound('jac', 'Sentinels eliminated');
  else if (state.spike.state === 'defused') endRound('sen', 'Spike defused');
  else if (state.timeLeft <= 0) {
    if (state.spike.state === 'planted') endRound('jac', 'Spike detonated');
    else endRound('sen', 'Time — the plant was stopped');
  }
}
// --- buy menu ---
function buyWeapon(id) {
  if (state.phase !== 'buy') return;
  const w = WEAPONS[id];
  if (state.money < w.price) { hud.msg('Not enough money', 1500); return; }
  if (player.weaponId === id) { hud.msg('Already equipped', 1200); return; }
  state.money -= w.price;
  player.weaponId = id; player.mag = w.mag; player.reserve = w.reserve; player.reloadT = 0;
  hud.setMoney(state.money); hud.setAmmo(player.mag, player.reserve, w.name);
  hud.msg(`${w.name} equipped`, 1500);
}
function buyGrenade() {
  if (state.phase !== 'buy') return;
  if (state.money < GRENADE_PRICE) { hud.msg('Not enough money', 1500); return; }
  state.money -= GRENADE_PRICE; player.grenades++;
  hud.setMoney(state.money); hud.msg('Frag grenade +1', 1500);
}
function toggleBuy() {
  if (state.phase !== 'buy') return;
  const b = document.getElementById('buy');
  if (b.style.display === 'block') hud.hideBuy();
  else hud.showBuy(WEAPON_ORDER.map((id) => ({ name: WEAPONS[id].name, price: WEAPONS[id].price })), state.money);
}
// --- shooting ---
function eyePos() { return new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z); }
function shootDir() {
  const w = WEAPONS[player.weaponId];
  const spreadDeg = (w.spread + player.spreadBloom + (player.moving ? w.moveSpread : 0)) * (player.ads ? 0.35 : 1);
  const s = THREE.MathUtils.degToRad(spreadDeg) * 0.5;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch + player.recoilP, player.yaw + player.recoilY, 0, 'YXZ'));
  dir.x += (Math.random() - 0.5) * s * 2;
  dir.y += (Math.random() - 0.5) * s * 2;
  dir.z += (Math.random() - 0.5) * s * 2;
  return dir.normalize();
}
function wallHit(from, dir, maxDist) {
  // sample the ray against wall AABBs; returns distance to first wall or Infinity
  for (let d = 0.5; d < maxDist; d += 0.5) {
    const x = from.x + dir.x * d, y = from.y + dir.y * d, z = from.z + dir.z * d;
    if (y < 0 || y > 8) continue;
    for (const c of station.colliders) {
      if (c.top > 1.2 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y < c.top) return d;
    }
  }
  return Infinity;
}
function rayHitBot(from, dir, maxDist) {
  let best = null, bestD = maxDist;
  for (const b of bots) {
    if (!b.alive || b.team !== 'jac') continue;
    // head sphere then body sphere
    for (const [cy, r, part] of [[1.78, 0.26, 'head'], [1.15, 0.5, 'body']]) {
      const cx = b.pos.x - from.x, cy2 = cy - from.y, cz = b.pos.z - from.z;
      const t = cx * dir.x + cy2 * dir.y + cz * dir.z;
      if (t < 0 || t > bestD) continue;
      const px = from.x + dir.x * t, py = from.y + dir.y * t, pz = from.z + dir.z * t;
      const dd = Math.hypot(px - b.pos.x, py - cy, pz - b.pos.z);
      if (dd < r) { best = { bot: b, part, dist: t }; bestD = t; }
    }
  }
  return best;
}
function fireWeapon() {
  const w = WEAPONS[player.weaponId];
  if (player.reloadT > 0 || player.fireCd > 0) return;
  if (player.mag <= 0) { audio.dryFire(); startReload(); return; }
  player.fireCd = 60 / w.rpm;
  player.mag--;
  const from = eyePos();
  const muzzlePos = new THREE.Vector3();
  muzzle.getWorldPosition(muzzlePos);
  const pellets = w.pellets || 1;
  let hitAny = false;
  for (let p = 0; p < pellets; p++) {
    const dir = shootDir();
    const wallD = wallHit(from, dir, w.range);
    const hit = rayHitBot(from, dir, w.range);
    const endD = hit && hit.dist < wallD ? hit.dist : Math.min(wallD, w.range);
    const end = from.clone().addScaledVector(dir, endD);
    gun.fireTracer(muzzlePos, end, w.tracer);
    if (hit && hit.dist < wallD) {
      hitAny = true;
      const dmg = w.dmg * (hit.part === 'head' ? HEADSHOT_MULT : 1);
      damageBot(hit.bot, dmg, hit.part, 'YOU');
      gun.blood(new THREE.Vector3(hit.bot.pos.x, hit.part === 'head' ? 1.75 : 1.2, hit.bot.pos.z));
    } else if (wallD < w.range) {
      gun.impact(end, station.surfaceAt(end.x, end.z));
    }
  }
  // recoil: per-weapon pattern, pitch up + alternating yaw, recovers over time
  const kick = w.kick[player.recoilIdx % w.kick.length];
  player.recoilIdx++;
  player.recoilP += THREE.MathUtils.degToRad(kick * (player.ads ? 0.6 : 1));
  player.recoilY += THREE.MathUtils.degToRad((Math.random() - 0.5) * kick * 0.7);
  player.spreadBloom = Math.min(3.5, player.spreadBloom + kick * 0.35);
  gun.muzzleFlash(muzzlePos, new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation));
  const right = new THREE.Vector3(1, 0, 0).applyEuler(camera.rotation);
  gun.ejectCasing(muzzlePos, right);
  audio.shot(player.weaponId === 'polaris' ? 'sniper' : player.weaponId === 'blizzard' ? 'shotgun' : 'rifle',
    station.surfaceAt(player.pos.x, player.pos.z) !== 'snow');
  // every shot is heard: bots within 40 m turn toward it
  for (const b of bots) {
    if (!b.alive) continue;
    if (Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z) < 40) b.hear(player.pos.x, player.pos.z, state.time);
  }
  hud.setAmmo(player.mag, player.reserve, w.name);
  if (hitAny) audio.hit();
}
function startReload() {
  const w = WEAPONS[player.weaponId];
  if (player.reloadT > 0 || player.mag === w.mag || player.reserve <= 0) return;
  player.reloadT = w.reload; audio.reload();
}
function damageBot(bot, dmg, part, byName) {
  bot.health -= dmg;
  if (bot.health <= 0 && bot.alive) {
    bot.die();
    state.kills[byName] = (state.kills[byName] || 0) + 1;
    state.roundKills[byName] = (state.roundKills[byName] || 0) + 1;
    const killer = byName === 'YOU' ? 'YOU' : byName;
    hud.feed(`${killer} ▸ ${bot.name}${part === 'head' ? ' ☠ HEADSHOT' : ''}`, bot.team === 'jac' ? '#ffb08a' : '#7fd4ff');
    if (byName === 'YOU') {
      state.money += KILL_REWARD;
      hud.setMoney(state.money);
      hud.msg(`+$${KILL_REWARD} kill reward`, 1500);
    }
    if (state.spikeCarrier === bot) {
      state.spikeCarrier = bots.find((b) => b.alive && b.team === 'jac') || null;
      if (state.spikeCarrier) hud.msg(`${state.spikeCarrier.name} picked up the spike`, 2500);
    }
    updateAliveHud();
  }
}
function damagePlayer(dmg, fromPos, byName) {
  if (!player.alive) return;
  player.health -= dmg;
  hud.setHealth(player.health);
  const ang = Math.atan2(fromPos.x - player.pos.x, fromPos.z - player.pos.z);
  hud.damageFrom(ang - player.yaw + Math.PI);
  if (player.health <= 0) {
    player.alive = false;
    state.deaths.YOU = (state.deaths.YOU || 0) + 1;
    hud.feed(`${byName} ▸ YOU`, '#ff6b5e');
    hud.banner('YOU ARE DOWN', 'Your team fights on — spectating the round', 2500);
    document.exitPointerLock?.();
    updateAliveHud();
  }
}
function throwGrenade() {
  if (player.grenades <= 0 || state.phase !== 'combat') return;
  player.grenades--;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  gun.throwGrenade(eyePos(), dir, 'YOU');
  audio.beep(false);
}
function explodeAt(p, dmg, radius, owner) {
  audio.explosion();
  const hurt = (pos, hp, apply) => {
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (d < radius) apply(Math.round(dmg * (1 - d / radius) + 20));
  };
  hurt(player.pos, player.health, (d) => { if (player.alive) damagePlayer(d, p, owner); });
  for (const b of bots) if (b.alive) hurt(b.pos, b.health, (d) => damageBot(b, d, 'body', owner));
}
// --- plant / defuse ---
function plantTick(dt) {
  const nearA = Math.hypot(player.pos.x - 0, player.pos.z + 26) < 5;
  const nearB = Math.hypot(player.pos.x - 0, player.pos.z - 26) < 5;
  const site = nearA ? 'A' : nearB ? 'B' : null;
  const carrier = state.spikeCarrier;
  // Jackal carrier plants automatically when it reaches its site
  if (carrier && carrier.alive && state.spike.state === 'carried') {
    const sx = 0, sz = carrier.target?.zone === 'A' ? -26 : carrier.target?.zone === 'B' ? 26 : null;
    if (sz !== null && Math.hypot(carrier.pos.x - sx, carrier.pos.z - sz) < 4) {
      state.spike.timer += dt;
      if (state.spike.timer > PLANT_TIME) {
        state.spike.state = 'planted'; state.spike.site = carrier.target.zone; state.spike.plantedAt = state.time;
        hud.feed(`Spike planted at Site ${state.spike.site}! Defuse it!`, '#ff5a3c');
        hud.banner('SPIKE PLANTED', `Site ${state.spike.site} — defuse before detonation`, 3000);
        audio.beep(true);
      }
    } else state.spike.timer = Math.max(0, state.spike.timer - dt);
  }
  // Player defuses with E near a planted spike
  if (state.spike.state === 'planted' && player.alive && site === state.spike.site && keys.KeyE) {
    state.spike.timer += dt;
    hud.setPlant(state.spike.timer / DEFUSE_TIME, 'DEFUSING… hold E');
    if (Math.floor(state.spike.timer * 2) !== Math.floor((state.spike.timer - dt) * 2)) audio.beep(false);
    if (state.spike.timer >= DEFUSE_TIME) {
      state.spike.state = 'defused'; state.spike.timer = 0;
      hud.setPlant(null);
      endRound('sen', 'Spike defused');
    }
  } else if (state.spike.state === 'planted') {
    state.spike.timer = Math.max(0, state.spike.timer - dt * 0.5);
    hud.setPlant(null);
  } else hud.setPlant(null);
  // planted spike detonates 25 s after planting
  if (state.spike.state === 'planted' && state.time - state.spike.plantedAt > 25) endRound('jac', 'Spike detonated');
}
// --- fixed-step simulation (60 Hz), kept apart from rendering ---
function tick(dt) {
  state.time += dt;
  if (state.phase === 'buy') {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) startCombat();
  } else if (state.phase === 'combat') {
    state.timeLeft -= dt;
    plantTick(dt);
    // storm builds and eases: gusts cut visibility, then the sky clears
    state.storm = Math.max(0, Math.min(1, 0.35 + 0.4 * Math.sin(state.time * 0.05) + 0.25 * Math.sin(state.time * 0.13)));
    state.wind = Math.sin(state.time * 0.11) * (0.4 + state.storm * 0.6);
    audio.setStorm(state.storm);
    if (Math.random() < dt * 0.12) audio.creak();
    if (Math.random() < dt * 0.05) { audio.radioChatter(); hud.msg(pickRadio(), 2600); }
    checkRoundEnd();
  } else if (state.phase === 'roundEnd') {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) nextRound();
  } else if (state.phase === 'matchEnd') {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) { hud.showMenu(); state.phase = 'menu'; }
  }
  if (state.phase === 'combat' || state.phase === 'buy') {
    updatePlayer(dt);
    const world = {
      station, player, bots, spike: state.spike, round: state.round, time: state.time,
      spikeCarrier: state.spikeCarrier,
      onBotShoot: (bot, enemy, hs) => {
        const w = WEAPONS[bot.weaponId];
        const from = bot.headPos();
        const to = enemy === player ? eyePos() : enemy.chestPos();
        const dir = to.clone().sub(from).normalize();
        gun.fireTracer(from, to, w.tracer);
        gun.muzzleFlash(from, dir);
        audio.shot('rifle', station.surfaceAt(bot.pos.x, bot.pos.z) !== 'snow');
        for (const b of bots) if (b.alive && b !== bot) {
          if (Math.hypot(b.pos.x - bot.pos.x, b.pos.z - bot.pos.z) < 40) b.hear(bot.pos.x, bot.pos.z, state.time);
        }
        const dmg = w.dmg * (hs ? HEADSHOT_MULT : 1);
        if (enemy === player) damagePlayer(dmg, bot.pos, bot.name);
        else damageBot(enemy, dmg, hs ? 'head' : 'body', bot.name);
      },
      onBotMiss: (bot, enemy) => {
        const from = bot.headPos();
        const to = (enemy === player ? eyePos() : enemy.chestPos()).clone();
        to.x += (Math.random() - 0.5) * 2; to.y += (Math.random() - 0.5) * 1; to.z += (Math.random() - 0.5) * 2;
        gun.fireTracer(from, to, WEAPONS[bot.weaponId].tracer);
      },
    };
    for (const b of bots) updateBot(b, dt, world);
    // ally bots vs jackals is handled inside updateBot via onBotShoot with enemy bots
  }
  gun.update(dt, (p, dmg, radius, owner) => explodeAt(p, dmg, radius, owner));
  station.update(dt, state.time, state.storm, state.wind);
  hud.tick(dt);
}
const RADIO = [
  'Iris: "Movement mid — two contacts, catwalk side."',
  'Boreal: "Holding B dome. No eyes on the spike."',
  'Iris: "Wind picking up. Visibility dropping."',
  'Boreal: "Reactor Hall clear. Rotating to mid."',
  'Iris: "Hear that? Metal creaking on the west fence."',
];
function pickRadio() { return RADIO[Math.floor(Math.random() * RADIO.length)]; }

function updatePlayer(dt) {
  if (!player.alive) return;
  const w = WEAPONS[player.weaponId];
  player.fireCd -= dt;
  player.spreadBloom = Math.max(0, player.spreadBloom - dt * 4);
  player.recoilP = THREE.MathUtils.damp(player.recoilP, 0, 6, dt);
  player.recoilY = THREE.MathUtils.damp(player.recoilY, 0, 6, dt);
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      const need = w.mag - player.mag, take = Math.min(need, player.reserve);
      player.mag += take; player.reserve -= take;
      hud.setAmmo(player.mag, player.reserve, w.name);
    }
  }
  player.ads = mouseRight && player.reloadT <= 0;
  // --- movement: weight and inertia, stamina, crouch, surface footsteps ---
  const sprint = keys.ShiftLeft && player.stamina > 5 && !player.crouch;
  player.crouch = !!keys.KeyC;
  const speed = player.crouch ? 1.9 : player.ads ? 2.4 : sprint ? 6.4 : 4.6;
  let ix = 0, iz = 0;
  if (keys.KeyW) iz -= 1; if (keys.KeyS) iz += 1;
  if (keys.KeyA) ix -= 1; if (keys.KeyD) ix += 1;
  player.moving = ix !== 0 || iz !== 0;
  const il = Math.hypot(ix, iz) || 1;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const wx = (ix * cos - iz * sin) / il, wz = (ix * sin + iz * cos) / il;
  // acceleration toward the wish velocity — heavy, not instant
  const accel = player.moving ? 26 : 34;
  player.vel.x = THREE.MathUtils.damp(player.vel.x, wx * speed * (player.moving ? 1 : 0), accel / speed, dt);
  player.vel.z = THREE.MathUtils.damp(player.vel.z, wz * speed * (player.moving ? 1 : 0), accel / speed, dt);
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  const [nx, nz] = station.solidAt(player.pos.x, player.pos.z, 0.42);
  player.pos.x = nx; player.pos.z = nz;
  player.pos.x = Math.max(-29, Math.min(29, player.pos.x));
  player.pos.z = Math.max(-39, Math.min(39, player.pos.z));
  player.pos.y = THREE.MathUtils.damp(player.pos.y, player.crouch ? 1.15 : 1.62, 12, dt);
  if (sprint && player.moving) player.stamina = Math.max(0, player.stamina - dt * 22);
  else player.stamina = Math.min(100, player.stamina + dt * 14);
  // footsteps: surface changes the sound; footprints pressed into snow
  const spd = Math.hypot(player.vel.x, player.vel.z);
  if (spd > 1 && state.time - player.lastStep > (sprint ? 0.34 : 0.48)) {
    player.lastStep = state.time;
    const surf = station.surfaceAt(player.pos.x, player.pos.z);
    audio.step(surf, sprint);
    if (surf === 'snow') {
      station.stampFootprint(player.pos.x + player.stepSide * 0.12, player.pos.z, player.yaw);
      player.stepSide *= -1;
    }
  }
  // --- firing (hold for autos) ---
  if (mouseDown && state.phase === 'combat' && (w.auto || mouseDown)) fireWeapon();
  // --- camera: yaw/pitch + recoil + breathing sway ---
  player.swayT += dt * (player.moving ? spd * 1.6 : 1);
  player.breathT += dt * (player.ads ? 2.2 : 1.4);
  const breathe = player.ads ? 0.0016 : 0.0035;
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch + player.recoilP + Math.sin(player.breathT) * breathe,
    player.yaw + player.recoilY, Math.sin(player.swayT * 0.5) * 0.002);
  // viewmodel: sway with movement, breathing, ADS centering, recoil kick, reload dip
  const swayX = Math.sin(player.swayT) * 0.012 * Math.min(1, spd / 4);
  const swayY = Math.abs(Math.cos(player.swayT)) * 0.01 * Math.min(1, spd / 4);
  const adsX = player.ads ? 0 : 0.28, adsY = player.ads ? -0.175 : -0.26;
  const kickZ = player.recoilP * 2.2;
  const reloadDip = player.reloadT > 0 ? -0.16 * Math.sin((1 - player.reloadT / w.reload) * Math.PI) : 0;
  view.position.set(
    THREE.MathUtils.damp(view.position.x, adsX + swayX, 10, dt),
    THREE.MathUtils.damp(view.position.y, adsY + swayY + reloadDip + Math.sin(player.breathT) * 0.004, 10, dt),
    -0.5 + kickZ);
  view.rotation.x = player.recoilP * 1.4;
  const targetFov = player.ads ? 74 / WEAPONS[player.weaponId].ads : 74;
  camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 12, dt);
  camera.updateProjectionMatrix();
  hud.setCrossSpread(player.spreadBloom * 6 + (player.moving ? 4 : 0));
  hud.setTimer(state.timeLeft, state.phase);
}
// --- deterministic ?shot= poses: fixed camera, bots and weather per shot ---
function applyShot(n) {
  state.phase = 'combat'; state.timeLeft = 76; state.time = n * 37;
  hud.hideMenu();
  const sp = spawnPositions();
  bots.forEach((b, i) => {
    const arr = b.team === 'jac' ? sp.jac : sp.sen;
    const p = arr[b.team === 'jac' ? b.idx : b.idx % arr.length];
    b.spawn(p[0], p[1], b.team === 'jac' ? 0 : Math.PI);
  });
  // stage a firefight in front of the camera for each shot
  const stage = (x, z, yaw, list) => {
    player.pos.set(x, 1.62, z); player.yaw = yaw; player.pitch = 0;
    const staged = new Set(list.map((l) => l[0]));
    list.forEach(([bi, bx, bz, byaw]) => { const b = bots[bi]; b.pos.set(bx, 0, bz); b.yaw = byaw; b.mesh.position.copy(b.pos); b.mesh.rotation.y = byaw; });
    // unlisted bots wait at the far north corners, out of the shot's sightline
    bots.forEach((b, i) => {
      if (!staged.has(i)) { b.pos.set(i % 2 ? 24 : -24, 0, -38); b.yaw = 0; b.mesh.position.copy(b.pos); b.mesh.rotation.y = 0; }
    });
  };
  if (n === 1) { // cover: spawn overlook, aurora sky, station lamps, falling snow
    state.storm = 0.25;
    stage(0, 38, 0, [[0, -4, 12, 0.4], [1, 6, 8, -0.4], [4, -6, 20, 0.2]]);
    hud.banner('WHITEOUT', 'AURORA STATION — ROUND 1', 0);
  } else if (n === 2) { // mid combat: tracers + muzzle flash in the connector
    state.storm = 0.6;
    stage(0, 12, 0, [[0, -3, -6, 0.1], [1, 5, -10, -0.2], [4, -5, -2, 0.5], [5, 7, -4, -0.5]]);
    const from = new THREE.Vector3(-3, 1.5, -6);
    gun.fireTracer(from, new THREE.Vector3(0, 1.4, 12), 0xffe9a8);
    gun.muzzleFlash(from, new THREE.Vector3(0, 0, 1));
    gun.blood(new THREE.Vector3(-3, 1.2, -6));
    hud.feed('YOU ▸ Vex ☠ HEADSHOT', '#ffb08a');
    hud.feed('Iris ▸ Rook', '#7fd4ff');
    hud.setHealth(82); player.health = 82;
    hud.setAmmo(22, 90, 'AURORA-5'); player.mag = 22;
  } else if (n === 3) { // Site A reactor hall: core glow, hazard floor, lamp shafts
    state.storm = 0.15;
    stage(6, -18, 0.46, [[2, -4, -28, 0.3], [3, 4, -30, -0.3], [5, -8, -22, 0.6]]);
    hud.setHealth(100); hud.setAmmo(30, 90, 'AURORA-5');
  } else { // Site B comms dome at dusk storm: buy menu open over the scene
    state.storm = 0.9;
    stage(-6, 16, -2.61, [[1, 3, 26, 0.2], [4, -4, 24, -0.4]]);
    state.phase = 'buy'; state.timeLeft = 12;
    hud.showBuy(WEAPON_ORDER.map((id) => ({ name: WEAPONS[id].name, price: WEAPONS[id].price })), state.money);
  }
  hud.setScore(2, 1, 3);
  hud.setMoney(3450);
  updateAliveHud();
  document.body.dataset.ready = 'shot';
}

// --- render loop: fixed-step accumulator, render apart from simulation ---
let last = performance.now(), acc = 0, frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (SHOT) { // screenshot mode: one deterministic step, then hold the frame
    if (frames === 0) { tick(TICK); renderer.render(scene, camera); document.body.dataset.ready = '1'; }
    frames++;
    return;
  }
  acc += dt;
  let steps = 0;
  while (acc >= TICK && steps < 5) { tick(TICK); acc -= TICK; steps++; }
  if (steps === 5) acc = 0;
  if (state.phase === 'menu') {
    // menu backdrop: slow orbit over the station in blue hour
    const t = now * 0.00004;
    camera.position.set(Math.sin(t) * 26, 9 + Math.sin(t * 2) * 2, Math.cos(t) * 26);
    camera.lookAt(0, 2, 0);
    station.update(dt, state.time + now / 1000, 0.3, 0.4);
  }
  renderer.render(scene, camera);
  frames++;
  if (frames === 2) document.body.dataset.ready = '1';
}
if (SHOT) { applyShot(SHOT); }
requestAnimationFrame(loop);
