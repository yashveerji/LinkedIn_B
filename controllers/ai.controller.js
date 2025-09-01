
import aiService, { generateChatReply, aiStatus } from "../service/ai.service.js";

export const getRes = async (req, res) => {
  try {
    const code = req.body.code;
    if (!code) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    const response = await aiService(code, { timeoutMs: 20000 });
    return res.json({ reply: response });
  } catch (e) {
    const msg = e?.message === 'AI_TIMEOUT' ? 'AI timeout' : 'AI error';
    return res.status(500).json({ error: msg });
  }
};

export const chatRes = async (req, res) => {
  try {
    const messages = req.body?.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const reply = await generateChatReply(messages, { timeoutMs: 20000 });
    return res.json({ reply });
  } catch (e) {
    const msg = e?.message === 'AI_TIMEOUT' ? 'AI timeout' : 'failed';
    return res.status(500).json({ error: msg });
  }
};

export const aiHealth = (req, res) => {
  return res.json({ ok: true, ...aiStatus() });
};
