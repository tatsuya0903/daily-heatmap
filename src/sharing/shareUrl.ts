import type { LocationQuery, Router } from 'vue-router'
import { CodecError, decodeDParameter } from '@/codec'

/** Routerのhistory/baseを正とし、dをhash内のルートクエリに置く。 */
export function createShareUrl(router: Router, d: string, currentUrl: string): string {
  const resolved = router.resolve({ name: 'heatmap', query: { d } })
  // Hash historyのhrefは通常#/…のみなので、baseを明示的に結合する。
  return new URL(router.options.history.base.replace(/\/$/, '') + resolved.fullPath, currentUrl)
    .href
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
