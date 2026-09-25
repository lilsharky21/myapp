# Thesis Journal

A personal stock research notebook. Every stock you're watching gets a card with
**why** you like it, what would prove you wrong, your target price, and how
convinced you are. Tap a card for the full picture across ten tabs:
Overview, Journal, Research, Ratings, Technicals, Financials, Valuation, Earnings,
Investors and News.

**Also:**
- **Today**: the big markets (S&P 500, Nasdaq, Dow, small caps, bonds, gold, oil, dollar, bitcoin, fear gauge), all 11 sectors, and what needs you: earnings coming up for your stocks, ideas due for a review, big moves, top headlines.
- **Search any stock** by name or ticker and research it without adding it. Peers on the Valuation tab open the same way.
- **Compare**: every idea in one sortable table (app score, Wall Street, AI, P/E, growth, DCF value, upside to your target, next earnings, conviction).
- **Journal tab**: dated notes stamped with the price that day, trades you made (your position, average cost and profit/loss), thesis changes, review reminders every 90 days, and closing an idea with a verdict, a lesson, and how it did against the S&P 500.
- **Sync**: the same watchlist and journal on your Mac and iPhone (through Blob storage in your own Vercel account), plus Export / Import backups.
- **Discover**: ready-made screens (Top rated, Quality at a fair price, Fast growers, Cheap vs. profits, Strong balance sheet, Beaten down but profitable, Dividend payers) across ~90 well-known US companies, each with a Quick score. Tap any result to research it.
- **Price alerts**: "tell me when it goes above / below X", with one-tap alerts at your target and key support/resistance levels.
- **How much should I buy?**: a position size calculator that keeps the loss at your stop to a set share of your account.
- **Your record** (Closed tab): how often you called it, average return vs. the S&P 500, best and worst calls, whether high-conviction ideas did better, and all your lessons.
- **Interest rates** in Today: US Treasury yields and the yield curve (free, from the Treasury, no key).
- **On the Mac**: write AI notes for your whole watchlist in one go, and keyboard shortcuts (`/` search, `N` new idea, `D` discover, `1`–`9` tabs, `Esc` back).
- **On the iPhone**: add it to the Home Screen and it runs full screen and opens offline (see docs/SETUP.md, step 9). Tap **Ask my Mac** for AI research: a small helper on your Mac writes the note in the background and it appears on your phone.

**New to picking stocks? Read [docs/PLAYBOOK.md](docs/PLAYBOOK.md): the routine this app is built around.**

## Three ratings for every stock

| Rating | Where it comes from |
|---|---|
| **Wall Street** | The consensus of analysts covering the stock (Finnhub) |
| **App score** | 0–100 from seven graded factors (valuation, growth, profitability, financial health, momentum, earnings, sentiment). Every grade shows the numbers and rules behind it. See `js/ratings.js`. |
| **AI analyst** | An AI reads all the data on the page and writes a research note for a beginner (the Research tab): bottom line and risk level, bear/base/bull scenarios, prices to watch, every section in plain English with "what it means for you", a before-you-buy checklist, what would change the view, a check of *your* thesis, questions to research next, and a glossary. See `js/ai.js` and `js/tabs/research.js`. |

Each tab starts with a strip showing all three for that topic.

Until live data is connected, the stock pages show clearly labeled **demo numbers**.

## What's in here

| Folder / file | What it does |
|---|---|
| `index.html` | The structure of the page |
| `styles.css` | The whole look: colors, spacing, dark mode, animations |
| `js/app.js` | The watchlist, search, Today, Compare, the add/edit sheet, sync, backup, moving between pages |
| `js/journal.js` | Your ideas and journal: notes, trades, positions, reviews, closing, merging copies from two devices, backups |
| `js/sync.js` | Keeps your journal the same on every device |
| `js/analysis.js` | Turns a stock's data into the ratings and the AI's reading material (shared by the stock page, Compare and batch notes) |
| `js/today.js` | The Today card |
| `js/compare.js` | The Compare table |
| `js/search.js` | Stock search |
| `js/batch.js` | Writing AI notes for the whole watchlist |
| `js/screen.js`, `js/universe.js` | Discover: the screener, its Quick score and the list of stocks |
| `js/record.js` | "Your record" on the Closed tab |
| `js/tabs/sizer.js` | The position size calculator |
| `js/install.js`, `sw.js` | Home Screen tip and offline support |
| `api/_routes/jobs.js` | The Mac's to-do list: notes your phone asked for, prepared for the Mac's AI |
| `lib/blob.js` | Your private storage (journal, notes, the Mac's to-do list) |
| `js/stock.js` | The stock page: loads data, works out ratings, runs the AI |
| `js/tabs/` | One file per tab (overview, journal, research, ratings, technicals, financials, valuation, earnings, investors, news) |
| `js/ratings.js` | The app score, Piotroski F-Score and Altman Z-Score |
| `js/valuation.js` | Discounted cash flow, reverse DCF, Graham number |
| `js/research.js` | Scenario values and price levels for the research note (worked out by the app, not the AI) |
| `js/ai.js` | The AI analyst: picks an AI, builds the prompt, checks the answer |
| `js/ui.js` | Small shared pieces (rows, grades, the ratings strip) |
| `js/statement-math.js` | Margins, returns and growth from financial statements |
| `js/charts.js` | The price chart and the small bar/line charts |
| `js/indicators.js` | Technical analysis and risk math (moving averages, RSI, MACD, Bollinger Bands, ATR, beta, Sharpe, drawdowns, seasonality) |
| `js/api.js` | Gets data from the backend, or falls back to demo numbers |
| `js/demo.js` | The demo numbers |
| `js/format.js` | Turns numbers into "$1.2B", "+3.4%", "3h ago" |
| `api/router.js` | The whole backend as one Vercel function (the free plan allows 12 functions; this keeps it at 1). It sends each `/api/<name>` request to `api/_routes/<name>.js` |
| `api/_routes/` | Each backend endpoint: prices, history, fundamentals, financials, news, peers, search, market, rates, screener, sync, notes, the Mac's jobs, status |
| `lib/` | Shared backend code (Finnhub, SEC EDGAR, financial statements) |
| `tests/run.js` | Automatic checks: `npm test` |
| `vendor/` | TradingView's free chart library |

## Where the data comes from (all free)

| Data | Source | Key needed? |
|---|---|---|
| Financial statements, SEC filings | SEC EDGAR | No, just `SEC_USER_AGENT` |
| Price, company info, key stats, analysts, earnings, insiders, news | Finnhub | `FINNHUB_API_KEY` |
| Price history (charts and technicals) | Twelve Data | `TWELVEDATA_API_KEY` |
| AI analyst | Ollama, running on your Mac (free, private) | None |
| Journal and research notes on every device | Vercel Blob storage in your own account | `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` (added by Vercel when you connect Blob) |
| Interest rates (yield curve) | US Treasury | No |
| Optional cloud AI (18+) | Google Gemini free tier | `GEMINI_API_KEY` |

## Put it online (Vercel) and add your keys

**Step-by-step guide: [docs/SETUP.md](docs/SETUP.md).** It covers how to get each free key
(Finnhub, Twelve Data), setting up the AI on your Mac, syncing notes to your phone, and how to check it all works.

In short: import this repo on vercel.com, add the keys under Settings → Environment
Variables, redeploy, then open **Data connections** at the bottom of the watchlist to
see a ✓ for each service.

## Local AI on your Mac (free, private)

1. Install Ollama from ollama.com and open it.
2. In Terminal: `ollama pull qwen3:14b` (any model works; bigger is smarter but slower).
3. Let your app's web address talk to it:
   `launchctl setenv OLLAMA_ORIGINS "https://YOUR-APP.vercel.app"`, then quit and reopen Ollama.

When the app is open on the Mac it uses this automatically. Notes it writes sync to your phone through Vercel Blob (see docs/SETUP.md).

## Run it on your computer

Needs Node.js 20 or newer. In a terminal, inside this folder:

```
cp .env.example .env     # then put your keys in .env
npm run dev              # open http://localhost:3000
npm test                 # run the checks
```

## Roadmap

1. ✅ Journal: watchlist, add/edit sheet, saving
2. ✅ Deep stock page: chart, technicals, financials, earnings, investors, news, filings
3. ✅ Ratings (Wall Street, app score, AI analyst), valuation tab, peers, risk, health scores, passcode
4. ✅ Go live on Vercel with real data, AI on the Mac, Add to Home Screen icon
5. ✅ Journal: notes timeline, trades and positions, reviews, close with a verdict, sync, backup
6. ✅ Today: markets, sectors, your earnings, headlines · search · Compare
7. ✅ Discover screener, price alerts, position sizing, your record, rates and the yield curve, offline Home Screen app
