import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { paths } from "../config.js";

const runtimeFiles = {
  symbols: join(paths.publicDataDir, "symbols.json"),
  snapshot: join(paths.publicDataDir, "market-snapshot.json"),
  meta: join(paths.publicDataDir, "meta.json"),
};

function isSupportedSymbol(item) {
  if (!item?.symbol) {
    return false;
  }
  if (item.category === "benchmark") {
    return item.symbol === "000001";
  }
  if (item.category === "etf") {
    return /^(5|1)\d{5}$/.test(item.symbol);
  }
  if (item.category === "stock") {
    return /^(?:(?:000|001|002|003|300|301|430|600|601|603|605|688|689)\d{3}|[89]\d{5})$/.test(item.symbol);
  }
  return false;
}

export async function ensureWorkspace() {
  await mkdir(paths.dataDir, { recursive: true });
  await mkdir(paths.publicDataDir, { recursive: true });
  await mkdir(paths.publicHistoryDir, { recursive: true });
  await mkdir(paths.runtimeDir, { recursive: true });
}

export async function writeJson(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function saveSymbols(symbols) {
  await writeJson(runtimeFiles.symbols, symbols);
}

export async function saveMarketSnapshot(snapshot) {
  await writeJson(runtimeFiles.snapshot, snapshot);
}

export async function saveMeta(meta) {
  await writeJson(runtimeFiles.meta, meta);
}

export async function writeHistory(symbol, payload) {
  await writeJson(join(paths.publicHistoryDir, `${symbol}.json`), payload);
}

export async function readPublicSymbols() {
  const symbols = await readJson(runtimeFiles.symbols, []);
  return symbols.filter(isSupportedSymbol);
}
