# Issue #4 検証記録

対象ブランチ：`codex/4-heatmap-ui`。基点はmainとorigin/mainが一致した`51c1a178bceac6d7d865da52c0c8b83edac8b9c1`。2026-10-19（日本時間）に検証。

## 実装範囲と主要ファイル

- `src/domain/heatmap.ts`：分類済みデータを共通の日付セルVMへ変換。UTC epoch dayで曜日・週・月内行を計算。負のepoch dayは正の剰余へ補正。
- `src/domain/provisionalPreset.ts`：SPEC 4.4の固定プリセットID 1、8色、範囲ラベル。分類を表示から分離。
- `src/components/heatmap/DesktopHeatmap.vue`：VHeatmapへ曜日・週の明示的な座標とレベルを渡す。日本語の月見出しと領域内横スクロール。
- `src/components/heatmap/MobileHeatmap.vue`：日曜始まりの月別7列カレンダー。高さ44px以上のネイティブボタン。
- `src/components/heatmap/HeatmapCalendar.vue`：幅960pxで表示切替、選択日詳細、8色のテキスト凡例。
- `src/composables/useHeatmapInteraction.ts`：イベント委譲、1か所のTab停止位置、矢印・Home/End・Enter/Space操作。
- `src/views/HeatmapView.vue`：既存PiniaストアのExactSeriesを描画へ接続。既存のデータなし案内を保持。
- `src/domain/heatmap.spec.ts`、`src/components/heatmap/HeatmapCalendar.spec.ts`、`e2e/heatmap.spec.ts`、`e2e/heatmap-performance.spec.ts`：配置・表示・操作・性能の検証。
- `package.json`：`npm run test`でVitestとPlaywrightを続けて実行する入口を追加。既存コマンドは維持。
- `README.md`：表示と操作方法、暫定分類、正式な初期設定が未実装であることを明記。

Issue #5の5方式全体・設定UI、共有URL Codec、Pages公開機能は対象外。

## 日付と表示の検証

Vitestは既存を含む139件。日曜始まり、月初・月末、年末年始、閏日、未記録の0件と明示的な0件、開始・終了以外の余白、1日だけ、西暦0001・0099・0100・9999年、負のUTC epoch day、3,660日の一意性、境界値と最大安全整数を検証する。分類済みラベル・色が描画用VMへそのまま渡り、正確な件数がないときに件数を推定しないことも確認する。

Playwrightは既存を含む170件（34件×5構成）。PCのChromium・Firefox・WebKit、Pixel 7相当のChromium、iPhone 13相当のWebKitで、TSV→ヒートマップ、日付と曜日の座標、月跨ぎ・年跨ぎ、0件と期間外の区別、ホバー・タップ・キーボード、最小幅320px、最大安全整数、表示幅切替を確認する。ブラウザーのタイムゾーンをUTC・Asia/Tokyo・America/New_Yorkに変え、DST前後でも同じ日付・曜日となることを確認する。

PCとモバイルの画面画像も確認。月見出し・曜日・セル・凡例の重なりや横方向のはみ出しは確認されなかった。長期間スクロール後も選択日詳細が固定ヘッダーの下に表示されることをE2Eで確認。スマートフォンはタップ後に他の領域へ触れても詳細を保持する。タッチ後の疑似mouseoverでは選択を更新せず、スクロール中の意図しない日付変更を防ぐ。

VHeatmap 4.2.1の`VHeatmap.js`と`VHeatmapCell.js`を確認した。実セルはSVGの`g`で、`itemProps`を通じて`role=button`・`tabindex`・`aria-label`・`title`を追加できる。実DOMとアクセシブルな名前をテストし、キーボード時は枠線を表示する。SVGに標準のボタン操作がないため、委譲イベントでEnter/Spaceを補う。詳細欄は`aria-live=polite`で通知する。Safari系のTabはOS既定で通常のリンクを飛ばす場合があるため、日付への到達・矢印移動・Tabで領域を抜けることを検証する。

## レスポンシブ境界の修正（PR #13レビュー対応）

ヒートマップの切り替えを**960px未満は月別カレンダー、960px以上はPC表示**に統一した。導入済みのVuetify 4.2.1では既定のmdが840pxで、`smAndDown`も840px未満となるため、`useDisplay().width`から960px未満かを明示的に判定する。Vuetify全体のブレークポイントは変更しない。

Playwrightでは839・840・900・959pxで月別カレンダー、960pxでPC表示を確認する。各幅から境界の反対側へ移動して戻す操作も行い、各状態で日付5件の一覧が正確に一致し、欠落・重複・期間外セルがなく、表示方式が同時に2つ描画されないことを確認する。選択日の詳細も維持する。

## 最大3,660日の性能

測定環境：MacBook Air（MacBookAir10,1）、Apple M1、8論理CPU、16GiB、macOS 26.5.1（25F80、arm64）、Node 24.21.0、Playwright 1.63.0、Vuetify 4.2.1。本番ビルドをローカルでプレビュー。headless、1 worker、CPU速度制限なし、各構成3回。他のテストを並行実行せず測定した。

データは2016-01-01〜2026-01-07の3,660日。毎日1行、件数は`index % 1200`（最終日は1153）の合成TSVで、0〜7の全色を含む。

- 初期描画：列選択フォームのsubmitから3,660セルがDOMへ入り、その後2回目のrequestAnimationFrameまで。集計・分類・画面遷移・描画を含む。事前のファイル読み取りとTSV構造解析、初回ページのネットワーク読み込みは含まない。
- 選択応答：PCはmouseover、モバイルはpointerdownから2回目のrequestAnimationFrameまで。末日の正確な件数が詳細へ反映されることも確認。Playwrightの呼び出し全体の通信時間は含めない。2回のrAFを使った描画完了の近似値であり、実画面の光学的な表示時間ではない。
- スクロール：PCはヒートマップ内を横方向、モバイルは文書を縦方向に、60フレームで先頭から末尾へ移動。最初のフレームを除いたrAF間隔を集計。入力機器の遅延や実機の慣性スワイプは測っていない。
- 再描画：選択の前後をMutationObserverで監視。日付領域の子DOMと属性更新を計測（フォーカス管理のtabindex変更を除く）。全15回で0件。詳細欄だけを更新し、選択状態を全セルのpropsへ渡さない構造にしている。

時間の単位はms。初期描画と選択は各3回の生値。スクロールは3回中で最大のP95と最大値を掲載する。

| 構成・ブラウザー版                 | ビューポート・DPR | 初期描画（3回）       | 選択応答（3回）       | スクロールP95 / 最大 |
| ---------------------------------- | ----------------- | --------------------- | --------------------- | -------------------- |
| PC Chromium 153.0.8010.12          | 1280×720・1       | 404.8 / 356.4 / 357.1 | 34.5 / 37.1 / 33.2    | 16.8 / 16.8          |
| PC Firefox 155.0                   | 1280×720・1       | 249.0 / 245.0 / 211.0 | 38.0 / 16.0 / 43.0    | 17.3 / 17.7          |
| PC WebKit 26.6                     | 1280×720・2       | 329.0 / 311.0 / 318.0 | 109.0 / 110.0 / 111.0 | 18.0 / 36.0          |
| Pixel 7相当 Chromium 153.0.8010.12 | 412×839・2.625    | 117.1 / 88.9 / 85.8   | 26.4 / 32.8 / 32.6    | 16.7 / 16.8          |
| iPhone 13相当 WebKit 26.6          | 390×664・3        | 221.0 / 199.0 / 200.0 | 30.0 / 32.0 / 30.0    | 17.0 / 20.0          |

測定生データは[issue-4-performance.json](issue-4-performance.json)に保存。実行時のJSONはPlaywright HTMLレポートの`performance.json`添付にも出力する。実行ごとに測定値は変動する。

この環境では初期描画の最大値が0.405秒、スクロールのP95の最大値が18.0msで、著しい操作停滞は観測されなかった。年切替・遅延描画・仮想化は追加していない。

## 最終検査と申し送り

`npm run type-check`、`npm run lint`、`npm run format`、`npm run test`（2回）、`npm run build`、`git diff --check`はいずれも成功。初回実装の全テスト2回はVitest 139件・Playwright 145件が通過した。レスポンシブ境界修正後はVitest 139件・Playwright 170件が通過した。UTC・Asia/Tokyo・America/New_Yorkでの単体テストも各139件成功した。

Issue #5では`classifyWithProvisionalPreset`と暫定凡例を、正式な初期設定の分位点方式・確定した境界ラベルへ置き換える。表示コンポーネントは分類済みVMだけに依存し、元件数を再分類しない。

モバイル測定はM1上のエミュレーションであり、低速スマートフォンの実測値ではない。VoiceOver/TalkBack等の実機音声読み上げと実機の慣性スワイプは未確認。読み上げ属性・アクセシブルな名前・フォーカス・キーボード・タップは自動テストで確認済み。
