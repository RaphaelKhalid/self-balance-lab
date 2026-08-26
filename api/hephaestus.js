// Vercel Edge Function — the Hephaestus backend (Milestone 2), on the Gemini API.
//
// The browser never holds the key. This endpoint takes the running conversation
// (Gemini `contents`) + a snapshot of the current build, calls generateContent
// with the shared tool contract, and returns the model's turn (text + any
// functionCall parts). The CLIENT executes tool calls against window.__api and
// loops back with functionResponse parts — so this function is stateless.
//
// Runtime: Edge. No SDK — a single fetch.
//
// TWO PROVIDERS, ONE RESPONSE SHAPE. If OPENROUTER_API_KEY is set the request
// goes to OpenRouter; otherwise it falls back to Gemini. The client is never
// told which — this function always answers in the Gemini `parts` shape that
// js/app/hephaestus.js already parses, so the provider can be swapped by
// setting one env var in Vercel, with no client change and no redeploy.
//
// Why OpenRouter is preferred when configured: bench/ measured
// deepseek/deepseek-v4-flash at 27/29 BLIND on this exact tool contract —
// building real circuits through this same API, with no solver feedback to
// iterate against. It costs about $0.0025 a conversation, against a free Gemini
// tier that is quota-limited (the benchmark hit 429s on it). A measured choice,
// not a preference.
//
// Set GEMINI_API_KEY (free AI Studio key, "AIza…") and/or OPENROUTER_API_KEY.
// GEMINI_MODEL / OPENROUTER_MODEL override the defaults.
//
// The default was gemini-2.5-flash-lite until 2026-08-24, when it started
// returning 404 "no longer available to new users" — so Hephaestus was dead on
// the live site for anyone whose key wasn't grandfathered in. The error names
// gemini-3.5-flash-lite as the replacement, and that is what this now uses.
// Deliberately no rate-limit numbers here: Google stopped publishing static
// per-model free-tier limits and points at AI Studio for the live figures, so
// any number written down would be stale the moment it was.
import { geminiFunctionDeclarations, SYSTEM_PROMPT } from '../js/api/tools.js';

export const config = { runtime: 'edge' };

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const orKey = process.env.OPENROUTER_API_KEY;
  const key = process.env.GEMINI_API_KEY;
  if (!orKey && !key) {
    return json({ error: 'Hephaestus is not configured (no API key on the server).' }, 503);
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const { contents, document } = body || {};
  if (!Array.isArray(contents) || contents.length === 0) {
    return json({ error: '`contents` array required' }, 400);
  }
  // Guardrail: cap conversation size so a runaway client can't rack up tokens.
  if (contents.length > 40) return json({ error: 'Conversation too long' }, 413);

  const system = document
    ? `${SYSTEM_PROMPT}\n\nCurrent build (RobotDoc):\n${JSON.stringify(summarize(document))}`
    : SYSTEM_PROMPT;

  if (orKey) {
    return await viaOpenRouter({
      key: orKey,
      model: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL,
      system,
      contents,
    });
  }

  let upstream;
  try {
    upstream = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        tools: [{ functionDeclarations: geminiFunctionDeclarations() }],
        // keep the model terse + cheap; it should call tools, not monologue
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        contents,
      }),
    });
  } catch (e) {
    return json({ error: 'Upstream request failed', detail: String(e && e.message || e) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    // surface Gemini's 429 (rate/quota) distinctly so the client can back off
    return json({ error: 'Gemini API error', status: upstream.status, detail }, upstream.status === 429 ? 429 : 502);
  }

  const data = await upstream.json();
  const cand = data.candidates && data.candidates[0];
  if (!cand || !cand.content) {
    const reason = (data.promptFeedback && data.promptFeedback.blockReason) || cand?.finishReason || 'no candidate';
    return json({ error: `Hephaestus produced no reply (${reason})` }, 502);
  }
  // Return only the client-relevant slice: the model turn.
  return json({
    content: cand.content,          // { role:'model', parts:[ {text} | {functionCall} ] }
    finishReason: cand.finishReason,
    usage: data.usageMetadata,
  });
}

// Trim the doc to the fields the model reasons about (ids, types, params, nets),
// dropping transforms/colors/meta so the context stays small.
function summarize(doc) {
  return {
    components: (doc.components || []).map(c => ({ id: c.id, type: c.type, params: c.params })),
    nets: (doc.nets || []).map(n => ({ endpoints: n.endpoints })),
  };
}

// ── OpenRouter path ─────────────────────────────────────────────────────────
// Speaks OpenAI's wire format, then converts the reply back into the Gemini
// `parts` shape so the client cannot tell the difference.
async function viaOpenRouter({ key, model, system, contents }) {
  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...toOpenAIMessages(contents)],
        tools: geminiFunctionDeclarations().map(d => ({
          type: 'function',
          function: {
            name: d.name,
            description: d.description,
            // A no-argument tool still needs a schema object here.
            parameters: d.parameters || { type: 'object', properties: {} },
          },
        })),
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });
  } catch (e) {
    return json({ error: 'Upstream request failed', detail: String((e && e.message) || e) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: 'OpenRouter API error', status: upstream.status, detail },
      upstream.status === 429 ? 429 : 502);
  }

  const data = await upstream.json().catch(() => null);
  // OpenRouter surfaces upstream provider failures as HTTP 200 with an error body.
  if (!data || data.error) {
    return json({ error: `Hephaestus upstream error: ${(data && data.error && data.error.message) || 'malformed reply'}` }, 502);
  }
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) return json({ error: 'Hephaestus produced no reply (no choice)' }, 502);

  const parts = [];
  if (choice.message.content) parts.push({ text: choice.message.content });
  for (const call of choice.message.tool_calls || []) {
    parts.push({
      functionCall: {
        name: call.function && call.function.name,
        // `arguments` is a JSON *string*, and models do emit malformed ones —
        // a parse failure must not take the whole turn down.
        args: safeArgs(call.function && call.function.arguments),
      },
    });
  }
  if (parts.length === 0) parts.push({ text: '' });

  return json({
    content: { role: 'model', parts },
    finishReason: choice.finish_reason,
    usage: data.usage,
  });
}

function safeArgs(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * Gemini `contents` → OpenAI `messages`.
 *
 * The awkward part is tool linkage. Gemini pairs a functionCall with its
 * functionResponse by name and position; OpenAI demands an explicit
 * `tool_call_id` on both sides. So ids are synthesised from the turn index, and
 * each functionResponse turn consumes the ids minted by the assistant turn
 * before it — which holds because the client replays the whole conversation in
 * order on every request.
 */
function toOpenAIMessages(contents) {
  const out = [];
  let pendingIds = [];

  contents.forEach((turn, i) => {
    const parts = turn.parts || [];
    const responses = parts.filter(p => p.functionResponse);

    if (responses.length) {
      responses.forEach((p, j) => {
        const r = p.functionResponse.response;
        out.push({
          role: 'tool',
          tool_call_id: pendingIds[j] || `call_${i}_${j}`,
          content: JSON.stringify((r && r.result !== undefined) ? r.result : (r || {})),
        });
      });
      pendingIds = pendingIds.slice(responses.length);
      return;
    }

    const text = parts.filter(p => p.text).map(p => p.text).join('');
    const calls = parts.filter(p => p.functionCall);

    if (turn.role === 'model') {
      const ids = calls.map((_, j) => `call_${i}_${j}`);
      pendingIds = ids;
      const m = { role: 'assistant', content: text || null };
      if (calls.length) {
        m.tool_calls = calls.map((p, j) => ({
          id: ids[j],
          type: 'function',
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args || {}),
          },
        }));
      }
      out.push(m);
    } else {
      out.push({ role: 'user', content: text });
    }
  });

  return out;
}
