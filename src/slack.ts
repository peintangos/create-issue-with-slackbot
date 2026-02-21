import crypto from "node:crypto";
import { WebClient } from "@slack/web-api";

let slackClient: WebClient | null = null;

export function getSlackClient(): WebClient {
  if (!slackClient) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
    slackClient = new WebClient(token);
  }
  return slackClient;
}

export function verifySlackRequest(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 60 * 5) {
    return false;
  }

  const basestring = `v0:${timestamp}:${rawBody}`;
  const hash =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(basestring).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

export async function sendMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const client = getSlackClient();
  await client.chat.postMessage({
    channel,
    text,
    ...(threadTs && { thread_ts: threadTs }),
  });
}
