import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { IncomingMessage } from "node:http";
import { verifySlackRequest, sendMessage } from "../src/slack.js";
import { chat } from "../src/claude.js";

// Disable Vercel's automatic body parsing to get the raw body for signature verification
export const config = {
  api: { bodyParser: false },
};

interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  bot_id?: string;
  ts?: string;
}

interface SlackRequestBody {
  type: string;
  challenge?: string;
  event?: SlackEvent;
}

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    if (req.readableEnded) {
      resolve("");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve(""));
    // Safety timeout in case stream is in unexpected state
    setTimeout(() => {
      resolve(chunks.length ? Buffer.concat(chunks).toString("utf-8") : "");
    }, 2000);
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  console.log("[webhook] Received request:", {
    method: req.method,
    bodyType: typeof req.body,
    isBuffer: Buffer.isBuffer(req.body),
    hasBody: !!req.body,
    readableEnded: req.readableEnded,
    retryNum: req.headers["x-slack-retry-num"],
  });

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Ignore Slack retries
  if (req.headers["x-slack-retry-num"]) {
    console.log("[webhook] Ignoring retry:", req.headers["x-slack-retry-num"]);
    res.status(200).json({ ok: true });
    return;
  }

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.log("[webhook] Error: SLACK_SIGNING_SECRET is not set");
    res.status(500).json({ error: "SLACK_SIGNING_SECRET is not set" });
    return;
  }

  // Try to read raw body from stream first (works when bodyParser is disabled)
  let rawBody = await readRawBody(req);
  let bodySource = "stream";

  if (!rawBody) {
    // Fallback: bodyParser was not disabled, use req.body
    if (typeof req.body === "string") {
      rawBody = req.body;
      bodySource = "string";
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString("utf-8");
      bodySource = "Buffer";
    } else if (req.body) {
      rawBody = JSON.stringify(req.body);
      bodySource = "JSON.stringify (may cause signature mismatch)";
    } else {
      console.log("[webhook] Error: no body available");
      res.status(400).json({ error: "No body" });
      return;
    }
  }

  console.log("[webhook] Body source:", bodySource, "length:", rawBody.length);

  const timestamp = req.headers["x-slack-request-timestamp"] as string;
  const signature = req.headers["x-slack-signature"] as string;

  const isValid = !!(timestamp && signature && verifySlackRequest(signingSecret, timestamp, rawBody, signature));
  console.log("[webhook] Signature verification:", { hasTimestamp: !!timestamp, hasSignature: !!signature, isValid });

  if (!isValid) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const body: SlackRequestBody = JSON.parse(rawBody);
  console.log("[webhook] Body type:", body.type, "event type:", body.event?.type);

  // Handle Slack URL verification challenge
  if (body.type === "url_verification") {
    console.log("[webhook] Responding to URL verification challenge");
    res.status(200).json({ challenge: body.challenge });
    return;
  }

  // Handle event callbacks
  if (body.type === "event_callback" && body.event) {
    const event = body.event;
    console.log("[webhook] Event:", { type: event.type, channel_type: event.channel_type, user: event.user, bot_id: event.bot_id, hasText: !!event.text });

    // Only handle DM messages from users (not from bots)
    if (
      event.type === "message" &&
      event.channel_type === "im" &&
      event.text &&
      event.user &&
      !event.bot_id
    ) {
      console.log("[webhook] Processing DM from user:", event.user);
      try {
        const reply = await chat(event.user, event.text);
        console.log("[webhook] Claude reply length:", reply.length);
        await sendMessage(event.channel!, reply);
        console.log("[webhook] Reply sent to Slack");
      } catch (error) {
        console.error("[webhook] Error processing message:", error);
        try {
          await sendMessage(
            event.channel!,
            "エラーが発生しました。しばらくしてからもう一度お試しください。"
          );
        } catch {
          console.error("[webhook] Failed to send error reply");
        }
      }
    }
  }

  console.log("[webhook] Responding 200 OK");
  res.status(200).json({ ok: true });
}
