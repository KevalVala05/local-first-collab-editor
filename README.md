# 📝 Local-First Collaborative Document Editor

> A production-grade, offline-first collaborative document editor with real-time synchronization, CRDT-based conflict resolution, granular version history, and an integrated AI Copilot.

**Built for the House of EdTech — Fullstack Developer Assignment 2 (v2.1, April 2026)**

**Developer:** [Keval Vala](https://github.com/KevalVala05)

---

## 🚀 Live Demo

| Service | URL |
| :--- | :--- |
| **Next.js App** | [https://collab-docs-by-kv.vercel.app](https://collab-docs-by-kv.vercel.app) |
| **Yjs WebSocket Server (live)** | `wss://yjs-ws-server-production-kv05.up.railway.app` |
| **Yjs WebSocket Server (repo)** | [github.com/KevalVala05/yjs-ws-server](https://github.com/KevalVala05/yjs-ws-server) |

---

## ✨ Features

### 🔌 Local-First Architecture
- All edits are written instantly to **IndexedDB** (via Dexie.js) — zero network latency on keypress.
- Documents load from local cache even when completely offline.
- Visual sync status badge: `Online` / `Offline` / `Syncing...` / `Sync Error`.

### ⚡ Background Sync Engine
- Outbox queue pattern: offline operations are queued and replayed when the network returns.
- Supports: `create_document`, `update_content`, `rename_document`, `delete_document`.
- Smart error handling — invalid items (e.g. deleted documents) are discarded rather than retried infinitely.
- Active ping polling every 15 seconds to detect real connectivity.

### 🤝 Real-Time Collaboration (CRDT)
- **Yjs** CRDT engine ensures conflict-free, deterministic merging of concurrent edits.
- WebSocket connection via a dedicated Railway-hosted `y-websocket` server.
- Automatic fallback to IndexedDB snapshot if the WebSocket handshake exceeds 1.5 seconds (cold-start protection).
- `history: false` in TipTap's StarterKit defers undo/redo to Yjs's native stack.

### 📜 Version History & Time Travel
- Manual snapshot creation with custom titles.
- Automatic snapshot saved every 10 minutes while online.
- Timeline sidebar with read-only preview of any past version.
- Safe restoration: creates a pre-restore backup before overwriting, so no data is ever lost.
- Snapshots stored with gzip compression in MongoDB.

### 🤖 AI Copilot
- Powered by **Google Gemini** via the Vercel AI SDK with real-time streaming.
- Actions available: **Summarize**, **Expand**, **Tone**, **Translate**, **Fix Grammar**.
- Trigger via the `✨ AI Copilot` toolbar button or by typing `/ai` directly in the editor.
- Multi-model fallback sequence for resilience.
- Per-user rate-limited (100 req/min).

### 🔐 Authentication & Authorization
- **NextAuth.js** with JWT sessions and bcrypt password hashing.
- Three-tier role system per document:
  - `OWNER` — full control (edit, rename, delete, share, snapshot, restore).
  - `EDITOR` — can edit content, create/restore snapshots.
  - `VIEWER` — read-only mode; locked editor, no toolbar, no state pushes.

### 🛡️ Security
- **Payload size limit:** `Content-Length` header check blocks requests > 1MB at the API layer.
- **Zod schema validation:** All incoming payloads are validated server-side; malformed data returns a clean 400.
- **Rate limiting:** In-memory token bucket (100 req/min per user) on all API routes.
- **Tenant isolation:** All MongoDB queries are scoped to `ownerId` or `collaborators.userId` — users can never access documents they don't own.
- **Compound indexes** on `ownerId` and `collaborators.userId` for fast, secure lookups.

### 📊 Document Dashboard
- Search, sort (by title / date), and paginate documents.
- Create, rename, delete documents — all with offline support.
- Share dialog: invite users by email, assign `Editor` or `Viewer` role.
- Local-only document badge when not yet synced to the server.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 16.2 (App Router, TypeScript) |
| **UI & Styling** | Tailwind CSS v4, React 19 |
| **Editor** | TipTap v3 |
| **Real-Time / CRDT** | Yjs, y-websocket, @tiptap/extension-collaboration |
| **Local Storage** | Dexie.js (IndexedDB) |
| **Database** | MongoDB (Mongoose v9) |
| **Authentication** | NextAuth.js v4, bcryptjs |
| **Data Validation** | Zod v4 |
| **AI Integration** | Vercel AI SDK, Google Gemini API |
| **HTTP Client** | Axios |
| **State Management** | TanStack React Query v5 |
| **WebSocket Server** | Node.js y-websocket (hosted on Railway) |
| **CI/CD** | GitHub Actions |
| **Deployment** | Vercel (frontend) + Railway (WS server) |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── ai/                         # AI Copilot streaming endpoint
│   │   ├── auth/
│   │   │   ├── [...nextauth]/          # NextAuth.js config & JWT
│   │   │   └── register/              # User registration
│   │   └── documents/
│   │       ├── route.ts               # GET (list) + POST (create)
│   │       └── [id]/
│   │           ├── route.ts           # GET, PATCH, DELETE single doc
│   │           ├── share/             # POST — share with a user
│   │           └── snapshots/
│   │               ├── route.ts       # GET (list) + POST (create snapshot)
│   │               └── [snapshotId]/restore/  # POST — restore snapshot
│   ├── dashboard/                     # Dashboard UI
│   ├── documents/[id]/               # Document editor page
│   ├── login/                         # Login page
│   └── register/                      # Register page
├── components/
│   ├── Footer.tsx                     # Shared author footer
│   ├── Providers.tsx                  # React Query + Toast providers
│   ├── TiptapEditor.tsx              # Full editor component (Yjs + TipTap)
│   └── UserMenu.tsx                  # User avatar + session dropdown
├── constants/
│   └── messages.ts                   # Centralized error & success messages
├── context/
│   └── SyncContext.tsx               # Background sync engine (outbox processor)
├── hooks/
│   ├── useAuthMutations.ts           # Login / register mutations
│   └── useDocumentMutations.ts       # CRUD mutations with local-first support
├── lib/
│   ├── api.ts                         # Axios instance with interceptors
│   ├── db.ts                          # MongoDB connection singleton
│   ├── errorMiddleware.ts            # withErrorHandler + ApiError class
│   ├── localDb.ts                    # Dexie.js schema + CRUD helpers
│   ├── rateLimit.ts                  # In-memory per-user rate limiter
│   ├── response.ts                   # sendSuccessResponse helper
│   └── toast.ts                      # toastSuccess / toastError wrappers
├── models/
│   ├── Document.ts                   # Mongoose Document schema
│   ├── Snapshot.ts                   # Mongoose Snapshot schema
│   └── User.ts                       # Mongoose User schema
├── types/
│   └── document.ts                   # DocumentRole enum + shared types
└── validation/
    ├── auth.ts                        # Zod schemas for login/register
    └── document.ts                   # Zod schemas for document operations
```

---

## ⚙️ Getting Started

### Prerequisites
- **Node.js** 20+
- **npm** 9+
- A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- A free [Google Gemini API key](https://aistudio.google.com/)

### 1. Clone the repository

```bash
git clone https://github.com/KevalVala05/house-of-edtech-assignment.git
cd house-of-edtech-assignment
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in your values in `.env` (see [Environment Variables](#environment-variables) below).

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌍 Environment Variables

See [`.env.example`](./.env.example) for the full template.

| Variable | Required | Description |
| :--- | :---: | :--- |
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `NEXTAUTH_URL` | ✅ | Base URL of your app (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | ✅ | Random secret for signing JWT tokens |
| `NEXT_PUBLIC_WS_URL` | ✅ | WebSocket server URL for Yjs collaboration |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for the AI Copilot |

---

## 🚢 Deployment

### Frontend → Vercel

1. Push your code to GitHub.
2. Go to [vercel.com](https://vercel.com), import the repository.
3. Add all environment variables from `.env.example` in the Vercel dashboard.
4. Deploy — Vercel auto-detects Next.js.

### WebSocket Server → Railway

The dedicated Yjs WebSocket server lives in its own repository:
👉 [github.com/KevalVala05/yjs-ws-server](https://github.com/KevalVala05/yjs-ws-server)

It is already deployed on Railway at:
```
wss://yjs-ws-server-production-kv05.up.railway.app
```

Set `NEXT_PUBLIC_WS_URL` to this value (or your own Railway URL).

---

## 🔄 CI/CD

GitHub Actions runs on every push to `main` / `development`:
- `npx tsc --noEmit` — TypeScript type checking
- `npm run build` — Production build verification

See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## 🧪 Testing Offline Sync

1. Open the app and load a document while **online**.
2. In Chrome DevTools → **Network** tab → set throttle to **Offline** *(do NOT refresh)*.
3. Type some content — it saves instantly to IndexedDB (status shows `All saved`).
4. Set throttle back to **No throttling**.
5. The `SyncContext` detects the network returning and flushes the outbox — your edits push to MongoDB automatically.

---

## 📄 License

This project was built as an assignment submission. All rights reserved © 2026 Keval Vala.
