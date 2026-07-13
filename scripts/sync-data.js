import { syncAllData } from "../src/services/app-service.js";

const args = process.argv.slice(2);
const startDateArg = args.find((item) => item.startsWith("--start="));
const skipHistory = args.includes("--skip-history");

const options = {
  startDate: startDateArg ? startDateArg.split("=")[1] : undefined,
  skipHistory,
};

syncAllData(options)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
