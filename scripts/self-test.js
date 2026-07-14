import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { analyzeStrategies } from "../src/services/strategy-service.js";
import { paths } from "../src/config.js";
import { formatDateKey } from "../src/utils.js";

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const [symbols, snapshot, meta] = await Promise.all([
    readJson(join(paths.publicDataDir, "symbols.json")),
    readJson(join(paths.publicDataDir, "market-snapshot.json")),
    readJson(join(paths.publicDataDir, "meta.json")),
  ]);
  const failedSymbols = new Set((meta.historyFailures || []).map((item) => item.symbol));

  console.log("Snapshot summary:");
  console.log(
    JSON.stringify(
      {
        symbolCount: symbols.length,
        macroCount: snapshot.macros?.length || 0,
        latestSyncAt: meta.latestSyncAt || null,
        source: meta.source || null,
      },
      null,
      2,
    ),
  );

  const selected = symbols
    .filter((item) => item.category === "etf" && !failedSymbols.has(item.symbol))
    .slice(0, 6);
  const benchmarks = symbols.filter((item) => item.category === "benchmark");
  const targets = [...selected, ...benchmarks];

  const histories = await Promise.all(
    targets.map(async (item) => {
      const payload = await readJson(join(paths.publicHistoryDir, `${item.symbol}.json`));
      return {
        symbol: item.symbol,
        name: item.name,
        category: item.category,
        history: payload.history,
      };
    }),
  );

  const analysis = analyzeStrategies(histories, {
    dateKey: formatDateKey("2024-03-29"),
    targetGainPct: 3,
  });

  console.log("Analysis metrics:");
  console.log(JSON.stringify(analysis.metrics, null, 2));
  console.log("Selection sample:");
  console.log(JSON.stringify(analysis.selections.slice(0, 2), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
