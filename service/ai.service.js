import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

// Ensure env is loaded even if this module is evaluated before index.js (ESM import order)
dotenv.config();

// Allow overriding via env; otherwise try candidates in order (include widely available versions)
let CANDIDATE_MODELS = [
    process.env.GEMINI_MODEL || "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro-002",
];

// System prompt for the assistant
const SYSTEM_INSTRUCTION = `
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
    `;

// Lazy state; recreated if key/model changes
let SELECTED_MODEL = CANDIDATE_MODELS[0];
let _genAI = null;
let _model = null;

async function ensureFetch() {
    if (typeof fetch === 'undefined') {
        try {
            const undici = await import('undici');
            // @ts-ignore
            globalThis.fetch = undici.fetch;
            // @ts-ignore
            globalThis.Headers = undici.Headers;
            // @ts-ignore
            globalThis.Request = undici.Request;
            // @ts-ignore
            globalThis.Response = undici.Response;
        } catch (e) {
            console.error('[AI] Failed to polyfill fetch:', e?.message || e);
        }
    }
}

function getApiKey() {
    let key = process.env.GOOGLE_GEMINI_KEY || "";
    key = String(key).trim();
    // Strip wrapping single/double quotes if present
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1).trim();
    }
    return key;
}

function ensureClient(modelName = SELECTED_MODEL) {
    const key = getApiKey();
    if (!key) return { ok: false, reason: "Missing GOOGLE_GEMINI_KEY" };
    if (!_genAI) _genAI = new GoogleGenerativeAI(key);
    if (!_model || SELECTED_MODEL !== modelName) {
        SELECTED_MODEL = modelName;
        _model = _genAI.getGenerativeModel({ model: SELECTED_MODEL, systemInstruction: SYSTEM_INSTRUCTION });
    }
    return { ok: true };
}

function withTimeout(promise, ms = 20000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), ms)),
    ]);
}

export function isAiConfigured() {
    return Boolean(getApiKey());
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
        // Ensure client/model; if the preferred model fails, fallback below
    await ensureFetch();
    let ok = ensureClient(SELECTED_MODEL);
        if (!ok.ok) return 'AI is not configured on the server.';
        try {
            const result = await withTimeout(_model.generateContent(prompt), timeoutMs);
            return result.response.text();
        } catch (err) {
            // Try fallbacks if initial model fails (e.g., invalid model name)
            for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
                const name = CANDIDATE_MODELS[i];
                try {
            ensureClient(name);
                    const result = await withTimeout(_model.generateContent(prompt), timeoutMs);
                    return result.response.text();
                } catch {}
            }
        console.error('[AI] generateContent failed for all models', err?.message || err);
        throw err;
        }
    } catch (e) {
    console.error('[AI] generateContent error:', e?.message || e);
        return 'Sorry, I could not process that right now.';
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

        // Try current + fallbacks with chat API
        for (let i = -1; i < CANDIDATE_MODELS.length; i++) {
            const name = i < 0 ? SELECTED_MODEL : CANDIDATE_MODELS[i];
            try {
        await ensureFetch();
        const ok = ensureClient(name);
                if (!ok.ok) break;
                const chat = _model.startChat({ history });
                const result = await withTimeout(chat.sendMessage(String(last.text || '')), timeoutMs);
                return result.response.text();
            } catch {}
        }
        // Fallback: attempt single-turn generation without history
        for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
            try {
                const ok = ensureClient(CANDIDATE_MODELS[i]);
                if (!ok.ok) break;
                const result = await withTimeout(_model.generateContent(String(last.text || '')), timeoutMs);
                return result.response.text();
            } catch {}
        }
        throw new Error('all_models_failed');
    } catch (e) {
    console.error('[AI] generateChatReply error:', e?.message || e);
        return 'Sorry, I could not process that right now.';
    }
}
