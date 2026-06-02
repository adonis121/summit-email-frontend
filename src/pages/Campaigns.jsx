import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENDING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  async function fetchCampaigns() {
    try {
      const { data } = await api.get('/campaigns');
      setCampaigns(data);
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCampaigns(); }, []);

  async function handleDelete(id, e) {
    e.preventDefault();
    if (!confirm('Delete this draft campaign?')) return;
    try {
      await api.delete(`/campaigns/${id}`);
      toast.success('Campaign deleted');
      fetchCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Campaigns</h2>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
        >
          New campaign
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-gray-500">No campaigns yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Progress</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/campaigns/${c.id}`} className="text-blue-600 hover:underline font-medium">
                      {c.name}
                    </Link>
                    <p className="text-gray-400 text-xs mt-0.5 truncate max-w-xs">{c.subject}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.progress.total > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${c.progress.percentComplete}%` }}
                          />
                        </div>
                        <span className="text-gray-500 text-xs">
                          {c.progress.sent}/{c.progress.total}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === 'DRAFT' && (
                      <button
                        onClick={e => handleDelete(c.id, e)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NewCampaignModal
          onClose={() => setShowModal(false)}
          onCreated={id => navigate(`/campaigns/${id}`)}
        />
      )}
    </div>
  );
}

function NewCampaignModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', subject: '', templateHtml: '' });
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/campaigns', form);
      toast.success('Campaign created');
      onCreated(data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">New campaign</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Campaign name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Subject *</label>
            <input
              type="text"
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">HTML template *</label>
            <textarea
              value={form.templateHtml}
              onChange={e => set('templateHtml', e.target.value)}
              required
              rows={6}
              placeholder="<p>Hi {{firstName}},</p>"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
