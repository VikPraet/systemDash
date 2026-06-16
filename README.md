# SystemDash

A self-hosted, cross-platform (Windows / Linux / macOS) system dashboard. It exposes
live OS stats through a web UI: CPU model & load & clock speed, memory, storage, GPU,
and OS/host info.

## Screenshots

**Overview** — live CPU, memory, storage, and GPU stats at a glance:

![Overview](docs/screenshots/overview.png)

**History** — time-series charts of CPU, memory, and GPU metrics over selectable ranges:

![History](docs/screenshots/history.png)

**Processes** — sortable, filterable process list grouped into apps and background tasks:

![Processes](docs/screenshots/processes.png)

**Files** — browse drives, navigate folders, and manage files:

![Files](docs/screenshots/files.png)

**Terminal** — an interactive shell session right in the browser:

![Terminal](docs/screenshots/terminal.png)

## Stack

- **Frontend:** React + TypeScript + Vite (`web/`)
- **Backend:** Node.js + Express + TypeScript with [`systeminformation`](https://systeminformation.io/) (`server/`)
- **Monorepo** managed with Yarn workspaces.

## Requirements

- Node.js 18+ (tested on Node 24)
- Yarn 1.x (classic)

## Develop

```bash
yarn install
yarn dev
```

- Web UI (with hot reload): http://localhost:5173
- API server: http://localhost:3001 (the web dev server proxies `/api` to it)

## Production / single-host

```bash
yarn build   # builds the web UI and compiles the server
yarn start   # serves API + built UI from http://localhost:3001
```

Set a custom port with the `PORT` env var.

## API

Read:

- `GET /api/health` → `{ ok: true }`
- `GET /api/system` → full system snapshot (host, cpu, memory, disks, gpus)
- `GET /api/processes` → running processes
- `GET /api/fs/roots` → drives / home
- `GET /api/fs/list?path=…` → directory listing
- `GET /api/fs/dirsize?path=…` → recursive folder size
- `GET /api/fs/download?path=…` → download a file

Write (file management):

- `POST /api/fs/folder` `{ path, name }` → create a folder
- `POST /api/fs/file` `{ path, name }` → create an empty file
- `POST /api/fs/rename` `{ path, newName }` → rename
- `POST /api/fs/move` `{ path, dest }` → move into directory `dest`
- `POST /api/fs/copy` `{ path, dest }` → copy into directory `dest`
- `POST /api/fs/delete` `{ path }` → delete a file or folder (recursive)
- `POST /api/fs/upload?dir=…&name=…` (raw body) → stream a file to disk

Editor:

- `GET /api/fs/read?path=…` → read a text file (rejects directories, >5 MB, or binary)
- `POST /api/fs/write` `{ path, content }` → save text content to a file

Settings:

- `GET /api/settings` / `PUT /api/settings` → file-manager preferences, persisted to
  `~/.systemdash/settings.json` (override dir with `SYSTEMDASH_DATA_DIR`)

Authentication & users:

- `GET /api/auth/status` → `{ needsSetup, user }` (drives first-run vs login vs app)
- `POST /api/auth/setup` `{ username, password }` → create the first admin (only
  works while no users exist) and start a session
- `POST /api/auth/login` `{ username, password }` → start a session
- `POST /api/auth/logout` → end the current session
- `GET /api/auth/me` → the currently signed-in user
- `GET /api/users` / `POST /api/users` / `PATCH /api/users/:id` / `DELETE /api/users/:id`
  → user management (admin only): create/edit roles, reset passwords, enable/disable, delete

Terminal:

- `WS /api/terminal` → interactive shell session (PowerShell on Windows, `$SHELL`
  elsewhere). Keystrokes stream to the shell; output streams back.

## Notes

- Some metrics (CPU temperature, GPU utilization) depend on OS/driver support and may
  be `null` where the platform does not expose them. On Linux, run with appropriate
  permissions for full temperature/disk detail.
- **File access & permissions:** the server reads and writes the disk **as the OS user
  that started it**. Folders that account can't touch return `permission denied`. To see
  into / modify protected system locations, launch the server elevated (Run as
  Administrator on Windows, `sudo` on Linux/macOS).
- **Authentication & roles:** every `/api` endpoint (except `/api/health`) and the
  terminal WebSocket now require a signed-in user. On first launch the UI shows a
  one-time setup screen to create the admin account (no default password is shipped).
  Users have one of three roles:
  - `viewer` — read-only (overview, history, process list, browse/read/download files)
  - `user` — viewer plus write actions (file create/edit/upload/delete, terminal)
  - `admin` — everything plus user management
  Accounts and sessions are stored in a local SQLite file at `~/.systemdash/auth.db`
  (override the dir with `SYSTEMDASH_DATA_DIR`). Passwords are hashed with scrypt;
  sessions are opaque tokens kept in an HttpOnly, SameSite=Lax cookie (marked `Secure`
  automatically over HTTPS). Run behind HTTPS (e.g. a reverse proxy) when exposing it
  beyond localhost.
- **Privilege model — the dashboard runs with full host clearance:** SystemDash is the
  server's control interface and never drops privileges. It reads/writes the disk, runs
  the terminal, and ends/kills processes **as the OS account that started it**. Launch it
  as a normal user and it's confined to that user; launch it elevated (Administrator on
  Windows, root via `sudo`/systemd on Linux) and a signed-in `user`/`admin` can do
  anything that account can on the machine — kill any process, touch any file, run any
  command. This is intentional, but it means the in-app roles are your only guardrail, so
  grant `user`/`admin` carefully and keep it behind HTTPS + strong passwords.
- **Process control:** the Processes tab lets `user`/`admin` accounts **End** (graceful:
  `taskkill` / `SIGTERM`) or **Force kill** (`taskkill /F /T` / `SIGKILL`) any process.
  The only thing it refuses to terminate is its own server process, to avoid taking down
  the interface from inside itself. Every termination is recorded in the activity log.
- **Terminal:** it allocates a real PTY (via `node-pty`), so the shell behaves like a
  native terminal — arrow-key history, `Ctrl+C` to interrupt the foreground process,
  `clear`/`cls`, and full-screen TUI programs (vim, htop, less) all work. SSH to remote
  hosts can be added later.

## Roadmap

- Docker container management and scheduled jobs — gated behind the `user`/`admin` roles.
- SSH to remote hosts from the terminal.
- CSRF tokens / 2FA for hardening when exposed to untrusted networks.
