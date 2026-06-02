import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

// Client-side render for the per-recipient "View email" of a CSV row
// (mirrors src/lib/templateRenderer.js).
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}
function paragraphToHtml(str) {
  return escapeHtml(str).replace(/\r?\n/g, '<br>');
}
function renderCsvPreview(html, row) {
  return String(html || '')
    .replace(/\{\{recipient_name\}\}/g, escapeHtml(row?.recipientName || ''))
    .replace(/\{\{company_paragraph\}\}/g, paragraphToHtml(row?.paragraph || ''))
    .replace(/\{\{unsubscribe_url\}\}/g, 'https://www.balkansummit.org/unsubscribe');
}

const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) + '%' : '—');

// CSV export helpers — quote special chars and guard against spreadsheet formula injection.
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function downloadCsv(rows, name) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENDING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  FAILED: 'bg-red-100 text-red-700',
};

const LOG_STATUS_COLORS = {
  PENDING: 'bg-gray-100 text-gray-600',
  SENT: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  BOUNCED: 'bg-orange-100 text-orange-700',
  COMPLAINED: 'bg-purple-100 text-purple-700',
};

function recipientOf(log) {
  if (log.toEmails) return log.toEmails;                       // CSV row
  return log.contact?.email || `contact #${log.contactId}`;   // contact row
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [progress, setProgress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logStatus, setLogStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [viewLog, setViewLog] = useState(null);   // log whose email is shown in the modal
  const [viewHtml, setViewHtml] = useState('');
  const [showTest, setShowTest] = useState(false);
  const pollRef = useRef(null);

  const isCsv = !!campaign?.isCsv;

  async function fetchCampaign() {
    try {
      const { data } = await api.get(`/campaigns/${id}`);
      setCampaign(data);
      setProgress(data.progress);
    } catch {
      toast.error('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }

  async function fetchProgress() {
    try {
      const { data } = await api.get(`/campaigns/${id}/progress`);
      setProgress(data);
      if (data.campaignStatus !== 'SENDING') stopPolling();
      setCampaign(c => (c && data.campaignStatus !== c.status ? { ...c, status: data.campaignStatus } : c));
    } catch {
      // ignore poll errors
    }
  }

  async function fetchLogs(s = logStatus) {
    try {
      const params = s ? { status: s } : {};
      const { data } = await api.get(`/campaigns/${id}/logs`, { params });
      setLogs(data);
    } catch {
      toast.error('Failed to load send logs');
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => { fetchProgress(); fetchLogs(); }, 3000);
  }
  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    fetchCampaign();
    fetchLogs('');
    return () => stopPolling();
  }, [id]);

  useEffect(() => {
    if (campaign?.status === 'SENDING') startPolling();
    else stopPolling();
  }, [campaign?.status]);

  async function handleSend(limit) {
    setActionLoading(true);
    setShowSendModal(false);
    try {
      const body = limit ? { limit } : {};
      const { data } = await api.post(`/campaigns/${id}/send`, body);
      toast.success(`Sending started — ${data.total} recipient(s) queued`);
      setCampaign(c => ({ ...c, status: 'SENDING' }));
      fetchProgress();
      startPolling();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start send');
    } finally {
      setActionLoading(false);
    }
  }

  function handleSendCsv() {
    if (!confirm(`Send to ${progress?.total ?? 'all'} recipient(s)? This cannot be undone.`)) return;
    handleSend(null);
  }

  async function handlePause() {
    setActionLoading(true);
    try {
      await api.post(`/campaigns/${id}/pause`);
      toast.success('Campaign paused');
      setCampaign(c => ({ ...c, status: 'PAUSED' }));
      stopPolling();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to pause');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResume() {
    setActionLoading(true);
    try {
      await api.post(`/campaigns/${id}/resume`);
      toast.success('Campaign resumed');
      setCampaign(c => ({ ...c, status: 'SENDING' }));
      startPolling();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resume');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleView(log) {
    setViewLog(log);
    setViewHtml('');
    try {
      if (log.contactId == null) {
        setViewHtml(renderCsvPreview(campaign.templateHtml, log)); // CSV row → render from stored fields
      } else {
        const { data } = await api.get(`/campaigns/${id}/preview`, { params: { contactId: log.contactId }, responseType: 'text' });
        setViewHtml(data);
      }
    } catch {
      toast.error('Failed to render email');
      setViewLog(null);
    }
  }

  function handleLogStatusChange(e) {
    setLogStatus(e.target.value);
    fetchLogs(e.target.value);
  }

  async function handleTest(email) {
    try {
      const { data } = await api.post(`/campaigns/${id}/test`, { email });
      toast.success(`Test sent to ${data.sentTo}`);
      setShowTest(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Test send failed');
    }
  }

  async function handleRetry() {
    if (!confirm('Resend all failed recipients?')) return;
    try {
      const { data } = await api.post(`/campaigns/${id}/retry`);
      toast.success(`Retrying ${data.retried} failed recipient(s)`);
      setCampaign(c => ({ ...c, status: 'SENDING' }));
      fetchProgress();
      startPolling();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Retry failed');
    }
  }

  async function handleExport() {
    try {
      const { data } = await api.get(`/campaigns/${id}/logs`);
      const header = ['recipient', 'cc', 'subject', 'status', 'delivered_at', 'opens', 'clicks', 'sent_at', 'error'];
      const rows = data.map(l => [
        recipientOf(l), l.cc || '', l.subject || campaign.subject, l.status,
        l.deliveredAt ? new Date(l.deliveredAt).toISOString() : '',
        l.openCount || 0, l.clickCount || 0,
        l.sentAt ? new Date(l.sentAt).toISOString() : '', l.error || '',
      ]);
      downloadCsv([header, ...rows], `campaign-${id}-results.csv`);
    } catch {
      toast.error('Export failed');
    }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;
  if (!campaign) return <p className="text-gray-500 text-sm">Campaign not found.</p>;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate('/campaigns')} className="text-sm text-gray-500 hover:text-gray-700 mb-1">
            ← Campaigns
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900">{campaign.name}</h2>
            {isCsv && <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">CSV</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{campaign.subject}</p>
          {isCsv && campaign.senderName && (
            <p className="text-xs text-gray-400 mt-0.5">From “{campaign.senderName}” · unsubscribe group {campaign.asmGroupId || '—'}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2.5 py-1 rounded text-xs font-medium ${STATUS_COLORS[campaign.status]}`}>
            {campaign.status}
          </span>
          <button onClick={() => setShowTest(true)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
            Send test
          </button>
          {!isCsv && (
            <button onClick={() => setEditMode(e => !e)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
              {editMode ? 'Cancel edit' : 'Edit'}
            </button>
          )}
          {campaign.status === 'DRAFT' && (
            <button
              onClick={isCsv ? handleSendCsv : () => setShowSendModal(true)}
              disabled={actionLoading}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
              {actionLoading ? 'Starting…' : 'Send campaign'}
            </button>
          )}
          {campaign.status === 'SENDING' && (
            <button onClick={handlePause} disabled={actionLoading} className="px-3 py-1.5 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded-md disabled:opacity-50">
              {actionLoading ? '…' : 'Pause'}
            </button>
          )}
          {campaign.status === 'PAUSED' && (
            <button onClick={handleResume} disabled={actionLoading} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
              {actionLoading ? '…' : 'Resume'}
            </button>
          )}
        </div>
      </div>

      {/* Progress + engagement summary */}
      {progress && progress.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Progress</h3>
            <span className="text-sm text-gray-500">{progress.percentComplete}% sent</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress.percentComplete}%` }} />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 text-center">
            {[
              { label: 'Sent', val: progress.sent, color: 'text-green-600' },
              { label: 'Delivered', val: progress.delivered, color: 'text-emerald-600' },
              { label: 'Opened', val: progress.opened, color: 'text-blue-600' },
              { label: 'Clicked', val: progress.clicked, color: 'text-cyan-600' },
              { label: 'Pending', val: progress.pending, color: 'text-gray-500' },
              { label: 'Failed', val: progress.failed, color: 'text-red-500' },
              { label: 'Bounced', val: progress.bounced, color: 'text-orange-500' },
              { label: 'Spam', val: progress.complained, color: 'text-purple-500' },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <p className={`text-lg font-semibold ${color}`}>{(val || 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs text-gray-500">
            <span>Open rate <b className="text-gray-700">{rate(progress.opened, progress.delivered)}</b> <span className="text-gray-400">(of delivered)</span></span>
            <span>Click rate <b className="text-gray-700">{rate(progress.clicked, progress.delivered)}</b> <span className="text-gray-400">(of delivered)</span></span>
            <span>Bounce rate <b className="text-gray-700">{rate(progress.bounced, progress.total)}</b> <span className="text-gray-400">(of total)</span></span>
          </div>
          {(progress.delivered === 0 && progress.opened === 0 && progress.sent > 0) && (
            <p className="text-[11px] text-gray-400 mt-3">
              Delivered/Opened/Clicked/Spam populate from SendGrid’s event webhook — they stay at 0 until the webhook is publicly reachable (after deploy).
            </p>
          )}
        </div>
      )}

      {/* Edit form (contact campaigns only) */}
      {editMode && !isCsv && (
        <EditForm
          campaign={campaign}
          onSaved={updated => { setCampaign(updated); setEditMode(false); toast.success('Campaign updated'); }}
          onCancel={() => setEditMode(false)}
        />
      )}

      {/* Sent emails list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Emails {logs.length > 0 && <span className="text-gray-400 font-normal">({logs.length})</span>}</h3>
          <div className="flex gap-2 items-center">
            {progress?.failed > 0 && campaign.status !== 'SENDING' && (
              <button onClick={handleRetry} className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-2 py-1">Retry {progress.failed} failed</button>
            )}
            {logs.length > 0 && (
              <button onClick={handleExport} className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">Export CSV</button>
            )}
            <select value={logStatus} onChange={handleLogStatusChange} className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none">
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="BOUNCED">Bounced</option>
              <option value="COMPLAINED">Spam</option>
            </select>
            <button onClick={() => fetchLogs(logStatus)} className="text-xs text-blue-600 hover:underline">Refresh</button>
          </div>
        </div>
        {logs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500 text-center">No emails yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600 text-xs">
                  <th className="px-4 py-2.5 font-medium">Recipient</th>
                  {isCsv && <th className="px-4 py-2.5 font-medium">Subject</th>}
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Delivered</th>
                  <th className="px-4 py-2.5 font-medium">Opened</th>
                  <th className="px-4 py-2.5 font-medium">Clicked</th>
                  <th className="px-4 py-2.5 font-medium">Sent at</th>
                  <th className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700">
                      <div className="truncate max-w-[18rem]">{recipientOf(log)}</div>
                      {log.cc && <div className="text-[11px] text-gray-400 truncate max-w-[18rem]">cc: {log.cc}</div>}
                      {log.error && <div className="text-[11px] text-red-500 truncate max-w-[18rem]" title={log.error}>{log.error}</div>}
                    </td>
                    {isCsv && <td className="px-4 py-2.5 text-gray-600 truncate max-w-[16rem]">{log.subject || '—'}</td>}
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${LOG_STATUS_COLORS[log.status]}`}>
                        {log.status === 'COMPLAINED' ? 'SPAM' : log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {log.deliveredAt ? <span className="text-emerald-600">✓ {new Date(log.deliveredAt).toLocaleDateString()}</span> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {log.openCount > 0
                        ? <span className="text-blue-600" title={log.openedAt ? new Date(log.openedAt).toLocaleString() : ''}>✓ {log.openCount}×</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {log.clickCount > 0
                        ? <span className="text-cyan-600" title={log.clickedAt ? new Date(log.clickedAt).toLocaleString() : ''}>✓ {log.clickCount}×</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => handleView(log)} className="text-xs text-blue-600 hover:underline">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showSendModal && <SendModal onClose={() => setShowSendModal(false)} onConfirm={handleSend} />}
      {showTest && <TestModal onClose={() => setShowTest(false)} onSend={handleTest} />}
      {viewLog && <EmailViewModal html={viewHtml} recipient={recipientOf(viewLog)} subject={viewLog.subject || campaign.subject} onClose={() => setViewLog(null)} />}
    </div>
  );
}

function TestModal({ onClose, onSend }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    await onSend(email.trim());
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Send a test</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Sends one copy (rendered with the first recipient’s content) to the address below. No Cc, not tracked.</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
            placeholder="you@example.com"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={sending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
              {sending ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmailViewModal({ html, recipient, subject, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{subject}</p>
            <p className="text-xs text-gray-500 truncate">To: {recipient}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3">&times;</button>
        </div>
        <div className="flex-1 overflow-hidden p-3">
          {html
            ? <iframe srcDoc={html} title="Email" className="w-full h-[70vh] border border-gray-200 rounded" sandbox="allow-same-origin" />
            : <p className="text-sm text-gray-500 p-6 text-center">Rendering…</p>}
        </div>
      </div>
    </div>
  );
}

function SendModal({ onClose, onConfirm }) {
  const [limitEnabled, setLimitEnabled] = useState(true);
  const [limit, setLimit] = useState('50');

  function handleSubmit(e) {
    e.preventDefault();
    const n = limitEnabled ? parseInt(limit, 10) : null;
    if (limitEnabled && (!n || n < 1)) return;
    onConfirm(n);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Send campaign</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" checked={!limitEnabled} onChange={() => setLimitEnabled(false)} className="accent-blue-600" />
              Send to all eligible contacts
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" checked={limitEnabled} onChange={() => setLimitEnabled(true)} className="accent-blue-600" />
              Send to a specific number
            </label>
            {limitEnabled && (
              <input type="number" min={1} value={limit} onChange={e => setLimit(e.target.value)} autoFocus
                className="ml-6 w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
          </div>
          <p className="text-xs text-gray-400">
            Contacts are picked in order of ID. If you send in batches, the next batch continues where this one left off — the campaign returns to Draft automatically.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md">Start sending</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditForm({ campaign, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: campaign.name,
    subject: campaign.subject,
    templateHtml: campaign.templateHtml,
    dynamicLogic: campaign.dynamicLogic ? JSON.stringify(JSON.parse(campaign.dynamicLogic), null, 2) : '',
  });
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.dynamicLogic) {
        try { JSON.parse(payload.dynamicLogic); }
        catch { toast.error('Dynamic logic must be valid JSON'); setLoading(false); return; }
      } else {
        payload.dynamicLogic = null;
      }
      const { data } = await api.put(`/campaigns/${campaign.id}`, payload);
      onSaved(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update campaign');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Edit campaign</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Name" value={form.name} onChange={v => set('name', v)} required />
        <Field label="Subject" value={form.subject} onChange={v => set('subject', v)} required />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">HTML template</label>
          <textarea value={form.templateHtml} onChange={e => set('templateHtml', e.target.value)} rows={8}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Dynamic logic (JSON, optional)</label>
          <textarea value={form.dynamicLogic} onChange={e => set('dynamicLogic', e.target.value)} rows={4}
            placeholder='{"withCustomField": "<p>...</p>", "withoutCustomField": "<p>...</p>"}'
            className="border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, required }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">{label}{required ? ' *' : ''}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} required={required}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}
