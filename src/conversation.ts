import type Anthropic from "@anthropic-ai/sdk";

type Message = Anthropic.MessageParam;

interface ConversationEntry {
  messages: Message[];
  updatedAt: number;
}

const conversations = new Map<string, ConversationEntry>();

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getMessages(userId: string): Message[] {
  const entry = conversations.get(userId);
  if (!entry) return [];
  if (Date.now() - entry.updatedAt > TTL_MS) {
    conversations.delete(userId);
    return [];
  }
  return entry.messages;
}

export function addMessage(userId: string, message: Message): void {
  const entry = conversations.get(userId) || {
    messages: [],
    updatedAt: Date.now(),
  };
  entry.messages.push(message);
  entry.updatedAt = Date.now();
  // Keep last 20 messages to stay within token limits
  if (entry.messages.length > 20) {
    entry.messages = entry.messages.slice(-20);
  }
  conversations.set(userId, entry);
}

export function clearConversation(userId: string): void {
  conversations.delete(userId);
}
