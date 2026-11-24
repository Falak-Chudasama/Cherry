<div align="center">

  <img src="client/public/cherry-icon.svg" alt="Cherry Logo" width="96" height="96" />

  # Cherry

  **The sovereign, offline-first personal operating system and deep-work accountability engine.**

  Orchestrate fixed 7-day quarter sprints, govern habits with auditable key ledgers,  
  recover deterministically from power-downs, and execute with a grammar-constrained local AI co-pilot.  
  100% offline. Zero cloud lock-in. Zero telemetry. Uncompromising focus.

  <p align="center">
    <a href="#why-cherry"><img src="https://img.shields.io/badge/Local--First-100%25%20Offline-22c55e?style=for-the-badge&logo=shield" alt="Local-First 100% Offline" /></a>
    <a href="#architecture-and-systems-engineering"><img src="https://img.shields.io/badge/FastAPI-Python%203.10%2B-009688?style=for-the-badge&logo=fastapi" alt="FastAPI Backend" /></a>
    <a href="#architecture-and-systems-engineering"><img src="https://img.shields.io/badge/React%2018-Vite%20%2B%20TypeScript-61dafb?style=for-the-badge&logo=react" alt="React 18 Frontend" /></a>
    <a href="#architecture-and-systems-engineering"><img src="https://img.shields.io/badge/MongoDB-Motor%20Async-47A248?style=for-the-badge&logo=mongodb" alt="MongoDB Async" /></a>
    <a href="#architecture-and-systems-engineering"><img src="https://img.shields.io/badge/Tailwind-CSS-38bdf8?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS" /></a>
    <a href="#license"><img src="https://img.shields.io/badge/License-MIT-amber.svg?style=for-the-badge" alt="License MIT" /></a>
  </p>

  <p align="center">
    <a href="#why-cherry">Why Cherry</a> •
    <a href="#workspaces-and-interface-tour">Workspaces</a> •
    <a href="#temporal-and-governance-matrix">Temporal Matrix</a> •
    <a href="#architecture-and-systems-engineering">Architecture</a> •
    <a href="#hardened-engineering-guardrails">Guardrails</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#configuration-reference">Configuration</a> •
    <a href="#verification-and-testing">Verification</a>
  </p>

</div>

---

## Why Cherry?

Traditional task managers and productivity platforms suffer from recurring systemic flaws:
- **Fragile Cloud SaaS & Surveillance:** Personal journals, habits, and schedules are uploaded to commercial servers, monetized, and gated behind subscription paywalls.
- **Unchecked Postponement & Cognitive Drift:** Standard task lists allow frictionless, infinite deferrals without boundaries, compounding cognitive load.
- **Lack of True Accountability:** Commitments carry no consequences; skipped habits and broken goals are rolled over silently, eroding discipline.
- **Unconstrained AI Hallucinations:** Generic LLM integrations mutate database state unpredictably, delete entries without verification, or hallucinate task completions.
- **Crash-Vulnerable State & Timers:** Sudden laptop shutdowns or power cuts terminate active focus blocks and desynchronize sprint timelines.

**Cherry solves these challenges at the architectural level:**
- **100% Sovereign & Local-First:** Binds strictly to `127.0.0.7` with a local asynchronous MongoDB instance. Zero remote telemetry, zero analytics tracking, and zero cloud dependencies.
- **The Quarter System Temporal Architecture:** Enforces rigid time boundaries: Verse (Year) &rarr; Season (Month) &rarr; Quarter (fixed 7-day sprints: Q1–Q4 + Surplus) &rarr; Day. Every sprint features fixed bookends, a 22:00 check-in, and a hard 23:00 daily closure.
- **Auditable Governance & Quarter Keys:** Sprints are endowed with initial Quarter Keys (default: 3). Violations are logged with immutable evidence in an audit ledger. A strict invariant ensures Junk Point (JP) overages record infractions without automated key-slashing.
- **Durable Downtime Catch-Up:** Survives sudden reboots and extended system downtime. The background reconciliation state machine catches up missed periods chronologically without ever fabricating historical user actions.
- **Grammar-Constrained AI with Two-Phase Commits:** Integrates local LLMs (Lemon) through deterministic live reality snapshots, strict Pydantic grammars, and a staged approval gate (dry-run proposal &rarr; explicit user execution).
- **Fruit Family Design System:** Crafted with signature tokens (`#FAF6F6` warm paper, `#141212` charcoal, `#FF5252` cherry flesh, `#4CAF50` leaf green), ambient glass refraction, synthesized Web Audio cues, and full keyboard ergonomics (`1-4`, `Ctrl+K`, `n`, `t`, `m`, `?`).

---

## Workspaces and Interface Tour

### 1. Day Command Center (`/` or `/day`)
> The daily operational hub with live countdown telemetry, execution Kanban, and deep-work orchestration.

- **23:00 Daily Closure Countdown:** High-visibility temporal anchor showing exact hours and minutes remaining until the 23:00 day boundary.
- **Strict 3-Status Kanban:** Eliminates status ambiguity with explicit states: `Not started` • `In progress` • `Done`.
- **Tri-Tier Task Organization:** Segregates commitments into **Must Do** (non-negotiable core commitments), **Should Do** (secondary strategic items), and **Routines** (habit loops).
- **Subtask Execution Matrix:** Visual progress bars, day-level scheduling (`start_day` through `end_day`), and instant item toggling.
- **Pomodoro Focus Studio:** 60-minute deep-work focus blocks and 10-minute rest intervals with synthesized audio sound effects.
- **Diet & Junk Point Ledger:** Real-time tracking against the daily 50 JP cap, offering food-to-JP auto-mapping and real-time remaining budget calculations.
- **Friction & Retrospective Log:** Capture daily resistance points and review bad-day indicators with objective criteria.

---

### 2. Quarter Sprint Workbench (`/quarter`)
> Fixed 7-day tactical execution sprints with auditable governance and milestone tracking.

- **Fixed 7-Day Sprint Cadence:**
  - **Q1:** Days 1–7
  - **Q2:** Days 8–14
  - **Q3:** Days 15–21
  - **Q4:** Days 22–28
  - **Surplus Period:** Days 29–end of month (buffer for retrospectives, rest, and cross-quarter calibration)
- **Quarter Key Ledger:** Live visual balance of active keys with a cryptographically auditable transaction ledger recording deltas, reasons, and linked violation IDs.
- **Goal & Plan Versioning:** Iterative planning workbench supporting multi-version draft refinement before committing to active execution.
- **Sprint Health & Completion Rates:** Quantitative metrics tracking Must Do velocity, routine consistency, and confirmed period infractions.

---

### 3. Sovereign Notes Hub (`/notes`)
> Distraction-free, markdown-driven personal knowledge base tied directly to sprint context.

- **GitHub Flavored Markdown:** Powered by `react-markdown`, `remark-gfm`, and `remark-breaks` for rich tables, code blocks, checklists, and formatted notes.
- **Contextual Tagging & Search:** Link notes directly to active quarters, specific days, or long-term seasonal goals.
- **Zero-Cloud Local Storage:** All notes are stored within the sovereign MongoDB instance, free from remote indexing and third-party scanning.

---

### 4. Cherry AI Co-Pilot & Command Terminal (`/chat` & Drawer)
> Grammar-constrained intelligence combining deterministic database queries with safe action staging.

- **Live Reality Snapshot:** Every query is prepended with a deterministic, zero-LLM context snapshot (~200 tokens) detailing current time, sprint day, pending tasks, active routines, and remaining JP.
- **Two-Phase Action Staging:** The assistant parses natural language requests (e.g., *"ate 2 falafel wraps for 25 jp"* or *"finished morning workout"*), calculates mutations, and presents an interactive action card. Zero database mutation occurs until the user approves.
- **Deterministic Structured Reports:** On-demand generation of Day Snapshots, Quarter Reviews, Cross-Quarter Comparisons, and Surplus Audits.
- **Server-Sent Events (SSE):** Real-time token streaming (`event: delta`), dynamic interactive UI cards (`event: card`), and completion signals (`event: done`).

---

## Temporal and Governance Matrix

Cherry organizes time into four immutable nested tiers, eliminating perpetual task rollover and forcing disciplined execution:

| Tier | Temporal Scope | Structure & Boundaries | Governance & Lifecycle Protocols |
|---|---|---|---|
| **Verse** | 1 Calendar Year | 12 Seasons (Jan–Dec) | Annual velocity evaluation, long-term strategic calibration, verse closure archiving. |
| **Season** | 1 Calendar Month | 4 Quarters + Surplus Period | Monthly health aggregation, surplus period buffer, cross-quarter performance audit. |
| **Quarter** | Exactly 7 Days | Q1 (1–7) • Q2 (8–14) • Q3 (15–21) • Q4 (22–28) | Endowed with 3 Quarter Keys; sprint plan lock-in; carry-over reconciliation at 23:00 on Day 7. |
| **Surplus** | 1 to 3 Days | Days 29–31 (if month > 28 days) | Buffer zone; retrospective analysis; no new Quarter Keys spent; catch-up execution. |
| **Day** | 24 Hours | 00:00 to 23:59 (Asia/Kolkata default) | 22:00 Check-In; 23:00 Hard Closure; 50 Junk Point limit; Pomodoro session tracking. |

---

## Architecture and Systems Engineering

Cherry is architected as an offline-first distributed system optimized for crash recovery, data integrity, and deterministic execution.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Cherry Client (Browser)                              │
│       React 18 • TypeScript • Tailwind CSS • Vite • Lucide Icons • Web Audio     │
│   Directional Transitions • Keyboard Navigation Engine • SSE Stream Consumer     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ REST API / SSE (http://127.0.0.7:10000)
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           Cherry Core (FastAPI Backend)                          │
│   • Asynchronous Lifespan Management & 30-Second Background Scheduler Daemon     │
│   • Strict Domain Routers: Calendar, Tasks, Plans, Focus, Accountability, Chat   │
│   • Live Reality Snapshot Generator (Zero-LLM Deterministic Context Injection)   │
└──────────────────┬─────────────────────┬──────────────────────────┬──────────────┘
                   │                     │                          │
                   ▼                     ▼                          ▼
┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
│   Durable Lifecycle    │  │  Grammar-Constrained   │  │   Ecosystem Adapters   │
│  & Downtime Recovery   │  │      AI Pipeline       │  │                        │
│ • Idempotent Outbox    │  │ • Pydantic Grammars    │  │ • Basket Core Adapter  │
│ • Chronological Sweep  │  │ • Two-Phase Commits    │  │   (Port 10010)         │
│ • Pomodoro Recovery    │  │ • Intent Router (T=0)  │  │ • Lemon LLM Adapter    │
│ • Zero Historical Mock │  │ • SSE Event Dispatch   │  │   (Port 10000/api/v1)  │
└──────────────────┬─────┘  └────────────┬───────────┘  └────────────────────────┘
                   │                     │
                   └──────────┬──────────┘
                              │ Motor Async Driver
                              ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           MongoDB Engine (Port 10000)                            │
│   Collections: days • quarters • seasons • verses • tasks • goals • routines     │
│                junk_point_ledger • quarter_key_ledger • lifecycle_jobs • chats   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Hardened Engineering Guardrails

#### 1. Durable Downtime Catch-Up & Outbox State Machine
- **Survives Arbitrary Power-Downs:** If the host machine is turned off for days or weeks, upon boot Cherry identifies the chronological gap between the last recorded anchor date and today.
- **Strict Chronological Progression:** Missed days, quarters, and seasons are evaluated in forward order, executing proper closures and scheduled transitions.
- **Zero Fabrication Invariant:** Downtime catch-up never fabricates retrospective user actions. Unfinished tasks remain uncompleted, and retrospective plans remain unapproved drafts.
- **Idempotent Job Enqueue:** Every lifecycle transition is assigned an immutable `idempotency_key`. Duplicate trigger attempts (from server restarts or race conditions) are safely de-duplicated at the database layer.

#### 2. Grammar-Constrained AI & Staged Approval Gate
- **Deterministic Two-Step Pipeline:** User prompts are first routed via a fast intent classifier (`temperature: 0.0`) constrained by strict Pydantic grammars (`action_grammar`, `task_grammar`, `plan_grammar`, `query_grammar`).
- **Two-Phase Commit Gate:** When an action (such as logging food or completing a task) is proposed via natural language, the executor stages the mutation in memory, verifies parameters, and checks for ambiguity. If details are missing, it asks for clarification. Mutation of the database **only** occurs when the user explicitly triggers `/api/chat/actions/execute`. Duplicate execution calls are rejected with HTTP 400.

#### 3. Power-Loss Resilient Pomodoro Focus Studio
- **Timer Reconstruction:** Focus sessions persist their start timestamps, targets, and pause states in MongoDB. If the server crashes mid-session, the startup reconciler calculates exact elapsed wall-clock time and seamlessly restores the session state.

#### 4. Absolute Quarter Key & Accountability Invariants
- **Quarter Keys:** Stored as an append-only transaction ledger (`QuarterKeyLedgerModel`) recording exact balance before and after each transaction.
- **Junk Point Decoupling:** While exceeding 50 daily Junk Points automatically registers a confirmed rule violation in the accountability ledger, it strictly **never** triggers automatic key deduction—preserving conscious human agency and deliberate auditability.

---

## Getting Started

### Prerequisites
- **Python:** 3.10 or newer
- **Node.js:** 18 or newer (with npm)
- **MongoDB:** Running locally on port `10000` (e.g., `mongodb://127.0.0.1:10000/cherry`)

---

### Step 1: Backend Setup (FastAPI)

```bash
# Navigate to the server directory
cd server

# Create and activate a Python virtual environment
# On Windows:
python -m venv .venv
.\.venv\Scripts\activate

# On macOS / Linux:
# python3 -m venv .venv
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the Cherry Backend (runs on http://127.0.0.7:10000)
python run.py
```

*The backend will initialize database indexes, perform startup downtime reconciliation, launch the 30-second lifecycle scheduler loop, and bind to `127.0.0.7:10000`.*

---

### Step 2: Frontend Setup (Vite + React)

Open a new terminal window:

```bash
# Navigate to the client directory
cd client

# Install frontend dependencies
npm install

# Start the Vite development server (runs on http://127.0.0.7:5070)
npm run dev
```

*Open your browser and navigate to **`http://127.0.0.7:5070`** to access Cherry.*

---

### Step 3: Ecosystem Services (Optional)

Cherry seamlessly integrates with neighboring Fruit Family services when available:
- **Basket Core (`http://127.0.0.1:10010`):** Provides cross-app notifications and shared preferences.
- **Lemon LLM API (`http://127.0.0.6:10000/api/v1`):** Powers local neural inference for the Cherry AI co-pilot. If Lemon is unavailable, Cherry safely enters fallback mode without crashing.

---

## Configuration Reference

Cherry is configured via environment variables or a `.env` file located in the `server` directory:

| Environment Variable | Default Value | Description |
|---|---|---|
| `HOST` | `127.0.0.7` | IP address binding for the FastAPI server |
| `PORT` | `10000` | Port allocation for the Cherry backend API |
| `MONGO_URI` | `mongodb://127.0.0.1:10000/cherry` | MongoDB connection string |
| `DATABASE_NAME` | `cherry` | Target database name in MongoDB |
| `BASKET_API_URL` | `http://127.0.0.1:10010` | Ecosystem endpoint for Basket core service |
| `LEMON_API_URL` | `http://127.0.0.6:10000/api/v1` | Ecosystem endpoint for Lemon local LLM inference |
| `TIMEZONE` | `Asia/Kolkata` | Canonical timezone for day and quarter boundaries |
| `CLOSURE_HOUR` | `23` | Hour of the day (23:00) when daily closure occurs |
| `CHECKIN_HOUR` | `22` | Hour of the day (22:00) for mandatory evening check-in |
| `JUNK_POINT_LIMIT` | `50` | Maximum daily Junk Point budget before violation |
| `QUARTER_KEYS_INITIAL` | `3` | Initial key allocation per 7-day quarter sprint |
| `FOCUS_DURATION_MINUTES` | `60` | Default Pomodoro focus session block duration |
| `BREAK_DURATION_MINUTES` | `10` | Default Pomodoro rest interval duration |

---

## Verification and Testing

Cherry features comprehensive automated verification suites covering edge cases, downtime scenarios, and AI grammars:

```bash
# 1. Run Backend Pytest Suite (39 comprehensive tests)
cd server
.\.venv\Scripts\pytest.exe -v

# 2. Run Production Client Build Verification (TypeScript + Vite)
cd ../client
npm run build
```

### Key Automated Test Suites
- **`test_downtime_catchup.py`:** Validates 10 distinct recovery scenarios (crash before closure, multi-day offline gaps, quarter/season/verse boundary transitions, external service blackouts, and crash idempotency).
- **`test_master_pipeline.py`:** Tests the two-phase AI quick-action approval gate, deterministic report generators, and live scheduler idempotency.
- **`test_accountability.py`:** Verifies Quarter Key ledger transactions and guarantees that exceeding the 50 JP limit does not trigger automated key deductions.
- **`test_pomodoro_focus.py`:** Validates mid-session server crash recovery and accurate elapsed time reconstruction.
- **`test_tasks_and_routines.py`:** Enforces 3-status Kanban constraints, day filtering, and carry-over logic.

---

## Keyboard Shortcuts Reference

Navigate Cherry at terminal velocity without touching your mouse:

| Keybinding | Action |
|---|---|
| `1` | Navigate to **Day Workspace** (`/day`) |
| `2` | Navigate to **Quarter Sprint Workbench** (`/quarter`) |
| `3` | Navigate to **Notes & Retrospectives** (`/notes`) |
| `4` | Navigate to **Cherry AI Chat** (`/chat`) |
| `Ctrl + K` / `Cmd + K` | Focus Global Command Palette & Search |
| `t` | Open New Task Drawer |
| `n` | Create New Note |
| `m` | Open Plan Workbench Modal |
| `?` | Toggle Keyboard Shortcuts Cheat Sheet |
| `Esc` | Close Active Modal or Drawer |

---

## License

Distributed under the **MIT License**.  
Crafted with pride as part of the sovereign **Fruit Family** ecosystem.
