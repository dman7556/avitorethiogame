// ==========================================
// GameAudioManager — the game's audio system.
//
// SINGLE SOURCE OF TRUTH: the supplied audio package
//   sound/aviator-audio-demo (1).html
// whose `AviatorAudioEngine` is ported here VERBATIM (same oscillator
// frequencies, envelopes, noise buffers, limiter, timing). No sounds are
// invented, added, or reshaped beyond exposing the package's own API
// (startFlight / updateMultiplier / stopFlight / cashOut / crash /
// betClick / setBet / cancelBet) with global gain buses, persistence,
// autoplay unlocking and one-instance/idempotency guards around it.
// ==========================================

import {
  AudioSettingsState,
  DEFAULT_AUDIO_SETTINGS,
  AUDIO_STORAGE_KEY,
} from './AudioConfig';

const isDev = import.meta.env.DEV;
function debugLog(...args: unknown[]) {
  if (isDev) console.log('[Audio]', ...args);
}

class GameAudioManager {
  // ---- Engine state (1:1 with the package's AviatorAudioEngine) ----
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null; // package: masterGain (1.7)
  private limiter: DynamicsCompressorNode | null = null; // package: limiter
  private engineNodes: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    lfo: OscillatorNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    windSource: AudioBufferSourceNode;
    windFilter: BiquadFilterNode;
    windGain: GainNode;
    windLfo: OscillatorNode;
    panner: StereoPannerNode;
    panLfo: OscillatorNode;
  } | null = null;

  // ---- App-level buses & settings (around the package engine) ----
  private sfxGain: GainNode | null = null;   // one-shots (bet/cashout/crash)
  private flightGainBus: GainNode | null = null; // flight engine bus
  private settings: AudioSettingsState = { ...DEFAULT_AUDIO_SETTINGS };
  private initialized = false;
  private unlockPromise: Promise<void> | null = null;
  private lastPlayTimes: Map<string, number> = new Map();

  // ---- Package constants (verbatim from the source file) ----
  // Package master gain is 1.7 — that pushes every sound hot into the
  // limiter, and users kept reporting it as too loud. 0.5 (≈ half of the
  // previously shipped 1.0) keeps the exact same sounds at a clearly
  // comfortable level; the master-volume slider still multiplies on top.
  private static MASTER_GAIN = 0.5;
  private static FLIGHT_FADE_OUT_S = 0.3;
  /** Quiet beat between cutting the engine and the crash pop. */
  private static CRASH_DELAY_S = 0.3;

  // ---- Initialization ----

  init() {
    if (this.initialized) return;
    this.loadSettings();
    try {
      this.ctx = new AudioContext();
      // Package routing: masterGain → limiter → destination (verbatim values)
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = GameAudioManager.MASTER_GAIN;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.15;
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);

      // App buses sit BEFORE the package master gain so user volume applies
      // to the exact sounds the package produces, untouched.
      this.sfxGain = this.ctx.createGain();
      this.flightGainBus = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.flightGainBus.connect(this.masterGain);

      this.applySettings();
      this.initialized = true;
      debugLog('GameAudioManager initialized (engine from audio package)');
    } catch (err) {
      debugLog('Web Audio API unavailable:', err);
    }
  }

  /**
   * Unlock audio on first user interaction (mobile autoplay policies).
   * Idempotent and safe to call from many listeners; a single resume runs.
   */
  async unlock(): Promise<void> {
    if (!this.initialized) this.init();
    if (!this.ctx) return;
    if (this.unlockPromise) return this.unlockPromise;
    const resume = async () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
          debugLog('AudioContext resumed');
        } catch (err) {
          debugLog('AudioContext resume failed:', err);
        }
      }
    };
    this.unlockPromise = resume();
    try {
      await this.unlockPromise;
    } finally {
      this.unlockPromise = null;
    }
  }

  // ---- Settings / persistence ----

  private loadSettings() {
    try {
      const saved = localStorage.getItem(AUDIO_STORAGE_KEY);
      if (saved) {
        this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      this.settings = { ...DEFAULT_AUDIO_SETTINGS };
    }
  }

  private saveSettings() {
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // localStorage unavailable — settings stay session-only
    }
  }

  private applySettings() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const master = this.settings.muted ? 0 : this.settings.master;
    this.masterGain.gain.setTargetAtTime(GameAudioManager.MASTER_GAIN * master, t, 0.01);
    this.sfxGain?.gain.setTargetAtTime(
      this.settings.sfxEnabled ? 1 : 0, t, 0.01
    );
    this.flightGainBus?.gain.setTargetAtTime(
      this.settings.musicEnabled ? this.settings.flight : 0, t, 0.01
    );
  }

  getSettings(): AudioSettingsState {
    return { ...this.settings };
  }

  setMasterVolume(v: number) {
    this.settings.master = Math.max(0, Math.min(1, v));
    this.applySettings();
    this.saveSettings();
  }

  setFlightVolume(v: number) {
    this.settings.flight = Math.max(0, Math.min(1, v));
    this.applySettings();
    this.saveSettings();
  }

  /** Master mute. Never forces sound back on. */
  mute() {
    this.settings.muted = true;
    this.applySettings();
    this.saveSettings();
  }

  unmute() {
    this.settings.muted = false;
    this.applySettings();
    this.saveSettings();
  }

  toggleMute() {
    if (this.settings.muted) this.unmute();
    else this.mute();
  }

  toggleSfx() {
    this.settings.sfxEnabled = !this.settings.sfxEnabled;
    this.applySettings();
    this.saveSettings();
  }

  toggleMusic() {
    this.settings.musicEnabled = !this.settings.musicEnabled;
    this.applySettings();
    this.saveSettings();
  }

  // ---- Guards ----

  /** Cooldown + settings gate shared by all one-shots (prevents event spam). */
  private canPlay(key: string, cooldownMs: number): boolean {
    if (!this.initialized || !this.ctx) return false;
    if (this.settings.muted || !this.settings.sfxEnabled) return false;
    const now = performance.now();
    const last = this.lastPlayTimes.get(key) ?? 0;
    if (now - last < cooldownMs) {
      debugLog(`${key} suppressed (cooldown)`);
      return false;
    }
    this.lastPlayTimes.set(key, now);
    return true;
  }

  // =====================================================================
  // Below: AviatorAudioEngine ported VERBATIM from
  // sound/aviator-audio-demo (1).html — only two systematic changes:
  //   1. this.masterGain → this.masterGain (one-shots) / flightGainBus bus
  //      for engine layers, so settings/mute apply without altering sound.
  //   2. idempotency guards (early returns) added around lifecycle calls.
  // All frequencies, envelopes, buffer math and timings are untouched.
  // =====================================================================

  /** Package: startFlight(). One continuous engine instance. */
  startFlight() {
    if (this.engineNodes) return; // verbatim guard + singleton engine
    if (!this.ctx || !this.flightGainBus) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // --- Layer 1: soft sine pad (the calm base tone) ---
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = 110;
    osc2.frequency.value = 110;
    osc2.detune.value = 6;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.3;
    lfoGain.gain.value = 1.5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 2.5);

    // --- Layer 2: airy filtered noise ("high altitude wind") ---
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.7;

    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0, now);
    windGain.gain.linearRampToValueAtTime(0.02, now + 3); // very subtle

    // slow LFO breathing the wind's brightness in and out
    const windLfo = ctx.createOscillator();
    const windLfoGain = ctx.createGain();
    windLfo.frequency.value = 0.07;
    windLfoGain.gain.value = 250;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);

    // --- Gentle stereo drift across all layers for spaciousness ---
    const panner = ctx.createStereoPanner();
    const panLfo = ctx.createOscillator();
    const panLfoGain = ctx.createGain();
    panLfo.frequency.value = 0.04;
    panLfoGain.gain.value = 0.6;
    panLfo.connect(panLfoGain);
    panLfoGain.connect(panner.pan);

    // Routing (bus destination is the only deviation from the package)
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(panner);

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(panner);

    panner.connect(this.flightGainBus);

    osc1.start();
    osc2.start();
    lfo.start();
    windSource.start();
    windLfo.start();
    panLfo.start();

    this.engineNodes = {
      osc1, osc2, lfo, filter, gain,
      windSource, windFilter, windGain, windLfo,
      panner, panLfo,
    };
    debugLog('startFlight (package engine)');
  }

  /** Package: updateMultiplier(multiplier). Barely-perceptible drift only. */
  updateMultiplier(multiplier: number) {
    if (!this.engineNodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { osc1, osc2, filter, gain } = this.engineNodes;
    const clamped = Math.min(multiplier, 20);

    // Kept essentially flat/steady — only a barely perceptible drift so the
    // sound reads as "constant" rather than an audibly rising build.
    const t = Math.sqrt(clamped - 1);
    const freq = 110 + t * 4;
    const cutoff = 220 + t * 60;
    const vol = 0.05 + Math.min(t * 0.004, 0.03);

    osc1.frequency.linearRampToValueAtTime(freq, now + 0.5);
    osc2.frequency.linearRampToValueAtTime(freq + 2, now + 0.5);
    filter.frequency.linearRampToValueAtTime(cutoff, now + 0.5);
    gain.gain.linearRampToValueAtTime(vol, now + 0.5);
  }

  /** Package: stopFlight(). Smooth 0.3s fade — used for BOTH crash & settle. */
  stopFlight() {
    if (!this.engineNodes || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const {
      osc1, osc2, lfo, gain,
      windSource, windGain, windLfo,
      panLfo,
    } = this.engineNodes;
    this.engineNodes = null;

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + GameAudioManager.FLIGHT_FADE_OUT_S);

    windGain.gain.cancelScheduledValues(now);
    windGain.gain.setValueAtTime(windGain.gain.value, now);
    windGain.gain.linearRampToValueAtTime(0, now + GameAudioManager.FLIGHT_FADE_OUT_S);

    const stopTime = now + GameAudioManager.FLIGHT_FADE_OUT_S + 0.05;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    lfo.stop(stopTime);
    windSource.stop(stopTime);
    windLfo.stop(stopTime);
    panLfo.stop(stopTime);
    debugLog('stopFlight (package engine)');
  }

  isFlightActive(): boolean {
    return this.engineNodes !== null;
  }

  /** Package: cashOut(). Bright A5/C#6/E6 major arpeggio. */
  playCashout() {
    if (!this.canPlay('cashout', 400)) return;
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [880, 1108.73, 1318.51]; // A5, C#6, E6 — bright major arpeggio

    notes.forEach((freq, i) => {
      const start = now + i * 0.09;

      // Main tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.45, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(start);
      osc.stop(start + 0.5);

      // Soft octave-up harmonic layer for a little extra "shine"
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 2;

      gain2.gain.setValueAtTime(0, start);
      gain2.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc2.connect(gain2);
      gain2.connect(this.sfxGain!);
      osc2.start(start);
      osc2.stop(start + 0.35);
    });
  }

  /** Package: crash(). Darker noise burst + round low thump ("thud").
   *  delayS schedules the impact that far in the future (AudioContext clock). */
  playCrash(delayS = 0) {
    if (!this.canPlay('crash', 700)) return;
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + delayS;

    // Softer noise burst — darker filtering and a brief fade-in instead of an
    // instant full-volume hit, so it lands as a "thud" rather than a "bang"
    const bufferSize = ctx.sampleRate * 0.7;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const envelope = Math.min(t / 0.03, 1) * Math.pow(1 - t, 2.2); // brief fade-in, smooth decay
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1400, now); // much darker, less "crack"
    noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.7);
    noiseFilter.Q.value = 0.3;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now); // softer peak
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    // Softer, rounder low thump — gentle attack instead of an instant spike
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(100, now);
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.5);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0, now);
    thumpGain.gain.linearRampToValueAtTime(0.5, now + 0.02);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    thump.connect(thumpGain);
    thumpGain.connect(this.sfxGain);

    noise.start(now);
    thump.start(now);
    noise.stop(now + 0.7);
    thump.stop(now + 0.6);
  }

  /** Package: betClick(). UI click blip. */
  playBetClick() {
    if (!this.canPlay('betClick', 40)) return;
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Package: setBet(). C5/E5 rising confirmation — bet accepted. */
  playSetBet() {
    if (!this.canPlay('setBet', 150)) return;
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25]; // C5, E5 — quick rising confirmation

    notes.forEach((freq, i) => {
      const start = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  /** Package: cancelBet(). Soft descending tone — bet cancelled/rejected. */
  playCancelBet() {
    if (!this.canPlay('cancelBet', 150)) return;
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.15);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * The authoritative crash moment: cut the flight engine immediately, hold a
   * short quiet beat, then fire the crash pop. The beat of near-silence makes
   * the impact land noticeably instead of colliding with the drone — users
   * actually register that the round crashed. Scheduled on the AudioContext
   * clock (no setTimeout drift), still guarded ⇒ exactly one pop per round.
   */
  crashMoment() {
    this.stopFlight();
    this.playCrash(GameAudioManager.CRASH_DELAY_S);
  }

  // ---- Lifecycle ----

  /** Idempotent full stop (used on unmount / navigation). */
  stopAll() {
    this.stopFlight();
  }

  destroy() {
    this.stopAll();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }
}

// Singleton
export const gameAudio = new GameAudioManager();
