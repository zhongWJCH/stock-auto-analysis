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
    .filter(
      (item) =>
        item.perStrategy.meanReversion.matched
        || item.perStrategy.momentumBreakout.matched
        || item.perStrategy.compositeScore.matched,
    )
    .map((item) => {
      const matchedStrategies = [
        item.perStrategy.meanReversion.matched ? "超跌反弹" : null,
        item.perStrategy.momentumBreakout.matched ? "动量突破" : null,
        item.perStrategy.compositeScore.matched ? "综合评分" : null,
      ].filter(Boolean);

      const rankScore =
        matchedStrategies.length * 10
        + (item.perStrategy.compositeScore.score || 0)
        + (item.perStrategy.momentumBreakout.matched ? 5 : 0);

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
          <span>{{ item.category === "stock" ? "股票" : "ETF" }}</span>
          <span>{{ formatSigned(item.changePct, "%") }}</span>
        </div>

        <div class="candidate-tags">
          <el-tag v-for="tag in item.matchedStrategies" :key="tag" type="warning" effect="plain">
            {{ tag }}
          </el-tag>
        </div>

        <div class="candidate-notes">
          <div v-if="item.perStrategy.compositeScore.matched">综合评分：{{ item.perStrategy.compositeScore.score }}</div>
          <div v-if="item.perStrategy.momentumBreakout.matched">动量突破已命中</div>
          <div v-if="item.perStrategy.meanReversion.matched">超跌反弹已命中</div>
        </div>
      </article>
    </div>
  </section>
</template>
