'use client';

import { Play, Clock, CheckCircle2, AlertCircle, Loader2, ChevronDown, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { Ticket, ColumnId } from '@/lib/tickets';
import { CLAUDE_MODELS, DEFAULT_MODEL, TIER_STYLES, type ClaudeModel } from '@/lib/claude-models';

interface Props {
  ticket: Ticket;
  onDragStart: (ticket: Ticket) => void;
  onClick: (ticket: Ticket) => void;
  onExecute?: (ticket: Ticket, model: ClaudeModel) => void;
  onRethink?: (ticket: Ticket) => Promise<void>;
}

const STATUS_BADGE: Record<ColumnId, { label: string; className: string; icon: React.ReactNode }> = {
  backlog:    { label: 'Backlog',    className: 'bg-slate-700 text-slate-300',     icon: <Clock size={11} /> },
  todo:       { label: 'To-Do',      className: 'bg-indigo-900 text-indigo-300',   icon: <AlertCircle size={11} /> },
  validation: { label: 'Validation', className: 'bg-amber-900 text-amber-300',     icon: <Loader2 size={11} className="animate-spin" /> },
  done:       { label: 'Done',       className: 'bg-emerald-900 text-emerald-300', icon: <CheckCircle2 size={11} /> },
};

export default function TicketCard({ ticket, onDragStart, onClick, onExecute, onRethink }: Props) {
  const badge = STATUS_BADGE[ticket.column];
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ClaudeModel>(DEFAULT_MODEL);
  const [rethinking, setRethinking] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleRethink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRethink || rethinking) return;
    setRethinking(true);
    try {
      await onRethink(ticket);
    } finally {
      setRethinking(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const createdDate = ticket.createdAt
    ? new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(ticket)}
      onClick={() => onClick(ticket)}
      className="group relative bg-slate-800 border border-slate-700 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-900/20 transition-all duration-150"
    >
      {/* ID + Badge row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-slate-500">{ticket.id}</span>
        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.icon}
          {badge.label}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-slate-200 leading-snug line-clamp-2 mb-3">
        {ticket.title}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {createdDate && (
          <span className="text-[10px] text-slate-500">{createdDate}</span>
        )}

        <div className="ml-auto flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {/* Rethink — only in Backlog and To-Do columns */}
          {(ticket.column === 'backlog' || ticket.column === 'todo') && onRethink && (
            <button
              onClick={handleRethink}
              disabled={rethinking}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded text-violet-400 hover:text-white hover:bg-violet-700/50 disabled:opacity-50 transition-colors"
              title="Rethink plan with Gemini"
            >
              {rethinking
                ? <Loader2 size={10} className="animate-spin" />
                : <Sparkles size={10} />}
              {rethinking ? 'Thinking…' : 'Rethink'}
            </button>
          )}

        {/* Launch Claude — only in To-Do column */}
        {ticket.column === 'todo' && onExecute && (
          <div
            ref={dropdownRef}
            className="relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Split button: [▶ Launch Claude] [▾] */}
            <div className="flex items-stretch rounded overflow-hidden border border-indigo-700/60 text-[11px] font-semibold">
              {/* Main action */}
              <button
                onClick={() => { onExecute(ticket, selected); }}
                className="flex items-center gap-1 pl-2 pr-2 py-1 text-indigo-300 bg-indigo-900/40 hover:bg-indigo-600 hover:text-white transition-colors"
              >
                <Play size={10} />
                Launch Claude
              </button>

              {/* Divider */}
              <div className="w-px bg-indigo-700/60" />

              {/* Model selector toggle */}
              <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1 px-1.5 py-1 transition-colors ${
                  open
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-400 bg-indigo-900/40 hover:bg-indigo-700/60 hover:text-white'
                }`}
                title="Select model"
              >
                <span className="max-w-[60px] truncate text-[10px] opacity-80">
                  {selected.label.replace('Claude ', '')}
                </span>
                <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Dropdown */}
            {open && (
              <div className="absolute right-0 bottom-full mb-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Select Claude model</p>
                </div>
                {CLAUDE_MODELS.map(model => (
                  <button
                    key={model.id}
                    onClick={() => { setSelected(model); setOpen(false); }}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors ${
                      selected.id === model.id ? 'bg-slate-800/80' : ''
                    }`}
                  >
                    {/* Tier badge */}
                    <span className={`mt-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${TIER_STYLES[model.tier]}`}>
                      {model.tier.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${selected.id === model.id ? 'text-white' : 'text-slate-200'}`}>
                        {model.label}
                        {selected.id === model.id && (
                          <span className="ml-2 text-[9px] text-indigo-400 font-normal">selected</span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{model.description}</p>
                      <p className="text-[9px] text-slate-600 mt-0.5 font-mono">{model.id}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        </div>{/* end ml-auto flex wrapper */}
      </div>
    </div>
  );
}
