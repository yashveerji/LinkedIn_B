import { GoogleGenerativeAI } from "@google/generative-ai";

// Allow overriding via env; otherwise try candidates in order
const CANDIDATE_MODELS = [
    process.env.GEMINI_MODEL || "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
];
const API_KEY = (process.env.GOOGLE_GEMINI_KEY || "").trim();
const genAI = new GoogleGenerativeAI(API_KEY);
let SELECTED_MODEL = CANDIDATE_MODELS[0];
let model = genAI.getGenerativeModel({
    model: SELECTED_MODEL,
    systemInstruction: `
        Role of AI: You are a friendly, knowledgeable, and interactive assistant for the Global Connect platform. Your goal is to guide users, answer questions, and help them navigate the website and its features efficiently.

Primary Responsibilities:
Welcome Users: Greet new users politely and give a brief overview of the platform.
Example: “Hello! Welcome to Global Connect – your hub for professional networking, job opportunities, and real-time communication.”
Guide Navigation: Help users understand where to find different features.
User Profiles: How to create, edit, and manage their profile.
Posts & Feed: How to create posts, comment, and interact with content.
Job Board: How to browse, apply, and track job applications.
Messaging & Chat: How to send messages and use the chat system.
Notifications: How to view and manage notifications.
Answer Questions: Provide clear answers about website usage, features, and troubleshooting.
Example: “To edit your profile picture, click on your avatar in the top-right corner and select ‘Edit Profile.’”
Provide Suggestions & Tips: Give users helpful hints to enhance their experience.
Example: “You can follow other users to see their posts in your feed.”
Handle Errors / Issues Gracefully: Provide guidance or contact information if users encounter problems.
Example: “If you face any technical issue, please reach out to support@globalconnect.com.”
Keep Communication Friendly & Professional: Maintain a conversational tone, avoid jargon, and make users feel welcomed.
Do NOT:

Give personal opinions unrelated to the platform.

Provide sensitive information or instructions outside the platform scope.

Default Greeting Example:

“Hi there! I’m your Global Connect guide. I can help you navigate the website, find jobs, connect with professionals, and make the most out of your experience here. What would you like to do today?”
    `
});

function withTimeout(promise, ms = 20000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), ms)),
    ]);
}

export function isAiConfigured() {
    return Boolean(API_KEY);
}

export function aiStatus() {
    const configured = isAiConfigured();
    return {
        configured,
        model: configured ? SELECTED_MODEL : null,
        reason: configured ? undefined : "Missing GOOGLE_GEMINI_KEY",
    };
}

// Backward-compatible single-turn generation
export default async function generateContent(prompt, { timeoutMs = 20000 } = {}) {
    try {
        if (!isAiConfigured()) {
            return 'AI is not configured on the server.';
        }
        const result = await withTimeout(model.generateContent(prompt), timeoutMs);
        return result.response.text();
    } catch (e) {
        // Try fallbacks if initial model fails (e.g., invalid model name)
        for (let i = 1; i < CANDIDATE_MODELS.length; i++) {
            try {
                SELECTED_MODEL = CANDIDATE_MODELS[i];
                model = genAI.getGenerativeModel({ model: SELECTED_MODEL });
                const result = await withTimeout(model.generateContent(prompt), timeoutMs);
                return result.response.text();
            } catch {}
        }
        throw e;
    }
}

// Multi-turn chat with history (stateless: history is provided by caller)
export async function generateChatReply(messages = [], { timeoutMs = 20000 } = {}) {
    try {
        if (!isAiConfigured()) {
            return 'AI is not configured on the server.';
        }
        // Expect messages as array of { from: 'user'|'ai', text: string }
        const list = Array.isArray(messages) ? messages.filter(m => m && m.text) : [];
        if (!list.length) throw new Error('No messages');
        const last = list[list.length - 1];
        const history = list.slice(0, -1).map((m) => ({
            role: m.from === 'ai' ? 'model' : 'user',
            parts: [{ text: String(m.text || '') }],
        }));
        const chat = model.startChat({ history });
        const send = async () => {
            const result = await withTimeout(chat.sendMessage(String(last.text || '')), timeoutMs);
            return result.response.text();
        };
        try {
            return await send();
        } catch (e) {
            // Retry with fallback models
            for (let i = 1; i < CANDIDATE_MODELS.length; i++) {
                try {
                    SELECTED_MODEL = CANDIDATE_MODELS[i];
                    const alt = genAI.getGenerativeModel({ model: SELECTED_MODEL });
                    const altChat = alt.startChat({ history });
                    const result = await withTimeout(altChat.sendMessage(String(last.text || '')), timeoutMs);
                    return result.response.text();
                } catch {}
            }
            throw e;
        }
    } catch (e) {
        return 'Sorry, I could not process that right now.';
    }
}
