export function toFixedNumber(value, digits = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(digits)) : null;
}

export function average(values) {
  const valid = values.filter((item) => Number.isFinite(item));
  if (!valid.length) {
    return null;
  }
  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
}

export function sum(values) {
  return values.reduce((total, item) => total + (Number.isFinite(item) ? item : 0), 0);
}

export function movingAverage(values, period) {
  const result = Array(values.length).fill(null);
  for (let index = period - 1; index < values.length; index += 1) {
    const slice = values.slice(index - period + 1, index + 1);
    result[index] = average(slice);
  }
  return result;
}

export function calculateRsi(values, period = 14) {
  const result = Array(values.length).fill(null);
  if (values.length <= period) {
    return result;
  }

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

export function calculateEma(values, period) {
  const result = Array(values.length).fill(null);
  const multiplier = 2 / (period + 1);
  let ema = null;
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    if (!Number.isFinite(current)) {
      continue;
    }
    if (ema === null) {
      ema = current;
    } else {
      ema = (current - ema) * multiplier + ema;
    }
    result[index] = ema;
  }
  return result;
}

export function calculateMacd(values) {
  const ema12 = calculateEma(values, 12);
  const ema26 = calculateEma(values, 26);
  const diff = values.map((_, index) => {
    if (ema12[index] === null || ema26[index] === null) {
      return null;
    }
    return ema12[index] - ema26[index];
  });
  const dea = calculateEma(
    diff.map((item) => (item === null ? 0 : item)),
    9,
  );
  const macd = diff.map((item, index) =>
    item === null || dea[index] === null ? null : (item - dea[index]) * 2,
  );
  return { diff, dea, macd };
}

export function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

export function formatDateKey(input) {
  if (!input) {
    return "";
  }
  return input.replaceAll("-", "");
}

export function fromDateKey(input) {
  if (!input || input.length !== 8) {
    return input;
  }
  return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
