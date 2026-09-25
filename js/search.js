// ==========================================================================
// search.js: find a stock by typing its name or ticker.
// Used by the search box on the watchlist and the Ticker field when adding.
// Asks Finnhub through /api/search; without a backend (the preview link)
// it searches a built-in list of well-known companies instead.
// ==========================================================================

import { passcodeHeaders } from './api.js';
import { esc } from './format.js';

const POPULAR = [
  ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet (Google)'],
  ['META', 'Meta Platforms'], ['TSLA', 'Tesla'], ['BRK.B', 'Berkshire Hathaway'], ['AVGO', 'Broadcom'], ['JPM', 'JPMorgan Chase'],
  ['V', 'Visa'], ['MA', 'Mastercard'], ['LLY', 'Eli Lilly'], ['UNH', 'UnitedHealth'], ['COST', 'Costco'],
  ['WMT', 'Walmart'], ['HD', 'Home Depot'], ['PG', 'Procter & Gamble'], ['KO', 'Coca-Cola'], ['PEP', 'PepsiCo'],
  ['NFLX', 'Netflix'], ['AMD', 'Advanced Micro Devices'], ['INTC', 'Intel'], ['CRM', 'Salesforce'], ['ADBE', 'Adobe'],
  ['ORCL', 'Oracle'], ['DIS', 'Walt Disney'], ['NKE', 'Nike'], ['SBUX', 'Starbucks'], ['MCD', "McDonald's"],
  ['PLTR', 'Palantir'], ['UBER', 'Uber'], ['SHOP', 'Shopify'], ['TSM', 'Taiwan Semiconductor'], ['ASML', 'ASML'],
  ['XOM', 'Exxon Mobil'], ['CVX', 'Chevron'], ['BA', 'Boeing'], ['SPY', 'S&P 500 ETF'], ['QQQ', 'Nasdaq 100 ETF'],
];

let backend = true; // switches off after the first "no backend here" answer
const answers = new Map();

export async function searchStocks(query) {
  const q = query.trim();
  if (!q) return [];
  if (answers.has(q.toLowerCase())) return answers.get(q.toLowerCase());
  let results = null;
  if (backend) {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json', ...passcodeHeaders() } });
      if (!(res.headers.get('content-type') || '').includes('json') || res.status === 503) backend = false;
      else if (res.ok) results = (await res.json()).results;
    } catch { /* offline: use the built-in list */ }
  }
  if (!results) {
    const lower = q.toLowerCase();
    results = POPULAR
      .filter(([s, n]) => s.toLowerCase().startsWith(lower) || n.toLowerCase().includes(lower))
      .map(([symbol, name]) => ({ symbol, name, type: '' }))
      .slice(0, 8);
  } else {
    answers.set(q.toLowerCase(), results);
  }
  return results;
}

// Hook a text box up to a list of suggestions.
// onPick({ symbol, name }) runs when you tap one (or press Return on it).
export function attachSearch(input, list, { onPick, extra = () => [] }) {
  let timer = null;
  let items = [];
  let active = -1;
  let asked = 0;

  const draw = () => {
    list.hidden = items.length === 0;
    list.innerHTML = items.map((r, i) => `
      <li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}">
        <span class="sr-symbol">${esc(r.symbol)}</span><span class="sr-name">${esc(r.name)}</span>${r.tag ? `<span class="sr-tag">${esc(r.tag)}</span>` : ''}
      </li>`).join('');
    input.setAttribute('aria-expanded', String(items.length > 0));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const close = () => { items = []; active = -1; draw(); };
  const pick = (i) => {
    const r = items[i];
    if (!r) return;
    close();
    onPick(r);
  };

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  list.setAttribute('role', 'listbox');

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value;
    if (!q.trim()) return close();
    timer = setTimeout(async () => {
      const ticket = ++asked;
      const found = await searchStocks(q);
      if (ticket !== asked || input.value !== q) return; // you kept typing
      const local = extra(q);
      const seen = new Set(local.map((r) => r.symbol));
      items = [...local, ...found.filter((r) => !seen.has(r.symbol))].slice(0, 8);
      active = -1;
      draw();
    }, 250);
  });
  input.addEventListener('keydown', (event) => {
    if (!items.length) return;
    if (event.key === 'ArrowDown') { active = (active + 1) % items.length; draw(); event.preventDefault(); }
    else if (event.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; draw(); event.preventDefault(); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); pick(active); }
    else if (event.key === 'Escape') { event.stopPropagation(); close(); }
  });
  // pointerdown (not click) so it fires before the box loses focus
  list.addEventListener('pointerdown', (event) => {
    const li = event.target.closest('li[data-i]');
    if (!li) return;
    event.preventDefault();
    pick(Number(li.dataset.i));
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  return { close };
}
