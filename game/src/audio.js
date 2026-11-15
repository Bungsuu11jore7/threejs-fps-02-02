// audio.js — all sound is synthesized with WebAudio: no audio files, no network.
// Wind howl, metal creaks, radio chatter, surface-dependent footsteps, gunfire.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.windGain = null; this.muted = false;
    this.stepAlt = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    // A short feedback delay as a cheap hall echo for indoor shots.
    this.echo = this.ctx.createDelay(0.3);
    this.echo.delayTime.value = 0.11;
    this.echoGain = this.ctx.createGain(); this.echoGain.gain.value = 0.22;
    this.echo.connect(this.echoGain); this.echoGain.connect(this.echo);
    this.echo.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.startWind();
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  // --- ambient: looping filtered noise = wind, gain follows storm intensity ---
  startWind() {
    const len = 2 * this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.4;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.05;
    src.connect(lp); lp.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.master);
    src.start();
    this.windSrc = src; this.windFilter = bp;
    // Slow howl LFO on the bandpass frequency.
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
  }
  setStorm(v) { // v 0..1
    if (!this.ctx) return;
    const t = this.now();
    this.windGain.gain.linearRampToValueAtTime(0.04 + v * 0.16, t + 0.8);
    this.windFilter.frequency.linearRampToValueAtTime(600 + v * 900, t + 0.8);
  }
  creak() { // distant metal groan, random in the main loop
    if (!this.ctx || Math.random() > 0.5) return;
    const t = this.now();
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(68 + Math.random() * 40, t);
    o.frequency.linearRampToValueAtTime(48 + Math.random() * 30, t + 1.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.6);
  }
  radioChatter(text) { // short burst of radio squelch + blips; text shown in HUD feed
    if (!this.ctx) return;
    const t = this.now();
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = this.ctx.createOscillator(); o.type = 'square';
      o.frequency.value = 950 + Math.random() * 500;
      const g = this.ctx.createGain();
      const s = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.03, s + 0.015);
      g.gain.linearRampToValueAtTime(0.0001, s + 0.07);
      o.connect(g); g.connect(this.master); o.start(s); o.stop(s + 0.08);
    }
  }
  // --- gunfire: noise crack + low thump, routed partly through the hall echo ---
  shot(kind, indoor) {
    if (!this.ctx) return;
    const t = this.now();
    const dur = kind === 'sniper' ? 0.28 : kind === 'shotgun' ? 0.24 : 0.13;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g = this.ctx.createGain(); g.gain.value = kind === 'sniper' ? 0.5 : 0.34;
    src.connect(hp); hp.connect(g); g.connect(this.master);
    if (indoor) g.connect(this.echo);
    src.start(t);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(kind === 'shotgun' ? 120 : 160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.15);
  }
  dryFire() { if (!this.ctx) return; const t = this.now();
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1400;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.06); }
  reload() { if (!this.ctx) return; const t = this.now();
    [0, 0.25, 0.55].forEach((dt, i) => {
      const o = this.ctx.createOscillator(); o.type = 'square';
      o.frequency.value = i === 2 ? 700 : 420;
      const g = this.ctx.createGain(); const s = t + dt;
      g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.09, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.06);
      o.connect(g); g.connect(this.master); o.start(s); o.stop(s + 0.07); }); }
  // --- footsteps: crunch on snow, ring on metal grating, thud on concrete ---
  step(surface, run) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * 0.09);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = (1 - i / len);
      d[i] = (Math.random() * 2 - 1) * env * (surface === 'snow' ? (0.5 + 0.5 * Math.sin(i * 0.9)) : 1);
    }
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    if (surface === 'snow') { f.type = 'lowpass'; f.frequency.value = 900; }
    else if (surface === 'metal') { f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 2; }
    else { f.type = 'lowpass'; f.frequency.value = 320; }
    const g = this.ctx.createGain(); g.gain.value = run ? 0.16 : 0.1;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    if (surface === 'metal') { // grating ring
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = 1180 + (this.stepAlt = !this.stepAlt ? 90 : -60);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.13);
    }
  }
  beep(final) { if (!this.ctx) return; const t = this.now();
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = final ? 1560 : 980;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.5 : 0.12));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + (final ? 0.55 : 0.14)); }
  explosion() { if (!this.ctx) return; const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * 0.7);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.7;
    src.connect(f); f.connect(g); g.connect(this.master); g.connect(this.echo); src.start(t); }
  hit() { if (!this.ctx) return; const t = this.now();
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2100;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.07); }
  // Suppression crack: the sharp snap of a bullet passing close by — the
  // sound of being pinned down, distinct from a hit or a distant shot.
  crack() { if (!this.ctx) return; const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 1.4;
    const g = this.ctx.createGain(); g.gain.value = 0.22;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); }
}
