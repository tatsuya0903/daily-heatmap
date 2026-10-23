import { afterEach, expect, it } from 'vitest'
import { createWebHashHistory } from 'vue-router'
import { createAppRouter } from '@/router'
import { CodecError, MAX_D_PARAMETER_CHARS, selectShareEncoding } from '@/codec'
import type { HeatmapDocument } from '@/domain/series'
import { createShareUrl, restoreShareQuery, restoreShareTitle, shareErrorMessage } from './shareUrl'

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

it.each(['/daily-heatmap/', '/'])(
  '%sで日本語・絵文字・予約文字を含むタイトルを往復する',
  (base) => {
    const router = createAppRouter(createWebHashHistory(base))
    const title = '読書の記録 📚 & + ? # = % / <メモ> "引用"'
    for (const mode of ['compact', 'exact'] as const) {
      const d = selectShareEncoding(document, mode).d
      const url = new URL(
        createShareUrl(
          router,
          d,
          'https://example.test/old/?secret=1#/heatmap?t=old',
          `  ${title}  `,
        ),
      )
      expect(url.pathname).toBe(base)
      expect(url.search).toBe('')
      expect(url.hash).not.toContain('読書')
      const query = router.resolve(url.hash.slice(1)).query
      expect(query.d).toBe(d)
      expect(restoreShareTitle(query)).toBe(title)
      expect(restoreShareQuery(query)).toEqual(restoreShareQuery({ d }))
    }
    router.options.history.destroy()
  },
)

it.each(['', ' ', '\t\n　'])(
  '空欄のタイトル%jはtを省略し、既存URLと同じ形式で生成する',
  (title) => {
    const router = createAppRouter(createWebHashHistory('/daily-heatmap/'))
    const d = selectShareEncoding(document, 'exact').d
    const current = 'https://example.test/daily-heatmap/#/heatmap?d=old&t=old'
    const url = createShareUrl(router, d, current, title)
    expect(url).toBe(createShareUrl(router, d, current))
    expect(new URL(url).hash).toBe(`#/heatmap?d=${d}`)
    router.options.history.destroy()
  },
)

it.each([null, '', '　 ', ['ひとつ'], ['最初', '次']])(
  '任意のt=%jが値なし・空欄・配列でも日別データを壊さない',
  (t) => {
    const d = selectShareEncoding(document, 'exact').d
    expect(restoreShareTitle({ d, t })).toBe('')
    expect(restoreShareQuery({ d, t })).toEqual(document)
  },
)

it('タイトル未指定は空文字、HTML風のタイトルはそのままの文字列として扱う', () => {
  expect(restoreShareTitle({})).toBe('')
  expect(restoreShareTitle({ t: ' <img src=x onerror="alert(1)"> ' })).toBe(
    '<img src=x onerror="alert(1)">',
  )
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
