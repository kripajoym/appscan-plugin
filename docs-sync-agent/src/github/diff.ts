import type { ChangeAnalyzerInput, ChangedFile, CommitMetadata } from "../schemas/contracts.js";

type GitHubFile = {
  filename: string;
  status: string;
  patch?: string;
};

type CompareResponse = {
  files?: GitHubFile[];
};

type CommitResponse = {
  files?: GitHubFile[];
};

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json"
  };
}

async function requestJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token)
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${url}: ${text}`);
  }

  return JSON.parse(text) as T;
}

function isZeroSha(value: string): boolean {
  return /^0+$/.test(value);
}

function toChangedFile(file: GitHubFile): ChangedFile {
  return {
    path: file.filename,
    status: file.status
  };
}

function buildUnifiedDiff(files: GitHubFile[]): string {
  return files
    .map((file) => {
      const patch = file.patch ?? "";
      return [`diff --git a/${file.filename} b/${file.filename}`, patch].join("\n").trim();
    })
    .filter((block) => block.length > 0)
    .join("\n\n");
}

export async function buildDiffContext(commit: CommitMetadata): Promise<ChangeAnalyzerInput> {
  const { owner, repo, beforeSha, token, apiUrl } = commit.source;

  let files: GitHubFile[] = [];

  if (beforeSha && !isZeroSha(beforeSha)) {
    const compareUrl = `${apiUrl}/repos/${owner}/${repo}/compare/${beforeSha}...${commit.sha}`;
    const compare = await requestJson<CompareResponse>(compareUrl, token);
    files = compare.files ?? [];
  } else {
    const commitUrl = `${apiUrl}/repos/${owner}/${repo}/commits/${commit.sha}`;
    const details = await requestJson<CommitResponse>(commitUrl, token);
    files = details.files ?? [];
  }

  return {
    commitMessage: commit.message,
    changedFiles: files.map(toChangedFile),
    gitDiff: buildUnifiedDiff(files)
  };
}