<script setup>
import * as echarts from "echarts";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { calculateKdj } from "../lib/data-loader.js";
import { formatSigned, metricClass } from "../lib/formatters.js";

const props = defineProps({
  detail: {
    type: Object,
    default: null,
  },
  analysisDate: {
    type: String,
    default: "",
  },
  predictionDate: {
    type: String,
    default: "",
  },
});

const chartRef = ref(null);
let chartInstance = null;

const kdjSeries = computed(() => calculateKdj(props.detail?.history || []));

function buildOption() {
  const history = props.detail?.history || [];
  const dates = history.map((item) => item.date);
  const candles = history.map((item) => [Number(item.open), Number(item.close), Number(item.low), Number(item.high)]);
  const volumes = history.map((item) => Number(item.volume));
  const kValues = kdjSeries.value.map((item) => item.k);
  const dValues = kdjSeries.value.map((item) => item.d);
  const jValues = kdjSeries.value.map((item) => item.j);
  const analysisIndex = dates.indexOf(props.analysisDate);
  const predictionIndex = dates.indexOf(props.predictionDate);

  return {
    backgroundColor: "transparent",
    animation: false,
    legend: {
      top: 0,
      textStyle: { color: "#475569" },
      data: ["K线", "成交量", "K", "D", "J"],
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
    },
    grid: [
      { left: 48, right: 24, top: 36, height: 220 },
      { left: 48, right: 24, top: 272, height: 80 },
      { left: 48, right: 24, top: 372, height: 120 },
    ],
    xAxis: [
      { type: "category", data: dates, scale: true, boundaryGap: false, axisLine: { lineStyle: { color: "#94a3b8" } } },
      { type: "category", gridIndex: 1, data: dates, scale: true, boundaryGap: false, axisLabel: { show: false }, axisLine: { lineStyle: { color: "#94a3b8" } } },
      { type: "category", gridIndex: 2, data: dates, scale: true, boundaryGap: false, axisLine: { lineStyle: { color: "#94a3b8" } } },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } } },
      { gridIndex: 1, splitNumber: 2, splitLine: { show: false } },
      { gridIndex: 2, min: 0, max: 100, splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } } },
    ],
    axisPointer: {
      link: [{ xAxisIndex: "all" }],
      label: { backgroundColor: "#475569" },
    },
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1, 2], start: 55, end: 100 },
      { show: true, type: "slider", xAxisIndex: [0, 1, 2], bottom: 10, start: 55, end: 100 },
    ],
    series: [
      {
        name: "K线",
        type: "candlestick",
        data: candles,
        itemStyle: {
          color: "#ef4444",
          color0: "#10b981",
          borderColor: "#ef4444",
          borderColor0: "#10b981",
        },
        markLine: {
          symbol: "none",
          label: { color: "#475569" },
          lineStyle: { type: "dashed" },
          data: [
            ...(analysisIndex >= 0 ? [{ xAxis: dates[analysisIndex], lineStyle: { color: "#f59e0b" }, label: { formatter: "信号日" } }] : []),
            ...(predictionIndex >= 0 ? [{ xAxis: dates[predictionIndex], lineStyle: { color: "#2563eb" }, label: { formatter: "预测次日" } }] : []),
          ],
        },
      },
      {
        name: "成交量",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
        itemStyle: {
          color: (params) => {
            const [open, close] = candles[params.dataIndex];
            return close >= open ? "#ef4444" : "#10b981";
          },
        },
      },
      { name: "K", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: kValues, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: "#f59e0b" } },
      { name: "D", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: dValues, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: "#2563eb" } },
      { name: "J", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: jValues, smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: "#8b5cf6" } },
    ],
  };
}

async function renderChart() {
  if (!chartRef.value || !props.detail?.history?.length) {
    return;
  }
  await nextTick();
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }
  chartInstance.setOption(buildOption(), true);
}

function resizeChart() {
  chartInstance?.resize();
}

watch(
  () => [props.detail, props.analysisDate, props.predictionDate],
  () => {
    if (props.detail?.history?.length) {
      renderChart();
    }
  },
  { deep: true },
);

onMounted(() => {
  window.addEventListener("resize", resizeChart);
  renderChart();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeChart);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<template>
  <section class="surface chart-panel">
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Price Focus</p>
        <h2>单标的 K 线与 KDJ</h2>
        <p class="panel-note">
          展示最近 {{ detail?.history?.length || 0 }} 个交易日的 K 线、成交量和 KDJ，并标出信号日与预测次日。
        </p>
      </div>
      <div v-if="detail" class="chart-meta">
        <strong>{{ detail.symbol }} {{ detail.name }}</strong>
        <span :class="metricClass(detail.latestChangePct)">{{ formatSigned(detail.latestChangePct, "%") }}</span>
      </div>
    </div>

    <div v-if="!detail || !detail.history?.length" class="empty-card">
      从下方结果表选择一只场内 ETF，即可查看 K 线图和 KDJ。
    </div>

    <template v-else>
      <div ref="chartRef" class="echarts-panel"></div>

      <div class="chart-legend">
        <span><i class="legend-dot signal"></i>信号日 {{ analysisDate || "--" }}</span>
        <span><i class="legend-dot prediction"></i>预测次日 {{ predictionDate || "--" }}</span>
      </div>

      <div class="chart-stats">
        <div>
          <span>最新收盘</span>
          <strong>{{ detail.history.at(-1)?.close ?? "--" }}</strong>
        </div>
        <div>
          <span>区间最高</span>
          <strong>{{ Math.max(...detail.history.map((item) => Number(item.high || item.close))).toFixed(2) }}</strong>
        </div>
        <div>
          <span>区间最低</span>
          <strong>{{ Math.min(...detail.history.map((item) => Number(item.low || item.close))).toFixed(2) }}</strong>
        </div>
      </div>
    </template>
  </section>
</template>
