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

**On the Mac (one time, about 10 minutes, mostly download time):**
1. Go to **ollama.com**, download Ollama for macOS, and open it once.
2. Open your app on the Mac, scroll to the bottom of the watchlist → **Data connections**
   → **Set up Mac AI (one time)** → **Copy**. The command already has your app's
   addresses inside it, so there's nothing to type or change.
3. Open **Terminal** (⌘ Space, type Terminal), paste, and press Return. It:
   - allows your app to talk to Ollama, and keeps allowing it after restarts
   - downloads the qwen3:14b model if you don't have it (about 9 GB)
   - restarts Ollama
4. Back in the app, tap **Check again**. It should say **Uses Your Mac · qwen3:14b**.

That's it: no commands to retype after restarts. To undo it, run
`rm ~/Library/LaunchAgents/com.thesisjournal.ollama.plist`.

**Speed:** the first note after opening the app takes longer while the model
loads into memory. The app starts loading it as soon as you open a stock, and
keeps it loaded for 30 minutes.

**Sync, so your phone and Mac show the same journal and research (about 3 minutes):**

Blob is like a private folder inside your Vercel account. The app saves your
journal and AI notes there as files, and your other devices read them.
There's no key to copy and no code to write: the app already has everything.

1. In Vercel, open your **myapp** project and click the **Storage** tab.
2. Click **Create Database** (or **Create**), choose **Blob**, then **Continue**.
3. Name it anything (like `thesis`). If it asks **Public or Private**, choose **Private**.
   Click **Create**.
4. When it asks which project to connect, choose **myapp**, keep every environment
   ticked, and click **Connect**. Vercel adds a setting to your project for you
   (`BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID`, depending on your account; either works).
5. **Redeploy**: go to **Deployments**, click **⋯** on the top one, then **Redeploy**.
   Settings only reach the app after a redeploy.
6. Open your app, scroll to the bottom, and open **Data connections**. **Sync** should
   show ✓. The line above it should say **Synced across your devices**.

If Sync shows **!** with a message, the message says what's wrong: usually the store
isn't connected to this project, or it was made Public (make a new Private one).

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
   | `SEC_USER_AGENT` | `Thesis Journal you@example.com` (your email; spaces are fine in the value box) |
   | `APP_PASSCODE` | the passcode you made up |

   Leave all environments ticked (Production, Preview, Development).
3. Go to **Deployments**, tap **⋯** on the newest one, and choose **Redeploy**.
   Keys only take effect after a redeploy.

## About your app's address

Vercel gives your app a **permanent** address (project → **Domains**, like
`myapp-abc123.vercel.app`) and also a separate address for every single deploy
(with a random part, like `myapp-o5pqwqc5e-yourteam.vercel.app`). Deploy addresses
show the code from that moment only. Bookmark the permanent one and add that to
your Home Screen.

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
| Phone doesn't show the Mac's note | Check **Sync** is ✓ in Data connections, and write the note on the Mac *after* turning it on. |
| Phone and Mac show different watchlists | Check **Sync** is ✓, then close and reopen the app on both. The bottom of the watchlist should say "Synced across your devices". |
