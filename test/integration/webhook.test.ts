import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Use vi.hoisted to ensure mock fns exist before vi.mock hoisting
const { mockVerifySlackRequest, mockSendMessage, mockChat } = vi.hoisted(() => ({
  mockVerifySlackRequest: vi.fn(),
  mockSendMessage: vi.fn(),
  mockChat: vi.fn(),
}));

vi.mock("../../src/slack.js", () => ({
  verifySlackRequest: mockVerifySlackRequest,
  sendMessage: mockSendMessage,
  getSlackClient: vi.fn(),
}));

vi.mock("../../src/claude.js", () => ({
  chat: mockChat,
}));

vi.stubEnv("SLACK_SIGNING_SECRET", "test_secret");
vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");

const { default: handler } = await import("../../api/webhook.js");

/** Create a mock VercelRequest */
function mockReq(overrides: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): VercelRequest {
  return {
    method: overrides.method ?? "POST",
    headers: {
      "x-slack-request-timestamp": "1234567890",
      "x-slack-signature": "v0=valid",
      ...overrides.headers,
    },
    body: overrides.body ?? {},
    readableEnded: true, // Skip rawBody stream, use req.body fallback
    on: vi.fn(),
  } as unknown as VercelRequest;
}

/** Create a mock VercelResponse with chainable status/json */
function mockRes(): VercelResponse & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res as unknown as VercelResponse & { _status: number; _json: unknown };
}

describe("webhook handler", () => {
  beforeEach(() => {
    vi.stubEnv("SLACK_SIGNING_SECRET", "test_secret");
    mockVerifySlackRequest.mockReset();
    mockSendMessage.mockReset();
    mockChat.mockReset();
    mockVerifySlackRequest.mockReturnValue(true);
    mockSendMessage.mockResolvedValue(undefined);
  });

  it("should return 405 for non-POST requests", async () => {
    const req = mockReq({ method: "GET" });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it("should return 200 and skip processing for retry headers", async () => {
    const req = mockReq({
      headers: { "x-slack-retry-num": "1" },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("should return 500 when SLACK_SIGNING_SECRET is not set", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", "");
    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });

  it("should return 401 when signature verification fails", async () => {
    mockVerifySlackRequest.mockReturnValue(false);
    const req = mockReq({
      body: '{"type":"event_callback"}',
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("should respond with challenge for url_verification", async () => {
    const req = mockReq({
      body: JSON.stringify({
        type: "url_verification",
        challenge: "abc123",
      }),
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ challenge: "abc123" });
  });

  it("should call chat and sendMessage for a DM message", async () => {
    mockChat.mockResolvedValueOnce("Claude says hi");

    const req = mockReq({
      body: JSON.stringify({
        type: "event_callback",
        event: {
          type: "message",
          channel_type: "im",
          text: "hello",
          user: "U123",
          channel: "D456",
        },
      }),
    });
    const res = mockRes();
    await handler(req, res);

    expect(mockChat).toHaveBeenCalledWith("U123", "hello");
    expect(mockSendMessage).toHaveBeenCalledWith("D456", "Claude says hi");
    expect(res._status).toBe(200);
  });

  it("should not call chat when bot_id is present", async () => {
    const req = mockReq({
      body: JSON.stringify({
        type: "event_callback",
        event: {
          type: "message",
          channel_type: "im",
          text: "hello",
          user: "U123",
          channel: "D456",
          bot_id: "B789",
        },
      }),
    });
    const res = mockRes();
    await handler(req, res);

    expect(mockChat).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it("should not call chat when channel_type is not im", async () => {
    const req = mockReq({
      body: JSON.stringify({
        type: "event_callback",
        event: {
          type: "message",
          channel_type: "channel",
          text: "hello",
          user: "U123",
          channel: "C456",
        },
      }),
    });
    const res = mockRes();
    await handler(req, res);

    expect(mockChat).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it("should send error message to Slack when chat throws", async () => {
    mockChat.mockRejectedValueOnce(new Error("Claude API error"));

    const req = mockReq({
      body: JSON.stringify({
        type: "event_callback",
        event: {
          type: "message",
          channel_type: "im",
          text: "hello",
          user: "U123",
          channel: "D456",
        },
      }),
    });
    const res = mockRes();
    await handler(req, res);

    expect(mockSendMessage).toHaveBeenCalledWith(
      "D456",
      "エラーが発生しました。しばらくしてからもう一度お試しください。"
    );
    expect(res._status).toBe(200);
  });
});
