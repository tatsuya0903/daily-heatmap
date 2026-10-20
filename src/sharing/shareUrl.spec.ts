import { afterEach, expect, it } from 'vitest'
import { createWebHashHistory } from 'vue-router'
import { createAppRouter } from '@/router'
import { CodecError, MAX_D_PARAMETER_CHARS, selectShareEncoding } from '@/codec'
import type { HeatmapDocument } from '@/domain/series'
import { createShareUrl, restoreShareQuery, shareErrorMessage } from './shareUrl'

const document: HeatmapDocument = {
  source: { kind: 'exact', startDate: '2026-01-01', counts: [0, 6, 45] },
  thresholds: { method: 'linear', boundaries: [10, 20, 30, 40] },
}
afterEach(() => window.history.replaceState({}, '', '/'))

it.each(['/daily-heatmap/', '/'])('Routerのbase %sでhash内にdを生成する', (base) => {
  const router = createAppRouter(createWebHashHistory(base))
  const d = selectShareEncoding(document, 'compact').d
  const url = new URL(createShareUrl(router, d, 'https://example.test/unrelated/?secret=1#/'))
  expect(url.origin).toBe('https://example.test')
  expect(url.pathname).toBe(base)
  expect(url.search).toBe('')
  expect(url.hash).toBe(`#/heatmap?d=${d}`)
  expect(restoreShareQuery({ d })).toEqual({
    source: { kind: 'levels', startDate: '2026-01-01', levels: [0, 1, 5] },
    thresholds: document.thresholds,
  })
  router.options.history.destroy()
})

it('完全データのcountsと保存済み境界を再生成せず復元する', () => {
  expect(restoreShareQuery({ d: selectShareEncoding(document, 'exact').d })).toEqual(document)
  expect(restoreShareQuery({ unrelated: 'ignored' })).toBeNull()
})

it.each([null, '', ['abc'], ['abc', 'abc'], '!', 'A'.repeat(MAX_D_PARAMETER_CHARS + 1)])(
  '不正なd %jを拒否する',
  (d) => {
    expect(() => restoreShareQuery({ d })).toThrow(CodecError)
  },
)

it('CodecErrorの日本語と予期しない失敗を表示用に整理する', () => {
  expect(shareErrorMessage(new CodecError('format', '未知の形式IDです。'))).toBe(
    '未知の形式IDです。',
  )
  expect(shareErrorMessage(new Error('private internals'))).not.toContain('private internals')
})
