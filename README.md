# slack-issue-bot

Slack DM で会話すると Claude AI がアイデアを深掘りし、GitHub Issue を自動作成するボットです。

## 主な機能

- Slack DM でアイデアを会話形式でヒアリング
- Claude AI がアイデアを整理・深掘り
- ユーザーの承認後に GitHub Issue を自動作成（タイトル・本文・ラベル付き）
- 会話履歴の保持（30分TTL、最大20メッセージ）
- Slack リクエスト署名検証によるセキュリティ対策

## 前提条件

- Node.js 22+
- [Slack App](https://api.slack.com/apps)（Bot Token + Event Subscriptions）
- [GitHub Personal Access Token](https://github.com/settings/tokens)（repo スコープ）
- [Anthropic API Key](https://console.anthropic.com/)
- [Vercel](https://vercel.com/) アカウント（デプロイ用）

## アーキテクチャ

```
Slack DM → Vercel Serverless Function (api/webhook.ts)
              ↓ 署名検証 (src/slack.ts)
              ↓ Claude API 呼び出し (src/claude.ts)
              ↓ 必要に応じて GitHub Issue 作成 (src/github.ts)
              ↓ Slack に返信
```

### ファイル構成

```
api/
  webhook.ts          # Vercel serverless endpoint（Slack Events 受信）
src/
  claude.ts           # Claude API との会話処理
  conversation.ts     # 会話履歴の管理（TTL・メッセージ数制限）
  github.ts           # GitHub Issue 作成（Octokit）
  prompt.ts           # システムプロンプト・ツール定義
  slack.ts            # Slack 署名検証・メッセージ送信
test/
  unit/               # ユニットテスト
  integration/        # 統合テスト
```

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd slack-issue-bot
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集し、以下の値を設定します。

| 変数名 | 説明 |
|---|---|
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack App の Signing Secret |
| `ANTHROPIC_API_KEY` | Anthropic API キー |
| `GITHUB_TOKEN` | GitHub Personal Access Token（repo スコープ） |
| `GITHUB_OWNER` | Issue を作成する GitHub リポジトリのオーナー |
| `GITHUB_REPO` | Issue を作成する GitHub リポジトリ名 |

### 3. Slack App の設定

1. [Slack API](https://api.slack.com/apps) で新しいアプリを作成
2. **OAuth & Permissions** で以下の Bot Token Scopes を追加:
   - `chat:write` — メッセージ送信
   - `im:history` — DM の読み取り
   - `im:read` — DM チャンネル情報の読み取り
3. **Event Subscriptions** を有効化:
   - Request URL: `https://<your-vercel-domain>/api/webhook`
   - Subscribe to bot events: `message.im`
4. アプリをワークスペースにインストール

## 開発

```bash
# ローカル開発サーバー起動
npm run dev

# 型チェック
npm run type-check
```

## テスト

```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジ付き
npm run test:coverage
```

## デプロイ

### Vercel へのデプロイ

```bash
# Vercel CLI でデプロイ
npx vercel

# 本番デプロイ
npx vercel --prod
```

Vercel ダッシュボードで環境変数（`.env` の内容）を設定してください。

デプロイ後、Slack App の **Event Subscriptions** の Request URL を更新します:

```
https://<your-vercel-domain>/api/webhook
```

### 注意事項

- `api/webhook.ts` の `maxDuration` は `vercel.json` で 30 秒に設定されています
- Slack のリトライリクエスト（`x-slack-retry-num` ヘッダー付き）は自動でスキップされます
- 会話履歴はサーバーレス関数のメモリ上に保持されるため、コールドスタート時にはリセットされます
