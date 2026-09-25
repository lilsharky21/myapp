// ==========================================================================
// install.js: helps the app feel like a real app on your phone.
// - On an iPhone in Safari (not yet added), a small tip explains
//   "Share → Add to Home Screen".
// - A service worker (sw.js) keeps the app's files on the device, so it
//   opens instantly and still shows your journal with no connection.
// ==========================================================================

const DISMISSED = 'thesis-journal/install-tip';

export function installTipHTML() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISSED) === '1'; } catch { /* blocked */ }
  if (!ios || standalone || dismissed) return '';
  return `<div class="install-tip card-plain" id="install-tip">
    <img src="icons/icon-180.png" alt="" width="44" height="44">
    <div><p class="install-title">Put Thesis on your Home Screen</p>
      <p class="muted-line">Tap <span class="share-glyph" aria-label="Share">
        <svg viewBox="0 0 16 20" aria-hidden="true"><path d="M8 13V2M4.5 5.5 8 2l3.5 3.5M3 9H2v9h12V9h-1"/></svg></span>
        then <strong>Add to Home Screen</strong>. It opens full screen, like an app.</p></div>
    <button type="button" class="tl-del" data-action="dismiss-install" aria-label="Dismiss">×</button>
  </div>`;
}

export function dismissInstallTip() {
  try { localStorage.setItem(DISMISSED, '1'); } catch { /* blocked */ }
}

// Only where the app is really hosted (the preview link has no backend)
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  try {
    const res = await fetch('/api/status', { method: 'HEAD' }).catch(() => null);
    if (!res || res.status === 404) return;
    await navigator.serviceWorker.register('/sw.js');
  } catch { /* not supported here; the app works without it */ }
}
