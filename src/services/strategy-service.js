import { average, calculateRsi, movingAverage, percentChange, toFixedNumber } from "../utils.js";

const STRATEGIES = [
  { key: "momentumRotation", label: "ETF 动量轮动", nextDayEligible: false },
  { key: "trendFollowing", label: "趋势跟随", nextDayEligible: true },
  { key: "volumeBreakout", label: "突破放量", nextDayEligible: true },
  { key: "oversoldRebound", label: "超跌反弹", nextDayEligible: true },
  { key: "relativeStrength", label: "相对强弱", nextDayEligible: true },
];

const REFERENCE_SYMBOLS = new Set(["000300", "000985", "000001"]);

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calculateKdj(history, period = 9) {
  const result = [];
  let k = 50;
  let d = 50;

  for (let index = 0; index < history.length; index += 1) {
    const slice = history.slice(Math.max(0, index - period + 1), index + 1);
    const highs = slice.map((item) => numberOrNull(item.high)).filter(Number.isFinite);
    const lows = slice.map((item) => numberOrNull(item.low)).filter(Number.isFinite);
    const close = numberOrNull(history[index].close);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const rsv = !Number.isFinite(close) || high === low ? 50 : ((close - low) / (high - low)) * 100;
    k = (2 * k + rsv) / 3;
    d = (2 * d + k) / 3;
    result.push({ k, d, j: 3 * k - 2 * d });
  }

  return result;
}

function calculateBollinger(closes, period = 20, multiplier = 2) {
  const middle = movingAverage(closes, period);
  const upper = Array(closes.length).fill(null);
  const lower = Array(closes.length).fill(null);

  for (let index = period - 1; index < closes.length; index += 1) {
    const values = closes.slice(index - period + 1, index + 1);
    const mean = middle[index];
    const variance = average(values.map((value) => (value - mean) ** 2));
    const deviation = Math.sqrt(variance ?? 0);
    upper[index] = mean + multiplier * deviation;
    lower[index] = mean - multiplier * deviation;
  }

  return { middle, upper, lower };
}

function returnOver(closes, index, days) {
  if (index < days || !Number.isFinite(closes[index]) || !Number.isFinite(closes[index - days])) {
    return null;
  }
  return percentChange(closes[index], closes[index - days]);
}

function isBroadBasedEtf(name = "") {
  return /沪深|中证|上证|深证|创业|科创|全指|A50|(?:^|\D)(?:300|500|800|1000|2000)(?:\D|$)/.test(name);
}

function findReferenceSeries(inputSeries) {
  return inputSeries.find((item) => item.symbol === "000300")
    || inputSeries.find((item) => item.symbol === "000985")
    || inputSeries.find((item) => item.symbol === "000001")
    || inputSeries.find((item) => item.category === "benchmark" || REFERENCE_SYMBOLS.has(item.symbol));
}

function enrichSeries(item, referenceByDate) {
  const closes = item.history.map((entry) => numberOrNull(entry.close));
  const volumes = item.history.map((entry) => numberOrNull(entry.volume));
  const ma20 = movingAverage(closes, 20);
  const ma60 = movingAverage(closes, 60);
  const vol20 = movingAverage(volumes, 20);
  const rsi14 = calculateRsi(closes, 14);
  const kdj = calculateKdj(item.history);
  const bollinger = calculateBollinger(closes);

  return item.history.map((entry, index) => {
    const referenceIndex = referenceByDate?.get(entry.dateKey);
    const relative20 = Number.isInteger(referenceIndex)
      ? (returnOver(closes, index, 20) ?? 0) - (returnOver(referenceByDate.closes, referenceIndex, 20) ?? 0)
      : null;
    const relative60 = Number.isInteger(referenceIndex)
      ? (returnOver(closes, index, 60) ?? 0) - (returnOver(referenceByDate.closes, referenceIndex, 60) ?? 0)
      : null;
    const prior20High = index >= 20 ? Math.max(...closes.slice(index - 20, index)) : null;
    const prior60High = index >= 60 ? Math.max(...closes.slice(index - 60, index)) : null;

    return {
      ...entry,
      close: closes[index],
      volume: volumes[index],
      ma20: ma20[index],
      ma60: ma60[index],
      vol20: vol20[index],
      rsi14: rsi14[index],
      kdj: kdj[index],
      bollingerLower: bollinger.lower[index],
      bollingerMiddle: bollinger.middle[index],
      return20: returnOver(closes, index, 20),
      return60: returnOver(closes, index, 60),
      return120: returnOver(closes, index, 120),
      relative20,
      relative60,
      relativeScore: relative20 === null && relative60 === null
        ? null
        : (relative20 ?? 0) * 0.65 + (relative60 ?? 0) * 0.35,
      prior20High,
      prior60High,
    };
  });
}

function buildMomentumRanks(etfSeries, dateKey) {
  const ranked = etfSeries
    .map((item) => {
      const record = item.series.find((entry) => entry.dateKey === dateKey);
      if (!record || ![record.return20, record.return60, record.return120].every(Number.isFinite)) {
        return null;
      }
      return {
        symbol: item.symbol,
        score: record.return20 * 0.5 + record.return60 * 0.3 + record.return120 * 0.2,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return new Map(ranked.map((item, index) => [item.symbol, { ...item, rank: index + 1, universeSize: ranked.length }]));
}

function evaluateMomentumRotation(record, rank) {
  const score = rank?.score ?? null;
  const matched = Boolean(rank && rank.rank <= Math.min(5, rank.universeSize));
  return {
    matched,
    score: toFixedNumber(score),
    reasons: [
      `20日收益=${toFixedNumber(record.return20)}%`,
      `60日收益=${toFixedNumber(record.return60)}%`,
      `120日收益=${toFixedNumber(record.return120)}%`,
      rank ? `综合动量排名=${rank.rank}/${rank.universeSize}` : "历史数据不足 120 日",
      "建议按周或月复核调仓",
    ],
  };
}

function evaluateTrendFollowing(record) {
  const matched = [record.ma20, record.ma60, record.close].every(Number.isFinite)
    && record.ma20 > record.ma60
    && record.close > record.ma20;
  return {
    matched,
    score: matched ? 100 : 0,
    reasons: [
      `MA20=${toFixedNumber(record.ma20)}`,
      `MA60=${toFixedNumber(record.ma60)}`,
      `收盘站上MA20=${record.close > record.ma20 ? "是" : "否"}`,
      "收盘跌破 MA20 或 MA20 下穿 MA60 时退出",
    ],
  };
}

function evaluateVolumeBreakout(record) {
  const breaks20 = Number.isFinite(record.prior20High) && record.close > record.prior20High;
  const breaks60 = Number.isFinite(record.prior60High) && record.close > record.prior60High;
  const volumeRatio = record.vol20 ? record.volume / record.vol20 : null;
  const matched = (breaks20 || breaks60) && Number.isFinite(volumeRatio) && volumeRatio >= 1.5;
  return {
    matched,
    score: matched ? toFixedNumber(Math.min(100, 60 + volumeRatio * 15)) : 0,
    reasons: [
      `突破20日高点=${breaks20 ? "是" : "否"}`,
      `突破60日高点=${breaks60 ? "是" : "否"}`,
      `量能/20日均量=${toFixedNumber(volumeRatio, 2)}`,
      "适用于行业与主题 ETF",
    ],
  };
}

function evaluateOversoldRebound(item, record, previous) {
  const broadBased = isBroadBasedEtf(item.name);
  const rsiRebound = Number.isFinite(previous?.rsi14) && Number.isFinite(record.rsi14)
    && previous.rsi14 < 30 && record.rsi14 > previous.rsi14;
  const bollingerRebound = Number.isFinite(previous?.bollingerLower) && Number.isFinite(record.bollingerLower)
    && previous.close <= previous.bollingerLower && record.close > record.bollingerLower;
  const kdjGoldenCross = Number.isFinite(previous?.kdj?.k) && Number.isFinite(previous?.kdj?.d)
    && Number.isFinite(record.kdj?.k) && Number.isFinite(record.kdj?.d)
    && previous.kdj.k <= previous.kdj.d && record.kdj.k > record.kdj.d && record.kdj.j < 35;
  const liquidityConfirmed = Number.isFinite(record.volume) && Number.isFinite(record.vol20) && record.volume >= record.vol20 * 0.5;
  const confirmations = [rsiRebound, bollingerRebound, kdjGoldenCross].filter(Boolean).length;
  return {
    matched: broadBased && liquidityConfirmed && confirmations >= 2,
    score: broadBased ? confirmations * 35 + (liquidityConfirmed ? 10 : 0) : 0,
    reasons: [
      `宽基ETF=${broadBased ? "是" : "否"}`,
      `RSI超卖回升=${rsiRebound ? "是" : "否"}`,
      `布林下轨反弹=${bollingerRebound ? "是" : "否"}`,
      `KDJ金叉=${kdjGoldenCross ? "是" : "否"}`,
      `量能/20日均量=${toFixedNumber(record.vol20 ? record.volume / record.vol20 : null, 2)}`,
    ],
  };
}

function evaluateRelativeStrength(record) {
  const trendUp = [record.close, record.ma20, record.ma60].every(Number.isFinite)
    && record.close > record.ma20
    && record.ma20 > record.ma60;
  const matched = trendUp && Number.isFinite(record.relative20) && Number.isFinite(record.relative60)
    && record.relative20 > 0 && record.relative60 > 0;
  return {
    matched,
    score: toFixedNumber(record.relativeScore),
    reasons: [
      `相对基准20日=${toFixedNumber(record.relative20)}%`,
      `相对基准60日=${toFixedNumber(record.relative60)}%`,
      `自身趋势向上=${trendUp ? "是" : "否"}`,
      "基准优先使用沪深300，其次中证全指，缺失时使用上证指数",
    ],
  };
}

function nextDayOutcome(series, index, targetGainPct) {
  const entry = series[index + 1];
  if (!entry || !Number.isFinite(entry.open)) {
    return null;
  }
  const highGain = percentChange(entry.high, entry.open);
  const closeGain = percentChange(entry.close, entry.open);
  const hitTarget = Number.isFinite(highGain) && Number.isFinite(targetGainPct) && highGain >= targetGainPct;
  return {
    predictionDate: entry.date,
    entryDate: entry.date,
    entryPrice: entry.open,
    exitDate: entry.date,
    exitPrice: entry.close,
    realizedPct: toFixedNumber(closeGain),
    hitTarget,
    success: hitTarget,
  };
}

function buildMetrics(selections, forecastOnly) {
  return STRATEGIES.map(({ key, label }) => {
    const triggered = selections.filter((item) => item.perStrategy[key].matched);
    if (forecastOnly) {
      return { key, label, nextDayEligible: STRATEGIES.find((strategy) => strategy.key === key).nextDayEligible, triggerCount: triggered.length };
    }

    const outcomes = triggered.map((item) => item.perStrategy[key].outcome).filter(Boolean);
    const gains = outcomes.map((item) => item.realizedPct).filter(Number.isFinite);
    const successes = outcomes.filter((item) => item.success).length;
    const positives = gains.filter((value) => value > 0);
    const negatives = gains.filter((value) => value <= 0);
    const cumulative = [];
    gains.reduce((total, value) => {
      const current = total + value;
      cumulative.push(current);
      return current;
    }, 0);
    let peak = 0;
    let maxDrawdown = 0;
    for (const value of cumulative) {
      peak = Math.max(peak, value);
      maxDrawdown = Math.min(maxDrawdown, value - peak);
    }

    return {
      key,
      label,
      nextDayEligible: STRATEGIES.find((strategy) => strategy.key === key).nextDayEligible,
      triggerCount: triggered.length,
      winRate: outcomes.length ? toFixedNumber((successes / outcomes.length) * 100) : null,
      avgGainPct: gains.length ? toFixedNumber(average(gains)) : null,
      profitLossRatio: positives.length && negatives.length
        ? toFixedNumber(average(positives) / Math.abs(average(negatives)))
        : null,
      maxDrawdownPct: toFixedNumber(maxDrawdown),
    };
  });
}

function analyze(inputSeries, options, forecastOnly) {
  const reference = findReferenceSeries(inputSeries);
  const referenceCloses = reference?.history.map((entry) => numberOrNull(entry.close)) || [];
  const referenceByDate = new Map((reference?.history || []).map((entry, index) => [entry.dateKey, index]));
  referenceByDate.closes = referenceCloses;
  const etfs = inputSeries.filter((item) => item.category === "etf");
  const enrichedEtfs = etfs.map((item) => ({ ...item, series: enrichSeries(item, referenceByDate) }));
  const momentumRanks = buildMomentumRanks(enrichedEtfs, options.dateKey);
  const selections = [];

  for (const item of enrichedEtfs) {
    const index = item.series.findIndex((entry) => entry.dateKey === options.dateKey);
    if (index < 20) {
      continue;
    }
    const record = item.series[index];
    const previous = item.series[index - 1];
    const perStrategy = {
      momentumRotation: evaluateMomentumRotation(record, momentumRanks.get(item.symbol)),
      trendFollowing: evaluateTrendFollowing(record),
      volumeBreakout: evaluateVolumeBreakout(record),
      oversoldRebound: evaluateOversoldRebound(item, record, previous),
      relativeStrength: evaluateRelativeStrength(record),
    };

    for (const strategy of STRATEGIES) {
      perStrategy[strategy.key].nextDayEligible = strategy.nextDayEligible;
      perStrategy[strategy.key].outcome = !forecastOnly && strategy.nextDayEligible && perStrategy[strategy.key].matched
        ? nextDayOutcome(item.series, index, options.targetGainPct)
        : null;
    }

    selections.push({
      symbol: item.symbol,
      name: item.name,
      category: item.category,
      date: record.date,
      predictionDate: options.predictionDate || item.series[index + 1]?.date || null,
      close: toFixedNumber(record.close),
      changePct: toFixedNumber(record.changePct),
      volume: record.volume,
      ma20: toFixedNumber(record.ma20),
      rsi14: toFixedNumber(record.rsi14),
      relativeStrength20: toFixedNumber(record.relative20),
      perStrategy,
    });
  }

  return {
    dateKey: options.dateKey,
    predictionDateKey: options.predictionDate?.replaceAll("-", "")
      || selections.find((item) => item.predictionDate)?.predictionDate?.replaceAll("-", "")
      || null,
    targetGainPct: options.targetGainPct,
    referenceName: reference?.name || "无可用基准",
    metrics: buildMetrics(selections, forecastOnly),
    selections,
    forecastOnly,
  };
}

export function analyzeStrategies(inputSeries, options) {
  return analyze(inputSeries, options, false);
}

export function predictNextTradingDay(inputSeries, options) {
  return analyze(inputSeries, options, true);
}

export { STRATEGIES };
