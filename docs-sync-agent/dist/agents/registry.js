import { runJsonAgent } from "../llm/openaiAgent.js";
function toTimestamp() {
    return new Date().toISOString();
}
function outputSize(value) {
    try {
        return JSON.stringify(value).length;
    }
    catch {
        return 0;
    }
}
export class AgentRuntime {
    events = [];
    record(event) {
        this.events.push(event);
    }
    createJsonAgent(config) {
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
            invoke: async (input) => {
                this.record({
                    agent: config.name,
                    event: "invoked",
                    timestamp: toTimestamp()
                });
                try {
                    const response = await runJsonAgent({
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
                }
                catch (error) {
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
    createDocsSyncAgents() {
        return {
            changeAnalyzer: this.createJsonAgent({
                name: "change-analyzer",
                model: "gpt-5",
                systemPrompt: [
                    "You analyze source control changes for documentation impact.",
                    "Return only JSON with keys summary, features_added, apis_changed, breaking_changes, and doc_update_likelihood.",
                    "Use concise, factual claims derived strictly from the commit message and diff."
                ].join(" ")
            }),
            docImpact: this.createJsonAgent({
                name: "doc-impact",
                model: "gpt-5",
                systemPrompt: [
                    "You decide whether docs need updates based on change analysis and a docs mapping list.",
                    "Return only JSON with keys needs_update, files, and reasons.",
                    "Choose files from the provided mapping list and explain the reason briefly."
                ].join(" ")
            }),
            docWriter: this.createJsonAgent({
                name: "doc-writer",
                model: "gpt-5",
                systemPrompt: [
                    "You are a documentation writer.",
                    "Return only JSON with a single content field containing the full rewritten markdown document.",
                    "Preserve existing headings and style; do not invent unsupported behavior.",
                    "If reviewerIssues are provided, treat them as required corrections."
                ].join(" ")
            }),
            docReviewer: this.createJsonAgent({
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
    getLifecycle() {
        return [...this.events];
    }
}
