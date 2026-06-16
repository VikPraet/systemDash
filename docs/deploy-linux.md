# Linux deployment (release-based)

SystemDash is distributed as a **pre-built product**: you push a git tag, CI compiles
everything and attaches a tarball to a GitHub Release. The server only needs **Node.js**
— no yarn, git, or build tools on the machine.

```
You: git tag v0.1.0 && git push origin v0.1.0
        ↓
GitHub Actions: yarn build → systemdash-0.1.0-linux-x64.tar.gz
        ↓
Server: download release → extract → systemd restart
        ↓
(later) Admin clicks **Update** in the UI when a newer release exists
```

## What the server needs

| Required | Not required on server |
|----------|-------------------------|
| Node.js 18+ (20 LTS recommended) | Yarn |
| `curl`, `tar` (for install script) | Git |
| systemd (recommended) | gcc / python (node-pty is prebuilt in the tarball) |

```bash
# Ubuntu/Debian — runtime only
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs curl
```

Create a service user:

```bash
sudo useradd -r -m -d /opt/systemdash -s /bin/bash systemdash
sudo mkdir -p /opt/systemdash/releases
sudo chown -R systemdash:systemdash /opt/systemdash
```

## Install from a GitHub Release

After you publish a release (see **Publishing** below):

```bash
sudo -u systemdash -i
export SYSTEMDASH_HOME=/opt/systemdash

# Copy install-release.sh to the server (from the repo), then:
bash install-release.sh YOUR_ORG/systemDash v0.1.0
# or: bash install-release.sh YOUR_ORG/systemDash latest
```

This installs to `/opt/systemdash/releases/0.1.0` and symlinks
`/opt/systemdash/current` → that directory.

**Private repo:** set `GITHUB_TOKEN` (read-only fine-grained token with Contents read)
when running the install script.

## systemd

`/etc/systemd/system/systemdash.service`:

```ini
[Unit]
Description=SystemDash
After=network.target

[Service]
Type=simple
User=systemdash
WorkingDirectory=/opt/systemdash/current
Environment=NODE_ENV=production
Environment=PORT=3001
# Environment=SYSTEMDASH_DATA_DIR=/opt/systemdash/data
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now systemdash
```

Data (users, settings, history) lives in `~/.systemdash/` by default, or
`SYSTEMDASH_DATA_DIR` — **outside** the release folder, so upgrades don't wipe it.

## Upgrading manually

```bash
sudo -u systemdash -i
bash install-release.sh YOUR_ORG/systemDash latest
sudo systemctl restart systemdash
```

Old releases stay in `/opt/systemdash/releases/` for rollback (re-point the `current`
symlink and restart).

## Publishing a release (maintainer)

1. Bump `version` in root `package.json` (and keep server/web in sync if needed).
2. Commit, tag, push:

   ```bash
   git tag v0.1.0
   git push origin main --tags
   ```

3. GitHub Actions (`.github/workflows/release.yml`) builds
   `systemdash-0.1.0-linux-x64.tar.gz` and attaches it to the Release.

Test the package locally before tagging:

```bash
bash scripts/package-release.sh linux-x64
# smoke-test: mkdir /tmp/sd-test && tar -xzf systemdash-*.tar.gz -C /tmp/sd-test
# cd /tmp/sd-test && node server/dist/index.js
```

## In-app “Update available” (next step)

| Piece | Purpose |
|--------|---------|
| `VERSION.json` in each release | `{ version, commit, platform, builtAt }` — shipped in tarball |
| `GET /api/system/update` | Fetch latest GitHub Release, compare to installed `VERSION.json` (admin) |
| UI | Sidebar: `v0.1.0` → **Update available** when a newer tag exists |
| `POST /api/system/update` | Download asset, extract to `releases/<version>`, flip `current` symlink, `process.exit(0)` → systemd restarts |

No build on the server — only download, extract, symlink, restart. Admin-only and
audit-logged.

Configure with env vars (planned):

- `SYSTEMDASH_HOME` — `/opt/systemdash`
- `GITHUB_REPO` — `owner/systemDash`
- `GITHUB_TOKEN` — optional, for private releases

## Source install (developers only)

If you're hacking on the machine itself, you can still clone and build:

```bash
git clone … && cd systemDash
bash scripts/install-linux.sh   # builds from source
```

Production servers should use **releases**, not this path.

## Linux notes

- **Docker tab:** Docker Engine + user in `docker` group.
- **Terminal:** bundled `node-pty` binary targets the CI runner's Linux (glibc). For
  exotic ARM/Musl distros, add matrix builds later.
- **HTTPS:** put Caddy/nginx in front when not on a trusted LAN.

## Checklist

1. `curl http://localhost:3001/api/health` → `{"ok":true}`
2. First-run setup → admin user
3. Overview / Processes work
4. Install a newer release → `current` symlink updates, data persists, app restarts
