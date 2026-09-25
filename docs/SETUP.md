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

## 4. Gemini: the AI analyst on your phone

1. Go to **aistudio.google.com/apikey** and sign in with a Google account.
2. Click **Create API key**. If it asks for a project, let it create one.
3. Keep the key visible.

Good to know: on the free tier, Google may use what you send to improve its
models (the app only sends public market data and your thesis). Google's API
terms also have an age requirement.

On your Mac you can use local AI instead, which is free and private. See
"Local AI on your Mac" in the README.

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
   | `GEMINI_API_KEY` | your Gemini key |
   | `SEC_USER_AGENT` | `Thesis Journal you@example.com` (your email) |
   | `APP_PASSCODE` | the passcode you made up |

   Leave all environments ticked (Production, Preview, Development).
3. Go to **Deployments**, tap **⋯** on the newest one, and choose **Redeploy**.
   Keys only take effect after a redeploy.

## 8. Check that it worked

1. Open your app's address on your phone.
2. Scroll to the bottom of the watchlist and tap **Data connections**.
3. Each service should show **✓**. Anything else shows what to fix.
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
