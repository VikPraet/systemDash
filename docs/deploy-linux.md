# Linux deployment (release-based)

Beacon is distributed as a **pre-built product**: you push a git tag, CI compiles
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
| Node.js 22+ (built-in `node:sqlite`) | Yarn |
| `curl`, `tar` (for install script) | Git |
| systemd (recommended) | gcc / python (node-pty is prebuilt in the tarball) |

```bash
# Ubuntu/Debian — runtime only
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
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
Description=Beacon
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

### Run as a normal user (recommended)

Do **not** run the service as root. Use your login user (e.g. `vadmin`) so the in-app
terminal opens as that user, and grant only the privileges Beacon needs:

```bash
# On the server (once)
bash scripts/configure-service-user.sh vadmin

sudo cp scripts/systemdash-vadmin.service.example /etc/systemd/system/systemdash.service
# Adjust paths/User= if your install lives elsewhere
sudo systemctl daemon-reload
sudo systemctl enable --now systemdash
```

`configure-service-user.sh` does three things:

1. Adds the user to the **`docker`** group (Containers tab)
2. **`/etc/sudoers.d/systemdash-<user>`** — passwordless `apt-get` / `apt` (OS updates UI)
3. Same file — passwordless **`systemctl restart systemdash`** (in-app Beacon upgrade)

Verify:

```bash
sudo -u vadmin sudo -n apt-get -qq update
sudo -u vadmin sudo -n systemctl restart systemdash
```

If you previously ran as root with `SYSTEMDASH_DATA_DIR=/home/vadmin/.systemdash`, keep
that env var in the unit so existing logins/settings are preserved.

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
2. Add `docs/releases/vX.Y.Z-beta.md`.
3. Commit, tag, push:

   ```bash
   git tag v0.4.0-beta
   git push origin dev --tags
   ```

   Stay on **beta** until 1.0. Small tries are a patch plus `-beta` (`v0.2.1-beta`,
   `v0.2.2-beta`). A larger product change (rename, new major surfaces) is a minor
   bump (`v0.3.0-beta`). Do not stack `beta.1`, `beta.2` on the same version.
   Every GitHub Release is a **pre-release** until there is a real 1.0. There is no
   stable Latest. Install a tag, or `latest` (newest pre-release):

   ```bash
   bash install-release.sh YOUR_ORG/systemDash v0.4.0-beta
   bash install-release.sh YOUR_ORG/systemDash latest
   ```

4. GitHub Actions (`.github/workflows/release.yml`) builds
   `systemdash-0.4.0-beta-linux-x64.tar.gz` and attaches it to the Release.

Test the package locally before tagging:

```bash
bash scripts/package-release.sh linux-x64
# smoke-test: mkdir /tmp/sd-test && tar -xzf systemdash-*.tar.gz -C /tmp/sd-test
# cd /tmp/sd-test && node server/dist/index.js
```

## In-app Beacon updates

Admins can check GitHub Releases from **Updates** in the UI (Overview teasers and the
sidebar version badge). The server compares installed `VERSION.json` to the latest
release tag and can download the linux-x64 tarball, extract it under `releases/`,
flip the `current` symlink, and restart via systemd.

| API | Purpose |
|-----|---------|
| `GET /api/app-update/status` | Compare installed vs latest GitHub Release |
| `GET /api/app-update/job` | Progress/log while an update runs |
| `POST /api/app-update/start` | Download, extract, symlink, restart (admin) |

Configure on the server (systemd unit or environment file):

- `SYSTEMDASH_HOME` — `/opt/systemdash` or `/home/vadmin/systemdash`
- `GITHUB_REPO` — `owner/systemDash` (defaults to `VikPraet/systemDash`)
- `GITHUB_TOKEN` — optional, required for private repos / higher API limits
- `SYSTEMDASH_SERVICE` — systemd unit name (default `systemdash`)

## Source install (developers only)

If you're hacking on the machine itself, you can still clone and build:

```bash
git clone … && cd systemDash
bash scripts/install-linux.sh   # builds from source
```

Production servers should use **releases**, not this path.

## Linux notes

- **Docker tab:** requires Docker Engine and the service user in the `docker` group
  (`bash scripts/configure-service-user.sh vadmin`, then restart the service). Works with
  Pterodactyl/Wings — same containers as `docker ps` on the host.
- **OS / app updates:** service user needs the sudoers rules from `configure-service-user.sh`
  (apt + `systemctl restart systemdash` + `mount`/`umount` for Files → network drives). Running as root is not required.
- **Network drives:** Files → This PC → Add network drive (SMB username/password, or NFS). On Linux the dashboard installs `cifs-utils` / `nfs-common` and attempts mount sudo when you connect — same apt sudo as OS updates.
- **Terminal:** opens as the systemd `User=`, not the web login name. Optional: set a Linux username in **Terminal → settings** (or `SYSTEMDASH_OS_USER`) so that when the service is still root, new shells `su -` into that account.
- **HTTPS:** put Caddy/nginx in front when not on a trusted LAN.

## Checklist

1. `curl http://localhost:3001/api/health` → `{"ok":true}`
2. First-run setup → admin user
3. Overview / Processes work
4. Install a newer release → `current` symlink updates, data persists, app restarts
