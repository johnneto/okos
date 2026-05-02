'use client';

import { useEffect, useRef, useState } from 'react';

interface TerminalProps {
  ticketId: string;
  modelId?: string;
  effort?: string;
  onStart?: () => void;
  onDone?: (exitCode: number | null, report: string) => void;
  onMoved?: (to: string) => void;
  onValidation?: (summary: string, approved: boolean) => void;
  onRawOutput?: (text: string) => void;
}

type OutputItemData =
  | { kind: 'welcome'; modelLabel: string; ticketId: string }
  | { kind: 'status'; message: string; variant: 'start' | 'success' | 'error' | 'info' | 'warning' | 'moved' }
  | { kind: 'tool'; description: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'text'; content: string }
  | { kind: 'stderr'; content: string }
  | { kind: 'validation'; summary: string; approved: boolean };

type OutputItem = OutputItemData & { id: number };

let _nextId = 0;
const uid = () => ++_nextId;

const STATUS_STYLES: Record<string, string> = {
  start: 'text-amber-400',
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  moved: 'text-cyan-400',
  info: 'text-slate-400',
};

const STATUS_ICONS: Record<string, string> = {
  start: '▶',
  success: '✓',
  error: '✗',
  warning: '⚠',
  moved: '→',
  info: '·',
};

function WelcomeItem({ modelLabel, ticketId }: { modelLabel: string; ticketId: string }) {
  return (
    <div className="font-mono text-xs text-slate-500 leading-5 select-none">
      <div>┌──────────────────────────────────────────┐</div>
      <div>│  <span className="text-slate-300">Okos</span> — <span className="text-slate-400">{ticketId}</span>{' '.repeat(Math.max(0, 30 - ticketId.length))}│</div>
      <div>│  Model: <span className="text-purple-300">{modelLabel}</span>{' '.repeat(Math.max(0, 34 - modelLabel.length))}│</div>
      <div>└──────────────────────────────────────────┘</div>
    </div>
  );
}

function ReasoningItem({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 500;
  const displayed = isLong && !expanded ? text.slice(0, 500) + '…' : text;

  return (
    <div className="border-l-2 border-purple-900 pl-3 py-0.5">
      <p className="text-slate-500 text-xs leading-relaxed italic whitespace-pre-wrap break-words font-sans">
        {displayed}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-purple-500 hover:text-purple-400 mt-1 transition-colors"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export default function Terminal({ ticketId, modelId, effort, onStart, onDone, onMoved, onValidation, onRawOutput }: TerminalProps) {
  const [items, setItems] = useState<OutputItem[]>([]);
  const [isDone, setIsDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const push = (item: OutputItemData) => {
    setItems(prev => [...prev, { id: uid(), ...item }]);
  };

  // Auto-scroll to bottom whenever items change, unless user scrolled up
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [items]);

  useEffect(() => {
    const modelLabel = (modelId ?? 'claude').replace('claude-', '').slice(0, 32);

    push({ kind: 'welcome', modelLabel, ticketId });

    const params = new URLSearchParams();
    if (modelId) params.set('model', modelId);
    if (effort) params.set('effort', effort);
    const qs = params.toString();
    const esUrl = qs
      ? `/api/tickets/execute/${ticketId}?${qs}`
      : `/api/tickets/execute/${ticketId}`;

    const es = new EventSource(esUrl);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'start':
            push({ kind: 'status', message: msg.message, variant: 'start' });
            onStart?.();
            break;

          case 'thinking_block':
            push({ kind: 'reasoning', text: msg.data });
            break;

          case 'tool_action':
            push({ kind: 'tool', description: msg.description });
            break;

          case 'thinking_complete':
            break;

          case 'stdout': {
            const content = (msg.data as string).replace(/^\n/, '').trimEnd();
            if (content) {
              push({ kind: 'text', content });
              onRawOutput?.(msg.data);
            }
            break;
          }

          case 'stderr': {
            const text = (msg.data as string).trim();
            if (text) {
              push({ kind: 'stderr', content: text });
              onRawOutput?.(msg.data);
            }
            break;
          }

          case 'done':
            push({
              kind: 'status',
              message: msg.exitCode === 0
                ? 'Claude finished successfully'
                : `Claude exited with code ${msg.exitCode}`,
              variant: msg.exitCode === 0 ? 'success' : 'error',
            });
            if (msg.exitCode !== 0) onRawOutput?.(`\n✗ Claude exited with code ${msg.exitCode}\n`);
            setIsDone(true);
            autoScrollRef.current = true;
            onDone?.(msg.exitCode, msg.report ?? '');
            if (msg.exitCode !== 0) es.close();
            break;

          case 'moved':
            push({ kind: 'status', message: `Ticket moved to ${msg.to}`, variant: 'moved' });
            onMoved?.(msg.to);
            break;

          case 'validation':
            push({ kind: 'validation', summary: msg.summary ?? '', approved: msg.approved });
            onValidation?.(msg.summary ?? '', msg.approved);
            es.close();
            break;

          case 'error':
            push({ kind: 'status', message: `Error: ${msg.message}`, variant: 'error' });
            onRawOutput?.(`\n✗ Error: ${msg.message}\n`);
            es.close();
            break;

          case 'warning':
            push({ kind: 'status', message: msg.message, variant: 'warning' });
            break;
        }
      } catch (e) {
        console.error('SSE parse error', e);
      }
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      push({ kind: 'status', message: 'Connection lost', variant: 'error' });
      es.close();
      onDone?.(null, '');
    };

    return () => es.close();
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 80;
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="w-full h-full min-h-[500px] max-h-[70vh] overflow-y-auto bg-slate-950 p-5 flex flex-col gap-3"
      style={{ fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace' }}
    >
      {items.map(item => {
        switch (item.kind) {
          case 'welcome':
            return <WelcomeItem key={item.id} modelLabel={item.modelLabel} ticketId={item.ticketId} />;

          case 'status':
            return (
              <div key={item.id} className={`flex items-start gap-2 text-xs font-mono ${STATUS_STYLES[item.variant]}`}>
                <span className="select-none shrink-0 mt-px">{STATUS_ICONS[item.variant]}</span>
                <span>{item.message}</span>
              </div>
            );

          case 'tool':
            return (
              <div key={item.id} className="flex items-start gap-2 text-xs font-mono text-slate-500">
                <span className="select-none shrink-0 mt-px text-slate-600">›</span>
                <span>{item.description}</span>
              </div>
            );

          case 'reasoning':
            return <ReasoningItem key={item.id} text={item.text} />;

          case 'text':
            return (
              <p key={item.id} className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
                {item.content}
              </p>
            );

          case 'stderr':
            return (
              <p key={item.id} className="text-red-400 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono opacity-80">
                {item.content}
              </p>
            );

          case 'validation':
            return (
              <div key={item.id} className={`rounded-lg border p-4 mt-2 ${item.approved ? 'border-emerald-800 bg-emerald-950/20' : 'border-amber-800 bg-amber-950/20'}`}>
                <div className={`text-xs font-mono font-bold mb-2 ${item.approved ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {item.approved ? '✓ Gemini Validation — APPROVED' : '⚠ Gemini Validation — NEEDS REVISION'}
                </div>
                <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {item.summary}
                </p>
              </div>
            );
        }
      })}

      {!isDone && items.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
          <span className="animate-pulse">▋</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
