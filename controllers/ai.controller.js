
import aiService, { generateChatReply } from "../service/ai.service.js";

export const getRes = async (req, res) => {
    const code = req.body.code;

    if (!code) {
        return res.status(400).send("Prompt is required");
        
    }

  const response = await aiService(code);
res.json({ reply: response }); // send an object

};

export const chatRes = async (req, res) => {
  try {
    const messages = req.body?.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const reply = await generateChatReply(messages);
    return res.json({ reply });
  } catch (e) {
    return res.status(500).json({ error: 'failed' });
  }
};
