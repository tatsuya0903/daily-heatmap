<script setup lang="ts">
import { computed, toRef } from 'vue'
import { WEEKDAYS, groupHeatmapMonths, type HeatmapCell } from '@/domain/heatmap'
import { useHeatmapInteraction } from '@/composables/useHeatmapInteraction'

const props = defineProps<{ cells: HeatmapCell[] }>()
const emit = defineEmits<{ select: [cell: HeatmapCell] }>()
const months = computed(() => groupHeatmapMonths(props.cells))
const { root, show, keydown } = useHeatmapInteraction(
  toRef(props, 'cells'),
  (cell) => emit('select', cell),
  'month',
)
</script>

<template>
  <!-- タッチ後の疑似mouseoverやスクロールで、選択済みの日付を変更しない。 -->
  <div
    ref="root"
    class="mobile-calendar"
    data-testid="mobile-heatmap"
    @focusin="show"
    @click="show"
    @keydown="keydown"
  >
    <section
      v-for="month in months"
      :key="month.key"
      class="calendar-month"
      :aria-labelledby="`month-${month.key}`"
    >
      <h2 :id="`month-${month.key}`">{{ month.label }}</h2>
      <div class="month-grid">
        <span v-for="day in WEEKDAYS" :key="day" class="weekday">{{ day }}</span>
        <button
          v-for="cell in month.cells"
          :key="cell.date"
          type="button"
          class="day-cell"
          :style="{
            backgroundColor: cell.color,
            gridColumn: cell.weekday + 1,
            gridRow: cell.monthWeek + 2,
            color: cell.level >= 6 ? '#fff' : '#1c2e23',
          }"
          :tabindex="cell.index === 0 ? 0 : -1"
          :aria-label="cell.description"
          :data-date="cell.date"
          :data-cell-index="cell.index"
          :data-weekday="cell.weekday"
          :data-level="cell.level"
        >
          {{ cell.day }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.calendar-month + .calendar-month {
  margin-top: 28px;
}
.calendar-month h2 {
  font-size: 18px;
  margin-bottom: 12px;
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.weekday {
  text-align: center;
  font-size: 13px;
  padding-bottom: 4px;
}
.day-cell {
  min-width: 0;
  min-height: 44px;
  scroll-margin-block: 280px 20px;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid #52645a40;
}
.day-cell:focus {
  outline: 3px solid #1c2e23;
  outline-offset: 1px;
  z-index: 1;
}
@media (forced-colors: active) {
  .day-cell:focus {
    outline-color: Highlight;
  }
}
</style>
