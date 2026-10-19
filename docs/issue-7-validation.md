# Issue #7 事前検証と正式実装の記録

2026-10-20にpako 3.0.2採用の正式承認を受領し、同じブランチで実装を再開した。以下の事前検証記録は当時の判断と再現結果として保持する。承認後の実装・検証結果は末尾に追記する。

## 2026-10-19 事前検証（当時の承認待ち記録）

- 実施日：2026-10-19（Asia/Tokyo）
- ブランチ：`codex/7-compressed-codec`
- 基点：`a5a93d5ccb27ebd3333e9b0776bec8a87a03e6d8`（最新のmain／origin/main、Issue #6までマージ済み）
- 作業開始時：main、作業ツリーはクリーン。fetch後のmainはorigin/mainと一致し、そのmainから指定ブランチを作成した。
- 正とした資料：[Issue #7](https://github.com/tatsuya0903/daily-heatmap/issues/7)、SPEC.md第5章・第7.3節、mainの`src/codec/`とテスト。
- 結論：**fflate 0.8.3の公開APIは要求された安全条件を満たさない。ユーザー指定の停止条件に従い、製品実装・依存追加・コミットを保留する。** Issue #7は未完了。

## 再現手順と検証範囲

アプリケーションCodecに依存しない`issue-7-deflate-probe.mjs`を追加した。npm公開tarballを一時ディレクトリに展開し、パッケージの正確なバージョンをassertする。`package.json`と`package-lock.json`には変更を加えていない。

```sh
mkdir -p /private/tmp/daily-heatmap-7/fflate /private/tmp/daily-heatmap-7/pako
npm pack fflate@0.8.3 --pack-destination /private/tmp
npm pack pako@3.0.2 --pack-destination /private/tmp
tar -xzf /private/tmp/fflate-0.8.3.tgz -C /private/tmp/daily-heatmap-7/fflate
tar -xzf /private/tmp/pako-3.0.2.tgz -C /private/tmp/daily-heatmap-7/pako
node docs/issue-7-deflate-probe.mjs \
  /private/tmp/daily-heatmap-7/fflate/package \
  /private/tmp/daily-heatmap-7/pako/package --browsers
```

`--browsers`は任意。指定した場合は、このリポジトリの既存`@playwright/test`とインストール済みブラウザーを使用する。ダウンロードしたライブラリ自体はリポジトリへ含めない。実行結果は[issue-7-deflate-probe.json](./issue-7-deflate-probe.json)に記録する。非安全な挙動を再現するassertも含む調査であり、「すべてのassert成功」は「ライブラリの安全性合格」を意味しない。

すべて決定的な合成バイト列。個人の実データ、外部fixtureは使用していない。独立した参照実装はNode.jsの`node:zlib`（zlib `1.3.2.1-motley-8002e91`）。バイト数上限検証用の40KiBボディは、HeatmapDocumentとして正常という意味ではなく、DEFLATE層の正常データである。

## バージョン、API、依存サイズ、互換性

調査時のnpm latestはfflate **0.8.3**、pako **3.0.2**。両方の公開パッケージを取得して内容を確認した。pako 2.1.0も比較途中で一時領域に取得したが、結論と再現テストは3.0.2を対象とする。

| 項目                           | fflate 0.8.3                              | pako 3.0.2（採用候補、未承認）                                 |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------------- |
| 一括raw圧縮                    | `deflateSync(data, { level: 6, mem: 8 })` | `deflateRaw(data, { level: 6 })`                               |
| 一括raw展開                    | `inflateSync(data, { out })`              | `inflateRaw(data)`（安全なCodec用途にはそのまま採用しない）    |
| ストリーミング                 | `Inflate`、`AsyncInflate`                 | `Inflate`                                                      |
| 公開低水準展開API              | なし                                      | `ZStream`、`zlibInflateInit2`、`zlibInflate`、`zlibInflateEnd` |
| 実行時の他パッケージ依存       | 0                                         | 0                                                              |
| npm tarball                    | 173,034 bytes                             | 599,801 bytes                                                  |
| npm unpacked size              | 796,742 bytes                             | 2,486,658 bytes                                                |
| 全機能のminified配布物         | UMD 33,044 bytes                          | browser ESM 45,176 bytes                                       |
| 同配布物のgzip（ローカル計測） | 12,691 bytes                              | 13,911 bytes                                                   |
| 型・モジュール                 | 型定義内蔵、ESM／CJS／UMD                 | 型定義内蔵、ESM／CJS／UMD、低水準APIも型定義あり               |
| ライセンス                     | MIT                                       | MIT AND Zlib                                                   |

配布物のサイズとアプリへの追加サイズは異なる。上表は全機能配布物の値で、tree shaking後の実際のバンドル差は未測定。ファイルごとのSHA-256とサイズをJSONに保存した。取得時のnpm tarball SHA-1はfflate `bc27d8eb30343d4d512abb03480202ce65d825fc`、pako `b983206a36914f169ca9ea0f6bf702fc5ba1ac71`。

fflateはTypedArrayを使用し、非同期APIのみWorkerを必要とする。今回は一括同期圧縮と同期展開を調査し、ZIP・ストリーミング圧縮・自動形式判定APIは採用していない。[fflate README](https://github.com/101arrowz/fflate/tree/v0.8.3)、[fflateソース](https://github.com/101arrowz/fflate/blob/v0.8.3/src/index.ts)を参照。既知のストリーミングZIP圧縮の問題は[upstream #282](https://github.com/101arrowz/fflate/issues/282)に報告されているが、今回の一括raw圧縮の失敗を意味するものとは扱っていない。

ブラウザー実測：Chromium `153.0.8010.12`、Firefox `155.0`、WebKit `26.6`。fflateのraw往復、一括圧縮出力のNodeとの一致、末尾余剰受理、固定バッファでの無通知切り詰め、pako低水準の40KiB停止を確認した。全異常系のブラウザー横断検証、モバイル実機、過去バージョンのブラウザーは未検証。[pako 3.0.2 README](https://github.com/nodeca/pako/tree/3.0.2)も参照。

## fflateの再現結果

| 検証                                   | 結果                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| raw圧縮・展開                          | 成功。fflateで圧縮しNode zlibで展開、逆方向も一致                                  |
| gzip／zlibとの区別                     | サンプルのgzip／zlib入力を`inflateSync`は拒否。自動形式判定APIは使わない           |
| 末尾に`00`、`ff`、`00 ff`を追加        | 一括・ストリーミングとも余剰を無視して正常復帰                                     |
| 後ろに別の有効rawストリームを追加      | 一括・ストリーミングとも後続を無視                                                 |
| 消費入力バイト数                       | 公開APIから取得できない。型定義で`Inflate`の状態はprivate                          |
| 途中切断                               | 883バイトのサンプルについて、非空の切断prefix全882通りを両APIで拒否                |
| 空の圧縮入力                           | 両APIとも空出力として受理。Node zlibは拒否                                         |
| `BTYPE=3`と、その後ろの有効ストリーム  | 拒否                                                                               |
| stored blockの不正`LEN/NLEN`           | `01 01 00 00 00 41`を両APIが`41`として受理。Node zlibは拒否                        |
| 最終バイトの未使用ビット               | 空のfixedブロック`03 fc`はNode zlib・fflateとも受理。10bitが有効、上位6bitは未使用 |
| 40KiBちょうど＋`out`指定               | 40,960バイトを正常返却                                                             |
| 40KiB＋1バイト＋`out`指定              | エラーなしで40,960バイトへ切り詰める                                               |
| 8MiB相当＋`out`指定                    | 圧縮入力8,157バイトから、エラーなしで40,960バイトへ切り詰める                      |
| ストリーミングのコールバックで上限検査 | 8MiB相当を最初のコールバック前に完全展開し、最大16MiBのUint8Arrayを確保            |

### 最終ブロックと消費入力は別の条件

`Inflate.ondata`の`final`は呼び出し元の`push(..., final)`に対応しており、DEFLATEのBFINAL／EOBを解析し終えたことの証明にはならない。完全なストリームを`push(raw, false)`しても通知は`false`である。

`03 fc`の未使用6bitを許可することと、その後の`00`などを拒否することは別である。fflate内部にはbit位置や最終ブロックの情報があるが、公開された消費数・終了状態として取得できない。内部privateプロパティや再圧縮一致からの推測は採用しない。

### 固定バッファは展開作業の中止ではない

`out`の公式型コメントも、容量超過時には切り詰めると説明している。1MiBの0列を圧縮し、出力バッファへの書き込みを診断用Proxyで数えると、**1,048,576回の書き込み、うち1,007,616回は40KiBの範囲外**だった。ソースを書き換えず、TypedArrayのgetterとメソッドを元の配列へbindし、書き込みを観測した。これは採用候補の安全ラッパーではなく、ループが容量到達後も続くことの調査用計装である。

ストリーミング側は未変更のbrowser CJSをVMに読み込み、Uint8Arrayのconstructorだけを計測した。圧縮入力8,157バイトは`d`の文字数上限内に入るが、最初のコールバックへ8,388,608バイトを渡す前に最大16,777,216バイトを確保した。コールバックでthrowしても、この確保と完全展開には間に合わない。

圧縮入力を細かく分ける方法やWorkerの中止は、公開された消費数の欠如と不正ブロック受理を解決しない。以上から、fflateの公開APIだけを安全な復元処理として採用することは保留する。

## 代替案の比較と承認対象

| 案                                         | 既存形式への影響               | 利点                                                                            | 制約・追加作業                                                                                             |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **A：pako 3.0.2へ変更（推奨）**            | ID・ヘッダー・ボディの変更不要 | 一括raw圧縮と、公開低水準APIによる容量・消費数・終了状態の検査を1依存で実現可能 | 採用承認、全Codecテスト・Golden・実バンドルと性能の計測が必要                                              |
| B：fflateで圧縮＋pakoで展開                | 同上                           | fflate一括圧縮を維持                                                            | 2依存・2ライブラリの固定と検証が必要。tree shaking後のサイズ優位は未確認                                   |
| C：fflateをfork／独自のDEFLATE検証器を追加 | 同上                           | 形式は維持できる可能性                                                          | LEN/NLENを含む構造検査、展開上限、終了位置、Huffman等の監査・継続保守が必要。今回未実装                    |
| D：長さやchecksumを形式へ追加              | SPECと形式互換性の再検討が必要 | 長さや完全性の明示                                                              | 長さの追加だけではfflateの途中停止・不正ブロック受理を解決しない。公開済みIDの意味も変更できないため非推奨 |

承認を求める具体案は**A：pako 3.0.2を正確なバージョンで固定し、`deflateRaw`で一括圧縮、公開低水準APIで安全に展開する。形式変更は行わない。** 現段階では比較用の独立検証のみで、製品Codecには接続していない。

### pako 3.0.2の低水準APIで確認した方法

1. `new ZStream()`、`zlibInflateInit2(stream, -15)`でrawを指定する。
2. 入力全体を指定し、呼び出し元で**40,960バイトだけ**の出力配列を確保する。`avail_out`も40,960にする。
3. `zlibInflate(stream, Z_FINISH)`を呼ぶ。出力が満杯なら、このAPIがそれ以上の出力を作らず戻る。自動拡張APIと異なる。
4. 成功条件は**返り値が`Z_STREAM_END`かつ`next_in === input.length`（`avail_in === 0`）**。入力を最後まで消費したことだけでは成功としない。
5. `next_out`の長さだけをボディに渡す。エラー・不完全・余剰時には渡さない。`zlibInflateEnd`で常に状態を解放する。

| 独立検証の入力      | 状態           | 出力済み |   消費入力 |
| ------------------- | -------------- | -------: | ---------: |
| 40KiBの0列          | `Z_STREAM_END` |   40,960 |    57 / 57 |
| 40KiB＋1バイトの0列 | `Z_BUF_ERROR`  |   40,960 |    56 / 56 |
| 8MiBの0列           | `Z_BUF_ERROR`  |   40,960 | 54 / 8,157 |

40KiB＋1では入力を全消費していても、不完全なmatch出力が残るため終了状態ではない。この再現例により、終了状態と消費数を独立に検査する必要性も確認した。8MiBの計装では、内部で生成したUint8Arrayは最大32,768バイトで、呼び出し元の40KiB出力を拡張せず停止した。

末尾`00`／`ff`／別の有効ストリームでは、`Z_STREAM_END`であっても余剰分が`avail_in`に残る。最終バイトの未使用bitを立てた`03 fc`は2バイト消費で正常終了し、その後の追加バイトとは区別できた。空を含む切断prefix、不正LEN/NLEN、予約ブロック、gzip／zlibサンプルも成功条件を満たさなかった。

これは採用可能性を確認する調査で、DEFLATE全実装の網羅的な安全性保証ではない。承認後に、stored／fixed／dynamicの正常・異常例をさらに含めて製品Codecの単体テストを作成する。

## 承認後の実装方針（未実装）

- `encodeBody`／`decodeBody`を再利用する。`0x21→0x20`、`0x23→0x22`、`0x25→0x24`と対応させ、共通6バイトヘッダー以降の閾値メタデータを含むボディ全体を圧縮する。
- 非圧縮3形式のエンコード規則・既存Golden・保存済み確定境界を一切変更しない。ExactSeries／LevelSeriesの責務を維持する。
- `decodeDParameter`の既存65,536文字制限、`decodeHeader`の検証を展開より先に実施する。展開成功後にも既存のメタデータと件数デコーダーで全検証する。失敗はCodecError、部分的なHeatmapDocumentは返さない。
- 現行4つのAPI名と引数の利用法を維持し、明示形式引数を`FormatId`へ拡張する。既存非圧縮指定の出力は不変。
- 追加API案：`selectShareEncoding(document, mode)`で`{ format, d, length }`を返す。`mode`は`compact`／`exact`。完全共有はExactSeriesのみ。名称・型は実装時に確定する。
- compactは2候補、exactは4候補を**実際にBase64URL文字列へ変換して`length`を比較**する。同長時は非圧縮→bit packing→小さいIDの順。圧縮前後のバイト長だけで決定しない。
- Goldenは採用版・設定を固定し、Node zlib等の独立実装でも展開を確認する。
- Issue #8へは、形式ID・`d`・実文字数を返すAPIとCodecErrorの契約を申し送る。共有ダイアログ、URLコピー、Router復元、再共有UIは今回実装しない。

## テスト・性能・Git状態

独立検証は24ケースのassertを実行し、fflateの要件不適合とpakoの採用可能性を確認した。ブラウザー3種でのスモーク検証も成功。圧縮3形式の製品Golden／完全往復／最短候補選択テストは、ライブラリ変更の承認前なので未実装。

最大3,660日の6形式エンコード・圧縮3形式デコード・最短候補選択・分布別圧縮率の性能測定も、製品実装を保留したため未実施。検証スクリプトの3,660バイトの列は相互運用検証用の合成バイト列であり、3,660日の性能測定結果とは扱わない。

測定環境：Apple M1、arm64、macOS 26.5.1、Node v24.21.0。安全性の再現確認は各ケース1回（切断prefixは全列挙）。性能ベンチマークの測定回数は0回。

既存実装と今回追加した調査ファイルに対する品質確認結果：

| コマンド                          | 結果                                      |
| --------------------------------- | ----------------------------------------- |
| `npm run type-check`              | 成功                                      |
| `npm run lint`                    | 成功、警告0                               |
| `npm run format:check`            | 成功                                      |
| `npm run test:unit`               | 13ファイル、756件成功（既存Goldenを含む） |
| `npm run test:e2e -- --workers=1` | 全5構成、195件成功（1.6分）               |
| `npm run build`                   | 成功                                      |
| `git diff --check`                | 成功                                      |

通常サンドボックスではGit管理領域への書き込み、ネットワーク、ブラウザー起動／ローカルサーバーの権限が足りなかったため、それぞれ許可された昇格実行でfetch・ブランチ作成・npmパッケージ取得・ブラウザー検証・E2Eを実行した。自動承認による拒否はない。

変更ファイルは調査スクリプト、結果JSON、この検証記録、`src/codec/README.md`のみ。アプリのソース・単体テスト・E2E・依存ファイルは変更していない。コミットは安全性合格後に許可された作業なので、現段階では**新規ローカルコミットなし**。push・PR作成・Ready化・マージ・タグ・デプロイも行っていない。

## 2026-10-20 承認後の正式実装

ユーザーからpako **3.0.2**の採用、既存V4形式の維持、同一ブランチでのローカル実装・テスト・コミットの正式承認を受領した。上記の事前検証スクリプト・結果・調査記録とCodec READMEの4ファイルを保持し、製品実装に反映した。fflateは依存へ追加していない。

### 実装した形式とAPI

- 0x21は0x20、0x23は0x22、0x25は0x24のrawボディ全体を圧縮する。6バイトヘッダーを圧縮せず、`encodeBody`／`decodeBody`を再利用する。
- 圧縮は`deflateRaw(body, { level: 6, windowBits: 15, memLevel: 8, strategy: 0 })`の一括同期API。package.json／package-lock.jsonとも`3.0.2`に固定した。
- `encodeDocument`、`decodeDocument`、`encodeDParameter`、`decodeDParameter`を維持。明示形式引数は既存の型を包含する`FormatId`へ拡張。非圧縮Goldenの値は変更していない。
- 新APIは`selectShareEncoding(document, mode)`。`mode: 'compact' | 'exact'`から`{ format, d, length }`を返す。compactは2候補、exactは4候補をBase64URLまで実際にエンコードし、文字列の実文字数で選ぶ。同長は非圧縮→bit packing→小さいID。`ShareEncoding`／`ShareMode`／`CompressedFormatId`も公開する。
- 完全形式と完全候補選択はExactSeriesだけを受け付ける。LevelSeriesのレベルと確定境界を保持し、件数を推定しない。動的境界も再計算しない。

### 40KiB制限・終了・余剰の防御

`src/codec/deflate.ts`で公開低水準APIだけを利用する。`ZStream`、`zlibInflateInit2(stream, -15)`、固定40,960バイトの`output`／`avail_out`を指定し、`zlibInflate(stream, Z_FINISH)`を1回だけ呼ぶ。呼出側の再試行ループはなく、無進捗の返り値でも終了する。

次の3条件を独立して検査する。

1. `next_out`が40KiB以内で、出力容量を超えていないこと。
2. 返り値が`Z_STREAM_END`であること。満杯だけでは成功としない。
3. `next_in === input.length`かつ`avail_in === 0`であること。終了後の00・ff・複数バイト・別ストリームを拒否する。

40KiBちょうどを生成し、最終ブロックを正常に終了した場合は成功する。40KiB＋1では入力全消費でも未出力のmatchが残るため`Z_BUF_ERROR`になり、拒否する。8MiB相当の0列は**出力40,960バイト・入力54/8,157バイト**で停止する。単に完全展開後の長さを検査しているわけではない。実際のpakoへの呼出を計装して出力領域40,960バイト、生成済み出力40,960バイト、呼出回数1を確認した。依存のCJSを未変更でVMにロードするconstructor計装でも、内部Uint8Arrayは最大32,768バイトだった。

最後のバイトに残る未使用bitは許容し、その後の追加バイトとは区別する。`03 fc`は2バイト消費で正常な空rawストリームだが、`03 fc 00`は余剰として拒否する。空の圧縮入力は拒否する。gzip／zlibの自動判定は行わない。不正LEN/NLEN・予約ブロック・不正Huffman構造・不正後続・切断も拒否する。

ヘッダーと日数・日付の検証は展開前に完了する。文字数制限も復号前に行う。成功したraw出力だけを既存ボディデコーダーへ渡し、閾値・件数・bit幅・パディング・余剰rawバイトを再検証する。失敗はCodecErrorで、部分的なHeatmapDocumentは返さない。低水準APIが例外を投げた場合もCodecErrorへ変換し、初期化失敗・通常成功・各失敗経路を含めて`finally`から`zlibInflateEnd`を呼ぶ。

既存のCodecError codeは保持し、`compression`を追加した。容量到達かつ未終了の場合は`size`。終端が切断された容量ちょうどの入力もこのcodeになり得るが、いずれも正常として受理しない。

### 事前検証24ケースの回帰への対応

事前検証のfflate固有の挙動を期待するテストは、fflate採用のためのテストとしてCIへ追加せず、採用しない根拠として元スクリプトとJSONを保持した。同じ入力条件に対して、製品Codecが安全に受理／拒否することを自動テストへ取り込んだ。

| 当初のケース（JSONの順序）                         | 正式実装の回帰                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| 1：raw相互運用、2：wrapper区別                     | Node zlibとの双方向往復、圧縮Golden、gzip／zlib拒否                         |
| 3〜6：余剰00／ff／複数／別ストリーム               | 低水準と全3形式で余剰を拒否                                                 |
| 7：切断prefix、8：空入力                           | stored／fixed／dynamicの全切断prefixと空入力を拒否                          |
| 9：呼出元のfinalフラグ                             | finalコールバックに依存せず、低水準終了状態を必須化。無進捗でも再試行しない |
| 10：予約BTYPE、11：LEN/NLEN                        | 不正ブロックと不正ブロック後の有効データを拒否                              |
| 12：最後の未使用bit                                | 未使用bitを許可し、追加1バイトを拒否                                        |
| 13〜15：固定outの容量境界／高圧縮率                | 40KiB成功、＋1拒否、8MiBの途中停止を検証                                    |
| 16：容量後の書込継続、17：コールバック前の過大確保 | 実際の生成済み出力と入力消費を計装、constructor計装で拡張なしを検証         |
| 18：pakoの割当、19：相互運用                       | インストール済みpakoを用いて同じ割当計装とNode zlib往復を回帰化             |
| 20：EOBと余剰の区別、21：切断／不正                | 終了状態＋消費数の両方を必須化し、切断／不正入力を拒否                      |
| 22〜24：40KiB／＋1／8MiB                           | 3ブロック種別の境界と、入力全消費でも未終了になるケースを明示的に検証       |

追加単体は`deflate.spec.ts`32件、`compressed.spec.ts`153件の計185件。全3圧縮形式のGoldenは固定バイト列・Base64URL文字列・Node zlibでの独立展開を検証する。期待rawボディは手で指定し、Node zlibで生成した圧縮固定値がpakoの固定設定でも一致することを確認した。全ライブラリに同じ圧縮バイト列を要求するものではない。

1・2・201・3,660日、0・末尾0・MAX_SAFE_INTEGER、年境界・閏日、プリセット3種、動的3方式とカスタムを含めた往復を検証する。既存非圧縮テスト756件を維持し、旧「予約圧縮IDを未対応として拒否」3件だけを現在の仕様に合わせて不正圧縮ボディ拒否へ更新した。非圧縮Goldenの期待値は変更していない。

候補選択は全候補を独立に生成した結果との照合、圧縮／非圧縮の勝ち分け、bit／ULEB128の分布差、実際の同長候補（0x20対0x21、0x22対0x24）、同長の全形式対の優先順位、LevelSeriesの完全共有拒否を検証した。

ブラウザーは5シナリオを5構成で計25件追加した。本番minify設定のCodec専用bundleをテスト時にメモリ上で生成してページへ読み込み、Chromium・Firefox・WebKit・Pixel 7相当・iPhone 13相当で、6形式の往復・3圧縮Golden・最短選択・異常系・容量境界を検証する。テスト入口はSPAへ含めていない。

### 性能と本番サイズ

[再現スクリプト](./issue-7-performance.mjs)と[全測定結果](./issue-7-performance.json)を保存した。5つの合成分布を各3,660日とし、全6形式のエンコード（バイナリ／Base64URL）、圧縮3形式のドキュメント復元、compact／exact選択、圧縮率、実文字数を測定した。全て保存済みの同じ確定境界`[2,7,131]`を使用する。

環境はApple M1・arm64・macOS 26.5.1・Node v24.21.0、Chromium 153.0.8010.12／Firefox 155.0／WebKit 26.6。Viteの本番minify済みCodecを使用し、性能測定同士やE2Eとは並行しない。各処理30標本、ウォームアップ5ラウンド。Nodeは1標本1回、ブラウザーはタイマー丸めの影響を抑えるため1標本10回の平均を使う（ブラウザーは事前50回＋測定300回／処理）。p95もバッチの1回換算値の分位点で、単発レイテンシのp95とは異なる。NodeではVMサンドボックスの組込みアクセスコストを混ぜず、通常realmで実行する。

次はChromiumの1回換算中央値（ms）。エンコードは0x20／21／22／23／24／25、復元は0x21／23／25の順。

| 分布                 | 6形式エンコード                         | 圧縮3形式復元      | compact選択 | exact選択 |
| -------------------- | --------------------------------------- | ------------------ | ----------: | --------: |
| 全0                  | 0.56 / 0.61 / 0.12 / 0.18 / 0.12 / 0.19 | 0.31 / 0.16 / 0.07 |        1.20 |      0.68 |
| 0〜1199の周期        | 1.03 / 1.09 / 1.13 / 1.24 / 0.19 / 0.32 | 0.31 / 1.43 / 0.14 |        2.10 |      3.18 |
| 疎なMAX_SAFE_INTEGER | 0.57 / 0.65 / 2.82 / 3.08 / 0.12 / 0.21 | 0.30 / 4.46 / 0.07 |        1.25 |      6.67 |
| 53bit疑似乱数        | 1.03 / 1.10 / 5.47 / 6.04 / 0.69 / 1.55 | 0.37 / 7.92 / 0.80 |        2.16 |     15.98 |
| 小さい値の偏り       | 1.01 / 1.07 / 0.75 / 0.83 / 0.14 / 0.23 | 0.39 / 0.82 / 0.09 |        2.12 |      2.13 |

exact選択の最大中央値はNode 20.48ms、Chromium 15.98ms、Firefox 8.70ms、WebKit 19.10ms。全分布・両共有モードの最大バッチp95はNode 21.80ms、Chromium 16.08ms、Firefox 9.00ms、WebKit 21.50msだった。この環境では共有を明示的に生成する処理として許容できる範囲と判断する。常時入力ごとに再生成する設計にはしていない。

| 分布                 | 0x20文字 | 0x21文字 | 0x22文字 | 0x23文字 | 0x24文字 | 0x25文字 | compact / exact選択 |
| -------------------- | -------: | -------: | -------: | -------: | -------: | -------: | ------------------- |
| 全0                  |     1846 |       32 |      627 |       26 |     4895 |       42 | 21 / 23             |
| 0〜1199の周期        |     1846 |       56 |     6727 |     2251 |     9183 |     2583 | 21 / 23             |
| 疎なMAX_SAFE_INTEGER |     1846 |       78 |    32347 |      211 |     5082 |       74 | 21 / 25             |
| 53bit疑似乱数        |     1846 |       36 |    32347 |    32360 |    38759 |    35252 | 21 / 22             |
| 小さい値の偏り       |     1846 |       54 |     4896 |       92 |     5382 |       94 | 21 / 23             |

コンパクトはレベルだけを保存するため、完全データと情報量は異なる。各ボディの圧縮率はJSONの`bodyRatio`に記録し、6バイトヘッダーは除外している。53bit乱数では圧縮bit形式が非圧縮より長くなり、候補選択は0x22を選んだ。

main基点を`git archive`で一時領域へ復元し、同じビルド設定・同じgzip処理で比較した。

| 対象                     | 変更前minify bytes | 変更後minify bytes | 増分bytes | 変更前gzip bytes | 変更後gzip bytes | 増分gzip bytes |
| ------------------------ | -----------------: | -----------------: | --------: | ---------------: | ---------------: | -------------: |
| 現在のSPA JS             |             281602 |             281602 |         0 |           101754 |           101754 |              0 |
| 全公開APIを含む独立Codec |              11114 |              53001 |     41887 |             4274 |            17627 |          13353 |

SPAはIssue #8までCodecをimportしないため、実際のアプリの出力ハッシュも不変。独立Codecの差分にはpakoとIssue #7のコードが含まれ、将来の共有モジュールとの重複排除は考慮しない。実際に接続した際のアプリ差分そのものと混同しない。gzip増分約13.0KiBは静的SPAの追加依存として妥当と判断する。Vite CLI表示のgzipと上表は圧縮器設定が異なるため、比較には一貫してNodeの`gzipSync`を使用した。

### 品質確認と作業範囲

最終のコマンド実行結果は完了時に追記する。`npm run test -- --workers=1`がE2Eへ正しく引数を渡せるよう、`test`スクリプトの末尾へ`--`を追加した。テスト用のVite bundleがアプリのTypeScriptをimportできるよう、e2e/tsconfig.jsonのモジュール解決を本体と同じBundlerへ合わせ、E2E自体の型チェックも行った。

変更ファイルは次の20ファイル。事前検証4ファイルも含む。

- `package.json`、`package-lock.json`
- `src/codec/index.ts`、`formats.ts`、`errors.ts`、`deflate.ts`、`selection.ts`
- `src/codec/codec.spec.ts`、`compressed.spec.ts`、`deflate.spec.ts`、`README.md`
- `e2e/codec-bundle.ts`、`codec-entry.ts`、`codec.spec.ts`、`tsconfig.json`
- `docs/issue-7-validation.md`、`issue-7-deflate-probe.mjs`、`issue-7-deflate-probe.json`、`issue-7-performance.mjs`、`issue-7-performance.json`

Issue #8へは`selectShareEncoding(document, mode)`の`format`・`d`・`length`と、失敗時のCodecErrorを申し送る。`length`はURL全体の長さではない。LevelSeriesはcompactだけに許可する。共有ダイアログ、コピー、Router復元、再共有UI、Pages、タグには着手していない。

残る制約は、実機モバイル・低速端末・過去の全ブラウザーバージョンの性能を測っていないことと、Issue #8接続後の最終アプリサイズが未確定であること。同期APIなので、共有UI側は必要なタイミングで呼ぶ。要求された安全条件を緩めた回避や、新たな安全性上の問題は確認していない。

### 最終品質確認結果

| コマンド                          | 結果                                                     |
| --------------------------------- | -------------------------------------------------------- |
| `npm run type-check`              | 成功（Vitest用TypeScriptも含む）                         |
| `npm run lint`                    | Oxlint・ESLint成功、警告0                                |
| `npm run format`                  | 成功。既存の対象外ファイルは変更なし                     |
| `npm run test`                    | 単体15ファイル941件、E2E全5構成220件成功（E2E 52.3秒）   |
| `npm run test -- --workers=1`     | 単体15ファイル941件、E2E全5構成220件成功（E2E 1.7分）    |
| `npm run build`                   | 型チェック・本番ビルド成功                               |
| `git diff --check`                | 成功。ステージ後の追加ファイルも`--cached --check`で確認 |
| `npm run format:check`            | 成功                                                     |
| `tsc --project e2e/tsconfig.json` | 成功                                                     |

指定の2通りの全テスト実行は、いずれも失敗・スキップなし。`--workers=1`が実際にPlaywrightへ渡されたこともログで確認した。既存の非圧縮ボディ・bit packing・共通ヘッダー・閾値メタデータ・ULEB128・Base64URL・domainのソースは変更していない。

ローカルで1コミットにまとめる。コミットIDと最終Git状態は完了報告を参照。push・PR作成・Ready化・マージ・タグ・公開デプロイは実施していない。
