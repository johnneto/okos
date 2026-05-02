'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight, Brain, Wrench, Terminal as TerminalIcon, AlertTriangle, Info } from 'lucide-react';
import type { RunLog, RunSummary, RunEvent } from '@/lib/executionLogs';

function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function EventRow({ event }: { event: RunEvent }) {
  const [expanded, setExpanded] = useState(false);

  if (event.type === 'thinking_block') {
    const text = String(event.data ?? '');
    return (
      <div className="border border-violet-800/40 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left bg-violet-950/30 hover:bg-violet-900/30 transition-colors"
        >
          <Brain size={12} className="text-violet-400 shrink-0" />
          <span className="text-xs text-violet-300 font-semibold flex-1">Thinking block</span>
          <span className="text-[10px] text-violet-500">{text.length} chars</span>
          {expanded ? <ChevronDown size={12} className="text-violet-500" /> : <ChevronRight size={12} className="text-violet-500" />}
        </button>
        {expanded && (
          <pre className="px-3 py-2 text-[11px] text-violet-200 font-mono whitespace-pre-wrap leading-relaxed bg-violet-950/20 border-t border-violet-800/30 max-h-80 overflow-y-auto">
            {text}
          </pre>
        )}
      </div>
    );
  }

  if (event.type === 'tool_action') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/50 text-xs text-slate-300">
        <Wrench size={11} className="text-indigo-400 shrink-0" />
        <span className="font-mono">{String(event.description ?? event.name ?? '')}</span>
      </div>
    );
  }

  if (event.type === 'stdout') {
    const text = String(event.data ?? '').trim();
    if (!text) return null;
    return (
      <pre className="px-3 py-1.5 text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed bg-slate-900/40 rounded">
        {text}
      </pre>
    );
  }

  if (event.type === 'stderr') {
    return (
      <div className="flex items-start gap-2 px-3 py-1.5 rounded bg-red-950/20 border border-red-900/40">
        <AlertTriangle size={11} className="text-red-400 shrink-0 mt-0.5" />
        <pre className="text-[11px] text-red-300 font-mono whitespace-pre-wrap">{String(event.data ?? '')}</pre>
      </div>
    );
  }

  if (event.type === 'validation') {
    return (
      <div className={`px-3 py-2 rounded border text-xs ${event.approved ? 'bg-emerald-950/20 border-emerald-800 text-emerald-300' : 'bg-amber-950/20 border-amber-800 text-amber-300'}`}>
        <p className="font-semibold mb-1">Validation — {event.approved ? 'APPROVED' : 'NEEDS REVISION'}</p>
        <pre className="whitespace-pre-wrap font-sans text-[11px] opacity-80">{String(event.summary ?? '')}</pre>
      </div>
    );
  }

  if (event.type === 'start' || event.type === 'done' || event.type === 'moved' || event.type === 'warning') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/30 text-xs text-slate-400">
        <Info size={11} className="shrink-0" />
        <span>{event.type}: {String(event.message ?? event.to ?? event.exitCode ?? '')}</span>
      </div>
    );
  }

  return null;
}

function RunDetail({ runId }: { runId: string }) {
  const [log, setLog] = useState<RunLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/logs/${encodeURIComponent(runId)}`)
      .then(r => r.json())
      .then(data => setLog(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-slate-500 text-xs">
        <Loader2 size={12} className="animate-spin" />
        Loading events…
      </div>
    );
  }

  if (!log) {
    return <p className="px-4 py-3 text-xs text-red-400">Failed to load run details.</p>;
  }

  const visibleEvents = log.events.filter(e =>
    ['thinking_block', 'tool_action', 'stdout', 'stderr', 'validation', 'start', 'done', 'moved', 'warning'].includes(e.type)
  );

  return (
    <div className="px-4 py-3 space-y-2 border-t border-slate-800">
      <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-3">
        <TerminalIcon size={11} />
        <span>{visibleEvents.length} events · {log.events.filter(e => e.type === 'tool_action').length} tool calls · {log.events.filter(e => e.type === 'thinking_block').length} thinking blocks</span>
      </div>
      {visibleEvents.map((event, i) => (
        <EventRow key={i} event={event} />
      ))}
    </div>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-slate-900 hover:bg-slate-800/60 transition-colors"
      >
        {/* Status */}
        <div className="shrink-0">
          {run.success === null ? (
            <Loader2 size={14} className="text-amber-400 animate-spin" />
          ) : run.success ? (
            <CheckCircle2 size={14} className="text-emerald-400" />
          ) : (
            <XCircle size={14} className="text-red-400" />
          )}
        </div>

        {/* Ticket */}
        <span className="font-mono text-xs text-indigo-300 w-28 shrink-0">{run.ticketId}</span>

        {/* Model */}
        <span className="text-[10px] text-slate-400 w-32 shrink-0 truncate">{run.model.replace('claude-', '')}</span>

        {/* Effort */}
        <span className="text-[10px] text-slate-500 w-16 shrink-0">{run.effort}</span>

        {/* Duration */}
        <span className="text-[10px] text-slate-500 w-16 shrink-0">{formatDuration(run.durationMs)}</span>

        {/* Date */}
        <span className="text-[10px] text-slate-500 flex-1">{formatDate(run.startedAt)}</span>

        {/* Validation */}
        {run.validation && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${run.validation.approved ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'}`}>
            {run.validation.approved ? 'Approved' : 'Needs revision'}
          </span>
        )}

        <ChevronDown size={13} className={`text-slate-500 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && <RunDetail runId={run.runId} />}
    </div>
  );
}

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft size={16} />
              Board
            </button>
            <div className="w-px h-4 bg-slate-700" />
            <h1 className="text-sm font-bold text-white">Execution Runs</h1>
          </div>
          <button
            onClick={fetchRuns}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" />
            Loading runs…
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 gap-3">
            <TerminalIcon size={28} />
            <p className="text-sm">No runs yet — launch a ticket to see history here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              <div className="w-4 shrink-0" />
              <span className="w-28 shrink-0">Ticket</span>
              <span className="w-32 shrink-0">Model</span>
              <span className="w-16 shrink-0">Effort</span>
              <span className="w-16 shrink-0">Duration</span>
              <span className="flex-1">Started at</span>
            </div>
            {runs.map(run => <RunRow key={run.runId} run={run} />)}
          </div>
        )}
      </main>
    </div>
  );
}
