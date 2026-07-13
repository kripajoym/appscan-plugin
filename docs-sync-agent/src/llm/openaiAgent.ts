function extractJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Model returned an empty response.");
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error(`Model response was not JSON: ${trimmed}`);
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function getOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the docs sync agent.");
  }

  if (!apiKey.startsWith("sk-")) {
    throw new Error("OPENAI_API_KEY format looks invalid. Use a valid key from platform.openai.com.");
  }

  return apiKey;
}

function summarizeOpenAIError(responseText: string): string {
  try {
    const payload = JSON.parse(responseText) as {
      error?: {
        message?: string;
        code?: string;
        type?: string;
      };
    };

    const code = payload.error?.code;
    if (code === "invalid_api_key") {
      return "Invalid OpenAI API key. Update OPENAI_API_KEY secret with a valid key.";
    }

    if (payload.error?.type) {
      return `OpenAI API error type: ${payload.error.type}`;
    }
  } catch {
    // Ignore parse errors and return a generic message.
  }

  return "OpenAI API request failed. Check API key and account access.";
}

function buildResponseBody(model: string, systemPrompt: string, userPrompt: string) {
  return JSON.stringify({
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });
}

export async function runJsonAgent<TOutput>(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<TOutput> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json"
    },
    body: buildResponseBody(input.model, input.systemPrompt, input.userPrompt)
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${summarizeOpenAIError(responseText)}`);
  }

  const payload = JSON.parse(responseText) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  const outputText =
    payload.output_text ??
    payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ??
    "";

  return JSON.parse(extractJson(outputText)) as TOutput;
}