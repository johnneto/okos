'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TicketCard from './TicketCard';
import TicketModal from './TicketModal';
import type { Ticket, ColumnId } from '@/lib/tickets';
import { DEFAULT_EFFORT, type ClaudeModel, type EffortLevel } from '@/lib/claude-models';

const COLUMN_DEFS: { id: ColumnId; label: string; color: string; headerColor: string }[] = [
  {
    id: 'backlog',
    label: 'Backlog',
    color: 'border-slate-600',
    headerColor: 'text-slate-400 border-slate-600',
  },
  {
    id: 'todo',
    label: 'To-Do',
    color: 'border-indigo-700',
    headerColor: 'text-indigo-400 border-indigo-700',
  },
  {
    id: 'validation',
    label: 'Waiting for Validation',
    color: 'border-amber-700',
    headerColor: 'text-amber-400 border-amber-700',
  },
  {
    id: 'done',
    label: 'Done',
    color: 'border-emerald-700',
    headerColor: 'text-emerald-400 border-emerald-700',
  },
];

interface Props {
  tickets: Ticket[];
  onRefresh: () => void;
}

export default function KanbanBoard({ tickets, onRefresh }: Props) {
  const router = useRouter();
  const [draggedTicket, setDraggedTicket] = useState<Ticket | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const handleDragStart = useCallback((ticket: Ticket) => {
    setDraggedTicket(ticket);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: ColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(colId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetCol: ColumnId) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTicket || draggedTicket.column === targetCol) {
      setDraggedTicket(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tickets/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: draggedTicket.id,
          from: draggedTicket.column,
          to: targetCol,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Move failed');
      }
      onRefresh();
    } catch (err) {
      console.error(err);
      alert(`Move failed: ${err}`);
    } finally {
      setLoading(false);
      setDraggedTicket(null);
    }
  }, [draggedTicket, onRefresh]);

  // ── Move via modal ──────────────────────────────────────────────────────────

  const handleModalMove = async (ticket: Ticket, to: ColumnId) => {
    const res = await fetch('/api/tickets/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: ticket.id, from: ticket.column, to }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    onRefresh();
  };

  const handleExecute = (ticket: Ticket, model: ClaudeModel, effort?: EffortLevel) => {
    const effortValue = (effort ?? DEFAULT_EFFORT).value;
    router.push(`/execute/${ticket.id}?model=${encodeURIComponent(model.id)}&effort=${encodeURIComponent(effortValue)}`);
  };

  const handleRethink = async (ticket: Ticket): Promise<void> => {
    const res = await fetch(`/api/tickets/rethink/${ticket.id}`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? 'Rethink failed');
    }
    onRefresh();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className={`grid grid-cols-4 gap-4 ${loading ? 'opacity-70 pointer-events-none' : ''}`}>
        {COLUMN_DEFS.map(col => {
          const colTickets = tickets.filter(t => t.column === col.id);
          const isOver = dragOverColumn === col.id && draggedTicket?.column !== col.id;

          return (
            <div
              key={col.id}
              onDragOver={e => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.id)}
              className={`flex flex-col rounded-xl border ${col.color} bg-slate-900/50 transition-all duration-150 ${
                isOver ? 'ring-2 ring-indigo-500 bg-indigo-950/30' : ''
              }`}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2.5 border-b ${col.headerColor}`}>
                <span className="text-xs font-bold uppercase tracking-wider">{col.label}</span>
                <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                  {colTickets.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2 flex-1 min-h-[200px]">
                {colTickets.length === 0 && (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-slate-600 text-center px-4">
                      {isOver ? 'Drop here' : 'No tickets'}
                    </p>
                  </div>
                )}
                {colTickets.map(ticket => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onDragStart={handleDragStart}
                    onClick={setSelectedTicket}
                    onExecute={handleExecute}
                    onRethink={handleRethink}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onMove={handleModalMove}
          onExecute={handleExecute}
          onUpdated={() => { onRefresh(); setSelectedTicket(null); }}
          onRethink={async (ticket) => { await handleRethink(ticket); setSelectedTicket(null); }}
        />
      )}
    </>
  );
}
