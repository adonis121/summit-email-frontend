import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import Handlebars from 'handlebars';
import api from '../lib/api';
import toast from 'react-hot-toast';

// SendGrid fills this tag at send time; stub it for the in-browser preview.
const ASM_UNSUBSCRIBE_TAG = '<%asm_group_unsubscribe_raw_url%>';

// Renders the email preview with the SAME Handlebars engine SendGrid uses for
// dynamic templates, so {{#if nameN}} blocks and {{var}} escaping match the real send.
function renderPreview(html, row) {
  try {
    const out = Handlebars.compile(html)(row || {});
    return out.split(ASM_UNSUBSCRIBE_TAG).join('https://www.balkansummit.org/unsubscribe');
  } catch (e) {
    return `<pre style="color:#b00;padding:16px;font:13px monospace">Template error: ${e.message}</pre>`;
  }
}

// Envelope columns + the 19 personalization columns the dynamic template expects,
// keyed by their EXACT names. Slots 2–4 are optional and may be blank.
const ENVELOPE_COLUMNS = ['recipient_email', 'cc', 'subject'];
const TEMPLATE_FIELDS = [
  'pronounce', 'recipient_name', 'company_paragraph',
  'pronounce1', 'name1', 'title1', 'email1',
  'pronounce2', 'name2', 'title2', 'email2',
  'pronounce3', 'name3', 'title3', 'email3',
  'pronounce4', 'name4', 'title4', 'email4',
];
const ALL_COLUMNS = [...ENVELOPE_COLUMNS, ...TEMPLATE_FIELDS];
const REQUIRED_COLUMNS = ['recipient_email', 'subject'];

// Downloadable sample matching the 22-column schema. Row 1 has all 4 contact slots
// (multi-To + multi-Cc); row 2 fills only slots 1–2 (others blank → hidden by {{#if}}).
const SAMPLE_CSV = `recipient_email,cc,subject,pronounce,recipient_name,company_paragraph,pronounce1,name1,title1,email1,pronounce2,name2,title2,email2,pronounce3,name3,title3,email3,pronounce4,name4,title4,email4
jane.doe@acme.com,"assistant@acme.com;cfo@acme.com",Invitation to Balkan Summit 2026,Ms.,Jane Doe,"Acme's leadership in grid-scale renewables maps directly onto the energy-infrastructure portfolios being presented in Pristina.",H.E.,Sample Ambassador,Ambassador to Kosovo,amb@example.org,H.E.,Second Envoy,Kosovo's Ambassador,envoy@rks-gov.net,Mr.,Deputy Name,Deputy Ambassador,deputy@example.org,Ms.,Trade Officer,Economy & Trade Officer,trade@example.org
m.rossi@buildgroup.eu,assistant@buildgroup.eu,Balkan Summit 2026 — Partnership Opportunity,Mr.,Marco Rossi,"With BuildGroup's two decades delivering EPC and concession projects across Southeast Europe, the Summit offers early access to the regional pipeline.",H.E.,Sample Ambassador,Ambassador to Kosovo,amb@example.org,H.E.,Second Envoy,Kosovo's Ambassador,envoy@rks-gov.net,,,,,,,,
`;

// Placeholder used to render the email preview before a CSV is loaded.
const SAMPLE_PREVIEW_ROW = {
  pronounce: 'Mr.',
  recipient_name: 'Sample Recipient',
  company_paragraph: 'This is where each recipient’s personalized paragraph from the CSV will appear.',
  pronounce1: 'H.E.', name1: 'Sample Ambassador', title1: 'Ambassador to Kosovo', email1: 'ambassador@example.org',
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
  const [sendgridTemplateId, setSendgridTemplateId] = useState('');
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
          setCsvError(`CSV is missing required column(s): ${missing.join(', ')}. Expected the 22-column schema (recipient_email, cc, subject, pronounce, recipient_name, company_paragraph, pronounce1…email4).`);
          setRows([]);
          return;
        }
        const get = (r, k) => {
          const key = Object.keys(r).find(kk => kk.trim().toLowerCase() === k);
          return key ? String(r[key] ?? '').trim() : '';
        };
        // Each row is keyed by the exact column names; the backend forwards the
        // personalization fields verbatim as dynamic_template_data.
        const mapped = res.data
          .map(r => {
            const row = {};
            for (const c of ALL_COLUMNS) row[c] = get(r, c);
            return row;
          })
          .filter(r => r.recipient_email);
        if (mapped.length === 0) setCsvError('No rows with a recipient_email were found.');
        setRows(mapped);
      },
      error: err => setCsvError('Failed to parse CSV: ' + err.message),
    });
  }

  // The template renders inside SendGrid (dynamic template), so the browser doesn't
  // validate its tokens — it only checks the template parses (caught in renderPreview).
  const canCreate = name.trim() && templateHtml && rows.length > 0;

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
        sendgridTemplateId: sendgridTemplateId.trim(),
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
    setTemplateHtml(''); setHtmlFileName(''); setName(''); setSendgridTemplateId('');
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
              <Field label="SendGrid template ID" value={sendgridTemplateId} onChange={setSendgridTemplateId} placeholder="d-… (optional)" hint="This campaign's dynamic template. Leave blank to use the server default." />
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
                      <td className="px-4 py-2 text-gray-700">{r.recipient_email}</td>
                      <td className="px-4 py-2 text-gray-400">{r.cc || '—'}</td>
                      <td className="px-4 py-2 text-gray-700 truncate max-w-[16rem]">{r.subject || <span className="text-red-500">missing</span>}</td>
                      <td className="px-4 py-2 text-gray-400">{r.recipient_name || '—'}</td>
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
                  {campaign.total.toLocaleString()} recipient(s) · sender “{senderName || '—'}” · ASM group {asmGroupId || 'none'} · template {sendgridTemplateId || 'default'}
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
