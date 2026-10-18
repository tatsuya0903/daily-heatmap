import { shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { ExactSeries } from '@/domain/series'

export const useImportedSeriesStore = defineStore('imported-series', () => {
  const source = shallowRef<ExactSeries | null>(null)

  function replaceSource(series: ExactSeries) {
    source.value = series
  }

  return { source, replaceSource }
})
