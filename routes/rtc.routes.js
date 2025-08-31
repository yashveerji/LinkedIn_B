import express from "express";
import https from "https";

const router = express.Router();

function getTwilioIceServers() {
  return new Promise((resolve, reject) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return reject(new Error("Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN"));
    }

    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const options = {
      method: "POST",
      hostname: "api.twilio.com",
      path: `/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Tokens.json`,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data || "{}");
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const list = (parsed.ice_servers || []).map((s) => ({
              urls: s.urls || s.url,
              username: s.username,
              credential: s.credential,
            }));
            resolve(list);
          } else {
            reject(new Error(parsed?.message || `Twilio error: ${res.statusCode}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    // No body needed for this POST
    req.end();
  });
}

router.get("/ice", async (req, res) => {
  try {
    const iceServers = await getTwilioIceServers();
    // Allow public cross-origin access; no secrets in response (ephemeral creds)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.json({ iceServers });
  } catch (e) {
    // Fall back to empty list; frontend should handle with STUN/env TURN
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(503).json({ error: e.message || "Failed to fetch ICE servers" });
  }
});

// Handle preflight if needed
router.options('/ice', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

export default router;
