// ==========================================
// Game Audio Event Bridge
// Maps authoritative game events → the packaged audio engine.
// SINGLE SOURCE OF TRUTH: sound/aviator-audio-demo (1).html
// Sound design lives in GameAudioManager (verbatim port); this module only
// routes authoritative game state to it, with dedup guards so rerenders,
// reconnects and StrictMode double-mounts can never double-fire a sound.
// ==========================================

import { gameAudio } from './GameAudioManager';
import type { GamePhase } from '../shared/types';

let currentPhase: GamePhase = 'WAITING' as GamePhase;
let currentCountdown: number | null = null;
// Round for which the crash sound already fired — one crash sound per round,
// no matter how many times the crash arrives (event + sync path + reconnect).
let crashHandledRound: string | null = null;

// Own cashouts already sonified this round (betId set) — prevents the ack
// path and the broadcast path from both playing for the same bet.
const cashoutsPlayed = new Set<string>();

function debugAudio(event: string, detail?: unknown) {
  if (import.meta.env.DEV) {
    console.log(`[AUDIO_EVENT] ${event}`, detail ?? '');
  }
}

// ---- Phase Transitions (state machine) ----

export function onRoundState(data: {
  phase: GamePhase;
  countdown?: number | null;
  roundId?: string;
}) {
  const previous = currentPhase;
  currentPhase = data.phase;

  if (previous !== currentPhase) {
    debugAudio('PHASE_TRANSITION', { from: previous, to: currentPhase });
    switch (currentPhase) {
      case 'WAITING':
        // Safety net: a new round is about to start, so the previous one has
        // ended. If its crash moment was missed (disconnect during CRASHED),
        // the engine would still be running — stop it so the next flight is
        // clean and startFlight() can actually start a NEW engine.
        if (gameAudio.isFlightActive()) {
          gameAudio.stopFlight();
          debugAudio('SAFETY_STOP', { to: currentPhase });
        }
        break;

      case 'BETTING':
        // New round — reset per-round audio state exactly once
        cashoutsPlayed.clear();
        crashHandledRound = null;
        break;

      case 'FLYING':
        // One continuous engine. Idempotent: a reconnect dropping us
        // mid-flight must NOT restart the running engine.
        if (!gameAudio.isFlightActive()) {
          gameAudio.startFlight();
          debugAudio('FLIGHT_START');
        }
        break;

      case 'CRASHED':
        // Sync path only (reconnect / page loaded after the crash): the live
        // crash moment arrives via onRoundCrashed() from the round:crashed
        // handler, because the server never re-broadcasts round:state with
        // CRASHED in normal play. Guarded → exactly one crash sound.
        handleCrash(data.roundId ?? null);
        break;

      case 'SETTLED':
        // Engine must not continue past the round; stop is idempotent.
        gameAudio.stopFlight();
        break;
    }
  } else if (currentPhase === 'FLYING' && !gameAudio.isFlightActive()) {
    // Same-phase recovery (page loaded mid-round / reconnect after tab sleep):
    // engine missing but round flying — start it once, no launch sweep needed
    // (the package engine has a built-in 2.5s fade-in).
    gameAudio.startFlight();
    debugAudio('FLIGHT_RECOVER');
  }

  // Countdown ticks — user request: countdown is SILENT (no blips). We still
  // track the value so the bookkeeping stays consistent, just no sound.
  if (data.countdown !== null && data.countdown !== undefined) {
    currentCountdown = data.countdown;
  } else if (currentCountdown !== null) {
    currentCountdown = null;
  }
}

// ---- Crash / Settle (authoritative end-of-round moments) ----

/**
 * THE crash moment. Called from the round:crashed socket handler (the server's
 * authoritative crash broadcast) and from the CRASHED sync path above.
 * Sequence: flight engine cut immediately, ~0.3s quiet beat, then the crash
 * pop — the silence makes the impact noticeable instead of colliding with
 * the drone.
 * Per-round guard ⇒ exactly ONE crash sound per round, ever.
 */
export function onRoundCrashed(roundId?: string | null) {
  handleCrash(roundId ?? null);
}

/** Round fully settled — the engine must never continue past the round. */
export function onRoundSettled() {
  gameAudio.stopFlight();
}

function handleCrash(roundId: string | null) {
  if (roundId && crashHandledRound === roundId) return;
  if (roundId) crashHandledRound = roundId;
  // Cut the engine FIRST, then leave a ~0.3s quiet beat before the impact
  // (scheduled inside the manager) so the crash pop actually registers
  // instead of colliding with the drone.
  gameAudio.crashMoment();
  debugAudio('CRASH', roundId ?? '(sync)');
}

// ---- Multiplier Ticks ----

export function onMultiplierTick(multiplier: number) {
  // The package's updateMultiplier drifts the CONTINUOUS engine smoothly —
  // it never restarts it and never adds ticks/beeps (§6/§7).
  gameAudio.updateMultiplier(multiplier);
}

// ---- Bet Events ----

/**
 * Own bet confirmed by the server ack (GameContext placeBet success).
 * Package: setBet() — C5/E5 rising confirmation.
 * Broadcasts for OTHER players' bets are intentionally silent (§7).
 */
export function onBetAccepted() {
  gameAudio.playSetBet();
}

/** Server/local rejection — package: cancelBet() descending tone. */
export function onBetRejected(_reason?: string) {
  gameAudio.playCancelBet();
}

export function onBetCancelled() {
  gameAudio.playCancelBet();
}

// ---- Cashout (§9/§10) ----

export function isCashoutPlayed(betId: string): boolean {
  return cashoutsPlayed.has(betId);
}

/**
 * Manual cashout — called from the server-confirmed ack path only.
 * Package: cashOut() arpeggio, played exactly once per bet.
 */
export function onBetCashedOut(data: { betId: string; multiplier?: number }) {
  if (cashoutsPlayed.has(data.betId)) {
    debugAudio('CASHOUT_DUPLICATE_SKIPPED', data.betId);
    return;
  }
  cashoutsPlayed.add(data.betId);
  gameAudio.playCashout();
  debugAudio('CASHOUT', data.multiplier);
}

/**
 * Auto cashout — same package arpeggio. Called from the broadcast path when
 * the cashed-out bet belongs to the current user and hasn't played yet.
 * (Manual cashouts always play via the ack path above — deduped by betId.)
 */
export function onAutoCashoutTriggered(betId: string, multiplier?: number) {
  if (cashoutsPlayed.has(betId)) {
    debugAudio('AUTOCASHOUT_DUPLICATE_SKIPPED', betId);
    return;
  }
  cashoutsPlayed.add(betId);
  gameAudio.playCashout();
  debugAudio('AUTO_CASHOUT', multiplier);
}

// ---- Loss (§12) ----

/**
 * Called when the round crashes while the current user still had an active
 * (uncashed) bet. The package has no dedicated loss sound and none may be
 * invented (§18) — the crash thud IS the loss moment.
 */
export function onOwnBetLost() {
  // Intentionally silent: crash sound covers it.
}

// ---- Deposit results (reuse package confirmation/cancellation tones) ----

export function onDepositApproved() {
  gameAudio.playSetBet();
}

export function onDepositRejected() {
  gameAudio.playCancelBet();
}

// ---- Local UI errors (failed local validation / network errors) ----

export function onLocalBetError() {
  gameAudio.playCancelBet();
}

export function onLocalCashoutError() {
  gameAudio.playCancelBet();
}

// ---- UI Interactions ----
// User request: control sounds are DISABLED — pressing buttons, opening the
// menu, changing tabs, adjusting the bet stepper or toggling mute stays
// silent. Only game events (bet accepted/rejected, cashout, crash, flight)
// make sound. The package's click blip remains available via playBetClick()
// but nothing routes to it anymore.

export function onButtonClick() {
  // silent (was: playBetClick)
}

export function onButtonHover() {
  // Package has no hover sound — silence (§18).
}

export function onTabSelect() {
  // silent (was: playBetClick)
}

export function onMenuOpen() {
  // silent (was: playBetClick)
}

export function onMenuClose() {
  // silent (was: playBetClick)
}

export function onToggle() {
  // silent (was: playBetClick) — muting/unmuting itself makes no sound
}

export function onBetIncrease() {
  // silent (was: playBetClick)
}

export function onBetDecrease() {
  // silent (was: playBetClick)
}

export function onQuickAmountSelect() {
  // silent (was: playBetClick)
}

export function onAutoEnabled() {
  // silent — control toggle, not a game event
}

export function onAutoDisabled() {
  // silent — control toggle, not a game event
}
