// AIClient: calls Google Gemini or OpenAI over HTTPS (no SDK needed).
// Two AI features use it:
//   suggestSlots(input) – proposes study sessions for the schedule (AI Scheduling Engine)
//   parseTask(input)    – turns a typed sentence into task fields (AI Quick Add)
const { buildPrompt, parseReply } = require('./PromptBuilder');
const { buildTaskPrompt, parseTaskReply } = require('./TaskParser');

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && (data.error.message || data.error)) || `HTTP ${res.status}`;
      throw new Error(`AI request failed: ${msg}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('AI timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Each provider only needs one method: send a prompt, get the reply text (JSON).
function geminiProvider({ key, model, timeoutMs }) {
  return async (prompt) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const data = await postJson(url, { 'x-goog-api-key': key }, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }, timeoutMs);
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || '').join('');
  };
}

function openaiProvider({ key, model, timeoutMs }) {
  return async (prompt) => {
    const data = await postJson('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a study-planning assistant. Reply with JSON only.' },
        { role: 'user', content: prompt },
      ],
    }, timeoutMs);
    return data.choices?.[0]?.message?.content;
  };
}

function makeClient(provider, model, complete) {
  return {
    provider,
    model,
    complete,
    async suggestSlots(input) {
      return parseReply(await complete(buildPrompt(input)));
    },
    async parseTask(input) {
      return parseTaskReply(await complete(buildTaskPrompt(input)));
    },
  };
}

// Returns null when no key is configured; the app then uses its rule-based fallbacks.
function createAIClient(config) {
  if (config.geminiKey) {
    return makeClient('gemini', config.geminiModel, geminiProvider({ key: config.geminiKey, model: config.geminiModel, timeoutMs: config.aiTimeoutMs }));
  }
  if (config.openaiKey) {
    return makeClient('openai', config.openaiModel, openaiProvider({ key: config.openaiKey, model: config.openaiModel, timeoutMs: config.aiTimeoutMs }));
  }
  return null;
}

module.exports = { createAIClient, makeClient };
