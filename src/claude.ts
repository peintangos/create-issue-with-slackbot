import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, TOOL_DEFINITION } from "./prompt.js";
import { createIssue } from "./github.js";
import { getMessages, addMessage } from "./conversation.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export async function chat(
  userId: string,
  userMessage: string
): Promise<string> {
  const anthropic = getClient();

  addMessage(userId, { role: "user", content: userMessage });

  const messages = getMessages(userId);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_DEFINITION],
    messages,
  });

  // Process tool use if requested
  if (response.stop_reason === "tool_use") {
    const toolBlock = response.content.find(
      (block) => block.type === "tool_use"
    );

    if (toolBlock && toolBlock.type === "tool_use") {
      addMessage(userId, { role: "assistant", content: response.content });

      const input = toolBlock.input as {
        title: string;
        body: string;
        labels?: string[];
      };

      try {
        const issue = await createIssue(input);
        const toolResult = `Issue #${issue.number} を作成しました: ${issue.url}`;

        addMessage(userId, {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: toolResult,
            },
          ],
        });

        const finalResponse = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: [TOOL_DEFINITION],
          messages: getMessages(userId),
        });

        const finalText = finalResponse.content
          .filter((block) => block.type === "text")
          .map((block) => (block as Anthropic.TextBlock).text)
          .join("");

        addMessage(userId, {
          role: "assistant",
          content: finalResponse.content,
        });

        return finalText || toolResult;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        addMessage(userId, {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: `Error: ${errorMsg}`,
              is_error: true,
            },
          ],
        });

        return `Issue の作成に失敗しました: ${errorMsg}`;
      }
    }
  }

  // Normal text response
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.TextBlock).text)
    .join("");

  addMessage(userId, { role: "assistant", content: response.content });

  return text || "（応答を生成できませんでした）";
}
