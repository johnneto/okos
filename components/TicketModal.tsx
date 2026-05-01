'use client';

import { X, ArrowRight, Play, ChevronDown, Pencil, Eye, Save, Loader2, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { Ticket, ColumnId } from '@/lib/tickets';
import { CLAUDE_MODELS, DEFAULT_MODEL, TIER_STYLES, EFFORT_LEVELS, DEFAULT_EFFORT, type ClaudeModel, type EffortLevel } from '@/lib/claude-models';

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'backlog',    label: 'Backlog' },
  { id: 'todo',       label: 'To-Do' },
  { id: 'validation', label: 'Waiting for Validation' },
  { id: 'done',       label: 'Done' },
];

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onMove: (ticket: Ticket, to: ColumnId) => Promise<void>;
  onExecute: (ticket: Ticket, model: ClaudeModel, effort: EffortLevel) => void;
  onUpdated: () => void;  // triggers board refresh after a save
  onRethink?: (ticket: Ticket) => Promise<void>;
}

/** Lightweight Markdown → HTML renderer */
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#{4}\s(.+)$/gm, '<h4 class="text-sm font-bold text-slate-300 mt-4 mb-1">$1</h4>')
    .replace(/^#{3}\s(.+)$/gm, '<h3 class="text-base font-bold text-slate-200 mt-5 mb-1">$1</h3>')
    .replace(/^#{2}\s(.+)$/gm, '<h2 class="text-lg font-bold text-slate-100 mt-6 mb-2">$1</h2>')
    .replace(/^#{1}\s(.+)$/gm, '<h1 class="text-xl font-bold text-white mt-6 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100 font-semibold">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-700 text-indigo-300 text-xs px-1 py-0.5 rounded font-mono">$1</code>')
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre class="bg-slate-900 border border-slate-700 rounded p-3 text-xs text-slate-300 font-mono overflow-x-auto my-3 whitespace-pre">$1</pre>')
    .replace(/^[\-\*]\s(.+)$/gm, '<li class="ml-4 list-disc text-slate-300 text-sm">$1</li>')
    .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal text-slate-300 text-sm">$1</li>')
    .replace(/^-{3,}$/gm, '<hr class="border-slate-600 my-4" />')
    .replace(/\n\n/g, '</p><p class="text-slate-300 text-sm my-2">')
    .replace(/\n/g, '<br />');
}

export default function TicketModal({ ticket, onClose, onMove, onExecute, onUpdated, onRethink }: Props) {
  // ── Edit state ────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(ticket.title);
  const [editBody, setEditBody] = useState(ticket.body);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ── Move state ────────────────────────────────────────────────────────────
  const [moving, setMoving] = useState(false);

  // ── Rethink state ─────────────────────────────────────────────────────────
  const [rethinking, setRethinking] = useState(false);

  // ── Model picker state ────────────────────────────────────────────────────
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>(DEFAULT_MODEL);
  const modelDropRef = useRef<HTMLDivElement>(null);

  // ── Effort picker state ───────────────────────────────────────────────────
  const [effortOpen, setEffortOpen] = useState(false);
  const [selectedEffort, setSelectedEffort] = useState<EffortLevel>(DEFAULT_EFFORT);
  const effortDropRef = useRef<HTMLDivElement>(null);

  // Keep edit fields in sync if ticket prop changes from outside
  useEffect(() => {
    setEditTitle(ticket.title);
    setEditBody(ticket.body);
  }, [ticket.id, ticket.title, ticket.body]);

  // Auto-grow textarea
  useEffect(() => {
    if (editing && bodyRef.current) {
      bodyRef.current.style.height = 'auto';
      bodyRef.current.style.height = `${bodyRef.current.scrollHeight}px`;
    }
  }, [editing, editBody]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!modelDropRef.current?.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelOpen]);

  // Close effort dropdown on outside click
  useEffect(() => {
    if (!effortOpen) return;
    const handler = (e: MouseEvent) => {
      if (!effortDropRef.current?.contains(e.target as Node)) setEffortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [effortOpen]);

  const otherColumns = COLUMNS.filter(c => c.id !== ticket.column);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, body: editBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setEditing(false);
      onUpdated();
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(ticket.title);
    setEditBody(ticket.body);
    setSaveError('');
    setEditing(false);
  };

  const handleMove = async (to: ColumnId) => {
    setMoving(true);
    await onMove(ticket, to);
    setMoving(false);
    onClose();
  };

  const handleRethink = async () => {
    if (!onRethink || rethinking) return;
    setRethinking(true);
    try {
      await onRethink(ticket);
      onClose(); // board refresh + modal close handled by KanbanBoard
    } finally {
      setRethinking(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between p-5 border-b border-slate-700 gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-indigo-400 mb-1">{ticket.id}</p>

            {editing ? (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full bg-slate-800 border border-indigo-500 rounded-lg px-3 py-2 text-base font-bold text-white outline-none"
                placeholder="Ticket title"
                autoFocus
              />
            ) : (
              <h2 className="text-lg font-bold text-white leading-snug">{ticket.title}</h2>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 mt-1">
            {/* Edit / View toggle */}
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Edit ticket"
              >
                <Pencil size={13} />
                Edit
              </button>
            ) : (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Eye size={13} />
                Preview
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {editing ? (
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Plan (Markdown)
              </label>
              <textarea
                ref={bodyRef}
                value={editBody}
                onChange={e => {
                  setEditBody(e.target.value);
                  // auto-grow
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg p-3 text-sm text-slate-200 font-mono outline-none resize-none transition-colors leading-relaxed"
                placeholder="Write your implementation plan in Markdown…"
                style={{ minHeight: '320px' }}
              />
              {saveError && (
                <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}
            </div>
          ) : (
            <div
              className="prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(ticket.body) }}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-t border-slate-700">
          {editing ? (
            /* Save / Cancel row */
            <>
              <button
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={handleCancel}
                className="text-sm text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            /* Normal action row */
            <>
              {/* Rethink — only for backlog and todo */}
              {(ticket.column === 'backlog' || ticket.column === 'todo') && onRethink && (
                <button
                  onClick={handleRethink}
                  disabled={rethinking}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-violet-700/60 text-violet-300 bg-violet-900/30 hover:bg-violet-700/50 hover:text-white disabled:opacity-50 transition-colors"
                  title="Ask Gemini to rewrite the plan from scratch"
                >
                  {rethinking
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Sparkles size={14} />}
                  {rethinking ? 'Rethinking…' : 'Rethink'}
                </button>
              )}

              {/* Launch Claude (only for todo) */}
              {ticket.column === 'todo' && (
                <div className="flex items-center gap-2">
                  {/* Effort picker */}
                  <div ref={effortDropRef} className="relative">
                    <button
                      onClick={() => setEffortOpen(o => !o)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg border transition-colors ${
                        effortOpen
                          ? 'bg-slate-700 border-slate-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                      title="Select effort level"
                    >
                      <span>{selectedEffort.label}</span>
                      <ChevronDown size={12} className={`transition-transform ${effortOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {effortOpen && (
                      <div className="absolute left-0 bottom-full mb-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-800">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Effort level</p>
                        </div>
                        {EFFORT_LEVELS.map(level => (
                          <button
                            key={level.value}
                            onClick={() => { setSelectedEffort(level); setEffortOpen(false); }}
                            className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors ${
                              selectedEffort.value === level.value ? 'bg-slate-800/80' : ''
                            }`}
                          >
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold ${selectedEffort.value === level.value ? 'text-white' : 'text-slate-200'}`}>
                                {level.label}
                                {selectedEffort.value === level.value && (
                                  <span className="ml-2 text-[10px] text-indigo-400 font-normal">selected</span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">{level.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Model + Launch button */}
                  <div ref={modelDropRef} className="relative">
                    <div className="flex items-stretch rounded-lg overflow-hidden border border-indigo-600 text-sm font-semibold">
                      <button
                        onClick={() => { onExecute(ticket, selectedModel, selectedEffort); onClose(); }}
                        className="flex items-center gap-2 pl-3 pr-3 py-2 text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                      >
                        <Play size={14} />
                        Launch Claude
                      </button>
                      <div className="w-px bg-indigo-500" />
                      <button
                        onClick={() => setModelOpen(o => !o)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 transition-colors ${
                          modelOpen
                            ? 'bg-indigo-500 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-indigo-200'
                        }`}
                        title="Select Claude model"
                      >
                        <span className="text-xs">{selectedModel.label.replace('Claude ', '')}</span>
                        <ChevronDown size={13} className={`transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {modelOpen && (
                      <div className="absolute left-0 bottom-full mb-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-800">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Select Claude model</p>
                        </div>
                        {CLAUDE_MODELS.map(model => (
                          <button
                            key={model.id}
                            onClick={() => { setSelectedModel(model); setModelOpen(false); }}
                            className={`w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-slate-800 transition-colors ${
                              selectedModel.id === model.id ? 'bg-slate-800/80' : ''
                            }`}
                          >
                            <span className={`mt-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${TIER_STYLES[model.tier]}`}>
                              {model.tier.toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold ${selectedModel.id === model.id ? 'text-white' : 'text-slate-200'}`}>
                                {model.label}
                                {selectedModel.id === model.id && (
                                  <span className="ml-2 text-[10px] text-indigo-400 font-normal">selected</span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">{model.description}</p>
                              <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{model.id}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Move buttons */}
              <span className="text-xs text-slate-500 mr-1">Move to →</span>
              {otherColumns.map(col => (
                <button
                  key={col.id}
                  disabled={moving}
                  onClick={() => handleMove(col.id)}
                  className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  <ArrowRight size={12} />
                  {col.label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
