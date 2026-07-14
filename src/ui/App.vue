<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { TrendCharts } from "@element-plus/icons-vue";
import SidebarOverview from "./components/SidebarOverview.vue";
import CandidateHighlights from "./components/CandidateHighlights.vue";
import MetricsPanel from "./components/MetricsPanel.vue";
import PriceChartPanel from "./components/PriceChartPanel.vue";
import ResultsExplorer from "./components/ResultsExplorer.vue";
import {
  loadSnapshotData,
  loadLatestMarketDate,
  loadSymbolHistory,
  nextTradingDay,
  predictFromStaticData,
  previousTradingDay,
  runAnalysisFromStaticData,
} from "./lib/data-loader.js";

const snapshot = ref({ symbols: [], macros: [], topMovers: [], meta: {} });
const analysis = ref(null);
const selectedDetail = ref(null);
const selectedSymbol = ref("");
const syncing = ref(false);
const analyzing = ref(false);
const strategyFilter = ref("all");
const hitOnly = ref(true);
const successOnly = ref(true);
const latestMarketDate = ref("");
const nextMarketDate = ref("");

const form = reactive({
  startDate: "2024-01-01",
  analysisDate: "",
  targetGainPct: 3,
  symbols: [],
});

const strategyCards = [
  { key: "momentumRotation", label: "ETF 动量轮动" },
  { key: "trendFollowing", label: "趋势跟随" },
  { key: "volumeBreakout", label: "突破放量" },
  { key: "oversoldRebound", label: "超跌反弹" },
  { key: "relativeStrength", label: "相对强弱" },
];

const symbolOptions = computed(() =>
  snapshot.value.symbols
    .filter((item) => item.category === "etf")
    .map((item) => ({
      label: `${item.symbol} ${item.name} · 场内ETF`,
      value: item.symbol,
    })),
);

const symbolCount = computed(() => symbolOptions.value.length);
const predictionSummary = computed(() => ({
  targetDate:
    analysis.value?.targetDate
    || analysis.value?.predictionDateKey?.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
    || form.analysisDate
    || "--",
  signalDate: analysis.value?.analysisDate || "--",
  candidateCount:
    analysis.value?.forecastOnly
      ? (analysis.value?.selections || []).filter((item) =>
          Object.values(item.perStrategy).some((strategy) => strategy.nextDayEligible && strategy.matched),
        ).length
      : (analysis.value?.selections || []).length,
  mode: analysis.value?.forecastOnly ? "前瞻预测" : "历史验证",
}));

async function loadSnapshot() {
  snapshot.value = await loadSnapshotData();
  if (!form.symbols.length) {
    form.symbols = symbolOptions.value.map((item) => item.value);
  }
}

async function loadSymbolDetail(symbol) {
  if (!symbol) {
    selectedDetail.value = null;
    return;
  }
  try {
    selectedDetail.value = await loadSymbolHistory(symbol, 90);
    selectedSymbol.value = symbol;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function handleSync() {
  ElMessage.info("当前页面只读取本地静态数据。若要更新数据，请重新运行 `npm run dev` 或手动执行 `npm run sync`。");
}

async function handleAnalyze() {
  analyzing.value = true;
  try {
    analysis.value =
      nextMarketDate.value && form.analysisDate >= nextMarketDate.value
        ? await predictFromStaticData({
            date: form.analysisDate,
            targetGainPct: form.targetGainPct,
            symbols: form.symbols,
          })
        : await runAnalysisFromStaticData({
            date: previousTradingDay(form.analysisDate),
            targetGainPct: form.targetGainPct,
            symbols: form.symbols,
          });
    successOnly.value = !analysis.value?.forecastOnly;
    const first = analysis.value?.selections?.[0]?.symbol || "";
    await loadSymbolDetail(selectedSymbol.value || first);
    ElMessage.success("策略预测已更新");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    analyzing.value = false;
  }
}

onMounted(async () => {
  await loadSnapshot();
  latestMarketDate.value = snapshot.value.meta?.latestMarketDate || await loadLatestMarketDate() || "";
  if (latestMarketDate.value) {
    nextMarketDate.value = nextTradingDay(latestMarketDate.value);
    form.analysisDate = nextMarketDate.value;
  }
  await handleAnalyze();
});
</script>

<template>
  <div class="app-shell">
    <SidebarOverview
      :symbol-count="symbolCount"
      :snapshot="snapshot"
      :start-date="form.startDate"
      :syncing="syncing"
      @update:start-date="form.startDate = $event"
      @sync="handleSync"
      @refresh="loadSnapshot"
    />

    <main class="main-content">
      <section class="surface analysis-panel">
        <div class="panel-header wide">
          <div>
            <p class="panel-kicker">Prediction Workspace</p>
            <h2>预测下一交易日</h2>
            <p class="panel-note">
              这里的日期表示“预测交易日”。系统会自动回推上一交易日作为信号生成日，再给出该预测交易日的候选结果。
            </p>
          </div>
          <el-button type="primary" size="large" :icon="TrendCharts" :loading="analyzing" @click="handleAnalyze">
            执行策略预测
          </el-button>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span>预测交易日</span>
            <strong>{{ predictionSummary.targetDate }}</strong>
          </article>
          <article class="summary-card">
            <span>信号来源日</span>
            <strong>{{ predictionSummary.signalDate }}</strong>
          </article>
          <article class="summary-card">
            <span>候选数量</span>
            <strong>{{ predictionSummary.candidateCount }}</strong>
          </article>
          <article class="summary-card">
            <span>当前模式</span>
            <strong>{{ predictionSummary.mode }}</strong>
          </article>
        </div>

        <div class="form-grid">
          <el-form-item label="预测交易日">
            <el-date-picker
              v-model="form.analysisDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              class="full-width"
            />
          </el-form-item>

          <el-form-item label="目标涨幅(%)">
            <el-input-number v-model="form.targetGainPct" :min="0.5" :max="20" :step="0.5" class="full-width" />
          </el-form-item>

          <el-form-item label="选择场内 ETF" class="symbol-select">
            <el-select
              v-model="form.symbols"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              placeholder="搜索代码或名称"
              class="full-width"
              :max-collapse-tags="4"
              clearable
            >
              <el-option
                v-for="item in symbolOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
        </div>
      </section>

      <MetricsPanel :analysis="analysis" />

      <CandidateHighlights :analysis="analysis" @select="loadSymbolDetail" />

      <PriceChartPanel
        :detail="selectedDetail"
        :analysis-date="analysis?.analysisDate || form.analysisDate"
        :prediction-date="analysis?.selections?.find((item) => item.symbol === selectedSymbol)?.predictionDate || analysis?.predictionDateKey?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || ''"
      />

      <ResultsExplorer
        :analysis="analysis"
        :selected-symbol="selectedSymbol"
        :strategy-cards="strategyCards"
        :strategy-filter="strategyFilter"
        :hit-only="hitOnly"
        :success-only="successOnly"
        @update:selected-symbol="loadSymbolDetail"
        @update:strategy-filter="strategyFilter = $event"
        @update:hit-only="hitOnly = $event"
        @update:success-only="successOnly = $event"
      />
    </main>
  </div>
</template>
