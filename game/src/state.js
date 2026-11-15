// state.js — one place for all shared game state, constants, weapons and RNG.
// WHITEOUT — Aurora Station. Original work, written for this entry.
export const WIN_ROUNDS = 5;
export const ROUND_TIME = 100;      // seconds of combat per round
export const BUY_TIME = 15;         // seconds of buy phase
export const PLANT_TIME = 3.2;      // seconds to plant the spike
export const DEFUSE_TIME = 4.5;     // seconds to defuse
export const HEADSHOT_MULT = 2;
export const TICK = 1 / 60;         // fixed-step simulation rate

// Seeded RNG (mulberry32) — deterministic replays and ?shot= screenshots.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Six weapons. recoil = per-shot pitch/yaw kick pattern (degrees), ads = zoom factor.
export const WEAPONS = {
  p9:      { name: 'P9 SIDEARM',    price: 0,    dmg: 26, hs: 2,   rpm: 320, mag: 15, reserve: 45, spread: 1.6, moveSpread: 2.2, range: 55, auto: false, ads: 1.15, kick: [0.55, 0.35, 0.5, 0.3], reload: 1.4, tracer: 0xffd9a0 },
  frost:   { name: 'FROSTBITE SMG', price: 1200, dmg: 22, hs: 2,   rpm: 780, mag: 28, reserve: 84, spread: 2.4, moveSpread: 3.4, range: 42, auto: true,  ads: 1.35, kick: [0.5, 0.62, 0.7, 0.55, 0.8], reload: 1.9, tracer: 0x9fd8ff },
  aurora:  { name: 'AURORA-5',      price: 2700, dmg: 33, hs: 2,   rpm: 600, mag: 30, reserve: 90, spread: 1.1, moveSpread: 2.6, range: 90, auto: true,  ads: 1.6,  kick: [0.7, 0.85, 0.95, 0.8, 1.0, 0.9], reload: 2.3, tracer: 0xffe9a8 },
  longnight:{name:'LONGNIGHT DMR',  price: 3100, dmg: 58, hs: 2,   rpm: 150, mag: 10, reserve: 30, spread: 0.5, moveSpread: 2.0, range: 120, auto: false, ads: 2.1, kick: [1.9, 1.6], reload: 2.8, tracer: 0xffc46b },
  blizzard:{ name: 'BLIZZARD-12',   price: 1700, dmg: 11, hs: 2,   rpm: 75,  mag: 6,  reserve: 24, spread: 5.2, moveSpread: 5.6, range: 22, auto: false, ads: 1.2,  kick: [2.4, 2.2], pellets: 8, reload: 2.9, tracer: 0xffb08a },
  polaris: { name: 'POLARIS BOLT',  price: 4200, dmg: 105, hs: 2,  rpm: 48,  mag: 5,  reserve: 15, spread: 0.15, moveSpread: 2.4, range: 160, auto: false, ads: 3.2, kick: [3.2, 2.8], reload: 3.4, tracer: 0xcfe8ff },
};
export const WEAPON_ORDER = ['p9', 'frost', 'aurora', 'longnight', 'blizzard', 'polaris'];
export const GRENADE_PRICE = 300;
export const KILL_REWARD = 300;
export const ROUND_WIN_REWARD = 3250;
export const ROUND_LOSS_REWARD = 1900;
// Loss-streak bonus (Counter-Strike style): a team that keeps losing earns
// more each round, so a comeback stays possible: 1900 / 2400 / 2900.
export const LOSS_STREAK_BONUS = [0, 500, 1000];
export const PLANT_REWARD = 300;

export function makeState() {
  return {
    phase: 'menu',           // menu | buy | combat | roundEnd | matchEnd
    round: 1,
    score: { sen: 0, jac: 0 },
    money: 800,
    timeLeft: BUY_TIME,
    spike: { state: 'none', site: null, timer: 0, plantedAt: 0 }, // none|carried|planted|defused
    spikeCarrier: null,
    mvp: null,
    roundKills: {},
    kills: {},
    deaths: {},
    lossStreak: 0,           // consecutive rounds the player's team lost (loss bonus)
    feed: [],
    storm: 0,                // 0..1 storm intensity, gusts
    wind: 0,                 // -1..1 wind direction strength
    time: 0,
    seed: 20261115,
    shot: 0,                 // ?shot=N deterministic screenshot pose
    winner: null,
    log: [],
  };
}
