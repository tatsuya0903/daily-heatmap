import type { LocationQuery, Router } from 'vue-router'
import { CodecError, decodeDParameter } from '@/codec'

/** Routerのhistory/baseを正とし、dと任意のタイトルtをhash内のクエリに置く。 */
export function createShareUrl(router: Router, d: string, currentUrl: string, title = ''): string {
  const normalizedTitle = title.trim()
  const resolved = router.resolve({
    name: 'heatmap',
    query: { d, ...(normalizedTitle ? { t: normalizedTitle } : {}) },
  })
  // Hash historyのhrefは通常#/…のみなので、baseを明示的に結合する。
  return new URL(router.options.history.base.replace(/\/$/, '') + resolved.fullPath, currentUrl)
    .href
}

/** タイトルは任意の表示情報。重複・値なしは無視し、日別データの復元を妨げない。 */
export function restoreShareTitle(query: LocationQuery): string {
  return typeof query.t === 'string' ? query.t.trim() : ''
}

/** 重複d・値なし・配列をCodecへ渡す前に拒否する。 */
export function restoreShareQuery(query: LocationQuery) {
  if (!Object.hasOwn(query, 'd')) return null
  if (typeof query.d !== 'string' || !query.d) {
    throw new CodecError('data', 'dは空でない値を1つだけ指定してください。')
  }
  return decodeDParameter(query.d)
}

export function shareErrorMessage(cause: unknown): string {
  return cause instanceof CodecError
    ? cause.message
    : '共有データを処理できませんでした。URLを確認して、もう一度お試しください。'
}

export const LONG_SHARE_URL_CHARS = 1000
