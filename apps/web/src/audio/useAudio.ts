// ==========================================
// useAudio Hook — unlocks audio on first user
// interaction (mobile autoplay policies) and
// exposes the packaged engine's settings API.
// ==========================================

import { useEffect, useCallback } from 'react';
import { gameAudio } from './GameAudioManager';

export function useAudio() {
  // Unlock on first legitimate interaction. { once: true } per listener +
  // idempotent unlock() inside the manager → StrictMode double-mount safe.
  useEffect(() => {
    const handleInteraction = () => {
      void gameAudio.unlock();
    };

    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('touchstart', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // Keep audio engine alive across route changes; flight lifecycle is owned
  // by the authoritative phase events, not by component mount/unmount.
  useEffect(() => {
    return () => gameAudio.stopAll();
  }, []);

  const playClick = useCallback(() => gameAudio.playBetClick(), []);

  return {
    playClick,
    settings: gameAudio.getSettings(),
    setMasterVolume: gameAudio.setMasterVolume.bind(gameAudio),
    setFlightVolume: gameAudio.setFlightVolume.bind(gameAudio),
    toggleMute: gameAudio.toggleMute.bind(gameAudio),
    toggleSfx: gameAudio.toggleSfx.bind(gameAudio),
    toggleMusic: gameAudio.toggleMusic.bind(gameAudio),
  };
}
