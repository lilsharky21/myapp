// ==========================================================================
// batch.js: "Write notes for my whole watchlist" on the Mac.
// Goes through your ideas one at a time, skips stocks that already have a
// note from the last 24 hours, and saves each note (it syncs to your phone).
// ==========================================================================

import { loadAndAnalyze, researchBundle, snapshot } from './analysis.js';
import { runResearch, savedResearch } from './ai.js';

// onProgress({ done, total, ticker, chars, skipped }) ; onNote(idea, entry, snapshot)
export async function writeAllNotes(ideas, { signal, onProgress, onNote }) {
  const todo = ideas.filter((i) => i.status !== 'closed');
  let done = 0;
  let skipped = 0;
  for (const idea of todo) {
    if (signal.aborted) break;
    if (savedResearch(idea.ticker)) { skipped++; done++; continue; }
    onProgress({ done, total: todo.length, ticker: idea.ticker, chars: 0, skipped });
    const { data, derived, demo } = await loadAndAnalyze(idea.ticker, { withNews: true });
    const bundle = researchBundle({
      idea, q: data.quote, fund: data.fund, fin: data.fin, news: data.news, peers: data.peers,
      ...derived, insidersLive: data.insidersLive, demo,
    });
    const entry = await runResearch(idea.ticker, bundle, {
      signal,
      onProgress: (chars) => onProgress({ done, total: todo.length, ticker: idea.ticker, chars, skipped }),
    });
    onNote(idea, entry, snapshot(derived, { quote: data.quote, fund: data.fund, aiRating: entry.result.rating, demo }));
    done++;
  }
  onProgress({ done, total: todo.length, ticker: null, chars: 0, skipped, finished: true });
}
