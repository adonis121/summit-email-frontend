import { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  ACTIVE: 'bg-green-100 text-green-700',
  UNSUBSCRIBED: 'bg-gray-100 text-gray-600',
  BOUNCED: 'bg-red-100 text-red-700',
  COMPLAINED: 'bg-orange-100 text-orange-700',
  DELETED: 'bg-red-100 text-red-700',
};

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const limit = 25;

  async function fetchContacts(p = page, s = search, sf = statusFilter) {
    setLoading(true);
    try {
      const params = { page: p, limit, ...(s && { search: s }), ...(sf && { status: sf }) };
      const { data } = await api.get('/contacts', { params });
      setContacts(data.data ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch {
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContacts(page, search, statusFilter);
  }, [page, search, statusFilter]);

  function handleSearch(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  function handleStatusFilter(e) {
    setStatusFilter(e.target.value);
    setPage(1);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this contact?')) return;
    try {
      await api.delete(`/contacts/${id}`);
      toast.success('Contact deleted');
      fetchContacts();
    } catch {
      toast.error('Failed to delete contact');
    }
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Contacts</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
          >
            Add contact
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={handleSearch}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={handleStatusFilter}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
          <option value="BOUNCED">Bounced</option>
          <option value="COMPLAINED">Complained</option>
          <option value="DELETED">Deleted</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">City</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading…</td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No contacts found.</td>
              </tr>
            ) : contacts.map(c => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{c.email}</td>
                <td className="px-4 py-3 text-gray-700">
                  {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">{c.city || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right flex justify-end gap-3">
                  <button
                    onClick={() => setEditingContact(c)}
                    className="text-blue-500 hover:text-blue-700 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{total.toLocaleString()} contacts</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="px-3 py-1">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchContacts(1, search, statusFilter); setPage(1); }}
        />
      )}
      {showBulkModal && (
        <BulkImportModal
          onClose={() => setShowBulkModal(false)}
          onSaved={() => { setShowBulkModal(false); fetchContacts(1, search, statusFilter); setPage(1); }}
        />
      )}
      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSaved={() => { setEditingContact(null); fetchContacts(page, search, statusFilter); }}
        />
      )}
    </div>
  );
}

function AddContactModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', city: '', customField: '' });
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.customField && /^\d+$/.test(form.customField)) {
      toast.error('Custom ID cannot be a number');
      return;
    }
    setLoading(true);
    try {
      await api.post('/contacts', form);
      toast.success('Contact added');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add contact');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Add contact" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Email *" value={form.email} onChange={v => set('email', v)} type="email" required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" value={form.firstName} onChange={v => set('firstName', v)} />
          <Field label="Last name" value={form.lastName} onChange={v => set('lastName', v)} />
        </div>
        <Field label="City" value={form.city} onChange={v => set('city', v)} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Custom ID</label>
          <textarea
            value={form.customField}
            onChange={e => set('customField', e.target.value)}
            rows={3}
            pattern=".*\D.*"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/^\d+$/.test(form.customField) && form.customField && (
            <p className="text-xs text-red-500">Custom ID cannot be a number</p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditContactModal({ contact, onClose, onSaved }) {
  const [form, setForm] = useState({
    email: contact.email || '',
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    city: contact.city || '',
    customField: contact.customField || '',
    status: contact.status || 'ACTIVE',
  });
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.customField && /^\d+$/.test(form.customField)) {
      toast.error('Custom ID cannot be a number');
      return;
    }
    setLoading(true);
    try {
      await api.put(`/contacts/${contact.id}`, form);
      toast.success('Contact updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update contact');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Edit contact" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Email *" value={form.email} onChange={v => set('email', v)} type="email" required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" value={form.firstName} onChange={v => set('firstName', v)} />
          <Field label="Last name" value={form.lastName} onChange={v => set('lastName', v)} />
        </div>
        <Field label="City" value={form.city} onChange={v => set('city', v)} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Custom ID</label>
          <textarea
            value={form.customField}
            onChange={e => set('customField', e.target.value)}
            rows={3}
            pattern=".*\D.*"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/^\d+$/.test(form.customField) && form.customField && (
            <p className="text-xs text-red-500">Custom ID cannot be a number</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ACTIVE">Active</option>
            <option value="UNSUBSCRIBED">Unsubscribed</option>
            <option value="BOUNCED">Bounced</option>
            <option value="COMPLAINED">Complained</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BulkImportModal({ onClose, onSaved }) {
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const lines = csv.trim().split('\n').filter(Boolean);
    if (lines.length < 2) {
      toast.error('CSV must have a header row and at least one data row');
      return;
    }
    const headers = lines[0].split(',').map(h => h.trim());
    const contacts = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
    });
    setLoading(true);
    try {
      const { data } = await api.post('/contacts/bulk', contacts);
      toast.success(`Imported ${data.created} contacts`);
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Import contacts (CSV)" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-xs text-gray-500">
          Paste CSV with header row. Columns: <code className="bg-gray-100 px-1 rounded">email</code>, <code className="bg-gray-100 px-1 rounded">firstName</code>, <code className="bg-gray-100 px-1 rounded">lastName</code>, <code className="bg-gray-100 px-1 rounded">city</code>, <code className="bg-gray-100 px-1 rounded">customField</code>. Duplicates are skipped.
        </p>
        <textarea
          value={csv}
          onChange={e => setCsv(e.target.value)}
          rows={8}
          placeholder="email,firstName,lastName&#10;alice@example.com,Alice,Smith"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
