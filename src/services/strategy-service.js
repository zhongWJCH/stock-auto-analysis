import { average, calculateMacd, calculateRsi, movingAverage, percentChange, toFixedNumber } from "../utils.js";

function enrichHistory(history, benchmarkSeries = []) {
  const closes = history.map((item) => item.close);
  const opens = history.map((item) => item.open);
  const volumes = history.map((item) => item.volume);
  const ma5 = movingAverage(closes, 5);
  const ma10 = movingAverage(closes, 10);
  const ma20 = movingAverage(closes, 20);
  const vol5 = movingAverage(volumes, 5);
  const vol20 = movingAverage(volumes, 20);
  const rsi14 = calculateRsi(closes, 14);
  const macd = calculateMacd(closes);

  return history.map((item, index) => {
    const previous = history[index - 1];
    const recent20 = history.slice(Math.max(0, index - 19), index + 1).map((record) => record.close);
    const benchmark = benchmarkSeries[index];
    return {
      ...item,
      candleBullish: closes[index] > opens[index],
      ma5: ma5[index],
      ma10: ma10[index],
      ma20: ma20[index],
      vol5: vol5[index],
      vol20: vol20[index],
      rsi14: rsi14[index],
      diff: macd.diff[index],
      dea: macd.dea[index],
      macdHistogram: macd.macd[index],
      closeVsMa20Pct: ma20[index] ? percentChange(closes[index], ma20[index]) : null,
      volumeVsVol5Pct: vol5[index] ? percentChange(volumes[index], vol5[index]) : null,
      breakout20High: recent20.length >= 20 ? closes[index] >= Math.max(...recent20) : false,
      benchmarkDelta: benchmark?.changePct ?? null,
      stockDelta: previous ? percentChange(closes[index], previous.close) : item.changePct,
    };
  });
}

function computeBoardStrength(historyCollection, dateKey) {
  const changes = historyCollection
    .map((item) => item.series.find((entry) => entry.dateKey === dateKey)?.changePct)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);

  if (!changes.length) {
    return 0;
  }

  const median = changes[Math.floor(changes.length / 2)];
  const p80 = changes[Math.floor(changes.length * 0.2)] ?? changes[0];
  return median + (p80 - median) * 0.5;
}

function evaluateMeanReversion(record) {
  const conditions = [
    Number.isFinite(record.rsi14) && record.rsi14 < 30,
    Number.isFinite(record.closeVsMa20Pct) && record.closeVsMa20Pct <= -10,
    Number.isFinite(record.vol5) && record.volume <= record.vol5 * 0.5,
  ];
  return {
    matched: conditions.every(Boolean),
    reasons: [
      `RSI14=${toFixedNumber(record.rsi14)}`,
      `偏离20日均线=${toFixedNumber(record.closeVsMa20Pct)}%`,
      `量能/5日均量=${record.vol5 ? toFixedNumber(record.volume / record.vol5, 2) : null}`,
    ],
  };
}

function evaluateMomentumBreakout(record) {
  const conditions = [
    Number.isFinite(record.changePct) && record.changePct > 5,
    Number.isFinite(record.vol20) && record.volume >= record.vol20 * 1.5,
    record.breakout20High,
    Number.isFinite(record.benchmarkDelta) && Number.isFinite(record.stockDelta) && record.stockDelta - record.benchmarkDelta >= 2,
  ];
  return {
    matched: conditions.every(Boolean),
    reasons: [
      `涨幅=${toFixedNumber(record.changePct)}%`,
      `量能/20日均量=${record.vol20 ? toFixedNumber(record.volume / record.vol20, 2) : null}`,
      `20日新高=${record.breakout20High ? "是" : "否"}`,
      `跑赢基准=${toFixedNumber((record.stockDelta ?? 0) - (record.benchmarkDelta ?? 0))}%`,
    ],
  };
}

function evaluateCompositeScore(record, boardStrength) {
  let score = 0;
  const reasons = [];

  if (Number.isFinite(record.ma20) && record.close >= record.ma20) {
    score += 2;
    reasons.push("收盘站上20日均线");
  }
  if (Number.isFinite(record.ma20) && Number.isFinite(record.diff) && record.ma20 >= 0) {
    const rising = record.ma20 >= (record.previousMa20 ?? record.ma20);
    if (rising) {
      score += 1;
      reasons.push("20日均线向上");
    }
  }
  if (Number.isFinite(record.diff) && Number.isFinite(record.dea) && record.diff > 0 && record.diff >= record.dea) {
    score += 2;
    reasons.push("MACD 零轴上方且上行");
  }
  if (Number.isFinite(record.vol5) && record.volume > record.vol5) {
    score += 1;
    reasons.push("成交量高于5日均量");
  }
  if (record.candleBullish) {
    score += 1;
    reasons.push("当日阳线");
  }
  if (Number.isFinite(record.changePct) && record.changePct > 0) {
    score += 2;
    reasons.push("资金代理项为正");
  }
  if (Number.isFinite(boardStrength) && Number.isFinite(record.changePct) && record.changePct >= boardStrength) {
    score += 1;
    reasons.push("板块表现位于前列");
  }

  return {
    matched: score > 7,
    score,
    reasons,
  };
}

function computeTradeOutcome(history, index, strategyKey, targetGainPct) {
  const entry = history[index + 1];
  if (!entry) {
    return null;
  }

  const stopLossPct = -5;
  const horizon = strategyKey === "momentumBreakout" ? 3 : 5;
  let exit = history[Math.min(history.length - 1, index + horizon)];
  let hitTarget = false;

  for (let cursor = index + 1; cursor < Math.min(history.length, index + horizon + 1); cursor += 1) {
    const item = history[cursor];
    const highGain = percentChange(item.high, entry.open);
    const lowGain = percentChange(item.low, entry.open);
    if (Number.isFinite(lowGain) && lowGain <= stopLossPct) {
      exit = item;
      break;
    }
    if (Number.isFinite(highGain) && Number.isFinite(targetGainPct) && highGain >= targetGainPct) {
      exit = item;
      hitTarget = true;
      break;
    }
    if (strategyKey === "meanReversion" && Number.isFinite(item.ma10) && item.high >= item.ma10) {
      exit = item;
      break;
    }
    if (strategyKey === "momentumBreakout" && Number.isFinite(item.ma5) && item.close < item.ma5) {
      exit = item;
      break;
    }
    if (strategyKey === "compositeScore" && Number.isFinite(item.ma10) && item.close < item.ma10) {
      exit = item;
      break;
    }
  }

  const realizedPct = percentChange(exit.close, entry.open);
  return {
    predictionDate: entry.date,
    entryDate: entry.date,
    entryPrice: entry.open,
    exitDate: exit.date,
    exitPrice: exit.close,
    realizedPct: toFixedNumber(realizedPct),
    hitTarget,
    success: Number.isFinite(realizedPct) && Number.isFinite(targetGainPct) ? realizedPct >= targetGainPct : false,
  };
}

function buildMetrics(selections) {
  return [
    ["meanReversion", "超跌反弹"],
    ["momentumBreakout", "动量突破"],
    ["compositeScore", "综合评分"],
  ].map(([key, label]) => {
    const trades = selections
      .map((item) => item.perStrategy[key].outcome)
      .filter(Boolean);
    const gains = trades.map((item) => item.realizedPct).filter((value) => Number.isFinite(value));
    const wins = trades.filter((item) => item.success).length;
    const positives = gains.filter((value) => value > 0);
    const negatives = gains.filter((value) => value <= 0);
    const cumulative = [];
    gains.reduce((sumValue, value) => {
      const next = sumValue + value;
      cumulative.push(next);
      return next;
    }, 0);
    let peak = cumulative[0] ?? 0;
    let maxDrawdown = 0;
    cumulative.forEach((value) => {
      peak = Math.max(peak, value);
      maxDrawdown = Math.min(maxDrawdown, value - peak);
    });
    return {
      key,
      label,
      triggerCount: trades.length,
      winRate: trades.length ? toFixedNumber((wins / trades.length) * 100) : null,
      avgGainPct: gains.length ? toFixedNumber(average(gains)) : null,
      profitLossRatio:
        positives.length && negatives.length
          ? toFixedNumber(average(positives) / Math.abs(average(negatives)))
          : null,
      maxDrawdownPct: toFixedNumber(maxDrawdown),
    };
  });
}

function buildPredictionSelection(item, record, index, boardStrength, options = {}) {
  const meanReversion = evaluateMeanReversion(record);
  const momentumBreakout = evaluateMomentumBreakout(record);
  const compositeScore = evaluateCompositeScore(record, boardStrength);
  return {
    symbol: item.symbol,
    name: item.name,
    category: item.category,
    date: record.date,
    predictionDate: options.predictionDate || item.series[index + 1]?.date || null,
    close: record.close,
    changePct: record.changePct,
    volume: record.volume,
    ma20: toFixedNumber(record.ma20),
    rsi14: toFixedNumber(record.rsi14),
    perStrategy: {
      meanReversion: {
        ...meanReversion,
        outcome: meanReversion.matched
          ? computeTradeOutcome(item.series, index, "meanReversion", record.targetGainPct ?? null)
          : null,
      },
      momentumBreakout: {
        ...momentumBreakout,
        outcome: momentumBreakout.matched
          ? computeTradeOutcome(item.series, index, "momentumBreakout", record.targetGainPct ?? null)
          : null,
      },
      compositeScore: {
        ...compositeScore,
        outcome: compositeScore.matched
          ? computeTradeOutcome(item.series, index, "compositeScore", record.targetGainPct ?? null)
          : null,
      },
    },
  };
}

export function analyzeStrategies(inputSeries, options) {
  const benchmark = inputSeries.find((item) => item.symbol === "000001") || inputSeries[0];
  const benchmarkByDate = new Map((benchmark?.history || []).map((item) => [item.dateKey, item]));

  const enrichedHistories = inputSeries.map((item) => {
    const benchmarkSeries = item.history.map((entry) => benchmarkByDate.get(entry.dateKey) || null);
    const enriched = enrichHistory(item.history, benchmarkSeries);
    return {
      ...item,
      series: enriched.map((record, index) => ({
        ...record,
        previousMa20: enriched[index - 1]?.ma20 ?? null,
      })),
    };
  });

  const boardStrength = computeBoardStrength(enrichedHistories, options.dateKey);
  const selections = [];

  for (const item of enrichedHistories) {
    const index = item.series.findIndex((record) => record.dateKey === options.dateKey);
    if (index < 20) {
      continue;
    }
    const record = item.series[index];
    record.targetGainPct = options.targetGainPct;
    selections.push(buildPredictionSelection(item, record, index, boardStrength));
  }

  return {
    dateKey: options.dateKey,
    predictionDateKey: selections.find((item) => item.predictionDate)?.predictionDate?.replaceAll("-", "") || null,
    targetGainPct: options.targetGainPct,
    boardStrength: toFixedNumber(boardStrength),
    metrics: buildMetrics(selections),
    selections,
  };
}

export function predictNextTradingDay(inputSeries, options) {
  const benchmark = inputSeries.find((item) => item.symbol === "000001") || inputSeries[0];
  const benchmarkByDate = new Map((benchmark?.history || []).map((item) => [item.dateKey, item]));

  const enrichedHistories = inputSeries.map((item) => {
    const benchmarkSeries = item.history.map((entry) => benchmarkByDate.get(entry.dateKey) || null);
    const enriched = enrichHistory(item.history, benchmarkSeries);
    return {
      ...item,
      series: enriched.map((record, index) => ({
        ...record,
        previousMa20: enriched[index - 1]?.ma20 ?? null,
      })),
    };
  });

  const boardStrength = computeBoardStrength(enrichedHistories, options.dateKey);
  const selections = [];

  for (const item of enrichedHistories) {
    if (item.symbol === "000001") {
      continue;
    }
    const index = item.series.findIndex((record) => record.dateKey === options.dateKey);
    if (index < 20) {
      continue;
    }
    const record = item.series[index];
    selections.push({
      ...buildPredictionSelection(
        item,
        { ...record, targetGainPct: options.targetGainPct },
        index,
        boardStrength,
        { predictionDate: options.predictionDate },
      ),
      forecastOnly: true,
    });
  }

  return {
    dateKey: options.dateKey,
    predictionDateKey: options.predictionDateKey || null,
    targetGainPct: options.targetGainPct,
    boardStrength: toFixedNumber(boardStrength),
    metrics: [
      {
        key: "meanReversion",
        label: "超跌反弹",
        triggerCount: selections.filter((item) => item.perStrategy.meanReversion.matched).length,
      },
      {
        key: "momentumBreakout",
        label: "动量突破",
        triggerCount: selections.filter((item) => item.perStrategy.momentumBreakout.matched).length,
      },
      {
        key: "compositeScore",
        label: "综合评分",
        triggerCount: selections.filter((item) => item.perStrategy.compositeScore.matched).length,
      },
    ],
    selections,
    forecastOnly: true,
  };
}
