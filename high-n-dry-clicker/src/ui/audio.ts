/**
 * Sound. Synthesised through Web Audio rather than sampled — no asset bytes, no CDN, and the
 * pitch variation the brief asks for ("never the same sample twice in a row") is free.
 *
 * Beds and one-shots:
 *   sizzle   ambient filtered-noise bed under everything, gain tracks production
 *   sear     the tap — layered: a noise transient (meat hitting plate) + a pitched body
 *   till     a purchase confirmation
 *   stinger  crossing a threshold
 */
const CLICK_PITCHES = [196, 208, 220, 233, 247, 262, 277];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sizzleGain: GainNode | null = null;
  private muted = false;
  private lastPitch = -1;
  private ready = false;

  /** Must be called from a user gesture — mobile blocks audio before one. */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      // Ambient sizzle bed: looping noise through a lowpass, gain driven by production.
      const seconds = 2;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.Q.value = 0.4;
      const sizzleGain = ctx.createGain();
      sizzleGain.gain.value = 0;
      source.connect(lp).connect(sizzleGain).connect(master);
      source.start();

      this.ctx = ctx;
      this.master = master;
      this.sizzleGain = sizzleGain;
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.85;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** 0..1 — how busy the kitchen is. Drives the sizzle bed. */
  setBusy(amount: number): void {
    if (!this.sizzleGain) return;
    const target = Math.min(0.06, Math.max(0, amount) * 0.06);
    this.sizzleGain.gain.value = this.muted ? 0 : target;
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    delay = 0,
  ): void {
    if (!this.ready || !this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, peak: number, cutoff: number): void {
    if (!this.ready || !this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.value = peak;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(t);
  }

  /** The tap. Layered and pitch-varied — never the same two in a row. */
  sear(): void {
    let index = Math.floor(Math.random() * CLICK_PITCHES.length);
    if (index === this.lastPitch) index = (index + 1) % CLICK_PITCHES.length;
    this.lastPitch = index;
    const pitch = CLICK_PITCHES[index] as number;
    this.noise(0.07, 0.16, 2600); // meat hitting the plate
    this.tone(pitch * 2, pitch * 3, 0.07, "triangle", 0.13); // body
    this.tone(pitch * 4, pitch * 4, 0.035, "square", 0.03, 0.01); // tick
  }

  till(): void {
    this.tone(660, 880, 0.09, "triangle", 0.18);
    this.tone(880, 1320, 0.13, "triangle", 0.13, 0.06);
    this.noise(0.05, 0.06, 3200);
  }

  stinger(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.16, "triangle", 0.13, i * 0.05));
    this.noise(0.2, 0.05, 1800);
  }
}

export const audio = new GameAudio();
