import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMessagesCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
  },
}));

const mockCreateIssue = vi.fn();
vi.mock("../../src/github.js", () => ({
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
}));

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

const { chat } = await import("../../src/claude.js");
const { clearConversation } = await import("../../src/conversation.js");

describe("chat", () => {
  beforeEach(() => {
    clearConversation("test-user");
    mockMessagesCreate.mockReset();
    mockCreateIssue.mockReset();
  });

  it("should return text from a normal response", async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Hello! How can I help?" }],
    });

    const result = await chat("test-user", "Hi");

    expect(result).toBe("Hello! How can I help?");
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it("should return fallback text for an empty response", async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [],
    });

    const result = await chat("test-user", "Hi");

    expect(result).toBe("（応答を生成できませんでした）");
  });

  it("should handle tool_use flow (create issue)", async () => {
    // First call: Claude decides to use the tool
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Issueを作成します。" },
        {
          type: "tool_use",
          id: "tool_123",
          name: "create_github_issue",
          input: { title: "Test Issue", body: "Issue body", labels: ["bug"] },
        },
      ],
    });

    // Mock createIssue success
    mockCreateIssue.mockResolvedValueOnce({
      url: "https://github.com/owner/repo/issues/1",
      number: 1,
    });

    // Second call: Claude responds after tool result
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Issue #1 を作成しました!" }],
    });

    const result = await chat("test-user", "起票して");

    expect(result).toBe("Issue #1 を作成しました!");
    expect(mockCreateIssue).toHaveBeenCalledWith({
      title: "Test Issue",
      body: "Issue body",
      labels: ["bug"],
    });
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it("should return error message when createIssue fails", async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tool_456",
          name: "create_github_issue",
          input: { title: "Fail", body: "Body" },
        },
      ],
    });

    mockCreateIssue.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await chat("test-user", "起票して");

    expect(result).toBe("Issue の作成に失敗しました: API rate limit");
  });
});
