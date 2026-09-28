import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Users, TrendingUp, Clock, AlertCircle, DollarSign, ArrowUpRight, ArrowDownLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../../components/AdminHeader';
import AdminLoadingSpinner from '../../components/AdminLoadingSpinner';
import AdminEmptyState from '../../components/AdminEmptyState';
import { apiUrl } from '../../lib/config';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalAvailableBalance: number;
  totalReservedBalance: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalBetVolume: number;
  totalPayouts: number;
  platformBalance: number;
}

const StatCard = ({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) => (
  <div className="bg-sky-card rounded-lg p-6 border border-sky-border hover:border-sky-border-light transition-colors">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sky-text-secondary text-sm">{label}</p>
        <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
      </div>
      <div className={`p-3 rounded-lg ${color.replace('text-', 'bg-').replace('-400', '-900/30')}`}>
        {Icon}
      </div>
    </div>
  </div>
);

export default function AdminDashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats();
  }, [token]);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/admin/dashboard'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch dashboard stats');
      }

      setStats(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <AdminLoadingSpinner message="Loading dashboard..." />;
  }

  if (error) {
    return (
      <>
        <AdminHeader title="Dashboard" />
        <div className="max-w-[1600px] mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6 text-red-300">
            <p className="font-semibold mb-3">Error loading dashboard</p>
            <p className="text-sm mb-4">{error}</p>
            <button
              onClick={fetchDashboardStats}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded-lg text-red-300 hover:text-red-200 transition-colors text-sm font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!stats) return <AdminEmptyState title="No dashboard data available" />;

  return (
    <div className="min-h-screen bg-sky-dark">
      <AdminHeader title="Admin Dashboard" showBackButton={true} onBack={() => navigate('/')} />
      
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Pending Actions Alert */}
        {(stats.pendingDeposits > 0 || stats.pendingWithdrawals > 0) && (
          <div className="bg-sky-orange/10 border border-sky-orange/30 rounded-lg p-4 mb-8 flex items-start gap-4">
            <AlertCircle className="text-sky-orange flex-shrink-0 mt-1" size={20} />
            <div>
              <h3 className="font-semibold text-sky-orange">Pending Actions</h3>
              <p className="text-sky-orange/80 text-sm mt-1">
                {stats.pendingDeposits} deposit(s) and {stats.pendingWithdrawals} withdrawal(s) awaiting approval
              </p>
            </div>
          </div>
        )}

        {/* Action Cards for Review */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Pending Deposits Card */}
          <button
            onClick={() => navigate('/admin/deposits?status=PENDING')}
            className="bg-gradient-to-br from-sky-orange/20 to-sky-orange/5 border border-sky-orange/30 hover:border-sky-orange/50 rounded-lg p-6 transition-all cursor-pointer group text-left"
            aria-label={`View ${stats.pendingDeposits} pending deposits`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sky-orange text-sm font-medium">PENDING DEPOSITS</p>
                <p className="text-4xl font-bold text-sky-orange mt-3">{stats.pendingDeposits}</p>
                <p className="text-sky-orange/60 text-sm mt-2">require review</p>
              </div>
              <div className="bg-sky-orange/10 p-3 rounded-lg group-hover:bg-sky-orange/20 transition-colors">
                <DollarSign className="text-sky-orange" size={28} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-sky-orange/20">
              <span className="text-sky-orange text-sm">View Deposits</span>
              <ChevronRight className="text-sky-orange group-hover:translate-x-1 transition-transform" size={20} />
            </div>
          </button>

          {/* Pending Withdrawals Card */}
          <button
            onClick={() => navigate('/admin/withdrawals?status=PENDING')}
            className="bg-gradient-to-br from-red-900/20 to-red-900/5 border border-red-700/30 hover:border-red-700/50 rounded-lg p-6 transition-all cursor-pointer group text-left"
            aria-label={`View ${stats.pendingWithdrawals} pending withdrawals`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-red-400 text-sm font-medium">PENDING WITHDRAWALS</p>
                <p className="text-4xl font-bold text-red-400 mt-3">{stats.pendingWithdrawals}</p>
                <p className="text-red-400/60 text-sm mt-2">require review</p>
              </div>
              <div className="bg-red-900/20 p-3 rounded-lg group-hover:bg-red-900/40 transition-colors">
                <ArrowDownLeft className="text-red-400" size={28} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-red-700/20">
              <span className="text-red-400 text-sm">View Withdrawals</span>
              <ChevronRight className="text-red-400 group-hover:translate-x-1 transition-transform" size={20} />
            </div>
          </button>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            label="Total Users"
            value={stats.totalUsers}
            icon={<Users className="text-sky-green" size={24} />}
            color="text-sky-green"
          />
          <StatCard
            label="Active Users"
            value={stats.activeUsers}
            icon={<TrendingUp className="text-emerald-400" size={24} />}
            color="text-emerald-400"
          />
          <StatCard
            label="Pending Deposits"
            value={stats.pendingDeposits}
            icon={<Clock className="text-sky-orange" size={24} />}
            color="text-sky-orange"
          />
          <StatCard
            label="Pending Withdrawals"
            value={stats.pendingWithdrawals}
            icon={<Clock className="text-red-400" size={24} />}
            color="text-red-400"
          />
        </div>

        {/* Financial Stats */}
        <div className="bg-sky-card rounded-lg p-6 border border-sky-border mb-8">
          <h2 className="text-xl font-bold text-white mb-6">Financial Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sky-text-secondary text-sm mb-2">Total Deposited</p>
              <p className="text-2xl font-bold text-sky-green">{stats.totalDeposited.toFixed(2)} ETB</p>
            </div>
            <div>
              <p className="text-sky-text-secondary text-sm mb-2">Total Withdrawn</p>
              <p className="text-2xl font-bold text-red-400">{stats.totalWithdrawn.toFixed(2)} ETB</p>
            </div>
            <div>
              <p className="text-sky-text-secondary text-sm mb-2">Platform Balance</p>
              <p className="text-2xl font-bold text-sky-blue">{stats.platformBalance.toFixed(2)} ETB</p>
            </div>
          </div>
        </div>

        {/* User Wallet Stats */}
        <div className="bg-sky-card rounded-lg p-6 border border-sky-border">
          <h2 className="text-xl font-bold text-white mb-6">User Wallets</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sky-text-secondary text-sm mb-2">Total Available Balance</p>
              <p className="text-2xl font-bold text-emerald-400">
                {stats.totalAvailableBalance.toFixed(2)} ETB
              </p>
            </div>
            <div>
              <p className="text-sky-text-secondary text-sm mb-2">Total Reserved (Pending Withdrawals)</p>
              <p className="text-2xl font-bold text-sky-orange">
                {stats.totalReservedBalance.toFixed(2)} ETB
              </p>
            </div>
            <div>
              <p className="text-sky-text-secondary text-sm mb-2">Total User Funds</p>
              <p className="text-2xl font-bold text-sky-purple">
                {(stats.totalAvailableBalance + stats.totalReservedBalance).toFixed(2)} ETB
              </p>
            </div>
          </div>
        </div>

        {/* Betting Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="bg-sky-card rounded-lg p-6 border border-sky-border">
            <p className="text-sky-text-secondary text-sm mb-2">Total Bet Volume</p>
            <p className="text-3xl font-bold text-sky-blue">{stats.totalBetVolume.toFixed(2)} ETB</p>
          </div>
          <div className="bg-sky-card rounded-lg p-6 border border-sky-border">
            <p className="text-sky-text-secondary text-sm mb-2">Total Payouts</p>
            <p className="text-3xl font-bold text-sky-green">{stats.totalPayouts.toFixed(2)} ETB</p>
          </div>
        </div>
      </div>
    </div>
  );
}
