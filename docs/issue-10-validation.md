# Issue #10 検証記録

実施日：2026-10-21（Asia/Tokyo）。対象：[Issue #10](https://github.com/tatsuya0903/daily-heatmap/issues/10)、親Issue #1。開始時はmain / origin/mainとも`530dc4328b2df49efdfd6758dfc303f35759e9a0`、作業ツリーはクリーン。fetch後、最新mainから`codex/10-ci-pages`を作成した。package versionは`0.1.0`を維持。Node.js 24.21.0 / npm 11.19.0、ローカルmacOSで検証した。

## 1. Workflowとトリガー

`.github/workflows/ci.yml`はmain向け`pull_request`（既定のopened / synchronize / reopened、Draft除外なし）とmainへの`push`だけ。パスフィルターを置かず、ドキュメント変更でも検査する。

`.github/workflows/deploy.yml`は`workflow_dispatch`だけ。入力は既存の`release_tag`と、タグ承認とは別の公開承認取得を示す`publish_approved`（boolean、初期値false）。実行元リポジトリと`refs/heads/main`を制限する。未チェックやmain以外では検証ジョブがskipされ、後続も進まない。タグpushトリガー・`workflow_run`・`pull_request_target`はない。

## 2. ジョブの依存関係

| Workflow | ジョブ                            | 依存・内容                                                                                                |
| -------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| CI       | quality / Quality checks          | 独立。npm ci、型、Lint、整形、workflow検査、単体、本番build、配布物検査                                   |
| CI       | e2e / Playwright E2E (5 projects) | 独立。npm ci、3エンジンとOS依存、本番build、5構成300件                                                    |
| Deploy   | validate-release                  | mainからdispatchされた信頼する検証コードでタグ・version・main履歴・成功CIを確認                           |
| Deploy   | build-pages                       | validate-release成功に依存。検証コードと対象ソースを別checkoutし、再検証後にnpm ci / build / artifact作成 |
| Deploy   | deploy-pages                      | validate-releaseとbuild-pagesの成功に依存。configure-pages（enablement=false）/ deploy-pagesのみ          |

E2Eは1 worker。別previewを起動せず既存Playwright webServerを使う。CIでは再利用せず、`forbidOnly`と既存のリトライ2回、`trace: on-first-retry`を使用する。`--fail-on-flaky-tests`でリトライ成功もCI失敗にする。matrix化は初期構成では採用せず、runner初期化・npm導入・ビルドの重複とActions使用量を抑える。既定では先のテスト失敗で他の構成を打ち切る設定を加えていない。

CI concurrencyはPR番号またはref単位で旧runをキャンセル。Pagesは全run共通`github-pages`、`cancel-in-progress: false`。進行中公開を中断しないが、GitHubはpending runを新しい要求で置換し得るため、連続dispatchを避けて状態を確認する。

## 3. Permissions

| 範囲                    | 権限                           | 用途                                                          |
| ----------------------- | ------------------------------ | ------------------------------------------------------------- |
| CI全体、quality、e2e    | contents: read                 | checkoutのみ。Pages/OIDC権限なし                              |
| Deploy既定、build-pages | contents: read                 | 検証コード・対象ソースのcheckout。Pages/OIDC権限なし          |
| validate-release        | contents: read / actions: read | 成功したmain push CI runをREST APIで照合するための読み取り    |
| deploy-pages            | pages: write / id-token: write | Pagesデプロイ、OIDC。contents権限なし、アプリcheckout/npmなし |

省略した権限はnone。すべてのcheckoutは`persist-credentials: false`。CIのnpmキャッシュはlockfileキー、releaseジョブのpackage-manager-cacheはfalseとし、対象タグからキャッシュを保存しない。secrets・PAT・GitHub Release作成は追加していない。

## 4. イベントごとの挙動（設定検査）

| イベント                                   | CI           | Deploy                                                       |
| ------------------------------------------ | ------------ | ------------------------------------------------------------ |
| main向けPR作成・更新（Draft含む）          | qualityとe2e | 起動しない                                                   |
| main push                                  | qualityとe2e | 起動しない                                                   |
| リリースタグpush                           | 起動しない   | 起動しない                                                   |
| mainから手動dispatch、公開承認チェックなし | 起動しない   | ジョブは進まない                                             |
| mainから手動dispatch、公開承認チェックあり | 起動しない   | タグ等の全検証成功後のみbuild、environment保護を経て公開可能 |
| main以外からdispatch                       | 起動しない   | 検証・後続ジョブは進まない                                   |

ここでの結果はYAML構造・actionlint・ローカル回帰テストによるもの。GitHub上では今回実行していない。

## 5. タグ・version・不変SHAの検証

`scripts/release/validate-release.mjs`は外部依存なしのNodeコード。タグは先頭ゼロなしの安定版`vX.Y.Z`だけを許可し、空白・改行・prerelease・build metadata・ref/SHA直接入力・shell構文を拒否する。Gitはshellを介さない`execFileSync`で引数を渡す。

originの`refs/heads/main`と正確な`refs/tags/<tag>`だけを取得し、ローカルタグや同名ブランチから曖昧に解決しない。軽量タグとannotated tagの両方を許可し、タグrefのobject SHAと`^{commit}`のpeeled SHAを分けて確定する。blob/treeや不存在タグは拒否する。`git show <確定SHA>:package.json`からversionを読むため、dispatch元のmain versionは基準にならない。

`merge-base --is-ancestor`でorigin/main履歴を確認する。GitHub REST APIの`ci.yml` runsをmain・push・同一head SHAで絞り、最新のrunがcompleted / success、正しいworkflowパス・リポジトリであることを照合する。未完了・失敗・skip・cancel・PRだけの成功・API障害は停止する。API tokenはこの検証stepにだけ渡し、npmを実行しない。

buildではdispatch時の不変な`github.sha`にある検証コードを使用する。対象ソースはvalidate出力の完全なcommit SHAでcheckout。npm実行前にタグobjectとcommitの両SHA、main履歴、version、checkout HEADを再確認し、タグの移動・annotated object差し替え・削除を拒否する。再確認後にタグが移動しても対象ソースSHAは変えず、artifactはこのrunで生成したものだけを使う。タグ変更の永続的な防止はRulesetで補完する。

過去タグの再公開を許可し、ロールバックを可能にする。同じ検証・成功CI・別途公開承認を必須とする。古いCI runが削除されている場合はfail closed。対象のmain push runを再実行できない場合は、レビュー済み復旧コミットを新バージョンの通常リリースにする。タグの付け替えや検証省略はしない。

## 6. 正常系・異常系とWorkflow検査

`npm run test:workflows`：**51件成功、fail / skip / todoすべて0**（約3.3秒）。Node標準test runnerを使い、YAML構造解析だけに開発依存`yaml@2.9.1`を追加した。アプリの単体956件とは別カウント。

- 正常：v0.1.0等の形式、軽量/annotatedタグ、mainより古いタグのpackage参照、両SHA一致、正しいmain push CI。
- 異常：不正形式、コマンド注入風入力、ローカルだけのタグ、同名ブランチ、欠落タグ、version不一致、壊れたJSON、main外、非commit、タグ移動・注釈差し替え・削除、checkout不一致、不正SHA。
- CI判定：SHA・branch・event・workflow・repository不一致、失敗・skip・cancel・実行中、runなし、API拒否・通信失敗・tokenなし。
- CLI：不正入力・別ブランチ・タグref・pushイベント・別リポジトリを公開処理前に拒否。
- Workflow：YAML parse（重複キーも拒否）、トリガー、Draft除外なし、ジョブ依存、permissions、Node固定、公式Action SHA、入力のenv渡し、ソースSHA固定、チェックコマンド、trace保存を検査。
- 配布物：base誤り、外部参照、asset欠落、public欠落/変更、hidden file、symlinkを拒否。

タグとGit pushのfixtureは`os.tmpdir()`内の一時Gitリポジトリ間だけで実施して自動削除する。アプリリポジトリやGitHubにタグを作成・pushしていない。

**actionlint 1.7.12：成功（診断0）**。GitHub Actionsの式、型、イベント、needs、outputs、Action入力などを検査した。公式releaseのdarwin_arm64アーカイブを一時領域に取得し、公開checksumsとSHA-256 `aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f`が一致。shellcheckはローカルにないため未実行（runには入力展開shellを使わず、Nodeまたは固定npmコマンドのみ）。再実行方法はルートで`actionlint`と`npm run test:workflows`。

Actionは2026-10-21にGitHub公式repoのlatest release・tag refと必要な`action.yml`を確認し、次の完全SHAへ固定した。メジャータグの移動による暗黙更新を避け、上流修正はレビューして追従する。upload-pages-artifact内部のupload-artifactもSHA固定されている。

| 公式Action                    | 確認した版 | 固定SHA                                  |
| ----------------------------- | ---------- | ---------------------------------------- |
| actions/checkout              | v7.0.1     | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node            | v7.1.0     | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| actions/upload-artifact       | v7.0.2     | cf430e030ddbb5b0abf93d22962f4752f3646cd9 |
| actions/configure-pages       | v6.0.0     | 45bfe0192ca1faeb007ade9deae92b16b8254a0d |
| actions/upload-pages-artifact | v5.0.0     | fc324d3547104276b827a68afc52ff2a11cc49c9 |
| actions/deploy-pages          | v5.0.1     | 368f82528645a54fb793d4d04e342629a3f51346 |

## 7. Pages本番ビルドの静的検証

`npm run build`成功。`npm run check:pages`で5ファイルを検証した。生成indexのJSは`/daily-heatmap/assets/index-Dohv7WlL.js`、CSSは`/daily-heatmap/assets/index-DGofGpXW.css`、layers.cssも`/daily-heatmap/layers.css`。publicのlayers.css / sample.tsvは元とバイト一致。JS/CSS参照先はすべて実在し、外部URLやroot直下assetの誤参照はない。

ViteのdistはPagesサイトのルートに配置され、ホストがプロジェクトパス`/daily-heatmap/`へmountする。dist内に二重のdaily-heatmapディレクトリを作らない。アプリの外部API・秘密情報は追加していない。

## 8. PreviewとHash Router

Vite base `/daily-heatmap/`、`createWebHashHistory(import.meta.env.BASE_URL)`を維持。Playwrightの既存webServerが本番distを`127.0.0.1:4173/daily-heatmap/`で配信する。

既存のE2E件数は増減させず、トップのHTTP 200、sample.tsvのHTTP 200と合成ヘッダー、ページが要求するリソースの4xx/5xx・requestfailedなしを確認するassertionを追加した。コンパクト/完全URLの新規タブとreloadでは元のURL全体が保持されることを追加検査し、`d`がHash外へ移動・削除・変更されないことを確認する。`#/heatmap`の直接表示・reloadと復帰、共有内容・境界・件数・色の復元は既存E2Eも継続する。

全5構成で1 workerと通常4 workersの両実行が成功した。E2E実行結果は次節に記録する。ローカル成功はGitHub Pagesでの配信・公開成功を証明しない。

## 9. ローカル品質検査

| 検査                                                          | 結果                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| npm ci                                                        | 成功。lockfileから305パッケージを導入                   |
| npm run type-check                                            | 成功                                                    |
| npm run lint                                                  | Oxlint / ESLint成功、警告無効化・自動修正なし           |
| npm run format:check                                          | 成功（最終文書更新後に再確認）                          |
| npm run test:workflows                                        | 51 / 51成功、skipなし                                   |
| npm run test:unit                                             | 17ファイル、956 / 956成功（6.49秒）                     |
| npm run build                                                 | 成功（Vite build部分0.81秒）                            |
| npm run check:pages                                           | 5ファイル成功                                           |
| npm run test:e2e -- --workers=1                               | 300 / 300成功、skipなし（3.3分）                        |
| npm run test:e2e                                              | 300 / 300成功、skipなし（通常4 workers、1.3分）         |
| npx playwright install --with-deps chromium firefox webkit    | 成功（macOS、LinuxのOS依存導入はGitHub runnerで未検証） |
| CI=true npm run test:e2e -- --workers=1 --fail-on-flaky-tests | 300 / 300成功、flaky / retry / skipなし（3.2分）        |
| git diff --check                                              | 成功（最終コミット前にも再確認）                        |
| actionlint 1.7.12                                             | 成功、診断0                                             |

## 10. GitHub上で初めて確認できる事項

未pushのため、PR/Draft PR・main pushの実際の起動、GitHub-hosted Ubuntu runnerでのNode/OS/browser導入と全検査、npmキャッシュ、失敗時artifact/traceのアップロード、required check名の表示は未検証。

タグ対象のCI REST照合はfixtureで検査し、実GitHub runとの照合は未実行。workflow_dispatch入力・依存・environment保護・OIDC・Pages artifactの受付・configure-pages / deploy-pagesの実動作・公開URL・公開後の404/共有URLは未検証。今回はdispatchや公開を実行していない。

## 11. Pages・保護設定の未実施事項

GitHub APIでリポジトリはpublic / default branch main / `has_pages: false`、mainは`protected: false`（required status checksはoff）、Rulesets一覧は空と確認した。environment・Actions policyの現在値は接続ツールの取得範囲にないため未確認。今回変更していない。

ユーザーによる設定：Settings → PagesのSourceをGitHub Actionsへ、github-pages environment、selected deployment branch **mainのみ**、required reviewers・自己承認/管理者bypassの制御、Actions公式Action許可・既定read権限、mainのPR/レビュー/必須2チェック・force push等制限、`v*`タグの作成/更新/削除Ruleset。publicでは現行プランでenvironment保護を利用できるが、実画面・権限・体制を確認する。

environmentのbranch判定はdispatch元`GITHUB_REF`を使うため、タグパターンではなくmainを許可する。設定の具体的な順序と注意はREADME参照。保護が未設定でも自動起動はしないが、チェックボックスは承認者の本人確認やenvironment保護を代替しない。

## 12. 所要時間と実行量

ローカルのworkflowテスト約3.3秒、単体約6.5秒、Vite build部分約0.8秒。E2Eの1 workerは3.3分、通常4 workersは1.3分。CI=true・flaky検出ありの1 workerは3.2分。キャッシュやOSの差があるためGitHub-hosted runnerにそのまま当てはめない。

初回CIの見積もり：quality 2〜5分、E2E 5〜15分（ブラウザー/OS依存の導入含む）。2ジョブは並行なので全体は遅い方が目安。使用量は両ジョブの合計runner時間。上限はquality 15分 / E2E 30分で、既存テストのtimeoutは増やしていない。実測後に見直す。Deployはvalidation 5分 / build 15分 / deploy 10分の上限、environment承認待ちは別。

## 13. セキュリティリスクと対策

入力をrunのshellへ直接埋め込まずenvで渡し、厳密形式検査後にGitへ引数渡しする。検証は信頼するmainのコード、npmより前、低権限で行う。ビルドと公開は別runner・別権限。API認証値・レスポンス全体をログに出さない。artifactは合成fixtureだけ、E2E失敗7日 / Pages 1日とする。個人データや認証情報をfixtureへ入れない。

mainに悪意あるコードがマージされた場合や、管理者がworkflowを改変した場合の権限乱用までは、このworkflow単体で防止できない。mainレビュー・必須CI・workflow変更レビュー・タグRuleset・environment承認で補完する。タグを後日移動された履歴までローカルSHA照合だけで証明できないため、タグ更新/削除を禁止しリリース時のSHAを記録する。

追加の`npm audit`では既存の**Vite 8.2.2にhigh 1件**（launch-editor関連3 advisoryの集約）を検出した。mainのlockfileも同じVite 8.2.2であり、今回追加したyamlには検出なし。アプリ仕様・依存更新はIssue #10の範囲として変更しない。静的Pagesには開発サーバーを配信しないが、開発ツール側の影響評価と依存更新の判断は公開前に必要。詳細：[Windows % escaping](https://github.com/advisories/GHSA-698v-4r3x-3vcv)、[Editor CLI flags](https://github.com/advisories/GHSA-r825-w8mm-5pxw)、[Windows existence check](https://github.com/advisories/GHSA-587h-7wmj-h5pm)。audit自体は指摘ありでexit 1、必須品質検査成功とは分けて記録する。

npm ciはmacOSのoptional依存fseventsのinstall script承認に関する警告を出したが、導入はexit 0。新しいskipや警告抑制は追加していない。

## 14. 公開前の未解決課題・承認

Issue #9の申し送りを維持：3,660日のChromium URL差し替え再描画中央値約1.41秒、SVG関連要素のStyle再計算が主負荷で性能改善は未完了。描画アーキテクチャは変更していない。LINE共有、iPhone/Android実機、スクリーンリーダー実機、ブラウザー実倍率200%/400%、ネイティブselectの実機キー操作は未実施。CI整備や端末エミュレーション成功とは別課題。

この後に必要な承認は、push・PR作成・マージ、リリース前レビュー、タグ作成、タグpush、そして**それらとは別のPages公開承認**。承認後のGitHub CI・設定・実公開・公開後受け入れが残る。package.jsonの勝手なversion変更、タグ作成、dispatch、設定変更、公開は今回行わない。

## 15. 変更ファイル

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `scripts/release/validate-release.mjs`
- `scripts/release/validate-release.test.mjs`
- `scripts/release/check-pages.mjs`
- `scripts/release/check-pages.test.mjs`
- `scripts/release/workflows.test.mjs`
- `e2e/app.spec.ts`
- `e2e/sharing.spec.ts`
- `package.json`
- `package-lock.json`
- `README.md`
- `docs/issue-10-validation.md`

src、Codec Golden、Router、Vite・Playwright設定、公開済みID、閾値、圧縮安全性、共有仕様、全3,660日表示とアクセシビリティ、ShareDialog性能改善、個人データ非送信の設計は変更していない。

## 16. 最終コミットとGit状態

ローカルコミットを次の論理単位に分けた。

- CI・検証スクリプト・回帰テスト・開発依存：`1d36893af4bb680b5f1343f31d4bf52ec1cea605`
- Pagesと共有URLのE2E assertion：`6076c27ffd1a6bf9b6f45b9455f9eda0b8590577`
- README・本検証記録：最後の文書コミット`docs: record CI and manual release operations (#10)`（後述のコマンドで特定）。

最終fetchでもmain / origin/mainは`530dc4328b2df49efdfd6758dfc303f35759e9a0`、左右差分0 / 0。リリースタグ一覧は空。未pushで、このブランチだけがorigin/mainから3コミット先行する構成。最終状態は作業ツリーがクリーン、未push。文書コミット後にも再確認し、確定SHAとともに完了報告する。

本記録自身を含む最終コミットのSHAは自己参照になるためファイル内へ埋め込まず、`git log -1 --format=%H`で確定し完了報告へ記載する。最終確認は`git status --porcelain=v1`、`git rev-parse main origin/main HEAD`、`git log --oneline origin/main..HEAD`、`git diff --check`。

## 参照した公式資料と比較元

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)：公式Pages Action、artifact、分離ジョブ、権限。
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)：最小権限、完全SHA固定、入力とshellの分離。
- [workflow_dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)：手動起動と既定ブランチ上のworkflow。
- [Environment設定](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[保護ルール](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)：planによる利用条件、reviewer、branch制限とGITHUB_REF。
- [Workflow runs API](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow)：read権限、head_sha等による対象runの取得。
- [brain-training CI](https://github.com/tatsuya0903/brain-training/blob/main/.github/workflows/ci.yml)、[Pages](https://github.com/tatsuya0903/brain-training/blob/main/.github/workflows/deploy.yml)：Node/npm・公式Action・production previewを比較。タグpush自動公開、Release作成、E2Eの品質ジョブ依存、ビルドへの公開権限はコピーしなかった。
