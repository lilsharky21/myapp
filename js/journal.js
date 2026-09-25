// ==========================================================================
// journal.js: everything about your saved ideas.
// It knows how to load them, save them, and create new ones.
// It doesn't know anything about how the page looks (that's app.js).
// ==========================================================================

// The name your data is saved under in the browser.
// "v1" lets us change the format later without breaking old saves.
const STORAGE_KEY = 'thesis-journal/v1';

// Load your ideas from this browser.
// Returns { ideas, firstVisit, canSave }.
export function loadIdeas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // Nothing saved yet: show a few examples so the app isn't empty.
      return { ideas: sampleIdeas(), firstVisit: true, canSave: true };
    }
    const data = JSON.parse(raw);
    return { ideas: Array.isArray(data.ideas) ? data.ideas : [], firstVisit: false, canSave: true };
  } catch {
    // Some browsers (private mode, blocked storage) refuse to save.
    // The app still works; it just forgets when you close it.
    return { ideas: sampleIdeas(), firstVisit: true, canSave: false };
  }
}

// Save all ideas. Returns true if it worked.
export function saveIdeas(ideas) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ideas }));
    return true;
  } catch {
    return false;
  }
}

// Make a brand-new idea from what you typed in the form.
export function createIdea(fields) {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    ticker: '',
    company: '',
    thesis: '',
    bull: '',
    bear: '',
    target: null,      // your target price (a number, or null if blank)
    entry: null,       // the price when you added it
    conviction: 3,     // 1 to 5
    status: 'watching',  // 'watching', 'own' or 'closed'
    notes: [],         // dated notes (coming in the next phase)
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

// Words for each conviction level, in the order 1 to 5.
export const CONVICTION_WORDS = ['Speculative', 'Low', 'Medium', 'High', 'Table-pounding'];

// Turn what someone typed ("$1,250.50") into a number (1250.5), or null if blank/invalid.
export function parsePrice(text) {
  const cleaned = String(text ?? '').replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// A short random id like "i-k3j9x2a". It starts with a letter so it's safe to use in CSS.
function makeId() {
  return 'i-' + Math.random().toString(36).slice(2, 9);
}

// Example ideas for your first visit. They're marked `sample` so the card shows a "Sample" tag.
// Prices are left blank on purpose: live prices arrive in phase 3.
function sampleIdeas() {
  return [
    createIdea({
      ticker: 'NVDA',
      company: 'NVIDIA',
      thesis: 'Data-center AI spending keeps compounding for years, not quarters.',
      bull: 'Cloud giants keep raising their capex plans, and CUDA keeps developers locked in.',
      bear: 'Big customers switch to their own chips, or a capex pause hits revenue fast.',
      conviction: 4,
      sample: true,
    }),
    createIdea({
      ticker: 'COST',
      company: 'Costco',
      thesis: 'The membership fee is the business. Renewals are the moat.',
      bull: 'Renewal rates stay high, fee hikes stick, and new warehouses keep opening.',
      bear: 'The valuation already assumes perfection. Any slowdown gets punished.',
      conviction: 3,
      sample: true,
    }),
    createIdea({
      ticker: 'AAPL',
      company: 'Apple',
      thesis: 'Services become a bigger share of profit every year.',
      bull: 'The installed base keeps growing, and services carry much higher margins than hardware.',
      bear: 'Regulators force lower App Store fees.',
      conviction: 3,
      status: 'own',
      sample: true,
    }),
  ];
}
