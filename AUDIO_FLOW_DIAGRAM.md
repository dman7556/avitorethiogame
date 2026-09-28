# 🎵 Audio Flow Diagram

## Complete Round Lifecycle with Audio

```
┌─────────────────────────────────────────────────────────────────┐
│                          ROUND LIFECYCLE                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   BETTING    │  
│   PHASE      │  🔇 No flight engine
└──────┬───────┘
       │
       │ Countdown: 3, 2, 1...
       │ 🔊 play('countdown-3')
       │ 🔊 play('countdown-2')
       │ 🔊 play('countdown-1')
       │
       ▼
┌──────────────────────────────────────────────┐
│ PHASE TRANSITION: BETTING → FLYING          │
│                                              │
│  ✅ audioManager.play('round-start')        │  🔊 Gentle sweep (200Hz→400Hz)
│  ✅ audioManager.startFlight()              │  🔊 Engine starts (~48Hz hum)
│                                              │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   FLYING     │  🔊 Engine running (continuous)
│   PHASE      │  
└──────┬───────┘
       │
       │ ┌─────────────────────────────────────┐
       │ │ Every multiplier update:            │
       │ │ audioManager.updateFlight(1.45x)   │  🔊 Engine evolves (48Hz→72Hz)
       │ │ audioManager.updateFlight(2.31x)   │  🔊 Gets richer, subtle
       │ │ audioManager.updateFlight(3.89x)   │  🔊 Changes imperceptible
       │ └─────────────────────────────────────┘
       │
       │ Player has 2 options:
       │
       ├─────────────────────┐
       │                     │
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│   CASHOUT    │      │    CRASH     │
└──────┬───────┘      └──────┬───────┘
       │                     │
       │                     │
       ▼                     ▼
┌──────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│ CASHOUT HANDLER                          │  │ CRASH HANDLER                            │
│                                          │  │                                          │
│  ✅ audioManager.stopFlight()           │  │  ✅ audioManager.stopFlight()           │
│      └─> 🔇 Engine stops (40ms fade)    │  │      └─> 🔇 Engine stops (40ms fade)    │
│                                          │  │                                          │
│  ✅ audioManager.play('cashout')        │  │  ✅ audioManager.play('crash')          │
│      └─> 🔊 Two soft tones (C→E)        │  │      └─> 🔊 Impact sound (controlled)   │
│                                          │  │                                          │
│  ✅ setTimeout play('win')              │  │  ✅ play('loss') if player had bet      │
│      └─> 🔊 +300ms positive tone        │  │      └─> 🔊 Soft descending tones       │
│                                          │  │                                          │
└──────────────────────────────────────────┘  └──────────────────────────────────────────┘
       │                     │
       │                     │
       └──────────┬──────────┘
                  │
                  ▼
           ┌──────────────┐
           │   SETTLED    │
           │   PHASE      │  🔇 Silence
           └──────────────┘
                  │
                  ▼
           Back to BETTING...
```

---

## Audio Call Points Summary

### 1. **Round Start (BETTING → FLYING)**
```typescript
// File: apps/web/src/audio/AudioEvents.ts
case 'FLYING':
  if (!audioManager.isFlightActive()) {
    audioManager.play('round-start');    // ✅ Launch sweep
    audioManager.startFlight();          // ✅ Start continuous engine
  }
```

### 2. **During Flight (Multiplier Updates)**
```typescript
// File: apps/web/src/audio/AudioEvents.ts
export function onMultiplierTick(multiplier: number) {
  audioManager.updateFlight(multiplier);  // ✅ Evolve engine intensity
}
```

### 3. **Manual Cashout**
```typescript
// File: apps/web/src/audio/AudioEvents.ts
export function onBetCashedOut(data) {
  audioManager.stopFlight();              // ✅ Stop engine first
  audioManager.play('cashout');           // ✅ Cashout sound
  setTimeout(() => audioManager.play('win'), 300);
}
```

### 4. **Auto Cashout**
```typescript
// File: apps/web/src/audio/AudioEvents.ts
export function onAutoCashoutTriggered(betId, multiplier) {
  audioManager.stopFlight();              // ✅ Stop engine first
  audioManager.play('cashout-auto');      // ✅ Auto-cashout sound
  setTimeout(() => audioManager.play('win'), 300);
}
```

### 5. **Crash**
```typescript
// File: apps/web/src/audio/AudioEvents.ts
case 'CRASHED':
  audioManager.stopFlight();              // ✅ Stop engine first
  audioManager.play('crash');             // ✅ Crash sound
```

---

## Key Design Principles

### ✅ **Symmetry**
- One `startFlight()` per round → One `stopFlight()` per round
- Engine stops **before** outcome sound (crash/cashout)

### ✅ **Idempotency**
- Protected by `if (!audioManager.isFlightActive())` guards
- Safe to call multiple times, only first call takes effect

### ✅ **Deduplication**
- Cashout sounds deduplicated via `cashoutsPlayed` Set
- Prevents double-playing if both ack and broadcast arrive

### ✅ **Recovery**
- Mid-round reconnect handled: starts engine without launch sweep
- Checks `isFlightActive()` before starting

### ✅ **Smooth Evolution**
- `updateFlight()` throttled to 250ms intervals
- All parameter changes use 600ms smooth ramps
- Changes imperceptible to user

---

## Sound Intensity Mapping

```
Multiplier    Engine Freq    Filter Cutoff    Volume    Character
──────────────────────────────────────────────────────────────────
1.00x         48 Hz          280 Hz           0.025     Calm, deep hum
2.00x         54 Hz          440 Hz           0.032     Slight richness
5.00x         62 Hz          720 Hz           0.041     More texture
10.00x        68 Hz          960 Hz           0.050     Full, complex
20.00x+       72 Hz          1200 Hz          0.060     Maximum richness
```

**Note**: Changes are logarithmic and heavily smoothed - user should not consciously notice individual updates.

---

## Testing Endpoints

### Browser Console Commands (for debugging):
```javascript
// Check if flight is active
audioManager.isFlightActive()

// Get current settings
audioManager.getSettings()

// Get recent audio events
audioManager.getRecentEvents()

// Manual control (for testing only)
audioManager.startFlight()
audioManager.updateFlight(5.0)
audioManager.stopFlight()
```

### Expected Console Output:
```
[AUDIO_EVENT] PHASE_TRANSITION {from: 'BETTING', to: 'FLYING'}
[AUDIO_EVENT] FLIGHT_START
[Audio] Flight engine started (premium smooth mode)
[Audio] Flight engine stopped
[AUDIO_EVENT] CRASH
```

---

## ✅ Integration Complete!

All audio calls are now properly integrated into the round lifecycle.
The flight engine starts, evolves, and stops at exactly the right moments.

**Ready for testing!** 🚀🎵
