// ==========================================================================
// format.js: turns raw numbers into what people read.
// 1234567890 -> "$1.23B", 0.1234 -> "+12.3%", a timestamp -> "3h ago"
// ==========================================================================

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

const missing = (v) => v === null || v === undefined || Number.isNaN(v);
export const DASH = '—';

// $182.34
export function price(v) {
  return missing(v) ? DASH : usd.format(v);
}

// $1.23T, $45.6B, $789M, -$12.3M
export function money(v) {
  if (missing(v)) return DASH;
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e11 ? 0 : abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${usd0.format(abs)}`;
}

// 1.23B, 45.6M, 7,890 (shares, volume)
export function count(v) {
  if (missing(v)) return DASH;
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${plain.format(abs)}`;
}

// +12.3%  (value already in percent units: 12.3 means 12.3%)
export function pct(v, { digits = 1, sign = true } = {}) {
  if (missing(v)) return DASH;
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return `${s}${Math.abs(v).toFixed(digits)}%`;
}

// 24.3×
export function times(v, digits = 1) {
  return missing(v) || v <= 0 ? DASH : `${v.toFixed(digits)}×`;
}

// 1.23 (plain number)
export function num(v, digits = 2) {
  return missing(v) ? DASH : v.toFixed(digits);
}

// "up" / "down" / "" class for coloring
export function tone(v) {
  return missing(v) || v === 0 ? '' : v > 0 ? 'up' : 'down';
}

export const dateShort = (t) => shortDate.format(new Date(t));
export const dateLong = (t) => longDate.format(new Date(t));
export const time = (t) => clock.format(new Date(t));

// "just now", "5m ago", "3h ago", "2d ago", "Sep 3"
export function ago(t) {
  const seconds = (Date.now() - t) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return dateShort(t);
}

// Makes text safe to put inside HTML (so a "<" in a headline can't break the page)
export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
