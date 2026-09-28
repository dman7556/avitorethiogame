// ==========================================
// Aviator Countdown Display
// Visual 10-second betting countdown
// ==========================================

import { useEffect, useState, useRef } from 'react';

interface CountdownDisplayProps {
  totalSeconds: number;
  isActive: boolean;
}

export default function CountdownDisplay({ totalSeconds, isActive }: CountdownDisplayProps) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevSecondRef = useRef(totalSeconds);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!isActive) {
      setSecondsLeft(totalSeconds);
      return;
    }

    startTimeRef.current = Date.now();
    prevSecondRef.current = totalSeconds;
    setSecondsLeft(totalSeconds);

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const remaining = Math.max(0, totalSeconds - elapsed);
      setSecondsLeft(Math.ceil(remaining));

      // Trigger animation when second changes
      if (Math.ceil(remaining) !== prevSecondRef.current) {
        prevSecondRef.current = Math.ceil(remaining);
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isActive, totalSeconds]);

  if (!isActive) return null;

  const progress = secondsLeft / totalSeconds;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference * (1 - progress);

  // Color changes as countdown progresses
  const getColor = () => {
    if (secondsLeft > 5) return '#00d26a'; // Green - plenty of time
    if (secondsLeft > 2) return '#ffc107'; // Yellow - hurry up
    return '#ff4757'; // Red - last seconds
  };

  const color = getColor();

  return (
    <div className="countdown-scale flex flex-col items-center justify-center">
      {/* Circular progress ring */}
      <div className="relative">
        <svg width="130" height="130" viewBox="0 0 120 120" className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="6"
          />
          {/* Progress ring */}
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s ease',
              filter: `drop-shadow(0 0 8px ${color}40)`,
            }}
          />
        </svg>

        {/* Number in center */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-transform duration-150 ${
            isAnimating ? 'scale-110' : 'scale-100'
          }`}
        >
          <span
            className="text-5xl font-bold font-mono"
            style={{
              color,
              textShadow: `0 0 20px ${color}60`,
              transition: 'color 0.3s ease, text-shadow 0.3s ease',
            }}
          >
            {secondsLeft}
          </span>
        </div>
      </div>

      {/* Label */}
      <div
        className="mt-3 text-sm font-medium"
        style={{
          color,
          transition: 'color 0.3s ease',
        }}
      >
        Next round
      </div>

      {/* Pulse effect in last 3 seconds */}
      {secondsLeft <= 3 && (
        <div
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            border: `2px solid ${color}`,
            opacity: 0.3,
          }}
        />
      )}
    </div>
  );
}
