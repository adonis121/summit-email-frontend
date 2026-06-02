import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">
        {value === null ? '—' : value.toLocaleString()}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, campaignsRes] = await Promise.all([
          api.get('/contacts/stats'),
          api.get('/campaigns'),
        ]);
        setStats(statsRes.data);
        setCampaigns(campaignsRes.data);
      } catch {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalSent = campaigns.reduce((sum, c) => sum + (c.progress?.sent || 0), 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'SENDING').length;

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading…</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total contacts" value={stats?.total ?? null} />
        <StatCard label="Active contacts" value={stats?.active ?? null} />
        <StatCard label="Emails sent (all time)" value={totalSent} />
        <StatCard label="Active campaigns" value={activeCampaigns} />
      </div>

      <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent campaigns</h3>
      {campaigns.length === 0 ? (
        <p className="text-sm text-gray-500">No campaigns yet. <Link to="/campaigns" className="text-blue-600 hover:underline">Create one</Link>.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Progress</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 5).map(c => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/campaigns/${c.id}`} className="text-blue-600 hover:underline font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.progress.sent.toLocaleString()} / {c.progress.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${c.progress.percentComplete}%` }}
                        />
                      </div>
                      <span className="text-gray-500 text-xs w-8">{c.progress.percentComplete}%</span>
                    </div>
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

function StatusBadge({ status }) {
  const colors = {
    DRAFT: 'bg-gray-100 text-gray-600',
    SENDING: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-green-100 text-green-700',
    PAUSED: 'bg-yellow-100 text-yellow-700',
    FAILED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}
