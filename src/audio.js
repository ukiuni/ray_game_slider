// Tiny synthesized sound effects (no audio files needed)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('slider.muted') === '1';
    } catch {
      /* ignore */
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('slider.muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  ok() {
    return this.ctx && !this.muted;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  noise(dur, vol, freq, q = 1, type = 'lowpass') {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.ctx.destination);
    s.start(t);
    s.stop(t + dur);
  }

  beep(high = false) {
    this.tone(high ? 880 : 520, high ? 0.5 : 0.18, 'square', 0.12);
  }
  jump() {
    this.tone(300, 0.25, 'sine', 0.2, 500);
  }
  splash() {
    this.noise(0.7, 0.5, 1800, 0.7);
  }
  smallSplash() {
    this.noise(0.25, 0.25, 2500, 0.7);
  }
  explode() {
    this.noise(1.2, 0.9, 400, 0.5);
    this.tone(90, 0.8, 'sawtooth', 0.3, -60);
  }
  win() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.18), i * 120));
  }
  lose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.18), i * 160));
  }
}
