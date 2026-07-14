<script setup>
import { computed } from "vue";
import { formatSigned } from "../lib/formatters.js";

const props = defineProps({
  analysis: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["select"]);

const rankedCandidates = computed(() => {
  const rows = props.analysis?.selections || [];
  return rows
    .filter((item) => Object.values(item.perStrategy).some((strategy) => strategy.nextDayEligible && strategy.matched))
    .map((item) => {
      const labels = {
        momentumRotation: "ETF 动量轮动",
        trendFollowing: "趋势跟随",
        volumeBreakout: "突破放量",
        oversoldRebound: "超跌反弹",
        relativeStrength: "相对强弱",
      };
      const matchedStrategies = Object.entries(item.perStrategy)
        .filter(([, strategy]) => strategy.nextDayEligible && strategy.matched)
        .map(([key]) => labels[key]);

      const rankScore =
        matchedStrategies.length * 10
        + Math.max(...Object.values(item.perStrategy)
          .filter((strategy) => strategy.nextDayEligible)
          .map((strategy) => strategy.score || 0));

      return {
        ...item,
        matchedStrategies,
        rankScore,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore || (b.changePct || 0) - (a.changePct || 0))
    .slice(0, 24);
});
</script>

<template>
  <section v-if="analysis?.forecastOnly" class="surface">
    <div class="panel-header">
      <div>
        <p class="panel-kicker">Candidate Focus</p>
        <h2>命中候选榜</h2>
        <p class="panel-note">
          这里只展示已命中的下一交易日候选，按策略强度和综合评分排序。
        </p>
      </div>
      <el-tag type="success" size="large">Top {{ rankedCandidates.length }}</el-tag>
    </div>

    <div v-if="!rankedCandidates.length" class="empty-card">
      当前预测交易日没有命中的候选标的。
    </div>

    <div v-else class="candidate-grid">
      <article
        v-for="item in rankedCandidates"
        :key="item.symbol"
        class="candidate-card"
        @click="emit('select', item.symbol)"
      >
        <div class="candidate-head">
          <div>
            <strong>{{ item.symbol }}</strong>
            <p>{{ item.name }}</p>
          </div>
          <span class="candidate-score">评分 {{ item.rankScore }}</span>
        </div>

        <div class="candidate-meta">
          <span>场内 ETF</span>
          <span>{{ formatSigned(item.changePct, "%") }}</span>
        </div>

        <div class="candidate-tags">
          <el-tag v-for="tag in item.matchedStrategies" :key="tag" type="warning" effect="plain">
            {{ tag }}
          </el-tag>
        </div>

        <div class="candidate-notes">
          <div v-if="item.perStrategy.volumeBreakout.matched">量价突破已命中</div>
          <div v-if="item.perStrategy.relativeStrength.matched">相对基准持续走强</div>
        </div>
      </article>
    </div>
  </section>
</template>
