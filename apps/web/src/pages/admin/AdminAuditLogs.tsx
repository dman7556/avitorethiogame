import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl } from '../../lib/config';

interface AuditLog {
  id: string;
  adminName: string;
  action: string;
  targetUserName?: string;
  createdAt: string;
  metadata?: string;
}

export default function AdminAuditLogs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchLogs();
  }, [page, token]);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: (page * 50).toString(),
      });

      const res = await fetch(apiUrl(`/api/admin/audit-logs?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setLogs(data.data.logs);
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
      <h1 className="text-3xl font-bold mb-8">Audit Logs</h1>
      {loading ? (
        <div className="text-center">Loading...</div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Admin</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Action</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Target User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-sm">{new Date(log.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm">{log.adminName}</td>
                  <td className="px-4 py-3 text-sm font-mono text-yellow-400">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{log.targetUserName || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
