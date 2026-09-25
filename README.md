# Thesis Journal

A personal stock research notebook. Every stock you're watching gets a card with
**why** you like it, what would prove you wrong, your target price, and how
convinced you are. Later you can look back and see whether you were right.

## What's in here

| File | What it does |
|---|---|
| `index.html` | The structure of the page: title, tabs, the add/edit sheet |
| `styles.css` | The whole look: colors, spacing, dark mode, animations |
| `js/app.js` | What happens when you tap things: drawing cards, opening the sheet |
| `js/journal.js` | Saving and loading your ideas on this device |

## Run it on your computer

Browsers only run this kind of app from a web address, not by double-clicking the file.
In a terminal, inside this folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Roadmap

1. ✅ Journal look, add/edit sheet, saving
2. Detail view, notes timeline, close position + verdict, backup
3. Live prices (Finnhub) and a real web address (Vercel)
4. Stock page: charts, stats, analysts, earnings, news, SEC filings
5. Markets: indices, sectors, crypto, FX, commodities
6. Macro: rates, inflation, jobs, yield curve (FRED)
7. AI research: local AI on the Mac, free cloud AI on the phone
8. Polish + Add to Home Screen
