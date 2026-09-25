// ==========================================================================
// ai-setup.js: the box that helps you connect the AI on your Mac.
// It shows what's actually wrong (from diagnoseLocalAI in ai.js) and the
// exact fix, including the Terminal command with your app's real address.
// ==========================================================================

import { esc } from './format.js';
import { browserName } from './ai.js';

// ai: the page's AI state ({ diagnosis, productionUrl })
export function setupBoxHTML(ai) {
  const d = ai.diagnosis;
  if (d?.status === 'not-computer') {
    return `<div class="setup-help">
      <p class="muted-line">The AI runs on your Mac, not your phone. Open this stock in the app on your Mac and tap <strong>Write my research note</strong>. With note sync on, it appears here too.</p>
    </div>`;
  }
  if (!d) {
    return '<div class="setup-help"><p class="muted-line"><span class="spinner"></span>Checking the AI on your Mac…</p></div>';
  }

  const here = location.origin;
  const prod = ai.productionUrl;
  // Allow both the permanent address and this page's address, so it works right away
  const origins = prod && prod !== here ? `${prod},${here}` : prod || here;
  const commandBox = (cmd) => `
    <div class="cmd"><code>${esc(cmd)}</code>
      <button type="button" class="text-btn small" data-action="copy" data-copy="${esc(cmd)}">Copy</button></div>`;
  const command = `launchctl setenv OLLAMA_ORIGINS "${origins}"`;
  // The one-time setup: allows this app, survives restarts, restarts Ollama
  const base = prod || (here.startsWith('https://') ? here : null);
  const setup = base ? `curl -fsSL ${base}/setup/mac.sh | bash -s -- ${base}` : null;
  const fixBox = setup
    ? `Paste this into Terminal once. It sets everything up and keeps working after restarts:${commandBox(setup)}`
    : `In Terminal, run:${commandBox(command)}`;
  const recheck = '<button type="button" class="btn-primary" data-action="recheck-ai">Check again</button>';
  const wrongAddress = prod && prod !== here
    ? `<p class="muted-line warn-line">You're on a one-off address (${esc(location.host)}) that changes every time the app redeploys. Bookmark <strong>${esc(prod.replace('https://', ''))}</strong> and use that instead.</p>`
    : '';
  const browser = browserName();

  let body;
  if (d.status === 'ok') {
    body = `<p class="setup-title ok">Found ${esc(d.models[0])} on your Mac.</p>${recheck}`;
  } else if (d.status === 'no-model') {
    body = `
      <p class="setup-title">Ollama is running, but no AI model is downloaded.</p>
      <p class="muted-line">In Terminal, run:</p>${commandBox('ollama pull qwen3:14b')}
      ${recheck}`;
  } else if (d.status === 'origin') {
    body = `
      <p class="setup-title">Ollama is running, but it doesn't accept this app's address yet.</p>
      <ol class="setup-steps">
        <li>${fixBox}</li>
        ${setup ? '' : '<li>Click the llama icon in the menu bar → <strong>Quit Ollama</strong>, then open Ollama again.</li>'}
        <li>Tap <strong>Check again</strong>.</li>
      </ol>
      ${recheck}`;
  } else {
    const browserTip = browser === 'Safari'
      ? '<li><strong>Safari</strong> can block websites from reaching apps on your Mac. Open this page in <strong>Chrome</strong> instead.</li>'
      : `<li>If ${esc(browser)} asked about <strong>local network access</strong>, choose <strong>Allow</strong>. To check, click the icon left of the address bar → Site settings → Local network access → Allow.</li>`;
    body = `
      <p class="setup-title">Your Mac's AI isn't answering.</p>
      <ol class="setup-steps">
        <li>Make sure <strong>Ollama is open</strong>: there should be a llama icon in the menu bar. If not, open it from Applications.</li>
        ${browserTip}
        <li>${fixBox}</li>
      </ol>
      ${recheck}`;
  }
  return `<div class="setup-help diagnosis">${body}${wrongAddress}
    ${setup ? '' : '<p class="muted-line small-print">Mac restarted? Run the Terminal command again and reopen Ollama.</p>'}</div>`;
}
