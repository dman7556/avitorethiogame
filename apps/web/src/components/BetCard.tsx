import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Minus, Plus, X, LogIn } from 'lucide-react';
import { GAME_CONSTANTS, BetStatus } from '../shared/types';
import { useGame, useTickMultiplier } from '../contexts/GameContext';
import { useNavigate } from 'react-router-dom';
import { AudioEvents } from '../audio';
import InsufficientBalanceModal from './InsufficientBalanceModal';
import { useModalHistory } from '../hooks/useModalHistory';

// Legibility floor for the auto-shrinking bet amount. A value long enough to
// need less than this is pathological (the field clamps to MAX_BET on blur).
const AMOUNT_FONT_MIN = 9;

interface BetCardProps {
  bet: {
    id: string | null;
    slot: 1 | 2;
    amount: number;
    autoCashout: number | null;
    status: string;
    payout: number | null;
    cashoutMultiplier: number | null;
  };
  canBet: boolean;
  canCashout: boolean;
  balance: number;
  isGuest?: boolean;
  onPlaceBet: (amount: number, autoCashout?: number) => Promise<void>;
  onCashout: () => Promise<void>;
  onCancel?: () => Promise<void>;
  onAmountChange: (amount: number) => void;
  onAutoCashoutChange: (value: number | null) => void;
  onRemove?: () => void;
}

export default function BetCard({
  bet,
  canBet,
  canCashout,
  balance,
  isGuest,
  onPlaceBet,
  onCashout,
  onCancel,
  onAmountChange,
  onAutoCashoutChange,
  onRemove,
}: BetCardProps) {
  const [mode, setMode] = useState<'BET' | 'AUTO'>('BET');
  const [autoBetAmount, setAutoBetAmount] = useState(bet.amount);
  const [autoCashoutVal, setAutoCashoutVal] = useState(2.0);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCashing, setIsCashing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);

  // #3 (mobile UX): back button/gesture closes this modal instead of leaving the page
  useModalHistory(showInsufficientBalanceModal, () => setShowInsufficientBalanceModal(false));
  const [betInputValue, setBetInputValue] = useState(bet.amount.toString());
  const [betInputFocused, setBetInputFocused] = useState(false);
  // Guest amount stays local — guests have no wallet, so context callbacks
  // (wrapped in requireAuth by BettingPanel) must never fire for them.
  const [guestAmount, setGuestAmount] = useState(bet.amount);

  const multiplier = useTickMultiplier(); // #8: 20Hz value isolated from the main context
  const navigate = useNavigate();

  // Format amount: whole numbers without decimals (4), decimals with up to 2 places (4.5, 4.25)
  const formatAmount = (amount: number): string => {
    return amount % 1 === 0 ? amount.toString() : amount.toFixed(2).replace(/\.?0+$/, '');
  };

  // ── Amount input: make the digits fit their box ──────────────────────
  // The stepper's width comes from the flex layout, never from the text, so
  // a long amount (1000, 50000 …) used to overflow the field and scroll the
  // number out of sight. Rather than clip it, measure the box and shrink the
  // type just far enough to keep every digit visible — never above the size
  // the CSS asks for (--amount-font-max), so short amounts are untouched.
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const amountDisplayValue = betInputFocused
    ? betInputValue
    : formatAmount(isGuest ? guestAmount : bet.amount);

  useLayoutEffect(() => {
    const el = amountInputRef.current;
    if (!el) return;

    const fitToBox = () => {
      const cs = getComputedStyle(el);
      const maxSize =
        parseFloat(cs.getPropertyValue('--amount-font-max')) || parseFloat(cs.fontSize) || 16;
      const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const available = el.clientWidth - padding;
      if (available <= 0) return;

      const ctx =
        measureCtxRef.current ??
        (measureCtxRef.current = document.createElement('canvas').getContext('2d'));
      if (!ctx) return;

      // Measure the real string with the real font.
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${maxSize}px ${cs.fontFamily}`;
      const needed = ctx.measureText(el.value || '0').width;

      if (needed <= available) {
        // Fits as-is: defer to the stylesheet.
        el.style.removeProperty('font-size');
        return;
      }

      const size = Math.max(
        AMOUNT_FONT_MIN,
        Math.floor(maxSize * (available / needed) * 10) / 10,
      );
      el.style.setProperty('font-size', `${size}px`, 'important');
    };

    fitToBox();
    const observer = new ResizeObserver(fitToBox);
    observer.observe(el);
    window.addEventListener('resize', fitToBox);
    window.addEventListener('orientationchange', fitToBox);

    // The first measurement can run before the web font has swapped in, and
    // the fallback font's metrics differ — which would leave the size fitted
    // to the wrong font. Re-measure once the real font is ready.
    const fonts = document.fonts;
    let cancelled = false;
    fonts?.ready?.then(() => { if (!cancelled) fitToBox(); }).catch(() => {});
    fonts?.addEventListener?.('loadingdone', fitToBox);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener('resize', fitToBox);
      window.removeEventListener('orientationchange', fitToBox);
      fonts?.removeEventListener?.('loadingdone', fitToBox);
    };
  }, [amountDisplayValue]);

  // Validation helpers for bet input
  const validateBetAmount = (value: number): { isValid: boolean; reason?: string } => {
    if (value < GAME_CONSTANTS.MIN_BET) {
      return { isValid: false, reason: `Minimum bet is ${GAME_CONSTANTS.MIN_BET} ETB` };
    }
    if (value > GAME_CONSTANTS.MAX_BET) {
      return { isValid: false, reason: `Maximum bet is ${GAME_CONSTANTS.MAX_BET.toLocaleString()} ETB` };
    }
    if (value > balance) {
      return { isValid: false, reason: `Insufficient balance` };
    }
    return { isValid: true };
  };

  const handleBetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;

    // Remove leading zeros except single zero
    if (inputValue.startsWith('0') && inputValue.length > 1 && inputValue[1] !== '.') {
      inputValue = inputValue.substring(1);
    }

    // Allow empty, digits, and decimal point
    if (inputValue === '' || /^\d*\.?\d*$/.test(inputValue)) {
      setBetInputValue(inputValue);

      // Update bet amount in real-time if valid
      if (inputValue !== '') {
        const numValue = parseFloat(inputValue);
        if (!isNaN(numValue) && numValue > 0) {
          if (isGuest) {
            setGuestAmount(numValue);
          } else {
            onAmountChange(numValue);
          }
        }
      }
    }
  };

  const handleBetInputBlur = () => {
    setBetInputFocused(false);
    if (isGuest) {
      // Local clamp only — never touch the guarded context callback
      if (betInputValue === '' || betInputValue === '.') {
        setGuestAmount(GAME_CONSTANTS.MIN_BET);
        setBetInputValue(GAME_CONSTANTS.MIN_BET.toString());
      } else {
        let numValue = parseFloat(betInputValue);
        if (isNaN(numValue)) numValue = GAME_CONSTANTS.MIN_BET;
        numValue = Math.max(GAME_CONSTANTS.MIN_BET, Math.min(GAME_CONSTANTS.MAX_BET, numValue));
        setGuestAmount(numValue);
        setBetInputValue(numValue.toString());
      }
      return;
    }
    // Parse and clean up on blur
    if (betInputValue === '' || betInputValue === '.') {
      const defaultAmount = Math.max(GAME_CONSTANTS.MIN_BET, balance > 0 ? Math.min(GAME_CONSTANTS.MIN_BET * 4, balance) : GAME_CONSTANTS.MIN_BET);
      setBetInputValue(defaultAmount.toString());
      onAmountChange(defaultAmount);
    } else {
      let numValue = parseFloat(betInputValue);
      if (isNaN(numValue)) {
        numValue = GAME_CONSTANTS.MIN_BET;
      }
      // Clamp to valid range
      numValue = Math.max(GAME_CONSTANTS.MIN_BET, Math.min(GAME_CONSTANTS.MAX_BET, numValue));
      numValue = Math.min(numValue, balance);
      setBetInputValue(numValue.toString());
      onAmountChange(numValue);
    }
  };

  const getBetValidationState = (): { color: string; hint: string } => {
    const numValue = parseFloat(betInputValue) || 0;
    if (betInputValue === '' || numValue === 0) {
      return { color: '', hint: '' };
    }
    const validation = validateBetAmount(numValue);
    if (!validation.isValid) {
      return { color: 'text-sky-red', hint: validation.reason || '' };
    }
    if (numValue < GAME_CONSTANTS.MIN_BET) {
      return { color: 'text-sky-red', hint: `Minimum ${GAME_CONSTANTS.MIN_BET} ETB` };
    }
    if (numValue > balance) {
      return { color: 'text-sky-red', hint: `Exceeds balance by ${formatAmount(numValue - balance)} ETB` };
    }
    return { color: 'text-sky-text-secondary', hint: `Available: ${formatAmount(balance - numValue)} ETB` };
  };

  const betValidationState = getBetValidationState();
  const betInputNum = parseFloat(betInputValue) || 0;
  const isBetInputValid = betInputNum >= GAME_CONSTANTS.MIN_BET && betInputNum <= balance;

  // Map error codes to user-friendly messages
  const getErrorMessage = (errorText: string, code?: string): string => {
    if (code) {
      switch (code) {
        case 'INSUFFICIENT_BALANCE':
          return 'Insufficient balance';
        case 'BETTING_CLOSED':
          return 'Betting is closed for this round';
        case 'ROUND_NOT_FOUND':
          return 'Round not found';
        case 'INVALID_AMOUNT':
          return 'Invalid bet amount';
        case 'INVALID_SLOT':
          return 'Invalid slot';
        case 'DUPLICATE_BET':
        case 'BET_ALREADY_EXISTS':
          return 'Bet already placed for this slot';
        case 'DUPLICATE_REQUEST':
          return 'Duplicate request detected';
        case 'WALLET_NOT_FOUND':
          return 'Wallet not found';
        case 'ROUND_CRASHED':
          return 'Cannot cancel after round has crashed';
        case 'INVALID_BET_STATE':
          return 'Bet cannot be cancelled';
        case 'BET_NOT_FOUND':
          return 'Bet not found';
        case 'ROUND_NOT_FLYING':
          return 'Cannot cash out — round not in progress';
        default:
          return errorText;
      }
    }
    return errorText;
  };

  // Auto-place bets when round enters BETTING phase and auto mode is enabled
  useEffect(() => {
    if (canBet && mode === 'AUTO' && bet.status === 'IDLE') {
      const timer = setTimeout(() => {
        // Re-check mode inside timeout to prevent stale closure
        if (mode === 'AUTO' && autoBetAmount >= GAME_CONSTANTS.MIN_BET && autoBetAmount <= balance) {
          handlePlaceBet(autoBetAmount, autoCashoutVal);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [canBet, mode, bet.status, autoBetAmount, balance]);

  const handlePlaceBet = async (amount: number, autoCashout?: number) => {
    // Check if user has sufficient balance
    if (amount > balance) {
      setShowInsufficientBalanceModal(true);
      return;
    }

    if (isPlacing) return;
    setIsPlacing(true);
    setError(null);
    try {
      await onPlaceBet(amount, autoCashout);
    } catch (err: any) {
      const friendlyMessage = getErrorMessage(err.message || 'Failed to place bet', err.code);
      setError(friendlyMessage);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsPlacing(false);
    }
  };

  const handleCashout = async () => {
    if (isCashing) return;
    setIsCashing(true);
    setError(null);
    try {
      await onCashout();
    } catch (err: any) {
      const friendlyMessage = getErrorMessage(err.message || 'Failed to cash out', err.code);
      setError(friendlyMessage);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsCashing(false);
    }
  };

  const handleCancel = async () => {
    if (isCancelling || !onCancel) return;
    setIsCancelling(true);
    setError(null);
    try {
      await onCancel();
    } catch (err: any) {
      const friendlyMessage = getErrorMessage(err.message || 'Failed to cancel bet', err.code);
      setError(friendlyMessage);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsCancelling(false);
    }
  };

  const adjustAmount = (delta: number) => {
    if (isGuest) {
      const newAmount = Math.max(GAME_CONSTANTS.MIN_BET, Math.min(GAME_CONSTANTS.MAX_BET, guestAmount + delta));
      const rounded = Math.round(newAmount * 100) / 100;
      setGuestAmount(rounded);
      setBetInputValue(rounded.toString());
      if (delta > 0) AudioEvents.onBetIncrease();
      else AudioEvents.onBetDecrease();
      return;
    }
    const current = bet.amount;
    const newAmount = Math.max(GAME_CONSTANTS.MIN_BET, Math.min(GAME_CONSTANTS.MAX_BET, current + delta));
    onAmountChange(Math.round(newAmount * 100) / 100);
    setBetInputValue((Math.round(newAmount * 100) / 100).toString());
    if (delta > 0) AudioEvents.onBetIncrease();
    else AudioEvents.onBetDecrease();
  };

  const isActive = bet.status === 'PLACED' || bet.status === 'ACTIVE';
  const isQueued = bet.status === 'QUEUED';
  const isCashedOut = bet.status === 'CASHED_OUT';
  const isIdle = bet.status === 'IDLE';
  const isPending = bet.status === 'PENDING' || bet.status === 'PLACED' || isQueued;
  // Only allow placing bet when truly idle (not already pending/queued)
  const canPlaceBet = canBet && (isIdle || bet.status === 'CANCELLED') && !isPending;
  const showCashoutButton = canCashout && isActive;

  const cashoutValue = isCashedOut && bet.payout
    ? bet.payout
    : isActive && multiplier > 1
    ? bet.amount * multiplier
    : 0;

  const goToLogin = () => {
    navigate('/login', { state: { returnTo: '/' } });
  };

  // ─── Shared visual blocks ────────────────────────────────────

  const ModeTabs = (
    <div className="seg-wrap">
      <div className="seg-control">
        <button
          onClick={() => { setMode('BET'); AudioEvents.onTabSelect(); }}
          className={`seg-btn ${mode === 'BET' ? 'active' : ''}`}
        >
          Bet
        </button>
        <button
          onClick={() => { setMode('AUTO'); AudioEvents.onTabSelect(); }}
          className={`seg-btn ${mode === 'AUTO' ? 'active' : ''}`}
        >
          Auto
        </button>
      </div>
    </div>
  );

  const quickAmounts = (v: number) => {
    const finalAmount = isGuest ? v : Math.min(v, balance);
    setBetInputValue(finalAmount.toString());
    if (isGuest) {
      setGuestAmount(finalAmount);
    } else {
      onAmountChange(finalAmount);
    }
    AudioEvents.onQuickAmountSelect();
  };

  const StepperBlock = (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="stepper">
        <button
          onClick={() => adjustAmount(-1)}
          disabled={(isGuest ? guestAmount : bet.amount) <= GAME_CONSTANTS.MIN_BET}
          className="stepper-btn"
          aria-label="Decrease bet amount"
        >
          <Minus size={15} />
        </button>
        <input
          ref={amountInputRef}
          type="text"
          inputMode="decimal"
          value={amountDisplayValue}
          onChange={handleBetInputChange}
          onFocus={() => setBetInputFocused(true)}
          onBlur={handleBetInputBlur}
          className="stepper-amount"
          aria-label="Bet amount"
        />
        <button
          onClick={() => adjustAmount(1)}
          disabled={!isGuest && bet.amount >= Math.min(GAME_CONSTANTS.MAX_BET, balance)}
          className="stepper-btn"
          aria-label="Increase bet amount"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="quick-grid">
        {GAME_CONSTANTS.QUICK_BET_AMOUNTS.map((amount) => (
          <button
            key={amount}
            onClick={() => quickAmounts(amount)}
            disabled={!isGuest && amount > balance}
            className="quick-btn"
          >
            {amount}
          </button>
        ))}
      </div>
      {betValidationState.hint && !isGuest && (
        <div className={`text-[10.5px] leading-tight ${betValidationState.color || 'text-sky-text-secondary'}`}>
          {betValidationState.hint}
        </div>
      )}
    </div>
  );

  const actionLabel = (line1: string, line2: string, extraClass = '') => (
    <>
      <span className="btn-line1">{line1}</span>
      <span className={`btn-line2 ${extraClass}`}>{line2}</span>
    </>
  );

  // ─── GUEST MODE ──────────────────────────────────────────────
  if (isGuest) {
    return (
      <div className="bet-card pt-1 pb-4 px-4 relative">
        {ModeTabs}
        <div className="grid bet-grid gap-3 items-stretch mt-3">
          {StepperBlock}
          <button
            onClick={goToLogin}
            className="action-btn action-bet"
          >
            <LogIn size={18} className="mb-0.5" />
            {actionLabel('BET', `${formatAmount(isGuest ? guestAmount : bet.amount)} ETB`)}
          </button>
        </div>
      </div>
    );
  }

  // ─── AUTHENTICATED MODE ──────────────────────────────────────
  return (
    <div className={`bet-card pt-1 pb-4 px-4 relative ${isCashedOut ? 'border-sky-green/30' : ''} ${bet.status === 'LOST' ? 'border-sky-red/30 opacity-60' : ''}`}>
      {/* Minimize button for bet 2 */}
      {onRemove && isIdle && (
        <button onClick={onRemove} className="card-minimize" aria-label="Remove second bet panel">
          <Minus size={14} />
        </button>
      )}

      {ModeTabs}

      {/* PENDING / QUEUED */}
      {isPending && !showCashoutButton && (
        <div className="mt-3 space-y-2">
          <div className="pending-chip">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#ffc107' }} />
            <span>{isQueued ? 'Queued for next round' : 'Pending'}</span>
            <span className="opacity-50">•</span>
            <span className="font-mono">{formatAmount(bet.amount)} ETB</span>
          </div>
          {/* Only show cancel for PLACED or QUEUED status, not for ACTIVE */}
          {onCancel && (bet.status === 'PLACED' || bet.status === 'QUEUED' || bet.status === 'PENDING') && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="action-btn action-cancel"
              style={{ minHeight: 64 }}
            >
              {isCancelling ? (
                <span className="animate-pulse text-base">Cancelling...</span>
              ) : (
                actionLabel('CANCEL', `${formatAmount(bet.amount)} ETB`)
              )}
            </button>
          )}
        </div>
      )}

      {/* CASHED OUT result */}
      {isCashedOut && (
        <div className="mt-3 text-center py-2">
          <div className="text-sky-green font-bold text-xl font-mono">
            +{formatAmount(bet.payout || 0)} ETB
          </div>
          <div className="text-sky-text-secondary text-xs mt-0.5">
            Cashed out at {bet.cashoutMultiplier?.toFixed(2)}x
          </div>
        </div>
      )}

      {/* CASHOUT button */}
      {showCashoutButton && !isCashedOut && (
        <div className="mt-3">
          <button
            onClick={handleCashout}
            disabled={isCashing}
            className="action-btn action-cashout"
          >
            {isCashing ? (
              <span className="animate-pulse text-base">Cashing out...</span>
            ) : (
              actionLabel('CASH OUT', `${formatAmount(cashoutValue)} ETB`)
            )}
          </button>
        </div>
      )}

      {/* BET CONTROLS — only when idle/cancelled and not pending */}
      {!isPending && !isCashedOut && !showCashoutButton && mode === 'BET' && (
        (isIdle || bet.status === 'CANCELLED') && (
          <div className="grid bet-grid gap-3 items-stretch mt-3">
            {StepperBlock}
            {/* Main action button */}
            {canPlaceBet ? (
              <button
                onClick={() => handlePlaceBet(betInputNum)}
                disabled={isPlacing || !isBetInputValid}
                className="action-btn action-bet"
              >
                {isPlacing ? (
                  <span className="animate-pulse text-base">Placing...</span>
                ) : (
                  actionLabel('BET', `${formatAmount(betInputNum)} ETB`)
                )}
              </button>
            ) : (
              <div className="action-btn action-bet" style={{ opacity: 0.4 }}>
                {actionLabel('BET', `${formatAmount(betInputNum)} ETB`)}
              </div>
            )}
          </div>
        )
      )}

      {/* AUTO CONTROLS — only when idle/cancelled and not pending */}
      {!isPending && !isCashedOut && !showCashoutButton && mode === 'AUTO' && (
        (isIdle || bet.status === 'CANCELLED') && (
          <div className="mt-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-sky-text-secondary mb-1 block">Bet Amount</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={autoBetAmount}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        const numVal = parseFloat(val) || 0;
                        const clamped = Math.max(GAME_CONSTANTS.MIN_BET, Math.min(Math.min(GAME_CONSTANTS.MAX_BET, balance), numVal));
                        setAutoBetAmount(clamped);
                        onAmountChange(clamped);
                      }
                    }}
                    placeholder="Enter amount"
                    className="w-full bg-[#2a2a2e] border border-transparent rounded-lg px-3 py-2.5 pr-10 text-white placeholder-sky-text-muted focus:outline-none text-sm font-mono font-bold"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sky-text-secondary text-[10px] font-semibold">
                    ETB
                  </span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-sky-text-secondary mb-1 block">Auto Cashout</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={autoCashoutVal}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        const numVal = parseFloat(val) || 1.01;
                        const clamped = Math.max(1.01, Math.min(10000, numVal));
                        setAutoCashoutVal(clamped);
                      }
                    }}
                    placeholder="2.0"
                    className="w-full bg-[#2a2a2e] border border-transparent rounded-lg px-3 py-2.5 pr-8 text-white placeholder-sky-text-muted focus:outline-none text-sm font-mono font-bold"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sky-text-secondary text-[10px] font-semibold">
                    x
                  </span>
                </div>
              </div>
            </div>
            <div className="text-[10.5px] text-sky-text-secondary">
              Min bet {GAME_CONSTANTS.MIN_BET} ETB · Auto cashout from 1.01x
            </div>
            <button
              onClick={() => handlePlaceBet(autoBetAmount, autoCashoutVal)}
              disabled={isPlacing || autoBetAmount < GAME_CONSTANTS.MIN_BET || autoBetAmount > balance}
              className="action-btn action-bet"
              style={{ minHeight: 64 }}
            >
              {isPlacing ? (
                <span className="animate-pulse text-base">Placing...</span>
              ) : (
                actionLabel('AUTO BET', `${formatAmount(autoBetAmount)} ETB`)
              )}
            </button>
          </div>
        )
      )}

      {/* Error message */}
      {error && (
        <div className="mt-2 text-sky-red text-xs text-center bg-sky-red/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        isOpen={showInsufficientBalanceModal}
        onClose={() => setShowInsufficientBalanceModal(false)}
        balance={balance}
        required={bet.amount}
      />
    </div>
  );
}
