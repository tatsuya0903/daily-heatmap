import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { useImportedSeriesStore } from '@/stores/importedSeries'
import App from '@/App.vue'
import { createAppRouter } from '@/router'
import { createAppVuetify } from '@/plugins/vuetify'

async function renderRoute(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const pinia = createPinia()
  const wrapper = mount(App, {
    global: { plugins: [pinia, router, createAppVuetify()] },
  })
  await flushPromises()
  return { wrapper, router, store: useImportedSeriesStore(pinia) }
}

describe('画面とルーティング', () => {
  it('トップに用途とファイルの取り扱いを表示する', async () => {
    const { wrapper } = await renderRoute('/')
    expect(wrapper.get('h1').text()).toContain('日々の積み重ねを、')
    expect(wrapper.text()).toContain('元のファイルをサーバーに送信しません。')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('データなしのヒートマップからトップへ戻れる', async () => {
    const { wrapper, router } = await renderRoute('/heatmap')
    expect(wrapper.text()).toContain('表示するデータがありません')
    await wrapper.get('main a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect(wrapper.get('h1').text()).toContain('日々の積み重ねを、')
  })

  it('存在しないURLでは復帰用の画面を表示する', async () => {
    const { wrapper } = await renderRoute('/unknown-page')
    expect(wrapper.get('h1').text()).toBe('ページを開けませんでした')
    expect(wrapper.get('main a').text()).toBe('トップページへ戻る')
  })
})

function createFile(text: string, read?: () => Promise<ArrayBuffer>): File {
  const file = new File([text], 'synthetic.tsv', { type: 'text/tab-separated-values' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: read ?? (async () => new TextEncoder().encode(text).buffer),
  })
  return file
}

async function upload(wrapper: Awaited<ReturnType<typeof renderRoute>>['wrapper'], file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

describe('TSV読み込みとアプリ状態', () => {
  it('2列は自動選択し、全検証後に正規化済みデータだけを保存して遷移する', async () => {
    const { wrapper, router, store } = await renderRoute('/')
    await upload(wrapper, createFile('Date\tCount\n2026-04-03\t0\n2026-04-01\t6'))
    expect(wrapper.get<HTMLInputElement>('input[type="checkbox"]').element.checked).toBe(true)
    expect(store.source).toBeNull()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('heatmap')
    expect(store.source).toEqual({ kind: 'exact', startDate: '2026-04-01', counts: [6, 0, 0] })
    expect(wrapper.text()).toContain('2026-04-01 〜 2026-04-03（3日分）')
  })

  it('複数列は全選択で始まり、数値エラーでも既存データを維持し、除外して再試行できる', async () => {
    const { wrapper, router, store } = await renderRoute('/')
    const previous = { kind: 'exact' as const, startDate: '2000-01-01', counts: [7] }
    store.replaceSource(previous)
    await upload(
      wrapper,
      createFile('Date\tA件数\t注記\n2026-01-01\t1\t2\n2026-01-02\t3\t架空メモ'),
    )
    expect(
      wrapper
        .findAll<HTMLInputElement>('input[type="checkbox"]')
        .every((input) => input.element.checked),
    ).toBe(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('3行目・3列目・「注記」')
    expect(router.currentRoute.value.name).toBe('home')
    expect(store.source).toBe(previous)
    await wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')[1]!.setValue(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(store.source).toEqual({ kind: 'exact', startDate: '2026-01-01', counts: [1, 3] })
    expect(router.currentRoute.value.name).toBe('heatmap')
  })

  it('0列では読み込みを無効にし、フォーム直接送信でも拒否する', async () => {
    const { wrapper, store } = await renderRoute('/')
    await upload(wrapper, createFile('Date\tCount\n2026-01-01\t1'))
    await wrapper.get<HTMLInputElement>('input[type="checkbox"]').setValue(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('1列以上')
    expect(store.source).toBeNull()
  })

  it('構造エラーでも既存データを保ち、同じファイルを選び直せる', async () => {
    const { wrapper, store } = await renderRoute('/')
    const previous = { kind: 'exact' as const, startDate: '2000-01-01', counts: [7] }
    store.replaceSource(previous)
    const file = createFile('Date\tCount\n2026-01-01\t1\n2026-01-01\t2')
    await upload(wrapper, file)
    expect(wrapper.get('[role="alert"]').text()).toContain('3行目・1列目・「Date」')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(store.source).toBe(previous)
    await upload(wrapper, file)
    expect(wrapper.get('[role="alert"]').text()).toContain('重複')
    expect(store.source).toBe(previous)
  })

  it('遅い前ファイルの読み込みが新しいファイルを上書きしない', async () => {
    const { wrapper, store } = await renderRoute('/')
    let finish!: (buffer: ArrayBuffer) => void
    const pending = new Promise<ArrayBuffer>((resolve) => {
      finish = resolve
    })
    await upload(
      wrapper,
      createFile('Date\t旧件数\n2026-01-01\t1', () => pending),
    )
    await upload(wrapper, createFile('Date\t新件数\n2026-01-02\t2'))
    finish(new TextEncoder().encode('Date\t旧件数\n2026-01-01\t1').buffer)
    await flushPromises()
    expect(wrapper.text()).toContain('新件数')
    expect(wrapper.text()).not.toContain('旧件数')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(store.source).toEqual({ kind: 'exact', startDate: '2026-01-02', counts: [2] })
  })

  it('複数ファイルのドロップを拒否し、データを更新しない', async () => {
    const { wrapper, store } = await renderRoute('/')
    await wrapper.get('[aria-label="TSVファイルのドロップ領域"]').trigger('drop', {
      dataTransfer: { files: [createFile(''), createFile('')] },
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('1つずつ')
    expect(store.source).toBeNull()
  })
})

describe('共有URL優先のルーティング', () => {
  it.each(['exact', 'compact'] as const)(
    '%sのタイトルを表示し、tだけの変更では分類・選択・設定を維持する',
    async (mode) => {
      const { selectShareEncoding } = await import('@/codec')
      const document = {
        source: { kind: 'exact' as const, startDate: '2026-04-01', counts: [0, 6, 67] },
        thresholds: { method: 'linear' as const, boundaries: [10, 20, 30, 40] },
      }
      const d = selectShareEncoding(document, mode).d
      const { wrapper, router, store } = await renderRoute(
        `/heatmap?d=${d}&t=${encodeURIComponent('読書の記録 📚')}`,
      )
      expect(wrapper.get('h1').text()).toBe('読書の記録 📚')
      const original = store.document
      const revision = store.revision
      await wrapper.get('[data-date="2026-04-03"]').trigger('click')
      const toggle = wrapper.findAll('button').find((button) => button.text() === '詳細情報を見る')!
      await toggle.trigger('click')
      await router.push({ name: 'heatmap', query: { d, t: '別のタイトル' } })
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('別のタイトル')
      expect(store.document).toBe(original)
      expect(store.revision).toBe(revision)
      expect(wrapper.get('[aria-live="polite"]').text()).toContain('2026/04/03')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      await router.push({ name: 'heatmap', query: { d, t: ['最初', '次'] } })
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('ヒートマップ')
      expect(store.document).toBe(original)
      await router.push({ name: 'heatmap', query: { d } })
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('ヒートマップ')
      await router.push({
        name: 'heatmap',
        query: {
          d: selectShareEncoding(
            { ...document, source: { ...document.source, counts: [0, 6, 0] } },
            mode,
          ).d,
        },
      })
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('ヒートマップ')
      expect(store.revision).toBe(revision + 1)
    },
  )

  it('HTML風のタイトルをテキストとして表示し、tだけや不正dにはタイトルを適用しない', async () => {
    const { selectShareEncoding } = await import('@/codec')
    const d = selectShareEncoding(
      {
        source: { kind: 'exact', startDate: '2026-04-01', counts: [0] },
        thresholds: { method: 'linear', boundaries: [] },
      },
      'exact',
    ).d
    const title = '<img src=x onerror="alert(1)">'
    const { wrapper, router } = await renderRoute(`/heatmap?d=${d}&t=${encodeURIComponent(title)}`)
    expect(wrapper.get('h1').text()).toBe(title)
    expect(wrapper.find('#heatmap-title img').exists()).toBe(false)
    await router.push({ name: 'heatmap', query: { t: title } })
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('ヒートマップ')
    expect(wrapper.text()).toContain('表示するデータがありません')
    await router.push({ name: 'heatmap', query: { d: 'broken', t: title } })
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('ヒートマップ')
    expect(wrapper.text()).toContain('共有URLを読み込めませんでした')
  })

  it.each(['exact', 'compact'] as const)(
    '%s共有URLでは説明を閉じ、末尾で開閉しても日付とデータを維持する',
    async (mode) => {
      const { selectShareEncoding } = await import('@/codec')
      const document = {
        source: { kind: 'exact' as const, startDate: '2026-04-01', counts: [0, 6, 67] },
        thresholds: {
          method: 'preset' as const,
          presetId: 0 as const,
          boundaries: [2, 3, 5, 10, 20, 50],
        },
      }
      const d = selectShareEncoding(document, mode).d
      const { wrapper, router, store } = await renderRoute(`/heatmap?d=${d}`)
      const panel = wrapper.get('.shared-details')
      const toggle = wrapper.findAll('button').find((button) => button.text() === '詳細情報を見る')!
      expect(panel.attributes('style')).toContain('display: none')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.findAll('[data-date]')).toHaveLength(3)
      expect(wrapper.get('.calendar-help').attributes('style')).toContain('display: none')
      const original = store.document
      await wrapper.get('[data-date="2026-04-03"]').trigger('click')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(panel.attributes('style')).not.toContain('display: none')
      expect(panel.text()).toContain('共有URLから復元しました')
      expect(wrapper.get('[aria-live="polite"]').text()).toContain('2026/04/03')
      expect(store.document).toBe(original)
      expect(wrapper.get('select').attributes('disabled') !== undefined).toBe(mode === 'compact')
      await toggle.trigger('click')
      expect(panel.attributes('style')).toContain('display: none')
      await toggle.trigger('click')
      await router.push(
        `/heatmap?d=${selectShareEncoding({ ...document, source: { ...document.source, counts: [0, 6, 0] } }, mode).d}`,
      )
      await flushPromises()
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(panel.attributes('style')).toContain('display: none')
    },
  )

  it('異なるURLで閾値UIを同期し、不正URLは以前のデータを部分表示しない', async () => {
    const { selectShareEncoding } = await import('@/codec')
    const document = {
      source: { kind: 'exact' as const, startDate: '2026-01-01', counts: [6, 45] },
      thresholds: { method: 'linear' as const, boundaries: [100] },
    }
    const exact = selectShareEncoding(document, 'exact').d
    const compact = selectShareEncoding(
      { ...document, thresholds: { method: 'log', boundaries: [3] } },
      'compact',
    ).d
    const { wrapper, router, store } = await renderRoute(`/heatmap?d=${exact}`)
    expect(wrapper.get<HTMLSelectElement>('select').element.value).toBe('linear')
    expect(store.thresholds.boundaries).toEqual([100])
    await router.push(`/heatmap?d=${compact}`)
    await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('select').element.value).toBe('log')
    expect(wrapper.get('select').attributes('disabled')).toBeDefined()
    await router.push('/heatmap?d=broken')
    await flushPromises()
    expect(store.document).toBeNull()
    expect(wrapper.text()).toContain('共有URLを読み込めませんでした')
    expect(wrapper.find('[data-date]').exists()).toBe(false)
    await router.push('/heatmap')
    await flushPromises()
    expect(wrapper.text()).toContain('表示するデータがありません')
    wrapper.unmount()
  })
})
