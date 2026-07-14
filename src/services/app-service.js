import { appConfig } from "../config.js";
import {
  fetchBenchmarkHistory,
  fetchHistoricalKlines,
  fetchMacroSnapshot,
  fetchUniverseSymbols,
} from "../data-sources/eastmoney.js";
import { ensureWorkspace, saveMarketSnapshot, saveMeta, saveSymbols, writeHistory } from "./storage-service.js";

function computeTopMovers(symbols) {
  return [...symbols]
    .filter((item) => Number.isFinite(item.latestChangePct))
    .sort((a, b) => Math.abs(b.latestChangePct) - Math.abs(a.latestChangePct))
    .slice(0, 12);
}

async function syncHistories(symbols, options = {}) {
  const startDate = options.startDate || appConfig.defaultStartDate;
  const failures = [];

  for (let start = 0; start < symbols.length; start += appConfig.syncChunkSize) {
    const chunk = symbols.slice(start, start + appConfig.syncChunkSize);
    const results = await Promise.all(
      chunk.map(async (symbol) => {
        try {
          const history = await fetchHistoricalKlines(symbol.secid, { startDate });
          if (!history.length) {
            throw new Error("No history rows returned");
          }
          await writeHistory(symbol.symbol, {
            symbol: symbol.symbol,
            name: symbol.name,
            secid: symbol.secid,
            category: symbol.category,
            startDate,
            latestDate: history.at(-1)?.date || null,
            updatedAt: new Date().toISOString(),
            history,
          });
          return { symbol: symbol.symbol, ok: true };
        } catch (error) {
          failures.push({
            symbol: symbol.symbol,
            message: error instanceof Error ? error.message : "History sync failed",
          });
          return { symbol: symbol.symbol, ok: false };
        }
      }),
    );

    const completed = results.filter((item) => item.ok).length;
    console.log(`Synced ${completed}/${chunk.length} symbols in chunk ${start / appConfig.syncChunkSize + 1}`);
  }

  return failures;
}

export async function syncAllData(options = {}) {
  await ensureWorkspace();

  const symbols = await fetchUniverseSymbols();
  const benchmarkSymbols = [
    { symbol: "000300", secid: "1.000300", name: "沪深300", category: "benchmark" },
    { symbol: "000985", secid: "1.000985", name: "中证全指", category: "benchmark" },
    { symbol: "000001", secid: "1.000001", name: "上证指数", category: "benchmark" },
  ].map((item) => ({ ...item, latestPrice: null, latestChangePct: null, turnover: null }));
  const allSymbols = [...symbols, ...benchmarkSymbols];
  const macros = await fetchMacroSnapshot();
  const topMovers = computeTopMovers(symbols);

  await saveSymbols(allSymbols);
  await saveMarketSnapshot({ macros, topMovers });

  const historyFailures = options.skipHistory ? [] : await syncHistories(allSymbols, options);
  let latestMarketDate = null;
  if (!options.skipHistory) {
    try {
      const history = await fetchBenchmarkHistory({
        secid: "1.000300",
        startDate: options.startDate || appConfig.defaultStartDate,
      });
      latestMarketDate = history.at(-1)?.date || null;
    } catch (error) {
      historyFailures.push({
        symbol: "000300",
        message: error instanceof Error ? error.message : "Benchmark sync failed",
      });
    }
  }

  const meta = {
    latestSyncAt: new Date().toISOString(),
    latestMarketDate,
    source: "Eastmoney public endpoints",
    sourceNotes: [
      "Universe includes exchange-traded ETFs plus relative-strength benchmark indices from Eastmoney.",
      "History and snapshot files are written for direct frontend consumption.",
    ],
    historyFailures,
  };

  await saveMeta(meta);

  return {
    ok: true,
    syncedSymbols: allSymbols.length,
    syncedHistories: allSymbols.length - historyFailures.length,
    failures: historyFailures,
    macros,
    topMovers,
    meta,
  };
}
