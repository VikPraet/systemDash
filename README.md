# Beacon

A self-hosted host console for Windows, Linux, and macOS. Open it in a browser
and you get live CPU, memory, storage, GPU, and host stats, plus files, a real
terminal, Docker, project deploys, and power control — all behind accounts and
roles on that machine.

The UI is **Beacon**. Install paths, the `systemdash` systemd unit, release
tarballs, and `SYSTEMDASH_*` environment variables keep those names so upgrades
stay compatible.

## Screenshots

**Sign in**

![Login](docs/screenshots/pages/login.png)

**Themes** — Classic, Lime, Phosphor, Ember, and Midnight, each with dark and
light. Admins can duplicate, edit, import, and export custom themes.

| Classic | Lime | Phosphor | Ember | Midnight |
|:---:|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/themes/classic-dark.png" alt="Classic dark" width="180"> | <img src="docs/screenshots/themes/lime-dark.png" alt="Lime dark" width="180"> | <img src="docs/screenshots/themes/phosphor-dark.png" alt="Phosphor dark" width="180"> | <img src="docs/screenshots/themes/ember-dark.png" alt="Ember dark" width="180"> | <img src="docs/screenshots/themes/midnight-dark.png" alt="Midnight dark" width="180"> |
| <img src="docs/screenshots/themes/classic-light.png" alt="Classic light" width="180"> | <img src="docs/screenshots/themes/lime-light.png" alt="Lime light" width="180"> | <img src="docs/screenshots/themes/phosphor-light.png" alt="Phosphor light" width="180"> | <img src="docs/screenshots/themes/ember-light.png" alt="Ember light" width="180"> | <img src="docs/screenshots/themes/midnight-light.png" alt="Midnight light" width="180"> |

**Overview** — live gauges and a layout you can rearrange (drag, resize, add,
hide, group). Panels can be limited to viewer, user, or admin.

![Overview](docs/screenshots/pages/overview.png)

**History** — CPU, memory, and GPU charts over a range, same grid as Overview.

![History](docs/screenshots/pages/history.png)

**Processes** — sortable list grouped into apps and background tasks; end or
force-kill from the UI.

![Processes](docs/screenshots/pages/processes.png)

**Containers** — Docker status, logs, and start/stop/restart.

![Containers](docs/screenshots/pages/containers.png)

**Projects** — git repos, site deploys, health, and optional live preview.

![Projects](docs/screenshots/pages/projects.png)

**Files** — browse drives, network shares, trash, and a disk-usage map.

![Files](docs/screenshots/pages/files.png)

**Terminal** — multi-tab local shell with per-tab scrollback.

![Terminal](docs/screenshots/pages/terminal.png)

**Users** — accounts, roles, and recovery (admin).

![Users](docs/screenshots/pages/users.png)

**Updates** — host packages, Beacon releases, and backups.

![Updates](docs/screenshots/pages/updates.png)

**Activity** — sessions and the audit log (admin).

![Activity](docs/screenshots/pages/activity.png)

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

- Web UI (with hot reload): http://localhost:5273
- API server: http://localhost:3001 (the web dev server proxies `/api` to it)

Refresh README screenshots from a running dev server:

```bash
node scripts/capture-screenshots.mjs
```

## Production / single-host

```bash
yarn build   # builds the web UI and compiles the server
yarn start   # serves API + built UI from http://localhost:3001
```

Set a custom port with the `PORT` env var.

**Linux server (releases):** push a tag → CI builds
`systemdash-<version>-linux-x64.tar.gz` → server installs with
[docs/deploy-linux.md](docs/deploy-linux.md). No build tools on the server.
Admins can also install a release from **Updates → Beacon** in the app.

## API

Read:

- `GET /api/health` → `{ ok: true }`
- `GET /api/system` → full system snapshot (host, cpu, memory, disks, gpus)
- `GET /api/processes` → running processes
- `GET /api/history` / `GET /api/history/stats` → time-series metrics
- `GET /api/fs/roots` → drives / home
- `GET /api/fs/list?path=…` → directory listing
- `GET /api/fs/dirsize?path=…` → recursive folder size
- `GET /api/fs/usage?path=…` → disk-map usage tree
- `GET /api/fs/download?path=…` → download a file
- `GET /api/fs/shares` → persisted network mounts
- `GET /api/fs/trash` → recoverable trash

Write (file management):

- `POST /api/fs/folder` `{ path, name }` → create a folder
- `POST /api/fs/file` `{ path, name }` → create an empty file
- `POST /api/fs/rename` `{ path, newName }` → rename
- `POST /api/fs/move` `{ path, dest }` → move into directory `dest`
- `POST /api/fs/copy` `{ path, dest }` → copy into directory `dest`
- `POST /api/fs/delete` `{ path }` → move to trash (or delete)
- `POST /api/fs/upload?dir=…&name=…` (raw body) → stream a file to disk
- `POST /api/fs/shares` / `POST /api/fs/shares/:id/connect` → add / reconnect a share
- `POST /api/fs/trash/:id/restore` / `POST /api/fs/trash/empty` → restore or empty trash

Editor:

- `GET /api/fs/read?path=…` → read a text file (rejects directories, >5 MB, or binary)
- `POST /api/fs/write` `{ path, content }` → save text content to a file

Settings & appearance:

- `GET /api/settings` / `PUT /api/settings` → file-manager prefs, dashboard layouts,
  persisted to `~/.systemdash/settings.json` (override dir with `SYSTEMDASH_DATA_DIR`)
- `GET /api/themes` → builtin + custom themes
- `POST /api/themes` / `DELETE /api/themes/:id` → import or delete a custom theme (admin)
- `GET|POST|DELETE /api/dashboard/edit-lock` → single-admin layout edit lock

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

Docker (requires Docker Engine / Docker Desktop on the host; Beacon itself stays
native, not containerised):

- `GET /api/docker/status` → `{ available, version, error }`
- `GET /api/docker/containers` → list all containers
- `GET /api/docker/containers/:id/logs?tail=300` → recent log output
- `POST /api/docker/containers/:id/start|stop|restart` → control (`user`/`admin`)

Projects, public access, updates, backups, and power live under `/api/projects`,
`/api/access`, `/api/updates`, `/api/app-update`, `/api/backup`, and `/api/power`.

### Testing the Containers tab

1. Install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   (Windows/macOS) or Docker Engine (Linux).
2. In a terminal (or the Beacon **Terminal** tab), run a throwaway container:

   ```bash
   docker run -d --name systemdash-test -p 8080:80 nginx:alpine
   ```

3. Open **Containers** in the sidebar — you should see `systemdash-test` running.
4. Try **Logs**, **Stop**, **Start**, and **Restart**. Visit http://localhost:8080 to
   confirm nginx is serving while running.
5. Clean up when done: `docker rm -f systemdash-test`

If Docker is installed but the tab says “not available”, ensure Docker Desktop is
running and that the account starting Beacon can access the Docker socket (on Linux,
add your user to the `docker` group or run elevated). Override the CLI path with
`DOCKER_BIN` if needed.

## Notes

- Some metrics (CPU temperature, GPU utilization) depend on OS/driver support and may
  be `null` where the platform does not expose them. On Linux, run with appropriate
  permissions for full temperature/disk detail.
- **File access & permissions:** the server reads and writes the disk **as the OS user
  that started it**. Folders that account can't touch return `permission denied`. To see
  into / modify protected system locations, launch the server elevated (Run as
  Administrator on Windows, `sudo` on Linux/macOS).
- **Authentication & roles:** every `/api` endpoint (except `/api/health`) and the
  terminal WebSocket require a signed-in user. On first launch the UI shows a
  one-time setup screen to create the admin account (no default password is shipped).
  Users have one of three roles:
  - `viewer` — read-only (overview, history, process list, browse/read/download files)
  - `user` — viewer plus write actions (file create/edit/upload/delete, terminal, projects)
  - `admin` — everything plus user management, themes, layout, updates, and activity
  Accounts and sessions are stored in a local SQLite file at `~/.systemdash/auth.db`
  (override the dir with `SYSTEMDASH_DATA_DIR`). Passwords are hashed with scrypt;
  sessions are opaque tokens kept in an HttpOnly, SameSite=Lax cookie (marked `Secure`
  automatically over HTTPS). Run behind HTTPS (e.g. a reverse proxy) when exposing it
  beyond localhost.
- **Privilege model — the dashboard runs with full host clearance:** Beacon is the
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
  `clear`/`cls`, and full-screen TUI programs (vim, htop, less) all work.
- **Layout editing:** only one admin can customize the shared dashboard at a time. The
  lock expires after a few minutes idle.

## Roadmap

- **Scheduled jobs** — in-app cron-style tasks (e.g. restart a container nightly, run a
  backup script). Not a replacement for OS autostart (`systemd` / Task Scheduler); those
  remain the way to boot Beacon itself.
- **Email & alerts** — optional verified email per user; per-user notification
  preferences (e.g. login/logout, failed login, new session/IP, terminal connect,
  file delete, process kill). Dispatch from the existing audit log via admin-configured
  SMTP or an email API (Resend, SendGrid, etc.). Start with security-focused events;
  terminal-command alerts opt-in and filterable to avoid noise.
- **SSH** — connect to remote hosts from the built-in terminal.
- **Security** — TOTP 2FA (authenticator apps); CSRF hardening when exposed beyond a
  trusted LAN. Optional OAuth (Google / Apple) later for sign-in convenience once a
  public HTTPS callback URL is available (e.g. via Cloudflare Tunnel).
