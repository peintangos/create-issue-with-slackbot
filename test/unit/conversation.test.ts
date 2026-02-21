import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMessages, addMessage, clearConversation } from "../../src/conversation.js";

// Each test needs a unique userId to avoid state leaking between tests
let uid = 0;
function uniqueUser(): string {
  return `user-${++uid}-${Date.now()}`;
}

describe("conversation", () => {
  describe("getMessages", () => {
    it("should return an empty array for an unknown user", () => {
      expect(getMessages(uniqueUser())).toEqual([]);
    });
  });

  describe("addMessage / getMessages round-trip", () => {
    it("should store and retrieve messages", () => {
      const user = uniqueUser();
      addMessage(user, { role: "user", content: "hello" });
      addMessage(user, { role: "assistant", content: "hi" });

      const msgs = getMessages(user);
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual({ role: "user", content: "hello" });
      expect(msgs[1]).toEqual({ role: "assistant", content: "hi" });
    });
  });

  describe("TTL expiry", () => {
    it("should return an empty array when TTL (30 min) has elapsed", () => {
      vi.useFakeTimers();
      try {
        const user = uniqueUser();
        addMessage(user, { role: "user", content: "test" });

        // Advance 31 minutes
        vi.advanceTimersByTime(31 * 60 * 1000);

        expect(getMessages(user)).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should return messages within TTL", () => {
      vi.useFakeTimers();
      try {
        const user = uniqueUser();
        addMessage(user, { role: "user", content: "test" });

        // Advance 29 minutes (within TTL)
        vi.advanceTimersByTime(29 * 60 * 1000);

        expect(getMessages(user)).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("message limit (20)", () => {
    it("should keep only the last 20 messages when more are added", () => {
      const user = uniqueUser();
      for (let i = 0; i < 21; i++) {
        addMessage(user, { role: "user", content: `msg-${i}` });
      }

      const msgs = getMessages(user);
      expect(msgs).toHaveLength(20);
      // First message (msg-0) should have been trimmed
      expect(msgs[0]).toEqual({ role: "user", content: "msg-1" });
      expect(msgs[19]).toEqual({ role: "user", content: "msg-20" });
    });
  });

  describe("addMessage resets TTL", () => {
    it("should reset the TTL when a new message is added", () => {
      vi.useFakeTimers();
      try {
        const user = uniqueUser();
        addMessage(user, { role: "user", content: "first" });

        // Advance 25 minutes
        vi.advanceTimersByTime(25 * 60 * 1000);

        // Add another message — this resets updatedAt
        addMessage(user, { role: "user", content: "second" });

        // Advance another 25 minutes (50 min total, but only 25 since last add)
        vi.advanceTimersByTime(25 * 60 * 1000);

        expect(getMessages(user)).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("clearConversation", () => {
    it("should remove all messages for a user", () => {
      const user = uniqueUser();
      addMessage(user, { role: "user", content: "hello" });
      clearConversation(user);
      expect(getMessages(user)).toEqual([]);
    });

    it("should not throw for a non-existent user", () => {
      expect(() => clearConversation(uniqueUser())).not.toThrow();
    });
  });
});
