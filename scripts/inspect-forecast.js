import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { predictNextTradingDay } from "../src/services/strategy-service.js";
import { paths } from "../src/config.js";
import { formatDateKey } from "../src/utils.js";

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const [symbols, meta] = await Promise.all([
    readJson(join(paths.publicDataDir, "symbols.json")),
    readJson(join(paths.publicDataDir, "meta.json")),
  ]);
  const failed = new Set((meta.historyFailures || []).map((item) => item.symbol));
  const selected = symbols.filter((item) => !failed.has(item.symbol));

  const histories = await Promise.all(
    selected.map(async (item) => {
      const payload = await readJson(join(paths.publicHistoryDir, `${item.symbol}.json`));
      return {
        symbol: item.symbol,
        name: item.name,
        category: item.category,
        history: payload.history,
      };
    }),
  );

  const forecast = predictNextTradingDay(histories, {
    dateKey: formatDateKey("2026-06-26"),
    predictionDate: "2026-06-29",
    targetGainPct: 3,
  });

  console.log("metrics", JSON.stringify(forecast.metrics, null, 2));
  console.log("matched rotation", forecast.selections.filter((x) => x.perStrategy.momentumRotation.matched).length);
  console.log("matched trend", forecast.selections.filter((x) => x.perStrategy.trendFollowing.matched).length);
  console.log("matched breakout", forecast.selections.filter((x) => x.perStrategy.volumeBreakout.matched).length);
  console.log("matched rebound", forecast.selections.filter((x) => x.perStrategy.oversoldRebound.matched).length);
  console.log("matched strength", forecast.selections.filter((x) => x.perStrategy.relativeStrength.matched).length);
  console.log(
    "sample matched",
    JSON.stringify(
      forecast.selections
        .filter(
          (x) =>
            Object.values(x.perStrategy).some((strategy) => strategy.matched),
        )
        .slice(0, 10),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
