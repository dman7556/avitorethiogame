// ==========================================
// Audio Settings Panel
// Controls for the packaged engine (sound/aviator-audio-demo (1).html):
// master mute, SFX on/off, flight engine on/off + volume, master volume.
// Muted is always honored — the app never forces sound back on (§16).
// ==========================================

import { useState } from 'react';
import { Volume2, VolumeX, Music, Settings } from 'lucide-react';
import { gameAudio } from '../audio/GameAudioManager';
import { AudioEvents } from '../audio';
import type { AudioSettingsState } from '../audio/AudioConfig';

interface AudioSettingsProps {
  onClose: () => void;
}

export default function AudioSettings({ onClose }: AudioSettingsProps) {
  const [settings, setSettings] = useState<AudioSettingsState>(gameAudio.getSettings());

  const update = (partial: Partial<AudioSettingsState>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    if (partial.master !== undefined) gameAudio.setMasterVolume(partial.master);
    if (partial.flight !== undefined) gameAudio.setFlightVolume(partial.flight);
    if (partial.muted !== undefined) gameAudio.toggleMute();
    if (partial.sfxEnabled !== undefined) gameAudio.toggleSfx();
    if (partial.musicEnabled !== undefined) gameAudio.toggleMusic();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-sky-card rounded-2xl border border-sky-border p-5 w-full max-w-sm mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-sky-accent" />
            <h3 className="text-white font-semibold">Audio Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center text-sky-text-secondary hover:text-white text-lg leading-none"
            aria-label="Close audio settings"
          >
            &times;
          </button>
        </div>

        {/* Master Mute */}
        <div className="flex items-center justify-between mb-4 p-3 bg-sky-dark rounded-xl">
          <div className="flex items-center gap-2">
            {settings.muted ? (
              <VolumeX size={18} className="text-sky-red" />
            ) : (
              <Volume2 size={18} className="text-sky-green" />
            )}
            <span className="text-white text-sm font-medium">
              {settings.muted ? 'Muted' : 'Unmuted'}
            </span>
          </div>
          <button
            onClick={() => update({ muted: !settings.muted })}
            className={`tap-expand w-12 h-6 rounded-full transition-colors relative ${
              settings.muted ? 'bg-sky-red/30' : 'bg-sky-green/30'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                settings.muted
                  ? 'left-0.5 bg-sky-red'
                  : 'left-[26px] bg-sky-green'
              }`}
            />
          </button>
        </div>

        {/* SFX Toggle */}
        <div className="flex items-center justify-between mb-3 p-3 bg-sky-dark rounded-xl">
          <div className="flex items-center gap-2">
            <Volume2 size={16} className="text-sky-text-secondary" />
            <span className="text-white text-sm">Sound Effects</span>
          </div>
          <button
            onClick={() => update({ sfxEnabled: !settings.sfxEnabled })}
            className={`tap-expand w-12 h-6 rounded-full transition-colors relative ${
              settings.sfxEnabled ? 'bg-sky-green/30' : 'bg-sky-card-hover'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                settings.sfxEnabled
                  ? 'left-[26px] bg-sky-green'
                  : 'left-0.5 bg-sky-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Music Toggle (flight engine) */}
        <div className="flex items-center justify-between mb-4 p-3 bg-sky-dark rounded-xl">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-sky-text-secondary" />
            <span className="text-white text-sm">Flight Engine</span>
          </div>
          <button
            onClick={() => update({ musicEnabled: !settings.musicEnabled })}
            className={`tap-expand w-12 h-6 rounded-full transition-colors relative ${
              settings.musicEnabled ? 'bg-sky-green/30' : 'bg-sky-card-hover'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                settings.musicEnabled
                  ? 'left-[26px] bg-sky-green'
                  : 'left-0.5 bg-sky-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Volume Sliders */}
        <div className="space-y-3 mb-4">
          <SliderRow
            label="Master Volume"
            value={settings.master}
            onChange={(v) => update({ master: v })}
            disabled={settings.muted}
          />
          <SliderRow
            label="Flight Engine"
            value={settings.flight}
            onChange={(v) => update({ flight: v })}
            disabled={settings.muted || !settings.musicEnabled}
          />
        </div>

        {/* Preview (dev only) — plays the package's own sounds */}
        {import.meta.env.DEV && (
          <div className="border-t border-sky-border pt-3">
            <div className="flex flex-wrap gap-1.5">
              {([
                ['CLICK', () => gameAudio.playBetClick()],
                ['BET', () => AudioEvents.onBetAccepted()],
                ['CASHOUT', () => AudioEvents.onBetCashedOut({ betId: 'dev-preview' })],
                ['FLY ON', () => gameAudio.startFlight()],
                ['FLY OFF', () => gameAudio.stopFlight()],
                ['CRASH', () => gameAudio.crashMoment()],
              ] as const).map(([label, fn]) => (
                <button
                  key={label}
                  onClick={fn}
                  className="min-h-[44px] min-w-[44px] px-2 py-1 rounded bg-sky-dark border border-sky-border text-[10px] text-sky-text-secondary hover:text-white hover:border-sky-accent transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-sky-text-muted font-mono">
              <div>✓ Engine: sound/aviator-audio-demo (1).html</div>
              <div>✓ Master: {Math.round(settings.master * 100)}%</div>
              <div>✓ Flight: {Math.round(settings.flight * 100)}%</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Slider Component ----

function SliderRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span className="text-xs text-sky-text-secondary w-28 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 min-h-[44px] appearance-none bg-transparent cursor-pointer
          [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full
          [&::-webkit-slider-runnable-track]:bg-sky-dark
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
          [&::-webkit-slider-thumb]:mt-[-9px]
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-accent
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sky-card
          [&::-webkit-slider-thumb]:shadow-md"
      />
      <span className="text-xs text-sky-text-muted w-8 text-right font-mono">
        {Math.round(value * 100)}
      </span>
    </div>
  );
}
