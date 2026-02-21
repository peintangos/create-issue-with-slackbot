import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    issues = { create: mockCreate };
  },
}));

// Set required env vars BEFORE the dynamic import (github.ts reads owner/repo at module level)
vi.stubEnv("GITHUB_OWNER", "test-owner");
vi.stubEnv("GITHUB_REPO", "test-repo");
vi.stubEnv("GITHUB_TOKEN", "ghp_test_token");

const { createIssue } = await import("../../src/github.js");

describe("createIssue", () => {
  beforeEach(() => {
    // Re-stub GITHUB_TOKEN since unstubEnvs clears stubs after each test.
    // GITHUB_TOKEN is read lazily in getOctokit(), not at module level.
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token");
  });

  it("should pass owner, repo, title, body, and labels to Octokit", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { html_url: "https://github.com/test-owner/test-repo/issues/42", number: 42 },
    });

    const result = await createIssue({
      title: "Bug report",
      body: "Something is broken",
      labels: ["bug"],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      title: "Bug report",
      body: "Something is broken",
      labels: ["bug"],
    });
    expect(result).toEqual({
      url: "https://github.com/test-owner/test-repo/issues/42",
      number: 42,
    });
  });

  it("should pass undefined labels when not provided", async () => {
    mockCreate.mockResolvedValueOnce({
      data: { html_url: "https://github.com/test-owner/test-repo/issues/43", number: 43 },
    });

    await createIssue({ title: "Feature", body: "A new feature" });

    expect(mockCreate).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      title: "Feature",
      body: "A new feature",
      labels: undefined,
    });
  });

  it("should propagate Octokit errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Not Found"));

    await expect(
      createIssue({ title: "x", body: "y" })
    ).rejects.toThrow("Not Found");
  });
});
