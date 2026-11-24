# Datchord

A warm, focused home for small communities. Datchord is a full-stack community chat app with servers, channels, roles, private messages, real-time updates, profiles, and a responsive interface that works from phones to wide desktops.

The app starts completely empty: create an account, then create your first server or join one with an invite code. There are no seeded workspaces or demo accounts.

## Features

- **Accounts** — registration, login, profile editing, avatar uploads, email and password changes, account deletion.
- **Servers** — create, join by invite code, edit, transfer ownership, leave, or delete. Owners can upload a server icon and rotate the invite code.
- **Channels** — create, rename, edit topics, reorder through creation order, and delete (with confirmation).
- **Private messages** — 1:1 and private group conversations with history, unread counts, typing indicators, read state, editing, deleting, group renaming, adding/removing members, and leaving a group.
- **Roles and permissions** — ten permission bits: `MANAGE_SERVER`, `MANAGE_CHANNELS`, `MANAGE_ROLES`, `MANAGE_MEMBERS`, `MANAGE_MESSAGES`, `ADMINISTRATOR`, `MANAGE_INVITES`, `MANAGE_NICKNAMES`, `CHANGE_NICKNAME`, and `MENTION_EVERYONE`. Hierarchical roles, a protected default Member role, per-server nicknames, and owner bypass.
- **Chat** — message history with pagination, edit and delete, optimistic sending with retry, mention highlighting, `@everyone`/`@here` enforcement, and desktop notifications.
- **Real-time updates** — Server-Sent Events keep presence, typing indicators, messages, DMs, role/member changes, and invite rotations in sync without reloading. Polling remains as a fallback.
- **Presence** — online/offline status for server members, grouped in the member panel with status dots.
- **Unified home** — the Datchord home is the private-message view, like Discord: one place for conversations, unread badges, and new messages. Every rail destination is a real, shareable URL.
- **Responsive navigation** — Discord-style server rail and channel sidebar stay visible on desktop and tablet; drawers are used only on phones.
- **Internationalization** — English, Spanish, French, Arabic (RTL), and Brazilian Portuguese, with English fallback.
- **Accessibility** — keyboard-friendly controls, focus states, labeled icon buttons, live regions for typing and notifications, reduced-motion support.
- **Server-enforced security** — scrypt password hashing, hashed session tokens in HttpOnly cookies, origin checks, rate limiting, permission checks on every mutation, and a strict Content Security Policy.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, React Router, i18next, Lucide icons.
- **Backend:** zero-dependency Node.js `http` server with the built-in `node:sqlite` module.
- **Storage:** SQLite database plus image uploads on disk.
- **Real-time:** Server-Sent Events (`GET /api/events`) with polling fallback.

No external services, databases, or API keys are required.

## Requirements

- Node.js **24 or newer** is recommended (the project uses the built-in `node:sqlite` module; Node 22.5+ also works).
- npm.

## Quick start

```bash
npm install
npm run build
npm start
```

Open <http://localhost:3000>.

On first launch Datchord creates `data/datchord.db` automatically. Register an account and create a server to get started.

### Development

```bash
npm run dev
```

This starts:

- Vite at <http://localhost:5173>
- The API at <http://localhost:3001>

The Vite dev server proxies `/api` requests to the API process.

If port 3000 is already in use, choose another port:

```bash
PORT=3100 npm start
```

On Windows PowerShell:

```powershell
$env:PORT = "3100"; npm start
```

## Deploy to Render

The repository includes a [`render.yaml`](./render.yaml) Blueprint with a persistent disk, so accounts, servers, messages, and uploads survive restarts.

1. Push this repository to GitHub.
2. Open [Deploy to Render](https://render.com/deploy?repo=https://github.com/notrealcoconut/datchord), or in Render choose **New → Blueprint** and connect the repository.
3. Apply the Blueprint. Render provisions a Starter web service with a 1 GB disk mounted at `/var/data`.
4. Wait for the build and open the generated `https://<service>.onrender.com` URL.

The Blueprint sets `DATA_DIR=/var/data`, `COOKIE_SECURE=true`, and `NODE_ENV=production`. Free Render services cannot attach disks, so use the Starter plan or higher.

### Manual Render setup

If you prefer not to use the Blueprint:

- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`
- Environment: `NODE_ENV=production`, `COOKIE_SECURE=true`, `DATA_DIR=/var/data`
- Disk: 1 GB mounted at `/var/data`

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server and the API with watch mode. |
| `npm run build` | Type-check the project and build the production frontend into `dist/`. |
| `npm start` | Serve the built frontend and API from one Node process. |
| `npm run check:locales` | Verify every locale has the same keys and placeholders as English. |
| `npm run reset` | Delete the database and uploaded images. The next start begins empty. |
| `npm run smoke` | Run the API/SSE smoke test against `DATCHORD_URL` (default `http://localhost:3100`). |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port for the production server. |
| `HOST` | `0.0.0.0` | Interface to bind. |
| `DATA_DIR` | `./data` | Directory for the database and uploads. |
| `DATABASE_PATH` | `$DATA_DIR/datchord.db` | Override the SQLite file location. |
| `ALLOWED_ORIGINS` | — | Comma-separated extra origins allowed to make mutating requests. |
| `COOKIE_SECURE` | auto | Set to `true` to force the `Secure` cookie flag behind HTTPS. |
| `LOG_REQUESTS` | `true` | Set to `false` to silence request logging. |
| `NODE_ENV` | — | Set to `production` to disable localhost origin exceptions. |

In development, localhost origins are allowed automatically. In production, requests must match the request host or an entry in `ALLOWED_ORIGINS`.

## Data and reset

Runtime data lives in `data/`:

- `data/datchord.db` — SQLite database (WAL files may appear beside it).
- `data/uploads/` — uploaded avatars and server icons.

To return to a completely empty installation:

```bash
npm run reset
```

Stop the server before resetting so Windows can release the database files.

## Project structure

```
server/
  index.js        HTTP server, routes, SSE, presence and typing state
  db.js           SQLite schema, migrations and cleanup
  dto.js          API serialization
  errors.js       API error type
  permissions.js  Permission bits and hierarchy helpers
  security.js     Password hashing, tokens, rate limiting
  uploads.js      Image validation and storage
  validation.js   Input validation
src/
  components/     UI primitives, dialogs, app shell, chat and DM views
  contexts/       Auth, preferences, realtime, toast
  i18n/           Locale setup and translations
  lib/            API client, formatting, hooks, helpers
  pages/          Auth, messages/home, workspace, settings
  styles/         Design tokens, layout, components, responsive rules
scripts/
  dev.mjs         Development process launcher
  reset.mjs       Data reset
  smoke-api.mjs   End-to-end API/SSE smoke test
  check-locales.mjs
render.yaml       Render Blueprint with persistent disk
```

## How presence, typing and real-time work

The app uses Server-Sent Events for low-latency updates, with polling as a fallback:

- Authenticated requests update a user's last-seen timestamp. The client also sends a heartbeat every 20 seconds while the tab is visible.
- A user is considered online for 45 seconds after their last activity.
- `GET /api/events` streams `ready`, `presence`, `typing`, `message`, `server`, `server-removed`, `dm-conversation`, `dm-message`, `dm-typing`, and `dm-removed` events.
- Clients refetch the affected resource after an event, which keeps the server simple and the UI consistent.
- The workspace also polls presence and member details every 20 seconds, and channels poll messages every 5 seconds as a fallback.
- Typing is stored per channel or DM with a 7-second expiry. The composer sends a throttled typing signal.

Presence, typing, and SSE connections are in memory, so restarting the API clears them. Accounts, servers, messages, DMs, and uploads persist in SQLite and on disk.

## Security notes

- Passwords are hashed with `scrypt` and a per-password salt.
- Session tokens are random, stored hashed in the database, and sent in `HttpOnly`, `SameSite=Lax` cookies.
- Mutating requests are checked against the request origin.
- Login, registration, and invite joins are rate limited.
- Every server, channel, role, member, message, and DM operation checks membership and permissions server-side.
- Uploaded images are type-checked, size-limited, and served with restrictive headers.
- The production server sets CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and related headers.

## Internationalization

Add or update keys in `src/i18n/locales/en.json` first, then mirror them in the other locales. Run:

```bash
npm run check:locales
```

Arabic automatically switches the document to RTL. All layout styles use logical properties, so the interface mirrors without a separate stylesheet.

## License

This project was built as a personal application. Add a license file if you plan to distribute it.
