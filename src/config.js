import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

export const paths = {
  rootDir,
  dataDir: join(rootDir, "data"),
  distDir: join(rootDir, "dist"),
  historyDir: join(rootDir, "data", "history"),
  publicDataDir: join(rootDir, "public", "data"),
  publicHistoryDir: join(rootDir, "public", "data", "history"),
  runtimeDir: join(rootDir, "data", "runtime"),
};

export const appConfig = {
  defaultStartDate: "2024-01-01",
  syncChunkSize: 20,
};

export const eastmoneyConfig = {
  listUrl: "https://push2.eastmoney.com/api/qt/clist/get",
  historyUrl: "https://push2his.eastmoney.com/api/qt/stock/kline/get",
  quoteUrl: "https://push2.eastmoney.com/api/qt/stock/get",
  commonParams: {
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    np: "1",
  },
};
