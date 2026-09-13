#!/usr/bin/env bash
#
# Change the PIN (or password) on a running install.
#
#   sudo ./scripts/set-pin.sh 246813      # keypad PIN, 4-12 digits
#   sudo ./scripts/set-pin.sh --password 'a longer passphrase'
#   sudo ./scripts/set-pin.sh --open      # remove the lock screen entirely

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

[[ -f "$ENV_FILE" ]] || { echo "No .env at $ENV_FILE" >&2; exit 1; }

case "${1:-}" in
  --password)
    [[ -n "${2:-}" ]] || { echo "Give a password after --password" >&2; exit 1; }
    NEW_LINE="WEBTOOLS_PASSWORD=$2"
    MESSAGE="Password updated."
    ;;
  --open)
    NEW_LINE=""
    MESSAGE="Lock screen removed — anyone who can reach the site is in."
    ;;
  '')
    echo "Usage: $0 <pin> | --password <text> | --open" >&2
    exit 1
    ;;
  *)
    [[ "$1" =~ ^[0-9]{4,12}$ ]] || { echo "A PIN must be 4 to 12 digits." >&2; exit 1; }
    NEW_LINE="WEBTOOLS_PIN=$1"
    MESSAGE="PIN updated to $1."
    ;;
esac

sed -i '/^WEBTOOLS_PIN=/d; /^WEBTOOLS_PASSWORD=/d' "$ENV_FILE"
[[ -n "$NEW_LINE" ]] && echo "$NEW_LINE" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

if systemctl list-unit-files workbench.service >/dev/null 2>&1; then
  systemctl restart workbench
  echo "$MESSAGE Service restarted."
else
  echo "$MESSAGE Restart the app to apply it."
fi

# Existing browser sessions stay signed in. To boot everyone out as well:
#   sudo rm "$APP_DIR/data/session.key" && sudo systemctl restart workbench
