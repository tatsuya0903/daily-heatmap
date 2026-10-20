# Issue #8 / PR #17 共有ダイアログ性能の追加調査

2026-10-20（JST）。比較元はレビュー対象 `dcce231824329e3acbfb2fcf1878e107194adf1a`。Issue #8の性能調査・小規模修正・検証記録訂正のみを行い、追加コミットはpushしない。PRはDraftのまま維持する。

## 再現方法と計測の定義

Apple M1 / 16GiB / Darwin 25.5.0 arm64 / Node 24.21.0。PC viewport 1280×720、CPUスロットリングなし。Chromium・Firefox・WebKitを1ブラウザーずつ起動し、本番ビルドをVite preview経由で使用する。統計計測ではCDP traceを停止し、他のベンチマーク・テスト・ビルドを並行実行しない。

`docs/issue-8-dialog-benchmark.mjs`で以下を比較する。

- 201日と3,660日。すべて架空の連続日付（2016-01-01開始）、`counts[i] = i % 1200`。
- 完全データURLで初期表示。保存済みquantile境界 `[100,200,400,600,800,1000]` を使用する（復元時に再生成しない）。共有モードは毎回compactを初期選択する。
- 各ブラウザー・日数につき、5ページ分の操作をウォームアップとして除外し、その後30ページを測る。各ページで「初回」「閉じて再表示」「Linearへ閾値変更後」「同じ画面で共有URLを差し替えた後」を順に実行する。初回は各ページで最初のダイアログであり、同じダイアログをウォームアップしてから初回と呼んでいない。
- 差し替えURLは元countsを保持したまま、保存済みLinear境界 `[2]` に変更する。切り替え完了をDOMと2フレームで確認してから共有ボタンを操作する。元の3回連続シナリオも別のtraceで再現した。
- 各操作で日付セル数（201 / 3,660）、ダイアログ内のフォーカス、カレンダー内のMutationObserverを確認する。

修正前・修正後それぞれ720測定（6構成×4条件×30標本）、合計1,440測定。別に各120測定のウォームアップを除外した。

指標を混同しない：

| 指標                | 開始                      | 終了・含まれるもの                                                                                          |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| DOM到達             | click capture             | URL入りtextareaの挿入をMutationObserverで観測                                                               |
| 従来の2フレーム指標 | click capture             | その場で予約した2回目のrequestAnimationFrame。アニメーション・paint完了の保証ではない                       |
| フォーカス到達      | click capture             | ダイアログ内への最初のfocusin                                                                               |
| ready               | click capture             | フォーカス到達後、有限ダイアログアニメーションの完了を待ち、さらに2フレーム。通常のアニメーション待ちも含む |
| タイマー応答        | ready区間内               | 20ms間隔のsetIntervalの最大間隔。スケジューリング遅延を含み、純粋なJS実行時間ではない                       |
| Long Task           | ready区間内               | 対応ブラウザーのLong Task API。未対応はnullであり「ブロックなし」の意味ではない                             |
| ヒートマップ更新    | 閾値change / hash変更直前 | DOM変更後の2フレーム。共有ボタン操作より前の独立した区間                                                    |

ダイアログとURL更新のPerformance API測定はブラウザー内で開始・終了する。共有ボタンのクリック準備・scrollIntoView・通信往復やpoll待ち時間を別途加算していない。ただし、閾値更新の終了rAFはPlaywrightのselectOption返却後に次のevaluateで予約しているため、その間の制御通信・スケジューリングも含み得る。閾値更新値を純粋な描画時間と解釈しない。DOM・style・layout・paint・フレーム待ち等は測定区間へ入り得る。非表示の無限progressアニメーションはready待ちの対象外とし、有限のダイアログアニメーションは維持する。統計は保存した30標本から中央値、nearest-rankのp95（`ceil(n*0.95)-1`）、最大値を算出する。

実行例（修正前・修正後の本番ビルドをそれぞれ用意して、同じポートのpreviewで順番に実行する）：

```sh
node docs/issue-8-dialog-benchmark.mjs --label before --samples 30 --warmup 5
node docs/issue-8-dialog-benchmark.mjs --label after --samples 30 --warmup 5
node docs/issue-8-dialog-report.mjs /private/tmp/daily-heatmap-issue-8-investigation/before-matrix.json /private/tmp/daily-heatmap-issue-8-investigation/after-matrix.json
```

生ログ・大きいtrace・比較用ビルドは `/private/tmp/daily-heatmap-issue-8-investigation/` に保存し、Gitへは集計と比較可能な数値記録だけを入れる。一時ディレクトリなのでOSの削除対象となり得る。Chrome DevToolsのPerformanceで以下のtrace JSONを読み込める。

- `before-trace-chromium-3660.trace.json` / `after-trace-chromium-3660.trace.json`：4条件を揃えた比較。
- `baseline-probe.trace.json`：元の3回連続シナリオ。
- `before-matrix.json` / `after-matrix.json`：統計の元記録。

trace再取得例（統計とは分けて実行する）：

```sh
node docs/issue-8-dialog-benchmark.mjs --label trace --samples 1 --warmup 0 --browsers chromium --days 3660 --trace 1
node docs/issue-8-trace-summary.mjs /private/tmp/daily-heatmap-issue-8-investigation/trace-chromium-3660.trace.json /private/tmp/daily-heatmap-issue-8-investigation/trace-matrix.json
```

## 計測結果

従来の2フレーム指標（ms、各欄は **中央値 / p95 / 最大**、各30標本）。比較可能な生値と全指標の統計は [issue-8-dialog-comparison.json](issue-8-dialog-comparison.json) に保存した。

| ブラウザー |  日数 | 条件          |                      修正前 |             修正後 |
| ---------- | ----: | ------------- | --------------------------: | -----------------: |
| Chromium   |   201 | 初回          |          44.3 / 48.9 / 49.4 | 42.5 / 50.2 / 51.7 |
| Chromium   |   201 | 再表示        |          30.8 / 31.6 / 31.8 | 30.6 / 31.0 / 32.1 |
| Chromium   |   201 | 閾値変更後    |          30.4 / 34.9 / 35.0 | 30.3 / 30.9 / 31.4 |
| Chromium   |   201 | URL差し替え後 |          30.4 / 31.1 / 31.6 | 30.4 / 31.0 / 31.5 |
| Chromium   | 3,660 | 初回          |          53.4 / 60.0 / 71.7 | 51.4 / 75.1 / 77.4 |
| Chromium   | 3,660 | 再表示        |       416.8 / 444.8 / 463.9 | 31.4 / 32.3 / 32.3 |
| Chromium   | 3,660 | 閾値変更後    |       693.2 / 723.4 / 723.7 | 31.2 / 31.8 / 32.2 |
| Chromium   | 3,660 | URL差し替え後 | 2,385.5 / 2,671.6 / 3,284.1 | 31.3 / 32.2 / 32.4 |
| Firefox    |   201 | 初回          |          25.0 / 26.0 / 27.0 | 25.0 / 26.0 / 26.0 |
| Firefox    |   201 | 再表示        |          30.0 / 31.0 / 32.0 | 30.0 / 31.0 / 32.0 |
| Firefox    |   201 | 閾値変更後    |          19.0 / 31.0 / 34.0 | 29.0 / 31.0 / 31.0 |
| Firefox    |   201 | URL差し替え後 |          27.0 / 29.0 / 30.0 | 13.0 / 29.0 / 30.0 |
| Firefox    | 3,660 | 初回          |        71.0 / 108.0 / 155.0 | 24.0 / 26.0 / 30.0 |
| Firefox    | 3,660 | 再表示        |       102.0 / 107.0 / 147.0 | 30.0 / 32.0 / 32.0 |
| Firefox    | 3,660 | 閾値変更後    |        89.0 / 135.0 / 136.0 | 30.0 / 33.0 / 51.0 |
| Firefox    | 3,660 | URL差し替え後 |       104.0 / 117.0 / 129.0 | 32.0 / 33.0 / 34.0 |
| WebKit     |   201 | 初回          |          56.0 / 63.0 / 63.0 | 38.0 / 39.0 / 45.0 |
| WebKit     |   201 | 再表示        |          43.0 / 49.0 / 50.0 | 29.0 / 30.0 / 30.0 |
| WebKit     |   201 | 閾値変更後    |          42.0 / 45.0 / 46.0 | 23.0 / 27.0 / 27.0 |
| WebKit     |   201 | URL差し替え後 |          42.0 / 46.0 / 47.0 | 23.0 / 27.0 / 27.0 |
| WebKit     | 3,660 | 初回          |       334.0 / 416.0 / 430.0 | 42.0 / 47.0 / 48.0 |
| WebKit     | 3,660 | 再表示        |       325.0 / 372.0 / 401.0 | 30.0 / 31.0 / 31.0 |
| WebKit     | 3,660 | 閾値変更後    |       347.5 / 365.0 / 427.0 | 38.0 / 46.0 / 47.0 |
| WebKit     | 3,660 | URL差し替え後 |       362.0 / 418.0 / 435.0 | 58.0 / 64.0 / 66.0 |

201日では元の約2秒の遅延は再現せず、3,660日のChromiumで顕著だった。3,660日のFirefox・WebKitにも遅延はあり、修正で改善した。ブラウザーは修正前後で同じビルド（Chromium 153.0.8010.12、Firefox 155.0、WebKit 26.6）を使用した。

Chromium 3,660日・URL差し替え後の詳細（中央値 / p95 / 最大、ms）：

| 指標                      |                      修正前 |                修正後 |
| ------------------------- | --------------------------: | --------------------: |
| URL入りDOM到達            |            6.6 / 8.7 / 10.5 |       6.2 / 7.0 / 7.2 |
| 従来の2フレーム           | 2,385.5 / 2,671.6 / 3,284.1 |    31.3 / 32.2 / 32.4 |
| フォーカス到達            | 4,489.6 / 5,357.4 / 5,805.2 | 260.6 / 266.1 / 266.6 |
| アニメーションを含むready | 4,589.3 / 5,447.6 / 5,915.1 | 364.6 / 365.4 / 365.7 |
| 20msタイマー最大間隔      | 4,271.3 / 5,134.7 / 5,584.6 |    29.9 / 38.7 / 40.0 |
| 最長Long Task             | 2,364.5 / 2,700.0 / 3,261.0 |       0.0 / 0.0 / 0.0 |
| Long Task占有合計         | 4,242.0 / 5,109.0 / 5,558.0 |       0.0 / 0.0 / 0.0 |

元の2フレーム値は初回の後続Style計算やフォーカスまでを捉え切れない。初回でも修正前のChromium 3,660日はフォーカス中央値758.6ms、ready 796.9msで、修正後はそれぞれ282.4 / 396.8msだった。修正後の再表示ready約365msには通常のVDialogの有限アニメーションを含む。再表示3条件ではChromiumのLong Taskは30標本とも0。初回だけは最大55msのLong Task（p95 51ms）が残るため、すべてのブロックを除去したとはしない。Firefox・WebKitはこのLong Task APIが未対応なのでnullとし、0とは扱わない。

**ヒートマップ本体の更新区間は別の結果**である（中央値 / p95 / 最大、ms）：

| ブラウザー |  日数 | 更新        |                      修正前 |                      修正後 |
| ---------- | ----: | ----------- | --------------------------: | --------------------------: |
| Chromium   |   201 | 閾値変更    |          40.0 / 42.4 / 50.2 |          44.1 / 49.7 / 49.8 |
| Chromium   |   201 | URL差し替え |          24.4 / 27.4 / 32.0 |          27.6 / 29.0 / 29.9 |
| Chromium   | 3,660 | 閾値変更    |       290.6 / 327.9 / 353.5 |       169.2 / 174.0 / 185.4 |
| Chromium   | 3,660 | URL差し替え | 1,376.1 / 1,482.7 / 1,498.2 | 1,382.6 / 1,601.7 / 2,141.4 |
| Firefox    |   201 | 閾値変更    |          41.0 / 46.0 / 55.0 |          35.0 / 47.0 / 47.0 |
| Firefox    |   201 | URL差し替え |          27.0 / 32.0 / 40.0 |          30.0 / 33.0 / 33.0 |
| Firefox    | 3,660 | 閾値変更    |       173.5 / 209.0 / 220.0 |       172.0 / 191.0 / 200.0 |
| Firefox    | 3,660 | URL差し替え |       237.0 / 330.0 / 452.0 |       241.0 / 367.0 / 431.0 |
| WebKit     |   201 | 閾値変更    |          30.0 / 35.0 / 35.0 |          35.0 / 48.0 / 49.0 |
| WebKit     |   201 | URL差し替え |          32.0 / 39.0 / 47.0 |          40.5 / 43.0 / 44.0 |
| WebKit     | 3,660 | 閾値変更    |       238.0 / 261.0 / 275.0 |       229.0 / 268.0 / 328.0 |
| WebKit     | 3,660 | URL差し替え |       482.0 / 513.0 / 529.0 |       478.5 / 538.0 / 578.0 |

特にChromium 3,660日のURL差し替え本体は、修正前中央値1,376.1ms、修正後1,382.6ms（最大2,141.4ms）と依然重い。これはボタン操作より前に完了を待った独立区間であり、「共有ダイアログが31msになった」ことと区別する。この本体更新を高速化する変更は今回入れていない。URL後のダイアログStyle計算が重くなることはtraceと差分実験で確認したが、Chromium内部で状態に応じた計算コストが増える詳細な仕組みまでは断定しない。

URL候補生成はDOM到達より前に含まれるが、Styleの数秒の遅延とは別。既存の [Codec単体計測](issue-8-performance.json) は3,660日・7標本で、Chromiumの重い53bit疑似乱数でもcompact候補中央値4.3ms / exact 16.4ms。今回の統計はDOMを含むUI区間であり、候補APIだけの時間を新たに切り出してはいない。201日のUI計測は今回取得済み。

## traceから確認した原因

CDPの `devtools.timeline`、`v8`、`blink.user_timing`、V8 CPU profiler、JavaScript stackを、統計とは別の1標本で収集する。`docs/issue-8-trace-summary.mjs`はclickからreadyまでのrenderer main threadのイベントを抽出する。2フレームのmarkも保持して後続フレームを区別する。カテゴリは包含関係があるため、TimerFireやv8.callFunctionと、その内部のStyleイベントを足し合わせない。

1. 元の3回連続シナリオでも、約58.5 / 2,537.4 / 3,558.4msを再現した（traceのオーバーヘッドを含む。統計表とは分ける）。ヒートマップのDOM変更は0件だった。
2. 対応する長いイベントは、Vuetify 4.2.1の `blockScrollStrategy`。minify済みSPAのstack位置と、インストール済み `VOverlay/scrollStrategies.js` のコードを照合した。
3. この処理はルートで `--v-body-scroll-x` などのCSS変数を書いた直後に `scrollTop` や `getComputedStyle` を読み取る。traceでは、その同期読み取りのstack内に長い `UpdateLayoutTree`（DevToolsのRecalculate Style）が記録され、1イベントで18,440要素を処理していた。
4. 4条件を揃えた修正前traceでは、URL差し替え後の区間2,864.95msに対してStyleが2,842.34ms、Layoutが0.71ms、Paintが7.20ms。TimerFire / v8の長い包含時間は、ほぼ同期Style計算だった。ヒートマップのDOM再生成やCodecの数秒の計算ではない。
5. Long Taskと20msタイマーの大きな遅延も観測しており、単なるrequestAnimationFrameの空待ちではなく、メインスレッドが占有されている。共有前のヒートマップ更新は別区間で記録し、ダイアログの遅延へ混ぜていない。
6. 診断用にルートのスクロール座標・補正を通常のCSSプロパティで更新すると、元の3回シナリオは約51.3 / 31.0 / 30.6msとなり、該当区間にLong Taskは記録されなかった。CSS変数の一部を子孫でshadowしたり非継承登録するだけの診断は改善しなかった。これらの診断用prototype差し替え・CSS注入は製品コードへ入れていない。

フォーカス・後続フレームも含むtrace集計（3,660日、各1標本、ms）：

| 条件          |       ready 前→後 | Recalculate Style 前→後 | Layout 前→後 | Paint 前→後 | v8.callFunction包含 前→後 |
| ------------- | ----------------: | ----------------------: | -----------: | ----------: | ------------------------: |
| 初回          |   836.80 → 395.30 |           732.78 → 4.47 |  2.49 → 2.39 | 3.87 → 4.75 |            452.15 → 27.66 |
| 再表示        | 1,064.30 → 363.30 |           728.53 → 3.65 |  0.90 → 0.86 | 3.73 → 3.15 |            742.21 → 15.66 |
| 閾値変更後    | 1,480.80 → 363.40 |         1,125.36 → 3.72 |  1.10 → 0.89 | 4.12 → 3.90 |          1,134.33 → 12.74 |
| URL差し替え後 | 5,462.00 → 348.30 |         5,114.52 → 3.78 |  1.30 → 0.89 | 7.89 → 5.42 |          5,121.54 → 10.30 |

URL差し替え後では、2フレーム以降にも約2,268msのStyle計算があった。stackはVueのCSS transition処理（`getTransitionInfo`の`getComputedStyle`によるduration取得）に一致する。スクロール固定処理で更新されたStyleの再計算が、後続の同期読み取りでも起きていた。VDialogはtransitionのafterEnterで`focus({ preventScroll: true })`を実行するため、このStyle処理でアニメーションとフォーカス到達も遅れる。フォーカストラップの候補走査が数秒を使う根拠はなく、トラップを変更せずに解消した。修正後、URL後のready区間のStyleは合計3.78msだった。

表のJavaScriptは同期Styleを含む呼び出しの包含時間であり、純粋なJS計算量ではない。Layout・Paintは数ms台で、主要な待ち時間を説明しない。初回は2フレーム後にVuetifyのsetTimeoutが動く場合があり、2フレームだけで初回応答性を判断できないことも確認できた。rAFのコールバック実行時間とrAF間の待ち時間を混同しない。trace集計は [修正前](issue-8-trace-before.json)・[修正後](issue-8-trace-after.json) に保存した。

Vue内部のrender関数の呼び出し回数は計測していない。カレンダーのDOM更新0件と、Style計算を示すstack・時間が根拠であり、「Vueが一度も更新されない」とは断定しない。また、Chromium内部のSVGスタイルキャッシュのアルゴリズムや計算量までは特定していない。

## 修正内容と維持した動作

`ShareDialog.vue`の公開scroll-strategy APIに、小さな `blockShareScroll` を指定する。ルート専用座標を通常のCSSプロパティへ直接設定し、DOMの読み取りをすべて書き込みより前に行う。スクロール位置と既存inline style・priorityを保存し、Vueのscope終了時に復元する。smooth scrollがあっても復元は即時に行う。

背景固定を無効化する対策ではない。VDialogのフォーカストラップ、Escape、閉鎖後のフォーカス復帰、ダイアログ内部スクロールを維持する。セルの削減・仮想化、ARIA説明の削除、アクセス可能要素の無効化は行わない。Codec・URL・Pinia・閾値処理には変更を加えない。

さらにChromiumでheadlessのスクロールバー非表示オプションを解除し、15px幅のスクロールバー、320×740、scrollY=180で手動相当の操作を実行した。開く前・表示中・閉じた後のscrollWidthはいずれも320px。表示中はpadding 15px / top -180pxで固定し、閉鎖後はscrollY=180・元のinline styleへ復元した。OSのoverlay scrollbarだけを前提としていない。

## 回帰テスト・品質確認

- 単体：元の位置、スクロールバー補正、重要度つきinline styleの復元、繰り返し開閉の後始末。
- E2E：3,660日のURL差し替え後に2回開閉し、全セル数、全ARIAラベル、背景固定、スクロール位置、フォーカス復帰を検証する。背景へのスクロール座標CSS変数の継承を確認するため、ミリ秒の閾値に依存しない。
- この回帰テストは旧ビルドで `['',''] → ['0px','-180px']` の継承差分を検出して失敗し、修正版では5構成すべて成功した。旧ビルドの失敗は対照試験であり、最終品質検査とは別に記録する。
- 共有機能の先行検証：5構成45件成功。

最終の全テスト・品質確認（いずれも成功）：

| コマンド                                         | 結果                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| `npm run type-check`                             | 成功                                                   |
| `npm run lint`                                   | Oxlint・ESLint、警告0                                  |
| `npm run format` / `npm run format:check`        | 成功                                                   |
| `npm run test`                                   | 単体956 / 956、E2E270 / 270（4 workers、1.1分）        |
| `npm run test -- --workers=1`                    | 単体956 / 956、E2E270 / 270（1 worker、2.8分）         |
| `npm run build`                                  | 成功、JS `index-BqsaEq_o.js`、CSS `index-BxbtMJ2z.css` |
| `git diff --check` / `git diff --cached --check` | 成功                                                   |

元の954単体・265 E2Eを維持し、単体2件・E2E1件×5構成を追加した。5構成はChromium / Firefox / WebKit / mobile-chrome（Pixel 7相当）/ mobile-safari（iPhone 13相当）。既存のコピー成功・失敗、両共有形式の復元と操作制限、不正URL、履歴、320pxのテストも全件成功した。

ログは一時ディレクトリ内の `test-default-final.log`、`test-serial-final.log`、`type-check-final.log`、`lint-final.log`、`format-final.log`、`build-final.log`。統計は別途単独実行した値を正とし、並列E2E中の性能出力と混ぜない。

## 変更ファイル（14件）

製品コードは2件、テストは2件、残りは計測コードと検証記録。

- `src/components/ShareDialog.vue`
- `src/sharing/blockShareScroll.ts`（追加）
- `src/sharing/blockShareScroll.spec.ts`（追加）
- `e2e/sharing.spec.ts`
- `docs/issue-8-validation.md`
- `docs/issue-8-bundle.mjs`
- `docs/issue-8-dialog-benchmark.mjs`（追加）
- `docs/issue-8-dialog-report.mjs`（追加）
- `docs/issue-8-dialog-comparison.json`（追加）
- `docs/issue-8-trace-summary.mjs`（追加）
- `docs/issue-8-trace-before.json`（追加）
- `docs/issue-8-trace-after.json`（追加）
- `docs/issue-8-scroll-bundle.json`（追加）
- `docs/issue-8-performance-investigation.md`（本記録、追加）

## バンドル記録の訂正

承認コミットdcce231時点の `docs/issue-8-validation.md` の表を、既存の最終JSONへ一致させた。変更前139,718、変更後174,760、増分35,042 bytes gzip。PR #17本文と同じ値である。旧表の174,748 / 35,030は訂正した。

今回のローカル性能修正は承認コミットとの別比較で、174,760 → 175,095 bytes gzip（+335）。mainからの累積増分は35,377 bytes gzipとなる。`node docs/issue-8-bundle.mjs dcce231824329e3acbfb2fcf1878e107194adf1a`で取得した [issue-8-scroll-bundle.json](issue-8-scroll-bundle.json) に保存した。JS +334 / CSS +1 bytes gzip。CSSのrawサイズは不変だが、ShareDialogのscoped CSSのハッシュが変わるためgzipに1byte差がある。依存追加なし。

PR本文は承認コミット時点の139,718 / 174,760 / 35,042と整合する。今回のコミットは未pushなので、PR本文へ新しいサイズを混在させる変更はしていない。

## 残る確認事項

実機iPhone / Android、スクリーンリーダー実機、低速CPU・OS・過去のブラウザー版は未検証。URL差し替え本体の約1.4秒の更新と、初回に最大55msのLong Taskは残る。PC3構成での30標本のp95は、その環境・fixtureの観測値であり、すべての端末の上限を保証しない。保存済みレベルと閾値、全3,660セル、ARIAラベルは維持した。大規模な描画UI再設計・Issue #9への作業は行っていない。
