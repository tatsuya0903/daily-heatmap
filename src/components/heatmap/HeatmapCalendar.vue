<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useDisplay } from 'vuetify'
import type { ClassifiedDay, HeatmapCell } from '@/domain/heatmap'
import DesktopHeatmap from './DesktopHeatmap.vue'
import MobileHeatmap from './MobileHeatmap.vue'

const props = defineProps<{ cells: HeatmapCell[]; legend: ClassifiedDay[] }>()
const { width } = useDisplay()
// Vuetify 4.2.1の既定mdは840px。ヒートマップは要件の960px境界を明示する。
const showMonthlyCalendar = computed(() => width.value < 960)
const selected = shallowRef<HeatmapCell>()
watch(
  () => props.cells,
  (cells) => {
    selected.value = cells.find((cell) => cell.date === selected.value?.date) ?? cells[0]
  },
  { immediate: true },
)
function select(cell: HeatmapCell) {
  selected.value = cell
}
</script>

<template>
  <div class="heatmap-calendar">
    <p id="heatmap-help" class="calendar-help">
      日付に触れると詳細を確認できます。キーボードはTabで日付へ移動し、矢印キーで選択、Home／Endで期間の先頭／末尾へ移動できます。
    </p>
    <div
      class="day-detail"
      role="region"
      aria-label="選択した日付の詳細"
      aria-live="polite"
      aria-atomic="true"
    >
      <template v-if="selected">
        <p class="detail-date">
          {{ selected.date.replaceAll('-', '/') }}（{{ selected.weekdayLabel }}）
        </p>
        <p class="detail-count">
          {{
            selected.exactCount === undefined
              ? selected.rangeLabel
              : `${selected.exactCount.toLocaleString('ja-JP')}件`
          }}
        </p>
        <p class="detail-range">レベル{{ selected.level }} ・ {{ selected.rangeLabel }}</p>
      </template>
    </div>
    <MobileHeatmap
      v-if="showMonthlyCalendar"
      :cells="cells"
      aria-describedby="heatmap-help"
      @select="select"
    />
    <DesktopHeatmap v-else :cells="cells" aria-describedby="heatmap-help" @select="select" />
    <ul class="heatmap-legend" aria-label="レベルと件数範囲の凡例">
      <li v-for="entry in legend" :key="entry.level">
        <span class="legend-swatch" :style="{ backgroundColor: entry.color }" aria-hidden="true" />
        <span>レベル{{ entry.level }}<br />{{ entry.rangeLabel }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.calendar-help {
  color: #52645a;
  font-size: 13px;
  line-height: 1.8;
  margin-block: 16px;
}
.day-detail {
  position: sticky;
  top: calc(var(--v-layout-top, 72px) + 8px);
  z-index: 2;
  padding: 12px 16px;
  margin-block: 20px;
  background: #f4f7f5;
  border: 1px solid #c0cec4;
  border-radius: 8px;
  min-height: 112px;
}
.detail-date {
  font-size: 14px;
}
.detail-count {
  overflow-wrap: anywhere;
  font-size: 22px;
  font-weight: 700;
}
.detail-range {
  font-size: 13px;
  color: #52645a;
}
.heatmap-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  list-style: none;
  padding: 0;
  margin-top: 24px;
}
.heatmap-legend li {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.legend-swatch {
  width: 20px;
  height: 20px;
  border: 1px solid #52645a40;
  border-radius: 4px;
  flex-shrink: 0;
}
</style>
