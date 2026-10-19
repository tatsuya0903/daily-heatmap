# V4 Codec（Issue #6・#7）

`src/codec/index.ts`がアプリ向けの入口です。UI・Pinia・Routerには依存しません。

```ts
import {
  encodeDocument,
  decodeDocument,
  encodeDParameter,
  decodeDParameter,
  selectShareEncoding,
  FORMAT_IDS,
} from '@/codec'
import type { HeatmapDocument } from '@/domain/series'

const document: HeatmapDocument = {
  source: { kind: 'exact', startDate: '1970-01-01', counts: [0, 10, 0] },
  thresholds: { method: 'quantile', boundaries: [2, 7] },
}
const bytes = encodeDocument(document, FORMAT_IDS.exactBitsDeflate)
const restored = decodeDocument(bytes)
const compactD = encodeDParameter(document, FORMAT_IDS.compactDeflate)
const compact = decodeDParameter(compactD) // levelsのみ。正確な件数は持たない
const { format, d, length } = selectShareEncoding(document, 'exact')
const reshare = selectShareEncoding(compact, 'compact') // 同じ確定境界とレベルを保持
// selectShareEncoding(compact, 'exact') はCodecError
```

## 公開APIと互換性

| API                                                  | 入出力                                |
| ---------------------------------------------------- | ------------------------------------- |
| `encodeDocument(document, format): Uint8Array`       | 指定形式の共通ヘッダー＋ボディ        |
| `decodeDocument(bytes): HeatmapDocument`             | 全検証を完了したドキュメント          |
| `encodeDParameter(document, format): string`         | パディングなしのBase64URL             |
| `decodeDParameter(d): HeatmapDocument`               | 正規Base64URLの検証＋ドキュメント復元 |
| `selectShareEncoding(document, mode): ShareEncoding` | 最短候補の`{ format, d, length }`     |
| `encodeBase64Url(bytes)` / `decodeBase64Url(text)`   | サイズ制限付きの共通Base64URL処理     |

`FormatId`は6形式、既存の`UncompressedFormatId`は従来の3形式、`CompressedFormatId`は圧縮3形式です。既存4 APIの呼び方と非圧縮を明示指定した場合のバイト列・Base64URLは不変です。

| ID   | `FORMAT_IDS`の名前   | ボディ                 | 圧縮        |
| ---- | -------------------- | ---------------------- | ----------- |
| 0x20 | `compact`            | 3-bit packing          | なし        |
| 0x21 | `compactDeflate`     | 0x20と同じrawボディ    | raw DEFLATE |
| 0x22 | `exactBits`          | 最小幅1〜53bit packing | なし        |
| 0x23 | `exactBitsDeflate`   | 0x22と同じrawボディ    | raw DEFLATE |
| 0x24 | `exactVarint`        | 正規ULEB128            | なし        |
| 0x25 | `exactVarintDeflate` | 0x24と同じrawボディ    | raw DEFLATE |

共通6バイトヘッダーは圧縮しません。圧縮するのは閾値メタデータを含むrawボディ全体です。`encodeBody`／`decodeBody`へ対応する非圧縮IDを渡して再利用しています。

完全形式には`ExactSeries`が必要です。コンパクト形式では`ExactSeries`を確定境界で分類するか、`LevelSeries`のレベルをそのまま保存します。入力を変更せず、保存済み動的境界を再計算せず、LevelSeriesから件数を推定しません。

## 最短候補の選択

`ShareMode`は`'compact' | 'exact'`。compactは0x20・0x21、exactは0x22・0x23・0x24・0x25を実際にBase64URLへ変換し、文字列の`length`を比較します。同長は次の順で優先します。

1. 非圧縮。
2. bit packing。
3. 小さい形式ID。

圧縮前後のバイト長による推測は使いません。候補の生成と比較は同期処理で、固定した実装・設定・同じデータに対して決定的です。`length`は`d`だけの実文字数です。Issue #8でURLを構成する場合は接頭辞などの実文字数を別途加えてください。

## 圧縮ライブラリ

pako **3.0.2**をpackage.jsonとlockfileで正確に固定しています。一括圧縮は`deflateRaw(body, { level: 6, windowBits: 15, memLevel: 8, strategy: 0 })`。ストリーミング圧縮・gzip・zlib・自動形式判定APIは使用しません。

fflate 0.8.3の事前検証資料は保持しています。末尾余剰の受理、公開された消費数の欠如、固定出力バッファでの無通知切り詰め、コールバック前の過大展開、不正LEN/NLENの受理を確認し、採用を見送りました。2026-10-20にpako 3.0.2への変更が承認されています。[事前検証と正式実装の記録](../../docs/issue-7-validation.md)、[独立した再現スクリプト](../../docs/issue-7-deflate-probe.mjs)、[当初の検証結果](../../docs/issue-7-deflate-probe.json)を参照してください。fflateをアプリの依存には追加していません。

## 安全な復元

1. `d`は65,536文字以内。文字数を復号用配列の確保前に確認し、URL-safe・パディングなしの正規Base64URLを検証します。
2. バイナリは49,152バイト以内。**展開前に**共通ヘッダー、形式、日付範囲、日数1〜3,660、終了日を検証します。
3. 非圧縮は既存のボディデコーダーで40KiB上限と想定サイズを検証します。
4. 圧縮は`ZStream`と`zlibInflateInit2(stream, -15)`でrawとして初期化します。出力は**固定40,960バイトだけ**確保し、`avail_out`も同じ値に設定します。
5. `zlibInflate(stream, Z_FINISH)`を**1回だけ**呼びます。自動拡張する一括展開APIは使いません。出力が満杯ならそれ以上の出力を生成せず戻り、進捗のない状態をリトライするループもありません。
6. 出力が容量内であること、返り値が`Z_STREAM_END`であること、`next_in === input.length`かつ`avail_in === 0`であることをそれぞれ検査します。
7. 正常終了時には最後のバイトのDEFLATE上の未使用bitを許しますが、その後の追加バイトは拒否します。末尾00・ff・別の有効ストリームも拒否します。再圧縮比較やprivateな状態からの推測は使いません。
8. 成否にかかわらず`finally`で`zlibInflateEnd`を呼びます。正常な展開結果だけを既存の閾値メタデータ・件数デコーダーへ渡し、正規幅・パディング・境界・件数・余剰rawバイトを再検証します。

固定出力が満杯でも`Z_STREAM_END`なら40KiBちょうどの正常ストリームとして受理します。40KiB＋1では、すべての入力を消費した場合でも`Z_STREAM_END`に達しなければ拒否します。高圧縮率の8MiB相当の入力は、出力40KiB・圧縮入力54/8,157バイトの時点で停止することを回帰テストで計測しています。依存内部の出力自動拡張がないこともconstructorの計装で確認します。

出力容量の40KiBはデコーダー全体のメモリ上限ではありません。入力は最大約48KiB、pakoの辞書は最大32KiB、ほかに有限のHuffman表とドキュメント配列を使います。日数・境界数・ULEB128長も既存制限で抑えます。

## エラーと制約

失敗は`CodecError`で通知し、部分的なHeatmapDocumentは返しません。`code`は従来の`size`・`header`・`format`・`date`・`thresholds`・`data`・`varint`・`padding`・`base64url`に加えて`compression`を持ちます。`message`に原因を含みます。

出力が満杯で終了しない場合は`size`です。この場合は過大展開だけでなく、40KiBちょうどを書いた後に終端が切断された場合も安全側で拒否します。その他の不正・切断ストリームと圧縮末尾余剰は`compression`です。Base64URLの汎用処理は空文字列と空配列の相互変換を許しますが、ドキュメントは6バイト未満を拒否し、圧縮ボディも空入力を拒否します。

APIは同期処理です。最大3,660日の5種類の合成分布をNode・Chromium・Firefox・WebKitで計測し、各6形式・圧縮3形式の復元・2共有モードを確認しています。[性能・ビルドサイズの結果](../../docs/issue-7-performance.json)、[再現スクリプト](../../docs/issue-7-performance.mjs)を参照してください。実機モバイルやすべてのブラウザーバージョンの性能は未測定です。

既存SPAはIssue #8までCodecを読み込みません。そのため現在のアプリの本番バンドルは変化しません。Codecの全公開APIを含む独立した本番バンドルの増分を別途測り、将来接続した場合の依存コストを記録しています。

## テストとモジュール

- `codec.spec.ts`：既存非圧縮Goldenと往復・防御。予約圧縮IDの旧未対応テスト3件は、不正圧縮ボディを拒否するテストへ更新。
- `compressed.spec.ts`：圧縮Golden3形式、1・2・201・3,660日、閏日・年境界、全閾値方式、MAX_SAFE_INTEGER、レベル責務、最短候補・同長優先順位。
- `deflate.spec.ts`：事前検証の問題を安全な拒否動作として回帰。stored／fixed／dynamic、全切断prefix、LEN/NLEN、末尾余剰、40KiB、過大展開中止、割当・消費数、後処理・無進捗を検証。
- `e2e/codec.spec.ts`：テスト専用に本番用ビルドを生成し、Chromium・Firefox・WebKitとモバイル相当でCodecを実行。テスト入口はSPAへ含めない。
- `body.ts`：閾値メタデータを含む既存rawボディ。`deflate.ts`：pakoの安全な境界。`selection.ts`：文字数・優先順位の比較。`index.ts`：共通ヘッダーと公開API。
- その他の`bytes.ts`・`bits.ts`・`uleb128.ts`・`base64url.ts`・`header.ts`・`metadata.ts`のエンコード規則は変更なし。

fixtureはすべて合成値です。非圧縮Goldenは仕様から手計算した固定値を維持します。圧縮Goldenは手で指定したrawボディを独立したNode zlibで圧縮した固定値で、pako 3.0.2の固定設定でも一致することと、Node zlibで展開できることを確認します。ライブラリ一般に同じDEFLATE出力を要求するものではありません。

URL生成UI、コピー、Routerからの復元、再共有UI、公開処理は含みません。
