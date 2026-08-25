// Model adapters for the benchmark.
//
// Each adapter exposes the same `chat({ system, messages, tools })` and returns
// a normalised `{ text, toolCalls, usage }`, so bench/run.mjs owns the agent loop
// once instead of once per vendor. `messages` is the adapter's own history type —
// the runner passes it back untouched and only ever appends via the adapter's
// `pushToolResults`, which keeps each vendor's transcript format private.
//
// Gemini goes over raw fetch, deliberately: api/hephaestus.js already proves that
// shape against this exact tool contract, and it means the cheap first run needs
// no new dependency. Anthropic uses the official SDK, imported dynamically so the
// file still loads when @anthropic-ai/sdk isn't installed.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** JSON Schema → Gemini functionDeclaration (mirrors js/api/tools.js). */
function geminiDecls(tools) {
  return tools.map((t) => {
    const props = t.schema.properties || {};
    const decl = { name: t.name, description: t.description };
    // Gemini rejects a parameters block with no properties — omit it entirely.
    if (Object.keys(props).length > 0) {
      decl.parameters = {
        type: 'object',
        properties: props,
        ...(t.schema.required ? { required: t.schema.required } : {}),
      };
    }
    return decl;
  });
}

export function makeGemini({ model = 'gemini-3.5-flash-lite', apiKey }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return {
    id: `gemini:${model}`,
    newHistory: () => [],
    pushAssistant(history, raw) { history.push({ role: 'model', parts: raw.parts }); },
    pushToolResults(history, results) {
      history.push({
        role: 'user',
        parts: results.map(r => ({
          functionResponse: { name: r.name, response: { result: r.result } },
        })),
      });
    },
    pushUser(history, text) { history.push({ role: 'user', parts: [{ text }] }); },

    async chat({ system, history, tools }) {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: history,
          tools: [{ functionDeclarations: geminiDecls(tools) }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      return {
        raw: { parts },
        text: parts.filter(p => p.text).map(p => p.text).join(''),
        toolCalls: parts.filter(p => p.functionCall).map(p => ({
          id: p.functionCall.name,
          name: p.functionCall.name,
          input: p.functionCall.args || {},
        })),
        usage: {
          in: data.usageMetadata?.promptTokenCount || 0,
          out: data.usageMetadata?.candidatesTokenCount || 0,
        },
      };
    },
  };
}

/**
 * OpenRouter — one key, many vendors, OpenAI-compatible wire format.
 *
 * This is the adapter that makes a cross-model sweep practical: swapping
 * `--model deepseek/deepseek-v4-flash` for a frontier slug changes nothing else.
 * It also asks OpenRouter to report real spend (`usage.include`), so the cost
 * line is the provider's own number rather than my arithmetic over a price table
 * that goes stale.
 */
export function makeOpenRouter({ model = 'deepseek/deepseek-v4-flash', apiKey }) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  return {
    id: `openrouter:${model}`,
    newHistory: () => [],
    pushAssistant(history, raw) { history.push(raw.message); },
    pushToolResults(history, results) {
      // OpenAI shape: one `tool` message per call, each keyed by tool_call_id.
      for (const r of results) {
        history.push({
          role: 'tool',
          tool_call_id: r.id,
          content: JSON.stringify(r.result),
        });
      }
    },
    pushUser(history, text) { history.push({ role: 'user', content: text }); },

    async chat({ system, history, tools }) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...history],
          tools: tools.map(t => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: {
                type: 'object',
                properties: t.schema.properties || {},
                ...(t.schema.required ? { required: t.schema.required } : {}),
              },
            },
          })),
          tool_choice: 'auto',
          usage: { include: true },
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = await res.json();
      // An upstream provider error arrives as HTTP 200 with an `error` body.
      if (data.error) throw new Error(`OpenRouter: ${data.error.message || JSON.stringify(data.error)}`);
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error(`OpenRouter: no message in response`);

      return {
        raw: { message },
        text: message.content || '',
        toolCalls: (message.tool_calls || []).map((c) => ({
          id: c.id,
          name: c.function?.name,
          // arguments is a JSON *string* here, and models do emit malformed ones.
          // A parse failure must reach the model as a tool error, not crash the run.
          input: safeParse(c.function?.arguments),
        })),
        usage: {
          in: data.usage?.prompt_tokens || 0,
          out: data.usage?.completion_tokens || 0,
          cost: data.usage?.cost ?? null,
        },
      };
    },
  };
}

function safeParse(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return { __malformed: String(s).slice(0, 200) }; }
}

export async function makeAnthropic({ model = 'claude-opus-5', apiKey, effort }) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error('npm i @anthropic-ai/sdk  (needed for --provider anthropic)');
  }
  // A bare constructor also picks up an `ant auth login` profile, so an unset
  // ANTHROPIC_API_KEY is not necessarily an error.
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

  return {
    id: `anthropic:${model}`,
    newHistory: () => [],
    pushAssistant(history, raw) { history.push({ role: 'assistant', content: raw.content }); },
    pushToolResults(history, results) {
      // All tool_results for one assistant turn must go back in a SINGLE user
      // message, or the model learns to stop making parallel calls.
      history.push({
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: JSON.stringify(r.result),
          ...(r.isError ? { is_error: true } : {}),
        })),
      });
    },
    pushUser(history, text) { history.push({ role: 'user', content: text }); },

    async chat({ system, history, tools }) {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system,
        thinking: { type: 'adaptive' },
        ...(effort ? { output_config: { effort } } : {}),
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: {
            type: 'object',
            properties: t.schema.properties || {},
            ...(t.schema.required ? { required: t.schema.required } : {}),
          },
        })),
        messages: history,
      });
      // stop_details is only populated on a refusal — guard before reading it.
      if (response.stop_reason === 'refusal') {
        throw new Error(`refused: ${response.stop_details?.category || 'unknown'}`);
      }
      return {
        raw: { content: response.content },
        text: response.content.filter(b => b.type === 'text').map(b => b.text).join(''),
        toolCalls: response.content.filter(b => b.type === 'tool_use').map(b => ({
          id: b.id, name: b.name, input: b.input,
        })),
        usage: {
          in: response.usage.input_tokens,
          out: response.usage.output_tokens,
        },
      };
    },
  };
}

// $ per 1M tokens, for the cost line in the report. Gemini flash-lite is free
// tier in practice; the Anthropic numbers are first-party API list prices.
export const PRICING = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};
