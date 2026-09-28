import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/PageHeader';
import { apiUrl } from '../../lib/config';

interface Withdrawal {
  id: string;
  amount: number;
  paymentMethod: string;
  accountNumber: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  rejectionReason?: string;
  createdAt: string;
}

export default function WithdrawalHistoryPage() {
  const { token } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithdrawals();
  }, [token]);

  const fetchWithdrawals = async () => {
    try {
      const res = await fetch(apiUrl('/api/withdrawals?limit=50'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);
      setWithdrawals(data.data.withdrawals);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-sky-orange/20 text-sky-orange';
      case 'APPROVED':
      case 'COMPLETED':
        return 'bg-sky-green/20 text-sky-green';
      case 'REJECTED':
        return 'bg-sky-red/20 text-sky-red';
      default:
        return 'bg-sky-border text-sky-text-secondary';
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-sky-dark flex items-center justify-center">
        <div className="text-sky-text-secondary">Loading withdrawals...</div>
      </div>
    );

  return (
    <div className="min-h-screen bg-sky-dark">
      <PageHeader title="Withdrawal History" backTo="/dashboard" backLabel="Back" />
      
      <div className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-4 text-sky-red text-sm mb-6">
            {error}
          </div>
        )}

        {withdrawals.length === 0 ? (
          <div className="bg-sky-card border border-sky-border rounded-xl p-8 text-center">
            <p className="text-sky-text-secondary">No withdrawals yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w) => (
              <div key={w.id} className="bg-sky-card border border-sky-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white mb-1">{w.amount.toFixed(2)} ETB</div>
                  <div className="text-sm text-sky-text-muted">{w.paymentMethod} · {w.accountNumber}</div>
                  <div className="text-xs text-sky-text-muted mt-0.5">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </div>
                  {w.rejectionReason && (
                    <div className="text-xs text-sky-red mt-1">Reason: {w.rejectionReason}</div>
                  )}
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold self-start sm:self-center ${getStatusStyle(w.status)}`}>
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
