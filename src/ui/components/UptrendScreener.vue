<script setup>
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { nextTradingDay } from "../lib/data-loader.js";
import { formatSigned } from "../lib/formatters.js";
import { screenUptrendCandidates } from "../lib/uptrend-screening.js";

const props = defineProps({
  snapshot: {
    type: Object,
    required: true,
  },
  latestMarketDate: {
    type: String,
    default: "",
  },
  loadAllHistories: {
    type: Function,
    required: true,
  },
  loadSymbolDetail: {
    type: Function,
    required: true,
  },
});

const loading = ref(false);
const rows = ref([]);

const defaultTargetDate = computed(() =>
  props.latestMarketDate ? nextTradingDay(props.latestMarketDate) : "",
);

async function runScreening() {
  loading.value = true;
  try {
    const histories = await props.loadAllHistories();
    rows.value = screenUptrendCandidates(histories, {
      signalDateKey: props.latestMarketDate.replaceAll("-", ""),
      targetDate: defaultTargetDate.value,
    });
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

onMounted(runScreening);
</script>

<template>
  <section class="surface">
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Uptrend Screener</p>
        <h2>上涨策略筛选页</h2>
        <p class="panel-note">
          基于 `判断上涨策略.md` 的四大类看涨信号，对全市场股票和 ETF 做筛选。
        </p>
      </div>
      <el-button type="primary" :loading="loading" @click="runScreening">重新筛选</el-button>
    </div>

    <div class="summary-grid">
      <article class="summary-card">
        <span>预测交易日</span>
        <strong>{{ defaultTargetDate || "--" }}</strong>
      </article>
      <article class="summary-card">
        <span>信号来源日</span>
        <strong>{{ latestMarketDate || "--" }}</strong>
      </article>
      <article class="summary-card">
        <span>筛选结果</span>
        <strong>{{ rows.length }}</strong>
      </article>
      <article class="summary-card">
        <span>市场范围</span>
        <strong>全A股 + ETF</strong>
      </article>
    </div>

    <el-table :data="rows" stripe border height="760" class="result-table" @row-click="(row) => loadSymbolDetail(row.symbol)">
      <el-table-column prop="symbol" label="代码" width="110" fixed="left" />
      <el-table-column prop="name" label="名称" width="150" fixed="left" />
      <el-table-column prop="category" label="类别" width="100" />
      <el-table-column prop="score" label="综合分" width="100" sortable />
      <el-table-column prop="probability" label="上涨概率" width="120" />
      <el-table-column prop="primaryPattern" label="主要形态" width="160" />
      <el-table-column prop="changePct" label="当日涨跌" width="110">
        <template #default="{ row }">
          <span>{{ formatSigned(row.changePct, "%") }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="benchmarkOutperformance" label="跑赢大盘" width="120">
        <template #default="{ row }">
          <span>{{ formatSigned(row.benchmarkOutperformance, "%") }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="volumeVs5" label="量能/5日均量" width="130" />
      <el-table-column label="看涨信号" min-width="360">
        <template #default="{ row }">
          <div class="candidate-tags">
            <el-tag v-for="tag in row.signalTags" :key="tag" type="warning" effect="plain">{{ tag }}</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="排除风险" min-width="220">
        <template #default="{ row }">
          <span v-if="row.negativeFlags.length">{{ row.negativeFlags.join(" / ") }}</span>
          <span v-else>无</span>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
