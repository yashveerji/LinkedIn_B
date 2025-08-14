
import aiService from "../service/ai.service.js";

export const getRes = async (req, res) => {
    const code = req.body.code;

    if (!code) {
        return res.status(400).send("Prompt is required");
        
    }

  const response = await aiService(code);
res.json({ reply: response }); // send an object

};
