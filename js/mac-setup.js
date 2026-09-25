// ==========================================================================
// mac-setup.js: the one-time Mac setup, as a command you can paste.
// The whole script is inside the command, so nothing is downloaded and it
// works from any address of the app. (setup/mac.sh is the same script as a
// file; a test keeps the two identical.)
// ==========================================================================

// The script itself. Its arguments: the allowed app addresses, and optionally
// --app <permanent address> --passcode <your passcode> for the phone helper.
export const SCRIPT_BODY = `# One-time Mac setup for Thesis Journal's AI.
# 1. Allows your app's address(es) to talk to Ollama, now and after every
#    restart, using a small login item (a macOS "LaunchAgent")
# 2. Downloads the qwen3:14b model if you don't have it
# 3. Restarts Ollama so the setting takes effect
# 4. (With --app) Installs a small helper that writes the research notes your
#    iPhone asks for: every 5 minutes while this Mac is awake, it checks your
#    app for requests and has Ollama write them
# To undo: rm ~/Library/LaunchAgents/com.thesisjournal.*.plist
set -e

ORIGINS=""
APP=""
PASSCODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP="\${2%/}"; shift 2; continue ;;
    --passcode) PASSCODE="$2"; shift 2; continue ;;
  esac
  url="\${1%/}"
  shift
  if [[ ! "$url" =~ ^https?://[a-zA-Z0-9.:-]+$ ]]; then
    echo "Skipping '$url' (not a web address)"
    continue
  fi
  ORIGINS="\${ORIGINS:+$ORIGINS,}$url"
done
if [ -z "$ORIGINS" ]; then
  echo "Give your app's address, like: https://your-app.vercel.app"
  exit 1
fi
if [ ! -d "/Applications/Ollama.app" ]; then
  echo "Ollama isn't installed. Download it from https://ollama.com, open it once, then run this again."
  exit 1
fi

AGENT="$HOME/Library/LaunchAgents/com.thesisjournal.ollama.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.thesisjournal.ollama</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>launchctl setenv OLLAMA_ORIGINS "$ORIGINS"; launchctl setenv OLLAMA_KEEP_ALIVE "30m"; osascript -e 'quit app "Ollama"' 2&gt;/dev/null; sleep 2; open -a Ollama</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
echo "✓ Saved login setting for $ORIGINS"

launchctl unload "$AGENT" 2>/dev/null || true
launchctl load "$AGENT"
echo "✓ Restarting Ollama with the new setting…"
sleep 6

OLLAMA_BIN="$(command -v ollama || echo /Applications/Ollama.app/Contents/Resources/ollama)"
if ! "$OLLAMA_BIN" list 2>/dev/null | grep -q "^qwen3:14b"; then
  echo "Downloading qwen3:14b (about 9 GB, one time)…"
  "$OLLAMA_BIN" pull qwen3:14b
fi

# The phone helper: writes the notes your iPhone asks for
if [[ "$APP" =~ ^https://[a-zA-Z0-9.:-]+$ ]]; then
  DIR="$HOME/Library/Application Support/ThesisJournal"
  mkdir -p "$DIR"
  printf '%s' "$APP" > "$DIR/app"
  printf '%s' "$PASSCODE" > "$DIR/passcode"
  chmod 600 "$DIR/passcode"
  printf '%s' "qwen3:14b" > "$DIR/model"
  cat > "$DIR/worker.sh" <<'WORKER'
#!/bin/bash
# Thesis Journal's Mac helper. Every 5 minutes while this Mac is awake, it asks
# your app if your phone wants a research note, has Ollama write it, and sends
# it back. Once an hour it also refreshes your oldest watchlist note.
DIR="$HOME/Library/Application Support/ThesisJournal"
APP="$(cat "$DIR/app" 2>/dev/null)"
PASS="$(cat "$DIR/passcode" 2>/dev/null)"
MODEL="$(cat "$DIR/model" 2>/dev/null)"
LOG="$DIR/worker.log"
[ -n "$APP" ] || exit 0
[ -n "$MODEL" ] || MODEL="qwen3:14b"

# Quiet overnight (1am to 7am), and only when Ollama is running
HOUR=$((10#$(date +%H)))
if [ "$HOUR" -ge 1 ] && [ "$HOUR" -lt 7 ]; then exit 0; fi
curl -fs -m 5 http://localhost:11434/api/tags >/dev/null || exit 0

# One note at a time (a lock older than 30 minutes is from a crash)
if ! mkdir "$DIR/lock" 2>/dev/null; then
  if [ -z "$(find "$DIR/lock" -maxdepth 0 -mmin +30)" ]; then exit 0; fi
  rm -rf "$DIR/lock"
  mkdir "$DIR/lock" || exit 0
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$DIR/lock" "$TMP"' EXIT

AUTO=0
if [ $((10#$(date +%M))) -lt 5 ]; then AUTO=1; fi
CODE=$(curl -s -m 60 -o "$TMP/job" -D "$TMP/headers" -w '%{http_code}' -H "x-passcode: $PASS" "$APP/api/jobs?next=1&auto=$AUTO&model=$MODEL")
[ "$CODE" = "200" ] || exit 0
TICKER=$(grep -i '^x-job-ticker:' "$TMP/headers" | head -1 | cut -d: -f2 | tr -d ' \\r\\n')
[ -n "$TICKER" ] || exit 0

echo "$(date '+%Y-%m-%d %H:%M') writing a note for $TICKER" >> "$LOG"
if ! curl -s -m 900 -H 'Content-Type: application/json' --data-binary @"$TMP/job" -o "$TMP/answer" http://localhost:11434/api/chat; then
  echo "  Ollama didn't answer" >> "$LOG"
  exit 0
fi
curl -s -m 60 -X POST -H "x-passcode: $PASS" -H 'Content-Type: application/json' --data-binary @"$TMP/answer" "$APP/api/jobs?done=$TICKER&model=$MODEL" >> "$LOG"
echo >> "$LOG"
WORKER
  chmod 700 "$DIR/worker.sh"

  HELPER="$HOME/Library/LaunchAgents/com.thesisjournal.worker.plist"
  cat > "$HELPER" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.thesisjournal.worker</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$DIR/worker.sh</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
  launchctl unload "$HELPER" 2>/dev/null || true
  launchctl load "$HELPER"
  echo "✓ Phone helper on: your iPhone can now ask this Mac for research notes"
fi

FIRST="\${ORIGINS%%,*}"
if curl -fs -H "Origin: $FIRST" http://localhost:11434/api/tags >/dev/null; then
  echo "✓ All set. Reload the app in your browser."
else
  echo "Ollama is still starting. Wait a few seconds, then reload the app."
fi
`;

// Quote any text safely for the shell: 'it'\''s' style
const shellQuote = (text) => `'${String(text).replace(/'/g, "'\\''")}'`;

// A command to paste into Terminal: runs the script with these addresses.
// helper: { app, passcode } also installs the phone helper for that address.
export function macSetupCommand(origins, helper = null) {
  const list = [...new Set(origins.filter(Boolean).map((o) => o.replace(/\/$/, '')))];
  const args = list.map((o) => `'${o.replace(/'/g, '')}'`);
  if (helper?.app) args.push('--app', `'${helper.app.replace(/'/g, '').replace(/\/$/, '')}'`, '--passcode', shellQuote(helper.passcode ?? ''));
  return `bash -s -- ${args.join(' ')} <<'THESIS_SETUP'\n${SCRIPT_BODY}THESIS_SETUP\n`;
}
