import { formatDateKey } from "../../utils.js";
import { analyzeStrategies, predictNextTradingDay } from "./analysis.js";

const historyCache = new Map();

function parseDateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextTradingDay(dateString) {
  const { year, month, day } = parseDateParts(dateString);
  const date = new Date(year, month - 1, day);
  do {
    date.setDate(date.getDate() + 1);
  } while ([0, 6].includes(date.getDay()));
  return formatLocalDate(date);
}

export function previousTradingDay(dateString) {
  const { year, month, day } = parseDateParts(dateString);
  const date = new Date(year, month - 1, day);
  do {
    date.setDate(date.getDate() - 1);
  } while ([0, 6].includes(date.getDay()));
  return formatLocalDate(date);
}

async function loadJson(url) {
  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`读取数据失败: ${response.status}`);
  }
  if (!contentType.includes("application/json")) {
    throw new Error(`本地数据文件不存在或未命中: ${url}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`本地数据文件解析失败: ${url}`);
  }
}

async function loadHistoryPayload(symbol) {
  if (!historyCache.has(symbol)) {
    historyCache.set(symbol, loadJson(`/data/history/${symbol}.json`));
  }
  return historyCache.get(symbol);
}

export async function loadSnapshotData() {
  const [symbols, macrosPayload, meta] = await Promise.all([
    loadJson("/data/symbols.json"),
    loadJson("/data/market-snapshot.json"),
    loadJson("/data/meta.json"),
  ]);

  const failedSymbols = new Set((meta.historyFailures || []).map((item) => item.symbol));

  return {
    symbols: symbols.filter((item) => {
      if (item.category === "benchmark") {
        return item.symbol === "000001";
      }
      if (failedSymbols.has(item.symbol)) {
        return false;
      }
      if (item.category === "stock") {
        return /^(?:(?:000|001|002|003|300|301|430|600|601|603|605|688|689)\d{3}|[89]\d{5})$/.test(item.symbol);
      }
      if (item.category === "etf") {
        return /^(5|1)\d{5}$/.test(item.symbol);
      }
      return false;
    }),
    macros: macrosPayload.macros || [],
    topMovers: macrosPayload.topMovers || [],
    meta,
  };
}

export async function loadSymbolHistory(symbol, limit = 90) {
  const payload = await loadHistoryPayload(symbol);
  return {
    symbol: payload.symbol,
    name: payload.name,
    category: payload.category,
    latestPrice: payload.history.at(-1)?.close ?? null,
    latestChangePct: payload.history.at(-1)?.changePct ?? null,
    history: payload.history.slice(-limit),
  };
}

export async function loadManyHistories(symbols, limit = 500, concurrency = 12) {
  const results = [];
  for (let start = 0; start < symbols.length; start += concurrency) {
    const chunk = symbols.slice(start, start + concurrency);
    const settled = await Promise.allSettled(
      chunk.map(async (item) => {
        const payload = await loadHistoryPayload(item.symbol);
        return {
          symbol: item.symbol,
          name: item.name,
          category: item.category,
          history: payload.history.slice(-limit),
        };
      }),
    );

    results.push(
      ...settled
        .filter((entry) => entry.status === "fulfilled")
        .map((entry) => entry.value),
    );
  }
  return results;
}

export async function loadLatestMarketDate() {
  const benchmark = await loadJson("/data/history/000001.json");
  return benchmark?.history?.at(-1)?.date || null;
}

export function calculateKdj(history, period = 9, kSmoothing = 3, dSmoothing = 3) {
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
    const j = 3 * k - 2 * d;
    result.push({
      date: history[index].date,
      k: Number(k.toFixed(2)),
      d: Number(d.toFixed(2)),
      j: Number(j.toFixed(2)),
    });
  }

  return result;
}

export async function runAnalysisFromStaticData({ date, targetGainPct, symbols }) {
  const snapshot = await loadSnapshotData();
  const selected = snapshot.symbols.filter((item) => symbols.includes(item.symbol));
  const benchmark = snapshot.symbols.find((item) => item.symbol === "000001");
  const targets = benchmark ? [...selected, benchmark] : selected;
  const histories = await loadManyHistories(targets, 500, 12);

  if (!histories.length) {
    throw new Error("没有可用于分析的本地历史数据，请先重新执行同步。");
  }

  const analysis = analyzeStrategies(histories, {
    dateKey: formatDateKey(date),
    targetGainPct: Number(targetGainPct || 3),
  });

  return {
    ...analysis,
    analysisDate: date,
    predictionScope: "下一交易日开盘买入，按后续真实走势验证是否达到目标涨幅",
    syncedAt: snapshot.meta?.latestSyncAt || null,
    source: snapshot.meta?.source || null,
  };
}

export async function predictFromStaticData({ date, targetGainPct, symbols }) {
  const snapshot = await loadSnapshotData();
  const selected = snapshot.symbols.filter((item) => symbols.includes(item.symbol));
  const benchmark = snapshot.symbols.find((item) => item.symbol === "000001");
  const targets = benchmark ? [...selected, benchmark] : selected;
  const histories = await loadManyHistories(targets, 500, 12);

  if (!histories.length) {
    throw new Error("没有可用于预测的本地历史数据，请先重新执行同步。");
  }

  const latestDate = snapshot.meta?.latestMarketDate
    || histories.flatMap((item) => item.history.map((entry) => entry.date)).sort().at(-1);
  const predictionDate = date || nextTradingDay(latestDate);
  const signalDate = previousTradingDay(predictionDate);
  const dateKey = formatDateKey(signalDate);
  const analysis = predictNextTradingDay(histories, {
    dateKey,
    predictionDate,
    targetGainPct: Number(targetGainPct || 3),
  });

  return {
    ...analysis,
    analysisDate: signalDate,
    targetDate: predictionDate,
    predictionScope: "当前为前瞻预测模式：基于最新可用交易日信号，筛出下一交易日的候选标的；真实结果尚未发生。",
    predictionDateKey: formatDateKey(predictionDate),
    syncedAt: snapshot.meta?.latestSyncAt || null,
    source: snapshot.meta?.source || null,
  };
}
