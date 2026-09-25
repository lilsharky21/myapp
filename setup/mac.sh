#!/bin/bash
# ==========================================================================
# One-time Mac setup for Thesis Journal's AI.
# Run it once with the command the app shows you:
#   curl -fsSL https://YOUR-APP.vercel.app/setup/mac.sh | bash -s -- https://YOUR-APP.vercel.app
#
# What it does (nothing else):
#   1. Allows your app's web address to talk to Ollama, now and after every
#      restart, using a small login item (a macOS "LaunchAgent")
#   2. Downloads the qwen3:14b model if you don't have it
#   3. Restarts Ollama so the setting takes effect
# To undo: rm ~/Library/LaunchAgents/com.thesisjournal.ollama.plist
# ==========================================================================
set -e

APP_URL="${1%/}"
if [[ ! "$APP_URL" =~ ^https://[a-zA-Z0-9.-]+$ ]]; then
  echo "Usage: bash mac.sh https://your-app.vercel.app"
  exit 1
fi
if [ ! -d "/Applications/Ollama.app" ]; then
  echo "Ollama isn't installed. Download it from https://ollama.com, open it once, then run this again."
  exit 1
fi

AGENT="$HOME/Library/LaunchAgents/com.thesisjournal.ollama.plist"
mkdir -p "$HOME/Library/LaunchAgents"

# At every login: set the allowed address and keep the model in memory longer,
# then (re)start Ollama so it reads them.
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
    <string>launchctl setenv OLLAMA_ORIGINS "$APP_URL"; launchctl setenv OLLAMA_KEEP_ALIVE "30m"; osascript -e 'quit app "Ollama"' 2&gt;/dev/null; sleep 2; open -a Ollama</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST

echo "✓ Saved login setting for $APP_URL"

# Apply it right now too
launchctl unload "$AGENT" 2>/dev/null || true
launchctl load "$AGENT"
echo "✓ Restarting Ollama with the new setting…"
sleep 6

OLLAMA_BIN="$(command -v ollama || echo /Applications/Ollama.app/Contents/Resources/ollama)"
if ! "$OLLAMA_BIN" list 2>/dev/null | grep -q "^qwen3:14b"; then
  echo "Downloading qwen3:14b (about 9 GB, one time)…"
  "$OLLAMA_BIN" pull qwen3:14b
fi

if curl -fs -H "Origin: $APP_URL" http://localhost:11434/api/tags >/dev/null; then
  echo "✓ All set. Reload the app in your browser."
else
  echo "Ollama is still starting. Wait a few seconds, then reload the app."
fi
