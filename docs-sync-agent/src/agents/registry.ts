import type {
  ChangeAnalyzerInput,
  ChangeAnalyzerOutput,
  DocImpactInput,
  DocImpactOutput,
  DocReviewerInput,
  DocReviewerOutput,
  DocWriterInput
} from "../schemas/contracts.js";
import { runJsonAgent } from "../llm/openaiAgent.js";

export type AgentName = "change-analyzer" | "doc-impact" | "doc-writer" | "doc-reviewer";
export type AgentLifecycleType = "created" | "invoked" | "completed" | "failed";

type AgentMetadataValue = string | number | boolean;

export type AgentLifecycleEvent = {
  agent: AgentName;
  event: AgentLifecycleType;
  timestamp: string;
  metadata?: Record<string, AgentMetadataValue>;
};

type JsonAgentConfig<TInput, TOutput> = {
  name: AgentName;
  model: string;
  systemPrompt: string;
};

export type JsonAgent<TInput, TOutput> = {
  name: AgentName;
  model: string;
  invoke: (input: TInput) => Promise<TOutput>;
};

export type DocsSyncAgents = {
  changeAnalyzer: JsonAgent<ChangeAnalyzerInput, ChangeAnalyzerOutput>;
  docImpact: JsonAgent<DocImpactInput, DocImpactOutput>;
  docWriter: JsonAgent<DocWriterInput, { content: string }>;
  docReviewer: JsonAgent<DocReviewerInput, DocReviewerOutput>;
};

function toTimestamp(): string {
  return new Date().toISOString();
}

function outputSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

export class AgentRuntime {
  private events: AgentLifecycleEvent[] = [];

  private record(event: AgentLifecycleEvent): void {
    this.events.push(event);
  }

  private createJsonAgent<TInput, TOutput>(config: JsonAgentConfig<TInput, TOutput>): JsonAgent<TInput, TOutput> {
    this.record({
      agent: config.name,
      event: "created",
      timestamp: toTimestamp(),
      metadata: {
        model: config.model
      }
    });

    return {
      name: config.name,
      model: config.model,
      invoke: async (input: TInput): Promise<TOutput> => {
        this.record({
          agent: config.name,
          event: "invoked",
          timestamp: toTimestamp()
        });

        try {
          const response = await runJsonAgent<TOutput>({
            model: config.model,
            systemPrompt: config.systemPrompt,
            userPrompt: JSON.stringify(input, null, 2)
          });

          this.record({
            agent: config.name,
            event: "completed",
            timestamp: toTimestamp(),
            metadata: {
              outputBytes: outputSize(response)
            }
          });

          return response;
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          this.record({
            agent: config.name,
            event: "failed",
            timestamp: toTimestamp(),
            metadata: {
              error: message
            }
          });
          throw error;
        }
      }
    };
  }

  createDocsSyncAgents(): DocsSyncAgents {
    return {
      changeAnalyzer: this.createJsonAgent<ChangeAnalyzerInput, ChangeAnalyzerOutput>({
        name: "change-analyzer",
        model: "gpt-5",
        systemPrompt: [
          "You analyze source control changes for documentation impact.",
          "Return only JSON with keys summary, features_added, apis_changed, breaking_changes, and doc_update_likelihood.",
          "Use concise, factual claims derived strictly from the commit message and diff."
        ].join(" ")
      }),
      docImpact: this.createJsonAgent<DocImpactInput, DocImpactOutput>({
        name: "doc-impact",
        model: "gpt-5",
        systemPrompt: [
          "You decide whether docs need updates based on change analysis and a docs mapping list.",
          "Return only JSON with keys needs_update, files, and reasons.",
          "Choose files from the provided mapping list and explain the reason briefly."
        ].join(" ")
      }),
      docWriter: this.createJsonAgent<DocWriterInput, { content: string }>({
        name: "doc-writer",
        model: "gpt-5",
        systemPrompt: [
          "You are a documentation writer.",
          "Return only JSON with a single content field containing the full rewritten markdown document.",
          "Preserve existing headings and style; do not invent unsupported behavior.",
          "If reviewerIssues are provided, treat them as required corrections."
        ].join(" ")
      }),
      docReviewer: this.createJsonAgent<DocReviewerInput, DocReviewerOutput>({
        name: "doc-reviewer",
        model: "gpt-5",
        systemPrompt: [
          "You review generated documentation for accuracy and hallucinations.",
          "Return only JSON with keys approved, confidence, and issues.",
          "Set approved to false if the content makes unsupported claims or examples."
        ].join(" ")
      })
    };
  }

  getLifecycle(): AgentLifecycleEvent[] {
    return [...this.events];
  }
}