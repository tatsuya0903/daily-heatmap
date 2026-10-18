# Daily Heatmap

日別の件数データをカレンダー形式のヒートマップで可視化し、URLで手軽に共有できるWebアプリケーション。

現在はPhase 1の開発基盤と画面の骨格を実装しています。TSV読み込み・ヒートマップ表示・閾値設定・URL共有は後続Phaseで実装します。仕様の管理元は [SPEC.md](./SPEC.md) です。

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

単体テストは`src/**/*.spec.ts`に併置します。画面の復帰操作とVuetify 4 Labs連携を検証し、後続Phaseでデータ変換・閾値・Codecのテストを追加します。

## E2E

本番ビルドに対してPCのChromium・Firefox・WebKitとモバイル表示を検証します。初回はブラウザーをインストールしてください。

```sh
npx playwright install
npm run build
npm run test:e2e
```

Playwrightは本番プレビューを自動起動します。Phase 1ではトップ表示、Hash URLへの直接アクセスと再読み込み、データなし・不明ページからの復帰を検証します。

## データの取り扱い

TSVはブラウザー内で処理する設計です。元のファイルをサーバーへ送信せず、ブラウザーの永続領域にも自動保存しません。個人データをリポジトリへ追加しないでください。ローカルの個人データ置き場として`private-data/`をGitの除外対象にしています。公開サンプルとテストには架空のデータのみを使用します。

共有機能はPhase 4で実装します。コンパクト形式は正確な件数を保持せず、完全データ形式は選択列の正確な日別合計を保持します。どちらのURLにも元の列名は含めません。URLは暗号化されません。

## GitHub Pagesと開発運用

Viteの`base`は`/daily-heatmap/`、Vue RouterはHash Historyです。予定する共有URLは`https://tatsuya0903.github.io/daily-heatmap/#/heatmap?d=...`です。CIとリリースタグ起点のPagesデプロイ設定はPhase 5で追加します。

親Issueは [#1](https://github.com/tatsuya0903/daily-heatmap/issues/1)、Phase 1は [#2](https://github.com/tatsuya0903/daily-heatmap/issues/2) です。最新のmainからIssueごとの`codex/<Issue番号>-<内容>`ブランチを作成し、原則1 Issueにつき1 PR、Squash and mergeを使用します。

main上での直接実装は行いません。push・PR作成・マージ・タグ作成・公開デプロイは、ユーザーの明示承認後に行います。
