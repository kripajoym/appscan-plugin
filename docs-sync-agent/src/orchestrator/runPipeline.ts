import type { ChangeAnalyzerOutput, DocImpactOutput } from "../schemas/contracts.js";
import { AgentRuntime, type DocsSyncAgents } from "../agents/registry.js";
import { buildDiffContext } from "../github/diff.js";
import { getCommitMetadata } from "../github/commit.js";
import { createFallbackIssue, ensureBranch, getDocsRepoCoordinates, getFileContent, upsertFile } from "../github/repos.js";
import { buildPullRequestDraft, createOrUpdatePullRequest } from "../github/pr.js";
import { docsMappings } from "../config/docsMap.js";

function getConfidenceThreshold(): number {
  const raw = process.env.CONFIDENCE_THRESHOLD ?? "0.75";
  const parsed = Number(raw);

  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid CONFIDENCE_THRESHOLD value: ${raw}`);
  }

  return parsed;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getAllowedDocTargets(): string[] {
  return docsMappings.map((mapping) => mapping.target);
}

async function generateAndReviewDoc(input: {
  agents: DocsSyncAgents;
  analysis: ChangeAnalyzerOutput;
  impact: DocImpactOutput;
  currentContent: string;
  targetDoc: string;
  confidenceThreshold: number;
}): Promise<{ approved: boolean; content: string; confidence: number; issues: string[] }> {
  let content = (await input.agents.docWriter.invoke({
    analysis: input.analysis,
    impact: input.impact,
    currentContent: input.currentContent,
    targetDoc: input.targetDoc
  })).content;

  let review = await input.agents.docReviewer.invoke({
    analysis: input.analysis,
    impact: input.impact,
    originalContent: input.currentContent,
    generatedContent: content
  });

  if (review.approved && review.confidence >= input.confidenceThreshold) {
    return {
      approved: true,
      content,
      confidence: review.confidence,
      issues: review.issues
    };
  }

  content = (await input.agents.docWriter.invoke({
    analysis: input.analysis,
    impact: input.impact,
    currentContent: input.currentContent,
    targetDoc: input.targetDoc,
    reviewerIssues: review.issues
  })).content;

  review = await input.agents.docReviewer.invoke({
    analysis: input.analysis,
    impact: input.impact,
    originalContent: input.currentContent,
    generatedContent: content
  });

  return {
    approved: review.approved && review.confidence >= input.confidenceThreshold,
    content,
    confidence: review.confidence,
    issues: review.issues
  };
}

async function main() {
  const agentRuntime = new AgentRuntime();
  const agents = agentRuntime.createDocsSyncAgents();
  const commit = getCommitMetadata();
  const diffContext = await buildDiffContext(commit);
  const analysis = await agents.changeAnalyzer.invoke(diffContext);
  const impact = await agents.docImpact.invoke({ analysis, docsMappings });
  const confidenceThreshold = getConfidenceThreshold();
  const docsRepo = getDocsRepoCoordinates();
  const allowedTargets = new Set(getAllowedDocTargets());
  const targetFiles = unique(impact.files.filter((file) => allowedTargets.has(file)));

  if (!impact.needs_update || targetFiles.length === 0) {
    console.log(
      JSON.stringify({ status: "no-op", commit, diffContext, analysis, impact, agentLifecycle: agentRuntime.getLifecycle() }, null, 2)
    );
    return;
  }

  const branch = `auto/docs-sync/${commit.sha.slice(0, 7)}`;
  await ensureBranch(docsRepo, branch);

  const updatedFiles: string[] = [];
  let minConfidence = 1;

  for (const targetDoc of targetFiles) {
    const existing = await getFileContent(docsRepo, targetDoc, branch);
    const currentContent = existing?.content ?? "";
    const evaluated = await generateAndReviewDoc({
      agents,
      analysis,
      impact,
      currentContent,
      targetDoc,
      confidenceThreshold
    });

    if (!evaluated.approved) {
      const fallbackIssue = await createFallbackIssue(docsRepo, {
        title: `docs-sync requires human review (${commit.sha.slice(0, 7)})`,
        body: [
          `Source commit: ${commit.sha}`,
          `Target file: ${targetDoc}`,
          `Confidence: ${evaluated.confidence.toFixed(2)}`,
          "",
          "Reviewer issues:",
          ...(evaluated.issues.length > 0 ? evaluated.issues.map((issue) => `- ${issue}`) : ["- No explicit issues returned."])
        ].join("\n")
      });

      console.log(
        JSON.stringify(
          {
            status: "requires-human-review",
            commit,
            targetDoc,
            confidence: evaluated.confidence,
            issues: evaluated.issues,
            fallbackIssue,
            agentLifecycle: agentRuntime.getLifecycle()
          },
          null,
          2
        )
      );
      return;
    }

    if (evaluated.content !== currentContent) {
      await upsertFile(docsRepo, {
        branch,
        path: targetDoc,
        content: evaluated.content,
        message: `docs: sync for commit ${commit.sha}`
      });
      updatedFiles.push(targetDoc);
    }

    minConfidence = Math.min(minConfidence, evaluated.confidence);
  }

  if (updatedFiles.length === 0) {
    console.log(
      JSON.stringify({ status: "no-op-after-review", commit, targetFiles, agentLifecycle: agentRuntime.getLifecycle() }, null, 2)
    );
    return;
  }

  const prDraft = buildPullRequestDraft({
    commitSha: commit.sha,
    changedFiles: updatedFiles,
    confidence: minConfidence,
    workflowRunUrl: commit.workflowRunUrl
  });

  const pullRequest = await createOrUpdatePullRequest({
    apiUrl: docsRepo.apiUrl,
    owner: docsRepo.owner,
    repo: docsRepo.repo,
    token: docsRepo.token,
    draft: {
      ...prDraft,
      head: branch
    }
  });

  console.log(JSON.stringify({ status: "ready", prDraft, pullRequest, updatedFiles, minConfidence, agentLifecycle: agentRuntime.getLifecycle() }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});