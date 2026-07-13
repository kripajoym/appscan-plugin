export type PullRequestDraft = {
  title: string;
  body: string;
  head: string;
  base: string;
};

type PullRequestResponse = {
  number: number;
  html_url: string;
};

function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json"
  };
}

async function requestText(url: string, init: {
  method: string;
  token: string;
  body?: string;
}): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    method: init.method,
    headers: getHeaders(init.token),
    body: init.body
  });

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text()
  };
}

export function buildPullRequestDraft(input: {
  commitSha: string;
  changedFiles: string[];
  confidence: number;
  workflowRunUrl?: string;
}): PullRequestDraft {
  const bodyLines = [
    `Source commit: ${input.commitSha}`,
    `Changed files: ${input.changedFiles.join(", ")}`,
    `Confidence score: ${input.confidence.toFixed(2)}`
  ];

  if (input.workflowRunUrl) {
    bodyLines.push(`Workflow run: ${input.workflowRunUrl}`);
  }

  return {
    title: `docs: sync for commit ${input.commitSha.slice(0, 7)}`,
    body: bodyLines.join("\n"),
    head: `auto/docs-sync/${input.commitSha.slice(0, 7)}`,
    base: process.env.DOCS_BASE_BRANCH ?? "main"
  };
}

export async function createOrUpdatePullRequest(input: {
  apiUrl: string;
  owner: string;
  repo: string;
  token: string;
  draft: PullRequestDraft;
}): Promise<PullRequestResponse> {
  const queryUrl = `${input.apiUrl}/repos/${input.owner}/${input.repo}/pulls?state=open&head=${encodeURIComponent(
    `${input.owner}:${input.draft.head}`
  )}&base=${encodeURIComponent(input.draft.base)}`;
  const existing = await requestText(queryUrl, {
    method: "GET",
    token: input.token
  });

  if (!existing.ok) {
    throw new Error(`Failed querying pull requests: ${existing.text}`);
  }

  const pulls = JSON.parse(existing.text) as PullRequestResponse[];
  if (pulls.length > 0) {
    const updateUrl = `${input.apiUrl}/repos/${input.owner}/${input.repo}/pulls/${pulls[0].number}`;
    const updated = await requestText(updateUrl, {
      method: "PATCH",
      token: input.token,
      body: JSON.stringify({
        title: input.draft.title,
        body: input.draft.body,
        base: input.draft.base
      })
    });

    if (!updated.ok) {
      throw new Error(`Failed updating pull request: ${updated.text}`);
    }

    return JSON.parse(updated.text) as PullRequestResponse;
  }

  const createUrl = `${input.apiUrl}/repos/${input.owner}/${input.repo}/pulls`;
  const created = await requestText(createUrl, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      title: input.draft.title,
      body: input.draft.body,
      head: input.draft.head,
      base: input.draft.base
    })
  });

  if (!created.ok) {
    throw new Error(`Failed creating pull request: ${created.text}`);
  }

  return JSON.parse(created.text) as PullRequestResponse;
}