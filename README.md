# Okos: Ticket Orchestrator

**Okos** is a local AI-powered Kanban dashboard designed to manage development tickets stored as `.md` files. It bridges the gap between planning and implementation by leveraging Gemini Flash for architecture and Claude for execution, all while keeping a Google Sheets mirror in sync.

---

## 🚀 Quick Start

```bash
cd orchestrator

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local with your API keys (see Configuration below)

# 3. Run the development server
npm run dev
# → http://localhost:3001
```

---

## 📂 Directory Layout

Okos operates on a local directory structure, allowing you to keep your tickets right next to your code.

```text
Ticket Manager/
├── orchestrator/          ← This Next.js app (Okos)
├── tickets/
│   ├── 1_backlog/         ← .md files
│   ├── 2_todo/
│   ├── 3_validation/
│   └── 4_done/
└── app/                   ← The codebase being developed
```

---

## ⚙️ Configuration (.env.local)

| Variable | Description |
|---|---|
| `TICKETS_BASE_PATH` | Path to the `tickets/` root (default: `../tickets`) |
| `APP_BASE_PATH` | Path to the app being developed (default: `../app`) |
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GOOGLE_SHEETS_ID` | The ID found in your spreadsheet URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email from Google Cloud Console |
| `GOOGLE_PRIVATE_KEY` | Service account private key |

### Google Sheets Setup
1. **Create a Google Cloud project** and enable the **Sheets API**.
2. **Create a service account** and download the JSON key.
3. **Share your spreadsheet** with the service account email as an **Editor**.
4. Copy `client_email` to `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
5. Copy `private_key` to `GOOGLE_PRIVATE_KEY`.

---

## ✨ Features

*   **AI Ticket Creation**: Use "New Ticket" mode to let Gemini Flash architect the implementation plan, or use manual mode for raw Markdown.
*   **Dynamic Kanban Board**: Drag-and-drop cards between columns. Status updates are reflected in the file system instantly.
*   **Live File Watch**: Integrated `chokidar` detects manual file moves in your Finder or Terminal and automatically refreshes the UI.
*   **Automated Execution**: Launch Claude directly on "To-Do" tickets via a live `xterm.js` terminal.
*   **Smart Validation**: After execution, Gemini reads the `git diff` and appends a validation summary to the ticket.
*   **Sheets Sync**: Statuses stay synced on every move, with a manual "Sync Sheets" option for full reconciliation.

---

## 📝 Ticket Format

Each ticket is a Markdown file utilizing YAML frontmatter for metadata tracking:

```markdown
---
id: "TICKET-001"
title: "Add user authentication"
status: "todo"
created_at: "2026-04-30T10:00:00.000Z"
---

## Implementation Plan
1. Install NextAuth.js
2. Configure Google Provider...
```

---

## 🏗️ Architecture



### Frontend & API
*   **`app/page.tsx`**: The main Kanban board (utilizing polling + SSE).
*   **`app/execute/[id]/page.tsx`**: Dedicated execution environment with `xterm.js`.
*   **`api/tickets/`**: Handlers for fetching, creating, and moving tickets.
*   **`api/tickets/generate`**: Gemini-powered architect phase.
*   **`api/tickets/execute/[id]`**: SSE stream providing real-time output from Claude.
*   **`api/watch/`**: Server-Sent Events (SSE) file watcher.

### Logic & Components
*   **`lib/`**: Core utilities for filesystem operations (`tickets.ts`), AI integration (`gemini.ts`), and external sync (`sheets.ts`).
*   **`components/`**: Modular UI elements including `KanbanBoard`, `TicketCard`, and the `Terminal` wrapper.
