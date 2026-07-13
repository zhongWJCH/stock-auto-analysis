<script setup>
import { computed } from "vue";
import { formatSigned, metricClass } from "../lib/formatters.js";

const props = defineProps({
  analysis: {
    type: Object,
    default: null,
  },
  selectedSymbol: {
    type: String,
    default: "",
  },
  strategyCards: {
    type: Array,
    required: true,
  },
  strategyFilter: {
    type: String,
    required: true,
  },
  hitOnly: {
    type: Boolean,
    required: true,
  },
  successOnly: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["update:selectedSymbol", "update:strategyFilter", "update:hitOnly", "update:successOnly"]);

const rows = computed(() => {
  let data = props.analysis?.selections || [];
  if (props.strategyFilter !== "all") {
    data = data.filter((item) => item.perStrategy[props.strategyFilter]);
  }
  if (props.hitOnly) {
    if (props.strategyFilter === "all") {
      data = data.filter((item) => props.strategyCards.some((strategy) => item.perStrategy[strategy.key]?.matched));
    } else {
      data = data.filter((item) => item.perStrategy[props.strategyFilter]?.matched);
    }
  }
  if (props.successOnly && !props.analysis?.forecastOnly) {
    if (props.strategyFilter === "all") {
      data = data.filter((item) =>
        props.strategyCards.some((strategy) => item.perStrategy[strategy.key]?.outcome?.success),
      );
    } else {
      data = data.filter((item) => item.perStrategy[props.strategyFilter]?.outcome?.success);
    }
  }
  return data;
});

function strategySummary(row, strategyKey) {
  const strategy = row.perStrategy[strategyKey];
  if (!strategy) {
    return "未计算";
  }
  if (!strategy.matched) {
    return "未触发";
  }
  const outcome = strategy.outcome;
  if (!outcome) {
    return props.analysis?.forecastOnly
      ? `触发，候选进入 ${row.predictionDate || "--"}，待后续验证是否达到目标涨幅`
      : `触发，预测日 ${row.predictionDate || "--"}`;
  }
  return `触发，预测次日 ${outcome.predictionDate}，真实收益 ${formatSigned(outcome.realizedPct, "%")}，${outcome.success ? "已达标" : "未达标"}`;
}

function handleCurrentChange(row) {
  if (row?.symbol) {
    emit("update:selectedSymbol", row.symbol);
  }
}
</script>

<template>
  <section class="surface">
    <div class="panel-header results-header">
      <div>
        <p class="panel-kicker">Detail Table</p>
        <h2>{{ analysis?.forecastOnly ? "下一交易日候选清单" : "信号与真实结果" }}</h2>
        <span class="table-caption">
          预测交易日 {{ analysis?.targetDate || analysis?.predictionDateKey?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || "--" }}，
          信号日 {{ analysis?.analysisDate || "--" }}，
          {{ analysis?.forecastOnly ? "筛选该交易日候选标的" : "验证该交易日是否达到目标涨幅" }}
        </span>
        <div class="prediction-hint">
          {{ analysis?.predictionScope || "按下一交易日开盘买入，验证后续走势是否达到目标涨幅" }}
        </div>
      </div>

      <div class="result-filters">
        <el-segmented
          :model-value="strategyFilter"
          :options="[
            { label: '全部策略', value: 'all' },
            { label: '超跌反弹', value: 'meanReversion' },
            { label: '动量突破', value: 'momentumBreakout' },
            { label: '综合评分', value: 'compositeScore' }
          ]"
          @update:model-value="emit('update:strategyFilter', $event)"
        />
        <el-switch
          :model-value="hitOnly"
          active-text="仅看命中"
          inactive-text="全部结果"
          @update:model-value="emit('update:hitOnly', $event)"
        />
        <el-switch
          :model-value="successOnly"
          active-text="仅看达标"
          inactive-text="含未达标"
          @update:model-value="emit('update:successOnly', $event)"
        />
      </div>
    </div>

    <el-table
      :data="rows"
      stripe
      border
      highlight-current-row
      row-key="symbol"
      class="result-table"
      height="720"
      :current-row-key="selectedSymbol"
      @current-change="handleCurrentChange"
    >
      <el-table-column prop="symbol" label="代码" width="110" fixed="left" />
      <el-table-column prop="name" label="名称" width="150" fixed="left" />
      <el-table-column prop="category" label="类别" width="100" />
      <el-table-column prop="date" label="信号日" width="120" />
      <el-table-column prop="predictionDate" label="预测次日" width="120" />
      <el-table-column label="是否达标" width="120">
        <template #default="{ row }">
          <el-tag v-if="analysis?.forecastOnly && strategyFilter !== 'all'" type="warning">
            待验证
          </el-tag>
          <el-tag
            v-else-if="strategyFilter !== 'all' && row.perStrategy[strategyFilter]?.outcome"
            :type="row.perStrategy[strategyFilter].outcome.success ? 'success' : 'danger'"
          >
            {{ row.perStrategy[strategyFilter].outcome.success ? "达标" : "未达标" }}
          </el-tag>
          <span v-else>--</span>
        </template>
      </el-table-column>
      <el-table-column prop="close" label="信号日收盘" width="120" />
      <el-table-column prop="changePct" label="当日涨跌" width="110">
        <template #default="{ row }">
          <span :class="metricClass(row.changePct)">{{ formatSigned(row.changePct, "%") }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="rsi14" label="RSI14" width="100" />
      <el-table-column prop="ma20" label="MA20" width="100" />
      <el-table-column v-for="strategy in strategyCards" :key="strategy.key" :label="strategy.label" min-width="310">
        <template #default="{ row }">
          <div class="strategy-cell" :class="{ active: row.perStrategy[strategy.key]?.matched }">
            <div class="strategy-title">
              <strong>{{ row.perStrategy[strategy.key]?.matched ? "已触发" : "未触发" }}</strong>
              <span v-if="row.perStrategy[strategy.key]?.score">评分 {{ row.perStrategy[strategy.key].score }}</span>
            </div>
            <p>{{ strategySummary(row, strategy.key) }}</p>
            <small>{{ row.perStrategy[strategy.key]?.reasons?.join(" / ") }}</small>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
