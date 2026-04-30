'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Sheet, AlertCircle, CheckCircle2, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';
import KanbanBoard from '@/components/KanbanBoard';
import CreateTicketForm from '@/components/CreateTicketForm';
import type { Ticket } from '@/lib/tickets';

const POLL_INTERVAL = 8_000; // 8 seconds

// ── Stat pill ───────────────────────────────────────────────────────────────

function StatPill({
  count,
  label,
  dotColor,
}: {
  count: number;
  label: string;
  dotColor: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="text-xs font-semibold text-white tabular-nums">{count}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets', { cache: 'no-store' });
      const data = await res.json();
      if (data.tickets) setTickets(data.tickets);
    } catch (err) {
      console.error('Failed to fetch tickets', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    pollRef.current = setInterval(fetchTickets, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchTickets]);

  // ── File watcher (SSE) ────────────────────────────────────────────────────

  useEffect(() => {
    const es = new EventSource('/api/watch');
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event !== 'connected') {
          setTimeout(fetchTickets, 400);
        }
      } catch {}
    };
    es.onerror = () => {};
    return () => es.close();
  }, [fetchTickets]);

  // ── Google Sheets sync ────────────────────────────────────────────────────

  const handleSheetsSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sheets/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Synced ${data.synced} ticket(s) to Google Sheets`, 'success');
    } catch (err) {
      showToast(`Sheets sync failed: ${err}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ── Toast ─────────────────────────────────────────────────────────────────

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    total:      tickets.length,
    backlog:    tickets.filter(t => t.column === 'backlog').length,
    todo:       tickets.filter(t => t.column === 'todo').length,
    validation: tickets.filter(t => t.column === 'validation').length,
    done:       tickets.filter(t => t.column === 'done').length,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col dot-grid" style={{ backgroundColor: 'var(--background)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="relative bg-slate-900/70 backdrop-blur-md border-b border-slate-800/60 px-6 py-3.5">
        {/* Top glow line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Ticket Orchestrator logo"
              width={34}
              height={34}
              className="rounded-xl shadow-lg shadow-indigo-900/40"
            />
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-tight">
                Ticket Orchestrator
              </h1>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">Local AI Dashboard</p>
            </div>
          </div>

          {/* Stats */}
          <div className="hidden md:flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2">
            <StatPill count={stats.total}      label="total"     dotColor="bg-slate-400" />
            <div className="w-px h-3 bg-slate-700" />
            <StatPill count={stats.backlog}    label="backlog"   dotColor="bg-slate-500" />
            <div className="w-px h-3 bg-slate-700" />
            <StatPill count={stats.todo}       label="to-do"     dotColor="bg-indigo-400" />
            <div className="w-px h-3 bg-slate-700" />
            <StatPill count={stats.validation} label="reviewing" dotColor="bg-amber-400" />
            <div className="w-px h-3 bg-slate-700" />
            <StatPill count={stats.done}       label="done"      dotColor="bg-emerald-400" />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTickets}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 px-3 py-1.5 rounded-lg transition-all duration-150"
              title="Refresh board"
            >
              <RefreshCw size={12} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={handleSheetsSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-all duration-150"
              title="Sync all tickets to Google Sheets"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <Sheet size={12} />}
              <span className="hidden sm:inline">Sync Sheets</span>
            </button>

            <CreateTicketForm onCreated={fetchTickets} />

            <Link
              href="/settings"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 px-3 py-1.5 rounded-lg transition-all duration-150"
              title="Settings"
            >
              <Settings size={12} />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </div>

        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 px-6 py-6 max-w-[1600px] mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4 text-slate-500">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin text-indigo-400" />
                </div>
              </div>
              <span className="text-sm">Loading tickets…</span>
            </div>
          </div>
        ) : (
          <KanbanBoard tickets={tickets} onRefresh={fetchTickets} />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="px-6 py-3 border-t border-slate-800/60">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between text-[10px] text-slate-600">
          <span>
            Tickets stored in <code className="text-slate-500 font-mono">../tickets/</code>
            {' '}— drag cards to move · click to view
          </span>
          <span>Auto-refresh every {POLL_INTERVAL / 1000}s · live file watch active</span>
        </div>
      </footer>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium z-50 border transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-950 border-emerald-800/60 text-emerald-200 shadow-emerald-900/30'
            : 'bg-red-950 border-red-800/60 text-red-200 shadow-red-900/30'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            : <AlertCircle  size={15} className="text-red-400 shrink-0" />
          }
          {toast.message}
        </div>
      )}

    </div>
  );
}
