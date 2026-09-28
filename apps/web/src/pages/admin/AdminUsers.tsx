import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl } from '../../lib/config';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  balance: number;
  reserved: number;
  createdAt: string;
}

export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, [page, token]);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: (page * 20).toString(),
      });

      const res = await fetch(apiUrl(`/api/admin/users?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setUsers(data.data.users);
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
      <h1 className="text-3xl font-bold mb-8">Users</h1>
      {loading ? (
        <div className="text-center">Loading...</div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Balance</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4">{u.name}</td>
                  <td className="px-6 py-4">{u.email}</td>
                  <td className="px-6 py-4">{u.balance.toFixed(2)} ETB</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-sm ${u.isActive ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                      {u.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
