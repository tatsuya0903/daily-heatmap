// node docs/issue-8-dialog-report.mjs before-matrix.json after-matrix.json > comparison.json
import { readFileSync } from 'node:fs'
const before = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const after = JSON.parse(readFileSync(process.argv[3], 'utf8'))
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  const n = sorted.length
  if (!n) return null
  return {
    n,
    medianMs: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95Ms: sorted[Math.ceil(n * 0.95) - 1],
    maxMs: sorted.at(-1),
    minMs: sorted[0],
  }
}
function compact(input) {
  if (input.cases.length !== 6) throw new Error('Expected all 3 browsers × 2 periods')
  return {
    label: input.label,
    environment: input.environment,
    cases: input.cases.map((entry) => {
      const measured = {}
      for (const scenario of ['initial', 'reopen', 'threshold', 'url']) {
        const rows = entry.rows.filter((row) => row.scenario === scenario)
        if (
          rows.length !== input.environment.samples ||
          rows.some(
            (row) => row.cellCount !== entry.days || !row.focusInside || row.heatmapMutations !== 0,
          )
        )
          throw new Error('Measurement/calendar/focus contract failed')
        const metrics = {}
        for (const metric of [
          'domMs',
          'twoFrameMs',
          'focusMs',
          'readyMs',
          'heartbeatGapMaxMs',
          'longTaskMaxMs',
          'longTaskOverlapMs',
          'updateMs',
        ]) {
          // Long Task API capability comes from the after run, with the same browser build.
          const available =
            !metric.startsWith('longTask') || after.environment.longTaskApi[entry.browser]
          const values = rows.map((row) => (available ? row[metric] : null))
          metrics[metric] = { statistics: stats(values), samples: values }
        }
        measured[scenario] = metrics
      }
      return {
        browser: entry.browser,
        version: entry.version,
        days: entry.days,
        allCellsPreserved: true,
        focusInside: true,
        heatmapMutationsDuringOpen: 0,
        measured,
      }
    }),
  }
}
for (const entry of before.cases) {
  const matched = after.cases.find((x) => x.browser === entry.browser && x.days === entry.days)
  if (!matched || matched.version !== entry.version) throw new Error('Browser builds differ')
}
console.log(
  JSON.stringify(
    {
      method: {
        date: '2026-10-20',
        unit: 'ms',
        percentile: 'nearest rank ceil(n*0.95)-1',
        sampling:
          '5 warmup pages, then 30 measured pages per browser and period; 4 scenarios on each page',
        twoFrame: 'click capture to second requestAnimationFrame (legacy metric)',
        dom: 'first dialog textarea with URL observed by MutationObserver',
        focus: 'first focusin within dialog',
        ready:
          'focus reached, finite dialog animations finished, then two requestAnimationFrames; includes normal transition time',
        heartbeat: '20ms interval; max observed gap overlapping the ready window',
        longTask: 'Chromium Long Task API; null means unsupported, not zero blocking',
        updates:
          'threshold native change or hash assignment to the second frame after DOM update, measured before opening',
        note: 'Tracing is disabled during these statistical runs. JavaScript engine/font/browser caches are warmed by separate pages; initial means the first opening on each fresh page.',
      },
      before: compact(before),
      after: compact(after),
    },
    null,
    2,
  ),
)
