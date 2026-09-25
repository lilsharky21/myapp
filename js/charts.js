// ==========================================================================
// charts.js: every chart in the app.
//  - PriceChart: the big interactive price chart (uses TradingView's
//    free Lightweight Charts library, loaded in index.html)
//  - barChart, lineChart, stackedBars, dotPlot, rangeBar: small charts drawn
//    as SVG (a format for drawing shapes), styled by styles.css
// ==========================================================================

import { sma, bollinger } from './indicators.js';

// Read a color token from styles.css, so charts match light/dark mode
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// The big price chart
// ---------------------------------------------------------------------------

export class PriceChart {
  constructor(element, { onHover } = {}) {
    const LW = window.LightweightCharts;
    this.LW = LW;
    this.onHover = onHover;
    this.chart = LW.createChart(element, {
      autoSize: true,
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: false, axisDoubleClickReset: true },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.2 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      crosshair: { mode: LW.CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
      grid: { vertLines: { visible: false } },
      localization: { locale: 'en-US', timeFormatter: (t) => this.formatTime(t) },
    });

    const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    this.area = this.chart.addSeries(LW.AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    this.candles = this.chart.addSeries(LW.CandlestickSeries, { visible: false, priceLineVisible: false, lastValueVisible: false });
    this.sma50 = this.chart.addSeries(LW.LineSeries, { ...quiet, lineWidth: 1.5, visible: false });
    this.sma200 = this.chart.addSeries(LW.LineSeries, { ...quiet, lineWidth: 1.5, visible: false });
    this.bbUpper = this.chart.addSeries(LW.LineSeries, { ...quiet, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, visible: false });
    this.bbLower = this.chart.addSeries(LW.LineSeries, { ...quiet, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, visible: false });
    this.volume = this.chart.addSeries(LW.HistogramSeries, { ...quiet, priceScaleId: 'volume', priceFormat: { type: 'volume' } });
    this.chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });

    this.chart.subscribeCrosshairMove((param) => {
      if (!this.onHover) return;
      const point = param.time ? param.seriesData.get(this.mode === 'candles' ? this.candles : this.area) : null;
      if (!point) return this.onHover(null);
      this.onHover({ time: param.time, price: point.close ?? point.value });
    });

    this.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
  }

  applyTheme() {
    this.colors = {
      text: token('--text-2'),
      grid: token('--hairline'),
      up: token('--up'),
      down: token('--down'),
      accent: token('--accent'),
      muted: token('--text-3'),
      orange: token('--chart-orange'),
      purple: token('--chart-purple'),
    };
    const c = this.colors;
    this.chart.applyOptions({
      layout: {
        background: { type: this.LW.ColorType.Solid, color: 'transparent' },
        textColor: c.text,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { horzLines: { color: c.grid } },
      crosshair: { vertLine: { color: c.muted, labelBackgroundColor: c.muted } },
    });
    this.candles.applyOptions({ upColor: c.up, downColor: c.down, borderVisible: false, wickUpColor: c.up, wickDownColor: c.down });
    this.sma50.applyOptions({ color: c.orange });
    this.sma200.applyOptions({ color: c.purple });
    this.bbUpper.applyOptions({ color: c.muted });
    this.bbLower.applyOptions({ color: c.muted });
    if (this.last) this.show(this.last);
  }

  // Times on the chart in your own time zone
  formatTime(t) {
    const d = new Date(t * 1000);
    return this.intraday
      ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  // Labels along the bottom axis: your local time for intraday, dates otherwise
  formatTick(t, type) {
    const d = new Date(t * 1000);
    if (this.intraday) {
      return type >= 3
        ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString('en-US', { weekday: 'short' });
    }
    if (type === 0) return String(d.getUTCFullYear());
    if (type === 1) return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  // candles: the bars to show. history: the full daily history (so the
  // 200-day average is correct even at the left edge of a 1-year chart).
  show({ candles, history = candles, intraday = false, mode = 'area', overlays = {}, prevClose = null }) {
    this.last = { candles, history, intraday, mode, overlays, prevClose };
    this.mode = mode;
    this.intraday = intraday;
    const c = this.colors;
    if (!candles.length) return;

    const rising = candles.at(-1).c >= (prevClose ?? candles[0].c);
    const line = rising ? c.up : c.down;
    this.area.applyOptions({
      visible: mode === 'area',
      lineColor: line,
      topColor: withAlpha(line, 0.22),
      bottomColor: withAlpha(line, 0),
      crosshairMarkerBackgroundColor: line,
    });
    this.candles.applyOptions({ visible: mode === 'candles' });

    this.area.setData(candles.map((b) => ({ time: b.t, value: b.c })));
    this.candles.setData(candles.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));
    this.volume.applyOptions({ visible: overlays.volume !== false });
    this.volume.setData(candles.map((b, i) => ({
      time: b.t,
      value: b.v,
      color: withAlpha(b.c >= (i ? candles[i - 1].c : b.o) ? c.up : c.down, 0.3),
    })));

    // Moving averages and Bollinger Bands only make sense on daily bars
    const start = history.length - candles.length;
    const closes = history.map((b) => b.c);
    const lineData = (values) => candles
      .map((b, i) => ({ time: b.t, value: values[start + i] }))
      .filter((p) => p.value != null);
    const daily = !intraday;
    this.sma50.applyOptions({ visible: daily && !!overlays.sma50 });
    this.sma200.applyOptions({ visible: daily && !!overlays.sma200 });
    this.bbUpper.applyOptions({ visible: daily && !!overlays.bollinger });
    this.bbLower.applyOptions({ visible: daily && !!overlays.bollinger });
    if (daily) {
      this.sma50.setData(lineData(sma(closes, 50)));
      this.sma200.setData(lineData(sma(closes, 200)));
      const bands = bollinger(closes);
      this.bbUpper.setData(lineData(bands.upper));
      this.bbLower.setData(lineData(bands.lower));
    }

    // Dotted line at yesterday's close on the 1-day view (like Apple Stocks)
    if (this.prevLine) this.area.removePriceLine(this.prevLine);
    this.prevLine = prevClose != null
      ? this.area.createPriceLine({ price: prevClose, color: c.muted, lineWidth: 1, lineStyle: this.LW.LineStyle.Dotted, axisLabelVisible: false })
      : null;

    this.chart.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false, tickMarkFormatter: (t, type) => this.formatTick(t, type) } });
    this.chart.timeScale().fitContent();
  }

  destroy() {
    this.chart.remove();
  }
}

// ---------------------------------------------------------------------------
// Small SVG charts. They're drawn at a fixed size and scale to fit their box.
// ---------------------------------------------------------------------------

const W = 340;

// Bar chart. values can be negative; the newest bar is drawn strongest.
export function barChart({ labels, values, format = String, height = 150, tone = 'accent' }) {
  const top = 20;
  const bottom = 22;
  const n = values.length;
  const valid = values.filter((v) => v != null);
  if (!valid.length) return '';
  const max = Math.max(0, ...valid);
  const min = Math.min(0, ...valid);
  const span = max - min || 1;
  const plotH = height - top - bottom;
  const y = (v) => top + ((max - v) / span) * plotH;
  const slot = W / n;
  const barW = Math.min(28, slot * 0.62);
  const every = n <= 6 ? 1 : n <= 10 ? 2 : 3;

  let bars = '';
  let text = '';
  values.forEach((v, i) => {
    const x = i * slot + (slot - barW) / 2;
    const isLast = i === n - 1;
    if (v != null) {
      const y0 = y(Math.max(v, 0));
      const h = Math.max(1.5, Math.abs(y(v) - y(0)));
      const cls = `bar ${v < 0 ? 'neg' : tone}${isLast ? '' : ' past'}`;
      bars += `<rect class="${cls}" x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${labels[i]}: ${format(v)}</title></rect>`;
      if (isLast) {
        text += `<text class="bar-value" x="${(x + barW / 2).toFixed(1)}" y="${(v >= 0 ? y0 - 6 : y0 + h + 13).toFixed(1)}" text-anchor="middle">${format(v)}</text>`;
      }
    }
    if ((n - 1 - i) % every === 0) {
      text += `<text class="axis" x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${labels[i]}</text>`;
    }
  });
  const zero = `<line class="zero" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
  return `<svg class="mini-chart" viewBox="0 0 ${W} ${height}" role="img">${zero}${bars}${text}</svg>`;
}

// Line chart with optional shaded band (used for RSI, MACD, margins)
export function lineChart({ series, labels = [], height = 120, min, max, band, refs = [], histogram, format = (v) => v.toFixed(0) }) {
  const top = 10;
  const bottom = labels.length ? 20 : 6;
  const all = [...series.flatMap((s) => s.values), ...(histogram ?? [])].filter((v) => v != null);
  if (!all.length) return '';
  const lo = min ?? Math.min(...all);
  const hi = max ?? Math.max(...all);
  const span = hi - lo || 1;
  const plotH = height - top - bottom;
  const n = Math.max(...series.map((s) => s.values.length), histogram?.length ?? 0);
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 30));
  const y = (v) => top + ((hi - v) / span) * plotH;

  let out = '';
  if (band) {
    out += `<rect class="band" x="0" width="${W - 30}" y="${y(band[1]).toFixed(1)}" height="${(y(band[0]) - y(band[1])).toFixed(1)}"/>`;
  }
  for (const r of refs) {
    out += `<line class="ref" x1="0" x2="${W - 30}" y1="${y(r).toFixed(1)}" y2="${y(r).toFixed(1)}"/>`;
    out += `<text class="axis" x="${W - 26}" y="${(y(r) + 3.5).toFixed(1)}">${format(r)}</text>`;
  }
  if (histogram) {
    const bw = Math.max(1, (W - 30) / n - 1);
    histogram.forEach((v, i) => {
      if (v == null) return;
      const y0 = y(Math.max(v, 0));
      out += `<rect class="hist ${v >= 0 ? 'pos' : 'neg'}" x="${(x(i) - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, Math.abs(y(v) - y(0))).toFixed(1)}"/>`;
    });
  }
  for (const s of series) {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    out += `<path class="line ${s.cls ?? ''}" d="${d}"/>`;
    const lastIndex = s.values.findLastIndex((v) => v != null);
    if (s.dot !== false && lastIndex >= 0) {
      out += `<circle class="dot-end ${s.cls ?? ''}" cx="${x(lastIndex).toFixed(1)}" cy="${y(s.values[lastIndex]).toFixed(1)}" r="3"/>`;
    }
  }
  if (labels.length) {
    const every = Math.ceil(labels.length / 6);
    labels.forEach((l, i) => {
      if ((labels.length - 1 - i) % every === 0) {
        out += `<text class="axis" x="${x(i).toFixed(1)}" y="${height - 5}" text-anchor="middle">${l}</text>`;
      }
    });
  }
  return `<svg class="mini-chart" viewBox="0 0 ${W} ${height}" role="img">${out}</svg>`;
}

// Stacked columns for analyst ratings (strong buy at the bottom)
export function stackedBars({ columns, keys, labels, height = 150 }) {
  const top = 8;
  const bottom = 22;
  const totals = columns.map((c) => keys.reduce((s, k) => s + (c[k] || 0), 0));
  const max = Math.max(...totals, 1);
  const plotH = height - top - bottom;
  const slot = W / columns.length;
  const barW = Math.min(34, slot * 0.6);
  let out = '';
  columns.forEach((col, i) => {
    const x = i * slot + (slot - barW) / 2;
    let yTop = top + plotH;
    for (const k of keys) {
      const h = ((col[k] || 0) / max) * plotH;
      if (h <= 0) continue;
      yTop -= h;
      out += `<rect class="stack ${k}" x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h - 1).toFixed(1)}"><title>${labels[i]}: ${col[k]} ${k}</title></rect>`;
    }
    out += `<text class="axis" x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${labels[i]}</text>`;
  });
  return `<svg class="mini-chart" viewBox="0 0 ${W} ${height}" role="img">${out}</svg>`;
}

// Earnings: hollow circle = what analysts expected, filled = what the company reported
export function dotPlot({ points, labels, height = 150, format }) {
  const top = 22;
  const bottom = 22;
  const all = points.flatMap((p) => [p.estimate, p.actual]).filter((v) => v != null);
  if (!all.length) return '';
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const plotH = height - top - bottom;
  const y = (v) => top + ((max - v) / (max - min)) * plotH;
  const slot = W / points.length;
  let out = '';
  points.forEach((p, i) => {
    const cx = i * slot + slot / 2;
    if (p.estimate != null) out += `<circle class="est" cx="${cx}" cy="${y(p.estimate).toFixed(1)}" r="7"><title>Expected ${format(p.estimate)}</title></circle>`;
    if (p.actual != null) {
      const beat = p.estimate == null || p.actual >= p.estimate;
      out += `<circle class="act ${beat ? 'beat' : 'miss'}" cx="${cx}" cy="${y(p.actual).toFixed(1)}" r="7"><title>Reported ${format(p.actual)}</title></circle>`;
      out += `<text class="bar-value" x="${cx}" y="${(Math.min(y(p.actual), y(p.estimate ?? p.actual)) - 12).toFixed(1)}" text-anchor="middle">${format(p.actual)}</text>`;
    }
    out += `<text class="axis" x="${cx}" y="${height - 6}" text-anchor="middle">${labels[i]}</text>`;
  });
  return `<svg class="mini-chart" viewBox="0 0 ${W} ${height}" role="img">${out}</svg>`;
}

// A horizontal track showing where a value sits between low and high (52-week range)
export function rangeBar({ low, high, value, lowLabel, highLabel }) {
  if (low == null || high == null || value == null || high <= low) return '';
  const pos = Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  return `<div class="range">
    <div class="range-track"><span class="range-fill" style="width:${pos}%"></span><span class="range-mark" style="left:${pos}%"></span></div>
    <div class="range-labels"><span>${lowLabel}</span><span>${highLabel}</span></div>
  </div>`;
}
