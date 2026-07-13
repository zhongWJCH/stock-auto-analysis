<script setup>
import { Histogram } from "@element-plus/icons-vue";
import { formatDateKey, formatSigned } from "../lib/formatters.js";

defineProps({
  analysis: {
    type: Object,
    default: null,
  },
});
</script>

<template>
  <section class="surface">
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Validation</p>
        <h2>{{ analysis?.forecastOnly ? "下一交易日候选" : "策略验证指标" }}</h2>
      </div>
      <el-tag type="info" size="large">
        预测交易日：{{ formatDateKey(analysis?.predictionDateKey) }}
      </el-tag>
    </div>

    <div class="metric-grid">
      <article v-for="metric in analysis?.metrics || []" :key="metric.key" class="metric-card">
        <div class="metric-top">
          <span>{{ metric.label }}</span>
          <el-icon><Histogram /></el-icon>
        </div>
        <strong>{{ metric.triggerCount }}</strong>
        <div class="metric-meta">
          <span>胜率 {{ metric.winRate ?? "--" }}%</span>
          <span>平均收益 {{ formatSigned(metric.avgGainPct, "%") }}</span>
          <span>盈亏比 {{ metric.profitLossRatio ?? "--" }}</span>
          <span>最大回撤 {{ formatSigned(metric.maxDrawdownPct, "%") }}</span>
        </div>
      </article>
    </div>
  </section>
</template>
