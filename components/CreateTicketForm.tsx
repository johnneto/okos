'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Plus, Loader2, X } from 'lucide-react';

interface Props {
  onCreated: () => void;
}

type Mode = 'ai' | 'manual';

export default function CreateTicketForm({ onCreated }: Props) {
  const [open, setOpen]       = useState(false);
  const [mode, setMode]       = useState<Mode>('ai');
  const [feature, setFeature] = useState('');
  const [title, setTitle]     = useState('');
  const [body, setBody]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [mounted, setMounted] = useState(false);

  // Ensure we only render the portal on the client
  useEffect(() => { setMounted(true); }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const reset = () => {
    setFeature(''); setTitle(''); setBody(''); setError('');
  };

  const close = () => { setOpen(false); reset(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'ai') {
        const res = await fetch('/api/tickets/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featureRequest: feature }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to generate ticket');
      } else {
        const res = await fetch('/api/tickets/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to create ticket');
      }

      close();
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Trigger button ────────────────────────────────────────────────────────
  const trigger = (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50 px-3 py-1.5 rounded-lg transition-all duration-150 shadow-lg shadow-indigo-900/30"
    >
      <Plus size={13} />
      New Ticket
    </button>
  );

  // ── Modal (rendered via portal to escape header stacking context) ─────────
  const modal = mounted && open ? createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={close}
      />

      {/* Panel */}
      <div className="relative bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-2xl ring-1 ring-white/5">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Plus size={14} className="text-indigo-400" />
            </div>
            <h2 className="text-sm font-bold text-white">Create New Ticket</h2>
          </div>
          <button
            onClick={close}
            className="text-slate-500 hover:text-white hover:bg-slate-800 w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 px-6 pt-5">
          <button
            onClick={() => setMode('ai')}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'ai'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50'
            }`}
          >
            <Sparkles size={13} />
            AI Plan (Gemini)
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'manual'
                ? 'bg-slate-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50'
            }`}
          >
            <Plus size={13} />
            Manual
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {mode === 'ai' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Feature Request
              </label>
              <textarea
                value={feature}
                onChange={e => setFeature(e.target.value)}
                placeholder="Describe the feature you want to build. Be specific — Gemini will read your codebase and generate a full implementation plan."
                rows={6}
                required
                autoFocus
                className="w-full bg-slate-800/80 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 rounded-xl p-3.5 text-sm text-slate-200 placeholder-slate-600 outline-none resize-none transition-all"
              />
              <p className="text-[11px] text-slate-600 mt-2">
                Gemini Flash will analyse your{' '}
                <code className="text-indigo-400 font-mono">/app</code> directory and generate a structured implementation plan.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Short, imperative title (e.g. Add JWT refresh token rotation)"
                  required
                  autoFocus
                  className="w-full bg-slate-800/80 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 rounded-xl p-3.5 text-sm text-slate-200 placeholder-slate-600 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Plan (Markdown)</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="## Steps&#10;1. ...&#10;&#10;## Acceptance Criteria&#10;- ..."
                  rows={8}
                  required
                  className="w-full bg-slate-800/80 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 rounded-xl p-3.5 text-sm text-slate-200 placeholder-slate-600 outline-none resize-none font-mono transition-all"
                />
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-950/60 border border-red-800/60 rounded-xl p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/50 px-4 py-2 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-all shadow-lg shadow-indigo-900/30"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {mode === 'ai' ? 'Generating plan…' : 'Creating…'}
                </>
              ) : (
                <>
                  {mode === 'ai' ? <Sparkles size={14} /> : <Plus size={14} />}
                  {mode === 'ai' ? 'Generate with Gemini' : 'Create Ticket'}
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {trigger}
      {modal}
    </>
  );
}
