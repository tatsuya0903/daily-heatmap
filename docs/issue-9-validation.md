# Issue #9 検証記録

2026-10-20開始、2026-10-21完了（JST）。対象：[Issue #9](https://github.com/tatsuya0903/daily-heatmap/issues/9)、SPEC第1〜5章・第7章・8.2節。
fetch後のmain / origin/mainはともに`7557d9c8f3fe4fabe0e8da41ad74dccf5c8344d2`。作業前の変更なし。`codex/9-quality-readme`で作業。push・PR・マージ・タグ・公開・Issue #10の実装は行わない。

## 着手時の棚卸し

既存単体956件（17ファイル）成功、E2Eは54シナリオ×5構成＝270件。Playwright 1.63.0のChromium / Firefox / WebKit / mobile-chrome（Pixel 7）/ mobile-safari（iPhone 13）、本番preview、Hash URL、CI時1 worker・retry 2。モバイル2構成はエミュレーションであり実機ではない。

「十分」は当該の合成入力とテストの範囲での評価で、すべての端末・入力に対する保証ではない。

| SPEC受け入れ条件                                                         | 着手時の分類       | 既存の主な検証・不足                                                                              |
| ------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| 7.1 2列・複数列・単列/合算・日本語/空白ヘッダー・BOM/LF/CRLF             | 十分に検証済み     | `tsv.spec.ts`、`tsvFile.spec.ts`、`tsv-import.spec.ts`                                            |
| 7.1 3+3、21+24、ソート・0補完・末尾0・期間                               | 十分に検証済み     | `tsv.spec.ts`、`importedSeries.spec.ts`。部分選択から共有までの接続は別途不足                     |
| 7.1 重複・列数・選択0・不正整数/日付・安全整数/合算超過・3660日/2MiB上限 | 十分に検証済み     | `tsv*.spec.ts`、`tsv-import.spec.ts`（UIでも各代表エラー）                                        |
| 7.1 TZ/DST/閏年/月末/年跨ぎ・1/99/100/2000/9999年・終了日はみ出し        | 十分に検証済み     | `dates.spec.ts`、`heatmap.spec.ts`、E2E `heatmap.spec.ts`                                         |
| 7.2 0独立・ID0/1/2固定・ID1の全境界・8色とラベル                         | 十分に検証済み     | `thresholds.spec.ts`、`heatmap.spec.ts`、E2E `threshold-settings.spec.ts`                         |
| 7.2 自動3方式・0除外・全0/同値/少数値/外れ値/巨大整数・同値同レベル      | 十分に検証済み     | `thresholds.spec.ts`、E2Eの全0/同値/巨大数                                                        |
| 7.2 Custom6境界・重複/昇順/範囲・空境界の凡例                            | 十分に検証済み     | `thresholds.spec.ts`、E2E `threshold-settings.spec.ts`                                            |
| 7.2 保存済み動的境界の非再生成・プリセット不整合拒否                     | 十分に検証済み     | `thresholds.spec.ts`、`codec.spec.ts`、E2E `sharing.spec.ts`の意図的に再生成値と異なる境界        |
| 7.3 共通ヘッダー・6形式Golden・3bit/MSB/padding・1/2/201/3660日          | 十分に検証済み     | `header.spec.ts`、`primitives.spec.ts`、`codec.spec.ts`、`compressed.spec.ts`                     |
| 7.3 完全bit幅1〜53/ULEB128・MAX/0・動的境界・最短/同長優先               | 十分に検証済み     | `primitives.spec.ts`、`metadata.spec.ts`、`compressed.spec.ts`                                    |
| 7.3 コンパクト不可逆・完全から両共有                                     | 十分に検証済み     | `compressed.spec.ts`、E2E `sharing.spec.ts`                                                       |
| 7.3 不正base64/形式/閾値/Varint/境界・切断/余剰/padding/巨大展開         | 十分に検証済み     | 全Codec単体、特に`deflate.spec.ts`の40KiB中止・消費入力・Z_STREAM_END・割当計装。E2Eは代表不正URL |
| 7.3 合成データのみ                                                       | 十分に検証済み     | 既存テストで生成した架空データ。新規サンプルは未追加                                              |
| 7.4 2列→初期分位点→PC/スマホ→コンパクト→コピー→新規タブ                  | 一部のみ検証済み   | 2列読み込み・表示と、複数列からコンパクト共有が別々。2列をつないだシナリオを追加                  |
| 7.4 複数列→部分選択→合算→5方式→完全共有→新規タブ→再共有                  | 一部のみ検証済み   | 各部品は検証済み。部分選択から共有の一連を追加                                                    |
| 7.4 色/日付/レベル/凡例/境界、正確な件数、コンパクト制限                 | 十分に検証済み     | `sharing.spec.ts`のDOM色比較・Codecデコード・操作制限。新規総合でも再利用                         |
| 7.4 列名/TSV非包含、Clipboard非対応/拒否、1000字超警告                   | 十分に検証済み     | `sharing.spec.ts`。ファイル名・列別内訳も総合で明示確認                                           |
| 5.4 不正URLの部分表示禁止・履歴・dなし再読み込み                         | 十分に検証済み     | `sharing.spec.ts`。TSV由来Piniaから不正URL、HTML解釈を明示するケースは追加対象                    |
| 7.4 iPhone/Android・LINEへのHash付きリンク                               | 手動実機検証が必要 | 公開後に実施。未公開時点の成功とはしない                                                          |
| 操作/フォーカス/ARIA/44px/320px                                          | 一部のみ検証済み   | `heatmap.spec.ts`、`sharing.spec.ts`。Tabトラップ全周・Shift+Tab、拡大、OS表示設定は不足          |
| コントラスト、reduced-motion、forced-colors                              | 一部のみ検証済み   | CSSに一部forced-colorsあり。実際の全レベルの比率と設定時の動作は要監査                            |
| スクリーンリーダーの実際の読み上げ                                       | 手動実機検証が必要 | ARIA属性の自動検証はあるがVoiceOver/TalkBack/NVDAで未確認                                         |
| 200% / 400%拡大                                                          | 未検証             | レイアウト等価幅とブラウザー拡大の違いを明記して確認する                                          |
| 7.5 README・合成サンプル                                                 | 一部のみ検証済み   | READMEはPhase 1〜3の説明が残り、`public/sample.tsv`なし                                           |
| 7.5 CIに全検査を組み込む                                                 | 未検証             | `.github/workflows/`なし。実装はIssue #10へ引き継ぐ                                               |

単体は純粋処理・境界値、E2Eは実ブラウザーの操作と統合を担当する。重複した全入力パターンをE2Eへ大量展開しない。性能は既存3標本/Codec単体と分け、専用scriptでserial測定する。

棚卸し後、7.4の2列/部分合算から共有への接続、既存Pinia→HTML風不正URL、トラップ両方向、OSメディア設定、640/320pxリフロー、8色のコントラストを追加検証した。実機LINE・スクリーンリーダー・実倍率/native popupの項目は手動未検証のまま残り、7.5のCIはIssue #10へ引き継ぐ。以下の自動成功をこれらの未検証項目の合格に読み替えない。

## 総合E2Eの追加・修正

- 既存`sharing.spec.ts`の最初の総合を2列TSVに変更。初期分位点・0補完・8色凡例と件数を確認してから閾値変更→Clipboard（ブラウザー内stub）→新規タブでコンパクトURLを直接開き、日付・全セルの実色・レベル・凡例・確定境界を比較。正確な6件が復元されず、閾値変更/完全共有が禁止、同じ内容で再共有できることを検証。
- 公開`sample.tsv`をHTTPで取得して、全3件数列の初期選択→C件数の除外→`[6,4,0,45,0]`の正確な合算・欠損/末尾0・期間→5方式→Custom境界変更→完全URL生成→新規タブへ直接復元→全件数/色/凡例/確定境界一致→閾値変更→両形式の再共有を接続。デコード結果を許可されたsource/thresholdsだけの構造と比較し、ファイル名・列名・元列の内訳がないことを確認。
- TSV由来のPiniaがある状態でHTML風の不正`d`へHash遷移。エラー、0セル、凡例/共有ボタン消去、注入要素なし、onerror不実行を検証。
- `accessibility.spec.ts`でキーボードのファイル選択/列選択/共有・閾値へのフォーカス、TabとShift+Tab各12回の閉じたフォーカス移動、Escapeと復帰、640/320pxリフロー、forced-colors/reduced-motion、実際の8色のコントラスト比を追加。
- 既存の重複日・不正日付・列数・2MiB/3,660日上限・合算超過・不正URL/未知形式/破損圧縮・履歴・dなし再読み込み・Clipboard非対応/拒否・1000文字超警告を維持。異常入力の全組合せをUIへ重複追加していない。

コピー成功はOS Clipboardそのものの保証ではなく、Clipboard APIへの正しいURLの引き渡しをstubで検証する。新規タブは同じBrowserContextで別Pageを開く（Piniaは別インスタンス）。URL以外を渡さず、Codec内部状態を直接セットしていない。すべて合成データ。

## READMEと合成サンプル

READMEを実装済み機能中心に全面更新。入力制限、5方式/8段階、両共有形式の可否、自己完結性、列名/ファイル名/内訳の非包含、非暗号化と第三者解析、長いURLと手動コピー、新規タブ、Node/npm/全検査、技術構成、Hash Router/base、実在しないCI/公開フローとIssue #10の予定の区別、承認ルール、既知の制限を記載。古い「共有は後続実装」の記述を削除した。

`public/sample.tsv`はDate先頭＋A/B/C件数の架空4行、2026-04-01〜05。4月3日欠損、5日は明示的0。全列は`[7,4,0,50,0]`、Cを除けば`[6,4,0,45,0]`。トップの既存サンプル説明からダウンロードできる。ファイルを増やさず2列例はREADMEに掲載。

公開後のiPhone/Android→新規タブ→LINE送信→内蔵/外部ブラウザー→Hash内d全体/期間/色/凡例/件数/モード制限/再共有の受け入れ手順は[README](../README.md#公開後のline実機手動受け入れ)に記載。OS/ブラウザー/LINE版・日付・URL・合否を記録し、両形式と長いURLを試す。現段階では未実施であり、LINE本番共有の成功を宣言しない。

## アクセシビリティ監査

WCAG 2.2 AAの[Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)、[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、[Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)を参考に、ソース、実ブラウザーのDOM/計算済みCSS、キー操作、スクリーンショットで監査した。新規の大きな依存を追加せず、Playwrightのrole/accessible name/フォーカス/色の検査を使った。自動検査は完全なWCAG監査の代わりではなく、完全準拠は宣言しない。

| 項目                               | 結果・範囲                                                                                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ファイル・列・共有のキーボード操作 | Enterによるfilechooser、Spaceによるcheckboxと共有、ダイアログのTab/Shift+Tab各12回、Escape閉鎖と元ボタンへの復帰を5構成で自動確認                                                                                                                                      |
| 日付のキー操作                     | 既存E2EでTab入口/出口、矢印、Home/End、Enter/Space、1か所のTab停止位置を確認。全3660セルを削らない                                                                                                                                                                     |
| ネイティブselectのpopup            | フォーカス・ラベル・enabled状態、5方式の統合は検証。macOS headlessへHome/End/Space/矢印/Enterを注入してもpopupの選択変更を再現できず、実際のpopupキー操作は**未検証の手動項目**。総合操作テストのこの1手だけは`selectOption`を明示的に使い、キーボード完了とは数えない |
| WebKitのTab                        | macOS既定のキーボード設定に合わせOption+Tab / Option+Shift+Tabでボタン等も含める。通常のTabで全操作を行う実機確認はSafariのキーボードナビゲーションを有効にして実施する                                                                                                |
| フォーカスの可視性                 | 日付・ボタン・入力・textarea・summaryを確認。透明なVuetify checkbox/radio inputの外側へ明確な3px枠を追加。SVG濃色セルの枠を白へ変更。フォーカストラップを簡略化していない                                                                                              |
| 見出し/ラベル                      | h1は各画面1つ、閾値/月見出し/入力fieldsetのlegend、native labelとaria-labelあり。共有タイトルをh2へ修正                                                                                                                                                                |
| 読み上げ用情報                     | 日付・正確な件数（exactのみ）・レベル・件数範囲をaccessible nameとして検証。compactの6件はラベルにも入らず範囲のみ。ライブ領域で詳細/境界、role=alertで入力エラー、role=statusでコピー結果を通知                                                                       |
| 色に依存しない説明                 | 全8レベルと範囲を凡例・詳細・ARIAで表現。forced-colorsで色差が消えても日付選択と詳細が利用可能。色覚シミュレーションの実機評価は未実施                                                                                                                                 |
| モバイルセル/320px                 | 日付セルはSPECの高さ44px以上。320pxでは7列を保つため幅は44px未満になる（SPECは高さの要件）。日付・最大安全整数・Custom入力・長いURLダイアログで文書全体の横はみ出しなし                                                                                                |
| 200%/400%                          | 1280pxの200%/400%に相当するCSS幅640/320pxでリフローと主要操作を自動確認。ブラウザーUIの倍率変更、文字だけ拡大、OS表示倍率そのものは**未検証**。pinch/scaleをブラウザーzoomと呼ばない                                                                                   |
| reduced-motion                     | OS設定のエミュレーションでセルのtransition-duration=0を検証。Vuetifyのセル色/ダイアログを含む遷移を抑制し、無限animationを1回にする                                                                                                                                    |
| forced-colors                      | 5構成でメディア設定をエミュレーションし、ラベル、Home移動、閾値変更、枠線を確認。強制色のフォーカスにHighlightを使用。実際のWindows High Contrastの見え方は未検証                                                                                                      |
| スクリーンリーダー                 | VoiceOver/TalkBack/NVDAの**実機読み上げは未検証**。ARIA属性の成功と区別。通知の読み上げ順、SVGボタンの操作、dialog出入りを手動受け入れへ残す                                                                                                                           |

### 確認した不具合と小規模修正

1. SVGのレベル6/7は濃い緑に濃い枠だった。sRGB相対輝度による比は2.69:1 / 1.66:1。白枠へ変更し5.33:1 / 8.66:1になった。レベル0〜5の濃い枠は4.53:1以上。モバイル枠はセル外側の白地に14.34:1。実際のcomputed fill/stroke/outlineから8色をE2Eで検証する。
2. Vuetifyのmedium emphasis 0.6は白地で4.01:1、共有方式ラベルは色alpha 0.87×opacity 0.6で3.21:1だった。テーマのmedium emphasisを0.75に変更し、それぞれ6.39:1 / 4.69:1へ改善した。
3. 情報色`#2196f3`と警告色`#fb8c00`は白地で3.12:1 / 2.37:1、12% tonal背景では2.75:1 / 2.14:1だった。infoを`#005a9c`、warningを`#754400`に変更し、tonal背景でも5.91:1 / 6.71:1。ヒートマップの8色・プリセット・レベル定義は変更していない。
4. reduced-motionの明示対応がなくfillの0.15秒遷移が残っていたためCSSで対応。透明inputに枠を付けるだけでは見えないので、見えるselection-control領域にも枠を付けた。select/textarea/summaryにも明示的なfocus-visibleを付けた。
5. 共有タイトルはアクセス可能な名前はあったが見出し要素ではなかったためh2にした。

本文`#1c2e23`/白は14.34:1、補助説明`#52645a`/薄い詳細背景は5.85:1、primaryと白文字は6.44:1、入力境界`#788b7e`/白は3.63:1。モバイルの全8色の日付数字は4.53:1以上。これらは明示した組合せの計算値で、OSのアンチエイリアスやすべての重なり/状態を保証しない。disabled要素を通常テキストの合否に混ぜていない。

このほかネイティブpopupの実機キー操作、200%/400%実倍率、低い画面高さでのsticky詳細とフォーカスの重なり、実機の強制色、スクリーンリーダーでの通知と操作を公開後の手動受け入れに残す。大きなUI再設計は行っていない。

## 性能測定の方法

`docs/issue-9-render-benchmark.mjs`を本番ビルドのpreviewに対してserialで実行する。合成データは2016-01-01開始、`counts[i] = i % 1200`、201日/365日/3,660日。各ブラウザー・日数について独立ページ3回のウォームアップを除外し、その後20ページ、各ページで初回→閾値変更→URL差し替えの順に測る（9構成×3条件×20＝540標本、ウォームアップ81標本を別途除外）。初期表示には同じページ上のダイアログを先に開く等の操作を入れない。

- マシン：Apple M1 / 16GiB / Darwin 25.5.0 arm64、Node 24.21.0 / npm 11.19.0。viewport 1280×720、CPUスロットリングなし、headless。ほかのテスト/ビルド/ベンチマークと並行しない。
- Chromium 153.0.8010.12 / Firefox 155.0 / WebKit 26.6。ブラウザーごとに起動し、各ケースのversion・productionAssets・生標本・統計をJSONへ保存する。
- **初回**：ファイル読み込み済みの列選択formのsubmit capture→集計/ルート遷移/初期分位点/全セルDOM更新→2回のrAF。ファイル選択・UTF-8読み込み・ネットワーク初回bootstrapは区間外。
- **閾値変更**：quantileからpreset ID0へselectのchange capture→Vue/分類/全セル更新→2回のrAF。Issue #8のquantile→linearとは変更セルや境界が異なるため、169msという過去値とそのまま比較しない。
- **URL復元**：同じページで完全URLのHashを変更する直前→decode/検証/Pinia/Vue更新→保存済みlinear境界`[2]`と全セルDOMを確認→2回のrAF。新規タブの機能的復元はE2Eで別途確認。ここにタブ作成/ネットワーク/アプリbootstrapは含まない。
- 主指標`twoFrameMs`はブラウザー内の開始/終了で測り、Playwright往復・poll時間を加算しない。DOM更新・Style・Layout・Paint・フレーム待ちを含み得るが、compositorのpaint完了時刻を直接示すものではない。
- 補助`domMs`はMutationObserverでの全セル/方式到達。`readyMs`は主指標の記録後に有限のセルanimation完了とさらに2回のrAFを待つ。`getAnimations({subtree:true})`自体の同期Style計算と待機を含むため、純粋な描画時間と呼ばない。2フレーム値は0.15秒のfill遷移の終了を保証しない。
- 最初の探索scriptではanimation列挙を1フレーム目に行い、計測コードがStyle計算を誘発する影響があった。最終scriptでは**主指標の記録後**へ移動した。探索値と最終統計を混ぜない。
- 20生標本から中央値（中央2値の平均）、nearest-rankのp95（`ceil(n*0.95)-1`）、最大を計算する。p95/最大はこの標本の観測値で、端末上限やSLAではない。全セル数を毎回検証し、性能の絶対時間をテストの合否閾値にしていない。
- URL fixtureのencodeはNode側で区間前に実施し、UIのURLdecodeは区間内。既存のCodec単体ベンチマークとは分離する。候補生成APIのmsをこのUI測定へ足したり、UI値をCodec計算の値と呼んだりしない。

再現手順（previewを別ターミナルで起動し、統計とtraceを順に実行）：

```sh
npm run build-only -- --sourcemap
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# 別ターミナル
node docs/issue-9-render-benchmark.mjs --label current --samples 20 --warmup 3
node docs/issue-9-render-benchmark.mjs --label trace --samples 1 --warmup 0 --browsers chromium --days 3660 --trace 1
# 同じビルドのJS.mapを指定する
node docs/issue-9-render-trace.mjs /private/tmp/daily-heatmap-issue-9/trace-chromium-3660.trace.json dist/assets/実際のindexファイル.js.map
```

source mapは診断ビルドだけで使い、製品のVite設定を変更しない。標準`npm run build`で通常ビルドへ戻す。大きなtrace、探索データ、ログは`/private/tmp/daily-heatmap-issue-9/`に保存（OSの削除対象）。集計と最終生標本のみリポジトリへ保存する。

### 最終統計

全生標本・DOM/2フレーム/readyの中央値・p95・最大は[issue-9-render-performance.json](issue-9-render-performance.json)。以下は主指標の **中央値 / p95 / 最大（ms）**、各セル20標本。測定ビルドは`index-Dohv7WlL.js` / `index-DGofGpXW.css`。標準ビルドと同じ製品ソースで、診断用source mapの出力だけを有効にした。

| ブラウザー | 日数 |  初回submit→2フレーム |  閾値change→2フレーム |        URL復元→2フレーム |
| ---------- | ---: | --------------------: | --------------------: | -----------------------: |
| chromium   |  201 |    56.2 / 61.1 / 79.9 |    28.7 / 29.1 / 29.6 |       33.6 / 36.0 / 37.4 |
| chromium   |  365 |    61.0 / 68.4 / 68.9 |    28.9 / 30.0 / 30.3 |       50.4 / 54.7 / 56.7 |
| chromium   | 3660 | 364.4 / 367.8 / 374.0 | 887.2 / 899.5 / 926.6 | 1410.0 / 1443.9 / 1479.3 |
| firefox    |  201 |    47.0 / 49.0 / 49.0 |    24.0 / 25.0 / 26.0 |       31.0 / 31.0 / 32.0 |
| firefox    |  365 |    46.0 / 60.0 / 61.0 |    24.0 / 26.0 / 27.0 |       48.0 / 49.0 / 49.0 |
| firefox    | 3660 | 225.0 / 234.0 / 240.0 | 184.0 / 188.0 / 202.0 |    253.0 / 276.0 / 284.0 |
| webkit     |  201 |    51.0 / 53.0 / 53.0 |    26.0 / 30.0 / 30.0 |       43.0 / 46.0 / 48.0 |
| webkit     |  365 |    65.0 / 66.0 / 72.0 |    37.0 / 44.0 / 44.0 |       55.0 / 57.0 / 59.0 |
| webkit     | 3660 | 329.0 / 333.0 / 334.0 | 387.5 / 389.0 / 390.0 |    525.5 / 536.0 / 537.0 |

Chromiumの3660日URL復元は中央値1410.0msで、Issue #8の約1.38秒を今回も再現した。Firefoxは253.0ms、WebKitは525.5msだった。201日/365日との差は大きい。閾値は今回presetへの変更で、Chromium中央値887.2ms。閾値方式や変更セル数によって負荷が変わるため、過去のlinear変更169msと同じ条件の退行とは判定しない。

3660日の補助指標（中央値 / p95 / 最大、ms）：

| ブラウザー | 区間      |               DOM到達 | ready（animation列挙と遷移待ちを含む） |
| ---------- | --------- | --------------------: | -------------------------------------: |
| chromium   | initial   | 130.8 / 132.4 / 133.0 |                  396.2 / 397.0 / 397.5 |
| chromium   | threshold |    85.6 / 86.8 / 88.9 |                  910.3 / 931.4 / 953.0 |
| chromium   | url       | 152.9 / 155.6 / 158.1 |               1700.3 / 1731.9 / 1797.2 |
| firefox    | initial   | 167.0 / 171.0 / 173.0 |                  258.0 / 260.0 / 274.0 |
| firefox    | threshold | 119.0 / 121.0 / 124.0 |                  288.0 / 314.0 / 321.0 |
| firefox    | url       | 163.5 / 174.0 / 193.0 |                  399.0 / 418.0 / 432.0 |
| webkit     | initial   | 188.0 / 190.0 / 190.0 |                  344.0 / 360.0 / 361.0 |
| webkit     | threshold | 134.0 / 135.0 / 135.0 |                  415.5 / 419.0 / 423.0 |
| webkit     | url       | 245.0 / 250.0 / 250.0 |                  551.5 / 564.0 / 564.0 |

### Chromium traceの内訳

[集計JSON](issue-9-render-trace.json)は統計と別の3660日・1標本（profilerの負荷あり）。`devtools.timeline` / V8 / user timing / CPU profilerを取得し、同じビルドのsource mapとインストール済みVue Router/Vue/Vuetifyソースへ照合した。表は主指標までのrenderer main threadの区間（ms）、同一カテゴリ内の重複区間はunionで除いた。

| 区間      | 区間全体 | Recalculate Style | Layout | PrePaint | Paint |
| --------- | -------: | ----------------: | -----: | -------: | ----: |
| initial   |   384.73 |            195.21 |   6.72 |     4.08 |  4.86 |
| threshold |   934.44 |            815.23 |   0.82 |     0.26 |  3.79 |
| url       |  1505.95 |           1322.03 |   0.77 |     0.35 |  3.71 |

- URL区間ではStyleが1322.0ms、約18,347要素に及ぶ最大1イベントが1320.9msだった。stackはVue Routerの`scrollToPosition`→`window.scrollTo`に一致。初回も同じstackで約18,536要素・194.9msのStyle計算があった。閾値変更は自然なrender更新側で約15,674要素・815.0msのStyleイベントを確認した。
- SVGは3660日それぞれにgroup/title/rect等を持ち、全体で約1.8万要素になる。更新後には多数のfill transitionも作られる。DOM/ARIAを減らさず、Style負荷を確認した。「Paintが1秒かかる」「Codecが1秒かかる」とは解釈しない。
- JavaScriptはDOM到達までの指標とCPUサンプルで確認。Vue runtime-core / reactivity / runtime-dom、アプリの`createHeatmapCells`、Vuetifyの`VHeatmapCell` / `useHeatmap`が観測される。サンプルのleafはnative `scrollTo`が9,922、Vue runtime-coreが724、heatmap VMが599等。これらは全trace中の統計的サンプル数で、呼び出し回数やそのままmsに換算できる値ではない。
- 初回の`v8.callFunction`包含時間346.3msには同期Style等も入る。一方、微小なFunctionCallイベントだけでVueの全更新時間を表せない。Style/Layout/Paintを除いた残りをすべて「純粋なJavaScript/Vue時間」とすることもできない。GC・フレーム待ち・native処理も残るため、Vueだけの正確なexclusive msは分離していない。
- 主指標の後の診断用`getAnimations`にもnative CPUサンプル1,823があり、URL readyは1812.2msへ延びる。これは観測器の負荷を含む。主指標1505.9msにその後の列挙時間を混ぜない。
- 以上から今回の支配的要因はSVGを含む大量要素のStyle再計算と判断する。ただしChromium内部のSVG/style cacheのアルゴリズムや厳密な計算量までは特定していない。同期scrollToを削ればすべて解消するとも断定しない。
- Firefox/WebKitでは同じUI区間・DOM/フレーム統計を取得した。詳細なエンジン内部Style/JS分解は公開CDPを使えるChromiumのみであり、他2ブラウザーの内部割合が同じとは主張しない。

### 探索した小規模な改善候補

次の2案を一時的に本番ビルドしてtraceで切り分け、どちらも採用せずソースを戻した。仮想化・セル削減・描画方式変更・ARIA削減・Codec変更は行っていない。

| 探索版（Chromium / 3660日 / 各1 trace）           | 初回ready ms | 閾値ready ms | URL ready ms |
| ------------------------------------------------- | -----------: | -----------: | -----------: |
| 探索基準                                          |        405.1 |       1149.5 |       1839.6 |
| 使用レベル依存の色定義を不変の8色へ固定           |        388.5 |       1166.6 |       1679.8 |
| 上記＋セルのCSS変数を通常のSVG fill継承へ置き換え |        872.1 |       1419.7 |       4149.7 |

これはウォームアップなし・profilerありの探索1標本で、中央値/p95の比較や改善率の証明ではない。また主指標を分離する前のanimation列挙も含む。8色固定は大きなStyle負荷を解消せず、fill継承案は悪化した。安全で明確な効果のある性能修正とは判断せず採用しなかったため、製品の性能改善の「修正前/後」という表にはしない。最終統計は上記とは別の計測コード・標本で取得する。

### 残る負荷と推奨対応

Chromiumでは最大期間の再分類・URL復元でメインスレッドのStyle計算が長く、操作応答が遅れる。Codecの計算やSVGのPaintだけを最適化しても支配的な時間を解消しない可能性が高い。ブラウザー/端末の差が大きく、低速端末の上限は未検証。全セルを表示し、日付のTab停止位置を1か所にする現在の操作契約は維持する。

次の調査では、固定した最小SVG再現例でCSS変数・fill transition・Style invalidationの条件を切り分け、Vuetify/Chromiumの更新候補を同じGolden/操作/性能測定で比較するのがよい。Vueのprops安定化/キャッシュは別候補だが、Styleが支配的なので先に効果を測る。仮想化やCanvas等への全面変更は別途提案・承認が必要で、スクリーンリーダー、全日付の操作、期間/色/凡例/正確な件数を維持する複数案の比較から始める。今回のIssue #9では実装しない。

Issue #8の共有ダイアログのscroll strategyには変更していない。既存E2Eで背景固定/スクロール復元/全3660ラベル/フォーカス復帰を再確認する。以前報告された「初回ダイアログ最大55msのLong Task」は今回の本体計測で解消を検証した値ではなく、別の残存課題として扱う。

## 手動検証の具体的な制約

利用可能なブラウザー接続はin-app browser / MCP Appsのみで、Chromeのブラウザー接続はなかった。さらに実UIでの確認を試みたが、Computer UseはGoogle Chromeの利用を許可されなかった。そのため追加権限を迂回せず、ブラウザー実倍率とネイティブpopupは未検証に残した。LINEやスクリーンリーダー実機も検証できない。これらを自動E2Eの成功に含めない。

## 変更ファイル

- `README.md`：実装済み機能・制約・開発・承認/公開・実機手順を全面更新。
- `public/sample.tsv`：公開用合成サンプル1件。
- `src/views/HomeView.vue`：base準拠のサンプルダウンロードリンク。
- `src/components/ShareDialog.vue`：ダイアログタイトルのh2化。
- `src/components/heatmap/DesktopHeatmap.vue`：濃色セルの白フォーカス枠と強制色の優先度。
- `src/plugins/vuetify.ts`：medium emphasis、info/warningのコントラスト改善。
- `src/styles/main.css`：フォーム/summary/selection controlのフォーカス、reduced-motion、forced-colors。
- `e2e/sharing.spec.ts`：2列総合の強化、複数列→完全共有、既存Pinia→不正HTML風URL。
- `e2e/accessibility.spec.ts`：4シナリオ×5構成。
- `docs/issue-9-render-benchmark.mjs`：再現可能なserial UI性能計測。
- `docs/issue-9-render-trace.mjs`：カテゴリunionとsource map/CPU sample照合。
- `docs/issue-9-render-performance.json`：最終540生標本・統計・環境。
- `docs/issue-9-render-trace.json`：最終Chromium traceの小さな集計。
- `docs/issue-9-validation.md`：本記録。

依存/lockfile、CodecとGolden、プリセット境界/8色、Hash Router/base、Issue #8のscroll strategy、CI/公開設定は変更していない。スクリーンショットはローカルの`artifacts/issue-9.local/{pc,mobile,share-320,forced-colors}.png`へ保存し、Git対象外。PC・スマホ・320px共有画面を目視し、情報の欠落/横はみ出しがないことを確認した。320pxの長い共有画面は本文だけ縦スクロールし、タイトルと閉じる/コピー操作へアクセスできる。

## 残る課題とIssue #10への申し送り

- 公開後にREADMEのiPhone/Android/LINE両形式・長いURL・Hash保持・再共有制限の実機受け入れを実施し、版/日付/結果を記録する。
- VoiceOver/TalkBack/NVDA、実倍率200%/400%、短い画面高さでのsticky/フォーカス重なり、native select popup、実OS forced-colors、低速端末を手動確認する。完全なWCAG準拠は未評価。
- Chromium最大期間のStyle負荷は残存。前述の調査候補と計測scriptを引き継ぐ。大規模な描画変更は承認前に行わない。
- SPEC 7.5のCI要件は未実装。Issue #10で型チェック/Lint/format/Vitest/Playwright/buildのCI、承認済みタグを契機とするPages公開準備を整備する。今回`.github/workflows/`を追加していない。
- CIで本番ビルド後にE2Eを実行し、Playwrightの固定版に対応するブラウザーを導入する。スマホエミュレーションと実機受け入れを区別する。
- 稼働中の公開URLを確認できるまでREADMEへ公開済みリンクを載せない。push/PR/merge/tag/公開は個別の明示承認後のみ。

## 品質確認

| コマンド                          | 最終結果                           |
| --------------------------------- | ---------------------------------- |
| `npm run type-check`              | 成功                               |
| `npm run lint`                    | Oxlint / ESLint、警告0             |
| `npm run format:check`            | 成功（全対象がPrettier準拠）       |
| `npm run test:unit`               | 17ファイル、956 / 956成功          |
| `npm run test:e2e -- --workers=1` | 5構成、300 / 300成功（3.2分）      |
| `npm run test:e2e`                | 4 workers、300 / 300成功（1.5分）  |
| `npm run build`                   | 成功、通常ビルド（source mapなし） |
| `git diff --check`                | 成功                               |

既存単体956件を維持。E2Eは既存54シナリオを維持・強化し、6シナリオ×5構成を追加して270→300件。skip/only、型チェック無効化、広範なany、依存追加なし。V4 Codec/Goldenの既存検査も成功。

新規テスト開発時の失敗を区別して記録する。ネイティブpopupのキー注入は再現不能として手動項目に分離し、テスト名/コメントに`selectOption`を使う範囲を明示した。最初の全E2Eは299成功・1失敗で、viewport変更直後の旧desktopセルと新mobileセルの切り替え中にboundingBoxがnullになるテスト側の競合だった。sleep/再試行/skipではなく、対象mobile calendarの表示を待つよう修正し、20件のアクセシビリティ検査と全300件serialを再実行して成功した。Lintのconditional expect警告も検査値をfilterして全件assertする形へ直し、抑制コメントを追加していない。

ログは`/private/tmp/daily-heatmap-issue-9/`の`unit-final.log`、`e2e-serial-first.log`（初回の1失敗を保持）、`e2e-serial-final.log`、`e2e-parallel-final.log`、`accessibility-final.log`、`build-final.log`。性能JSONはE2E内の並列性能出力とは別に取得した専用serial統計を正とする。

## ローカルコミットとGit状態

実装・テスト・README・性能記録のコミットは **`e0c42b1d93334c82866ea256f4411b50ae7c4cfe`**（`test: finish Issue 9 quality audit and README`）。14ファイルを記録した。作業ブランチは`codex/9-quality-readme`。コミット直後の`git status --short`は空で、main / origin/mainはともに`7557d9c8f3fe4fabe0e8da41ad74dccf5c8344d2`のまま。

この節だけを後続の記録用ローカルコミットへ追加する。最終HEADのIDは完了報告に記載し、記録コミット後にも作業ツリーがクリーンであることを確認する。コードやテストは実装コミットから変更しない。push・PR・Ready化・merge・タグ・Pages公開・Issue #10の実装は行っていない。
