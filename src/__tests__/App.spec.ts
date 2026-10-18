import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import App from '@/App.vue'
import { createAppRouter } from '@/router'
import { createAppVuetify } from '@/plugins/vuetify'

async function renderRoute(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: { plugins: [createPinia(), router, createAppVuetify()] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('画面とルーティング', () => {
  it('トップに用途とファイルの取り扱いを表示する', async () => {
    const { wrapper } = await renderRoute('/')
    expect(wrapper.get('h1').text()).toContain('日々の積み重ねを、')
    expect(wrapper.text()).toContain('元のファイルをサーバーに送信しません。')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
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
