# Issue #8 検証記録

検証日：2026-10-20（JST）。対象は共有ダイアログ・URL復元・再共有制限のみ。基点はIssue #7をマージしたmain `563490719e70c4655b9f3aaa7a1737c4341e3799`。開始時に`git fetch origin`、`git merge --ff-only origin/main`で同期し、クリーンなmainから`codex/8-share-ui`を作成した。GitHub Issue #8とSPEC 1.2–1.4、3、5、7.4を確認した。Codec形式ID・エンコード規則・閾値計算は変更していない。

## 実装と設計

- `ShareDialog.vue`：初期選択compact、exactの選択、説明、URL全文のプレビュー・実文字数、1,000文字超の警告、非暗号化の説明、コピーと手動コピー案内。候補はダイアログを開いた時と方式を変えた時に既存の`selectShareEncoding`で生成する。1,000文字超でもコピー可能。65,536文字のd上限は既存Codecで維持する。
- `shareUrl.ts`：Routerのhistory.baseとresolve結果のfullPath、実行環境のURLから絶対URLを生成する。Hash Historyのresolve.hrefは`#/…`だけになるため、history.baseを明示的に使用する。ホスト・リポジトリパス・接頭辞長を固定しない。`/`と`/daily-heatmap/`のbaseで検証した。
- `HeatmapView.vue`：`route.query.d`をwatchし、初回・同じコンポーネントでのURL変更・履歴移動に対応。dの重複（配列）・空・nullを拒否し、文字列は`decodeDParameter`で全検証する。dありではURLの復元結果を優先し、失敗時にストアをclearするため以前のデータで代替表示しない。共有URLからdを除いた場合も復元データをclearする。dなしの通常TSV遷移は維持する。新規タブ／リロードで状態がなければ再アップロードとトップへの導線を表示する。
- `importedSeries.ts`：`HeatmapDocument | null`を唯一の表示データとして保持し、source・thresholds・日数・凡例・共通`classifyDocument`による表示を派生計算する。URL復元時に境界は再生成しない。TSVだけは従来どおりquantileで初期化する。読み替えrevisionで閾値UIを再作成し、前の方式・不正な入力下書きを残さない。
- `ThresholdSettings.vue`：コンパクトでは選択・プリセット・カスタム入力を無効化し、理由を関連付ける。ストアでもlevelsの変更を拒否する。完全データは5方式を利用でき、元countsを維持したまま新しい確定境界で即時再分類する。
- `HeatmapCalendar`とrouter定義は既存の表示契約・Hash Historyをそのまま利用する。levelsではexactCountを持たず、件数範囲を表示する。日付・レベル・色・凡例を共有前後で比較する。

| データ          | 正確な件数       | 閾値変更 | compact再共有              | exact再共有                   |
| --------------- | ---------------- | -------- | -------------------------- | ----------------------------- |
| TSV / exact URL | 保持・表示       | 可       | 可                         | 可                            |
| compact URL     | 復元・推定しない | 不可     | 保存済みレベルと境界を維持 | 無効、元TSVの再読み込みを案内 |

コピーはボタンクリック時だけ行う。Clipboard API非対応・書き込み拒否では成功Snackbarを出さず、URL textareaにフォーカスして全文選択する。Promise完了時にダイアログが閉じているかURLが変わっていれば通知しない。コピー中も閉じる操作は可能。ダイアログではVuetifyのフォーカストラップ・Escapeを使用し、閉鎖後は共有ボタンへフォーカスを戻す。

URL由来の値はVueのテキスト補間／フォームvalueだけで扱い、HTML挿入は行わない。元TSVの全文・ファイル名・列名・氏名・列別内訳はCodecへ渡さない。ブラウザーの永続ストレージを追加していない。架空の合成データのみを使用した。

## テスト

追加：単体13件（URL helper 10、store 2、App 1）、E2E 45件（8機能シナリオ＋性能1シナリオ × 5構成）。既存の単体941件・E2E220件を維持し、合計は単体954件・E2E265件。

共有E2Eでは以下を検証する。

- TSV複数列合算→閾値変更→compact URL生成→明示的コピー→新規タブの直接復元。共有操作中の外部リクエスト0件。
- 保存済み境界と日付・色・レベル・凡例の一致、compactの件数非表示・閾値変更禁止・exact共有禁止・同じ確定境界での再共有。
- exact URLの正確な件数、保存境界、5方式変更、変更後の両形式再共有、新しい境界と元countsの保持。
- Clipboard成功／APIなし／書き込み拒否をテスト側で制御。成功Snackbar、失敗時の全文選択・手動案内・成功通知なし。
- 同一画面での別URL・不正URL・戻る・進む、以前のストアがあっても部分表示しないこと、dなし新規表示／再読み込み、新TSVのquantileへの初期化。
- 重複・空・不正Base64URL・未知形式・切断・余剰・展開エラー・不正日付・不正閾値・65,537文字のdを拒否。Codecそのものの詳細な異常系は既存単体・ブラウザーテストも維持。
- 1,000文字超でもコピー可能、320pxで横にはみ出さないこと、ラジオの矢印キー、ダイアログ内Tab、Escape、閉鎖後のフォーカス復帰。

全構成：Chromium、Firefox、WebKit、mobile-chrome（Pixel 7相当）、mobile-safari（iPhone 13相当）。自動ブラウザーでアクセシビリティのラベル・無効状態・キーボード動作を確認した。スクリーンリーダー実機での読み上げは未実施。

## 最大3,660日の性能

`e2e/sharing-performance.spec.ts`を5構成・1 workerで単独実行した結果を`issue-8-performance.json`に保存した。実行ホストはApple M1（8 logical CPUs）、16GiB、Darwin 25.5.0 / arm64、Node 24.21.0。CPUスロットリングなし。UIは3標本で、イベントcapture（URL復元はhash変更直前）からDOM更新後の2回目のrequestAnimationFrameまでを計測する。ネットワーク待ちやPlaywrightの通信往復は含めず、アニメーション完了時間の保証ではない。

UI標本の中央値（ms）：

| 構成          | ダイアログ表示・compact生成 | exact切替 | 閾値変更・再描画 | URL変更・復元・再描画 |
| ------------- | --------------------------: | --------: | ---------------: | --------------------: |
| Chromium PC   |                     2,319.4 |      20.5 |            355.8 |               1,347.8 |
| Firefox PC    |                          73 |        21 |              228 |                   241 |
| WebKit PC     |                         365 |        19 |              467 |                   501 |
| mobile-chrome |                        45.7 |      20.4 |             58.6 |                  62.1 |
| mobile-safari |                         130 |        26 |               99 |                   115 |

PC Chromiumのダイアログは初回45.4ms、URL差し替え後の2・3回目が2,319.4／2,361.5msだった。最大日数のPC SVGカレンダーを表示した状態のUI待ちとして残る性能上の懸念で、原因は本計測だけでは特定していない。性能結果をCodecの同期実行時間と混同しない。Issue #9の描画全体の改修や年切替は追加していない。

候補生成・デコードは本番minifyしたテスト専用bundle（SPAへは未接続）でも計測した。全0、0〜1199の周期、53bit疑似乱数の各3,660日。ウォームアップ1回後の7標本。最も重い53bit疑似乱数の中央値（ms）：

| 構成          | compact候補生成 | exact候補生成 | compact decode | exact decode | Log境界生成 |
| ------------- | --------------: | ------------: | -------------: | -----------: | ----------: |
| Chromium PC   |             4.3 |          16.4 |            0.7 |          9.4 |         0.8 |
| Firefox PC    |               2 |             9 |              0 |            3 |           0 |
| WebKit PC     |               4 |            21 |              0 |            8 |           1 |
| mobile-chrome |             4.4 |          16.4 |            0.6 |          9.4 |         0.8 |
| mobile-safari |               4 |            20 |              1 |            7 |           0 |

0msはタイマー精度以下を含む。UI表は周期データ、候補表は分布ごとのAPI単体である。端末エミュレーションは実機のCPU性能を再現しない。実機・低速端末・公開後の共有先アプリ経由の遷移は保証範囲外。

## 本番バンドル

`node docs/issue-8-bundle.mjs > docs/issue-8-bundle.json`で再計測できる。基点mainを一時ディレクトリへgit archiveし、同じ依存・Vite設定で両SPAをビルドした。gzipは各assetへNode `gzipSync`のデフォルト設定を使用して合計した（Vite CLIの表示と圧縮設定が異なる）。

| 対象 | main bytes | 今回bytes | 増分bytes | main gzip bytes | 今回gzip bytes | 増分gzip bytes |
| ---- | ---------: | --------: | --------: | --------------: | -------------: | -------------: |
| JS   |    281,602 |   382,263 |   100,661 |         101,754 |        135,508 |         33,754 |
| CSS  |    253,946 |   263,794 |     9,848 |          37,519 |         38,793 |          1,274 |
| HTML |        703 |       703 |         0 |             445 |            447 |              2 |
| 合計 |    536,251 |   646,760 |   110,509 |         139,718 |        174,748 |         35,030 |

今回のSPA増分にはCodec全体の新規接続とVuetifyのダイアログ・ラジオ・Snackbar等、共有画面のコードが含まれる。Issue #7の独立Codecにおける圧縮対応だけのgzip増分13,353 bytesとは比較対象が異なる。依存追加はない。共有データの生成に外部APIや短縮URLサービスは利用しない。

## 変更ファイル

- `src/components/ShareDialog.vue`
- `src/components/ThresholdSettings.vue`
- `src/views/HeatmapView.vue`
- `src/stores/importedSeries.ts`、`importedSeries.spec.ts`
- `src/sharing/shareUrl.ts`、`shareUrl.spec.ts`
- `src/__tests__/App.spec.ts`
- `e2e/sharing.spec.ts`、`sharing-performance.spec.ts`、`sharing-performance-entry.ts`
- `e2e/heatmap.spec.ts`：共有ボタンの追加後もTabだけで日付セルへ到達することを検証（固定Tab回数への依存を解消）
- `docs/issue-8-validation.md`、`issue-8-performance.json`、`issue-8-bundle.mjs`、`issue-8-bundle.json`

## 最終検証・スクリーンショット

- `npm run test`：単体954 / 954、E2E 265 / 265成功（4 workers、E2E約1.1分）。
- `npm run test -- --workers=1`：単体954 / 954、E2E 265 / 265成功（E2E約2.9分）。
- `npm run type-check`：成功（アプリ・単体・E2Eの型チェック）。
- `npm run lint`：Oxlint・ESLintとも成功。
- `npm run format`、`npm run format:check`：成功。
- `npm run build`：成功。JS `index-DmMvYEEe.js`、CSS `index-CTrtt0JA.css`。比較JSONと一致。
- `git diff --check`：成功。

スクリーンショットは最終E2E出力から`artifacts/issue-8.local/`へ保存した。このディレクトリは既存の`*.local`ルールによりGit対象外。検証用の架空データのみで、実際の個人データは使用していない。

保存ファイル：

- `artifacts/issue-8.local/share-desktop.png`：PCの共有ダイアログ。
- `artifacts/issue-8.local/share-mobile.png`：mobile-safariの共有ダイアログ。
- `artifacts/issue-8.local/share-320-top.png`：320pxのラジオとプライバシー説明。
- `artifacts/issue-8.local/share-320-warning.png`：320pxの長いURL・警告・コピー操作。
- `artifacts/issue-8.local/test-default.log`、`test-serial.log`、`test-focused.log`：最終の全テスト2回と共有・閾値設定65件の検証ログ。

push・PR作成・Ready化・マージ・タグ・公開は行わない。
