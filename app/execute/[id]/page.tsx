'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, AlertTriangle, Copy, Check, Square } from 'lucide-react';
import { CLAUDE_MODELS, DEFAULT_MODEL, TIER_STYLES, EFFORT_LEVELS, DEFAULT_EFFORT } from '@/lib/claude-models';

// EventSource is browser-only — disable SSR
const Terminal = dynamic(() => import('@/components/Terminal'), { ssr: false });

type ExecutionStatus = 'connecting' | 'running' | 'done' | 'error';

interface Props {
  params: { id: string };
}

export default function ExecutePage({ params }: Props) {
  const { id: ticketId } = params;
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve model from query param, fall back to default
  const modelId = searchParams.get('model') ?? DEFAULT_MODEL.id;
  const model = CLAUDE_MODELS.find(m => m.id === modelId) ?? DEFAULT_MODEL;

  // Resolve effort from query param, fall back to default
  const effortValue = searchParams.get('effort') ?? DEFAULT_EFFORT.value;
  const effort = EFFORT_LEVELS.find(e => e.value === effortValue) ?? DEFAULT_EFFORT;

  const isBatch = searchParams.get('batch') === 'true';

  const [status, setStatus] = useState<ExecutionStatus>('connecting');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [movedTo, setMovedTo] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] = useState<string | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [rawOutput, setRawOutput] = useState('');
  const [copied, setCopied] = useState(false);

  // Stopwatch
  useEffect(() => {
    if (status !== 'running' && status !== 'connecting') return;
    const start = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - start), 500);
    return () => clearInterval(timer);
  }, [status]);

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  const handleStart = () => setStatus('running');

  const handleDone = (code: number | null, _report: string) => {
    setExitCode(code);
    setStatus(code === 0 ? 'done' : 'error');

    if (isBatch) {
      if (code === 0) {
        try {
          const queue: string[] = JSON.parse(localStorage.getItem('tm_batch_queue') ?? '[]');
          const remaining = queue.filter(id => id !== ticketId);
          if (remaining.length === 0) {
            localStorage.removeItem('tm_batch_queue');
            setTimeout(() => router.push('/'), 1500);
          } else {
            localStorage.setItem('tm_batch_queue', JSON.stringify(remaining));
            setTimeout(() => router.push(
              `/execute/${remaining[0]}?model=${encodeURIComponent(modelId)}&effort=${encodeURIComponent(effortValue)}&batch=true`
            ), 1500);
          }
        } catch {
          localStorage.removeItem('tm_batch_queue');
          setTimeout(() => router.push('/'), 1500);
        }
      } else {
        localStorage.removeItem('tm_batch_queue');
      }
    }
  };

  const handleMoved = (to: string) => setMovedTo(to);

  const handleRawOutput = (text: string) => {
    setRawOutput(prev => prev + text);
  };

  const handleCopyError = async () => {
    try {
      await navigator.clipboard.writeText(rawOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: create a temporary textarea
      const el = document.createElement('textarea');
      el.value = rawOutput;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStop = async () => {
    try {
      await fetch(`/api/tickets/execute/${ticketId}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    if (isBatch) localStorage.removeItem('tm_batch_queue');
    setStatus('error');
    setExitCode(-1);
  };

  const handleValidation = (summary: string, isApproved: boolean) => {
    setValidationSummary(summary);
    setApproved(isApproved);
    setStatus('done');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft size={16} />
              Board
            </button>
            <div className="w-px h-4 bg-slate-700" />
            <div>
              <p className="text-xs text-slate-500">Executing</p>
              <p className="text-sm font-bold text-white font-mono">{ticketId}</p>
            </div>
            {/* Model badge */}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${TIER_STYLES[model.tier]}`}>
              {model.label}
            </span>
            {/* Effort badge */}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-slate-300 bg-slate-800/40 border-slate-600">
              effort: {effort.value}
            </span>
            {isBatch && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-amber-300 bg-amber-900/30 border-amber-700">
                batch
              </span>
            )}
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-3">
            {(status === 'connecting' || status === 'running') && (
              <>
                <span className="flex items-center gap-2 text-xs text-amber-400">
                  <Loader2 size={13} className="animate-spin" />
                  {status === 'connecting' ? 'Connecting…' : `Running — ${formatElapsed(elapsedMs)}`}
                </span>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1.5 text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 hover:text-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Square size={11} fill="currentColor" />
                  Stop
                </button>
              </>
            )}
            {status === 'done' && exitCode === 0 && (
              <span className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 size={13} />
                Completed successfully
              </span>
            )}
            {status === 'error' && (
              <>
                <span className="flex items-center gap-2 text-xs text-red-400">
                  <XCircle size={13} />
                  Exited with code {exitCode}
                </span>
                <button
                  onClick={handleCopyError}
                  className="flex items-center gap-1.5 text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 hover:text-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy error output'}
                </button>
              </>
            )}
            {movedTo && (
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                → {movedTo}
              </span>
            )}
            {status !== 'connecting' && (
              <button
                onClick={() => router.push('/')}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Back to Board
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="flex-1 flex flex-col gap-4 px-6 py-6 max-w-6xl mx-auto w-full">
        {/* Terminal */}
        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden" style={{ minHeight: '500px' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-amber-500/60" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
            </div>
            <span className="text-xs text-slate-500 font-mono ml-2">
              claude --model {model.id} -p &quot;Execute {ticketId}…&quot;
            </span>
          </div>
          <Terminal
            ticketId={ticketId}
            modelId={model.id}
            effort={effort.value}
            onStart={handleStart}
            onDone={handleDone}
            onMoved={handleMoved}
            onValidation={handleValidation}
            onRawOutput={handleRawOutput}
          />
        </div>

        {/* Validation summary panel */}
        {validationSummary && (
          <div className={`border rounded-xl p-5 ${
            approved
              ? 'bg-emerald-950/30 border-emerald-800'
              : 'bg-amber-950/30 border-amber-800'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {approved
                ? <CheckCircle2 size={16} className="text-emerald-400" />
                : <AlertTriangle size={16} className="text-amber-400" />
              }
              <h3 className="text-sm font-bold text-white">
                Gemini Validation — {approved ? 'APPROVED' : 'NEEDS REVISION'}
              </h3>
            </div>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
              {validationSummary}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
