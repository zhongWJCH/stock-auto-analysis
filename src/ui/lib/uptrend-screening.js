import { calculateMacd, calculateRsi, movingAverage, percentChange, toFixedNumber } from "../../utils.js";

function calculateKdj(history, period = 9, kSmoothing = 3, dSmoothing = 3) {
  const result = [];
  let k = 50;
  let d = 50;

  for (let index = 0; index < history.length; index += 1) {
    const slice = history.slice(Math.max(0, index - period + 1), index + 1);
    const highs = slice.map((item) => Number(item.high));
    const lows = slice.map((item) => Number(item.low));
    const close = Number(history[index].close);
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const rsv = highest === lowest ? 50 : ((close - lowest) / (highest - lowest)) * 100;
    k = ((kSmoothing - 1) * k + rsv) / kSmoothing;
    d = ((dSmoothing - 1) * d + k) / dSmoothing;
    result.push({ k, d, j: 3 * k - 2 * d });
  }

  return result;
}

function closePosition(record) {
  const high = Number(record.high);
  const low = Number(record.low);
  const close = Number(record.close);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) {
    return 0.5;
  }
  return (close - low) / (high - low);
}

function bodyRatio(record) {
  const open = Number(record.open);
  const close = Number(record.close);
  const high = Number(record.high);
  const low = Number(record.low);
  if (!Number.isFinite(open) || !Number.isFinite(close) || !Number.isFinite(high) || !Number.isFinite(low) || high === low) {
    return 0;
  }
  return Math.abs(close - open) / (high - low);
}

function lowerShadowRatio(record) {
  const open = Number(record.open);
  const close = Number(record.close);
  const low = Number(record.low);
  const body = Math.abs(close - open);
  if (!Number.isFinite(open) || !Number.isFinite(close) || !Number.isFinite(low) || body === 0) {
    return 0;
  }
  return (Math.min(open, close) - low) / body;
}

function upperShadowRatio(record) {
  const open = Number(record.open);
  const close = Number(record.close);
  const high = Number(record.high);
  const body = Math.abs(close - open) || 0.01;
  return (high - Math.max(open, close)) / body;
}

function probabilityBand(score) {
  if (score >= 80) {
    return "65%-75%";
  }
  if (score >= 60) {
    return "55%-65%";
  }
  return "<55%";
}

function primaryPattern(signalCounts) {
  const ranked = [
    ["breakout", signalCounts.breakout],
    ["trend", signalCounts.trend],
    ["reversal", signalCounts.reversal],
    ["funds", signalCounts.funds],
  ].sort((a, b) => b[1] - a[1]);

  const winner = ranked[0]?.[0];
  if (winner === "breakout") {
    return "放量突破前高";
  }
  if (winner === "trend") {
    return "趋势延续";
  }
  if (winner === "reversal") {
    return "超跌反转";
  }
  if (winner === "funds") {
    return "资金确认";
  }
  return "观察";
}

export function screenUptrendCandidates(inputSeries, options) {
  const benchmark = inputSeries.find((item) => item.symbol === "000001") || inputSeries[0];
  const benchmarkByDate = new Map((benchmark?.history || []).map((item) => [item.dateKey, item]));

  const results = [];

  for (const item of inputSeries) {
    if (item.symbol === "000001" || item.name?.includes("ST")) {
      continue;
    }

    const history = item.history;
    const closes = history.map((entry) => Number(entry.close));
    const opens = history.map((entry) => Number(entry.open));
    const volumes = history.map((entry) => Number(entry.volume));
    const ma5 = movingAverage(closes, 5);
    const ma10 = movingAverage(closes, 10);
    const ma20 = movingAverage(closes, 20);
    const ma60 = movingAverage(closes, 60);
    const vol5 = movingAverage(volumes, 5);
    const macd = calculateMacd(closes);
    const rsi = calculateRsi(closes, 14);
    const kdj = calculateKdj(history);

    const index = history.findIndex((entry) => entry.dateKey === options.signalDateKey);
    if (index < 60) {
      continue;
    }

    const record = history[index];
    const previous = history[index - 1];
    const benchmarkRecord = benchmarkByDate.get(record.dateKey);
    const latest20 = closes.slice(Math.max(0, index - 19), index + 1);
    const signalCounts = {
      trend: 0,
      breakout: 0,
      reversal: 0,
      funds: 0,
    };
    const signalTags = [];
    const negativeFlags = [];
    let score = 0;

    const bullish = Number(record.close) > Number(record.open);
    const bullishClose = closePosition(record) > 0.7;
    const volumeExpanded = Number.isFinite(vol5[index]) && Number(record.volume) > vol5[index];
    const volumeBreakout = Number.isFinite(vol5[index]) && Number(record.volume) >= vol5[index] * 1.5;
    const atNewHigh20 = latest20.length >= 20 && Number(record.close) >= Math.max(...latest20);
    const changePct = Number(record.changePct);
    const benchmarkDelta = Number(benchmarkRecord?.changePct ?? 0);
    const stockDelta = percentChange(Number(record.close), Number(previous?.close));
    const macdGrowing = Number.isFinite(macd.macd[index]) && Number.isFinite(macd.macd[index - 1]) && macd.macd[index] > macd.macd[index - 1] && macd.macd[index] > 0;
    const rsiStrong = Number.isFinite(rsi[index]) && Number.isFinite(rsi[index - 1]) && rsi[index] > 50 && rsi[index] > rsi[index - 1];
    const kdjReversal = Number.isFinite(kdj[index]?.j) && Number.isFinite(kdj[index]?.k) && Number.isFinite(kdj[index]?.d)
      && kdj[index].j < 0 && kdj[index].k > kdj[index].d;
    const longLowerShadow = lowerShadowRatio(record) > 2;
    const tailStrengthProxy = bullishClose && volumeExpanded && changePct > 0;

    if (Number(record.close) > (ma5[index] ?? Number.POSITIVE_INFINITY)) {
      score += 15;
    }
    if (Number.isFinite(ma5[index]) && Number.isFinite(ma5[index - 1]) && ma5[index] > ma5[index - 1]) {
      score += 15;
      signalCounts.trend += 1;
      signalTags.push("5日均线向上");
    }
    if (volumeExpanded) {
      score += 15;
    }
    if (bullish) {
      score += 10;
    }
    if (macdGrowing) {
      score += 15;
      signalCounts.trend += 1;
      signalTags.push("MACD红柱放大");
    }
    if (rsiStrong) {
      score += 10;
      signalCounts.trend += 1;
      signalTags.push("RSI强势上行");
    }
    if (tailStrengthProxy) {
      score += 20;
      signalCounts.funds += 1;
      signalTags.push("资金代理项偏强");
    }

    if (Number(record.close) > (ma5[index] ?? Infinity) && Number(record.close) > (ma10[index] ?? Infinity) && Number(record.close) > (ma20[index] ?? Infinity)) {
      signalCounts.trend += 1;
      signalTags.push("股价站上短中期均线");
    }

    if (atNewHigh20) {
      signalCounts.breakout += 1;
      signalTags.push("20日新高");
    }
    if (volumeBreakout) {
      signalCounts.breakout += 1;
      signalTags.push("放量突破");
    }
    if (changePct > 3 && bodyRatio(record) >= 0.7) {
      signalCounts.breakout += 1;
      signalTags.push("强实体阳线");
    }
    if (stockDelta - benchmarkDelta >= 2) {
      signalCounts.breakout += 1;
      signalTags.push("显著跑赢大盘");
    }

    if (Number.isFinite(rsi[index]) && Number.isFinite(rsi[index - 1]) && rsi[index - 1] < 30 && rsi[index] >= 32) {
      signalCounts.reversal += 1;
      signalTags.push("RSI超卖回升");
    }
    if (kdjReversal) {
      signalCounts.reversal += 1;
      signalTags.push("KDJ极端反转");
    }
    if (longLowerShadow) {
      signalCounts.reversal += 1;
      signalTags.push("长下影反转");
    }
    if (volumeExpanded && bullishClose) {
      signalCounts.funds += 1;
      signalTags.push("尾盘强势代理");
    }

    if (upperShadowRatio(record) > 1.5 && Number(record.volume) > (vol5[index] ?? Number.MAX_SAFE_INTEGER)) {
      negativeFlags.push("高位放量长上影");
    }
    if (Number.isFinite(ma60[index]) && Number(record.close) < ma60[index]) {
      negativeFlags.push("跌破60日均线");
    }

    const qualified = negativeFlags.length === 0
      && (signalCounts.trend >= 2 || signalCounts.breakout >= 2 || signalCounts.reversal >= 2 || signalCounts.funds >= 2 || score >= 80);

    if (!qualified) {
      continue;
    }

    results.push({
      symbol: item.symbol,
      name: item.name,
      category: item.category,
      signalDate: record.date,
      targetDate: options.targetDate,
      close: Number(record.close),
      changePct,
      score,
      probability: probabilityBand(score),
      primaryPattern: primaryPattern(signalCounts),
      signalCounts,
      signalTags,
      negativeFlags,
      ma5: toFixedNumber(ma5[index]),
      ma10: toFixedNumber(ma10[index]),
      ma20: toFixedNumber(ma20[index]),
      ma60: toFixedNumber(ma60[index]),
      rsi14: toFixedNumber(rsi[index]),
      macdHistogram: toFixedNumber(macd.macd[index]),
      benchmarkOutperformance: toFixedNumber(stockDelta - benchmarkDelta),
      volumeVs5: Number.isFinite(vol5[index]) ? toFixedNumber(Number(record.volume) / vol5[index], 2) : null,
      data: item,
    });
  }

  return results.sort((a, b) => b.score - a.score || b.signalCounts.breakout - a.signalCounts.breakout || b.changePct - a.changePct);
}
