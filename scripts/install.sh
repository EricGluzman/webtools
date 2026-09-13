#!/usr/bin/env bash
#
# Install Workbench on an Ubuntu/Debian server.
#
#   sudo ./scripts/install.sh tools.example.com          # generates a password
#   sudo ./scripts/install.sh tools.example.com 246813   # sets that PIN
#
# Re-running is safe: it updates the code and restarts the service.

set -euo pipefail

DOMAIN="${1:-}"
PIN="${2:-}"
APP_DIR="/opt/workbench"
APP_USER="workbench"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m ! \033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m x \033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo."

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# tesseract reads the scans, poppler handles PDFs, the rest is build tooling
# for better-sqlite3 in case no prebuilt binary matches this machine.
apt-get install -y -qq \
  tesseract-ocr poppler-utils \
  build-essential python3 ca-certificates curl rsync

say "Extra OCR languages (optional)"
echo "    Installed: $(tesseract --list-langs 2>/dev/null | tail -n +2 | tr '\n' ' ')"
echo "    Add more with, for example:  sudo apt-get install tesseract-ocr-deu tesseract-ocr-ukr"

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  say "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "    node $(node --version)"

if ! id "$APP_USER" >/dev/null 2>&1; then
  say "Creating the $APP_USER service user"
  useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

say "Copying the app to $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules --exclude data --exclude .git --exclude .env \
  "$SOURCE_DIR"/ "$APP_DIR"/
mkdir -p "$APP_DIR/data"

say "Installing dependencies"
cd "$APP_DIR"
sudo -u "$APP_USER" npm install --omit=dev --no-audit --no-fund

if [[ -n "$PIN" && ! "$PIN" =~ ^[0-9]{4,12}$ ]]; then
  die "The PIN must be 4 to 12 digits."
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  if [[ -n "$PIN" ]]; then
    say "Creating .env with your PIN"
    CREDENTIAL_LINE="WEBTOOLS_PIN=$PIN"
    CHOSEN_PIN="$PIN"
  else
    say "Creating .env with a generated password"
    GENERATED_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
    CREDENTIAL_LINE="WEBTOOLS_PASSWORD=$GENERATED_PASSWORD"
  fi
  cat > "$APP_DIR/.env" <<ENV
PORT=8712
HOST=127.0.0.1
$CREDENTIAL_LINE
DATA_DIR=./data
MAX_UPLOAD_MB=40
TRUST_PROXY=1
OCR_LANGS=eng
ENV
  chmod 600 "$APP_DIR/.env"
elif [[ -n "$PIN" ]]; then
  say "Updating the PIN in the existing .env"
  sed -i '/^WEBTOOLS_PIN=/d; /^WEBTOOLS_PASSWORD=/d' "$APP_DIR/.env"
  echo "WEBTOOLS_PIN=$PIN" >> "$APP_DIR/.env"
  CHOSEN_PIN="$PIN"
fi

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

say "Installing the systemd service"
install -m 644 "$APP_DIR/scripts/workbench.service" /etc/systemd/system/workbench.service
systemctl daemon-reload
systemctl enable --now workbench
sleep 2
systemctl is-active --quiet workbench || { journalctl -u workbench -n 30 --no-pager; die "The service did not start."; }
echo "    service is running on 127.0.0.1:8712"

if [[ -n "$DOMAIN" ]]; then
  if command -v nginx >/dev/null 2>&1; then
    say "Configuring nginx for $DOMAIN"
    sed "s/tools.example.com/$DOMAIN/g" "$APP_DIR/scripts/nginx.conf.example" \
      > /etc/nginx/sites-available/workbench
    ln -sf /etc/nginx/sites-available/workbench /etc/nginx/sites-enabled/workbench
    nginx -t && systemctl reload nginx
    echo "    http://$DOMAIN is live"
    echo "    For HTTPS:  sudo certbot --nginx -d $DOMAIN"
  else
    warn "nginx is not installed; skipping the site config."
    warn "Install it with: sudo apt-get install nginx certbot python3-certbot-nginx"
  fi
else
  warn "No domain given, so nginx was not configured."
  warn "Re-run as: sudo ./scripts/install.sh your.subdomain.com"
fi

say "Done"
if [[ -n "${GENERATED_PASSWORD:-}" ]]; then
  printf '\n    Your login password is:  \033[1;32m%s\033[0m\n' "$GENERATED_PASSWORD"
  printf '    It is stored in %s\n\n' "$APP_DIR/.env"
elif [[ -n "${CHOSEN_PIN:-}" ]]; then
  printf '\n    Unlock the site with the PIN \033[1;32m%s\033[0m on the keypad.\n\n' "$CHOSEN_PIN"
fi
echo "    Change the PIN: sudo $APP_DIR/scripts/set-pin.sh 123456"
echo "    Logs:    sudo journalctl -u workbench -f"
echo "    Restart: sudo systemctl restart workbench"
echo "    Backup:  sudo $APP_DIR/scripts/backup.sh"
