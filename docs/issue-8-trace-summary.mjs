// node docs/issue-8-trace-summary.mjs probe.trace.json probe-matrix.json > summary.json
import { readFileSync } from 'node:fs'
const events = JSON.parse(readFileSync(process.argv[2], 'utf8')).traceEvents
const measurements = process.argv[3]
  ? JSON.parse(readFileSync(process.argv[3], 'utf8')).cases.flatMap((entry) => entry.rows)
  : []
const marks = events.filter((event) => event.name?.startsWith('dialog-') && event.ph === 'I')
const unionMs = (ranges) => {
  const ordered = ranges.sort((a, b) => a[0] - b[0])
  let total = 0
  let end = -Infinity
  for (const [start, stop] of ordered) {
    total += Math.max(0, stop - Math.max(start, end))
    end = Math.max(end, stop)
  }
  return total / 1000
}
const result = marks
  .filter((mark) => mark.name.endsWith('-start'))
  .map((start) => {
    const end = marks.find((mark) => mark.name === start.name.replace('-start', '-end'))
    const row = measurements.find((row) => row.name === start.name.replace('-start', ''))
    const stop = row ? start.ts + row.readyMs * 1000 : end.ts
    const selected = events.filter(
      (event) =>
        event.ph === 'X' &&
        event.dur > 0 &&
        event.pid === start.pid &&
        event.tid === start.tid &&
        event.ts < stop &&
        event.ts + event.dur > start.ts,
    )
    const categories = [
      'UpdateLayoutTree',
      'Layout',
      'PrePaint',
      'Paint',
      'v8.callFunction',
      'FunctionCall',
      'TimerFire',
      'FireAnimationFrame',
    ]
    return {
      name: start.name.replace('-start', ''),
      durationMs: (stop - start.ts) / 1000,
      twoFrameMs: (end.ts - start.ts) / 1000,
      focusMs: row?.focusMs,
      readyMs: row?.readyMs,
      categories: Object.fromEntries(
        categories.map((name) => {
          const matching = selected.filter((event) => event.name === name)
          return [
            name,
            {
              count: matching.length,
              unionMs: unionMs(
                matching.map((event) => [
                  Math.max(start.ts, event.ts),
                  Math.min(stop, event.ts + event.dur),
                ]),
              ),
              maxEventMs: Math.max(0, ...matching.map((event) => event.dur / 1000)),
            },
          ]
        }),
      ),
      expensiveStyleEvents: selected
        .filter((event) => event.name === 'UpdateLayoutTree' && event.dur > 50000)
        .map((event) => ({
          durationMs: event.dur / 1000,
          startAfterClickMs: (event.ts - start.ts) / 1000,
          elementCount: event.args?.elementCount,
          stack: event.args?.beginData?.stackTrace,
        })),
    }
  })
console.log(
  JSON.stringify(
    {
      source: process.argv[2],
      note: 'Categories overlap; v8/TimerFire include synchronous style work and must not be summed with rendering.',
      windows: result,
    },
    null,
    2,
  ),
)
