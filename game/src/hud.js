// hud.js — all DOM HUD work lives here: health/ammo/timer/score/money, killfeed,
// damage direction indicator, buy menu, banners and the round-end cinematic text.
export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['health', 'ammo', 'wname', 'timer', 'score', 'money', 'alive', 'feed', 'banner', 'hint', 'dmg', 'msg', 'buy', 'buyrows', 'menu', 'plant', 'plantbar', 'cross']) {
      this.el[id] = document.getElementById(id);
    }
    this.feedLines = [];
    this.dmgTimer = 0;
  }
  setHealth(hp) {
    this.el.health.innerHTML = `HP <b style="color:${hp > 50 ? '#9fe8b0' : hp > 25 ? '#ffb35c' : '#ff6b5e'}">${Math.max(0, Math.ceil(hp))}</b>`;
  }
  setAmmo(mag, reserve, name) {
    this.el.ammo.querySelector('b').textContent = `${mag} / ${reserve}`;
    this.el.wname.textContent = name;
  }
  setTimer(sec, phase) {
    const s = Math.max(0, Math.ceil(sec));
    this.el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.timer.style.color = phase === 'combat' && s <= 10 ? '#ff6b5e' : '#dfe9f2';
  }
  setScore(sen, jac, round) {
    this.el.score.innerHTML = `<span class="sen">SENTINELS ${sen}</span> — <span class="jac">${jac} JACKALS</span> · ROUND ${round}`;
  }
  setMoney(m) { this.el.money.textContent = `$${m}`; }
  setAlive(senAlive, senTotal, jacAlive, jacTotal) {
    this.el.alive.innerHTML = `SENTINELS ${senAlive}/${senTotal} alive<br>JACKALS ${jacAlive}/${jacTotal} alive`;
  }
  setCrossSpread(px) {
    const c = this.el.cross;
    c.style.transform = `translate(-50%,-50%) scale(${1 + px / 26})`;
  }
  feed(text, color) {
    this.feedLines.unshift({ text, color: color || '#dfe9f2', at: Date.now() });
    this.feedLines = this.feedLines.slice(0, 5);
    this.el.feed.innerHTML = this.feedLines.map((l) => `<div style="color:${l.color}">${l.text}</div>`).join('');
  }
  msg(text, ms) {
    this.el.msg.textContent = text;
    if (ms) setTimeout(() => { if (this.el.msg.textContent === text) this.el.msg.textContent = ''; }, ms);
  }
  // Damage direction: a red wedge rotated to the attacker's bearing relative to view yaw.
  damageFrom(angleRad) {
    const d = this.el.dmg;
    d.style.display = 'block';
    d.querySelector('i').style.transform = `rotate(${angleRad}rad)`;
    this.dmgTimer = 0.7;
  }
  tick(dt) {
    if (this.dmgTimer > 0) { this.dmgTimer -= dt; if (this.dmgTimer <= 0) this.el.dmg.style.display = 'none'; }
  }
  banner(title, sub, ms) {
    const b = this.el.banner;
    b.querySelector('h1').textContent = title;
    b.querySelector('p').textContent = sub || '';
    b.style.display = 'block';
    if (ms) setTimeout(() => { b.style.display = 'none'; }, ms);
  }
  hideBanner() { this.el.banner.style.display = 'none'; }
  showBuy(rows, money) {
    this.el.buyrows.innerHTML = rows.map((r, i) =>
      `<div class="row" data-i="${i}"><span><span class="k">${i + 1}</span>${r.name}</span><b>${r.price ? '$' + r.price : 'OWNED'}</b></div>`).join('')
      + `<div class="row" data-i="6"><span><span class="k">7</span>FRAG GRENADE ×1</span><b>$300</b></div>`;
    this.el.buy.style.display = 'block';
    this.setMoney(money);
  }
  hideBuy() { this.el.buy.style.display = 'none'; }
  showMenu() { this.el.menu.style.display = 'flex'; }
  hideMenu() { this.el.menu.style.display = 'none'; }
  setPlant(p, label) { // p 0..1 progress, null = hide
    if (p === null) { this.el.plant.style.display = 'none'; this.el.plantbar.style.display = 'none'; return; }
    this.el.plant.style.display = 'block';
    this.el.plant.textContent = label;
    this.el.plantbar.style.display = 'block';
    this.el.plantbar.querySelector('i').style.width = `${Math.round(p * 100)}%`;
  }
}
