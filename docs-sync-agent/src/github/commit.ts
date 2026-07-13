import type { CommitMetadata } from "../schemas/contracts.js";

function getRequiredEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function splitRepository(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository value: ${fullName}`);
  }

  return {
    owner: parts[0],
    repo: parts[1]
  };
}

export function getCommitMetadata(): CommitMetadata {
  const sha = getRequiredEnv("COMMIT_SHA");
  const message = process.env.COMMIT_MESSAGE ?? "";
  const sourceRepository = getRequiredEnv("SOURCE_REPOSITORY");
  const source = splitRepository(sourceRepository);
  const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runId = process.env.GITHUB_RUN_ID ?? "";

  return {
    sha,
    message,
    source: {
      owner: source.owner,
      repo: source.repo,
      beforeSha: process.env.SOURCE_BEFORE_SHA ?? "",
      token: getRequiredEnv("GITHUB_TOKEN"),
      apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
      serverUrl,
      runId
    },
    workflowRunUrl: runId ? `${serverUrl}/${sourceRepository}/actions/runs/${runId}` : undefined
  };
}