import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl } from '../../lib/config';

interface Transaction {
  id: string;
  userName: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export default function AdminTransactions() {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchTransactions();
  }, [page, token]);

  const fetchTransactions = async () => {
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: (page * 50).toString(),
      });

      const res = await fetch(apiUrl(`/api/admin/transactions?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setTransactions(data.data.transactions);
        setTotal(data.data.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Transaction Ledger</h1>
      {loading ? (
        <div className="text-center">Loading...</div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">User</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Before</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-sm">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm">{t.userName}</td>
                  <td className="px-4 py-3 text-sm font-mono text-blue-400">{t.type}</td>
                  <td className="px-4 py-3 text-sm">{t.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{t.balanceBefore.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-green-400">{t.balanceAfter.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
