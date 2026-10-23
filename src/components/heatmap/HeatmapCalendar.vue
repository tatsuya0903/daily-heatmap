<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { mdiInformationOutline } from '@mdi/js'
import type { ClassifiedDay, HeatmapCell } from '@/domain/heatmap'
import DesktopHeatmap from './DesktopHeatmap.vue'
import MobileHeatmap from './MobileHeatmap.vue'

const props = defineProps<{ cells: HeatmapCell[]; legend: ClassifiedDay[]; showHelp?: boolean }>()
const { width } = useDisplay()
// Vuetify 4.2.1の既定mdは840px。ヒートマップは要件の960px境界を明示する。
const showMonthlyCalendar = computed(() => width.value < 960)
const selected = shallowRef<HeatmapCell>()
const showLegendDetails = ref(false)
const legendId = useId()
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
    <p id="heatmap-help" v-show="showHelp !== false" class="calendar-help">
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
      :show-help="showHelp"
      aria-describedby="heatmap-help"
      @select="select"
    />
    <DesktopHeatmap v-else :cells="cells" aria-describedby="heatmap-help" @select="select" />
    <div class="legend-summary">
      <span class="legend-title">凡例</span>
      <div
        class="legend-scale"
        role="region"
        aria-label="8段階の色見本。幅が足りない場合は左右にスクロールできます"
        tabindex="0"
      >
        <span
          v-for="entry in legend"
          :key="entry.level"
          class="legend-swatch"
          :style="{ backgroundColor: entry.color }"
          aria-hidden="true"
        />
      </div>
      <v-btn
        :icon="mdiInformationOutline"
        :size="44"
        variant="text"
        :aria-label="showLegendDetails ? '凡例の説明を閉じる' : '凡例の説明を表示'"
        :aria-expanded="showLegendDetails"
        :aria-controls="legendId"
        @click="showLegendDetails = !showLegendDetails"
      />
    </div>
    <ul
      :id="legendId"
      v-show="showLegendDetails"
      class="heatmap-legend"
      aria-label="レベルと件数範囲の凡例"
    >
      <li v-for="entry in legend" :key="entry.level">
        <span class="legend-swatch" :style="{ backgroundColor: entry.color }" aria-hidden="true" />
        <span class="legend-description">レベル{{ entry.level }}<br />{{ entry.rangeLabel }}</span>
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
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 12px;
  padding: 6px 12px;
  margin-block: 12px;
  background: #f4f7f5;
  border: 1px solid #c0cec4;
  border-radius: 8px;
  line-height: 1.4;
}
.day-detail p {
  margin: 0;
}
.detail-date {
  font-size: 14px;
}
.detail-count {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 18px;
  font-weight: 700;
}
.detail-range {
  flex-basis: 100%;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: #52645a;
}
.legend-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}
.legend-title {
  font-size: 12px;
  flex-shrink: 0;
}
.legend-scale {
  display: flex;
  gap: 3px;
  min-width: 0;
  overflow-x: auto;
}
.legend-scale:focus-visible {
  outline: 3px solid #256b43;
  outline-offset: 2px;
}
.heatmap-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px 24px;
  list-style: none;
  padding: 0;
  margin-top: 8px;
}
.heatmap-legend li {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  min-width: 0;
}
.legend-description {
  overflow-wrap: anywhere;
}
.legend-swatch {
  box-sizing: border-box;
  width: 44px;
  height: 44px;
  border: 1px solid #52645a40;
  border-radius: 4px;
  flex-shrink: 0;
}
@media (min-width: 960px) {
  .legend-swatch {
    width: 24px;
    height: 24px;
  }
}
@media (forced-colors: active) {
  .legend-scale:focus-visible {
    outline-color: Highlight;
  }
}
</style>
