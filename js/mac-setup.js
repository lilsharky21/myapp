// ==========================================================================
// mac-setup.js: the one-time Mac setup, as a command you can paste.
// The whole script is inside the command, so nothing is downloaded and it
// works from any address of the app. (setup/mac.sh is the same script as a
// file; a test keeps the two identical.)
// ==========================================================================

// The script itself. It expects the allowed app addresses as its arguments.
export const SCRIPT_BODY = `# One-time Mac setup for Thesis Journal's AI.
# 1. Allows your app's address(es) to talk to Ollama, now and after every
#    restart, using a small login item (a macOS "LaunchAgent")
# 2. Downloads the qwen3:14b model if you don't have it
# 3. Restarts Ollama so the setting takes effect
# To undo: rm ~/Library/LaunchAgents/com.thesisjournal.ollama.plist
set -e

ORIGINS=""
for url in "$@"; do
  url="\${url%/}"
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

FIRST="\${ORIGINS%%,*}"
if curl -fs -H "Origin: $FIRST" http://localhost:11434/api/tags >/dev/null; then
  echo "✓ All set. Reload the app in your browser."
else
  echo "Ollama is still starting. Wait a few seconds, then reload the app."
fi
`;

// A command to paste into Terminal: runs the script with these addresses.
export function macSetupCommand(origins) {
  const list = [...new Set(origins.filter(Boolean).map((o) => o.replace(/\/$/, '')))];
  const args = list.map((o) => `'${o.replace(/'/g, '')}'`).join(' ');
  return `bash -s -- ${args} <<'THESIS_SETUP'\n${SCRIPT_BODY}THESIS_SETUP\n`;
}
