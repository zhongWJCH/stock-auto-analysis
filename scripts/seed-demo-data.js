import { ensureWorkspace, saveMarketSnapshot, saveMeta, saveSymbols, writeHistory } from "../src/services/storage-service.js";

function makeHistory(symbol, name, category, basePrice, volatility) {
  const history = [];
  const start = new Date("2024-01-02T00:00:00Z");
  let price = basePrice;

  for (let index = 0; index < 160; index += 1) {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + index);
    if ([0, 6].includes(current.getUTCDay())) {
      continue;
    }
    const drift = Math.sin(index / 11) * volatility + Math.cos(index / 7) * (volatility / 2);
    const open = Math.max(1, price + drift * 0.6);
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.abs(drift) * 0.8;
    const low = Math.min(open, close) - Math.abs(drift) * 0.8;
    const volume = Math.round(100000 + index * 2000 + Math.abs(drift) * 50000);
    const date = current.toISOString().slice(0, 10);
    history.push({
      date,
      dateKey: date.replaceAll("-", ""),
      open: Number(open.toFixed(2)),
      close: Number(close.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      volume,
      amount: Math.round(volume * close),
      amplitude: Number((((high - low) / open) * 100).toFixed(2)),
      changePct: history.length
        ? Number((((close - history.at(-1).close) / history.at(-1).close) * 100).toFixed(2))
        : 0,
      changeAmount: history.length ? Number((close - history.at(-1).close).toFixed(2)) : 0,
      turnoverRate: Number((1 + Math.abs(drift) * 0.4).toFixed(2)),
    });
    price = close;
  }

  return {
    symbol,
    name,
    secid: symbol.startsWith("6") ? `1.${symbol}` : `0.${symbol}`,
    category,
    updatedAt: new Date().toISOString(),
    history,
  };
}

const symbols = [
  { symbol: "510300", name: "沪深300ETF", category: "etf", latestPrice: 3.58, latestChangePct: 0.88, secid: "1.510300" },
  { symbol: "510050", name: "上证50ETF", category: "etf", latestPrice: 2.68, latestChangePct: 0.43, secid: "1.510050" },
  { symbol: "000300", name: "沪深300", category: "benchmark", latestPrice: 3600.12, latestChangePct: 0.61, secid: "1.000300" },
  { symbol: "000985", name: "中证全指", category: "benchmark", latestPrice: 5200.12, latestChangePct: 0.61, secid: "1.000985" },
  { symbol: "000001", name: "上证指数", category: "benchmark", latestPrice: 3120.12, latestChangePct: 0.61, secid: "1.000001" },
];

await ensureWorkspace();
await saveSymbols(symbols);
for (const item of symbols) {
  const base = item.latestPrice;
  const vol = item.category === "etf" ? 0.08 : 0.45;
  await writeHistory(item.symbol, makeHistory(item.symbol, item.name, item.category, base, vol));
}

await saveMarketSnapshot({
  macros: [
    { key: "usdCny", label: "美元/人民币", price: 7.12, changePct: 0.15, changeAmount: 0.01, source: "demo" },
    { key: "usdIndex", label: "美元指数", price: 105.4, changePct: -0.22, changeAmount: -0.23, source: "demo" },
    { key: "spotGold", label: "黄金", price: 2328.7, changePct: 0.58, changeAmount: 13.4, source: "demo" },
    { key: "crudeOil", label: "石油", price: 79.6, changePct: -0.34, changeAmount: -0.27, source: "demo" },
  ],
  topMovers: symbols.slice(0, 5),
});

await saveMeta({
  latestSyncAt: new Date().toISOString(),
  source: "Demo seed data",
  sourceNotes: ["Use npm run sync when network access is available to replace demo data."],
});

console.log("Demo data seeded.");
