import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, TrendingUp, Clock, AlertCircle, DollarSign,
  ArrowUpRight, ArrowDownLeft,  Coins, Activity, Wallet,
  Search, ChevronLeft, ChevronRight, X, Check, Ban,
  RefreshCw, Eye, Loader2, Image as ImageIcon,
  CreditCard, History, User as UserIcon,
  ArrowDown, ArrowUp
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocketAdminEvents } from '../../hooks/useSocketAdminEvents';
import DepositsSection from '../../components/admin/DepositsSection';
import WithdrawalsSection from '../../components/admin/WithdrawalsSection';
import AnalyticsSection from '../../components/admin/AnalyticsSection';
import { apiUrl } from '../../lib/config';

// ============================================================
// TYPES
// ============================================================

interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalBetVolume: number;
  totalBetsCount: number;
  totalPayouts: number;
  platformBalance: number;
  totalAvailableBalance: number;
  totalReservedBalance: number;
  totalUserFunds: number;
}

type ViewType =
  | 'dashboard'
  | 'users'
  | 'user-detail'
  | 'bets'
  | 'payouts'
  | 'deposits'
  | 'withdrawals'
  | 'pending-deposits'
  | 'pending-withdrawals'
  | 'platform-balance'
  | 'analytics';

// ============================================================
// ADMIN PAGE - CONTROL CENTER
// ============================================================

export default function AdminPage() {
  const { token } = useAuth();
  const [view, setView] = useState<ViewType>('dashboard');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/admin/dashboard'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboard();
    refreshRef.current = setInterval(fetchDashboard, 15000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchDashboard]);

  // Real-time: any financial event refreshes dashboard stats AND the open list
  useSocketAdminEvents(token, () => {
    fetchDashboard();
    setRefreshTick((t) => t + 1);
  });

  const navigateTo = (v: ViewType) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-sky-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-10 w-10 text-sky-green mx-auto mb-3" />
          <p className="text-sky-text-secondary text-sm">Loading admin control center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-dark">
      {/* Header */}
      <div className="bg-sky-card border-b border-sky-border sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {view !== 'dashboard' ? (
              <button
                onClick={() => navigateTo('dashboard')}
                className="flex items-center min-h-[44px] gap-1.5 text-sky-green hover:text-sky-green-light transition-colors text-sm font-medium"
              >
                <ChevronLeft size={18} />
                Dashboard
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.location.href = '/'}
                  className="flex items-center min-h-[44px] min-w-[44px] justify-center gap-1.5 text-sky-text-secondary hover:text-white transition-colors text-sm font-medium"
                  title="Back to Home"
                >
                  <ChevronLeft size={18} />
                  <span className="hidden sm:inline">Home</span>
                </button>
                <h1 className="text-lg font-bold text-white">Admin Control Center</h1>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchDashboard}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-sky-card-hover transition-colors text-sky-text-secondary hover:text-white"
              title="Refresh data"
            >
              <RefreshCw size={16} />
            </button>
            <span className="text-xs text-sky-text-muted hidden sm:inline">
              Auto-refresh: 15s
            </span>
            <span className="px-3 py-1 bg-sky-green/10 border border-sky-green/20 rounded-full text-xs text-sky-green font-medium">
              ADMIN
            </span>
          </div>
        </div>
      </div>

      {/* Pending Actions Banner */}
      {view === 'dashboard' && data && (data.pendingDeposits > 0 || data.pendingWithdrawals > 0) && (
        <div className="bg-sky-orange/10 border-b border-sky-orange/20">
          <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
            <AlertCircle className="text-sky-orange flex-shrink-0" size={18} />
            <span className="text-sky-orange text-sm font-medium">
              {data.pendingDeposits > 0 && (
                <button onClick={() => navigateTo('pending-deposits')} className="underline hover:no-underline min-h-[44px] inline-flex items-center">
                  {data.pendingDeposits} pending deposit(s)
                </button>
              )}
              {data.pendingDeposits > 0 && data.pendingWithdrawals > 0 && ' · '}
              {data.pendingWithdrawals > 0 && (
                <button onClick={() => navigateTo('pending-withdrawals')} className="underline hover:no-underline min-h-[44px] inline-flex items-center">
                  {data.pendingWithdrawals} pending withdrawal(s)
                </button>
              )}
              {' '}require review
            </span>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-sky-red/10 border-b border-sky-red/20">
          <div className="max-w-[1600px] mx-auto px-4 py-2 text-sm text-sky-red">{error}</div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {view === 'dashboard' && data && <DashboardView data={data} onNavigate={navigateTo} />}
        {view === 'users' && <UsersView token={token!} onUserSelect={(id) => { setSelectedUserId(id); setView('user-detail'); }} />}
        {view === 'user-detail' && selectedUserId && (
          <UserDetailView token={token!} userId={selectedUserId} onBack={() => setView('users')} />
        )}
        {view === 'bets' && <BetsView token={token!} />}
        {view === 'payouts' && <PayoutsView token={token!} />}
        {view === 'deposits' && <DepositsSection initialStatus="ALL" refreshTick={refreshTick} onStatsChanged={fetchDashboard} />}
        {view === 'withdrawals' && <WithdrawalsSection initialStatus="ALL" refreshTick={refreshTick} onStatsChanged={fetchDashboard} />}
        {view === 'pending-deposits' && <DepositsSection initialStatus="PENDING" refreshTick={refreshTick} onStatsChanged={fetchDashboard} />}
        {view === 'pending-withdrawals' && <WithdrawalsSection initialStatus="PENDING" refreshTick={refreshTick} onStatsChanged={fetchDashboard} />}
        {view === 'platform-balance' && <PlatformBalanceView token={token!} />}
        {view === 'analytics' && <AnalyticsSection />}
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD VIEW - 9 CLICKABLE CARDS
// ============================================================

function DashboardView({ data, onNavigate }: { data: DashboardData; onNavigate: (v: ViewType) => void }) {
  const cards = [
    {
      label: 'Total Users',
      value: data.totalUsers.toLocaleString(),
      sub: `${data.activeUsers} active`,
      icon: Users,
      color: 'text-sky-blue',
      bg: 'bg-sky-blue/10',
      border: 'border-sky-blue/20',
      view: 'users' as ViewType,
    },
    {
      label: 'Active Users',
      value: data.activeUsers.toLocaleString(),
      sub: `${data.totalUsers - data.activeUsers} suspended`,
      icon: TrendingUp,
      color: 'text-sky-green',
      bg: 'bg-sky-green/10',
      border: 'border-sky-green/20',
      view: 'users' as ViewType,
    },
    {
      label: 'Total Bets',
      value: data.totalBetsCount.toLocaleString(),
      sub: `${data.totalBetVolume.toLocaleString()} ETB volume`,
      icon: Coins,
      color: 'text-sky-purple',
      bg: 'bg-sky-purple/10',
      border: 'border-sky-purple/20',
      view: 'bets' as ViewType,
    },
    {
      label: 'Total Payouts',
      value: `${data.totalPayouts.toLocaleString()} ETB`,
      sub: 'Winnings paid out',
      icon: TrendingUp,
      color: 'text-sky-green',
      bg: 'bg-sky-green/10',
      border: 'border-sky-green/20',
      view: 'payouts' as ViewType,
    },
    {
      label: 'Total Deposits',
      value: `${data.totalDeposited.toLocaleString()} ETB`,
      sub: 'Approved deposits',
      icon: ArrowDownLeft,
      color: 'text-sky-blue',
      bg: 'bg-sky-blue/10',
      border: 'border-sky-blue/20',
      view: 'deposits' as ViewType,
    },
    {
      label: 'Total Withdrawals',
      value: `${data.totalWithdrawn.toLocaleString()} ETB`,
      sub: 'Completed withdrawals',
      icon: ArrowUpRight,
      color: 'text-sky-orange',
      bg: 'bg-sky-orange/10',
      border: 'border-sky-orange/20',
      view: 'withdrawals' as ViewType,
    },
    {
      label: 'Pending Deposits',
      value: data.pendingDeposits.toLocaleString(),
      sub: 'Awaiting review',
      icon: Clock,
      color: data.pendingDeposits > 0 ? 'text-sky-orange' : 'text-sky-text-secondary',
      bg: data.pendingDeposits > 0 ? 'bg-sky-orange/10' : 'bg-sky-card',
      border: data.pendingDeposits > 0 ? 'border-sky-orange/20' : 'border-sky-border',
      view: 'pending-deposits' as ViewType,
      urgent: data.pendingDeposits > 0,
    },
    {
      label: 'Pending Withdrawals',
      value: data.pendingWithdrawals.toLocaleString(),
      sub: 'Awaiting review',
      icon: Clock,
      color: data.pendingWithdrawals > 0 ? 'text-sky-orange' : 'text-sky-text-secondary',
      bg: data.pendingWithdrawals > 0 ? 'bg-sky-orange/10' : 'bg-sky-card',
      border: data.pendingWithdrawals > 0 ? 'border-sky-orange/20' : 'border-sky-border',
      view: 'pending-withdrawals' as ViewType,
      urgent: data.pendingWithdrawals > 0,
    },
    {
      label: 'Platform Balance',
      value: `${data.platformBalance.toLocaleString()} ETB`,
      sub: 'Net platform funds',
      icon: Wallet,
      color: 'text-sky-yellow',
      bg: 'bg-sky-yellow/10',
      border: 'border-sky-yellow/20',
      view: 'platform-balance' as ViewType,
      wide: true,
    },
    {
      label: 'Live Analytics & Risk',
      value: 'Real-Time',
      sub: 'Alerts · fraud · fairness',
      icon: Activity,
      color: 'text-sky-green',
      bg: 'bg-sky-green/10',
      border: 'border-sky-green/20',
      view: 'analytics' as ViewType,
      wide: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Clickable Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              onClick={() => onNavigate(card.view)}
              className={`${card.bg} border ${card.border} rounded-xl p-4 md:p-5 text-left transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer group ${card.urgent ? 'ring-1 ring-sky-orange/40 animate-pulse-slow' : ''}`}
            >
              <div className={`${card.color} mb-2 group-hover:scale-110 transition-transform`}>
                <Icon size={20} />
              </div>
              <div className="text-sky-text-secondary text-xs mb-1">{card.label}</div>
              <div className="text-white font-bold text-base md:text-xl leading-tight">{card.value}</div>
              <div className="text-sky-text-muted text-xs mt-1">{card.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Financial Quick Summary */}
      <div className="bg-sky-card border border-sky-border rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Financial Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-sky-text-muted mb-1">Total User Funds</div>
            <div className="text-lg font-bold text-white">{data.totalUserFunds.toLocaleString()} ETB</div>
          </div>
          <div>
            <div className="text-xs text-sky-text-muted mb-1">Available Balance</div>
            <div className="text-lg font-bold text-sky-green">{data.totalAvailableBalance.toLocaleString()} ETB</div>
          </div>
          <div>
            <div className="text-xs text-sky-text-muted mb-1">Reserved (Pending)</div>
            <div className="text-lg font-bold text-sky-orange">{data.totalReservedBalance.toLocaleString()} ETB</div>
          </div>
          <div>
            <div className="text-xs text-sky-text-muted mb-1">Platform Revenue</div>
            <div className="text-lg font-bold text-sky-yellow">{data.platformBalance.toLocaleString()} ETB</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// USERS VIEW
// ============================================================

interface UserData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  balance: number;
  reserved: number;
  totalBets: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  createdAt: string;
  lastLogin: string | null;
}

function UsersView({ token, onUserSelect }: { token: string; onUserSelect: (id: string) => void }) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('isActive', statusFilter);

      const res = await fetch(apiUrl(`/api/admin/users?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data.users);
        setTotal(data.data.total);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, search, roleFilter, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white">Users ({total})</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-text-muted" />
            <input
              type="text"
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-8 pr-3 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm w-48 focus:outline-none focus:border-sky-green"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm focus:outline-none focus:border-sky-green"
          >
            <option value="">All Roles</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm focus:outline-none focus:border-sky-green"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin h-8 w-8 text-sky-green mx-auto" /></div>
      ) : error ? (
        <div className="bg-sky-red/10 border border-sky-red/30 rounded-xl p-4 text-sky-red text-sm">{error}</div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-sky-card border border-sky-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Balance</th>
                  <th className="px-4 py-3 text-left">Bets</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-sky-card-hover transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => onUserSelect(u.id)} className="text-white font-medium hover:text-sky-green transition-colors text-left">
                        {u.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sky-text-secondary text-sm">{u.email}</td>
                    <td className="px-4 py-3 text-sm font-mono">
                      <span className={u.balance > 0 ? 'text-sky-green' : 'text-sky-text-secondary'}>
                        {u.balance.toLocaleString()} ETB
                      </span>
                      {u.reserved > 0 && (
                        <span className="text-sky-orange text-xs ml-1">({u.reserved} res)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sky-text-secondary text-sm">{u.totalBets}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'ADMIN' ? 'bg-sky-purple/20 text-sky-purple' : 'bg-sky-blue/20 text-sky-blue'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-sky-green/20 text-sky-green' : 'bg-sky-red/20 text-sky-red'}`}>
                        {u.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sky-text-muted text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onUserSelect(u.id)}
                        className="text-sky-blue hover:text-sky-green text-xs font-medium transition-colors"
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => onUserSelect(u.id)}
                className="w-full bg-sky-card border border-sky-border rounded-xl p-3 text-left hover:border-sky-green/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-white text-sm">{u.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-sky-green/20 text-sky-green' : 'bg-sky-red/20 text-sky-red'}`}>
                    {u.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div className="text-xs text-sky-text-muted">{u.email}</div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-sky-green font-mono">{u.balance.toLocaleString()} ETB</span>
                  <span className="text-sky-text-secondary">{u.totalBets} bets</span>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {total > limit && (
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          )}

          {users.length === 0 && !loading && (
            <EmptyState message="No users found" />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// USER DETAIL VIEW
// ============================================================

type UserTab = 'overview' | 'deposits' | 'withdrawals' | 'bets' | 'transactions';

function UserDetailView({ token, userId, onBack }: { token: string; userId: string; onBack: () => void }) {
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<UserTab>('overview');
  const [actionLoading, setActionLoading] = useState(false);

  // Detail data for tabs
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [bets, setBets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabTotal, setTabTotal] = useState(0);
  const [tabPage, setTabPage] = useState(0);

  // Credit/debit modals
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showDebitModal, setShowDebitModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [debitAmount, setDebitAmount] = useState('');
  const [debitReason, setDebitReason] = useState('');
  const [modalError, setModalError] = useState('');

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUserInfo(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const fetchTabData = useCallback(async () => {
    setTabLoading(true);
    try {
      const limit = 20;
      const offset = tabPage * limit;
      let url = '';
      let setter: (d: any) => void;

      switch (tab) {
        case 'deposits':
          url = apiUrl(`/api/admin/deposits?userId=${userId}&limit=${limit}&offset=${offset}`);
          setter = (d) => { setDeposits(d.deposits || []); setTabTotal(d.total || 0); };
          break;
        case 'withdrawals':
          url = apiUrl(`/api/admin/withdrawals?userId=${userId}&limit=${limit}&offset=${offset}`);
          setter = (d) => { setWithdrawals(d.withdrawals || []); setTabTotal(d.total || 0); };
          break;
        case 'bets':
          url = apiUrl(`/api/admin/bets?userId=${userId}&limit=${limit}&offset=${offset}`);
          setter = (d) => { setBets(d.bets || []); setTabTotal(d.total || 0); };
          break;
        case 'transactions':
          url = apiUrl(`/api/admin/users/${userId}/transactions?limit=${limit}&offset=${offset}`);
          setter = (d) => { setTransactions(d.transactions || []); setTabTotal(d.total || 0); };
          break;
        default:
          setTabLoading(false);
          return;
      }

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setter(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setTabLoading(false);
    }
  }, [token, userId, tab, tabPage]);

  useEffect(() => {
    if (tab !== 'overview') fetchTabData();
  }, [fetchTabData, tab]);

  const handleSuspend = async () => {
    if (!confirm('Suspend this user?')) return;
    setActionLoading(true);
    try {
      await fetch(apiUrl(`/api/admin/users/${userId}/suspend`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin action' }),
      });
      fetchUser();
    } finally { setActionLoading(false); }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await fetch(apiUrl(`/api/admin/users/${userId}/reactivate`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchUser();
    } finally { setActionLoading(false); }
  };

  const handleCredit = async () => {
    setModalError('');
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) { setModalError('Invalid amount'); return; }
    if (!creditReason.trim()) { setModalError('Reason required'); return; }
    setActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}/credit`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason: creditReason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowCreditModal(false);
      setCreditAmount('');
      setCreditReason('');
      fetchUser();
    } catch (err: any) {
      setModalError(err.message);
    } finally { setActionLoading(false); }
  };

  const handleDebit = async () => {
    setModalError('');
    const amount = parseFloat(debitAmount);
    if (!amount || amount <= 0) { setModalError('Invalid amount'); return; }
    if (!debitReason.trim()) { setModalError('Reason required'); return; }
    setActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}/debit`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason: debitReason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowDebitModal(false);
      setDebitAmount('');
      setDebitReason('');
      fetchUser();
    } catch (err: any) {
      setModalError(err.message);
    } finally { setActionLoading(false); }
  };

  if (loading) {
    return <div className="text-center py-12"><Loader2 className="animate-spin h-8 w-8 text-sky-green mx-auto" /></div>;
  }
  if (error || !userInfo) {
    return <div className="bg-sky-red/10 border border-sky-red/30 rounded-xl p-4 text-sky-red text-sm">{error || 'User not found'}</div>;
  }

  const { user, wallet, statistics } = userInfo;

  const userTabs: { id: UserTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'deposits', label: `Deposits (${statistics.totalDeposits > 0 ? `${(statistics.totalDeposits).toLocaleString()} ETB` : '0'})`, icon: ArrowDownLeft },
    { id: 'withdrawals', label: `Withdrawals (${statistics.totalWithdrawals > 0 ? `${(statistics.totalWithdrawals).toLocaleString()} ETB` : '0'})`, icon: ArrowUpRight },
    { id: 'bets', label: `Bets (${statistics.totalBets})`, icon: Coins },
    { id: 'transactions', label: 'Ledger', icon: History },
  ];

  return (
    <div className="space-y-4">
      {/* User Header */}
      <div className="bg-sky-card border border-sky-border rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-sky-blue/20 flex items-center justify-center">
                <UserIcon size={20} className="text-sky-blue" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{user.name}</h2>
                <p className="text-sky-text-muted text-xs">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className={`text-xs px-2 py-1 rounded-full ${user.isActive ? 'bg-sky-green/20 text-sky-green' : 'bg-sky-red/20 text-sky-red'}`}>
                {user.isActive ? 'Active' : 'Suspended'}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full ${user.role === 'ADMIN' ? 'bg-sky-purple/20 text-sky-purple' : 'bg-sky-blue/20 text-sky-blue'}`}>
                {user.role}
              </span>
              <span className="text-xs text-sky-text-muted">
                Joined: {new Date(user.createdAt).toLocaleDateString()}
              </span>
              {user.lastLogin && (
                <span className="text-xs text-sky-text-muted">
                  Last login: {new Date(user.lastLogin).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {user.isActive ? (
              <button onClick={handleSuspend} disabled={actionLoading} className="px-3 py-1.5 bg-sky-red/20 text-sky-red text-xs font-medium rounded-lg hover:bg-sky-red/30 transition-colors">
                <Ban size={14} className="inline mr-1" />Suspend
              </button>
            ) : (
              <button onClick={handleReactivate} disabled={actionLoading} className="px-3 py-1.5 bg-sky-green/20 text-sky-green text-xs font-medium rounded-lg hover:bg-sky-green/30 transition-colors">
                <Check size={14} className="inline mr-1" />Reactivate
              </button>
            )}
            <button onClick={() => setShowCreditModal(true)} className="px-3 py-1.5 bg-sky-green/20 text-sky-green text-xs font-medium rounded-lg hover:bg-sky-green/30 transition-colors">
              <ArrowDown size={14} className="inline mr-1" />Credit
            </button>
            <button onClick={() => setShowDebitModal(true)} className="px-3 py-1.5 bg-sky-orange/20 text-sky-orange text-xs font-medium rounded-lg hover:bg-sky-orange/30 transition-colors">
              <ArrowUp size={14} className="inline mr-1" />Debit
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatMini label="Balance" value={`${(wallet?.balance || 0).toLocaleString()} ETB`} color="text-sky-green" />
        <StatMini label="Reserved" value={`${(wallet?.reserved || 0).toLocaleString()} ETB`} color="text-sky-orange" />
        <StatMini label="Total Deposits" value={`${statistics.totalDeposits.toLocaleString()} ETB`} color="text-sky-blue" />
        <StatMini label="Total Withdrawals" value={`${statistics.totalWithdrawals.toLocaleString()} ETB`} color="text-sky-purple" />
        <StatMini label="Net Profit/Loss" value={`${statistics.netProfit.toLocaleString()} ETB`} color={statistics.netProfit >= 0 ? 'text-sky-green' : 'text-sky-red'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-sky-card border border-sky-border rounded-xl p-1 overflow-x-auto">
        {userTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setTabPage(0); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-sky-dark text-white' : 'text-sky-text-secondary hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-sky-card border border-sky-border rounded-xl overflow-hidden">
        {tabLoading ? (
          <div className="text-center py-12"><Loader2 className="animate-spin h-6 w-6 text-sky-green mx-auto" /></div>
        ) : tab === 'overview' ? (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoBlock label="Total Wagered" value={`${statistics.totalWagered.toLocaleString()} ETB`} />
              <InfoBlock label="Total Winnings" value={`${statistics.totalWinnings.toLocaleString()} ETB`} />
              <InfoBlock label="Total Losses" value={`${statistics.totalLosses.toLocaleString()} ETB`} />
              <InfoBlock label="Total Bets" value={statistics.totalBets.toString()} />
              <InfoBlock label="Wallet Balance" value={`${(wallet?.balance || 0).toLocaleString()} ETB`} />
              <InfoBlock label="Reserved" value={`${(wallet?.reserved || 0).toLocaleString()} ETB`} />
            </div>
          </div>
        ) : tab === 'deposits' ? (
          <div>
            {deposits.length === 0 ? (
              <EmptyState message="No deposits" />
            ) : (
              <>
                {deposits.map((d) => (
                  <div key={d.id} className="border-b border-sky-border/50 last:border-0 px-4 py-3 flex items-center gap-4">
                    {d.screenshotUrl ? (
                      <a href={d.screenshotUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                        <img src={d.screenshotUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-sky-border" />
                      </a>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-sky-dark flex items-center justify-center flex-shrink-0">
                        <ImageIcon size={14} className="text-sky-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-white">{d.submittedAmount === 0 ? 'Verify amount' : `${d.submittedAmount.toLocaleString()} ETB`}</div>
                      <div className="text-xs text-sky-text-muted">{d.paymentMethod} · {new Date(d.createdAt).toLocaleString()}</div>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
                {tabTotal > 20 && <Pagination page={tabPage} total={tabTotal} limit={20} onPageChange={setTabPage} />}
              </>
            )}
          </div>
        ) : tab === 'withdrawals' ? (
          <div>
            {withdrawals.length === 0 ? (
              <EmptyState message="No withdrawals" />
            ) : (
              <>
                {withdrawals.map((w) => (
                  <div key={w.id} className="border-b border-sky-border/50 last:border-0 px-4 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-white">{w.amount.toLocaleString()} ETB</div>
                      <div className="text-xs text-sky-text-muted">{w.paymentMethod} · {w.accountNumber} · {new Date(w.createdAt).toLocaleString()}</div>
                    </div>
                    <StatusBadge status={w.status} />
                  </div>
                ))}
                {tabTotal > 20 && <Pagination page={tabPage} total={tabTotal} limit={20} onPageChange={setTabPage} />}
              </>
            )}
          </div>
        ) : tab === 'bets' ? (
          <div className="overflow-x-auto">
            {bets.length === 0 ? (
              <EmptyState message="No bets" />
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                      <th className="px-4 py-2 text-left">Round</th>
                      <th className="px-4 py-2 text-left">Amount</th>
                      <th className="px-4 py-2 text-left">Cashout</th>
                      <th className="px-4 py-2 text-left">Payout</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-border/50">
                    {bets.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-2 text-sky-text-secondary">#{b.roundNumber}</td>
                        <td className="px-4 py-2 font-mono text-white">{b.amount.toLocaleString()} ETB</td>
                        <td className="px-4 py-2 font-mono">{b.cashoutMultiplier ? `${b.cashoutMultiplier}x` : '—'}</td>
                        <td className="px-4 py-2 font-mono text-sky-green">{b.payout ? `${b.payout.toLocaleString()} ETB` : '—'}</td>
                        <td className="px-4 py-2"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-2 text-sky-text-muted text-xs">{new Date(b.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tabTotal > 20 && <Pagination page={tabPage} total={tabTotal} limit={20} onPageChange={setTabPage} />}
              </>
            )}
          </div>
        ) : tab === 'transactions' ? (
          <div className="overflow-x-auto">
            {transactions.length === 0 ? (
              <EmptyState message="No transactions" />
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Amount</th>
                      <th className="px-4 py-2 text-left">Before</th>
                      <th className="px-4 py-2 text-left">After</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-border/50">
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                            t.type === 'DEPOSIT' ? 'bg-sky-green/20 text-sky-green' :
                            t.type === 'WITHDRAWAL' ? 'bg-sky-orange/20 text-sky-orange' :
                            t.type === 'BET' ? 'bg-sky-red/20 text-sky-red' :
                            t.type === 'WIN' ? 'bg-sky-green/20 text-sky-green' :
                            t.type === 'ADMIN_CREDIT' ? 'bg-sky-blue/20 text-sky-blue' :
                            t.type === 'ADMIN_DEBIT' ? 'bg-sky-red/20 text-sky-red' :
                            t.type === 'REFUND' ? 'bg-sky-purple/20 text-sky-purple' :
                            'bg-sky-card text-sky-text-secondary'
                          }`}>{t.type}</span>
                        </td>
                        <td className={`px-4 py-2 font-mono ${t.amount >= 0 ? 'text-sky-green' : 'text-sky-red'}`}>
                          {t.amount >= 0 ? '+' : ''}{t.amount.toLocaleString()} ETB
                        </td>
                        <td className="px-4 py-2 text-sky-text-muted font-mono text-xs">{t.balanceBefore.toLocaleString()}</td>
                        <td className="px-4 py-2 text-sky-text-secondary font-mono text-xs">{t.balanceAfter.toLocaleString()}</td>
                        <td className="px-4 py-2 text-sky-text-muted text-xs max-w-[200px] truncate">{t.description}</td>
                        <td className="px-4 py-2 text-sky-text-muted text-xs">{new Date(t.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tabTotal > 20 && <Pagination page={tabPage} total={tabTotal} limit={20} onPageChange={setTabPage} />}
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Credit Modal */}
      {showCreditModal && (
        <Modal onClose={() => { setShowCreditModal(false); setModalError(''); }}>
          <h3 className="text-lg font-bold text-white mb-4">Credit Balance</h3>
          <p className="text-sky-text-secondary text-sm mb-4">Add funds to {user.name}'s wallet via ledger transaction.</p>
          <input
            type="number"
            placeholder="Amount (ETB)"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white mb-3 focus:outline-none focus:border-sky-green"
          />
          <input
            type="text"
            placeholder="Reason (required)"
            value={creditReason}
            onChange={(e) => setCreditReason(e.target.value)}
            className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white mb-3 focus:outline-none focus:border-sky-green"
          />
          {modalError && <p className="text-sky-red text-sm mb-3">{modalError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCredit} disabled={actionLoading} className="flex-1 px-4 py-2.5 bg-sky-green hover:bg-sky-green-dark text-sky-dark font-bold rounded-lg transition-colors disabled:opacity-50">
              {actionLoading ? 'Processing...' : 'Credit'}
            </button>
            <button onClick={() => { setShowCreditModal(false); setModalError(''); }} className="flex-1 px-4 py-2.5 border border-sky-border text-sky-text-secondary rounded-lg hover:bg-sky-card-hover transition-colors">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Debit Modal */}
      {showDebitModal && (
        <Modal onClose={() => { setShowDebitModal(false); setModalError(''); }}>
          <h3 className="text-lg font-bold text-white mb-4">Debit Balance</h3>
          <p className="text-sky-text-secondary text-sm mb-4">Deduct funds from {user.name}'s wallet via ledger transaction.</p>
          <input
            type="number"
            placeholder="Amount (ETB)"
            value={debitAmount}
            onChange={(e) => setDebitAmount(e.target.value)}
            className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white mb-3 focus:outline-none focus:border-sky-green"
          />
          <input
            type="text"
            placeholder="Reason (required)"
            value={debitReason}
            onChange={(e) => setDebitReason(e.target.value)}
            className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white mb-3 focus:outline-none focus:border-sky-green"
          />
          {modalError && <p className="text-sky-red text-sm mb-3">{modalError}</p>}
          <div className="flex gap-2">
            <button onClick={handleDebit} disabled={actionLoading} className="flex-1 px-4 py-2.5 bg-sky-orange hover:bg-sky-orange/80 text-sky-dark font-bold rounded-lg transition-colors disabled:opacity-50">
              {actionLoading ? 'Processing...' : 'Debit'}
            </button>
            <button onClick={() => { setShowDebitModal(false); setModalError(''); }} className="flex-1 px-4 py-2.5 border border-sky-border text-sky-text-secondary rounded-lg hover:bg-sky-card-hover transition-colors">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// BETS VIEW
// ============================================================

function BetsView({ token }: { token: string }) {
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const fetchBets = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '30', offset: (page * 30).toString() });
        if (statusFilter) params.set('status', statusFilter);
        const res = await fetch(apiUrl(`/api/admin/bets?${params}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setBets(data.data.bets || []);
          setTotal(data.data.total || 0);
        }
      } finally { setLoading(false); }
    };
    fetchBets();
  }, [token, page, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white">All Bets ({total})</h2>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm focus:outline-none focus:border-sky-green">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="CASHED_OUT">Cashed Out</option>
          <option value="LOST">Lost</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin h-8 w-8 text-sky-green mx-auto" /></div>
      ) : bets.length === 0 ? (
        <EmptyState message="No bets found" />
      ) : (
        <>
          <div className="bg-sky-card border border-sky-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Round</th>
                  <th className="px-4 py-3 text-left">Crash</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Cashout</th>
                  <th className="px-4 py-3 text-left">Payout</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/50">
                {bets.map((b) => (
                  <tr key={b.id} className="hover:bg-sky-card-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white text-sm">{b.userName}</div>
                      <div className="text-sky-text-muted text-xs">{b.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-sky-text-secondary">#{b.roundNumber}</td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {b.crashPoint ? <span className={b.crashPoint < 2 ? 'text-sky-red' : b.crashPoint < 10 ? 'text-sky-orange' : 'text-sky-green'}>{b.crashPoint}x</span> : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-white">{b.amount.toLocaleString()} ETB</td>
                    <td className="px-4 py-3 font-mono">{b.cashoutMultiplier ? `${b.cashoutMultiplier}x` : '—'}</td>
                    <td className="px-4 py-3 font-mono text-sky-green">{b.payout ? `${b.payout.toLocaleString()} ETB` : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-sky-text-muted text-xs">{new Date(b.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 30 && <Pagination page={page} total={total} limit={30} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}

// ============================================================
// PAYOUTS VIEW
// ============================================================

function PayoutsView({ token }: { token: string }) {
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchPayouts = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/admin/bets?status=CASHED_OUT&limit=30&offset=${page * 30}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setBets(data.data.bets || []);
          setTotal(data.data.total || 0);
        }
      } finally { setLoading(false); }
    };
    fetchPayouts();
  }, [token, page]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Total Payouts / Winnings ({total})</h2>
      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin h-8 w-8 text-sky-green mx-auto" /></div>
      ) : bets.length === 0 ? (
        <EmptyState message="No payouts found" />
      ) : (
        <>
          <div className="bg-sky-card border border-sky-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Round</th>
                  <th className="px-4 py-3 text-left">Bet</th>
                  <th className="px-4 py-3 text-left">Multiplier</th>
                  <th className="px-4 py-3 text-left">Payout</th>
                  <th className="px-4 py-3 text-left">Profit</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/50">
                {bets.map((b) => (
                  <tr key={b.id} className="hover:bg-sky-card-hover transition-colors">
                    <td className="px-4 py-3 text-white">{b.userName}</td>
                    <td className="px-4 py-3 text-sky-text-secondary">#{b.roundNumber}</td>
                    <td className="px-4 py-3 font-mono text-sky-text-secondary">{b.amount.toLocaleString()} ETB</td>
                    <td className="px-4 py-3 font-mono text-sky-orange">{b.cashoutMultiplier}x</td>
                    <td className="px-4 py-3 font-mono text-sky-green font-bold">{(b.payout || 0).toLocaleString()} ETB</td>
                    <td className="px-4 py-3 font-mono">
                      <span className={((b.payout || 0) - b.amount) >= 0 ? 'text-sky-green' : 'text-sky-red'}>
                        {((b.payout || 0) - b.amount) >= 0 ? '+' : ''}{((b.payout || 0) - b.amount).toLocaleString()} ETB
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sky-text-muted text-xs">{new Date(b.cashedOutAt || b.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 30 && <Pagination page={page} total={total} limit={30} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}

// ============================================================
// PLATFORM BALANCE VIEW
// ============================================================

function PlatformBalanceView({ token }: { token: string }) {
  const [wallets, setWallets] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const limit = 20;

  useEffect(() => {
    const fetchWallets = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/admin/wallets'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setWallets(data.data.wallets || []);
          setSummary(data.data.summary || {});
        }
      } finally { setLoading(false); }
    };
    fetchWallets();
  }, [token]);

  const filteredWallets = wallets.filter((w) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.userName.toLowerCase().includes(q) || w.userEmail.toLowerCase().includes(q);
  });

  const pagedWallets = filteredWallets.slice(page * limit, (page + 1) * limit);
  const pagedTotal = filteredWallets.length;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Platform Balance / Wallet Ledger</h2>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin h-8 w-8 text-sky-green mx-auto" /></div>
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-sky-card border border-sky-border rounded-xl p-4">
                <div className="text-xs text-sky-text-muted mb-1">Total Balance</div>
                <div className="text-lg font-bold text-white">{summary.totalBalance.toLocaleString()} ETB</div>
              </div>
              <div className="bg-sky-card border border-sky-border rounded-xl p-4">
                <div className="text-xs text-sky-text-muted mb-1">Total Reserved</div>
                <div className="text-lg font-bold text-sky-orange">{summary.totalReserved.toLocaleString()} ETB</div>
              </div>
              <div className="bg-sky-card border border-sky-border rounded-xl p-4">
                <div className="text-xs text-sky-text-muted mb-1">Wallets</div>
                <div className="text-lg font-bold text-sky-blue">{summary.walletsCount}</div>
              </div>
              <div className="bg-sky-card border border-sky-border rounded-xl p-4">
                <div className="text-xs text-sky-text-muted mb-1">With Balance</div>
                <div className="text-lg font-bold text-sky-green">{summary.walletsPositive}</div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-text-muted" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-8 pr-3 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm focus:outline-none focus:border-sky-green"
            />
          </div>

          {/* Wallets Table */}
          <div className="bg-sky-card border border-sky-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Balance</th>
                  <th className="px-4 py-3 text-left">Reserved</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Last Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/50">
                {pagedWallets.map((w, i) => (
                  <tr key={w.userId} className="hover:bg-sky-card-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white">{w.userName}</div>
                      <div className="text-sky-text-muted text-xs">{w.userEmail}</div>
                    </td>
                    <td className={`px-4 py-3 font-mono font-bold ${w.balance > 0 ? 'text-sky-green' : 'text-sky-text-muted'}`}>
                      {w.balance.toLocaleString()} ETB
                    </td>
                    <td className="px-4 py-3 font-mono text-sky-orange">
                      {w.reserved > 0 ? `${w.reserved.toLocaleString()} ETB` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${w.userActive ? 'bg-sky-green/20 text-sky-green' : 'bg-sky-red/20 text-sky-red'}`}>
                        {w.userActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-sky-text-muted">
                      {w.lastTransaction ? (
                        <>
                          <span className="font-mono">{w.lastTransaction.type}</span>
                          <span className="ml-1">{new Date(w.lastTransaction.createdAt).toLocaleDateString()}</span>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagedTotal > limit && <Pagination page={page} total={pagedTotal} limit={limit} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================

function StatMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-sky-card border border-sky-border rounded-xl p-3">
      <div className="text-xs text-sky-text-muted mb-1">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-sky-dark rounded-lg p-3">
      <div className="text-xs text-sky-text-muted mb-1">{label}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-sky-orange/20 text-sky-orange',
    ACTIVE: 'bg-sky-blue/20 text-sky-blue',
    APPROVED: 'bg-sky-green/20 text-sky-green',
    COMPLETED: 'bg-sky-green/20 text-sky-green',
    CASHED_OUT: 'bg-sky-green/20 text-sky-green',
    REJECTED: 'bg-sky-red/20 text-sky-red',
    LOST: 'bg-sky-red/20 text-sky-red',
    CANCELLED: 'bg-sky-text-muted/20 text-sky-text-muted',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-sky-card text-sky-text-secondary'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-sky-card border border-sky-border rounded-xl p-8 text-center">
      <p className="text-sky-text-muted text-sm">{message}</p>
    </div>
  );
}

function Pagination({ page, total, limit, onPageChange }: {
  page: number; total: number; limit: number; onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between">
      <p className="text-sky-text-muted text-sm">
        Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 bg-sky-card border border-sky-border rounded-lg text-sky-text-secondary hover:bg-sky-card-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
        >
          ← Prev
        </button>
        <span className="px-3 py-1.5 text-xs text-sky-text-muted">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={(page + 1) * limit >= total}
          className="px-3 py-1.5 bg-sky-card border border-sky-border rounded-lg text-sky-text-secondary hover:bg-sky-card-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-sky-card border border-sky-border rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-lg hover:bg-sky-card-hover text-sky-text-muted hover:text-white transition-colors">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
