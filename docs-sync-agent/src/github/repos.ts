type GitReference = {
  object: {
    sha: string;
  };
};

type ContentResponse = {
  sha: string;
  encoding: string;
  content: string;
};

type PullRequestIssueResponse = {
  number: number;
  html_url: string;
};

export type DocsRepoCoordinates = {
  owner: string;
  repo: string;
  baseBranch: string;
  token: string;
  apiUrl: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json"
  };
}

function encodeContentPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function getDocsRepoCoordinates(): DocsRepoCoordinates {
  return {
    owner: getRequiredEnv("DOCS_REPO_OWNER"),
    repo: getRequiredEnv("DOCS_REPO_NAME"),
    baseBranch: process.env.DOCS_BASE_BRANCH ?? "main",
    token: getRequiredEnv("DOCS_REPO_TOKEN"),
    apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com"
  };
}

export async function ensureBranch(repo: DocsRepoCoordinates, branch: string): Promise<void> {
  const branchUrl = `${repo.apiUrl}/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const existing = await requestText(branchUrl, {
    method: "GET",
    token: repo.token
  });

  if (existing.ok) {
    return;
  }

  if (existing.status !== 404) {
    throw new Error(`Failed checking branch ${branch}: ${existing.text}`);
  }

  const baseRefUrl = `${repo.apiUrl}/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(repo.baseBranch)}`;
  const baseRef = await requestText(baseRefUrl, {
    method: "GET",
    token: repo.token
  });

  if (!baseRef.ok) {
    throw new Error(`Failed reading base branch ${repo.baseBranch}: ${baseRef.text}`);
  }

  const parsedBase = JSON.parse(baseRef.text) as GitReference;
  const createRefUrl = `${repo.apiUrl}/repos/${repo.owner}/${repo.repo}/git/refs`;
  const create = await requestText(createRefUrl, {
    method: "POST",
    token: repo.token,
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: parsedBase.object.sha
    })
  });

  if (!create.ok && create.status !== 422) {
    throw new Error(`Failed creating branch ${branch}: ${create.text}`);
  }
}

export async function getFileContent(repo: DocsRepoCoordinates, path: string, branch: string): Promise<{ sha: string; content: string } | null> {
  const url = `${repo.apiUrl}/repos/${repo.owner}/${repo.repo}/contents/${encodeContentPath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await requestText(url, {
    method: "GET",
    token: repo.token
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed reading file ${path} in ${branch}: ${response.text}`);
  }

  const data = JSON.parse(response.text) as ContentResponse;
  if (data.encoding !== "base64") {
    throw new Error(`Unsupported encoding for ${path}: ${data.encoding}`);
  }

  return {
    sha: data.sha,
    content: base64ToUtf8(data.content)
  };
}

export async function upsertFile(repo: DocsRepoCoordinates, input: {
  branch: string;
  path: string;
  content: string;
  message: string;
}): Promise<void> {
  const existing = await getFileContent(repo, input.path, input.branch);
  const url = `${repo.apiUrl}/repos/${repo.owner}/${repo.repo}/contents/${encodeContentPath(input.path)}`;
  const payload: {
    message: string;
    content: string;
    branch: string;
    sha?: string;
  } = {
    message: input.message,
    content: utf8ToBase64(input.content),
    branch: input.branch
  };

  if (existing?.sha) {
    payload.sha = existing.sha;
  }

  const response = await requestText(url, {
    method: "PUT",
    token: repo.token,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed writing ${input.path}: ${response.text}`);
  }
}

export async function createFallbackIssue(repo: DocsRepoCoordinates, input: {
  title: string;
  body: string;
}): Promise<PullRequestIssueResponse> {
  const url = `${repo.apiUrl}/repos/${repo.owner}/${repo.repo}/issues`;
  const response = await requestText(url, {
    method: "POST",
    token: repo.token,
    body: JSON.stringify({
      title: input.title,
      body: input.body
    })
  });

  if (!response.ok) {
    throw new Error(`Failed creating fallback issue: ${response.text}`);
  }

  return JSON.parse(response.text) as PullRequestIssueResponse;
}