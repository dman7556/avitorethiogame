import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl } from '../../lib/config';

export default function AdminSettings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [token]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/admin/settings'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);
      setSettings(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200">{error}</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">System Settings</h1>
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <pre className="text-gray-300 overflow-auto">{JSON.stringify(settings, null, 2)}</pre>
      </div>
    </div>
  );
}
