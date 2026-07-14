import { eastmoneyConfig } from "../config.js";
import { formatDateKey, toFixedNumber } from "../utils.js";

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://quote.eastmoney.com/",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchClistAll(fs, category, filter) {
  const pageSize = 200;
  const all = [];
  let totalPages = 1;

  for (let page = 1; page <= totalPages; page += 1) {
    const url = buildUrl(eastmoneyConfig.listUrl, {
      ...eastmoneyConfig.commonParams,
      pn: page,
      pz: pageSize,
      po: 1,
      fid: "f3",
      fs,
      fields: "f12,f14,f2,f3,f6",
    });

    const json = await fetchJson(url);
    const total = Number(json.data?.total || 0);
    const diff = json.data?.diff || [];
    totalPages = Math.max(1, Math.ceil(total / pageSize));
    all.push(
      ...diff
        .map((item) => mapListRecord(item, category))
        .filter((item) => (typeof filter === "function" ? filter(item) : true)),
    );
  }

  return all;
}

function mapListRecord(raw, category) {
  const symbol = raw.f12;
  const name = raw.f14;
  const exchangePrefix = symbol.startsWith("5") || symbol.startsWith("6") || symbol.startsWith("9") || symbol.startsWith("8") ? "1" : "0";
  return {
    symbol,
    secid: `${exchangePrefix}.${symbol}`,
    name,
    category,
    latestPrice: toFixedNumber(raw.f2),
    latestChangePct: toFixedNumber(raw.f3),
    turnover: toFixedNumber(raw.f6, 0),
  };
}

function normalizeMacroPrice(targetKey, rawValue) {
  if (!Number.isFinite(rawValue) || rawValue === 0) {
    return null;
  }
  if (targetKey === "usdCny") {
    return toFixedNumber(rawValue / 10000, 4);
  }
  return toFixedNumber(rawValue / 100, 2);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseKline(rawLine) {
  const [
    date,
    open,
    close,
    high,
    low,
    volume,
    amount,
    amplitude,
    changePct,
    changeAmount,
    turnoverRate,
  ] = rawLine.split(",");

  return {
    date,
    dateKey: formatDateKey(date),
    open: toFixedNumber(open),
    close: toFixedNumber(close),
    high: toFixedNumber(high),
    low: toFixedNumber(low),
    volume: toFixedNumber(volume, 0),
    amount: toFixedNumber(amount, 0),
    amplitude: toFixedNumber(amplitude),
    changePct: toFixedNumber(changePct),
    changeAmount: toFixedNumber(changeAmount),
    turnoverRate: toFixedNumber(turnoverRate),
  };
}

export async function fetchUniverseSymbols() {
  return fetchClistAll("b:MK0021,b:MK0022,b:MK0023,b:MK0024", "etf");
}

export async function fetchHistoricalKlines(secid, options = {}) {
  const url = buildUrl(eastmoneyConfig.historyUrl, {
    secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: 101,
    fqt: 1,
    beg: formatDateKey(options.startDate || "2020-01-01"),
    end: formatDateKey(options.endDate || "2050-01-01"),
  });

  const json = await fetchJson(url);
  const klines = json.data?.klines || [];
  return klines.map(parseKline);
}

export async function fetchBenchmarkHistory(options = {}) {
  return fetchHistoricalKlines(options.secid || "1.000001", options);
}

async function fetchMacroFromStooq(symbol, key, label, name) {
  const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcvn&e=csv`;
  const text = await fetchText(url);
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Unexpected Stooq response");
  }
  const values = lines[1].split(",");
  return {
    key,
    label,
    name,
    price: toFixedNumber(values[6]),
    changeAmount: null,
    changePct: null,
    source: "stooq",
  };
}

export async function fetchMacroSnapshot() {
  const targets = [
    {
      key: "usdCny",
      label: "美元/人民币",
      secid: "133.USDCNH",
    },
    {
      key: "usdIndex",
      label: "美元指数",
      secid: "100.UDI",
    },
    {
      key: "spotGold",
      label: "黄金",
      secid: "122.XAUUSD",
    },
    {
      key: "crudeOil",
      label: "石油",
      secid: "104.CLC",
    },
  ];

  const results = await Promise.all(
    targets.map(async (target) => {
      const url = buildUrl(eastmoneyConfig.quoteUrl, {
        secid: target.secid,
        fields: "f43,f58,f169,f170",
        ut: eastmoneyConfig.commonParams.ut,
      });

      try {
        const json = await fetchJson(url);
        const data = json.data || {};
        return {
          key: target.key,
          label: target.label,
          price: normalizeMacroPrice(target.key, Number(data.f43)),
          name: data.f58 || target.label,
          changeAmount: normalizeMacroPrice(target.key, Number(data.f169)),
          changePct: toFixedNumber((data.f170 || 0) / 100),
          source: "eastmoney",
        };
      } catch {
        return {
          key: target.key,
          label: target.label,
          price: null,
          name: target.label,
          changeAmount: null,
          changePct: null,
          source: "eastmoney",
          unavailable: true,
        };
      }
    }),
  );

  const fallbackTasks = [
    {
      key: "spotGold",
      loader: () => fetchMacroFromStooq("xauusd", "spotGold", "黄金", "XAUUSD"),
    },
    {
      key: "crudeOil",
      loader: () => fetchMacroFromStooq("cl.f", "crudeOil", "石油", "CL"),
    },
  ];

  for (const task of fallbackTasks) {
    const target = results.find((item) => item.key === task.key);
    if (target?.price !== null) {
      continue;
    }
    try {
      const fallback = await task.loader();
      const index = results.findIndex((item) => item.key === task.key);
      if (index >= 0) {
        results[index] = fallback;
      } else {
        results.push(fallback);
      }
    } catch {
      if (target) {
        target.unavailable = true;
      }
    }
  }

  return results;
}
