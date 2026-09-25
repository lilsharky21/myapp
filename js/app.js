// ==========================================================================
// app.js: what you see and tap.
// Draws the cards, runs the Watching / Own / Closed switch,
// and opens the sheet for adding or editing an idea.
// ==========================================================================

import { loadIdeas, saveIdeas, createIdea, parsePrice, CONVICTION_WORDS } from './journal.js';
import { openStockPage, closeStockPage, refreshIdea } from './stock.js';
import { getQuote } from './api.js';
import * as f from './format.js';

// Shortcut: $('#list') finds the element with id="list"
const $ = (selector) => document.querySelector(selector);

// ---------- The app's memory while it's open ----------

const loaded = loadIdeas();
const state = {
  ideas: loaded.ideas,          // every idea, newest first
  canSave: loaded.canSave,      // false if the browser blocks saving
  filter: 'watching',           // which tab is showing
  editingId: null,              // the idea being edited (null = adding a new one)
  form: { conviction: 3, status: 'watching' },
  openStockId: null,            // the stock page that's open (null = watchlist)
  listScroll: 0,                // where you were in the list, to come back to
  usedHistory: false,           // whether the browser's back button knows about the stock page
};

const FILTERS = ['watching', 'own', 'closed'];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- Drawing the list of cards ----------

function render({ animateIn = false } = {}) {
  // Update the switch: counts, and slide the highlight to the chosen tab
  const filters = $('#filters');
  filters.style.setProperty('--i', FILTERS.indexOf(state.filter));
  for (const button of filters.querySelectorAll('button')) {
    const f = button.dataset.filter;
    button.setAttribute('aria-selected', String(f === state.filter));
    button.querySelector('.count').textContent = state.ideas.filter((i) => i.status === f).length;
  }

  const shown = state.ideas.filter((idea) => idea.status === state.filter);
  $('#list').innerHTML = shown.length
    ? shown.map((idea, k) => cardHTML(idea, k, animateIn)).join('')
    : emptyHTML(state.filter);
  fillPrices(shown);
}

// Live prices on the cards. Only real prices are shown here, never demo ones.
function fillPrices(ideas) {
  for (const idea of ideas) {
    getQuote(idea.ticker).then((result) => {
      if (result.status !== 'live') return;
      const el = document.querySelector(`[data-price-for="${CSS.escape(idea.ticker)}"]`);
      if (!el) return;
      const q = result.data;
      el.innerHTML = `${f.price(q.price)} <span class="${f.tone(q.changePct)}">${f.pct(q.changePct)}</span>`;
    });
  }
}

function cardHTML(idea, k, animateIn) {
  const upside = idea.target != null && idea.entry > 0
    ? ((idea.target - idea.entry) / idea.entry) * 100
    : null;
  const upsideHTML = upside === null
    ? '<span class="muted">—</span>'
    : `<span class="${upside >= 0 ? 'up' : 'down'}">${upside >= 0 ? '+' : '−'}${Math.abs(upside).toFixed(1)}%</span>`;
  const showCompany = idea.company || idea.sample;

  return `
    <article class="card${animateIn ? ' enter' : ''}" data-id="${idea.id}" tabindex="0" role="button"
             aria-label="Open ${esc(idea.ticker)}" style="--k:${k}; view-transition-name:${idea.id}">
      <div class="card-top">
        <div>
          <h3 class="ticker">${esc(idea.ticker)}</h3>
          ${showCompany ? `<p class="company">${esc(idea.company)}${idea.sample ? '<span class="tag">Sample</span>' : ''}</p>` : ''}
        </div>
        <div class="card-right">
          ${dotsHTML(idea.conviction)}
          <p class="card-price" data-price-for="${esc(idea.ticker)}"></p>
        </div>
      </div>
      <p class="thesis${idea.thesis ? '' : ' empty'}">${esc(idea.thesis || 'No thesis yet. Tap to write one.')}</p>
      <dl class="meta">
        <div><dt>Target</dt><dd>${idea.target != null ? money.format(idea.target) : '<span class="muted">—</span>'}</dd></div>
        <div><dt>Upside</dt><dd>${upsideHTML}</dd></div>
        <div><dt>Added</dt><dd>${shortDate.format(new Date(idea.createdAt))}</dd></div>
      </dl>
    </article>`;
}

function dotsHTML(level) {
  const dots = [1, 2, 3, 4, 5].map((n) => `<span class="dot${n <= level ? ' on' : ''}"></span>`).join('');
  return `<div class="dots" role="img" aria-label="Conviction ${level} of 5: ${CONVICTION_WORDS[level - 1]}">${dots}</div>`;
}

function emptyHTML(filter) {
  if (filter === 'closed') {
    return `<div class="empty-state">
      <h3>No closed positions yet</h3>
      <p>When you close a position, it lands here with your verdict on whether you called it.</p>
    </div>`;
  }
  const what = filter === 'own' ? 'Nothing marked as owned' : 'Your watchlist is empty';
  return `<div class="empty-state">
    <h3>${what}</h3>
    <p>Add a stock and write down why. Future you will want to know.</p>
    <button type="button" class="text-btn strong" data-action="add">Add a Stock</button>
  </div>`;
}

// Makes text safe to put inside HTML (so a "<" in a note can't break the page)
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Animate cards to their new spots (in browsers that support it)
function withTransition(update) {
  if (!document.startViewTransition || reduceMotion.matches) return update();
  document.startViewTransition(update);
}

// ---------- Saving ----------

function persist() {
  const ok = state.canSave && saveIdeas(state.ideas);
  const note = $('#storage-note');
  note.classList.toggle('warn', !ok);
  note.textContent = ok
    ? 'Saved on this device.'
    : "This browser isn't letting the app save. Your changes will disappear when you close it.";
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

  let problem = '';
  if ($('#f-ticker').value.trim() === '') problem = 'Add a ticker first, like AAPL.';
  else if (targetText.trim() && target === null) problem = 'Target price should be a number, like 185.50.';
  else if (entryText.trim() && entry === null) problem = 'Price when added should be a number, like 172.10.';

  const error = $('#form-error');
  error.hidden = !problem;
  error.textContent = problem;
  if (problem) return null;

  return {
    ticker: $('#f-ticker').value.trim().toUpperCase(),
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
});

$('#list').addEventListener('click', (event) => {
  if (event.target.closest('[data-action="add"]')) return openSheet();
  const card = event.target.closest('.card');
  if (card) openStock(state.ideas.find((i) => i.id === card.dataset.id));
});

$('#list').addEventListener('keydown', (event) => {
  const card = event.target.closest('.card');
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

// Tickers: capitals only, plus the symbols some markets use (BRK.B, BTC-USD, ^GSPC, EURUSD=X)
$('#f-ticker').addEventListener('input', (event) => {
  const input = event.target;
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9.\-:^=/]/g, '');
  updateSaveButton();
});

$('#cancel-btn').addEventListener('click', () => closeSheet());
backdrop.addEventListener('click', () => closeSheet());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isSheetOpen()) closeSheet();
});

sheet.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fields = readForm();
  if (!fields) return;

  let saved;
  if (state.editingId) {
    const index = state.ideas.findIndex((i) => i.id === state.editingId);
    // Editing a sample makes it yours, so the "Sample" tag goes away
    saved = { ...state.ideas[index], ...fields, sample: false, updatedAt: new Date().toISOString() };
    state.ideas[index] = saved;
  } else {
    saved = createIdea(fields);
    state.ideas.unshift(saved);
  }
  persist();
  state.filter = fields.status; // jump to the tab where the idea now lives

  await closeSheet();
  if (state.openStockId === saved.id) refreshIdea(saved);
  else withTransition(() => render());
});

// Delete needs two taps, so you can't lose an idea by accident
deleteBtn.addEventListener('click', async () => {
  if (!deleteBtn.classList.contains('confirm')) {
    deleteBtn.classList.add('confirm');
    deleteBtn.textContent = 'Tap Again to Delete';
    deleteTimer = setTimeout(resetDelete, 3000);
    return;
  }
  state.ideas = state.ideas.filter((i) => i.id !== state.editingId);
  persist();
  await closeSheet();
  if (state.openStockId === state.editingId) goBack();
  else withTransition(() => render());
});

// ---------- The stock page ----------

function openStock(idea, { remember = true } = {}) {
  if (!idea) return;
  state.listScroll = window.scrollY;
  state.openStockId = idea.id;
  withTransition(() => {
    $('#list-view').hidden = true;
    $('#stock-view').hidden = false;
    openStockPage($('#stock-view'), idea, { onEdit: (i) => openSheet(i), onBack: goBack });
    window.scrollTo(0, 0);
  });
  // Let the browser's back button (and swipe-back on iPhone) return to the list
  if (remember) {
    try {
      history.pushState({ stock: idea.id }, '', `#${encodeURIComponent(idea.ticker)}`);
      state.usedHistory = true;
    } catch {
      state.usedHistory = false;
    }
  }
}

function closeStock() {
  if (!state.openStockId) return;
  state.openStockId = null;
  withTransition(() => {
    closeStockPage();
    $('#stock-view').hidden = true;
    $('#stock-view').innerHTML = '';
    $('#list-view').hidden = false;
    render();
    window.scrollTo(0, state.listScroll);
  });
}

function goBack() {
  if (state.usedHistory && history.state?.stock) history.back();
  else closeStock();
}

window.addEventListener('popstate', (event) => {
  const id = event.state?.stock;
  if (id && id !== state.openStockId) openStock(state.ideas.find((i) => i.id === id), { remember: false });
  else if (!id) closeStock();
});

// ---------- The top bar that fades in when you scroll ----------

new IntersectionObserver(
  ([entry]) => $('#topbar').classList.toggle('scrolled', !entry.isIntersecting),
  { rootMargin: '-44px 0px 0px 0px' },
).observe($('#big-title'));

// ---------- Start ----------

$('#today').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
if (!state.canSave) persist(); // shows the "can't save" warning right away
render({ animateIn: true });

// Opening a link like ...#NVDA goes straight to that stock
const fromLink = decodeURIComponent(location.hash.slice(1)).toUpperCase();
const linked = fromLink && state.ideas.find((i) => i.ticker === fromLink);
if (linked) {
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* preview frames can block this */ }
  openStock(linked);
}
