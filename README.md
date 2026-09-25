# Thesis Journal

A personal stock research notebook. Every stock you're watching gets a card with
**why** you like it, what would prove you wrong, your target price, and how
convinced you are. Tap a card for the full picture: live price and chart,
technicals, financial statements, earnings, analysts, insider trades, news and
SEC filings.

Until live data is connected, the stock pages show clearly labeled **demo numbers**.

## What's in here

| Folder / file | What it does |
|---|---|
| `index.html` | The structure of the page |
| `styles.css` | The whole look: colors, spacing, dark mode, animations |
| `js/app.js` | The watchlist, the add/edit sheet, moving between pages |
| `js/journal.js` | Saving and loading your ideas on this device |
| `js/stock.js` | The stock page and its six tabs |
| `js/charts.js` | The price chart and the small bar/line charts |
| `js/indicators.js` | Technical analysis math (moving averages, RSI, MACD, Bollinger Bands, ATR) |
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

## Put it online (Vercel)

1. Sign in at vercel.com with your GitHub account.
2. **Add New → Project**, pick this repository, and click **Deploy**. No settings to change.
3. In the project, open **Settings → Environment Variables** and add the names from
   `.env.example` with your keys. Then go to **Deployments** and redeploy.
4. Open the link on your iPhone and use Share → **Add to Home Screen**.

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
3. Go live on Vercel with real data, and a passcode so only you can use it
4. Journal extras: notes timeline, close a position with a verdict, backup/restore
5. Markets: indices, sectors, crypto, FX, commodities
6. Macro: rates, inflation, jobs, yield curve (FRED)
7. AI research: local AI on the Mac, free cloud AI on the phone
8. Polish + Add to Home Screen icon
