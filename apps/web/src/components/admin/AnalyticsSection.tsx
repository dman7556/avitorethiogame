import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, ShieldAlert, Bell, Scale, Users, RefreshCw, ChevronLeft,
  CheckCircle2, AlertTriangle, XCircle, Info, Eye, TrendingUp, Clock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl, socketOrigin } from '../../lib/config';

/**
 * ADMIN ANALYTICS SECTION
 * -----------------------
 * Live platform metrics, financial exposure, alert center, risk events,
 * provably-fair verification panel and per-user activity timelines.
 * All data comes from the real backend — no mock values.
 * Real-time via the admin socket (admin:metrics / admin:alert / admin:online).
 */

type Section =
  | 'overview'
  | 'alerts'
  | 'risk'
  | 'fairness'
  | 'sessions'
  | 'user-timeline';

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-sky-red/20 text-sky-red border-sky-red/30',
  HIGH: 'bg-sky-orange/20 text-sky-orange border-sky-orange/30',
  WARNING: 'bg-sky-yellow/20 text-sky-yellow border-sky-yellow/30',
  INFO: 'bg-sky-blue/20 text-sky-blue border-sky-blue/30',
};

const SEVERITY_ICON: Record<string, any> = {
  CRITICAL: XCircle,
  HIGH: AlertTriangle,
  WARNING: AlertTriangle,
  INFO: Info,
};

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-sky-card border border-sky-border rounded-xl p-4">
      <div className="text-sky-text-secondary text-xs mb-1">{label}</div>
      <div className={`text-white font-bold text-lg leading-tight ${accent ?? ''}`}>{value}</div>
      {sub && <div className="text-sky-text-muted text-xs mt-1">{sub}</div>}
    </div>
  );
}

export default function AnalyticsSection() {
  const { token } = useAuth();
  const [section, setSection] = useState<Section>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [hot, setHot] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertFilter, setAlertFilter] = useState('open');
  const [riskEvents, setRiskEvents] = useState<any[]>([]);
  const [fairnessRounds, setFairnessRounds] = useState<any[]>([]);
  const [commit, setCommit] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [liveOnline, setLiveOnline] = useState(0);
  const [timelineUser, setTimelineUser] = useState('');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/analytics/overview'), { headers });
      const data = await res.json();
      if (data.success) setOverview(data.data);
    } catch (err: any) { setError(err.message); }
  }, [token]);

  const fetchList = useCallback(async (url: string, setter: (d: any) => void) => {
    setLoading(true);
    try {
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) setter(data.data);
      else setError(data.error ?? 'Request failed');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  useEffect(() => {
    if (section === 'alerts') fetchList(apiUrl(`/api/admin/alerts?resolved=${alertFilter === 'resolved'}`), setAlerts.bind(null, (v: any) => (Array.isArray(v) ? v : v.alerts ?? [])));
    if (section === 'risk') fetchList(apiUrl('/api/admin/risk-events'), (d: any) => setRiskEvents(d.events ?? []));
    if (section === 'fairness') {
      fetchList(apiUrl('/api/admin/fairness/rounds?limit=20'), setFairnessRounds);
      fetch(apiUrl('/api/admin/fairness/commit'), { headers }).then((r) => r.json()).then((d) => d.success && setCommit(d.data)).catch(() => undefined);
    }
    if (section === 'sessions') fetchList(apiUrl('/api/admin/sessions?active=true'), (d: any) => { setSessions(d.sessions ?? []); setLiveOnline(d.liveOnline ?? 0); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, alertFilter]);

  // Real-time hot metrics + alerts via the admin socket
  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { io } = require('socket.io-client');
    const socket = io(socketOrigin(), { auth: { token }, transports: ['websocket', 'polling'] });
    const onMetrics = (m: any) => setHot(m);
    const onAlert = () => { if (section === 'alerts') fetchList(apiUrl(`/api/admin/alerts?resolved=false`), setAlerts.bind(null, (v: any) => (Array.isArray(v) ? v : v.alerts ?? []))); fetchOverview(); };
    const onOnline = (o: any) => setLiveOnline(o?.onlineUsers ?? 0);
    socket.on('admin:metrics', onMetrics);
    socket.on('admin:alert', onAlert);
    socket.on('admin:online', onOnline);
    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, section]);

  const loadTimeline = async (userId: string) => {
    if (!userId.trim()) return;
    setTimelineUser(userId);
    setSection('user-timeline');
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        fetch(apiUrl(`/api/admin/users/${userId.trim()}/timeline?limit=100`), { headers }),
        fetch(apiUrl(`/api/admin/users/${userId.trim()}/profile`), { headers }),
      ]);
      const t = await tRes.json();
      const p = await pRes.json();
      if (t.success) setTimeline(t.data);
      if (p.success) setProfile(p.data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fmt = (n: any, d = 2) => (typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
  const time = (s: string) => (s ? new Date(s).toLocaleString() : '—');

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="hidden"
            aria-hidden
          />
          <Activity className="text-sky-green" size={20} />
          <h2 className="text-white font-bold text-lg">Real-Time Analytics & Risk</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['overview', 'Overview'],
            ['alerts', 'Alerts'],
            ['risk', 'Risk Events'],
            ['fairness', 'Fairness'],
            ['sessions', 'Sessions'],
            ['user-timeline', 'User Timeline'],
          ] as [Section, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                section === id
                  ? 'bg-sky-green/20 text-sky-green border border-sky-green/30'
                  : 'bg-sky-card text-sky-text-secondary border border-sky-border hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-sky-red/10 border border-sky-red/20 rounded-lg px-4 py-2 text-sm text-sky-red">{error}</div>
      )}

      {/* ---------------- OVERVIEW ---------------- */}
      {section === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCard label="LIVE USERS" value={overview ? overview.onlineUsers : '…'} sub={`${hot?.activeSockets ?? overview?.activeSockets ?? 0} sockets`} accent="text-sky-green" />
            <KpiCard label="Bets/sec" value={hot?.betsPerSecond ?? '0'} sub="10s rolling" />
            <KpiCard label="Cashouts/sec" value={hot?.cashoutsPerSecond ?? '0'} sub="10s rolling" />
            <KpiCard label="Tx/sec" value={hot?.transactionsPerSecond ?? '0'} sub="10s rolling" />
            <KpiCard label="p95 latency" value={hot?.latency ? `${Math.round(hot.latency.p95)}ms` : '…'} sub={hot?.latency ? `p99 ${Math.round(hot.latency.p99)}ms` : ''} accent={(hot?.latency?.p99 ?? 0) > 2000 ? 'text-sky-orange' : ''} />
            <KpiCard label="Event queue" value={overview?.eventQueueDepth ?? 0} sub="analytics backlog" accent={(overview?.eventQueueDepth ?? 0) > 1000 ? 'text-sky-orange' : ''} />
          </div>

          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <KpiCard label="Total Users" value={fmt(overview.totalUsers, 0)} sub={`${fmt(overview.activeUsers24h, 0)} active 24h`} />
              <KpiCard label="Bets 24h" value={fmt(overview.bets24h, 0)} sub={`${fmt(overview.wagered24h, 0)} ETB wagered`} />
              <KpiCard label="Payouts 24h" value={`${fmt(overview.payouts24h)} ETB`} sub={`GGR ${fmt(overview.ggr24h)} ETB`} />
              <KpiCard label="Deposits 24h" value={`${fmt(overview.deposits24h)} ETB`} />
              <KpiCard label="Withdrawals 24h" value={`${fmt(overview.withdrawals24h)} ETB`} sub={`${fmt(overview.pendingWithdrawals, 0)} pending`} />
              <KpiCard label="Wallet Liability" value={`${fmt(overview.walletLiability, 0)} ETB`} sub={`${fmt(overview.reservedFunds, 0)} ETB reserved`} accent="text-sky-yellow" />
            </div>
          )}

          {overview?.currentRound && (
            <div className="bg-sky-card border border-sky-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-sky-blue" />
                <h3 className="text-white font-semibold text-sm">
                  Current Round #{overview.currentRound.roundNumber} <span className="text-sky-text-muted font-normal">({overview.currentRound.phase})</span>
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-sky-text-muted">Players:</span> <span className="text-white font-mono">{overview.currentRound.players}</span></div>
                <div><span className="text-sky-text-muted">Seed commit:</span> <span className="text-white font-mono text-xs">{overview.currentRound.serverSeedHash ? `${overview.currentRound.serverSeedHash.slice(0, 16)}…` : '—'}</span></div>
              </div>
            </div>
          )}

          <p className="text-sky-text-muted text-xs">
            Financial values are derived live from the database. Metrics observe the game — they never influence outcomes.
          </p>
        </div>
      )}

      {/* ---------------- ALERTS ---------------- */}
      {section === 'alerts' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {['open', 'resolved', 'all'].map((f) => (
              <button key={f} onClick={() => setAlertFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs ${alertFilter === f ? 'bg-sky-green/20 text-sky-green' : 'bg-sky-card text-sky-text-secondary border border-sky-border'}`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {loading && <div className="text-sky-text-secondary text-sm py-6 text-center">Loading…</div>}
          {!loading && alerts.length === 0 && <div className="text-sky-text-muted text-sm py-6 text-center">No alerts.</div>}
          {alerts.map((a: any) => {
            const Icon = SEVERITY_ICON[a.severity] ?? Info;
            return (
              <div key={a.id} className={`border rounded-xl p-4 flex items-start gap-3 ${SEVERITY_STYLE[a.severity] ?? 'border-sky-border'}`}>
                <Icon size={18} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm">{a.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-black/20">{a.category}</span>
                    <span className="text-xs text-sky-text-muted">{time(a.createdAt)}</span>
                  </div>
                  <div className="text-sky-text-secondary text-sm mt-1">{a.message}</div>
                  {a.linkType === 'USER' && a.linkId && (
                    <button onClick={() => loadTimeline(a.linkId)} className="text-sky-blue text-xs mt-1 hover:underline">
                      View user timeline →
                    </button>
                  )}
                </div>
                {!a.isResolved && (
                  <button
                    onClick={async () => {
                      await fetch(apiUrl(`/api/admin/alerts/${a.id}/resolve`), { method: 'POST', headers });
                      if (section === 'alerts') fetchList(apiUrl('/api/admin/alerts?resolved=false'), setAlerts.bind(null, (v: any) => (Array.isArray(v) ? v : v.alerts ?? [])));
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-sky-green/20 text-sky-green hover:bg-sky-green/30 transition-colors flex-shrink-0"
                  >
                    Resolve
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------- RISK EVENTS ---------------- */}
      {section === 'risk' && (
        <div className="space-y-3">
          {loading && <div className="text-sky-text-secondary text-sm py-6 text-center">Loading…</div>}
          {!loading && riskEvents.length === 0 && (
            <div className="text-sky-text-muted text-sm py-6 text-center">No risk events flagged. All quiet.</div>
          )}
          {riskEvents.map((r: any) => (
            <div key={r.id} className="bg-sky-card border border-sky-border rounded-xl p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r.riskLevel === 'CRITICAL' ? 'bg-sky-red/20 text-sky-red'
                  : r.riskLevel === 'HIGH' ? 'bg-sky-orange/20 text-sky-orange'
                  : 'bg-sky-yellow/20 text-sky-yellow'
                }`}>
                  {r.riskLevel} · score {r.riskScore}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-blue/20 text-sky-blue">{r.category}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-purple/20 text-sky-purple">{r.status}</span>
                <span className="text-xs text-sky-text-muted">{time(r.createdAt)}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {(Array.isArray(r.reasons) ? r.reasons : JSON.parse(r.reasons || '[]')).map((reason: string, i: number) => (
                  <li key={i} className="text-sky-text-secondary text-sm">• {reason}</li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button onClick={() => loadTimeline(r.userId)} className="text-sky-blue text-xs hover:underline">Timeline →</button>
                {r.status === 'OPEN' && (
                  <>
                    <button
                      onClick={async () => {
                        await fetch(apiUrl(`/api/admin/risk-events/${r.id}/review`), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'UNDER_REVIEW' }) });
                        fetchList(apiUrl('/api/admin/risk-events'), (d: any) => setRiskEvents(d.events ?? []));
                      }}
                      className="text-xs px-2 py-1 rounded bg-sky-yellow/20 text-sky-yellow"
                    >Mark under review</button>
                    <button
                      onClick={async () => {
                        await fetch(apiUrl(`/api/admin/risk-events/${r.id}/review`), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CLEARED' }) });
                        fetchList(apiUrl('/api/admin/risk-events'), (d: any) => setRiskEvents(d.events ?? []));
                      }}
                      className="text-xs px-2 py-1 rounded bg-sky-green/20 text-sky-green"
                    >Clear</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- FAIRNESS ---------------- */}
      {section === 'fairness' && (
        <div className="space-y-3">
          {commit && (
            <div className="bg-sky-card border border-sky-border rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-1 flex items-center gap-2"><Scale size={15} /> Current server-seed commit</h3>
              <div className="text-xs text-sky-text-muted">Published before betting opens — SHA-256 of the hidden seed. Revealed at settlement.</div>
              <div className="font-mono text-sky-green text-sm mt-2 break-all">{commit.serverSeedHash}</div>
              <div className="text-xs text-sky-text-muted mt-1">{commit.roundsRemaining} rounds remaining before rotation</div>
            </div>
          )}
          <div className="bg-sky-card border border-sky-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-sky-card-hover">
                <tr className="text-sky-text-secondary text-xs">
                  <th className="px-3 py-2 text-left">Round</th>
                  <th className="px-3 py-2 text-left">Crash</th>
                  <th className="px-3 py-2 text-left">Commit</th>
                  <th className="px-3 py-2 text-left">Seed</th>
                  <th className="px-3 py-2 text-left">Verification</th>
                </tr>
              </thead>
              <tbody>
                {fairnessRounds.map((r: any) => (
                  <tr key={r.roundNumber} className="border-t border-sky-border">
                    <td className="px-3 py-2 text-white font-mono">#{r.roundNumber}</td>
                    <td className="px-3 py-2 text-white font-mono">{r.crashPoint != null ? `${r.crashPoint.toFixed(2)}x` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-sky-text-muted">{r.serverSeedHash ? `${r.serverSeedHash.slice(0, 10)}…` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-sky-text-muted">{r.revealed ? `${r.serverSeed.slice(0, 10)}…` : 'pending'}</td>
                    <td className="px-3 py-2">
                      {r.verification?.valid ? (
                        <span className="text-sky-green text-xs flex items-center gap-1"><CheckCircle2 size={13} /> Verified</span>
                      ) : (
                        <span className="text-sky-yellow text-xs">{r.verification?.detail ?? 'pending reveal'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sky-text-muted text-xs">
            Verification recomputes HMAC_SHA256(serverSeed, "sky-rush:" + roundNumber) → crash point and compares with the recorded outcome.
          </p>
        </div>
      )}

      {/* ---------------- SESSIONS ---------------- */}
      {section === 'sessions' && (
        <div className="space-y-3">
          <div className="text-sm text-sky-text-secondary">{liveOnline} users online now</div>
          {sessions.map((s: any) => (
            <div key={s.id} className="bg-sky-card border border-sky-border rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-white text-sm font-medium">User {s.userId.slice(0, 12)}…</div>
                <div className="text-xs text-sky-text-muted">started {time(s.startedAt)} · {s.betsPlaced} bets · {fmt(s.totalWagered)} ETB wagered</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-sky-text-muted">{s.ipAddress ?? 'no ip'}</span>
                <button onClick={() => loadTimeline(s.userId)} className="text-sky-blue text-xs hover:underline">Timeline →</button>
              </div>
            </div>
          ))}
          {!loading && sessions.length === 0 && <div className="text-sky-text-muted text-sm py-6 text-center">No active sessions.</div>}
        </div>
      )}

      {/* ---------------- USER TIMELINE ---------------- */}
      {section === 'user-timeline' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={timelineUser}
              onChange={(e) => setTimelineUser(e.target.value)}
              placeholder="Enter user ID"
              className="flex-1 bg-sky-card border border-sky-border rounded-lg px-3 py-2 text-sm text-white placeholder-sky-text-muted"
            />
            <button onClick={() => loadTimeline(timelineUser)} className="px-4 py-2 rounded-lg bg-sky-green/20 text-sky-green text-sm font-medium">
              Load
            </button>
          </div>

          {profile && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <KpiCard label="Balance" value={`${fmt(profile.balance)} ETB`} sub={`${fmt(profile.reserved)} reserved`} />
              <KpiCard label="Deposits" value={`${fmt(profile.totalDeposits)} ETB`} sub={`${profile.approvedDepositCount} approved`} />
              <KpiCard label="Withdrawals" value={`${fmt(profile.totalWithdrawals)} ETB`} />
              <KpiCard label="Wagered" value={`${fmt(profile.totalWagered)} ETB`} sub={`${profile.totalBets} bets`} />
              <KpiCard label="Net gaming" value={`${fmt(profile.netGaming)} ETB`} accent={profile.netGaming >= 0 ? 'text-sky-green' : 'text-sky-orange'} />
              <KpiCard label="Avg cashout" value={profile.avgCashoutMultiplier ? `${profile.avgCashoutMultiplier.toFixed(2)}x` : '—'} />
            </div>
          )}

          <div className="bg-sky-card border border-sky-border rounded-xl divide-y divide-sky-border">
            {timeline.map((e: any) => (
              <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-sky-text-muted text-xs w-36 flex-shrink-0">{time(e.timestamp)}</span>
                <span className="text-sky-blue text-xs font-mono w-44 flex-shrink-0 truncate">{e.eventType}</span>
                {e.amount != null && <span className="text-white font-mono text-xs">{fmt(e.amount)} ETB</span>}
                {e.links?.round && <span className="text-sky-text-muted text-xs">round #{(e.links.round as any).roundNumber}</span>}
                {e.links?.bet && <span className="text-sky-text-muted text-xs">bet {(e.links.bet as any).status}</span>}
                {e.links?.transaction && <span className="text-sky-text-muted text-xs">tx {(e.links.transaction as any).type}</span>}
              </div>
            ))}
            {!loading && timeline.length === 0 && (
              <div className="text-sky-text-muted text-sm py-6 text-center">No activity events for this user.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
