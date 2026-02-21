# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド

```bash
npm test                  # 全テスト実行 (vitest)
npm run test:watch        # ウォッチモードでテスト実行
npm run test:coverage     # カバレッジ付きテスト実行
npx vitest run test/unit/slack.test.ts   # 単一テストファイル実行
npm run type-check        # TypeScript 型チェック (tsc --noEmit)
npm run build             # TypeScript コンパイル
npm run dev               # ローカル開発サーバー (vercel dev)
```

## アーキテクチャ

Slack DM で受けたアイデアを Claude AI で深掘りし、GitHub Issue を自動作成するボット。Vercel サーバーレス関数として単一エンドポイントでデプロイされる。

**リクエストフロー:** Slack Event → `api/webhook.ts`（署名検証・イベント振り分け）→ `src/claude.ts`（Claude API との会話 + ツール使用）→ `src/github.ts`（Octokit で Issue 作成）→ Slack に返信

設計上の要点:
- `api/webhook.ts` は Vercel の body parser を無効化（`bodyParser: false`）し、Slack HMAC 署名検証のために生のリクエストボディを取得する。ストリームから読み取り、失敗時は `req.body` にフォールバックする。
- `src/conversation.ts` はユーザーごとの会話履歴をインメモリ Map で保持する。TTL 30分、最大20メッセージ。コールドスタート時にリセットされる。
- `src/claude.ts` は Claude のツール使用ループを処理する。`stop_reason: "tool_use"` の場合、`createIssue` を実行し、ツール結果を送り返して2回目の API 呼び出しで最終応答を得る。
- `src/github.ts` は `GITHUB_OWNER`/`GITHUB_REPO` をモジュールレベルで読み取る（未設定時は import 時にエラー）。`GITHUB_TOKEN` は遅延読み取り。
- 外部クライアント（Anthropic, Octokit, Slack WebClient）はすべて遅延シングルトンで初期化される。

## テスト

vitest を使用。`restoreMocks: true` と `unstubEnvs: true` により、各テスト後にモックと環境変数スタブが自動クリーンアップされる。

副作用のあるモジュール（例: `github.ts` はモジュールレベルで環境変数を検証する）をインポートするテストでは、動的 `await import()` の前にトップレベルで `vi.stubEnv()` を呼ぶ。遅延読み取りされる環境変数（`GITHUB_TOKEN` など）は `unstubEnvs` で毎テスト後にクリアされるため、`beforeEach` でも再スタブが必要。

`webhook.ts` の統合テストでは、モックリクエストオブジェクトに `readableEnded: true` を設定して生ボディストリームをスキップし、`req.body` 文字列フォールバックパスを使用する。

## プロジェクト言語

システムプロンプトとユーザー向けメッセージは日本語。コード・コメント・コミットメッセージは日本語・英語どちらでもよい。
