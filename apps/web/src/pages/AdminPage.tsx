import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Gamepad2, Coins, Activity, CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import DepositApprovalPage from './admin/DepositApprovalPage';
import WithdrawalApprovalPage from './admin/WithdrawalApprovalPage';
import { apiUrl } from '../lib/config';

interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalBetVolume: number;
  totalPayouts: number;
  platformBalance: number;
}

interface RoundData {
  id: string;
  roundNumber: number;
  phase: string;
  crashPoint: number | null;
  totalBets: number;
  startedAt: string | null;
  crashedAt: string | null;
  settledAt: string | null;
  createdAt: string;
}

export default function AdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboard = async () => {
    try {
      const [dashRes, roundsRes] = await Promise.all([
        fetch(apiUrl('/api/admin/dashboard'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl('/api/admin/rounds?limit=10&offset=0'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const dashResult = await dashRes.json();
      const roundsResult = await roundsRes.json();

      if (dashResult.success) {
        setData(dashResult.data);
      }
      if (roundsResult.success) {
        setRounds(roundsResult.data);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-dark flex items-center justify-center">
        <div className="text-sky-text-secondary">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-dark">
      <PageHeader title="Admin Dashboard" backTo="/" backLabel="Back to Game" />

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <StatCard
            icon={<Users size={20} />}
            label="Total Users"
            value={data?.totalUsers || 0}
            color="text-sky-blue"
          />
          <StatCard
            icon={<Gamepad2 size={20} />}
            label="Active Users"
            value={data?.activeUsers || 0}
            color="text-sky-green"
          />
          <StatCard
            icon={<Coins size={20} />}
            label="Total Bets"
            value={`${(data?.totalBetVolume || 0).toLocaleString()} ETB`}
            color="text-sky-orange"
          />
          <StatCard
            icon={<Activity size={20} />}
            label="Total Payouts"
            value={`${(data?.totalPayouts || 0).toLocaleString()} ETB`}
            color="text-sky-purple"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-sky-card rounded-lg p-1 mb-6 overflow-x-auto">
          {['dashboard', 'deposits', 'withdrawals', 'rounds', 'bets'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-btn text-xs whitespace-nowrap flex-shrink-0 px-4 py-2 ${activeTab === tab ? 'active' : ''}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold">Recent Rounds</h2>
            <div className="bg-sky-card rounded-xl border border-sky-border overflow-hidden">
              <div className="grid grid-cols-4 gap-2 px-3 md:px-4 py-2 text-xs text-sky-text-muted border-b border-sky-border">
                <span>Round</span>
                <span>Crash Point</span>
                <span>Bets</span>
                <span>Status</span>
              </div>
              {rounds.length > 0 ? (
                rounds.map((round) => (
                  <div
                    key={round.id}
                    className="grid grid-cols-4 gap-2 px-3 md:px-4 py-2 text-xs md:text-sm border-b border-sky-border/50 last:border-0"
                  >
                    <span className="text-white">#{round.roundNumber}</span>
                    <span className={`font-mono ${round.crashPoint ? (round.crashPoint < 2 ? 'text-sky-red' : round.crashPoint < 10 ? 'text-sky-orange' : 'text-sky-green') : 'text-sky-text-muted'}`}>
                      {round.crashPoint ? `${round.crashPoint}x` : '—'}
                    </span>
                    <span className="text-sky-text-secondary">{round.totalBets}</span>
                    <span className={`text-xs ${round.phase === 'SETTLED' ? 'text-sky-green' : 'text-sky-orange'}`}>
                      {round.phase}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-3 md:px-4 py-6 text-center text-sky-text-secondary">
                  No rounds found
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'deposits' && (
          <DepositApprovalPage />
        )}

        {activeTab === 'withdrawals' && (
          <WithdrawalApprovalPage />
        )}

        {activeTab === 'rounds' && (
          <div className="text-sky-text-secondary text-sm">Round details coming soon</div>
        )}

        {activeTab === 'bets' && (
          <div className="text-sky-text-secondary text-sm">Bet details coming soon</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-sky-card rounded-xl border border-sky-border p-3 md:p-4">
      <div className={`${color} mb-2`}>{icon}</div>
      <div className="text-sky-text-secondary text-xs mb-1">{label}</div>
      <div className="text-white font-semibold text-sm md:text-lg">{value}</div>
    </div>
  );
}
