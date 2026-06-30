/**
 * Tiny Web Audio drum synth for the Patapon-style beat. No samples — every
 * sound is generated on the fly (a noise burst for "pata", a pitch-dropping
 * sine for the "pon" downbeat), so there's nothing to load.
 *
 * Autoplay policy: the AudioContext is created/resumed lazily inside toggle(),
 * which must be called from a user gesture (the 🥁 button click). After that,
 * hit() can be called freely from the render loop.
 */
export class DrumKit {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  enabled = false

  /** Flip sound on/off. Must be called from a user gesture. Returns the new
   * enabled state. */
  async toggle(): Promise<boolean> {
    if (!this.ctx) this.init()
    const ctx = this.ctx
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        /* ignore — some browsers reject if not fully gestured */
      }
    }
    this.enabled = !this.enabled && !!ctx
    return this.enabled
  }

  /** Play one beat. measureBeat 0..2 = light "pata", 3 = the "pon" downbeat. */
  hit(measureBeat: number): void {
    if (!this.enabled || !this.ctx) return
    if (measureBeat === 3) this.pon()
    else this.pata()
  }

  private init(): void {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.value = 0.35
    master.connect(ctx.destination)
    // a short buffer of white noise reused for every snare-ish "pata"
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.ctx = ctx
    this.master = master
    this.noiseBuf = buf
  }

  /** Light off-beat: a snappy filtered noise click. */
  private pata(): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || !this.noiseBuf) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1700
    band.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    src.connect(band).connect(gain).connect(master)
    src.start(t)
    src.stop(t + 0.12)
  }

  /** Downbeat: a low boom — a sine that drops in pitch with a fast decay. */
  private pon(): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(180, t)
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(1, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    osc.connect(gain).connect(master)
    osc.start(t)
    osc.stop(t + 0.32)
  }
}
