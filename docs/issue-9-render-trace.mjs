// node docs/issue-9-render-trace.mjs TRACE_JSON [BUILT_JS_MAP] > SUMMARY_JSON
import { readFileSync } from 'node:fs'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
const events = JSON.parse(readFileSync(process.argv[2], 'utf8')).traceEvents
// trace-mapping already exists in the locked Vite development dependency tree.
const map = process.argv[3] ? new TraceMap(JSON.parse(readFileSync(process.argv[3], 'utf8'))) : null
const unionMs = (ranges) => {
  let total = 0,
    end = -Infinity
  for (const [start, stop] of ranges.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, stop - Math.max(start, end))
    end = Math.max(end, stop)
  }
  return total / 1000
}
const mapped = (frame, traceStack = false) =>
  map && frame?.url?.includes('/assets/index-')
    ? originalPositionFor(map, {
        line: frame.lineNumber + (traceStack ? 0 : 1),
        column: frame.columnNumber - (traceStack ? 1 : 0),
      })
    : frame
const windows = events
  .filter((e) => e.ph === 'I' && e.name?.startsWith('render-') && e.name.endsWith('-start'))
  .flatMap((start) =>
    ['two-frame', 'end'].map((suffix) => {
      const end = events.find((e) => e.ph === 'I' && e.name === start.name.replace('start', suffix))
      if (!end) return null
      const chosen = events.filter(
        (e) =>
          e.ph === 'X' &&
          e.pid === start.pid &&
          e.tid === start.tid &&
          e.dur > 0 &&
          e.ts < end.ts &&
          e.ts + e.dur > start.ts,
      )
      const categories = [
        'v8.callFunction',
        'FunctionCall',
        'RunMicrotasks',
        'UpdateLayoutTree',
        'Layout',
        'PrePaint',
        'Paint',
        'FireAnimationFrame',
      ]
      return {
        name: start.name.replace('-start', '') + '-' + suffix,
        durationMs: (end.ts - start.ts) / 1000,
        categories: Object.fromEntries(
          categories.map((name) => [
            name,
            {
              count: chosen.filter((e) => e.name === name).length,
              unionMs: unionMs(
                chosen
                  .filter((e) => e.name === name)
                  .map((e) => [Math.max(start.ts, e.ts), Math.min(end.ts, e.ts + e.dur)]),
              ),
            },
          ]),
        ),
        expensiveStyle: chosen
          .filter((e) => e.name === 'UpdateLayoutTree' && e.dur > 10000)
          .map((e) => ({
            ms: e.dur / 1000,
            elements: e.args?.elementCount,
            stack: e.args?.beginData?.stackTrace?.slice(0, 6).map((frame) => mapped(frame, true)),
          })),
      }
    }),
  )
  .filter(Boolean)
// CPU samples are statistical, not exact per-function durations. Map the sampled leaf
// frames to Vue/Vuetify/application source for a coarse JavaScript attribution.
const nodes = new Map()
for (const e of events)
  for (const n of e.args?.data?.cpuProfile?.nodes ?? []) nodes.set(n.id, n.callFrame)
const sampled = new Map()
for (const e of events) {
  if (!e.args?.data?.cpuProfile?.samples) continue
  for (const id of e.args.data.cpuProfile.samples) {
    const f = nodes.get(id)
    const position = mapped(f)
    const key = position?.source ?? f?.functionName ?? 'unknown'
    sampled.set(key, (sampled.get(key) ?? 0) + 1)
  }
}
console.log(
  JSON.stringify(
    {
      source: process.argv[2],
      note: 'Categories overlap; inclusive JavaScript may contain synchronous Style/Layout. Do not sum categories. two-frame precedes getAnimations; end includes that diagnostic query and finite transition wait.',
      windows,
      sampledLeaves: Object.fromEntries(
        [...sampled.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
      ),
    },
    null,
    2,
  ),
)
