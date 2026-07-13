export type ChangeAnalyzerOutput = {
  summary: string;
  features_added: string[];
  apis_changed: string[];
  breaking_changes: string[];
  doc_update_likelihood: number;
};

export type DocImpactOutput = {
  needs_update: boolean;
  files: string[];
  reasons: string[];
};

export type DocReviewerOutput = {
  approved: boolean;
  confidence: number;
  issues: string[];
};

export type ChangedFile = {
  path: string;
  status: string;
};

export type ChangeAnalyzerInput = {
  commitMessage: string;
  changedFiles: ChangedFile[];
  gitDiff: string;
};

export type DocsMappingInput = {
  source: string;
  target: string;
};

export type DocImpactInput = {
  analysis: ChangeAnalyzerOutput;
  docsMappings: DocsMappingInput[];
};

export type DocWriterInput = {
  analysis: ChangeAnalyzerOutput;
  impact: DocImpactOutput;
  currentContent: string;
  targetDoc: string;
  reviewerIssues?: string[];
};

export type DocReviewerInput = {
  analysis: ChangeAnalyzerOutput;
  impact: DocImpactOutput;
  originalContent: string;
  generatedContent: string;
};

export type SourceRepositoryContext = {
  owner: string;
  repo: string;
  beforeSha: string;
  token: string;
  apiUrl: string;
  serverUrl: string;
  runId: string;
};

export type CommitMetadata = {
  sha: string;
  message: string;
  source: SourceRepositoryContext;
  workflowRunUrl?: string;
};