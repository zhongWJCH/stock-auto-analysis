export function metricClass(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }
  return Number(value) >= 0 ? "is-positive" : "is-negative";
}

export function formatSigned(value, suffix = "", digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}${suffix}`;
}

export function formatDateKey(dateKey) {
  if (!dateKey || dateKey.length !== 8) {
    return "--";
  }
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}
