import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { findTicket, moveTicket, COLUMNS } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function enc(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function buildExecutionPrompt(ticketId: string, ticketRelPath: string): string {
  const swiftGuidelines = [
    '# Swift Development Guidelines',
    '',
    '## Role',
    'You are a Senior iOS Engineer specializing in SwiftUI, SwiftData, and related frameworks.',
    '',
    '## Core Requirements',
    '- Target iOS 26.0 or later (compatible with iOS 18.0+)',
    '- Swift 6.2 or later with modern Swift concurrency',
    '- Use async/await APIs over closure-based variants',
    '- SwiftUI backed by @Observable classes for shared data',
    '- No third-party frameworks without explicit approval',
    '- Avoid UIKit unless specifically requested',
    '',
    '## Swift Concurrency & Data',
    '- @Observable classes must be marked @MainActor',
    '- Use @State for ownership, @Bindable/@Environment for passing data',
    '- Never use ObservableObject, @Published, @StateObject, @ObservedObject, @EnvironmentObject',
    '- Assume strict Swift concurrency rules are being applied',
    '- Avoid force unwraps and force try unless unrecoverable',
    '',
    '## Modern APIs (Never use legacy patterns)',
    '- Use Swift-native string methods: replacing() instead of replacingOccurrences()',
    '- Modern Foundation: URL.documentsDirectory, appending(path:)',
    '- FormatStyle API for formatting: formatted(date:time:), formatted(.number), Date(strategy: .iso8601)',
    '- Never use DateFormatter, NumberFormatter, MeasurementFormatter',
    '- Use localizedStandardContains() for user-input filtering',
    '- Use Task.sleep(for:) instead of Task.sleep(nanoseconds:)',
    '',
    '## SwiftUI Best Practices',
    '- foregroundStyle() instead of foregroundColor()',
    '- clipShape(.rect(cornerRadius:)) instead of cornerRadius()',
    '- Tab API instead of tabItem()',
    '- NavigationStack with navigationDestination(for:) instead of NavigationView',
    '- Use Button for taps; onTapGesture() only if you need location/count metadata',
    '- Use containerRelativeFrame() or visualEffect() instead of GeometryReader',
    '- Prefer ImageRenderer over UIGraphicsImageRenderer',
    '- Place view logic in view models for testability',
    '- Avoid AnyView unless absolutely required',
    '',
    '## Skills Available',
    '- SwiftData: Use for data persistence, predicates, CloudKit considerations',
    '- SwiftTesting: Use for unit/integration tests (not UI tests)',
    '- SwiftUI: Use for view reviews and modern component patterns',
    '',
  ].join('\n');

  const executionSteps = [
    '# Implementation Task',
    '',
    `Execute the implementation plan in the ticket file: ${ticketRelPath}`,
    '',
    'Instructions:',
    '1. Read the full plan from the ticket file',
    '2. Pull the latest code from the dev branch (git pull origin dev)',
    '3. Implement all changes described in the plan',
    '4. Apply the Swift, SwiftUI, SwiftData, and SwiftTesting guidelines above',
    '5. Run the test suite and fix any failures',
    '6. If all tests pass, commit the changes with a descriptive message referencing ticket ID: ' + ticketId,
    '7. Report what was done at the end',
  ].join('\n');

  return swiftGuidelines + '\n\n' + executionSteps;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticketId = params.id;
  const modelId = req.nextUrl.searchParams.get('model') ?? 'claude-sonnet-4-6';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(enc(obj)));
        } catch {
          // client disconnected
        }
      };

      // Find the ticket
      const ticket = findTicket(ticketId);
      if (!ticket) {
        send({ type: 'error', message: `Ticket ${ticketId} not found` });
        controller.close();
        return;
      }

      // Determine the relative path to the ticket file for the claude command
      const ticketsBase = process.env.TICKETS_BASE_PATH ?? '../tickets';
      const ticketsAbs = path.isAbsolute(ticketsBase)
        ? ticketsBase
        : path.resolve(process.cwd(), ticketsBase);

      const colDir = COLUMNS.find(c => c.id === ticket.column)?.dir ?? '';
      const ticketRelPath = path.join(ticketsAbs, colDir, ticket.filename);

      // Build the prompt with Swift guidelines
      const claudePrompt = buildExecutionPrompt(ticketId, ticketRelPath);

      send({ type: 'start', ticketId, modelId, message: `Launching ${modelId} for ${ticketId}…` });

      const child = spawn('claude', ['--model', modelId, '-p', claudePrompt], {
        cwd: process.env.APP_BASE_PATH
          ? path.isAbsolute(process.env.APP_BASE_PATH)
            ? process.env.APP_BASE_PATH
            : path.resolve(process.cwd(), process.env.APP_BASE_PATH)
          : process.cwd(),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const outputChunks: string[] = [];

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChunks.push(text);
        send({ type: 'stdout', data: text });
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChunks.push(text);
        send({ type: 'stderr', data: text });
      });

      child.on('error', (err) => {
        send({ type: 'error', message: `Failed to start claude: ${err.message}` });
        controller.close();
      });

      child.on('close', async (code) => {
        const fullReport = outputChunks.join('');
        send({ type: 'done', exitCode: code, report: fullReport });

        // Move ticket to validation
        try {
          if (ticket.column === 'todo') {
            const moved = moveTicket(ticketId, 'todo', 'validation');
            syncTicket(moved).catch(() => {});
            send({ type: 'moved', to: 'validation' });
          }
        } catch (moveErr) {
          send({ type: 'warning', message: `Could not move ticket: ${moveErr}` });
        }

        // Trigger Gemini validation in the background
        try {
          const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
          fetch(`${origin}/api/tickets/validate/${ticketId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claudeReport: fullReport }),
          }).then(async (r) => {
            const data = await r.json();
            send({ type: 'validation', summary: data.summary, approved: data.approved });
            controller.close();
          }).catch((e) => {
            send({ type: 'warning', message: `Validation error: ${e}` });
            controller.close();
          });
        } catch {
          controller.close();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
