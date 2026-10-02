// Sons et musique entièrement synthétisés avec la Web Audio API.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicMode = null;
    this.timers = [];
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(comp);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(this.master);
    // Réverbération courte « donjon »
    this.reverb = this.ctx.createConvolver();
    const len = this.ctx.sampleRate * 2.2;
    const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb.buffer = ir;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.3;
    this.reverb.connect(wet).connect(this.master);
    this.sfx.connect(this.reverb);
    this.music.connect(this.reverb);
    const nlen = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, nlen, this.ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  // --- primitives
  tone(freq, dur, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
    const g = c.createGain();
    const vol = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.ff || 1000; f.Q.value = o.q || 1;
      g.connect(f); node = f;
    }
    osc.connect(g);
    node.connect(o.out || this.sfx);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  noise(dur, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const vol = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(o.out || this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    const r = Math.random;
    switch (name) {
      case 'swing': this.noise(0.22, { freq: 500 + r() * 300, to: 2500, q: 2, vol: 0.25, attack: 0.04 }); break;
      case 'heavySwing': this.noise(0.35, { freq: 250, to: 1200, q: 2, vol: 0.35, attack: 0.08 }); break;
      case 'hit':
        this.noise(0.12, { freq: 1800, q: 0.8, vol: 0.4 });
        this.tone(140 + r() * 40, 0.15, { type: 'triangle', to: 60, vol: 0.5 });
        for (let i = 0; i < 3; i++) this.tone(900 + r() * 1500, 0.04, { type: 'square', vol: 0.06, delay: i * 0.025, filter: 'highpass', ff: 800 });
        break;
      case 'clang':
        [1230, 1810, 2630, 3400].forEach(f => this.tone(f * (0.97 + r() * 0.06), 0.5, { type: 'triangle', vol: 0.08 }));
        this.noise(0.08, { freq: 3000, vol: 0.2 });
        break;
      case 'bones':
        for (let i = 0; i < 9; i++) this.noise(0.05, { freq: 1200 + r() * 2500, q: 6, vol: 0.25, delay: i * 0.035 + r() * 0.03 });
        this.tone(90, 0.3, { type: 'sine', to: 40, vol: 0.4 });
        break;
      case 'hurt':
        this.tone(220, 0.25, { type: 'sawtooth', to: 110, vol: 0.18, filter: 'lowpass', ff: 900 });
        this.noise(0.15, { freq: 600, vol: 0.25 });
        break;
      case 'coin':
        this.tone(1568, 0.12, { type: 'square', vol: 0.06 });
        this.tone(2093, 0.25, { type: 'square', vol: 0.06, delay: 0.07 });
        break;
      case 'pickup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.15, delay: i * 0.06 }));
        break;
      case 'legendary':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', vol: 0.15, delay: i * 0.08 }));
        this.noise(1.2, { freq: 4000, to: 9000, q: 0.5, vol: 0.06, attack: 0.3 });
        break;
      case 'chest':
        this.tone(180, 0.5, { type: 'sawtooth', to: 260, vol: 0.08, filter: 'lowpass', ff: 600 });
        this.noise(0.4, { freq: 300, q: 5, vol: 0.15 });
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.4, { type: 'sine', vol: 0.12, delay: 0.35 + i * 0.07 }));
        break;
      case 'potion':
        for (let i = 0; i < 6; i++) this.tone(300 + r() * 500, 0.08, { type: 'sine', to: 900 + r() * 400, vol: 0.12, delay: i * 0.07 });
        [523, 784].forEach((f, i) => this.tone(f, 0.4, { type: 'sine', vol: 0.12, delay: 0.45 + i * 0.1 }));
        break;
      case 'roll': this.noise(0.3, { freq: 300, to: 900, q: 1, vol: 0.2, attack: 0.05 }); break;
      case 'arrow': this.noise(0.25, { freq: 2500, to: 5000, q: 3, vol: 0.12, attack: 0.02 }); this.tone(400, 0.08, { type: 'triangle', vol: 0.1 }); break;
      case 'bow': this.tone(120, 0.12, { type: 'triangle', to: 300, vol: 0.2 }); break;
      case 'gate':
        this.noise(2.0, { freq: 120, q: 1, vol: 0.4, attack: 0.2, filter: 'lowpass' });
        for (let i = 0; i < 10; i++) this.tone(70 + r() * 30, 0.1, { type: 'square', vol: 0.05, delay: i * 0.18, filter: 'lowpass', ff: 400 });
        break;
      case 'roar':
        this.tone(90, 1.4, { type: 'sawtooth', to: 50, vol: 0.3, attack: 0.15, filter: 'lowpass', ff: 700 });
        this.tone(93, 1.4, { type: 'sawtooth', to: 48, vol: 0.25, attack: 0.15, filter: 'lowpass', ff: 600 });
        this.noise(1.3, { freq: 400, q: 0.7, vol: 0.3, attack: 0.2 });
        break;
      case 'slam':
        this.tone(80, 0.7, { type: 'sine', to: 30, vol: 0.8 });
        this.noise(0.6, { freq: 200, q: 0.5, vol: 0.6, filter: 'lowpass' });
        break;
      case 'rise':
        this.noise(1.0, { freq: 150, to: 400, q: 1, vol: 0.2, attack: 0.3, filter: 'lowpass' });
        for (let i = 0; i < 5; i++) this.noise(0.04, { freq: 2000 + r() * 1500, q: 5, vol: 0.12, delay: 0.3 + i * 0.12 });
        break;
      case 'death':
        this.tone(330, 1.5, { type: 'sawtooth', to: 80, vol: 0.15, filter: 'lowpass', ff: 800 });
        this.tone(311, 1.5, { type: 'sawtooth', to: 75, vol: 0.12, filter: 'lowpass', ff: 800 });
        break;
      case 'heart':
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.18, delay: i * 0.1 }));
        break;
      case 'key':
        [1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.12, delay: i * 0.08 }));
        break;
      case 'page': this.noise(0.25, { freq: 3000, q: 0.6, vol: 0.12, attack: 0.05 }); break;
      case 'ui': this.tone(660, 0.08, { type: 'triangle', vol: 0.1 }); break;
      case 'spikes': this.noise(0.15, { freq: 4000, q: 2, vol: 0.12 }); this.tone(1800, 0.1, { type: 'square', vol: 0.03 }); break;
      case 'fire': this.noise(0.6, { freq: 800, to: 300, q: 0.7, vol: 0.2, attack: 0.05 }); break;
      case 'victory':
        [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [784, 0.75], [1047, 0.9]].forEach(([f, d]) => {
          this.tone(f, 0.6, { type: 'triangle', vol: 0.2, delay: d, out: this.music });
          this.tone(f / 2, 0.6, { type: 'sine', vol: 0.15, delay: d, out: this.music });
        });
        break;
    }
  }

  // --- musique
  stopMusic() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.drone) {
      const t = this.ctx.currentTime;
      this.drone.g.gain.setTargetAtTime(0.0001, t, 0.6);
      const d = this.drone;
      setTimeout(() => d.nodes.forEach(n => { try { n.stop(); } catch (e) { /* déjà arrêté */ } }), 3000);
      this.drone = null;
    }
    this.musicMode = null;
  }

  startMusic(mode) {
    if (!this.ctx || this.musicMode === mode) return;
    this.stopMusic();
    this.musicMode = mode;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(mode === 'boss' ? 0.5 : 0.35, c.currentTime, 1.5);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = mode === 'boss' ? 900 : 380;
    lp.connect(g).connect(this.music);
    const nodes = [];
    const base = mode === 'boss' ? 36.7 : 55;
    for (const det of [0, 0.4, -0.3]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = base + det;
      const og = c.createGain(); og.gain.value = 0.08;
      o.connect(og).connect(lp);
      o.start(); nodes.push(o);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = mode === 'boss' ? 300 : 160;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(); nodes.push(lfo);
    this.drone = { g, nodes };

    if (mode === 'ambient') {
      const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
      this.timers.push(setInterval(() => {
        if (Math.random() < 0.55) {
          const f = scale[Math.floor(Math.random() * scale.length)];
          this.tone(f, 3.5, { type: 'sine', vol: 0.05, attack: 0.02, out: this.music });
          this.tone(f * 2.01, 2.5, { type: 'sine', vol: 0.015, out: this.music });
        }
        if (Math.random() < 0.2) this.noise(4, { freq: 300, to: 600, q: 0.6, vol: 0.04, attack: 1.5, out: this.music });
      }, 2200));
    } else if (mode === 'boss') {
      let step = 0;
      const bass = [73.4, 73.4, 87.3, 73.4, 65.4, 73.4, 98, 87.3];
      this.timers.push(setInterval(() => {
        const s = step++ % 16;
        if (s % 4 === 0) this.tone(70, 0.35, { type: 'sine', to: 35, vol: 0.55, out: this.music });
        if (s % 8 === 4) this.noise(0.18, { freq: 1500, q: 0.6, vol: 0.25, out: this.music });
        if (s % 2 === 0) this.tone(bass[(s / 2) % 8], 0.3, { type: 'sawtooth', vol: 0.1, filter: 'lowpass', ff: 500, out: this.music });
        if (s === 0 || s === 8) this.tone(bass[(s / 2) % 8] * 4, 1.2, { type: 'triangle', vol: 0.04, out: this.music });
        this.noise(0.03, { freq: 7000, q: 1, vol: 0.03, out: this.music });
      }, 150));
    }
  }
}
