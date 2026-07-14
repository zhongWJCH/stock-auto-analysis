import assert from "node:assert/strict";
import test from "node:test";

import { analyzeStrategies, predictNextTradingDay } from "../src/services/strategy-service.js";

function dateAt(index) {
  const day = new Date(Date.UTC(2024, 0, 2 + index));
  return day.toISOString().slice(0, 10);
}

function makeSeries({ symbol, name, category, closeAt, volumeAt }) {
  const history = [];
  for (let index = 0; index < 132; index += 1) {
    const close = closeAt(index);
    const open = close * 0.995;
    const date = dateAt(index);
    history.push({
      date,
      dateKey: date.replaceAll("-", ""),
      open,
      close,
      high: close * 1.02,
      low: close * 0.98,
      volume: volumeAt(index),
      changePct: index ? ((close / closeAt(index - 1)) - 1) * 100 : 0,
    });
  }
  return { symbol, name, category, history };
}

const benchmark = makeSeries({
  symbol: "000300",
  name: "沪深300",
  category: "benchmark",
  closeAt: (index) => 100 + index * 0.05,
  volumeAt: () => 100,
});

const broadEtf = makeSeries({
  symbol: "510300",
  name: "沪深300ETF",
  category: "etf",
  closeAt: (index) => 10 + index * 0.15,
  volumeAt: () => 100,
});

const themeEtf = makeSeries({
  symbol: "512480",
  name: "半导体ETF",
  category: "etf",
  closeAt: (index) => (index === 130 ? 30 : 10 + index * 0.05),
  volumeAt: (index) => (index === 130 ? 250 : 100),
});

const signalDate = broadEtf.history[130].dateKey;

test("only ETFs are evaluated with the five replacement strategies", () => {
  const stock = { ...broadEtf, symbol: "600000", name: "示例股票", category: "stock" };
  const result = analyzeStrategies([broadEtf, themeEtf, stock, benchmark], {
    dateKey: signalDate,
    targetGainPct: 1,
  });

  assert.equal(result.referenceName, "沪深300");
  assert.equal(result.metrics.length, 5);
  assert.deepEqual(result.selections.map((item) => item.category), ["etf", "etf"]);
  const broadSelection = result.selections.find((item) => item.symbol === "510300");
  assert.equal(broadSelection.perStrategy.trendFollowing.matched, true);
  assert.equal(result.selections.find((item) => item.symbol === "512480").perStrategy.volumeBreakout.matched, true);
  assert.equal(broadSelection.perStrategy.momentumRotation.nextDayEligible, false);
  assert.equal(broadSelection.perStrategy.momentumRotation.outcome, null);
});

test("forecast mode returns ETF candidates without historical outcomes", () => {
  const result = predictNextTradingDay([broadEtf, themeEtf, benchmark], {
    dateKey: signalDate,
    predictionDate: broadEtf.history[131].date,
    targetGainPct: 1,
  });

  assert.equal(result.forecastOnly, true);
  assert.equal(result.selections[0].perStrategy.momentumRotation.nextDayEligible, false);
  assert.equal(result.selections[0].perStrategy.trendFollowing.outcome, null);
  assert.ok(result.selections.some((item) => Object.values(item.perStrategy).some((strategy) => strategy.matched)));
});
