'use client';

import { useEffect, useRef } from 'react';
import type { Terminal as XTerminal } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';
// xterm CSS — Next.js allows CSS imports from node_modules in client components
import 'xterm/css/xterm.css';

interface TerminalProps {
  ticketId: string;
  modelId?: string;
  onDone?: (exitCode: number | null, report: string) => void;
  onMoved?: (to: string) => void;
  onValidation?: (summary: string, approved: boolean) => void;
  onRawOutput?: (text: string) => void;
}

export default function Terminal({ ticketId, modelId, onDone, onMoved, onValidation, onRawOutput }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import xterm (browser-only)
    Promise.all([
      import('xterm'),
      import('xterm-addon-fit'),
    ]).then(([{ Terminal: XTerm }, { FitAddon }]) => {
      const term = new XTerm({
        theme: {
          background: '#020617',   // slate-950
          foreground: '#e2e8f0',   // slate-200
          cursor: '#6366f1',       // indigo-500
          selectionBackground: '#334155',
          black: '#0f172a',
          brightBlack: '#475569',
          red: '#f87171',
          brightRed: '#fca5a5',
          green: '#34d399',
          brightGreen: '#6ee7b7',
          yellow: '#fbbf24',
          brightYellow: '#fde68a',
          blue: '#818cf8',
          brightBlue: '#a5b4fc',
          magenta: '#a78bfa',
          brightMagenta: '#c4b5fd',
          cyan: '#38bdf8',
          brightCyan: '#7dd3fc',
          white: '#e2e8f0',
          brightWhite: '#f8fafc',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);
      fitAddon.fit();

      termRef.current = term;
      fitRef.current = fitAddon;

      // Welcome message
      const modelLabel = (modelId ?? 'claude').replace('claude-', '').slice(0, 16);
      term.writeln('\x1b[38;5;99m┌──────────────────────────────────────────┐\x1b[0m');
      term.writeln(`\x1b[38;5;99m│  Okos — ${ticketId.padEnd(12)}                        │\x1b[0m`);
      term.writeln(`\x1b[38;5;99m│  Model: \x1b[38;5;183m${modelLabel.padEnd(34)}\x1b[38;5;99m│\x1b[0m`);
      term.writeln('\x1b[38;5;99m└──────────────────────────────────────────┘\x1b[0m');
      term.writeln('');
      term.writeln('\x1b[33mConnecting to execution stream…\x1b[0m');

      // Connect to SSE
      const esUrl = modelId
        ? `/api/tickets/execute/${ticketId}?model=${encodeURIComponent(modelId)}`
        : `/api/tickets/execute/${ticketId}`;
      const es = new EventSource(esUrl);
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'start':
              term.writeln(`\x1b[32m▶ ${msg.message}\x1b[0m`);
              break;

            case 'stdout':
              // Replace bare \n with \r\n for proper xterm rendering
              term.write(msg.data.replace(/\n/g, '\r\n'));
              onRawOutput?.(msg.data);
              break;

            case 'stderr':
              term.write('\x1b[31m' + msg.data.replace(/\n/g, '\r\n') + '\x1b[0m');
              onRawOutput?.(msg.data);
              break;

            case 'done':
              term.writeln('');
              term.writeln(
                msg.exitCode === 0
                  ? '\x1b[32m✓ Claude finished successfully (exit 0)\x1b[0m'
                  : `\x1b[31m✗ Claude exited with code ${msg.exitCode}\x1b[0m`
              );
              if (msg.exitCode !== 0) onRawOutput?.(`\n✗ Claude exited with code ${msg.exitCode}\n`);
              onDone?.(msg.exitCode, msg.report ?? '');
              if (msg.exitCode !== 0) es.close();
              break;

            case 'moved':
              term.writeln(`\x1b[36m→ Ticket moved to ${msg.to}\x1b[0m`);
              onMoved?.(msg.to);
              break;

            case 'validation':
              term.writeln('');
              term.writeln('\x1b[35m── Gemini Validation ──────────────────\x1b[0m');
              term.writeln(msg.summary?.replace(/\n/g, '\r\n') ?? '');
              term.writeln(
                msg.approved
                  ? '\x1b[32m✓ APPROVED — ticket moved to Done\x1b[0m'
                  : '\x1b[33m⚠ NEEDS REVISION — check the ticket\x1b[0m'
              );
              onValidation?.(msg.summary ?? '', msg.approved);
              es.close();
              break;

            case 'error':
              term.writeln(`\x1b[31m✗ Error: ${msg.message}\x1b[0m`);
              onRawOutput?.(`\n✗ Error: ${msg.message}\n`);
              es.close();
              break;

            case 'warning':
              term.writeln(`\x1b[33m⚠ ${msg.message}\x1b[0m`);
              break;
          }
        } catch (e) {
          console.error('SSE parse error', e);
        }
      };

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return;
        term.writeln('\x1b[31m✗ Connection lost\x1b[0m');
        es.close();
        onDone?.(null, '');
      };
    }).catch(err => {
      console.error('Failed to load xterm', err);
    });

    // Fit on resize
    const observer = new ResizeObserver(() => fitRef.current?.fit());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      esRef.current?.close();
      termRef.current?.dispose();
    };
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[500px] bg-slate-950 rounded-lg overflow-hidden"
      style={{ padding: '8px' }}
    />
  );
}
