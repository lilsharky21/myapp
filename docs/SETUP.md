# Setting up your keys

This takes about 15 minutes, and everything here is free. When you're done,
the app shows real prices, financials, news and AI research instead of demo numbers.

> **Two rules for keys**
> 1. A key is a password for a data service. **Never** paste one into a chat,
>    a message, or any file in this project. Keys only go into Vercel's settings.
> 2. If a key ever leaks, delete it on that service's website and make a new one.

Sign-up screens change from time to time. If a button looks a little
different, look for the closest match.

---

## 1. Vercel: where your app lives

1. Go to **vercel.com** and click **Sign Up**.
2. Pick the free **Hobby** plan, then **Continue with GitHub**.
3. Click **Add New… → Project**.
4. Find **myapp** in the list. If it isn't there, click the link to let Vercel see
   your GitHub repositories and allow it.
5. Click **Import**, then **Deploy**. Don't change any settings.
6. After a minute you get a web address like `myapp-abc123.vercel.app`. That's your app.

## 2. Finnhub: prices, company stats, analysts, earnings, insiders, news

1. Go to **finnhub.io** and click **Get free API key**.
2. Sign up with your email or Google.
3. On the **Dashboard** you'll see your **API key**, a long string of letters and
   numbers. Keep this tab open; you'll copy it in step 7.

Free plan: 60 requests a minute, which is plenty for one person.

## 3. Twelve Data: price history for charts and technicals

1. Go to **twelvedata.com** and click **Sign up**. Choose the free **Basic** plan.
2. Confirm your email if it asks.
3. Open **Dashboard → API Keys** and keep the key visible.

Free plan: 800 requests a day. The app saves answers so it uses very few.

## 4. The AI analyst: on your Mac, synced to your phone

The AI runs on your MacBook with **Ollama**: free software, no account needed,
and private (nothing leaves your Mac). Notes it writes are saved to your Vercel
account so your iPhone shows them too.

**On the Mac (about 10 minutes, mostly download time):**
1. Go to **ollama.com**, download Ollama for macOS, and open it. A llama icon
   appears in the menu bar.
2. Open **Terminal** (press ⌘ Space, type Terminal) and run:
   ```
   ollama pull qwen3:14b
   ```
   This downloads the AI model (about 9 GB). Any model works; this one is a good
   balance of smart and fast on an M5 Pro.
3. Find your app's **permanent** address: in Vercel, open your project → **Domains**.
   It looks like `myapp-abc123.vercel.app`. (Addresses with an extra random part,
   like `myapp-j2mdsvxdt-yourname.vercel.app`, belong to one single deploy and change
   every time. Don't use those.)
4. Let your app talk to Ollama, using that permanent address:
   ```
   launchctl setenv OLLAMA_ORIGINS "https://myapp-abc123.vercel.app"
   ```
5. Quit Ollama from the menu-bar icon and open it again.
6. Open the app **at the permanent address** on your Mac, then open a stock →
   **Research** → **Write my research note**.

**If it says the AI isn't connected,** the box under the AI rating (Ratings tab)
says exactly what's wrong and gives the command with your address filled in, plus a
**Check again** button. You can also check from Terminal:
```
curl -i http://localhost:11434/api/tags -H "Origin: https://myapp-abc123.vercel.app"
```
`200 OK` means Ollama is fine (so the browser is blocking it; try Chrome and allow
local network access). `403` means Ollama didn't pick up the address (quit and
reopen it). "Connection refused" means Ollama isn't open.

**After restarting your Mac**, run the `launchctl` command again and reopen Ollama.
The setting doesn't survive a restart.

**Note sync, so the phone shows the Mac's research (about 2 minutes):**
1. In Vercel, open your project → **Storage** → **Create** → **Blob**.
2. Give it any name and **Connect** it to your project. Vercel adds a setting
   called `BLOB_READ_WRITE_TOKEN` for you, so there's nothing to copy.
3. Redeploy (see step 7).

Notes are stored as private files that only your app can read.

**Optional, 18+ only: Gemini.** If you're 18 or older, a free Gemini key from
aistudio.google.com/apikey (added as `GEMINI_API_KEY`) lets the phone write
notes by itself. You don't need it; the Mac does the same job.

## 5. SEC: no sign-up

The SEC's filings are free and need no key. They only ask each app to say who
it is. Your value will be: `Thesis Journal` followed by your email address.

## 6. Passcode: make one up

Pick a passcode (like a short phrase). The app asks for it once on each of your
devices. Without one, anyone who found your web address could use up your free limits.

## 7. Paste everything into Vercel

1. In Vercel, open your **myapp** project, then **Settings → Environment Variables**.
2. Add each of these. The **name** must be typed exactly, and the **value** is what you copied:

   | Name | Value |
   |---|---|
   | `FINNHUB_API_KEY` | your Finnhub key |
   | `TWELVEDATA_API_KEY` | your Twelve Data key |
   | `SEC_USER_AGENT` | `Thesis Journal you@example.com` (your email) |
   | `APP_PASSCODE` | the passcode you made up |

   Leave all environments ticked (Production, Preview, Development).
3. Go to **Deployments**, tap **⋯** on the newest one, and choose **Redeploy**.
   Keys only take effect after a redeploy.

## 8. Check that it worked

1. Open your app's address on your phone.
2. Scroll to the bottom of the watchlist and tap **Data connections**.
3. Each service should show **✓** (Gemini shows ○ "optional", which is fine). Anything else shows what to fix.
4. Open any stock. The "Demo numbers" banner should be gone.

Then, on your iPhone: tap **Share → Add to Home Screen** to use it like an app.

## Troubleshooting

| What you see | What to do |
|---|---|
| ○ "isn't set in Vercel yet" | Check the name is spelled exactly as in step 7, then redeploy. |
| ✗ "The key was refused" | Copy the key again (no spaces at the start or end), replace it in Vercel, redeploy. |
| ! "free limit was hit" | Wait a minute. Free plans limit requests per minute. |
| Still "Demo numbers" | You probably didn't redeploy after adding keys. |
| Asked for a passcode | Type the `APP_PASSCODE` you chose. |
| Data connections says "Available once the app is on Vercel" | You're on the preview link, not your Vercel address. |
| Research says "No AI" on the Mac | Make sure Ollama is open (menu-bar llama), you ran step 4.3 with your exact address, and you restarted Ollama. |
| Phone doesn't show the Mac's note | Check **Note sync** is ✓ in Data connections, and write the note on the Mac *after* turning it on. |
