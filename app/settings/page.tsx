'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle,
  FolderOpen, Sparkles, Sheet, Eye, EyeOff, ExternalLink, Bot,
} from 'lucide-react';

interface ConfigValues {
  TICKETS_BASE_PATH: string;
  APP_BASE_PATH: string;
  GEMINI_API_KEY: string;
  GOOGLE_SHEETS_ID: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  CLAUDE_MAX_BUDGET_USD: string;
}

const EMPTY: ConfigValues = {
  TICKETS_BASE_PATH: '',
  APP_BASE_PATH: '',
  GEMINI_API_KEY: '',
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
  CLAUDE_MAX_BUDGET_USD: '',
};

// ── Small sub-components ──────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({
  label, hint, value, onChange, placeholder, secret = false, mono = false, textarea = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  mono?: boolean;
  textarea?: boolean;
}) {
  const [reveal, setReveal] = useState(false);

  const baseClass = `w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none transition-colors ${mono ? 'font-mono' : ''}`;

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        {textarea ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={4}
            className={`${baseClass} resize-none`}
          />
        ) : (
          <input
            type={secret && !reveal ? 'password' : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${baseClass} ${secret ? 'pr-9' : ''}`}
          />
        )}
        {secret && !textarea && (
          <button
            type="button"
            onClick={() => setReveal(r => !r)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [values, setValues] = useState<ConfigValues>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const set = (key: keyof ConfigValues) => (v: string) =>
    setValues(prev => ({ ...prev, [key]: v }));

  // Load current config
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data.config) setValues(data.config as ConfigValues);
      })
      .catch(err => showToast(`Failed to load config: ${err}`, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      // Reflect any returned (masked) values back so the UI stays in sync
      if (data.config) setValues(data.config as ConfigValues);
      showToast('Settings saved — changes are live immediately.', 'success');
    } catch (err) {
      showToast(`Save failed: ${err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft size={16} />
              Board
            </button>
            <div className="w-px h-4 bg-slate-700" />
            <h1 className="text-sm font-bold text-white">Settings</h1>
          </div>

          <button
            form="settings-form"
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
        <form id="settings-form" onSubmit={handleSave} className="space-y-8">

          {/* ── Project Paths ─────────────────────────────────────────────── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <SectionHeader
              icon={<FolderOpen size={16} />}
              title="Project Paths"
              subtitle="Directories used for tickets and the app Claude will work on."
            />
            <div className="space-y-5">
              <Field
                label="App Directory (Claude's workspace)"
                value={values.APP_BASE_PATH}
                onChange={set('APP_BASE_PATH')}
                placeholder="/Users/you/Development/MyApp"
                mono
                hint="Absolute path to the project Claude executes tickets against. Gemini reads source files here to build implementation plans."
              />
              <Field
                label="Tickets Directory"
                value={values.TICKETS_BASE_PATH}
                onChange={set('TICKETS_BASE_PATH')}
                placeholder="../tickets"
                mono
                hint="Absolute or relative path (from orchestrator/) to the tickets root. Sub-folders 1_backlog, 2_todo, 3_validation, 4_done must exist here."
              />
            </div>
          </section>

          {/* ── Gemini ───────────────────────────────────────────────────── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <SectionHeader
              icon={<Sparkles size={16} />}
              title="Gemini Flash"
              subtitle="Used for generating implementation plans and post-execution validation."
            />
            <Field
              label="Gemini API Key"
              value={values.GEMINI_API_KEY}
              onChange={set('GEMINI_API_KEY')}
              placeholder="AIza…"
              secret
              hint={
                <>
                  Get a free key at{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline"
                  >
                    aistudio.google.com
                  </a>
                  . Gemini Flash 1.5 is used for both architect and validation phases.
                </>
              }
            />
          </section>

          {/* ── Claude Execution ──────────────────────────────────────────── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <SectionHeader
              icon={<Bot size={16} />}
              title="Claude Execution"
              subtitle="Controls passed to the Claude CLI when executing tickets."
            />
            <Field
              label="Max Budget per Run (USD)"
              value={values.CLAUDE_MAX_BUDGET_USD}
              onChange={set('CLAUDE_MAX_BUDGET_USD')}
              placeholder="1.00"
              mono
              hint="Hard cost cap per ticket execution via --max-budget-usd. Defaults to $1.00 if unset. Set to a higher value for complex tickets."
            />
          </section>

          {/* ── Google Sheets ─────────────────────────────────────────────── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <SectionHeader
              icon={<Sheet size={16} />}
              title="Google Sheets Sync"
              subtitle="Optional — ticket status is synced to a spreadsheet on every move."
            />
            <div className="space-y-5">
              <Field
                label="Spreadsheet ID"
                value={values.GOOGLE_SHEETS_ID}
                onChange={set('GOOGLE_SHEETS_ID')}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                mono
                hint="Found in the spreadsheet URL: /spreadsheets/d/<ID>/edit"
              />
              <Field
                label="Service Account Email"
                value={values.GOOGLE_SERVICE_ACCOUNT_EMAIL}
                onChange={set('GOOGLE_SERVICE_ACCOUNT_EMAIL')}
                placeholder="my-bot@project-id.iam.gserviceaccount.com"
                hint="Share the spreadsheet with this address as an Editor."
              />
              <Field
                label="Service Account Private Key"
                value={values.GOOGLE_PRIVATE_KEY}
                onChange={set('GOOGLE_PRIVATE_KEY')}
                placeholder="MIIEvQIBADANBgkqhki…"
                secret
                mono
                textarea
                hint="Paste just the base64 key body from your service account JSON — no BEGIN/END headers needed."
              />
            </div>

            {/* Open in Google Sheets */}
            {values.GOOGLE_SHEETS_ID && (
              <div className="mt-5 pt-5 border-t border-slate-800">
                <a
                  href={`https://docs.google.com/spreadsheets/d/${values.GOOGLE_SHEETS_ID}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <ExternalLink size={13} />
                  Open in Google Sheets
                </a>
              </div>
            )}

            {/* Setup guide */}
            <details className="mt-5">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors select-none">
                How to set up a service account →
              </summary>
              <ol className="mt-3 space-y-1.5 text-xs text-slate-400 list-decimal ml-4">
                <li>Open <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Google Cloud Console</a> and create or select a project.</li>
                <li>Enable the <strong className="text-slate-300">Google Sheets API</strong>.</li>
                <li>Go to <strong className="text-slate-300">IAM &amp; Admin → Service Accounts</strong> → Create service account.</li>
                <li>Create a JSON key for that account and download it.</li>
                <li>Copy <code className="text-indigo-300">client_email</code> → Service Account Email above.</li>
                <li>Copy <code className="text-indigo-300">private_key</code> → Private Key above.</li>
                <li>Share your spreadsheet with the service account email as <strong className="text-slate-300">Editor</strong>.</li>
              </ol>
            </details>
          </section>

          {/* Save button (bottom shortcut) */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium z-50 ${
          toast.type === 'success'
            ? 'bg-emerald-900 border border-emerald-700 text-emerald-200'
            : 'bg-red-900 border border-red-700 text-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
