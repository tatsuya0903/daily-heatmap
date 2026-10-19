import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { ExactSeries } from '@/domain/series'
import {
  classifyDocument,
  createLegend,
  resolveThresholds,
  type ThresholdSelection,
} from '@/domain/thresholds'

export const useImportedSeriesStore = defineStore('imported-series', () => {
  const source = shallowRef<ExactSeries | null>(null)
  const profile = shallowRef(resolveThresholds({ method: 'quantile' }, []))
  const thresholds = computed(() => profile.value)
  const legend = computed(() => createLegend(profile.value.boundaries))
  const classifiedDays = computed(() =>
    source.value ? classifyDocument({ source: source.value, thresholds: profile.value }) : [],
  )

  function replaceSource(series: ExactSeries) {
    const nextProfile = resolveThresholds({ method: 'quantile' }, series.counts)
    source.value = series
    profile.value = nextProfile
  }

  function setThresholds(selection: ThresholdSelection) {
    if (!source.value) return
    // 検証完了後にだけ確定値を置換する。countsは変更しない。
    profile.value = resolveThresholds(selection, source.value.counts)
  }

  return { source, thresholds, legend, classifiedDays, replaceSource, setThresholds }
})
