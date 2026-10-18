# Daily Heatmap

日別の件数データをカレンダー形式のヒートマップで可視化し、URLで手軽に共有できるWebアプリケーション。

現在はPhase 1の開発基盤と、Issue #3のTSV読み込み・列選択・日付正規化を実装しています。ヒートマップ表示・閾値設定・URL共有は後続Issueで実装します。仕様の管理元は [SPEC.md](./SPEC.md) です。

## 技術構成

- Vue 3 / TypeScript strict / Vite
- Vuetify 4（Labs VHeatmapを明示登録）/ Material Design Icons SVG
- Vue Router（Hash History）/ Pinia
- Vitest / Vue Test Utils / Playwright
- ESLint / Oxlint / Prettier

## 開発環境

Node.js **24.21.0**を使用します。Voltaがある場合は`package.json`の指定が自動的に適用されます。依存関係は`package-lock.json`で固定します。

```sh
npm ci
npm run dev
```

開発サーバーの表示先は `/daily-heatmap/` です。

## 検査

```sh
npm run type-check
npm run lint
npm run format:check
npm run test:unit
npm run build
```

`lint`はファイルを書き換えません。修正には`npm run lint:fix`、整形には`npm run format`を使用します。

単体テストは`src/**/*.spec.ts`に併置します。TSV解析・集計・日付変換・ファイル読み込み、入力エラー時の状態保持、画面の復帰操作、Vuetify 4 Labs連携を検証します。日付のテストは、DSTを含む異なるタイムゾーンでも実行できます。

```sh
TZ=UTC npm run test:unit
TZ=Asia/Tokyo npm run test:unit
TZ=America/New_York npm run test:unit
```

## E2E

本番ビルドに対してPCのChromium・Firefox・WebKitとモバイル表示を検証します。初回はブラウザーをインストールしてください。

```sh
npx playwright install
npm run build
npm run test:e2e
```

Playwrightは本番プレビューを自動起動します。トップ表示、Hash URLへの直接アクセスと再読み込み、データなし・不明ページからの復帰に加え、ファイル選択・ドロップ・列選択・入力エラーと再試行を検証します。

## TSV読み込み

トップ画面でUTF-8（BOMあり・なし）の`.tsv`／`.txt`を選択、またはドラッグ＆ドロップします。ファイルサイズは**2MiB（2,097,152バイト）以内**、最小日から最大日までの期間は**3,660日以内**です。制限値は`src/domain/limits.ts`にまとめています。

先頭列は`Date`、残りは重複しない空でない列名とし、タブで区切ります。LF・CRLFと末尾空行に対応します。以下は架空の入力例です。

```tsv
Date	Count
2026-04-01	6
2026-04-02	4
2026-04-11	45
```

複数列の場合は初期状態ですべて選択します。必要な1列以上を選択して「選択した列を読み込む」を押してください。次の例は全列選択時に上の例と同じ結果になります。

```tsv
Date	A件数	B件数
2026-04-01	3	3
2026-04-02	2	2
2026-04-11	21	24
```

日付は`0001-01-01`〜`9999-12-31`の実在する`YYYY-MM-DD`のみ、選択列の件数は0以上の10進整数のみです。空白・小数・負数・指数表記・カンマは受け付けません。各値と同日の合算値に`Number.MAX_SAFE_INTEGER`（9,007,199,254,740,991）の上限を適用します。

未選択列の値は数値として評価しませんが、全行の列数・日付・ヘッダーは検証します。重複日は加算せずエラーにします。エラー時は行番号・該当列・理由を表示し、列の選び直しやファイルの再選択ができます。全検証が完了するまではアプリの既存データを更新しません。

日付はUTC epoch dayで扱い、日付順に並べて未記録日を0件で補完します。末尾の0件も保持します。上の例はいずれも11日分の`[6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 45]`になります。

Vueに依存しない`src/domain/`が解析（`parseTsv`）・選択列集計（`aggregateTsv`）・UTF-8読み込み（`readTsvFile`）・UTC日付変換を担当します。成功時は列名を含まない`ExactSeries`（`kind`・`startDate`・`counts`）をメモリー内のストアへ渡し、`/heatmap`で期間を確認できます。描画は後続Issueで実装します。

## データの取り扱い

TSVはブラウザー内で処理します。元のファイルをサーバーへ送信せず、ブラウザーの永続領域にも自動保存しません。個人データをリポジトリへ追加しないでください。ローカルの個人データ置き場として`private-data/`をGitの除外対象にしています。公開サンプルとテストには架空のデータのみを使用します。

共有機能はPhase 4で実装します。コンパクト形式は正確な件数を保持せず、完全データ形式は選択列の正確な日別合計を保持します。どちらのURLにも元の列名は含めません。URLは暗号化されません。

## GitHub Pagesと開発運用

Viteの`base`は`/daily-heatmap/`、Vue RouterはHash Historyです。予定する共有URLは`https://tatsuya0903.github.io/daily-heatmap/#/heatmap?d=...`です。CIとリリースタグ起点のPagesデプロイ設定はPhase 5で追加します。

親Issueは [#1](https://github.com/tatsuya0903/daily-heatmap/issues/1)、Phase 1は [#2](https://github.com/tatsuya0903/daily-heatmap/issues/2)、TSV読み込みは [#3](https://github.com/tatsuya0903/daily-heatmap/issues/3) です。最新のmainからIssueごとの`codex/<Issue番号>-<内容>`ブランチを作成し、原則1 Issueにつき1 PR、Squash and mergeを使用します。

main上での直接実装は行いません。push・PR作成・マージ・タグ作成・公開デプロイは、ユーザーの明示承認後に行います。
