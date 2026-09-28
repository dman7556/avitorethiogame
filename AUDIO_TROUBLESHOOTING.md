# 🔧 Audio Troubleshooting Guide

## Problem: No Sound at All

### Step 1: Open Audio Test Page
1. Navigate to: **http://localhost:5173/test-audio.html**
2. This is a simple diagnostic page to test the audio system
3. Click **"Test Basic Tone (440Hz)"**
4. You should hear a clear 1-second beep

**If you hear the test tone** → Audio system works, problem is in the game
**If you don't hear anything** → Continue to Step 2

---

### Step 2: Check Browser Audio Context
On the test page, click **"Check Audio Context Status"**

Look for the output:
```
State: running ✅  (GOOD)
State: suspended ❌ (BAD - needs user interaction)
```

**If state is "suspended":**
- Click anywhere on the page
- Try the test tone again
- Most browsers require a user interaction to enable audio

---

### Step 3: Check Browser Console
1. Press **F12** to open DevTools
2. Go to **Console** tab
3. Look for audio-related messages:

**Good messages (audio working):**
```
[Audio] enable() called
[Audio] Settings loaded: {master: 1, sfx: 1, ...}
[Audio] AudioManager initialized successfully
[Audio] AudioContext state: running
```

**Bad messages (audio NOT working):**
```
Cannot play button-click: initialized=false
Cannot play button-click: audio is muted
AudioContext state: suspended
```

---

### Step 4: Check LocalStorage Settings
On the test page, click **"Check Audio Settings"**

Look for:
```
- Master: 100% ✅
- SFX: 100% ✅
- Muted: NO ✅
```

**If Muted: YES** ❌
- The audio is muted in settings
- Open the game, click the volume icon
- Toggle mute OFF

**If volumes are 0%** ❌
- Open the game audio settings
- Increase Master and SFX sliders to 100%

---

### Step 5: Clear LocalStorage (Reset Settings)
If settings are corrupted:

1. Open browser console (F12)
2. Type: `localStorage.removeItem('skyrush-audio-settings')`
3. Press Enter
4. Refresh the page
5. Click anywhere to enable audio

This will reset all audio settings to maximum volume.

---

## Problem: Some Sounds Work, Others Don't

### Check Which Sounds Work:

**On test page, try each button:**
1. ✅ Test Basic Tone → Works? ___
2. ✅ Button Click → Works? ___
3. ✅ Cashout Sound → Works? ___
4. ✅ Crash Sound → Works? ___
5. ✅ Start Flight Engine → Works? ___

**If basic tone works but game sounds don't:**
- There might be an error in the audio manager
- Check browser console for errors

---

## Problem: Flight Engine Doesn't Start

### Check Console for Flight Messages:

Open browser console and look for:
```
[AUDIO_EVENT] PHASE_TRANSITION {from: 'BETTING', to: 'FLYING'}
[AUDIO_EVENT] FLIGHT_START
[Audio] Flight engine started (premium smooth mode)
```

**If you see these messages but NO sound:**
1. Check if music/flight is enabled:
   - Open audio settings in game
   - Make sure "Music" toggle is ON
   - Flight engine uses the music channel

2. Check flight volume:
   - Flight volume slider should be > 0

3. Try the test page:
   - http://localhost:5173/test-audio.html
   - Click "Start Flight Engine"
   - You should hear a low humming sound

**If you don't see these console messages:**
- The game might not be transitioning to FLYING phase
- Check if rounds are starting properly
- Look for game engine errors in console

---

## Problem: Sounds Are Too Quiet

### Volume has been increased in latest update:

**New default settings:**
- Master: 100% (was 70%)
- SFX: 100% (was 60%)
- Music/Flight: 100% (was 30-65%)

**To apply new settings:**
1. Clear localStorage: `localStorage.removeItem('skyrush-audio-settings')`
2. Refresh page
3. Volumes will reset to maximum

**Or manually adjust in game:**
1. Click volume icon
2. Slide all volumes to 100%
3. Make sure mute is OFF

---

## Problem: Crash/Cashout Sound Not Playing

### Check Event Handlers:

In browser console, when you cashout or crash, you should see:
```
[AUDIO_EVENT] CASHOUT 2.45
[AUDIO_EVENT] CRASH
```

**If you see the event but no sound:**
1. Check that `stopFlight()` isn't blocking the sound
2. Try the test page crash/cashout buttons
3. Check browser console for "Cannot play" messages

**If you don't see the event:**
- The event handler might not be called
- Check GameContext.tsx for errors
- Check if Socket.IO is working

---

## Quickpest Fix: Full Audio Reset

```javascript
// Open browser console (F12) and run:

// 1. Clear saved settings
localStorage.removeItem('skyrush-audio-settings');

// 2. Reload page
location.reload();

// 3. After reload, click anywhere on page to enable audio

// 4. Check audio works
audioManager.play('button-click');
```

---

## Common Issues & Solutions

### Issue: "AudioContext was not allowed to start"
**Solution:** Click anywhere on the page. Browsers require user interaction.

### Issue: All sounds are silent
**Solution:** 
1. Check system volume (Windows/OS volume)
2. Check browser tab isn't muted (right-click tab)
3. Check audio settings in game aren't muted

### Issue: Sounds play but are very quiet
**Solution:**
1. Increase Master volume to 100%
2. Increase SFX volume to 100%
3. Check system volume is up

### Issue: Flight engine doesn't evolve during flight
**Solution:**
- This is expected! Changes are intentionally subtle (600ms smooth ramps)
- The engine should gradually get richer, but changes are imperceptible
- Check console for: `audioManager.updateFlight()` calls

### Issue: Multiple flight engines playing at once
**Solution:**
- This shouldn't happen - guarded by `if (flightActive)`
- Check console for duplicate `FLIGHT_START` messages
- If you see duplicates, report as a bug

---

## Debug Commands (Browser Console)

```javascript
// Check if audio is initialized
audioManager.isFlightActive()

// Get current settings
audioManager.getSettings()

// Test a sound
audioManager.play('button-click')
audioManager.play('cashout')
audioManager.play('crash')

// Test flight engine
audioManager.startFlight()
audioManager.updateFlight(5.0)  // Simulate 5x multiplier
audioManager.stopFlight()

// Check recent audio events
audioManager.getRecentEvents()

// Enable audio (if suspended)
audioManager.enable()

// Get AudioContext state
audioManager.ctx.state  // Should be "running"
```

---

## Still No Sound?

### Final Checklist:
- [ ] System volume is up
- [ ] Browser tab isn't muted
- [ ] Clicked on page to enable audio
- [ ] AudioContext state is "running"
- [ ] Master volume is > 0
- [ ] SFX is enabled
- [ ] Audio isn't muted in game settings
- [ ] Browser console shows no errors
- [ ] Test page (test-audio.html) plays sounds

### If all above are OK and still no sound:

1. **Try a different browser** (Chrome, Firefox, Edge)
2. **Check browser audio permissions** (Settings → Site Settings → Sound)
3. **Restart browser completely**
4. **Check Windows audio mixer** (make sure browser isn't muted)

---

## Report a Bug

If audio still doesn't work after all troubleshooting:

1. Open browser console
2. Copy all error messages
3. Run: `audioManager.getSettings()` and copy output
4. Run: `audioManager.getRecentEvents()` and copy output
5. Note which browser and OS you're using
6. Describe exactly what happens (or doesn't happen)

---

## Recent Changes (This Update)

✅ **Volumes increased:**
- All default volumes set to 100%
- Individual sound volumes increased 2-5x
- Volume hierarchy multipliers increased

✅ **Flight engine integration:**
- `stopFlight()` added to cashout handlers
- `stopFlight()` → `play('cashout')` order fixed

✅ **Debug logging added:**
- AudioManager now logs initialization
- Settings are logged when applied
- `canPlay()` logs why sounds are blocked

✅ **Test page created:**
- http://localhost:5173/test-audio.html
- Simple diagnostic tools
- Direct audio system testing

