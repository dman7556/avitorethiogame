import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/PageHeader';
import { apiUrl } from '../../lib/config';

interface Deposit {
  id: string;
  submittedAmount: number;
  verifiedAmount?: number;
  paymentMethod: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  createdAt: string;
}

export default function DepositHistoryPage() {
  const { token } = useAuth();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDeposits();
  }, [token]);

  const fetchDeposits = async () => {
    try {
      const res = await fetch(apiUrl('/api/deposits?limit=50'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);
      setDeposits(data.data.deposits);
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
        <div className="text-sky-text-secondary">Loading deposits...</div>
      </div>
    );

  return (
    <div className="min-h-screen bg-sky-dark">
      <PageHeader title="Deposit History" backTo="/dashboard" backLabel="Back" />
      
      <div className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-4 text-sky-red text-sm mb-6">
            {error}
          </div>
        )}

        {deposits.length === 0 ? (
          <div className="bg-sky-card border border-sky-border rounded-xl p-8 text-center">
            <p className="text-sky-text-secondary">No deposits yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deposits.map((d) => (
              <div key={d.id} className="bg-sky-card border border-sky-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">{d.submittedAmount.toFixed(2)} ETB</span>
                    {d.verifiedAmount && d.verifiedAmount !== d.submittedAmount && (
                      <span className="text-xs text-sky-blue">Verified: {d.verifiedAmount.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="text-sm text-sky-text-muted">{d.paymentMethod}</div>
                  <div className="text-xs text-sky-text-muted mt-0.5">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </div>
                  {d.rejectionReason && (
                    <div className="text-xs text-sky-red mt-1">Reason: {d.rejectionReason}</div>
                  )}
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold self-start sm:self-center ${getStatusStyle(d.status)}`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
