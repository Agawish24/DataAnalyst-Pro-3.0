const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const ENC_KEY = (process.env.ENCRYPTION_KEY || 'dataanalyst_pro_vibe_key_32bytes!').slice(0, 32).padEnd(32, '0');

const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENC_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  try {
    const [ivHex, encHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY), iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString();
  } catch { return null; }
};

const MODELS = [
  {
    id: 'gemini-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    model: 'gemini-2.0-flash',
    badge: 'Google',
    color: '#4285f4',
    free: true,
    speed: 'Fast',
    context: '1M tokens',
    keyLabel: 'Google AI Studio API Key',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    description: 'Google\'s fastest free model — 60 RPM, 1M token context window',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    model: 'deepseek-chat',
    badge: 'DeepSeek',
    color: '#10b981',
    free: true,
    speed: 'Medium',
    context: '128K tokens',
    keyLabel: 'DeepSeek API Key',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'State-of-the-art open model — excellent at code, math, and reasoning',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    badge: 'DeepSeek',
    color: '#059669',
    free: true,
    speed: 'Slow',
    context: '64K tokens',
    keyLabel: 'DeepSeek API Key',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'Reasoning model — thinks step by step, great for complex bugs',
  },
  {
    id: 'groq-llama',
    name: 'Llama 3.3 70B',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    badge: 'Groq',
    color: '#f59e0b',
    free: true,
    speed: 'Very Fast',
    context: '128K tokens',
    keyLabel: 'Groq API Key',
    keyUrl: 'https://console.groq.com/keys',
    description: 'Meta\'s Llama running on Groq hardware — insanely fast inference, free tier',
  },
  {
    id: 'kimi',
    name: 'Kimi K1.5',
    provider: 'moonshot',
    model: 'moonshot-v1-8k',
    badge: 'Moonshot',
    color: '#8b5cf6',
    free: true,
    speed: 'Medium',
    context: '8K tokens',
    keyLabel: 'Moonshot AI API Key',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    description: 'Kimi by Moonshot AI — strong multilingual coding capabilities',
  },
  {
    id: 'qwen-coder',
    name: 'Qwen2.5 Coder 32B',
    provider: 'together',
    model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    badge: 'Together AI',
    color: '#ec4899',
    free: true,
    speed: 'Medium',
    context: '32K tokens',
    keyLabel: 'Together AI API Key',
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    description: 'Alibaba\'s top code model via Together AI — specialized for all programming languages',
  },
];

const SYSTEM_PROMPT = `You are an expert software engineer and pair programmer. You excel at:
- Writing clean, efficient, production-ready code in any language
- Debugging and fixing errors with clear explanations
- Code review and optimization suggestions
- Explaining complex concepts simply
- Generating boilerplate and scaffolding

Rules:
- Always use proper code blocks with language tags
- Be concise but thorough
- When fixing bugs, explain what was wrong and why your fix works
- When generating code, add brief inline comments for non-obvious parts
- Prefer modern idioms and best practices for each language`;

const callAI = async (provider, model, apiKey, messages) => {
  const headers = { 'Content-Type': 'application/json' };

  if (provider === 'google') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const geminiMessages = messages.filter(m => m.role !== 'system');
    const body = {
      contents: geminiMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    };
    const r = await axios.post(url, body, { timeout: 60000 });
    return r.data.candidates[0].content.parts[0].text;
  }

  const openAICompatible = ['deepseek', 'groq', 'moonshot', 'together', 'mistral'];
  if (openAICompatible.includes(provider)) {
    const baseURLs = {
      deepseek: 'https://api.deepseek.com/v1',
      groq: 'https://api.groq.com/openai/v1',
      moonshot: 'https://api.moonshot.cn/v1',
      together: 'https://api.together.xyz/v1',
      mistral: 'https://api.mistral.ai/v1',
    };
    headers.Authorization = `Bearer ${apiKey}`;
    const r = await axios.post(`${baseURLs[provider]}/chat/completions`, {
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 8192,
      temperature: 0.2,
    }, { headers, timeout: 60000 });
    return r.data.choices[0].message.content;
  }

  throw new Error(`Unknown provider: ${provider}`);
};

const getKey = async (userId, modelId) => {
  const r = await pool.query(
    'SELECT api_key FROM vibe_coding_keys WHERE user_id=$1 AND model_id=$2',
    [userId, modelId]
  );
  if (!r.rows[0]) return null;
  return decrypt(r.rows[0].api_key);
};

router.get('/models', authenticate, async (req, res) => {
  const keysR = await pool.query(
    'SELECT model_id FROM vibe_coding_keys WHERE user_id=$1', [req.user.id]
  ).catch(() => ({ rows: [] }));
  const configured = new Set(keysR.rows.map(r => r.model_id));
  res.json(MODELS.map(m => ({ ...m, configured: configured.has(m.id) })));
});

router.post('/keys', authenticate, async (req, res) => {
  const { modelId, apiKey } = req.body;
  if (!modelId || !apiKey) return res.status(400).json({ error: 'modelId and apiKey required' });
  const model = MODELS.find(m => m.id === modelId);
  if (!model) return res.status(400).json({ error: 'Unknown model' });
  const encrypted = encrypt(apiKey.trim());
  await pool.query(
    'INSERT INTO vibe_coding_keys (user_id, model_id, api_key) VALUES ($1,$2,$3) ON CONFLICT (user_id, model_id) DO UPDATE SET api_key=$3, created_at=NOW()',
    [req.user.id, modelId, encrypted]
  );
  res.json({ ok: true, model: model.name });
});

router.delete('/keys/:modelId', authenticate, async (req, res) => {
  await pool.query(
    'DELETE FROM vibe_coding_keys WHERE user_id=$1 AND model_id=$2',
    [req.user.id, req.params.modelId]
  );
  res.json({ ok: true });
});

router.post('/chat', authenticate, async (req, res) => {
  const { modelId, messages, language = 'python', action = 'chat' } = req.body;
  if (!modelId || !messages?.length) return res.status(400).json({ error: 'modelId and messages required' });

  const model = MODELS.find(m => m.id === modelId);
  if (!model) return res.status(400).json({ error: 'Unknown model' });

  const apiKey = await getKey(req.user.id, modelId);
  if (!apiKey) return res.status(400).json({
    error: `No API key configured for ${model.name}. Click the key icon to add your free API key.`,
    needsKey: true,
    modelId,
  });

  try {
    const response = await callAI(model.provider, model.model, apiKey, messages);
    await pool.query(
      'INSERT INTO vibe_coding_sessions (user_id, model_id, language, action, tokens_in, tokens_out) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, modelId, language, action,
        messages.reduce((s, m) => s + m.content.length, 0),
        response.length]
    ).catch(() => {});
    res.json({ response, model: model.name });
  } catch (err) {
    const msg = err.response?.data?.error?.message
      || err.response?.data?.message
      || err.response?.data?.error
      || err.message;
    res.status(500).json({ error: String(msg) });
  }
});

router.get('/history', authenticate, async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM vibe_coding_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
    [req.user.id]
  ).catch(() => ({ rows: [] }));
  res.json(r.rows);
});

// Alias /sessions → /history
router.get('/sessions', authenticate, async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM vibe_coding_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
    [req.user.id]
  ).catch(() => ({ rows: [] }));
  res.json(r.rows);
});

module.exports = router;
