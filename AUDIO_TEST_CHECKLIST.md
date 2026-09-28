# 🎵 Audio Integration Test Checklist

## ✅ Servers Running
- **Frontend**: http://localhost:5173/
- **Backend**: http://localhost:4000
- **Status**: Both servers started successfully

---

## 🎮 How to Test the Flight Engine Audio

### **Step 1: Open the Application**
1. Open your browser and go to: **http://localhost:5173/**
2. Make sure your **browser audio is not muted**
3. Click anywhere on the page to **enable audio** (browsers require user interaction)

---

### **Step 2: Test Round Start → Flight Engine Starts**

**What to do:**
- Wait for a new round to begin (countdown 3, 2, 1...)
- Watch for the plane to take off

**What you should hear:**
1. ✅ **Countdown ticks** (3, 2, 1) - soft beeps
2. ✅ **Round start sweep** - gentle rising tone (200Hz → 400Hz)
3. ✅ **Flight engine starts** - continuous humming sound (starts at ~48Hz)
4. ✅ **Engine evolves** - sound gradually becomes richer as multiplier increases

**Check console (F12 → Console):**
```
[AUDIO_EVENT] PHASE_TRANSITION {from: 'BETTING', to: 'FLYING'}
[AUDIO_EVENT] FLIGHT_START
[Audio] Flight engine started (premium smooth mode)
```

---

### **Step 3: Test Flight Engine Evolution**

**What to do:**
- Watch the multiplier increase (1.00x → 2.00x → 5.00x → 10.00x+)

**What you should hear:**
- ✅ **Smooth, subtle changes** - the engine sound gradually becomes richer
- ✅ **No sudden jumps** - changes are imperceptible (600ms smoothing)
- ✅ **Comfortable volume** - quiet and non-fatiguing (0.025 → 0.06 max)

**What you should NOT hear:**
- ❌ No "milestone" chimes at 2x, 5x, 10x (these were removed)
- ❌ No sudden volume spikes
- ❌ No obvious "level-up" sounds

---

### **Step 4: Test Manual Cashout → Flight Engine Stops**

**What to do:**
1. Place a bet during the betting phase
2. Wait for the flight to start
3. Click **CASHOUT** button

**What you should hear (in order):**
1. ✅ **Flight engine stops** (fast fade out ~40ms)
2. ✅ **Cashout sound** - two soft rising tones (C → E)
3. ✅ **Win sound** - plays 300ms after cashout

**Check console:**
```
[AUDIO_EVENT] CASHOUT 2.45
```

**Test this works for:**
- ✅ Manual cashout
- ✅ Auto cashout (set an auto-cashout multiplier)

---

### **Step 5: Test Crash → Flight Engine Stops**

**What to do:**
1. Place a bet but **don't cashout**
2. Wait for the plane to crash

**What you should hear (in order):**
1. ✅ **Flight engine stops** (fast fade ~40ms)
2. ✅ **Crash sound** - controlled impact (tension → thud → texture)
3. ✅ **Loss sound** (if you had an active bet) - soft descending tones

**Check console:**
```
[AUDIO_EVENT] PHASE_TRANSITION {from: 'FLYING', to: 'CRASHED'}
[AUDIO_EVENT] CRASH
[Audio] Flight engine stopped
```

---

### **Step 6: Test Audio Controls**

**What to do:**
1. Open the **Audio Settings** panel (look for volume icon)
2. Test the following controls:

**Controls to test:**
- ✅ **Master Volume** - affects all sounds
- ✅ **SFX Volume** - affects UI sounds (clicks, bets)
- ✅ **Flight Volume** - affects the flight engine specifically
- ✅ **Mute Toggle** - silences everything
- ✅ **Music Toggle** - enables/disables music/flight engine

**Test buttons (in Audio Settings debug panel):**
- ✅ **LAUNCH** - plays round-start + starts flight engine
- ✅ **FLY 3x** - updates flight intensity to 3x
- ✅ **FLY 8x** - updates flight intensity to 8x
- ✅ **CRASH** - stops flight + plays crash sound
- ✅ **CASHOUT** - plays cashout sound

---

## 🔍 Common Issues & Solutions

### Issue: No sound at all
- ❌ **Cause**: Browser audio blocked (needs user interaction)
- ✅ **Fix**: Click anywhere on the page, or check browser audio permissions

### Issue: Flight engine doesn't start
- ❌ **Cause**: Audio not initialized
- ✅ **Fix**: Check console for errors, click on page to enable audio

### Issue: Flight engine continues after cashout
- ❌ **This should NOT happen** - stopFlight() is now called in cashout handlers
- ✅ If this happens, report it as a bug

### Issue: Multiple flight engines playing
- ❌ **This should NOT happen** - guarded by `if (this.flightActive)`
- ✅ If this happens, check for duplicate startFlight() calls

---

## 📊 What Changed (Technical Summary)

### Files Modified:
1. **`apps/web/src/audio/AudioEvents.ts`**
   - Added `stopFlight()` call in `onBetCashedOut()`
   - Added `stopFlight()` call in `onAutoCashoutTriggered()`

### Call Flow:
```
BETTING phase → FLYING phase
  └─> audioManager.startFlight() ✅

FLYING phase (every multiplier update)
  └─> audioManager.updateFlight(multiplier) ✅

FLYING → CRASHED
  └─> audioManager.stopFlight() ✅
  └─> audioManager.play('crash') ✅

Player cashes out
  └─> audioManager.stopFlight() ✅
  └─> audioManager.play('cashout') ✅
```

---

## ✅ Success Criteria

The audio integration is working correctly if:

1. ✅ Flight engine starts **once** when round begins
2. ✅ Flight engine **evolves smoothly** during flight
3. ✅ Flight engine **stops** when you cashout
4. ✅ Flight engine **stops** when plane crashes
5. ✅ Crash sound plays **after** engine stops
6. ✅ Cashout sound plays **after** engine stops
7. ✅ No duplicate sounds or overlapping engines
8. ✅ Volume controls work correctly

---

## 🎯 Next Steps

1. **Open the app**: http://localhost:5173/
2. **Click anywhere** to enable audio
3. **Play a few rounds** and verify the checklist above
4. **Report any issues** you find

**Server is running!** Ready for testing. 🚀
