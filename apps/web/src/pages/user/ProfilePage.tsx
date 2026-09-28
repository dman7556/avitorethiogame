import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User as UserIcon, Mail, Phone, Calendar } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { apiUrl } from '../../lib/config';

interface UserProfile {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
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

export default function ProfilePage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/auth/me/profile'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);
      setProfile(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-dark flex items-center justify-center">
        <div className="text-sky-text-secondary">Loading profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-sky-dark">
        <PageHeader title="Profile" backTo="/dashboard" backLabel="Back" />
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-4 text-sky-red">
            <p className="font-semibold">{error || 'Failed to load profile'}</p>
          </div>
        </div>
      </div>
    );
  }

  const { user, wallet, statistics } = profile;

  return (
    <div className="min-h-screen bg-sky-dark">
      <PageHeader title="My Profile" backTo="/dashboard" backLabel="Back" />
      
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* User Info Card */}
        <div className="bg-sky-card border border-sky-border rounded-xl p-4 md:p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-sky-green/20 rounded-full flex items-center justify-center flex-shrink-0">
              <UserIcon size={28} className="text-sky-green" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white truncate">{user.name}</h2>
              <p className={`text-sm mt-0.5 ${user.isActive ? 'text-sky-green' : 'text-sky-red'}`}>
                {user.isActive ? 'Active Account' : 'Suspended'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail size={16} className="text-sky-text-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sky-text-muted text-xs">Email</p>
                <p className="text-sky-text-secondary text-sm truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone size={16} className="text-sky-text-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sky-text-muted text-xs">Phone</p>
                <p className="text-sky-text-secondary text-sm">{user.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar size={16} className="text-sky-text-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sky-text-muted text-xs">Member Since</p>
                <p className="text-sky-text-secondary text-sm">{new Date(user.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            {user.lastLogin && (
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-sky-text-muted flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sky-text-muted text-xs">Last Login</p>
                  <p className="text-sky-text-secondary text-sm">{new Date(user.lastLogin).toLocaleDateString()}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Wallet Card */}
        <div className="bg-sky-card border border-sky-border rounded-xl p-4 md:p-6 mb-6">
          <h3 className="text-lg font-bold text-white mb-4">Wallet</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-sky-dark rounded-lg p-3">
              <p className="text-sky-text-muted text-xs mb-1">Available</p>
              <p className="text-lg font-bold text-sky-green">
                {(wallet.balance - wallet.reserved).toFixed(2)} {wallet.currency}
              </p>
            </div>
            <div className="bg-sky-dark rounded-lg p-3">
              <p className="text-sky-text-muted text-xs mb-1">Reserved</p>
              <p className="text-lg font-bold text-sky-orange">{wallet.reserved.toFixed(2)} {wallet.currency}</p>
            </div>
            <div className="bg-sky-dark rounded-lg p-3">
              <p className="text-sky-text-muted text-xs mb-1">Total Balance</p>
              <p className="text-lg font-bold text-white">{wallet.balance.toFixed(2)} {wallet.currency}</p>
            </div>
          </div>
        </div>

        {/* Statistics Card */}
        <div className="bg-sky-card border border-sky-border rounded-xl p-4 md:p-6">
          <h3 className="text-lg font-bold text-white mb-4">Gaming Statistics</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sky-text-secondary text-sm">Total Deposits</span>
              <span className="font-mono font-bold text-sky-green">{statistics.totalDeposits.toFixed(2)} ETB</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sky-text-secondary text-sm">Total Withdrawals</span>
              <span className="font-mono font-bold text-sky-red">{statistics.totalWithdrawals.toFixed(2)} ETB</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sky-text-secondary text-sm">Total Bets Placed</span>
              <span className="font-mono font-bold text-sky-text-primary">{statistics.totalBets}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sky-text-secondary text-sm">Total Wagered</span>
              <span className="font-mono font-bold text-sky-text-primary">{statistics.totalWagered.toFixed(2)} ETB</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sky-text-secondary text-sm">Total Winnings</span>
              <span className="font-mono font-bold text-sky-green">{statistics.totalWinnings.toFixed(2)} ETB</span>
            </div>
            <div className="border-t border-sky-border pt-3 flex justify-between items-center">
              <span className="text-sky-text-secondary text-sm font-medium">Net Profit/Loss</span>
              <span className={`font-mono font-bold text-lg ${statistics.netProfit >= 0 ? 'text-sky-green' : 'text-sky-red'}`}>
                {statistics.netProfit >= 0 ? '+' : ''}{statistics.netProfit.toFixed(2)} ETB
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
