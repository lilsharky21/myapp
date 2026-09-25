# Thesis Journal

A personal stock research notebook. Every stock you're watching gets a card with
**why** you like it, what would prove you wrong, your target price, and how
convinced you are. Tap a card for the full picture across eight tabs:
Overview, Ratings, Technicals, Financials, Valuation, Earnings, Investors and News.

## Three ratings for every stock

| Rating | Where it comes from |
|---|---|
| **Wall Street** | The consensus of analysts covering the stock (Finnhub) |
| **App score** | 0–100 from seven graded factors (valuation, growth, profitability, financial health, momentum, earnings, sentiment). Every grade shows the numbers and rules behind it. See `js/ratings.js`. |
| **AI analyst** | An AI reads all the data on the page and gives its own rating, a view on each section, bull/bear points, risks and a check of *your* thesis. See `js/ai.js`. |

Each tab starts with a strip showing all three for that topic.

Until live data is connected, the stock pages show clearly labeled **demo numbers**.

## What's in here

| Folder / file | What it does |
|---|---|
| `index.html` | The structure of the page |
| `styles.css` | The whole look: colors, spacing, dark mode, animations |
| `js/app.js` | The watchlist, the add/edit sheet, moving between pages |
| `js/journal.js` | Saving and loading your ideas on this device |
| `js/stock.js` | The stock page: loads data, works out ratings, runs the AI |
| `js/tabs/` | One file per tab (overview, ratings, technicals, financials, valuation, earnings, investors, news) |
| `js/ratings.js` | The app score, Piotroski F-Score and Altman Z-Score |
| `js/valuation.js` | Discounted cash flow, reverse DCF, Graham number |
| `js/ai.js` | The AI analyst: picks an AI, builds the prompt, checks the answer |
| `js/ui.js` | Small shared pieces (rows, grades, the ratings strip) |
| `js/statement-math.js` | Margins, returns and growth from financial statements |
| `js/charts.js` | The price chart and the small bar/line charts |
| `js/indicators.js` | Technical analysis and risk math (moving averages, RSI, MACD, Bollinger Bands, ATR, beta, Sharpe, drawdowns, seasonality) |
| `js/api.js` | Gets data from the backend, or falls back to demo numbers |
| `js/demo.js` | The demo numbers |
| `js/format.js` | Turns numbers into "$1.2B", "+3.4%", "3h ago" |
| `api/` | The backend: small functions that run on Vercel and fetch market data |
| `lib/` | Shared backend code (Finnhub, SEC EDGAR, financial statements) |
| `tests/run.js` | Automatic checks: `npm test` |
| `vendor/` | TradingView's free chart library |

## Where the data comes from (all free)

| Data | Source | Key needed? |
|---|---|---|
| Financial statements, SEC filings | SEC EDGAR | No, just `SEC_USER_AGENT` |
| Price, company info, key stats, analysts, earnings, insiders, news | Finnhub | `FINNHUB_API_KEY` |
| Price history (charts and technicals) | Twelve Data | `TWELVEDATA_API_KEY` |
| AI on your phone | Google Gemini free tier | `GEMINI_API_KEY` |
| AI on your Mac | Ollama, running on the Mac itself | None |

## Put it online (Vercel)

1. Sign in at vercel.com with your GitHub account.
2. **Add New → Project**, pick this repository, and click **Deploy**. No settings to change.
3. In the project, open **Settings → Environment Variables** and add the names from
   `.env.example` with your keys. Then go to **Deployments** and redeploy.
4. Optional: add `APP_PASSCODE` so only you can use the app's data and AI.
5. Open the link on your iPhone and use Share → **Add to Home Screen**.

## Local AI on your Mac (free, private)

1. Install Ollama from ollama.com and open it.
2. In Terminal: `ollama pull qwen3:14b` (any model works; bigger is smarter but slower).
3. Let your app's web address talk to it:
   `launchctl setenv OLLAMA_ORIGINS "https://YOUR-APP.vercel.app"`, then quit and reopen Ollama.

When the app is open on the Mac it uses this automatically. On the phone it uses Gemini.

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
4. Go live on Vercel with real data
5. Journal extras: notes timeline, close a position with a verdict, backup/restore
6. Markets: indices, sectors, crypto, FX, commodities
7. Macro: rates, inflation, jobs, yield curve (FRED)
8. Polish + Add to Home Screen icon
