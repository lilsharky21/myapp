// ==========================================================================
// indicators.js: the math behind technical analysis, worked out from
// daily prices. Every function takes plain arrays and returns plain arrays,
// with null where there isn't enough history yet.
//
// candles look like: { t: time in seconds, o: open, h: high, l: low, c: close, v: volume }
// ==========================================================================

// Simple moving average: the average close of the last n days
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// Exponential moving average: like SMA but recent days count more
export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (prev === null) {
      if (i < n - 1) continue;
      // start from the simple average of the first n values
      let sum = 0;
      for (let j = i - n + 1; j <= i; j++) sum += values[j];
      prev = sum / n;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

// RSI (Relative Strength Index, 0-100): how strong recent gains are vs. losses.
// Above 70 is usually called "overbought", below 30 "oversold". Uses Wilder's smoothing.
export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (i <= n) {
      gain += up / n;
      loss += down / n;
      if (i < n) continue;
    } else {
      gain = (gain * (n - 1) + up) / n;
      loss = (loss * (n - 1) + down) / n;
    }
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// MACD: the gap between a fast (12-day) and slow (26-day) average, plus a
// 9-day "signal" line of that gap. When MACD crosses above signal, momentum is turning up.
export function macd(closes, fast = 12, slow = 26, signalN = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => (f[i] != null && s[i] != null ? f[i] - s[i] : null));
  const firstValid = line.findIndex((v) => v != null);
  const signal = new Array(closes.length).fill(null);
  if (firstValid >= 0) {
    const tail = ema(line.slice(firstValid), signalN);
    tail.forEach((v, j) => (signal[firstValid + j] = v));
  }
  const hist = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
  return { line, signal, hist };
}

// Bollinger Bands: a 20-day average with bands 2 standard deviations above and below
export function bollinger(closes, n = 20, width = 2) {
  const mid = sma(closes, n);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) sq += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sq / n);
    upper[i] = mid[i] + width * sd;
    lower[i] = mid[i] - width * sd;
  }
  return { mid, upper, lower };
}

// ATR (Average True Range): how much the price typically moves in a day, in dollars
export function atr(candles, n = 14) {
  const out = new Array(candles.length).fill(null);
  let value = null;
  let sum = 0;
  for (let i = 1; i < candles.length; i++) {
    const { h, l } = candles[i];
    const prevClose = candles[i - 1].c;
    const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
    if (i <= n) {
      sum += tr;
      if (i === n) value = sum / n;
    } else {
      value = (value * (n - 1) + tr) / n;
    }
    if (value !== null) out[i] = value;
  }
  return out;
}

// Annualized volatility of the last n days, in percent (how bumpy the ride is)
export function volatility(closes, n = 30) {
  if (closes.length <= n) return null;
  const returns = [];
  for (let i = closes.length - n; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// Returns over standard periods, in percent. Trading days: 1W = 5, 1M = 21, 1Y = 252.
export function performance(candles) {
  const last = candles.at(-1)?.c;
  const back = (days) => (candles.length > days ? pctChange(candles[candles.length - 1 - days].c, last) : null);
  const year = new Date(candles.at(-1).t * 1000).getUTCFullYear();
  const firstOfYear = candles.findIndex((c) => new Date(c.t * 1000).getUTCFullYear() === year);
  const ytdBase = firstOfYear > 0 ? candles[firstOfYear - 1].c : null;
  return [
    { label: '1W', value: back(5) },
    { label: '1M', value: back(21) },
    { label: '3M', value: back(63) },
    { label: '6M', value: back(126) },
    { label: 'YTD', value: ytdBase ? pctChange(ytdBase, last) : null },
    { label: '1Y', value: back(252) },
    { label: '3Y', value: back(756) },
    { label: '5Y', value: back(1260) },
  ];
}

const pctChange = (from, to) => ((to - from) / from) * 100;

// Everything the Technicals tab shows, worked out in one pass.
// Each reading has a value, a short state, a tone (up/down/neutral) and a plain-English line.
export function technicalSummary(candles) {
  if (!candles || candles.length < 60) return null;
  const closes = candles.map((c) => c.c);
  const last = closes.at(-1);
  const i = closes.length - 1;

  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes);
  const m = macd(closes);
  const bb = bollinger(closes);
  const a = atr(candles);
  const vol50 = sma(candles.map((c) => c.v), 50);

  const yearSlice = candles.slice(-252);
  const high52 = Math.max(...yearSlice.map((c) => c.h));
  const low52 = Math.min(...yearSlice.map((c) => c.l));
  const recent = candles.slice(-60);
  const high60 = Math.max(...recent.map((c) => c.h));
  const low60 = Math.min(...recent.map((c) => c.l));

  // Golden cross / death cross: when the 50-day average crosses the 200-day
  let crossDaysAgo = null;
  let crossKind = null;
  for (let k = i; k > i - 120 && k > 0; k--) {
    if (s50[k] == null || s200[k] == null || s50[k - 1] == null || s200[k - 1] == null) break;
    const now = s50[k] > s200[k];
    const before = s50[k - 1] > s200[k - 1];
    if (now !== before) {
      crossDaysAgo = i - k;
      crossKind = now ? 'golden' : 'death';
      break;
    }
  }

  // MACD crossover in the last 10 days
  let macdCross = null;
  for (let k = i; k > i - 10 && k > 0; k--) {
    if (m.hist[k] == null || m.hist[k - 1] == null) break;
    if (Math.sign(m.hist[k]) !== Math.sign(m.hist[k - 1])) {
      macdCross = { daysAgo: i - k, up: m.hist[k] > 0 };
      break;
    }
  }

  const above = (avg) => (avg == null ? null : last > avg);
  const dist = (avg) => (avg == null ? null : pctChange(avg, last));

  // Overall trend from where price sits vs. its 50 and 200-day averages
  let trend = 'Mixed';
  let trendTone = 'neutral';
  let trendLine = 'Price is between its main averages. The trend is undecided.';
  if (s200[i] != null && s50[i] != null) {
    if (last > s50[i] && s50[i] > s200[i]) {
      trend = 'Uptrend'; trendTone = 'up';
      trendLine = 'Price is above its 50-day average, which is above the 200-day. That stacking is the classic uptrend.';
    } else if (last < s50[i] && s50[i] < s200[i]) {
      trend = 'Downtrend'; trendTone = 'down';
      trendLine = 'Price is below its 50-day average, which is below the 200-day. That stacking is the classic downtrend.';
    } else if (last > s200[i]) {
      trend = 'Pullback in uptrend'; trendTone = 'neutral';
      trendLine = 'Still above the 200-day average, but short-term momentum has cooled.';
    } else {
      trend = 'Bounce in downtrend'; trendTone = 'neutral';
      trendLine = 'Below the 200-day average, but short-term price has picked up.';
    }
  }

  const rsiNow = r[i];
  const rsiState = rsiNow >= 70 ? ['Overbought', 'down', 'Above 70. Buyers have pushed hard; pullbacks often start from here.']
    : rsiNow <= 30 ? ['Oversold', 'up', 'Below 30. Sellers have pushed hard; bounces often start from here.']
    : rsiNow >= 50 ? ['Bullish momentum', 'up', 'Between 50 and 70. Gains are outpacing losses without being stretched.']
    : ['Weak momentum', 'down', 'Between 30 and 50. Losses are outpacing gains.'];

  const macdAbove = m.line[i] > m.signal[i];
  const macdState = macdCross
    ? [macdCross.up ? 'Bullish crossover' : 'Bearish crossover', macdCross.up ? 'up' : 'down',
       `MACD crossed ${macdCross.up ? 'above' : 'below'} its signal line ${macdCross.daysAgo === 0 ? 'today' : `${macdCross.daysAgo} day${macdCross.daysAgo === 1 ? '' : 's'} ago`}.`]
    : [macdAbove ? 'Above signal' : 'Below signal', macdAbove ? 'up' : 'down',
       macdAbove ? 'Short-term momentum is stronger than the longer-term trend.' : 'Short-term momentum is weaker than the longer-term trend.'];

  const pctB = bb.upper[i] != null ? ((last - bb.lower[i]) / (bb.upper[i] - bb.lower[i])) * 100 : null;
  const bbState = pctB == null ? ['—', 'neutral', '']
    : pctB > 100 ? ['Above upper band', 'down', 'Price broke above the upper band. Strong move, but stretched.']
      : pctB < 0 ? ['Below lower band', 'up', 'Price broke below the lower band. Sharp drop, and stretched.']
        : [`${pctB.toFixed(0)}% of band`, 'neutral', 'Where price sits between the lower band (0%) and upper band (100%).'];

  const volRatio = vol50[i] ? candles[i].v / vol50[i] : null;

  return {
    last,
    trend: { label: trend, tone: trendTone, line: trendLine },
    averages: [
      { label: '20-day average', value: s20[i], above: above(s20[i]), distance: dist(s20[i]) },
      { label: '50-day average', value: s50[i], above: above(s50[i]), distance: dist(s50[i]) },
      { label: '200-day average', value: s200[i], above: above(s200[i]), distance: dist(s200[i]) },
    ],
    cross: crossKind ? { kind: crossKind, daysAgo: crossDaysAgo } : null,
    rsi: { value: rsiNow, state: rsiState[0], tone: rsiState[1], line: rsiState[2] },
    macd: { value: m.line[i], signal: m.signal[i], hist: m.hist[i], state: macdState[0], tone: macdState[1], line: macdState[2] },
    bollinger: { upper: bb.upper[i], lower: bb.lower[i], pctB, state: bbState[0], tone: bbState[1], line: bbState[2] },
    atr: { value: a[i], pctOfPrice: a[i] != null ? (a[i] / last) * 100 : null },
    volatility30: volatility(closes, 30),
    volume: { last: candles[i].v, avg50: vol50[i], ratio: volRatio },
    range52: { high: high52, low: low52, fromHigh: pctChange(high52, last), fromLow: pctChange(low52, last) },
    range60: { high: high60, low: low60 },
    performance: performance(candles),
    series: { rsi: r, macd: m },
  };
}

// ---------------------------------------------------------------------------
// Risk: how bumpy the ride has been, and how it compares with the S&P 500.
// `bench` is the daily history of SPY (an ETF that tracks the S&P 500).
// ---------------------------------------------------------------------------

const RISK_FREE = 4; // % a year you could earn in Treasury bills (used for the Sharpe ratio)

export function riskStats(candles, bench) {
  if (!candles || candles.length < 60) return null;
  const closes = candles.map((c) => c.c);
  const n = closes.length;

  // Drawdown: how far below its previous peak the price is at each point
  const window = candles.slice(-1260);
  let peak = window[0].c;
  let peakT = window[0].t;
  let maxDd = 0;
  let maxDdPeakT = peakT;
  let maxDdTroughT = peakT;
  const drawdown = window.map((c) => {
    if (c.c > peak) { peak = c.c; peakT = c.t; }
    const dd = ((c.c - peak) / peak) * 100;
    if (dd < maxDd) { maxDd = dd; maxDdPeakT = peakT; maxDdTroughT = c.t; }
    return dd;
  });
  const allTimeHigh = Math.max(...closes);

  // Daily returns for the last year
  const year = candles.slice(-253);
  const returns = [];
  for (let i = 1; i < year.length; i++) returns.push({ t: year[i].t, r: year[i].c / year[i - 1].c - 1 });
  const mean = returns.reduce((s, x) => s + x.r, 0) / returns.length;
  const sd = Math.sqrt(returns.reduce((s, x) => s + (x.r - mean) ** 2, 0) / (returns.length - 1));
  const downside = Math.sqrt(returns.reduce((s, x) => s + Math.min(0, x.r) ** 2, 0) / returns.length);
  const annualReturn = mean * 252 * 100;
  const sharpe = sd ? (annualReturn - RISK_FREE) / (sd * Math.sqrt(252) * 100) : null;
  const sortino = downside ? (annualReturn - RISK_FREE) / (downside * Math.sqrt(252) * 100) : null;
  const best = returns.reduce((a, b) => (b.r > a.r ? b : a), returns[0]);
  const worst = returns.reduce((a, b) => (b.r < a.r ? b : a), returns[0]);

  // Compare with the S&P 500 on the days both traded
  let beta = null;
  let correlation = null;
  let benchReturn1y = null;
  let relative = null;
  if (bench?.length > 60) {
    const benchByTime = new Map(bench.map((c) => [c.t, c.c]));
    const pairs = [];
    for (let i = n - 252; i < n; i++) {
      if (i < 1) continue;
      const b0 = benchByTime.get(candles[i - 1].t);
      const b1 = benchByTime.get(candles[i].t);
      if (b0 && b1) pairs.push([candles[i].c / candles[i - 1].c - 1, b1 / b0 - 1]);
    }
    if (pairs.length > 40) {
      const ms = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
      const mb = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
      let cov = 0;
      let varB = 0;
      let varS = 0;
      for (const [s, b] of pairs) {
        cov += (s - ms) * (b - mb);
        varB += (b - mb) ** 2;
        varS += (s - ms) ** 2;
      }
      beta = varB ? cov / varB : null;
      correlation = varB && varS ? cov / Math.sqrt(varB * varS) : null;
    }
    // Both lines start at 100 one year ago, so you can see which did better
    const start = candles[Math.max(0, n - 253)];
    const benchStart = benchByTime.get(start.t);
    if (benchStart) {
      const stockLine = [];
      const benchLine = [];
      for (const c of candles.slice(-253)) {
        const b = benchByTime.get(c.t);
        stockLine.push((c.c / start.c) * 100);
        benchLine.push(b ? (b / benchStart) * 100 : null);
      }
      relative = { stock: stockLine, bench: benchLine, times: candles.slice(-253).map((c) => c.t) };
      const lastBench = benchLine.findLast((v) => v != null);
      benchReturn1y = lastBench != null ? lastBench - 100 : null;
    }
  }
  const return1y = n > 252 ? (closes[n - 1] / closes[n - 253] - 1) * 100 : null;

  return {
    drawdown,
    drawdownTimes: window.map((c) => c.t),
    maxDrawdown: { value: maxDd, peakT: maxDdPeakT, troughT: maxDdTroughT },
    fromAllTimeHigh: ((closes[n - 1] - allTimeHigh) / allTimeHigh) * 100,
    sharpe,
    sortino,
    bestDay: { value: best.r * 100, t: best.t },
    worstDay: { value: worst.r * 100, t: worst.t },
    upDays: (returns.filter((x) => x.r > 0).length / returns.length) * 100,
    beta,
    correlation,
    return1y,
    benchReturn1y,
    relative1y: return1y != null && benchReturn1y != null ? return1y - benchReturn1y : null,
    relative,
  };
}

// Seasonality: the average return in each calendar month across all years we have
export function seasonality(candles) {
  if (!candles || candles.length < 300) return null;
  const monthEnds = new Map(); // "2024-03" -> last close that month
  for (const c of candles) {
    const d = new Date(c.t * 1000);
    monthEnds.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, c.c);
  }
  const keys = [...monthEnds.keys()];
  const buckets = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < keys.length; i++) {
    const month = Number(keys[i].split('-')[1]);
    buckets[month].push((monthEnds.get(keys[i]) / monthEnds.get(keys[i - 1]) - 1) * 100);
  }
  // The newest month is usually only partly over, so leave it out
  const current = Number(keys.at(-1).split('-')[1]);
  buckets[current].pop();
  return buckets.map((list, month) => ({
    month,
    avg: list.length ? list.reduce((a, b) => a + b, 0) / list.length : null,
    positive: list.filter((v) => v > 0).length,
    count: list.length,
  }));
}
