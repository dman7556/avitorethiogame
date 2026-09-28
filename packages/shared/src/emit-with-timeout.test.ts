import { describe, it, expect, vi, afterEach } from 'vitest';
import { emitWithTimeout, AckTimeoutError, ACK_TIMEOUT_MS } from './index';

describe('emitWithTimeout (Fix 2: ack timeouts on money-movement emits)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports a sensible default window', () => {
    expect(ACK_TIMEOUT_MS).toBe(8_000);
  });

  it('resolves with the ack response when the ack arrives in time', async () => {
    const p = emitWithTimeout<{ success: boolean }>((ack) => {
      ack({ success: true });
    }, 1000, 'bet:place');

    await expect(p).resolves.toEqual({ success: true });
  });

  it('resolves with a FAILURE ack as a normal (non-timeout) resolution — server rejection is not a timeout', async () => {
    // Server rejections arrive as regular acks; the helper passes them
    // through untouched (GameContext decides how to map them to errors).
    const p = emitWithTimeout<{ success: false; error: string }>((ack) => {
      ack({ success: false, error: 'Insufficient funds' });
    }, 1000, 'bet:place');

    await expect(p).resolves.toEqual({ success: false, error: 'Insufficient funds' });
  });

  it('rejects with AckTimeoutError (code ACK_TIMEOUT) when the ack never arrives', async () => {
    vi.useFakeTimers();
    const p = emitWithTimeout((ack) => {
      // never call ack — simulates a lost ack (disconnect before response)
    }, 1000, 'bet:cashout');

    const expectation = expect(p).rejects.toThrow(/Connection issue/);
    vi.advanceTimersByTime(1001);
    await expectation;

    await p.catch((e) => {
      expect(e).toBeInstanceOf(AckTimeoutError);
      expect(e.code).toBe('ACK_TIMEOUT');
    });
  });

  it('DROPS a late ack that arrives after the timeout fired — no second settlement', async () => {
    vi.useFakeTimers();
    let lateAck: ((response: any) => void) | null = null;
    const p = emitWithTimeout<any>((ack) => {
      lateAck = ack; // the emit registers the callback but the ack comes late
    }, 1000, 'bet:place');

    const expectation = expect(p).rejects.toThrow(AckTimeoutError);
    vi.advanceTimersByTime(1001);
    await expectation;

    // Late ack AFTER the timeout — must be a no-op, never a second settlement
    lateAck!({ success: true, bet: { id: 'late' } });
    await expect(p).rejects.toThrow(AckTimeoutError); // still the timeout rejection
  });

  it('does not fire the timer once the ack already settled the promise', async () => {
    vi.useFakeTimers();
    const p = emitWithTimeout((ack) => ack({ success: true }), 1000, 'bet:place');
    await expect(p).resolves.toEqual({ success: true });

    // Advancing past the timeout after resolution must not throw unhandled
    vi.advanceTimersByTime(5000);
  });

  it('uses the default ACK_TIMEOUT_MS window when no explicit timeout is passed', async () => {
    vi.useFakeTimers();
    const p = emitWithTimeout((_ack) => { /* never acks */ }, undefined, 'bet:cancel');

    const expectation = expect(p).rejects.toThrow(/within 8000ms/);
    vi.advanceTimersByTime(ACK_TIMEOUT_MS + 1);
    await expectation;
  });
});
