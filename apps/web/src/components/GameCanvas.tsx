import { useRef, useState, useEffect, useCallback } from 'react';
import { useGame, useTickMultiplier } from '../contexts/GameContext';
import CountdownDisplay from './CountdownDisplay';

const COLORS = {
  bg: '#000000',
  ray: 'rgba(28, 28, 32, 0.55)',
  glowCenter: 'rgba(38, 96, 189, 0.55)',
  glowMid: 'rgba(22, 52, 110, 0.28)',
  glowEdge: 'rgba(0, 0, 0, 0)',
  axisDot: '#4a7fd4',
  curve: '#e0113a',
  curveBright: '#ff2450',
  fillTop: 'rgba(224, 17, 58, 0.45)',
  fillBottom: 'rgba(224, 17, 58, 0.02)',
  plane: '#e0113a',
};

/** The supplied plane artwork, served from /public. */
const PLANE_SPRITE_URL = '/plane-sprite.png';
/** On-canvas width of the plane sprite in px (height follows the aspect ratio). */
const PLANE_SPRITE_WIDTH = 88;

/**
 * The player's aircraft — the supplied red propeller-plane artwork
 * (/plane-sprite.png), used exactly as provided. The PNG sits on a dark
 * smoky background, so on first load we key the background out (keep only
 * the strong red plane pixels) into an offscreen canvas and draw that
 * processed sprite at the curve tip. If the image ever fails to load, the
 * game falls back to the original vector plane below — it must never break
 * the round.
 */
let planeSprite: HTMLCanvasElement | null = null;
let planeSpriteReady = false;

function loadPlaneSprite() {
  const img = new Image();
  img.onload = () => {
    try {
      const sprite = document.createElement('canvas');
      sprite.width = img.naturalWidth;
      sprite.height = img.naturalHeight;
      const sctx = sprite.getContext('2d', { willReadFrequently: true });
      if (!sctx) return;
      sctx.drawImage(img, 0, 0);
      const frame = sctx.getImageData(0, 0, sprite.width, sprite.height);
      const px = frame.data;
      for (let i = 0; i < px.length; i += 4) {
        // keep strongly-red pixels (the plane); drop the gray/black backdrop
        const isPlaneRed =
          px[i] - Math.max(px[i + 1], px[i + 2]) > 50 && px[i] > 110;
        if (!isPlaneRed) px[i + 3] = 0;
      }
      sctx.putImageData(frame, 0, 0);
      planeSprite = sprite;
      planeSpriteReady = true;
    } catch {
      planeSpriteReady = false; // decode/taint failure — use the vector plane
    }
  };
  img.onerror = () => {
    planeSpriteReady = false;
  };
  img.src = PLANE_SPRITE_URL;
}
loadPlaneSprite();

/**
 * How long the "FLEW AWAY!" crash display stays on screen after a crash.
 * The server emits round:crashed and round:settled only milliseconds apart,
 * so without this hold the crash moment is gone before players can read the
 * crash multiplier. Purely presentational — server timing is untouched.
 */
const CRASH_HOLD_MS = 1000;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/**
 * Red propeller plane at the curve tip — side-view cartoon style like the
 * reference art: rounded fuselage, big near wing sweeping down, tailplane,
 * crossed-blade spinning prop at the nose. Original drawing, no proprietary
 * asset.
 * Local coords: +x = flight direction, -y = up. `spinning` animates the prop.
 */
function drawPlane(ctx: CanvasRenderingContext2D, spinning: boolean) {
  ctx.save();
  // the curve tangent already pitches the plane up; keep internal tilt subtle
  ctx.rotate(-0.08);
  // chunky reference proportions
  ctx.scale(1.45, 1.45);

  // ── tailplane — small stabilizer sweeping back-down ──
  ctx.beginPath();
  ctx.moveTo(-10, 0.8);
  ctx.quadraticCurveTo(-13.5, 3, -16, 5.6);
  ctx.quadraticCurveTo(-14.5, 6.6, -13, 6.2);
  ctx.quadraticCurveTo(-11, 3.8, -9.2, 1.8);
  ctx.closePath();
  ctx.fill();

  // ── fuselage — fat rounded cartoon body ──
  ctx.beginPath();
  ctx.moveTo(18, 0.6);
  ctx.quadraticCurveTo(15.5, -3, 9, -3.8);
  ctx.quadraticCurveTo(2, -4.5, -3, -3.6);
  ctx.quadraticCurveTo(-9, -2.6, -13.5, -1.2);
  ctx.quadraticCurveTo(-15.5, 0.4, -13.5, 1.6);
  ctx.quadraticCurveTo(-8, 3, -1, 4);
  ctx.quadraticCurveTo(7, 4.8, 12.5, 3.4);
  ctx.quadraticCurveTo(16.5, 2.4, 18, 0.6);
  ctx.closePath();
  ctx.fill();

  // ── near wing — the big dominant one, sweeping down-back ──
  ctx.beginPath();
  ctx.moveTo(4.5, 1.5);
  ctx.quadraticCurveTo(0, 6.5, -4.5, 13.5);
  ctx.quadraticCurveTo(-7.5, 12, -9, 10.5);
  ctx.quadraticCurveTo(-5.5, 5, -2, 0.8);
  ctx.closePath();
  ctx.fill();

  // ── propeller — spinning crossed blades at the nose ──
  ctx.save();
  ctx.translate(19.5, 0.2);
  const spin = spinning ? Date.now() / 1000 : 0;
  if (spinning) {
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(224, 17, 58, 0.09)';
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(224, 17, 58, 0.95)';
  // two blade pairs in an X; each pair's length pulses as it sweeps
  for (const base of [Math.PI / 4, -Math.PI / 4]) {
    ctx.save();
    ctx.rotate(base);
    const s = spinning ? 0.3 + 0.7 * Math.abs(Math.cos(spin * 24 + base * 3)) : 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.5, 9.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // hub
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const lastPhaseRef = useRef<string>('');

  // The server emits round:crashed and round:settled only milliseconds apart,
  // so the CRASHED phase alone is far too brief to read. Remember the crash
  // moment and keep the crash display on screen for at least CRASH_HOLD_MS,
  // even after the phase has already moved on (SETTLED/WAITING).
  const lastCrashRef = useRef<{ at: number; multiplier: number } | null>(null);
  const [showCrash, setShowCrash] = useState(false);

  const { phase, roundId, startedAt } = useGame();
  const multiplier = useTickMultiplier(); // #8: 20Hz value isolated from the main context

  // Canvas-side hold: the rAF loop reads the ref fresh each frame (no stale
  // closure), so the frozen curve stays visible for the hold window.
  const isCrashHoldActive = () => {
    const crash = lastCrashRef.current;
    return !!crash && Date.now() - crash.at < CRASH_HOLD_MS && phase !== 'FLYING';
  };

  // Track phase changes to reset animation timing.
  // Fix 3 (connection-interruption audit): on a mid-flight reconnect the
  // round:state payload carries the server's flight-start timestamp. Resume
  // the animation clock from THAT moment so the curve position matches the
  // numeric multiplier, instead of restarting from the origin — a restarted
  // curve visually suggests the round is younger (safer) than it is.
  useEffect(() => {
    if (phase === 'FLYING') {
      const flyingStart = startedAt ? new Date(startedAt).getTime() : NaN;
      // Trust the server clock only if it is plausible (not in the future —
      // clock skew guard — and recent enough to be this flight, not a stale
      // payload from a previous round).
      startTimeRef.current =
        Number.isFinite(flyingStart) && flyingStart <= Date.now() && Date.now() - flyingStart < 5 * 60_000
          ? flyingStart
          : Date.now();
      particlesRef.current = [];
    }
    if (phase === 'CRASHED') {
      spawnCrashParticles();
      lastCrashRef.current = { at: Date.now(), multiplier };
      setShowCrash(true);
    } else if (phase === 'FLYING') {
      // New flight — drop any crash display immediately
      lastCrashRef.current = null;
      setShowCrash(false);
    }
    lastPhaseRef.current = phase;
    // deps deliberately exclude `multiplier`: it changes every tick and the
    // FLYING branch resets the animation clock. On crash, React batches
    // setPhase('CRASHED') + setMultiplier(crashPoint) in one render, so the
    // effect already reads the final crash multiplier here. `startedAt` is a
    // deliberate dep: a fresh value on reconnect is exactly what must re-fire
    // this effect (it changes only via round:state).
  }, [phase, roundId, startedAt]);

  // Auto-hide the crash display exactly after the hold window. State-driven
  // so the DOM updates on time — a ref-only check would linger until the next
  // server phase broadcast.
  useEffect(() => {
    if (!showCrash) return;
    const timer = setTimeout(() => setShowCrash(false), CRASH_HOLD_MS);
    return () => clearTimeout(timer);
  }, [showCrash]);

  const spawnCrashParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    const aircraftX = w * 0.85;
    const aircraftY = h * 0.15;

    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      particlesRef.current.push({
        x: aircraftX,
        y: aircraftY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 60 + Math.random() * 40,
        maxLife: 100,
        size: 2 + Math.random() * 4,
        color: Math.random() > 0.5 ? COLORS.curveBright : COLORS.plane,
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    const animate = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Black backdrop
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      // ── Rotating sunburst rays from bottom-left origin ──
      const originX = 0;
      const originY = h;
      const rayCount = 26;
      const time = Date.now() / 1000;
      const rotation = phase === 'FLYING' ? time * 0.06 : 0;
      const baseAngle = Math.atan2(-h, w);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      ctx.translate(originX, originY);
      ctx.rotate(rotation);
      ctx.fillStyle = COLORS.ray;
      for (let i = 0; i < rayCount; i++) {
        const a0 = baseAngle + (i * Math.PI) / rayCount;
        const a1 = a0 + Math.PI / (rayCount * 2.2);
        const radius = Math.hypot(w, h) * 1.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -a0, -a1, true);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // ── Blue radial glow (center-weighted) ──
      const centerX = w * 0.5;
      const centerY = h * 0.45;
      const lightGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, w * 0.75);
      lightGrad.addColorStop(0, COLORS.glowCenter);
      lightGrad.addColorStop(0.55, COLORS.glowMid);
      lightGrad.addColorStop(1, COLORS.glowEdge);
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, w, h);

      // ── Dotted axes (left vertical + bottom horizontal) ──
      const drawDot = (x: number, y: number) => {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.axisDot;
        ctx.fill();
      };
      const dotSpacing = 26;
      for (let y = h - 18; y > 10; y -= dotSpacing) drawDot(12, y);
      for (let x = 24; x < w - 10; x += dotSpacing) drawDot(x, h - 12);

      // ── The curve ──
      // Drawn while flying, while officially crashed, and during the 1s
      // crash-hold window — so the plane doesn't vanish the instant the
      // round settles.
      if (phase === 'FLYING' || phase === 'CRASHED' || isCrashHoldActive()) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const progress = Math.min(elapsed / 10, 1);
        const curveProgress = Math.min(progress * 2, 1);

        const points: { x: number; y: number }[] = [];
        const numPoints = 100;
        const endX = w * Math.min(0.3 + curveProgress * 0.6, 0.9);

        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints;
          const x = t * endX;
          // Curve amplitude compresses with the canvas height so the plane
          // tip stays inside the frame on short (fitted) viewports instead
          // of clipping through the top edge. 65% of height when the box is
          // tall enough (desktop unchanged); below that, headroom for the
          // ~49px-tall sprite above the tip (30px bottom margin + 25px half
          // sprite + 7px rotation/breathing room = 62px reserve).
          const amp = Math.min(h * 0.65, h - 62);
          const curveY = Math.pow(t, 1.5) * amp;
          const y = h - 30 - curveY;
          points.push({ x, y });
        }

        // Red filled region under the curve
        if (points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, h - 30);
          points.forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.lineTo(points[points.length - 1].x, h - 30);
          ctx.closePath();

          const fillGrad = ctx.createLinearGradient(0, h - 30 - h * 0.65, 0, h - 30);
          fillGrad.addColorStop(0, COLORS.fillTop);
          fillGrad.addColorStop(1, COLORS.fillBottom);
          ctx.fillStyle = fillGrad;
          ctx.fill();
        }

        // Curve stroke with red glow
        if (points.length > 1) {
          ctx.shadowColor = COLORS.curveBright;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.strokeStyle = COLORS.curve;
          ctx.lineWidth = 3.5;
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Plane at the tip
          const aircraftPos = points[points.length - 1];
          const prevPos = points[Math.max(0, points.length - 5)];
          const dx = aircraftPos.x - prevPos.x;
          const dy = aircraftPos.y - prevPos.y;
          const angle = Math.atan2(dy, dx);

          // Crash slide-out: during the 1s crash-hold the plane accelerates
          // away to the right (ease-in cubic) and fades near the end, so the
          // crash reads as "it flew off" instead of a hard disappear.
          let slideX = 0;
          let slideAlpha = 1;
          if (isCrashHoldActive() && lastCrashRef.current) {
            const t = Math.min((Date.now() - lastCrashRef.current.at) / CRASH_HOLD_MS, 1);
            slideX = t * t * t * 170;
            slideAlpha = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
          }

          ctx.save();
          ctx.globalAlpha = slideAlpha;
          ctx.translate(aircraftPos.x + slideX, aircraftPos.y);
          if (planeSpriteReady && planeSprite) {
            // Keep the artwork horizontal: the artwork's fuselage axis is
            // internally pitched 17.6° nose-up (measured from its pixels,
            // ≈0.307 rad), so trim +0.26 cancels that, and only a small
            // fraction of the curve tangent is added — the full tangent gets
            // very steep near the top and made the plane near-vertical.
            ctx.rotate(angle * 0.15 + 0.26);
            const spriteH = (planeSprite.height / planeSprite.width) * PLANE_SPRITE_WIDTH;
            ctx.drawImage(planeSprite, -PLANE_SPRITE_WIDTH / 2, -spriteH / 2, PLANE_SPRITE_WIDTH, spriteH);
          } else {
            // Vector fallback while the sprite loads or if it ever fails
            ctx.rotate(angle);
            drawPlane(ctx, phase === 'FLYING');
          }
          ctx.restore();
          ctx.shadowBlur = 0;

          // Engine trail particles while flying
          if (phase === 'FLYING' && Math.random() > 0.3) {
            particlesRef.current.push({
              x: aircraftPos.x - 12 * Math.cos(angle),
              y: aircraftPos.y - 12 * Math.sin(angle),
              vx: -Math.cos(angle) * (1 + Math.random() * 2) + (Math.random() - 0.5),
              vy: -Math.sin(angle) * (1 + Math.random() * 2) + (Math.random() - 0.5),
              life: 20 + Math.random() * 20,
              maxLife: 40,
              size: 1 + Math.random() * 2,
              color: Math.random() > 0.5 ? COLORS.curveBright : 'rgba(255, 255, 255, 0.5)',
            });
          }
        }
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // gravity
        p.life--;

        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0, p.size * alpha), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        return p.life > 0;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
    };
  }, [phase, roundId]);

  return (
    <div className="px-3 pt-1 pb-2">
      <div
        ref={containerRef}
        className="game-canvas-box relative w-full graph-frame"
        style={{ height: 'min(52vw, 300px)', minHeight: 220, containerType: 'size' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Multiplier overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-2">
          {phase === 'FLYING' && (
            <div
              className="multiplier-display text-white font-bold"
              style={{ fontSize: 'clamp(30px, calc((100cqh - 24px) * 0.72), 84px)', lineHeight: 1 }}
            >
              {multiplier.toFixed(2)}x
            </div>
          )}
          {(phase === 'CRASHED' || showCrash) && (
            <div className="text-center">
              <div
                className="multiplier-display crash-flash font-bold"
                style={{ fontSize: 'clamp(26px, calc((100cqh - 44px) * 0.6), 72px)', lineHeight: 1, color: '#ff2450' }}
              >
                {(lastCrashRef.current?.multiplier ?? multiplier).toFixed(2)}x
              </div>
              <div className="text-white/70 text-sm font-semibold mt-1 tracking-wide">
                FLEW AWAY!
              </div>
            </div>
          )}
          {phase === 'BETTING' && (
            <CountdownDisplay
              totalSeconds={10}
              isActive={phase === 'BETTING'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
