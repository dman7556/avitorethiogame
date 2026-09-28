import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import DepositModal from '../components/DepositModal';
import WithdrawalModal from '../components/WithdrawalModal';
import { useModalHistory } from '../hooks/useModalHistory';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, User, History } from 'lucide-react';
import { apiUrl } from '../lib/config';

interface UserProfile {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    lastLogin?: string;
  };
  wallet: {
    balance: number;
    reserved: number;
    currency: string;
  };
  statistics: {
    totalDeposits: number;
    totalWithdrawals: number;
    totalBets: number;
    totalWagered: number;
    totalWinnings: number;
    totalLosses: number;
    netProfit: number;
  };
}

interface Deposit {
  id: string;
  amount: number;
  paymentMethod: string;
  status: string;
  rejectionReason?: string;
  createdAt: string;
  screenshotUrl?: string;
}

interface Withdrawal {
  id: string;
  amount: number;
  paymentMethod: string;
  destination: string;
  status: string;
  rejectionReason?: string;
  createdAt: string;
}

export default function UserDashboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'deposits' | 'withdrawals'>('overview');
  const [loading, setLoading] = useState(true);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);

  // #3 (mobile UX): back button/gesture closes these modals instead of leaving the page
  // (deferred closures — the handlers are declared below this point)
  useModalHistory(showDepositModal, () => handleDepositModalClose());
  useModalHistory(showWithdrawalModal, () => handleWithdrawalModalClose());

  const fetchProfile = async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/me/profile'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        console.log('[DASHBOARD] Profile updated:', data.data.wallet);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  const fetchDeposits = async () => {
    try {
      const res = await fetch(apiUrl('/api/deposits'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDeposits(data.data.deposits || []);
      }
    } catch (error) {
      console.error('Failed to fetch deposits:', error);
    }
  };

  const fetchWithdrawals = async () => {
    try {
      const res = await fetch(apiUrl('/api/withdrawals'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setWithdrawals(data.data.withdrawals || []);
      }
    } catch (error) {
      console.error('Failed to fetch withdrawals:', error);
    }
    setLoading(false);
  };

  // Initial load
  useEffect(() => {
    if (!token) return;

    Promise.all([fetchProfile(), fetchDeposits(), fetchWithdrawals()]);
  }, [token]);

  // Listen for real-time balance updates
  useEffect(() => {
    if (!token) return;

    // Refresh profile every 3 seconds to check for balance updates
    const interval = setInterval(() => {
      fetchProfile();
      fetchDeposits();
    }, 3000);

    return () => clearInterval(interval);
  }, [token]);

  // Refresh when deposit modal closes (admin might have approved)
  const handleDepositModalClose = () => {
    setShowDepositModal(false);
    // Refresh data after deposit modal closes
    setTimeout(() => {
      fetchProfile();
      fetchDeposits();
    }, 1000);
  };

  // Refresh when withdrawal modal closes
  const handleWithdrawalModalClose = () => {
    setShowWithdrawalModal(false);
    // Refresh data after withdrawal modal closes
    setTimeout(() => {
      fetchProfile();
      fetchWithdrawals();
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-dark">
        <div className="text-sky-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-dark">
        <div className="text-sky-text-secondary">Failed to load profile</div>
      </div>
    );
  }

  const { user: userInfo, wallet, statistics } = profile;

  return (
    <div className="min-h-screen bg-sky-dark">
      <PageHeader title="My Account" backTo="/" backLabel="Back to Game" />
      
      <div className="max-w-2xl mx-auto px-4 py-4 md:py-6">
        {/* User Info */}
        <div className="mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-1">{userInfo.name}</h2>
          <p className="text-sky-text-secondary text-sm">{userInfo.email}</p>
        </div>

        {/* Wallet Balance Card */}
        <div className="bg-sky-card border border-sky-border rounded-xl p-4 mb-4">
          <div className="text-sky-text-muted text-xs mb-2">Total Balance</div>
          <div className="text-2xl md:text-3xl font-bold text-sky-green mb-3">
            {wallet.balance.toFixed(2)} {wallet.currency}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-sky-dark rounded-lg p-3">
              <div className="text-sky-text-muted text-xs mb-1">Reserved</div>
              <div className="text-sm font-bold text-sky-orange">{wallet.reserved.toFixed(2)}</div>
            </div>
            <div className="bg-sky-dark rounded-lg p-3">
              <div className="text-sky-text-muted text-xs mb-1">Available</div>
              <div className="text-sm font-bold text-sky-green">{(wallet.balance - wallet.reserved).toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => setShowDepositModal(true)}
            className="flex items-center justify-center gap-2 bg-sky-green hover:bg-sky-green-dark transition-colors rounded-xl py-3 px-4 text-white font-semibold shadow-lg shadow-sky-green/20"
          >
            <ArrowDownToLine size={18} />
            <span>Deposit</span>
          </button>
          <button
            onClick={() => setShowWithdrawalModal(true)}
            className="flex items-center justify-center gap-2 bg-sky-dark hover:bg-sky-card-hover border border-sky-border transition-colors rounded-xl py-3 px-4 text-white font-semibold"
          >
            <ArrowUpFromLine size={18} />
            <span>Withdraw</span>
          </button>
        </div>

        {/* Quick Navigation Links */}
        <div className="bg-sky-card border border-sky-border rounded-xl overflow-hidden mb-4">
          <button
            onClick={() => navigate('/dashboard/profile')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-sky-card-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <User size={18} className="text-sky-text-muted" />
              <span className="text-sm text-white">My Profile</span>
            </div>
            <ChevronRight size={16} className="text-sky-text-muted" />
          </button>
          <div className="border-t border-sky-border" />
          <button
            onClick={() => navigate('/dashboard/deposits')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-sky-card-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <ArrowDownToLine size={18} className="text-sky-text-muted" />
              <span className="text-sm text-white">Deposit History</span>
            </div>
            <ChevronRight size={16} className="text-sky-text-muted" />
          </button>
          <div className="border-t border-sky-border" />
          <button
            onClick={() => navigate('/dashboard/withdrawals')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-sky-card-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <ArrowUpFromLine size={18} className="text-sky-text-muted" />
              <span className="text-sm text-white">Withdrawal History</span>
            </div>
            <ChevronRight size={16} className="text-sky-text-muted" />
          </button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-sky-card border border-sky-border rounded-xl p-3">
            <div className="text-sky-text-muted text-xs mb-1">Total Deposits</div>
            <div className="text-lg font-bold text-sky-green">{statistics.totalDeposits.toFixed(2)}</div>
          </div>
          <div className="bg-sky-card border border-sky-border rounded-xl p-3">
            <div className="text-sky-text-muted text-xs mb-1">Total Withdrawals</div>
            <div className="text-lg font-bold text-sky-orange">{statistics.totalWithdrawals.toFixed(2)}</div>
          </div>
          <div className="bg-sky-card border border-sky-border rounded-xl p-3">
            <div className="text-sky-text-muted text-xs mb-1">Total Bets</div>
            <div className="text-lg font-bold text-white">{statistics.totalBets}</div>
          </div>
          <div className="bg-sky-card border border-sky-border rounded-xl p-3">
            <div className="text-sky-text-muted text-xs mb-1">Net P/L</div>
            <div className={`text-lg font-bold ${statistics.netProfit >= 0 ? 'text-sky-green' : 'text-sky-red'}`}>
              {statistics.netProfit >= 0 ? '+' : ''}{statistics.netProfit.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-sky-border overflow-x-auto">
          {(['overview', 'deposits', 'withdrawals'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`inline-flex min-h-[44px] items-center px-3 py-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'text-sky-green border-b-2 border-sky-green'
                  : 'text-sky-text-secondary hover:text-white'
              }`}
            >
              {tab === 'overview' ? 'Overview' : tab === 'deposits' ? 'Deposits' : 'Withdrawals'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-sky-card border border-sky-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-3">Betting Statistics</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-sky-text-secondary">Total Wagered:</span>
                  <span className="font-mono font-bold text-white">{statistics.totalWagered.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sky-text-secondary">Total Winnings:</span>
                  <span className="font-mono font-bold text-sky-green">{statistics.totalWinnings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sky-text-secondary">Total Losses:</span>
                  <span className="font-mono font-bold text-sky-red">{statistics.totalLosses.toFixed(2)}</span>
                </div>
                <div className="border-t border-sky-border pt-2 flex justify-between font-bold">
                  <span className="text-sky-text-secondary">Win Rate:</span>
                  <span className="text-sky-green">
                    {statistics.totalBets > 0
                      ? ((statistics.totalWinnings / statistics.totalWagered) * 100).toFixed(1)
                      : '0'}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-sky-card border border-sky-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-3">Account Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-sky-text-secondary">Status:</span>
                  <span className={`font-bold ${userInfo.isActive ? 'text-sky-green' : 'text-sky-red'}`}>
                    {userInfo.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sky-text-secondary">Role:</span>
                  <span className="font-mono text-white">{userInfo.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sky-text-secondary">Member Since:</span>
                  <span className="text-white">{new Date(userInfo.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'deposits' && (
          <div>
            {deposits.length === 0 ? (
              <div className="bg-sky-card border border-sky-border rounded-xl p-8 text-center text-sky-text-secondary text-sm">
                No deposits yet
              </div>
            ) : (
              <div className="space-y-3">
                {deposits.map((deposit) => (
                  <div key={deposit.id} className="bg-sky-card border border-sky-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white">{deposit.amount} ETB via {deposit.paymentMethod}</div>
                        <div className="text-xs text-sky-text-muted mt-0.5">{new Date(deposit.createdAt).toLocaleString()}</div>
                        {deposit.rejectionReason && (
                          <div className="text-xs text-sky-red mt-1">Reason: {deposit.rejectionReason}</div>
                        )}
                      </div>
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${
                        deposit.status === 'APPROVED' ? 'bg-sky-green/20 text-sky-green' :
                        deposit.status === 'REJECTED' ? 'bg-sky-red/20 text-sky-red' :
                        'bg-sky-orange/20 text-sky-orange'
                      }`}>
                        {deposit.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <div>
            {withdrawals.length === 0 ? (
              <div className="bg-sky-card border border-sky-border rounded-xl p-8 text-center text-sky-text-secondary text-sm">
                No withdrawals yet
              </div>
            ) : (
              <div className="space-y-3">
                {withdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="bg-sky-card border border-sky-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white">{withdrawal.amount} ETB to {withdrawal.paymentMethod}</div>
                        <div className="text-xs text-sky-text-muted">{withdrawal.destination}</div>
                        <div className="text-xs text-sky-text-muted mt-0.5">{new Date(withdrawal.createdAt).toLocaleString()}</div>
                        {withdrawal.rejectionReason && (
                          <div className="text-xs text-sky-red mt-1">Reason: {withdrawal.rejectionReason}</div>
                        )}
                      </div>
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${
                        withdrawal.status === 'COMPLETED' ? 'bg-sky-green/20 text-sky-green' :
                        withdrawal.status === 'REJECTED' ? 'bg-sky-red/20 text-sky-red' :
                        'bg-sky-orange/20 text-sky-orange'
                      }`}>
                        {withdrawal.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={handleDepositModalClose}
        balance={wallet.balance}
      />
      <WithdrawalModal
        isOpen={showWithdrawalModal}
        onClose={handleWithdrawalModalClose}
        balance={wallet.balance - wallet.reserved}
      />
    </div>
  );
}
