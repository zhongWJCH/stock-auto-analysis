<script setup>
import { Download, RefreshRight } from "@element-plus/icons-vue";

defineProps({
  symbolCount: {
    type: Number,
    required: true,
  },
  snapshot: {
    type: Object,
    required: true,
  },
  startDate: {
    type: String,
    required: true,
  },
  syncing: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["update:startDate", "sync", "refresh"]);
</script>

<template>
  <aside class="sidebar">
    <section class="surface hero-panel">
      <p class="eyebrow">Vite + Vue + Element Plus</p>
      <h1>场内 ETF 策略分析台</h1>
      <p class="hero-copy">
        面向场内 ETF 的本地研究台。同步历史数据后，按策略预测下一交易日，并核对真实结果。
      </p>
      <div class="hero-stats">
        <div>
          <span>覆盖标的</span>
          <strong>{{ symbolCount }}</strong>
        </div>
        <div>
          <span>最近同步</span>
          <strong>{{ snapshot.meta?.latestSyncAt ? "已同步" : "未同步" }}</strong>
        </div>
      </div>
    </section>

    <section class="surface control-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Data Sync</p>
          <h2>同步本地数据</h2>
        </div>
        <el-button :icon="RefreshRight" circle plain @click="emit('refresh')" />
      </div>

      <el-form label-position="top">
        <el-form-item label="历史起始日期">
          <el-date-picker
            :model-value="startDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择起始日期"
            class="full-width"
            @update:model-value="emit('update:startDate', $event)"
          />
        </el-form-item>
      </el-form>

      <el-alert
        title="默认会同步全部场内 ETF 及相对强弱所需的指数基准，无需设置同步上限。"
        type="success"
        :closable="false"
        show-icon
      />

      <div class="action-group">
        <el-button type="primary" size="large" :loading="syncing" :icon="Download" @click="emit('sync')">
          刷新本地数据提示
        </el-button>
        <p class="panel-note">数据来源：{{ snapshot.meta?.source || "暂未同步" }}</p>
        <p class="panel-note">数据由启动前的下载脚本准备，页面内只负责读取和计算。</p>
      </div>
    </section>

    <section class="surface macro-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Macro Sidebar</p>
          <h2>侧边行情</h2>
        </div>
        <el-tag effect="dark" type="warning">{{ snapshot.meta?.source || "未加载" }}</el-tag>
      </div>

      <div class="macro-grid">
        <article v-for="item in snapshot.macros" :key="item.key" class="macro-card">
          <div class="macro-head">
            <span>{{ item.label }}</span>
            <i :class="['delta', item.changePct >= 0 ? 'is-positive' : 'is-negative']">
              {{ item.changePct === null || item.changePct === undefined ? "--" : `${item.changePct > 0 ? "+" : ""}${Number(item.changePct).toFixed(2)}%` }}
            </i>
          </div>
          <strong>{{ item.price ?? "--" }}</strong>
          <small>{{ item.name || item.label }}</small>
        </article>
      </div>
    </section>
  </aside>
</template>
