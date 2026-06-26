#!/usr/bin/env bash
# Prepare a normal user (default: vadmin) to run SystemDash via systemd.
# - docker group (container tab)
# - passwordless sudo for apt + systemctl restart systemdash (updates UI)
#
# Usage (on the server, as a user that can sudo):
#   bash configure-service-user.sh [username]
set -euo pipefail

USER_NAME="${1:-vadmin}"

if [[ "$(id -u)" -ne 0 ]] && ! sudo -n true 2>/dev/null; then
  echo "Run as root or as a user with sudo." >&2
  exit 1
fi

run() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

if ! id "$USER_NAME" &>/dev/null; then
  echo "User '$USER_NAME' does not exist." >&2
  exit 1
fi

echo "==> Configuring $USER_NAME for SystemDash"

SD_HOME="${SYSTEMDASH_HOME:-/home/${USER_NAME}/systemdash}"
if [[ -d "$SD_HOME" ]]; then
  run chown -R "$USER_NAME:$USER_NAME" "$SD_HOME"
  echo "    chown $USER_NAME:$SD_HOME"
fi

if getent group docker &>/dev/null; then
  run usermod -aG docker "$USER_NAME"
  echo "    Added $USER_NAME to group docker"
else
  echo "    (docker group not found — skip or install Docker Engine first)"
fi

SUDOERS="/etc/sudoers.d/systemdash-${USER_NAME}"
run tee "$SUDOERS" >/dev/null <<EOF
# SystemDash — passwordless apt updates and service restart for ${USER_NAME}
${USER_NAME} ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt
${USER_NAME} ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart systemdash
EOF
run chmod 440 "$SUDOERS"
run visudo -cf "$SUDOERS"
echo "    Wrote $SUDOERS"

echo "==> Testing passwordless sudo (as $USER_NAME)"
if run sudo -u "$USER_NAME" sudo -n apt-get -qq update; then
  echo "    apt-get: OK"
else
  echo "    apt-get: FAILED" >&2
  exit 1
fi

if systemctl list-unit-files systemdash.service &>/dev/null; then
  if run sudo -u "$USER_NAME" sudo -n systemctl restart systemdash; then
    echo "    systemctl restart systemdash: OK"
  else
    echo "    systemctl restart systemdash: FAILED (fix sudoers or unit name)" >&2
    exit 1
  fi
else
  echo "    (systemdash.service not installed yet — skipped restart test)"
fi

cat <<EOF

==> Next: set systemd to run as ${USER_NAME}

  cd ${SD_HOME}/current
  sudo cp scripts/systemdash-vadmin.service.example /etc/systemd/system/systemdash.service
  # Edit paths if needed, then:
  sudo systemctl daemon-reload
  sudo systemctl enable --now systemdash

The in-app terminal will then show ${USER_NAME}@$(hostname -s), not root.

EOF
