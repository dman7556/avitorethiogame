// ==========================================
// Audio settings contract
// The ONLY sound design source is the supplied audio package:
//   sound/aviator-audio-demo (1).html  (AviatorAudioEngine)
// No procedural sounds beyond what that package defines.
// ==========================================

export interface AudioSettingsState {
  master: number;      // 0-1, user output volume (applied after the engine's own limiter)
  flight: number;      // 0-1, flight-engine bus volume
  muted: boolean;      // master mute — never overridden by the app
  sfxEnabled: boolean; // one-shot effects (bet, cancel, cashout, crash)
  musicEnabled: boolean; // continuous flight engine
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettingsState = {
  master: 0.8, // overall level lowered — users found 100% too loud
  flight: 1,
  muted: false,
  sfxEnabled: true,
  musicEnabled: true,
};

export const AUDIO_STORAGE_KEY = 'skyrush-audio-settings';
