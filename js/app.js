// ==========================================================================
// app.js: what you see and tap.
// Draws the watchlist (cards or the Compare table), the Today card, search,
// the Watching / Own / Closed switch, and the sheet for adding or editing
// an idea. Keeps your journal saved on this device and synced to the others.
// ==========================================================================

import {
  loadIdeas, saveIdeas, createIdea, parsePrice, applyEdit, normalizeIdea, mergeJournals, journalKey,
  exportJournal, parseBackup, position, ideaReturn, needsReview, VERDICTS, CONVICTION_WORDS,
} from './journal.js';
import { openStockPage, closeStockPage, refreshIdea, selectTab } from './stock.js';
import { getQuote, passcodeHeaders } from './api.js';
import { diagnoseLocalAI, savedResearch } from './ai.js';
import { setupCopyBox } from './ai-setup.js';
import { macSetupCommand } from './mac-setup.js';
import { pullJournal, pushJournal } from './sync.js';
import { attachSearch } from './search.js';
import { loadMarket, todayHTML } from './today.js';
import { compareHTML, sortIdeas, refreshStale } from './compare.js';
import { writeAllNotes } from './batch.js';
import * as f from './format.js';

// Shortcut: $('#list') finds the element with id="list"
const $ = (selector) => document.querySelector(selector);
const PREFS = 'thesis-journal/prefs';

// ---------- The app's memory while it's open ----------

const loaded = loadIdeas();
const prefs = readPrefs();
const state = {
  ideas: loaded.ideas,          // every idea, newest first
  deleted: loaded.deleted,      // ideas you deleted (so the deletion syncs)
  canSave: loaded.canSave,      // false if the browser blocks saving
  filter: 'watching',           // which tab is showing
  sort: prefs.sort ?? 'newest', // how the list is ordered
  sortDir: -1,                  // -1 = biggest first
  mode: prefs.mode ?? 'cards',  // 'cards' or 'compare'
  quotes: new Map(),            // ticker -> latest price (live or demo)
  editingId: null,              // the idea being edited (null = adding a new one)
  form: { conviction: 3, status: 'watching' },
  openStockId: null,            // the stock page that's open (null = watchlist)
  openIdea: null,               // that stock's idea (may not be on your list yet)
  listScroll: 0,                // where you were in the list, to come back to
  usedHistory: false,           // whether the browser's back button knows about the stock page
  sync: { status: 'idle', at: null },
  market: null,
  comparing: null,              // the background analysis for Compare
  analyzing: null,              // which ticker Compare is analyzing right now
};

const FILTERS = ['watching', 'own', 'closed'];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const isComputer = () => navigator.maxTouchPoints === 0;

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS)) ?? {}; } catch { return {}; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS, JSON.stringify({ sort: state.sort, mode: state.mode, today: $('#today-card').open })); } catch { /* blocked */ }
}

// ---------- Drawing the list ----------

function render({ animateIn = false } = {}) {
  // Update the switch: counts, and slide the highlight to the chosen tab
  const filters = $('#filters');
  filters.style.setProperty('--i', FILTERS.indexOf(state.filter));
  for (const button of filters.querySelectorAll('button')) {
    const key = button.dataset.filter;
    button.setAttribute('aria-selected', String(key === state.filter));
    const count = state.ideas.filter((i) => i.status === key).length;
    const due = key !== 'closed' ? state.ideas.filter((i) => i.status === key && needsReview(i)).length : 0;
    button.querySelector('.count').innerHTML = `${count}${due ? `<i class="due-dot" title="${due} due for review"></i>` : ''}`;
  }
  const mode = $('#view-mode');
  mode.style.setProperty('--i', state.mode === 'compare' ? 1 : 0);
  mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));
  $('#sort').value = state.sort;
  $('#sort').closest('.sort-pick').hidden = state.mode === 'compare';

  const shown = shownIdeas();
  if (!shown.length) {
    $('#list').innerHTML = emptyHTML(state.filter);
  } else if (state.mode === 'compare') {
    $('#list').innerHTML = compareHTML(shown, state.quotes, { key: state.sort === 'newest' ? 'app' : state.sort, dir: state.sortDir, busy: state.analyzing });
  } else {
    $('#list').innerHTML = shown.map((idea, k) => cardHTML(idea, k, animateIn)).join('');
  }
  renderPortfolio();
  fillPrices(shown);
}

function shownIdeas() {
  const shown = state.ideas.filter((idea) => idea.status === state.filter);
  if (state.sort === 'newest' && state.mode === 'cards') return shown;
  return sortIdeas(shown, state.quotes, state.sort === 'newest' ? 'app' : state.sort, state.sortDir);
}

// Prices on the cards. Cards only show real prices, never demo ones.
function fillPrices(ideas, { fresh = false } = {}) {
  for (const idea of ideas) {
    getQuote(idea.ticker, { fresh }).then((result) => {
      if (result.status !== 'live' && result.status !== 'demo') return;
      const before = state.quotes.get(idea.ticker);
      state.quotes.set(idea.ticker, { ...result.data, demo: result.status === 'demo' });
      if (state.mode === 'compare' && (!before || before.price !== result.data.price)) return scheduleRender();
      if (result.status !== 'live') return;
      const el = document.querySelector(`[data-price-for="${CSS.escape(idea.ticker)}"]`);
      if (el) {
        const q = result.data;
        el.innerHTML = `${f.price(q.price)} <span class="${f.tone(q.changePct)}">${f.pct(q.changePct)}</span>`;
      }
      fillCardNumbers(idea);
      renderPortfolio();
      if (state.market) renderToday(); // big movers
    });
  }
}

// One redraw for many prices arriving at once
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!state.openStockId) render();
  });
}

// P/L and return on a card, once its live price is known
function fillCardNumbers(idea) {
  const q = state.quotes.get(idea.ticker);
  if (!q || q.demo) return;
  const pl = document.querySelector(`[data-pl-for="${CSS.escape(idea.id)}"]`);
  const pos = position(idea, q.price);
  if (pl && pos?.shares > 0) pl.innerHTML = `<span class="${f.tone(pos.unrealized)}">${signMoney(pos.unrealized)}</span>`;
  const ret = document.querySelector(`[data-return-for="${CSS.escape(idea.id)}"]`);
  const r = ideaReturn(idea, q.price);
  if (ret && r != null) ret.innerHTML = `<span class="${f.tone(r)}">${f.pct(r)}</span>`;
}

function cardHTML(idea, k, animateIn) {
  const showCompany = idea.company || idea.sample;
  return `
    <article class="card${animateIn ? ' enter' : ''}" data-id="${idea.id}" tabindex="0" role="button"
             aria-label="Open ${esc(idea.ticker)}" style="--k:${k}; view-transition-name:${idea.id}">
      <div class="card-top">
        <div class="card-name">
          <h3 class="ticker">${esc(idea.ticker)}</h3>
          ${showCompany ? `<p class="company">${esc(idea.company)}${idea.sample ? '<span class="tag">Sample</span>' : ''}</p>` : ''}
        </div>
        <div class="card-right">
          ${dotsHTML(idea.conviction)}
          <p class="card-price" data-price-for="${esc(idea.ticker)}"></p>
        </div>
      </div>
      ${badgesHTML(idea)}
      <p class="thesis${idea.thesis ? '' : ' empty'}">${esc(idea.thesis || 'No thesis yet. Tap to write one.')}</p>
      ${ratingChips(idea.ratings, idea)}
      ${metaHTML(idea)}
    </article>`;
}

// Little flags: review due, earnings soon, latest note
function badgesHTML(idea) {
  const badges = [];
  if (needsReview(idea)) badges.push('<span class="badge due">Review due</span>');
  const next = idea.ratings?.nextEarnings;
  if (next && idea.status !== 'closed') {
    const days = Math.round((Date.parse(next + 'T12:00:00Z') - Date.now()) / 86_400_000);
    if (days >= 0 && days <= 14) badges.push(`<span class="badge earn">Earnings ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : shortDate.format(new Date(next + 'T12:00:00Z'))}</span>`);
  }
  const last = idea.notes.at(-1);
  if (last) badges.push(`<span class="badge note">Note ${f.ago(Date.parse(last.at))}</span>`);
  return badges.length ? `<div class="badges">${badges.join('')}</div>` : '';
}

function metaHTML(idea) {
  const cell = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const dash = '<span class="muted">—</span>';
  if (idea.status === 'closed' && idea.closed) {
    const verdict = VERDICTS.find(([key]) => key === idea.closed.verdict)?.[1] ?? 'Closed';
    const r = ideaReturn(idea, null);
    return `<dl class="meta">
      ${cell('Verdict', `<span class="${idea.closed.verdict === 'right' ? 'up' : idea.closed.verdict === 'wrong' ? 'down' : ''}">${verdict}</span>`)}
      ${cell('Return', r != null ? `<span class="${f.tone(r)}">${f.pct(r)}</span>` : dash)}
      ${cell('Closed', shortDate.format(new Date(idea.closed.at)))}
    </dl>`;
  }
  const pos = position(idea);
  if (pos?.shares > 0) {
    return `<dl class="meta">
      ${cell('Shares', f.num(pos.shares, pos.shares % 1 ? 3 : 0))}
      ${cell('Avg cost', money.format(pos.avgCost))}
      ${cell('P/L', `<span data-pl-for="${idea.id}">${dash}</span>`)}
    </dl>`;
  }
  const upside = idea.target != null && idea.entry > 0 ? ((idea.target - idea.entry) / idea.entry) * 100 : null;
  return `<dl class="meta">
    ${cell('Target', idea.target != null ? money.format(idea.target) : dash)}
    ${cell('Upside', upside === null ? dash : `<span class="${upside >= 0 ? 'up' : 'down'}">${f.pct(upside)}</span>`)}
    ${cell('Since added', `<span data-return-for="${idea.id}">${dash}</span>`)}
  </dl>`;
}

// The three ratings from the last time this stock was analyzed
function ratingChips(r, idea) {
  const ai = savedResearch(idea.ticker)?.result.rating ?? r?.ai;
  if (!r || !(r.wallStreet || r.app || ai)) return '';
  const tone = (label) => (/buy/i.test(label) ? 'up' : /sell/i.test(label) ? 'down' : '');
  const chip = (who, label, extra = '') => (label ? `<span class="rchip"><span class="rchip-who">${who}</span><span class="${tone(label)}">${label}</span>${extra}</span>` : '');
  return `<div class="card-ratings">
    ${chip('Street', r.wallStreet)}
    ${chip('App', r.app?.label, r.app ? ` <span class="rchip-grade">${r.app.grade}</span>` : '')}
    ${chip('AI', ai)}
    ${r.demo ? '<span class="rchip demo">demo</span>' : ''}
  </div>`;
}

function dotsHTML(level) {
  const dots = [1, 2, 3, 4, 5].map((n) => `<span class="dot${n <= level ? ' on' : ''}"></span>`).join('');
  return `<div class="dots" role="img" aria-label="Conviction ${level} of 5: ${CONVICTION_WORDS[level - 1]}">${dots}</div>`;
}

function emptyHTML(filter) {
  if (filter === 'closed') {
    return `<div class="empty-state">
      <h3>No closed ideas yet</h3>
      <p>When you close an idea (Journal tab on any stock), it lands here with your verdict and how it did against the S&amp;P 500.</p>
    </div>`;
  }
  const what = filter === 'own' ? 'Nothing marked as owned' : 'Your watchlist is empty';
  return `<div class="empty-state">
    <h3>${what}</h3>
    <p>${filter === 'own' ? 'Log a trade in a stock’s Journal tab, or mark it as Own when you edit it.' : 'Search for a stock above, or add one and write down why. Future you will want to know.'}</p>
    <button type="button" class="text-btn strong" data-action="add">Add a Stock</button>
  </div>`;
}

// Your holdings added up, on the Own tab
function renderPortfolio() {
  const box = $('#portfolio');
  const held = state.ideas.filter((i) => i.status === 'own').map((i) => [i, position(i)]).filter(([, p]) => p?.shares > 0);
  if (state.filter !== 'own' || !held.length) { box.innerHTML = ''; return; }
  let value = 0;
  let cost = 0;
  let today = 0;
  let priced = 0;
  for (const [idea, pos] of held) {
    const q = state.quotes.get(idea.ticker);
    if (!q || q.demo) continue;
    priced++;
    value += pos.shares * q.price;
    cost += pos.cost;
    today += pos.shares * (q.change ?? 0);
  }
  const realized = held.reduce((s, [, p]) => s + p.realized, 0);
  const all = priced === held.length;
  const pl = value - cost;
  box.innerHTML = `
    <div class="portfolio card-plain">
      <div><span class="stat-label">Value</span><span class="pf-big">${priced ? money.format(value) : '—'}</span></div>
      <div><span class="stat-label">Today</span><span class="pf-num ${f.tone(today)}">${priced ? signMoney(today) : '—'}</span></div>
      <div><span class="stat-label">Unrealized</span><span class="pf-num ${f.tone(pl)}">${priced ? `${signMoney(pl)} <small>${cost ? f.pct((pl / cost) * 100) : ''}</small>` : '—'}</span></div>
      ${realized ? `<div><span class="stat-label">Realized</span><span class="pf-num ${f.tone(realized)}">${signMoney(realized)}</span></div>` : ''}
      ${all ? '' : `<p class="muted-line pf-note">${priced ? 'Some prices are still loading.' : 'Live prices appear once the app is on Vercel.'}</p>`}
    </div>`;
}

function signMoney(v) {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${money.format(Math.abs(v))}`;
}

const esc = f.esc;

// Animate cards to their new spots (in browsers that support it)
function withTransition(update) {
  if (!document.startViewTransition || reduceMotion.matches) return update();
  document.startViewTransition(update);
}

// ---------- Saving and syncing ----------

function persist() {
  const ok = state.canSave && saveIdeas(state.ideas, state.deleted);
  if (!ok) state.sync.status = 'cant-save';
  showSaveStatus();
  scheduleSync();
}

function showSaveStatus() {
  const note = $('#storage-note');
  const s = state.sync;
  note.classList.toggle('warn', s.status === 'cant-save');
  note.textContent = {
    'cant-save': "This browser isn't letting the app save. Your changes will disappear when you close it.",
    syncing: 'Syncing…',
    synced: `Synced across your devices${s.at ? ` · ${f.ago(s.at)}` : ''}.`,
    off: 'Saved on this device. Turn on sync (Data connections → Sync) to see your journal on your phone too.',
    error: "Saved on this device. Couldn't reach sync just now; it'll try again.",
  }[s.status] ?? 'Saved on this device.';
}

let syncTimer = null;
let syncing = null;
let syncAgain = false;
function scheduleSync(delay = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

// Merge this device's journal with the saved one, then save the result both places
async function syncNow() {
  if (syncing) { syncAgain = true; return syncing; }
  syncing = (async () => {
    const remote = await pullJournal();
    if (remote.status !== 'live') {
      state.sync = { status: { off: 'off', locked: 'idle', offline: 'idle' }[remote.status] ?? 'error', at: null };
      if (!state.canSave) state.sync.status = 'cant-save';
      return showSaveStatus();
    }
    const local = { ideas: state.ideas, deleted: state.deleted };
    const merged = mergeJournals(local, remote.journal);
    if (journalKey(merged) !== journalKey(local)) applyMerged(merged);
    let ok = true;
    if (!remote.journal || journalKey(merged) !== journalKey(mergedShape(remote.journal))) {
      state.sync.status = 'syncing';
      showSaveStatus();
      ok = await pushJournal(merged);
    }
    state.sync = { status: ok ? 'synced' : 'error', at: ok ? Date.now() : null };
    showSaveStatus();
  })().finally(() => {
    syncing = null;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  });
  return syncing;
}

const mergedShape = (j) => ({ ideas: (j.ideas ?? []).map(normalizeIdea), deleted: j.deleted ?? {} });

// Another device changed something: show it here
function applyMerged(merged) {
  state.ideas = merged.ideas;
  state.deleted = merged.deleted;
  if (state.canSave) saveIdeas(state.ideas, state.deleted);
  const open = state.openStockId && state.ideas.find((i) => i.id === state.openStockId);
  if (open && !state.openIdea?.transient) {
    state.openIdea = open;
    refreshIdea(open);
  }
  if (!state.openStockId) render();
}

// ---------- Changing ideas ----------

function replaceIdea(next) {
  const index = state.ideas.findIndex((i) => i.id === next.id);
  if (index === -1) return;
  state.ideas[index] = next;
  if (state.openIdea?.id === next.id) state.openIdea = next;
  persist();
}

function deleteIdea(id) {
  state.ideas = state.ideas.filter((i) => i.id !== id);
  state.deleted[id] = new Date().toISOString();
  persist();
}

// Put a stock you looked up on your watchlist
function addFromPage(idea) {
  const { transient, ...rest } = idea;
  const now = new Date().toISOString();
  const added = normalizeIdea({ ...rest, entry: state.quotes.get(idea.ticker)?.price ?? rest.entry ?? null, createdAt: now, updatedAt: now });
  state.ideas.unshift(added);
  state.openIdea = added;
  state.openStockId = added.id;
  state.filter = 'watching';
  persist();
  refreshIdea(added);
  try { history.replaceState({ stock: added.id, ticker: added.ticker }, '', location.hash); } catch { /* preview frames */ }
}

// ---------- The add / edit sheet ----------

const sheet = $('#sheet');
const backdrop = $('#backdrop');
const deleteBtn = $('#delete-btn');
let lastFocus = null;
let deleteTimer = null;

function openSheet(idea = null) {
  state.editingId = idea ? idea.id : null;
  state.form.conviction = idea ? idea.conviction : 3;
  state.form.status = idea && idea.status === 'own' ? 'own' : 'watching';

  $('#sheet-title').textContent = idea ? `Edit ${idea.ticker}` : 'New Idea';
  $('#f-ticker').value = idea ? idea.ticker : '';
  $('#f-company').value = idea ? idea.company : '';
  $('#f-thesis').value = idea ? idea.thesis : '';
  $('#f-bull').value = idea ? idea.bull : '';
  $('#f-bear').value = idea ? idea.bear : '';
  $('#f-target').value = idea && idea.target != null ? idea.target : '';
  $('#f-entry').value = idea && idea.entry != null ? idea.entry : '';
  $('#form-error').hidden = true;
  deleteBtn.hidden = !idea;
  resetDelete();
  renderConviction();
  renderStatus();
  updateSaveButton();

  lastFocus = document.activeElement;
  sheet.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add('sheet-open');
  sheet.querySelector('.sheet-body').scrollTop = 0;
  sheet.getBoundingClientRect(); // lets the browser see the "before" position so it animates
  sheet.classList.add('open');
  backdrop.classList.add('open');

  // On a computer, jump straight into the ticker box for new ideas
  if (!idea && matchMedia('(pointer: fine)').matches) $('#f-ticker').focus({ preventScroll: true });
}

function closeSheet() {
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  document.body.classList.remove('sheet-open');
  lastFocus?.focus?.({ preventScroll: true });
  // Wait for the slide-down to finish before hiding it completely
  return new Promise((resolve) => {
    setTimeout(() => {
      sheet.hidden = true;
      backdrop.hidden = true;
      resolve();
    }, reduceMotion.matches ? 0 : 290);
  });
}

function isSheetOpen() {
  return sheet.classList.contains('open');
}

// Conviction: five tappable dots
const dotsInput = sheet.querySelector('.dots-input');
dotsInput.innerHTML = [1, 2, 3, 4, 5]
  .map((n) => `<button type="button" role="radio" data-level="${n}" aria-label="${n}: ${CONVICTION_WORDS[n - 1]}"><i></i></button>`)
  .join('');

function renderConviction() {
  for (const button of dotsInput.querySelectorAll('button')) {
    const level = Number(button.dataset.level);
    button.classList.toggle('on', level <= state.form.conviction);
    button.setAttribute('aria-checked', String(level === state.form.conviction));
  }
  $('#conviction-word').textContent = CONVICTION_WORDS[state.form.conviction - 1];
}

function renderStatus() {
  const control = $('#f-status');
  control.style.setProperty('--i', state.form.status === 'own' ? 1 : 0);
  for (const button of control.querySelectorAll('button')) {
    button.setAttribute('aria-checked', String(button.dataset.status === state.form.status));
  }
}

function updateSaveButton() {
  $('#save-btn').disabled = $('#f-ticker').value.trim() === '';
}

// Read the form. Returns the fields, or null (and shows a message) if something's off.
function readForm() {
  const targetText = $('#f-target').value;
  const entryText = $('#f-entry').value;
  const target = parsePrice(targetText);
  const entry = parsePrice(entryText);
  const ticker = $('#f-ticker').value.trim().toUpperCase();

  let problem = '';
  if (ticker === '') problem = 'Add a ticker first, like AAPL.';
  else if (!/^[A-Z0-9.\-:^=/]{1,15}$/.test(ticker)) problem = 'Pick a stock from the suggestions, or type just its ticker (like AAPL).';
  else if (targetText.trim() && target === null) problem = 'Target price should be a number, like 185.50.';
  else if (entryText.trim() && entry === null) problem = 'Price when added should be a number, like 172.10.';

  const error = $('#form-error');
  error.hidden = !problem;
  error.textContent = problem;
  if (problem) return null;

  return {
    ticker,
    company: $('#f-company').value.trim(),
    thesis: $('#f-thesis').value.trim(),
    bull: $('#f-bull').value.trim(),
    bear: $('#f-bear').value.trim(),
    target,
    entry,
    conviction: state.form.conviction,
    status: state.form.status,
  };
}

function resetDelete() {
  clearTimeout(deleteTimer);
  deleteBtn.classList.remove('confirm');
  deleteBtn.textContent = 'Delete Idea';
}

// ---------- Wiring up taps, clicks and keys ----------

$('#add-btn').addEventListener('click', () => openSheet());

$('#filters').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button || button.dataset.filter === state.filter) return;
  state.filter = button.dataset.filter;
  withTransition(() => render());
  if (state.mode === 'compare') startCompare();
});

$('#view-mode').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-mode]');
  if (!button || button.dataset.mode === state.mode) return;
  state.mode = button.dataset.mode;
  savePrefs();
  render();
  if (state.mode === 'compare') startCompare(); else stopCompare();
});

$('#sort').addEventListener('change', (event) => {
  state.sort = event.target.value;
  state.sortDir = state.sort === 'ticker' ? 1 : -1;
  savePrefs();
  withTransition(() => render());
});

$('#list').addEventListener('click', (event) => {
  if (event.target.closest('[data-action="add"]')) return openSheet();
  const sort = event.target.closest('[data-sort]');
  if (sort) {
    const key = sort.dataset.sort;
    const current = state.sort === 'newest' ? 'app' : state.sort;
    state.sortDir = key === current ? -state.sortDir : key === 'ticker' ? 1 : -1;
    state.sort = key;
    savePrefs();
    return render();
  }
  const card = event.target.closest('.card, tr[data-id]');
  if (card) openStock(state.ideas.find((i) => i.id === card.dataset.id));
});

$('#list').addEventListener('keydown', (event) => {
  const card = event.target.closest('.card, tr[data-id]');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openStock(state.ideas.find((i) => i.id === card.dataset.id));
  }
});

dotsInput.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  state.form.conviction = Number(button.dataset.level);
  renderConviction();
});

$('#f-status').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-status]');
  if (!button) return;
  state.form.status = button.dataset.status;
  renderStatus();
});

// Tickers: capitals, plus the symbols some markets use (BRK.B, BTC-USD, ^GSPC, EURUSD=X).
// Spaces are allowed while you type a company name to search for.
$('#f-ticker').addEventListener('input', (event) => {
  const input = event.target;
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9.\-:^=/ &']/g, '');
  updateSaveButton();
});

// Suggestions under the Ticker field
attachSearch($('#f-ticker'), $('#ticker-results'), {
  onPick: (r) => {
    $('#f-ticker').value = r.symbol;
    if (!$('#f-company').value.trim() || state.editingId === null) $('#f-company').value = r.name;
    updateSaveButton();
    $('#f-thesis').focus({ preventScroll: true });
  },
});

// The search box: open any stock, on your list or not
const onList = (q) => {
  const lower = q.trim().toLowerCase();
  return state.ideas
    .filter((i) => i.ticker.toLowerCase().startsWith(lower) || i.company.toLowerCase().includes(lower))
    .slice(0, 3)
    .map((i) => ({ symbol: i.ticker, name: i.company || i.ticker, tag: i.status === 'closed' ? 'Closed' : 'On your list' }));
};
attachSearch($('#search'), $('#search-results'), {
  extra: onList,
  onPick: (r) => {
    $('#search').value = '';
    $('#search').blur();
    openTicker(r.symbol, r.name);
  },
});
$('#search').addEventListener('keydown', (event) => {
  // Return with no suggestion picked: open what you typed as a ticker
  const value = event.target.value.trim().toUpperCase();
  if (event.key === 'Enter' && /^[A-Z0-9.\-:^=/]{1,15}$/.test(value) && !event.target.getAttribute('aria-activedescendant')) {
    event.target.value = '';
    event.target.blur();
    openTicker(value, '');
  }
});

$('#cancel-btn').addEventListener('click', () => closeSheet());
backdrop.addEventListener('click', () => closeSheet());

sheet.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fields = readForm();
  if (!fields) return;

  let saved;
  if (state.editingId) {
    const index = state.ideas.findIndex((i) => i.id === state.editingId);
    // Editing a sample makes it yours, so the "Sample" tag goes away
    saved = applyEdit(state.ideas[index], fields);
    state.ideas[index] = saved;
  } else {
    saved = createIdea(fields);
    state.ideas.unshift(saved);
  }
  persist();
  state.filter = fields.status; // jump to the tab where the idea now lives

  await closeSheet();
  if (state.openStockId === saved.id) {
    state.openIdea = saved;
    refreshIdea(saved);
  } else {
    withTransition(() => render());
  }
});

// Delete needs two taps, so you can't lose an idea by accident
deleteBtn.addEventListener('click', async () => {
  if (!deleteBtn.classList.contains('confirm')) {
    deleteBtn.classList.add('confirm');
    deleteBtn.textContent = 'Tap Again to Delete';
    deleteTimer = setTimeout(resetDelete, 3000);
    return;
  }
  const id = state.editingId;
  deleteIdea(id);
  await closeSheet();
  if (state.openStockId === id) goBack();
  else withTransition(() => render());
});

// ---------- Keyboard shortcuts (on a computer) ----------

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isSheetOpen()) return closeSheet();
  const typing = event.target.closest?.('input, textarea, select, [contenteditable]');
  if (typing || event.metaKey || event.ctrlKey || event.altKey || isSheetOpen()) return;
  if (event.key === 'Escape' && state.openStockId) return goBack();
  if (event.key === '/' && !state.openStockId) {
    event.preventDefault();
    $('#search').focus();
    return;
  }
  if (event.key.toLowerCase() === 'n' && !state.openStockId) {
    event.preventDefault();
    return openSheet();
  }
  if (/^[1-9]$/.test(event.key) && state.openStockId) selectTab(Number(event.key));
});

// ---------- The stock page ----------

function openStock(idea, { remember = true, tab } = {}) {
  if (!idea) return;
  stopCompare();
  if (!state.openStockId) state.listScroll = window.scrollY;
  state.openStockId = idea.id;
  state.openIdea = idea;
  withTransition(() => {
    $('#list-view').hidden = true;
    $('#stock-view').hidden = false;
    openStockPage($('#stock-view'), idea, {
      tab,
      onEdit: (i) => openSheet(i),
      onBack: goBack,
      onRated: saveRatings,
      onChange: replaceIdea,
      onAdd: addFromPage,
      onOpenTicker: openTicker,
    });
    window.scrollTo(0, 0);
  });
  // Let the browser's back button (and swipe-back on iPhone) return to the list
  if (remember) {
    try {
      history.pushState({ stock: idea.id, ticker: idea.ticker }, '', `#${encodeURIComponent(idea.ticker)}`);
      state.usedHistory = true;
    } catch {
      state.usedHistory = false;
    }
  }
}

// Open any ticker: your idea if it's on your list, otherwise a look-only page
function openTicker(symbol, name = '', options) {
  const ticker = symbol.toUpperCase();
  const existing = state.ideas.find((i) => i.ticker === ticker && i.status !== 'closed') ?? state.ideas.find((i) => i.ticker === ticker);
  openStock(existing ?? createIdea({ ticker, company: name, transient: true }), options);
}

// Remember the latest ratings on the idea (shown on its card and in Compare)
function saveRatings(id, ratings) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  idea.ratings = ratings;
  persist();
}

function closeStock() {
  if (!state.openStockId) return;
  state.openStockId = null;
  state.openIdea = null;
  withTransition(() => {
    closeStockPage();
    $('#stock-view').hidden = true;
    $('#stock-view').innerHTML = '';
    $('#list-view').hidden = false;
    render();
    window.scrollTo(0, state.listScroll);
  });
  if (state.mode === 'compare') startCompare();
  refreshToday();
}

function goBack() {
  if (state.usedHistory && history.state?.stock) history.back();
  else closeStock();
}

window.addEventListener('popstate', (event) => {
  const id = event.state?.stock;
  if (id && id !== state.openStockId) {
    const idea = state.ideas.find((i) => i.id === id);
    if (idea) openStock(idea, { remember: false });
    else if (event.state.ticker) openTicker(event.state.ticker, '', { remember: false });
  } else if (!id) {
    closeStock();
  }
});

// ---------- Compare: analyze stocks in the background ----------

function startCompare() {
  stopCompare();
  const control = new AbortController();
  state.comparing = control;
  refreshStale(state.ideas.filter((i) => i.status === state.filter), {
    signal: control.signal,
    onStart: (ticker) => { state.analyzing = ticker; if (!state.openStockId && state.mode === 'compare') render(); },
    onDone: (idea, snap) => { saveRatings(idea.id, snap); if (!state.openStockId && state.mode === 'compare') render(); },
  });
}
function stopCompare() {
  state.comparing?.abort();
  state.comparing = null;
  state.analyzing = null;
}

// ---------- Today ----------

let marketAt = 0;
async function refreshToday({ force = false } = {}) {
  if (!$('#today-card').open || state.openStockId) return;
  if (!force && Date.now() - marketAt < 110_000) return renderToday();
  marketAt = Date.now();
  const symbols = [...new Set(state.ideas.filter((i) => i.status !== 'closed').map((i) => i.ticker))];
  state.market = await loadMarket(symbols);
  renderToday();
}

function renderToday() {
  $('#today-body').innerHTML = todayHTML(state.market, { ideas: state.ideas, quotes: liveQuotes() });
  $('#today-updated').textContent = state.market?.data?.at ? `Updated ${f.ago(state.market.data.at)}` : '';
}
const liveQuotes = () => new Map([...state.quotes].filter(([, q]) => !q.demo));

$('#today-card').addEventListener('toggle', () => {
  savePrefs();
  if ($('#today-card').open) refreshToday();
});
$('#today-body').addEventListener('click', (event) => {
  const row = event.target.closest('[data-open]');
  if (row) openStock(state.ideas.find((i) => i.id === row.dataset.open), { tab: row.dataset.tab });
});

// ---------- Data connections: is each key working? ----------

const SERVICES = [
  ['finnhub', 'Finnhub', 'Prices, stats, analysts, earnings, insiders, news, search'],
  ['twelvedata', 'Twelve Data', 'Charts and technicals'],
  ['sec', 'SEC EDGAR', 'Financial statements and filings'],
  ['mac', 'Mac AI (Ollama)', 'Writes the research notes'],
  ['notes', 'Sync', 'Your journal and research notes on every device'],
  ['gemini', 'Gemini', 'Optional cloud AI (18+)'],
  ['passcode', 'Passcode', 'Keeps strangers out'],
];

async function checkConnections() {
  const body = $('#conn-body');
  body.innerHTML = '<p class="muted-line"><span class="spinner"></span>Checking each connection…</p>';
  let res;
  try {
    res = await fetch('/api/status', { headers: { Accept: 'application/json', ...passcodeHeaders() } });
  } catch {
    res = null;
  }
  if (!res || !(res.headers.get('content-type') || '').includes('json')) {
    body.innerHTML = '<p class="muted-line">Available once the app is on Vercel. Setup steps: docs/SETUP.md in your GitHub repo.</p>';
    return;
  }
  const status = await res.json().catch(() => ({}));
  // On a computer, also check the AI running on this Mac
  if (isComputer()) {
    const d = await diagnoseLocalAI();
    status.mac = {
      ok: { status: 'ok', message: d.models ? `Using ${d.models[0]}` : '' },
      'no-model': { status: 'missing', message: 'Ollama is running but has no model. In Terminal: ollama pull qwen3:14b' },
      origin: { status: 'rejected', message: "Ollama doesn't accept this app's address yet. Use “Set up Mac AI” below." },
      unreachable: { status: 'error', message: 'Not answering. Is Ollama open? Then use “Set up Mac AI” below.' },
    }[d.status];
  }
  if (status.error === 'locked') {
    body.innerHTML = '<p class="muted-line">Open any stock and enter your passcode first, then check again.</p>';
    return;
  }
  const icon = { ok: '✓', missing: '○', optional: '○', rejected: '✗', error: '!' };
  body.innerHTML = `<ul class="conn-list">${SERVICES.map(([key, name, what]) => {
    if (key === 'mac' && !status.mac) return ''; // phones don't run the AI
    const s = status[key] ?? { status: 'error', message: 'No answer.' };
    return `<li class="conn ${s.status}"><span class="conn-icon">${icon[s.status] ?? '!'}</span>
      <div><p class="conn-name">${name} <span class="muted">· ${what}</span></p>
      ${s.message ? `<p class="muted-line">${esc(s.message)}</p>` : ''}</div></li>`;
  }).join('')}</ul>
  <button type="button" class="text-btn small" id="conn-again">Check again</button>
  ${status.mac ? `<details class="mac-setup"><summary>Set up Mac AI (one time)</summary>
    <p class="muted-line">Paste this into Terminal once. After that the AI keeps working, even after restarts.</p>
    ${setupCopyBox(macSetupCommand([status.productionUrl ? `https://${status.productionUrl}` : null, location.origin]))}
  </details>` : ''}`;
  $('#batch-box').hidden = status.mac?.status !== 'ok';
  if (status.mac?.status === 'ok') renderBatch();
  if (status.notes?.status === 'ok') syncNow();
}

$('#connections').addEventListener('toggle', (event) => {
  if (event.target.open) checkConnections();
});
$('#conn-body').addEventListener('click', (event) => {
  if (event.target.id === 'conn-again') checkConnections();
  const copy = event.target.closest('[data-action="copy"]');
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copy).then(
      () => { copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy'), 1500); },
      () => { copy.textContent = 'Copy failed'; },
    );
  }
});

// ---------- Write notes for the whole watchlist (Mac) ----------

const batch = { control: null, progress: null, error: null };

function renderBatch() {
  const box = $('#batch-box');
  const p = batch.progress;
  const open = state.ideas.filter((i) => i.status !== 'closed').length;
  if (batch.control) {
    const pct = p?.chars ? ` · ${Math.min(99, Math.round((p.chars / 7000) * 100))}%` : '';
    const width = p ? Math.round(((p.done + Math.min(1, (p.chars ?? 0) / 7000)) / Math.max(1, p.total)) * 100) : 2;
    box.innerHTML = `<p class="conn-name">Writing research notes</p>
      <p class="muted-line"><span class="spinner"></span>${p?.ticker ? `${esc(p.ticker)} (${p.done + 1} of ${p.total})${pct}` : 'Starting…'}</p>
      <div class="batch-bar"><span style="width:${width}%"></span></div>
      <button type="button" class="text-btn small" id="batch-stop">Stop</button>`;
    return;
  }
  const fresh = p?.finished ? p.done - p.skipped : 0;
  const summary = p?.finished
    ? `Done: ${fresh} new note${fresh === 1 ? '' : 's'}${p.skipped ? `, ${p.skipped} already fresh` : ''}.`
    : batch.error ?? '';
  box.innerHTML = `<p class="conn-name">Research your whole watchlist <span class="muted">· on this Mac</span></p>
    <p class="muted-line">Writes an AI note for each of your ${open} open ideas, one after another (about a minute each). Stocks with a note from the last 24 hours are skipped. Notes sync to your phone.</p>
    ${summary ? `<p class="muted-line">${esc(summary)}</p>` : ''}
    <button type="button" class="btn-primary small" id="batch-start"${open ? '' : ' disabled'}>Write All Notes</button>`;
}

$('#batch-box').addEventListener('click', async (event) => {
  if (event.target.id === 'batch-stop') return batch.control?.abort();
  if (event.target.id !== 'batch-start') return;
  batch.control = new AbortController();
  batch.error = null;
  batch.progress = null;
  renderBatch();
  try {
    await writeAllNotes(state.ideas, {
      signal: batch.control.signal,
      onProgress: (p) => { batch.progress = p; renderBatch(); },
      onNote: (idea, entry, snap) => saveRatings(idea.id, snap),
    });
  } catch (err) {
    batch.error = err.name === 'AbortError' || err.code === 'cancelled' ? 'Stopped.' : err.message;
    batch.progress = null;
  }
  batch.control = null;
  renderBatch();
  if (!state.openStockId) render();
});

// ---------- Backup: export and import ----------

$('#export-btn').addEventListener('click', () => {
  const file = new Blob([exportJournal({ ideas: state.ideas, deleted: state.deleted })], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = `thesis-journal-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  $('#backup-msg').textContent = `Exported ${state.ideas.length} ideas.`;
});
$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const backup = parseBackup(await file.text());
    // Merge, so importing never throws away something newer on this device
    const merged = mergeJournals({ ideas: state.ideas, deleted: state.deleted }, backup);
    state.ideas = merged.ideas;
    state.deleted = merged.deleted;
    persist();
    render();
    $('#backup-msg').textContent = `Imported. You now have ${state.ideas.length} ideas.`;
  } catch (err) {
    $('#backup-msg').textContent = err.message;
  }
});

// ---------- The top bar that fades in when you scroll ----------

new IntersectionObserver(
  ([entry]) => $('#topbar').classList.toggle('scrolled', !entry.isIntersecting),
  { rootMargin: '-44px 0px 0px 0px' },
).observe($('#big-title'));

// ---------- Keeping things fresh ----------

// Prices every minute and the Today card every two, while you're looking
setInterval(() => {
  if (document.visibilityState !== 'visible' || state.openStockId) return;
  fillPrices(state.ideas.filter((i) => i.status === state.filter), { fresh: true });
  refreshToday();
  showSaveStatus();
}, 60_000);

let lastVisibleSync = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Coming back to the app (e.g. after using your other device): pick up changes
  if (Date.now() - lastVisibleSync > 20_000) {
    lastVisibleSync = Date.now();
    syncNow();
  }
  refreshToday();
});

// ---------- Start ----------

$('#date-line').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
$('#today-card').open = prefs.today ?? true;
document.body.classList.toggle('computer', isComputer());
if (!state.canSave) { state.sync.status = 'cant-save'; showSaveStatus(); }
render({ animateIn: true });
if ($('#today-card').open) { renderToday(); refreshToday({ force: true }); }
syncNow();
if (state.mode === 'compare') startCompare();

// Opening a link like ...#NVDA goes straight to that stock (on your list or not)
const fromLink = decodeURIComponent(location.hash.slice(1)).toUpperCase();
if (/^[A-Z0-9.\-:^=/]{1,15}$/.test(fromLink)) {
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* preview frames can block this */ }
  openTicker(fromLink);
}
