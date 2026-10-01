import { useState, useEffect } from 'react';
import { Menu, MessageCircle, LogOut, User, Shield, Volume2, VolumeX, ArrowDownToLine, ArrowUpFromLine, LogIn, Wallet, Gift } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useModalHistory } from '../hooks/useModalHistory';
import { useNavigate } from 'react-router-dom';
import { gameAudio } from '../audio/GameAudioManager';
import { AudioEvents } from '../audio';
import AudioSettings from './AudioSettings';
import DepositModal from './DepositModal';
import WithdrawalModal from './WithdrawalModal';

interface HeaderProps {
  onToggleChat: () => void;
}

export default function Header({ onToggleChat }: HeaderProps) {
  const { user, logout, isGuest, isAuthenticated } = useAuth();
  const { balance, available } = useGame();
  const { requireAuth } = useAuthGuard();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(gameAudio.getSettings().muted);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  // #3 (mobile UX): back button/gesture closes these modals instead of leaving the page
  useModalHistory(showDeposit, () => setShowDeposit(false));
  useModalHistory(showWithdraw, () => setShowWithdraw(false));

  // Listen for open-deposit event from InsufficientBalanceModal
  useEffect(() => {
    const handler = () => setShowDeposit(true);
    window.addEventListener('open-deposit', handler);
    return () => window.removeEventListener('open-deposit', handler);
  }, []);

  // Keep the toggle icon in sync if mute changes elsewhere (settings panel)
  useEffect(() => {
    const interval = setInterval(() => {
      setIsMuted(gameAudio.getSettings().muted);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
    <header className="ref-header px-3 py-2.5 relative z-40">
      <div className="flex items-center justify-between">
        {/* Logo — left */}
        <div className="flex items-center flex-shrink-0">
          <span className="ref-logo">Aviator</span>
        </div>

        {/* Right side */}
        <div className="ref-header-actions flex items-center gap-1">
          {isGuest ? (
            <div className="flex items-center">
              {/* Guest-only promo: sign up to claim the welcome bonus —
                  header design language (panel pill, green money accent) */}
              <button
                onClick={() => navigate('/register')}
                className="ref-promo-btn"
                aria-label="Sign up and get 50 birr welcome bonus"
              >
                <Gift size={15} />
                <span>Get 50 Birr</span>
              </button>
            </div>
          ) : (
            <>
              {/* Coin + balance — center-right cluster */}
              <button
                onClick={() => requireAuth(() => navigate('/dashboard'))}
                className="ref-wallet-btn flex items-center gap-2 mr-1"
                aria-label="Open wallet"
              >
                <span className="ref-coin">
                  <Wallet size={13} className="text-[#8a5b00]" fill="#8a5b00" />
                </span>
                <span className="ref-balance-num">
                  {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="ref-balance-cur">ETB</span>
              </button>
            </>
          )}

          {/* Quick sound toggle (§19) — also unlocks AudioContext on tap */}
          <button
            onClick={async () => {
              await gameAudio.unlock();
              const wasMuted = gameAudio.getSettings().muted;
              gameAudio.toggleMute();
              setIsMuted(gameAudio.getSettings().muted);
              // Confirmation click only when unmuting (muted state is silent)
              if (wasMuted && !gameAudio.getSettings().muted) {
                AudioEvents.onToggle();
              }
            }}
            className="ref-icon-btn header-sound-toggle"
            aria-label={isMuted ? 'Sound off' : 'Sound on'}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          <span className="header-sep header-sound-toggle" />

          {/* Deposit + Withdraw — the money-in / money-out pair, sitting
              with the wallet/promo cluster where the balance is, ahead of
              the menu. Both are always present and always labelled on every
              viewport: never collapsed to an icon-only button and never
              hidden by a breakpoint. Chat (whose shortcut Deposit replaced)
              stays reachable from the menu. Withdraw opens the same
              WithdrawalModal the dashboard's Withdraw button uses. */}
          <button
            onClick={() => requireAuth(() => setShowDeposit(true))}
            className="ref-deposit-btn"
            aria-label="Deposit"
          >
            <ArrowDownToLine size={15} className="money-ico" />
            <span className="money-label">Deposit</span>
          </button>
          {/* Withdraw stays authenticated-only, like the menu's Withdraw
              item: guests have no wallet to withdraw from, and the extra
              labelled pill would overflow the 360px guest header. */}
          {!isGuest && (
            <button
              onClick={() => requireAuth(() => setShowWithdraw(true))}
              className="ref-withdraw-btn"
              aria-label="Withdraw"
            >
              <ArrowUpFromLine size={15} className="money-ico" />
              <span className="money-label">Withdraw</span>
            </button>
          )}

          {/* Menu button — far right, the conventional header position */}
          <div className="relative">
            <button
              onClick={() => {
                if (!requireAuth()) return;
              setShowMenu(!showMenu);
              if (showMenu) AudioEvents.onMenuClose();
              else AudioEvents.onMenuOpen();
              }}
              className="ref-icon-btn ref-menu-btn"
              aria-label="Menu"
            >
              <Menu size={22} />
            </button>

            {/* Dropdown */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-52 bg-sky-card border border-sky-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {isAuthenticated && (
                    <div className="px-3 py-2.5 border-b border-sky-border">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-sky-border flex items-center justify-center flex-shrink-0">
                          <User size={14} className="text-sky-text-secondary" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {user?.name}
                          </div>
                          <div className="text-xs text-sky-text-secondary">
                            {user?.role === 'ADMIN' ? 'Admin' : 'Player'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {isGuest && (
                    <div className="px-3 py-2.5 border-b border-sky-border">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-sky-border flex items-center justify-center flex-shrink-0">
                          <User size={14} className="text-sky-text-secondary" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">
                            Guest
                          </div>
                          <div className="text-xs text-sky-text-secondary">
                            Viewing mode
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {isGuest && (
                    <>
                      <button
                        onClick={() => {
                          navigate('/login', { state: { returnTo: '/' } });
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-sky-green hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors border-b border-sky-border"
                      >
                        <LogIn size={14} />
                        Login / Register
                      </button>
                    </>
                  )}

                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => {
                        navigate('/admin');
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2.5 text-left text-sm text-sky-text-secondary hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                    >
                      <Shield size={14} />
                      Admin Dashboard
                    </button>
                  )}
                  
                  {isAuthenticated && (
                    <>
                      <button
                        onClick={() => {
                          navigate('/dashboard');
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-sky-text-secondary hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                      >
                        <Wallet size={14} />
                        Wallet & Account
                      </button>
                      <button
                        onClick={() => {
                          navigate('/dashboard');
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-sky-text-secondary hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                      >
                        <ArrowDownToLine size={14} />
                        Deposit
                      </button>
                      <button
                        onClick={() => {
                          navigate('/dashboard');
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-sky-text-secondary hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                      >
                        <ArrowUpFromLine size={14} />
                        Withdraw
                      </button>
                    </>
                  )}

                  {/* Chat — the only chat entry point now that the header
                      shortcut is a Deposit action, so it is visible at every
                      breakpoint (was sm:hidden) and for guests too. */}
                  <button
                    onClick={() => {
                      requireAuth(onToggleChat);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm text-sky-text-secondary hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                  >
                    <MessageCircle size={14} />
                    Chat
                  </button>

                  <button
                  onClick={() => {
                    const wasMuted = gameAudio.getSettings().muted;
                    gameAudio.toggleMute();
                    setIsMuted(!wasMuted);
                    if (wasMuted) AudioEvents.onToggle();
                  }}
                    className="w-full px-3 py-2.5 text-left text-sm text-sky-text-secondary hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                  >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    Sound: {isMuted ? 'Off' : 'On'}
                  </button>

                  <button
                    onClick={() => {
                      setShowAudioSettings(true);
                      setShowMenu(false);
                      AudioEvents.onMenuOpen();
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm text-sky-text-secondary hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                  >
                    <Volume2 size={14} />
                    Audio Settings
                  </button>
                  
                  {isAuthenticated ? (
                    <button
                      onClick={() => {
                        logout();
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2.5 text-left text-sm text-sky-red hover:bg-sky-card-hover flex items-center gap-2 min-h-[44px] transition-colors"
                    >
                      <LogOut size={14} />
                      Logout
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>

      {/* Audio Settings Modal */}
      {showAudioSettings && (
        <AudioSettings onClose={() => setShowAudioSettings(false)} />
      )}

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDeposit}
        onClose={() => setShowDeposit(false)}
        balance={balance}
      />

      {/* Withdrawal Modal */}
      <WithdrawalModal
        isOpen={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        balance={balance}
        available={available}
      />
    </>
  );
}
