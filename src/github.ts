import { Octokit } from "@octokit/rest";

const owner: string = process.env.GITHUB_OWNER ?? "";
const repo: string = process.env.GITHUB_REPO ?? "";
if (!owner || !repo) throw new Error("GITHUB_OWNER and GITHUB_REPO must be set");

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is not set");
    octokit = new Octokit({ auth: token });
  }
  return octokit;
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
}

export async function createIssue(
  params: CreateIssueParams
): Promise<{ url: string; number: number }> {
  const client = getOctokit();
  const response = await client.issues.create({
    owner,
    repo,
    title: params.title,
    body: params.body,
    labels: params.labels,
  });
  return {
    url: response.data.html_url,
    number: response.data.number,
  };
}
