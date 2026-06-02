import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import api from '../lib/api';
import toast from 'react-hot-toast';

// Mirrors the server-side renderer (src/lib/templateRenderer.js) for the in-browser preview.
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}
function paragraphToHtml(str) {
  return escapeHtml(str).replace(/\r?\n/g, '<br>');
}
function renderPreview(html, row) {
  return html
    .replace(/\{\{recipient_name\}\}/g, escapeHtml(row?.recipientName || ''))
    .replace(/\{\{company_paragraph\}\}/g, paragraphToHtml(row?.paragraph || ''))
    .replace(/\{\{unsubscribe_url\}\}/g, 'https://www.balkansummit.org/unsubscribe');
}

const REQUIRED_COLUMNS = ['recipient_email', 'subject'];
const KNOWN_TOKENS = ['recipient_name', 'company_paragraph', 'unsubscribe_url'];

// Downloadable sample so users have a correctly-formatted starting point.
// Rows show: single to+cc, single to with multiple cc, multiple to, and multiple to+cc.
// Multiple addresses in either column are separated with a semicolon ';'.
const SAMPLE_CSV = `recipient_email,recipient_name,cc,subject,company_paragraph
jane.doe@acme.com,Ms. Jane Doe,assistant@acme.com,Invitation to Balkan Summit 2026,"Acme's leadership in grid-scale renewables maps directly onto the energy-infrastructure portfolios being presented in Pristina."
m.rossi@buildgroup.eu,Mr. Rossi,"assistant@buildgroup.eu;cfo@buildgroup.eu;legal@buildgroup.eu",Balkan Summit 2026 — Partnership Opportunity,"With BuildGroup's two decades delivering EPC and concession projects across Southeast Europe, the Summit offers early access to the pipeline taking shape across the region."
"director@nordicinfra.no;cfo@nordicinfra.no","Director Hansen and the Nordic Infra team",team@nordicinfra.no,Balkan Summit 2026 — Invitation for Nordic Infra,"Nordic Infra's track record on donor-funded transport projects positions your team for the PPP and concession opportunities at the heart of this Summit."
"ceo@adriabuild.hr;coo@adriabuild.hr",AdriaBuild leadership,"board@adriabuild.hr;assistant@adriabuild.hr",Balkan Summit 2026 — Partnership Invitation,"AdriaBuild's regional construction portfolio aligns closely with the public-infrastructure projects and PPP opportunities at the centre of the Summit."
`;

// Placeholder used to render the email preview before a CSV is loaded.
const SAMPLE_PREVIEW_ROW = {
  recipientName: 'Mr. Sample Recipient',
  paragraph: 'This is where each recipient’s personalized paragraph from the CSV will appear.',
};

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample-recipients.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function CsvSend() {
  const [name, setName] = useState('');
  const [senderName, setSenderName] = useState('Balkan Summit 2026');
  const [asmGroupId, setAsmGroupId] = useState('123553');
  const [templateHtml, setTemplateHtml] = useState('');
  const [htmlFileName, setHtmlFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvError, setCsvError] = useState('');

  const [creating, setCreating] = useState(false);
  const [campaign, setCampaign] = useState(null); // { id, total } once draft is created
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(null);

  const phase = progress ? 'progress' : campaign ? 'review' : 'upload';

  // ---- file handlers ----
  function handleHtmlFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setHtmlFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setTemplateHtml(String(reader.result));
    reader.readAsText(file);
  }

  function handleCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: res => {
        const fields = (res.meta.fields || []).map(f => f.trim().toLowerCase());
        const missing = REQUIRED_COLUMNS.filter(c => !fields.includes(c));
        if (missing.length) {
          setCsvError(`CSV is missing required column(s): ${missing.join(', ')}. Expected headers: recipient_email, recipient_name, cc, subject, company_paragraph.`);
          setRows([]);
          return;
        }
        const get = (r, k) => {
          const key = Object.keys(r).find(kk => kk.trim().toLowerCase() === k);
          return key ? r[key] : '';
        };
        const mapped = res.data
          .map(r => ({
            to: String(get(r, 'recipient_email') || '').trim(),
            recipientName: String(get(r, 'recipient_name') || '').trim(),
            cc: String(get(r, 'cc') || '').trim(),
            subject: String(get(r, 'subject') || '').trim(),
            paragraph: String(get(r, 'company_paragraph') || ''),
          }))
          .filter(r => r.to);
        if (mapped.length === 0) setCsvError('No rows with a recipient_email were found.');
        setRows(mapped);
      },
      error: err => setCsvError('Failed to parse CSV: ' + err.message),
    });
  }

  // Tokens in the template that the CSV can't fill (surfaced before submit, matching server validation).
  const unknownTokens = [...new Set(
    (templateHtml.match(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g) || []).map(t => t.replace(/[{}\s]/g, ''))
  )].filter(t => !KNOWN_TOKENS.includes(t));

  const canCreate = name.trim() && templateHtml && rows.length > 0 && unknownTokens.length === 0;

  // ---- actions ----
  async function handleCreate(e) {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    try {
      const { data } = await api.post('/campaigns/csv', {
        name: name.trim(),
        senderName: senderName.trim(),
        asmGroupId: asmGroupId.trim(),
        templateHtml,
        rows,
      });
      setCampaign(data);
      toast.success(`Draft created — ${data.total} recipient(s)`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create draft');
    } finally {
      setCreating(false);
    }
  }

  async function handleSend() {
    if (!campaign) return;
    if (!confirm(`Send to ${campaign.total} recipient(s) now? This cannot be undone.`)) return;
    setSending(true);
    try {
      await api.post(`/campaigns/${campaign.id}/send`);
      toast.success('Sending started');
      startPolling();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start send');
      setSending(false);
    }
  }

  async function handleDiscard() {
    if (!campaign) return;
    if (!confirm('Discard this draft?')) return;
    try {
      await api.delete(`/campaigns/${campaign.id}`);
      toast.success('Draft discarded');
    } catch {
      // ignore — draft may already be sending
    }
    setCampaign(null);
  }

  function startPolling() {
    if (pollRef.current) return;
    fetchProgress();
    pollRef.current = setInterval(fetchProgress, 3000);
  }
  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }
  async function fetchProgress() {
    try {
      const { data } = await api.get(`/campaigns/${campaign.id}/progress`);
      setProgress(data);
      if (data.campaignStatus !== 'SENDING') stopPolling();
    } catch {
      // ignore poll errors
    }
  }
  useEffect(() => () => stopPolling(), []);

  function startOver() {
    stopPolling();
    setCampaign(null); setProgress(null); setSending(false);
    setRows([]); setCsvFileName(''); setCsvError('');
    setTemplateHtml(''); setHtmlFileName(''); setName('');
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">CSV Send</h2>
      <p className="text-sm text-gray-500 mb-6">
        Upload an HTML template and a CSV of recipients. Each row gets its own subject, Cc and personalized paragraph.
      </p>

      {phase === 'upload' && (
        <form onSubmit={handleCreate} className="flex flex-col gap-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Campaign name *" value={name} onChange={setName} placeholder="Balkan Summit — partner outreach" />
              <Field label="Sender name" value={senderName} onChange={setSenderName} placeholder="Balkan Summit 2026" hint="Shown as the From display name." />
              <Field label="ASM unsubscribe group ID" value={asmGroupId} onChange={setAsmGroupId} placeholder="123553" hint="Enables one-click List-Unsubscribe." />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-4">
            <FileRow
              label="HTML template *"
              accept=".html,text/html"
              fileName={htmlFileName}
              onChange={handleHtmlFile}
              status={templateHtml ? `${templateHtml.length.toLocaleString()} chars loaded` : null}
            />
            {unknownTokens.length > 0 && (
              <p className="text-xs text-red-600">
                Template has tokens the CSV can't fill: {unknownTokens.map(t => `{{${t}}}`).join(', ')}.
                Supported: {KNOWN_TOKENS.map(t => `{{${t}}}`).join(', ')}.
              </p>
            )}

            <FileRow
              label="Recipients CSV *"
              accept=".csv,text/csv"
              fileName={csvFileName}
              onChange={handleCsvFile}
              status={rows.length ? `${rows.length.toLocaleString()} recipient(s)` : null}
            />
            <button type="button" onClick={downloadSampleCsv} className="text-xs text-blue-600 hover:underline self-start">
              ↓ Download sample CSV
            </button>
            {csvError && <p className="text-xs text-red-600">{csvError}</p>}
          </div>

          {rows.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <p className="px-4 py-2.5 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200">
                First {Math.min(5, rows.length)} of {rows.length} recipients
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2 font-medium">To</th>
                    <th className="px-4 py-2 font-medium">Cc</th>
                    <th className="px-4 py-2 font-medium">Subject</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2 text-gray-700">{r.to}</td>
                      <td className="px-4 py-2 text-gray-400">{r.cc || '—'}</td>
                      <td className="px-4 py-2 text-gray-700 truncate max-w-[16rem]">{r.subject || <span className="text-red-500">missing</span>}</td>
                      <td className="px-4 py-2 text-gray-400">{r.recipientName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {templateHtml && (
            <PreviewBox
              html={renderPreview(templateHtml, rows[0] || SAMPLE_PREVIEW_ROW)}
              label={rows.length ? 'Email preview (first recipient)' : 'Email preview (sample data — upload a CSV for real recipients)'}
            />
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canCreate || creating}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
              {creating ? 'Creating draft…' : 'Create draft'}
            </button>
          </div>
        </form>
      )}

      {phase === 'review' && (
        <div className="flex flex-col gap-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{name || `Campaign #${campaign.id}`}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {campaign.total.toLocaleString()} recipient(s) · sender “{senderName || '—'}” · ASM group {asmGroupId || 'none'}
                </p>
                {campaign.skipped > 0 && (
                  <p className="text-xs text-yellow-600 mt-1">{campaign.skipped} row(s) skipped (missing recipient or subject).</p>
                )}
              </div>
              <span className="inline-flex px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">DRAFT</span>
            </div>
          </div>

          {templateHtml && rows.length > 0 && (
            <PreviewBox html={renderPreview(templateHtml, rows[0])} label="Preview (first recipient)" />
          )}

          <div className="flex justify-between">
            <button onClick={handleDiscard} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md">
              Discard draft
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
              {sending ? 'Starting…' : `Send to ${campaign.total} recipient(s)`}
            </button>
          </div>
        </div>
      )}

      {phase === 'progress' && (
        <div className="flex flex-col gap-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {progress.campaignStatus === 'SENDING' ? 'Sending…' : progress.campaignStatus === 'COMPLETED' ? 'Completed' : progress.campaignStatus}
              </h3>
              <span className="text-sm text-gray-500">{progress.percentComplete}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress.percentComplete}%` }} />
            </div>
            <div className="grid grid-cols-5 gap-3 text-center">
              {[
                { label: 'Sent', val: progress.sent, color: 'text-green-600' },
                { label: 'Pending', val: progress.pending, color: 'text-gray-500' },
                { label: 'Failed', val: progress.failed, color: 'text-red-500' },
                { label: 'Bounced', val: progress.bounced, color: 'text-orange-500' },
                { label: 'Complained', val: progress.complained, color: 'text-purple-500' },
              ].map(({ label, val, color }) => (
                <div key={label}>
                  <p className={`text-lg font-semibold ${color}`}>{(val || 0).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <Link to={`/campaigns/${campaign.id}`} className="text-sm text-blue-600 hover:underline">
              View full details & per-email status →
            </Link>
            <button onClick={startOver} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
              New send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

function FileRow({ label, accept, fileName, onChange, status }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-3">
        <label className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
          Choose file
          <input type="file" accept={accept} onChange={onChange} className="hidden" />
        </label>
        <span className="text-sm text-gray-500">{fileName || 'No file selected'}</span>
        {status && <span className="text-xs text-green-600">{status}</span>}
      </div>
    </div>
  );
}

function PreviewBox({ html, label }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{label}</h3>
      <div className="border border-gray-200 rounded overflow-hidden">
        <iframe srcDoc={html} title="Email preview" className="w-full h-96" sandbox="allow-same-origin" />
      </div>
    </div>
  );
}
