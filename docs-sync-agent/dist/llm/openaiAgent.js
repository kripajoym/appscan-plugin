function extractJson(text) {
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
    return apiKey;
}
function buildResponseBody(model, systemPrompt, userPrompt) {
    return JSON.stringify({
        model,
        input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ]
    });
}
export async function runJsonAgent(input) {
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
        throw new Error(`OpenAI request failed (${response.status}): ${responseText}`);
    }
    const payload = JSON.parse(responseText);
    const outputText = payload.output_text ??
        payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ??
        "";
    return JSON.parse(extractJson(outputText));
}
