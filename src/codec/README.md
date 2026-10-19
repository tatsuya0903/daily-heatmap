# V4非圧縮Codec（Issue #6）

`src/codec/index.ts`がアプリ向けの入口です。UI・Pinia・Routerには依存しません。

```ts
import {
  encodeDocument,
  decodeDocument,
  encodeDParameter,
  decodeDParameter,
  FORMAT_IDS,
  CodecError,
} from '@/codec'
import type { HeatmapDocument } from '@/domain/series'

const document: HeatmapDocument = {
  source: { kind: 'exact', startDate: '1970-01-01', counts: [0, 10, 0] },
  thresholds: { method: 'quantile', boundaries: [2, 7] },
}
const bytes = encodeDocument(document, FORMAT_IDS.exactBits)
const restored = decodeDocument(bytes)
const d = encodeDParameter(document, FORMAT_IDS.compact)
const compact = decodeDParameter(d) // source.kind === 'levels'、countsを持たない
```

| API                                                | 入出力                                      |
| -------------------------------------------------- | ------------------------------------------- |
| `encodeDocument(document, format): Uint8Array`     | 指定形式のヘッダー＋rawボディ               |
| `decodeDocument(bytes): HeatmapDocument`           | 全検証を完了したドキュメント                |
| `encodeDParameter(document, format): string`       | 末尾`=`のないBase64URL、`d`値として使用可能 |
| `decodeDParameter(d): HeatmapDocument`             | 正規Base64URLの検証＋ドキュメント復元       |
| `encodeBase64Url(bytes)` / `decodeBase64Url(text)` | サイズ上限付きの共通Base64URL処理           |

形式は`FORMAT_IDS.compact`（0x20）、`exactBits`（0x22）、`exactVarint`（0x24）を明示指定します。エンコード候補の自動選択は行いません。引数の型は`UncompressedFormatId`です。完全形式には`ExactSeries`が必要です。コンパクト形式では`ExactSeries`を確定境界で分類するか、`LevelSeries`をそのまま保存します。入力を変更せず、動的境界を再計算しません。

失敗時は`CodecError`をthrowします。`code`で`size`・`header`・`format`・`date`・`thresholds`・`data`・`varint`・`padding`・`base64url`を識別でき、`message`に原因が入ります。部分的なドキュメントは返しません。Base64URLの共通処理は空文字列と空バイト列の相互変換を許しますが、ドキュメント復元は6バイト未満を拒否します。

`d`は65,536文字、rawボディは40KiBまでです。デコードは文字数・バイト数を検査し、ヘッダーの日数を1〜3,660に制限してから件数配列を確保します。ULEB128は最大8バイト、境界は最大6個です。符号付き24bit epoch day、終了日、正規の最小ビット幅、0パディング、正規ULEB128、余剰バイト、閾値とレベルの整合性を検証します。

## モジュール

- `bytes.ts`：境界付きreader/writer、安全整数検証。
- `bits.ts`：1〜53bit MSB-first packing、パディング検証、最小幅。
- `uleb128.ts`：安全整数用の正規ULEB128。閾値と件数で共用。
- `base64url.ts`：URL-safe・パディングなしの正規表現、再エンコード照合。
- `header.ts`：共通6バイト、UTC日付検証。予約済みの全6形式IDを扱う。
- `metadata.ts`：閾値の保存・復元。`normalizeThresholdProfile`で検証。
- `formats.ts`：公開済み形式IDと型。
- `body.ts`：0x20・0x22・0x24のrawボディ。
- `index.ts`：ヘッダーとボディを結合する公開API。
- `limits.ts` / `errors.ts`：上限値とエラー。

## Issue #7への接続

0x21・0x23・0x25は既存の意味で予約し、現在のドキュメントAPIは未対応エラーにします。`header.ts`はそのまま共通で使えます。`encodeBody` / `decodeBody`はヘッダーとは独立しており、対応する非圧縮IDを指定すると、閾値メタデータを含むボディ全体を生成・復元します。圧縮IDではこのボディ全体だけをraw DEFLATE処理してください。展開結果の40KiB制限は展開中にも必要です。

将来の候補選択は既存の明示形式APIの外側に追加できます。Base64URL長で比較し、同長時は非圧縮→bit packing→小さいIDの優先順位をSPECどおりに適用してください。圧縮ストリームの切断・余剰入力・展開中の容量制限はIssue #7で別途検証します。

テストfixtureはすべて合成値です。Goldenの期待値は仕様から直接計算した固定バイト列・文字列で、実装Encoderから生成していません。広い範囲の往復にはBigIntの決定的LCGを使い、新規依存は追加していません。
