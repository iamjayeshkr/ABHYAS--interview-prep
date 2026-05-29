const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { aiClient } = require('../config/ai');

// Asynchronous helper to query cloud models via OpenRouter with resilient model candidate cascade
async function tryOpenRouterFallback(message, context, history, systemPrompt, openRouterKey) {
    if (!openRouterKey) {
        throw new Error("No OpenRouter Key provided.");
    }

    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    if (history && history.length > 0) {
        history.forEach(msg => {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        });
    }

    let currentMessageText = message;
    if (context) {
        currentMessageText = `[REFERENCE CONTEXT DOCUMENT PROVIDED BY USER]:\n${context}\n\n[USER INSTRUCTION]:\n${message}`;
    }
    messages.push({
        role: 'user',
        content: currentMessageText
    });

    const candidateModels = [
        'meta-llama/llama-3.1-8b-instruct:free',
        'meta-llama/llama-3.1-8b-instruct',
        'qwen/qwen-2.5-coder-32b-instruct:free',
        'google/gemma-2-9b-it:free',
        'openrouter/free'
    ];

    let lastError = null;
    for (const model of candidateModels) {
        try {
            console.log(`🤖 [OPENROUTER CLOUD FALLBACK]: Querying cloud model "${model}"...`);
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openRouterKey.trim()}`,
                    'HTTP-Referer': 'http://localhost:5001',
                    'X-Title': 'ABHYAS Prep Terminal'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            if (data.error) {
                throw new Error(`API Error: ${JSON.stringify(data.error)}`);
            }
            if (!data.choices || data.choices.length === 0) {
                throw new Error("Returned empty choices.");
            }

            return {
                content: data.choices[0].message.content,
                modelUsed: model
            };
        } catch (err) {
            console.warn(`⚠️ [OPENROUTER CLOUD FALLBACK]: Attempt with "${model}" failed:`, err.message);
            lastError = err;
        }
    }
    throw lastError || new Error("All OpenRouter cloud candidate models failed.");
}

router.post('/chat', async (req, res) => {
    const { message, context, history } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required." });
    }

    const systemPrompt = `
You are ABHYAS, Jayesh's highly advanced AI Interview Coach.
Your primary directive is to help Jayesh prepare for premium technical and behavioral interviews.

CORE BEHAVIORAL DIRECTIVES:

1. HINGLISH DIALOGUE (NATURAL & COMFORTABLE):
   - Speak in a natural, comfortable, and professional mix of Hindi and English (Hinglish), just like top tech engineers communicate.
   - Use Hindi phrasing for explanations, analogies, and encouragement, while keeping standard technical terms in English (e.g., "Bilkul Jayesh, closures ka concept main aapko interactive way mein samjhati hoon. Jab ek function apne outer lexical scope ko remember rakhta hai, use hum closure bolte hain...").

2. INTERVIEW READINESS SCORING:
   - When Jayesh answers a mock question, gives a pitch, or explains an architecture, evaluate it thoroughly.
   - You MUST output a clear, highlighted score block at the top of your assessment in the format:
     [ABHYAS SCORE: X/10]
   - Provide concrete feedback broken down into:
     * 👍 **Kya accha tha** (What went well)
     * 🔧 **Kahan improvement chahiye** (Gaps, filler words, or missing detail)
     * STAR-method adherence and structure checks.

3. INTERACTIVE MD CONCEPT TEACHING:
   - When teaching technical concepts (e.g. Closures, Indexing, Processes vs Threads, System Design components), structure your answer as an interactive Markdown study guide.
   - Use clear headers, checklists, bullet points, and code blocks.
   - Draw custom ASCII diagrams or visual text flows to explain architectural data lines.
   - End EVERY explanation with a quick, engaging interactive challenge, follow-up quiz, or reflective question to prompt Jayesh (e.g., "Chalo ab ek simple challenge: Agar main continuous write operations karoon, toh custom index performance par kya impact padega? Aap try karo!").

4. CONTEXT ANCHORING:
   - If a reference document (Resume/JD/notes) is uploaded, anchor your questions, mock scenarios, and critiques specifically to the projects (ThinkEra, TechEra, Kriya) and tech stacks mentioned.
`;

    const contents = [];

    // Map conversation history to the SDK's expectations
    if (history && history.length > 0) {
        history.forEach(msg => {
            contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            });
        });
    }

    // Format current user turn
    let currentMessageText = message;
    if (context) {
        currentMessageText = `[REFERENCE CONTEXT DOCUMENT PROVIDED BY USER]:\n${context}\n\n[USER INSTRUCTION]:\n${message}`;
    }

    contents.push({
        role: 'user',
        parts: [{ text: currentMessageText }]
    });

    const userApiKey = req.headers['x-api-key'];
    const openRouterKey = req.headers['x-openrouter-key'];
    let activeClient = aiClient;

    if (userApiKey) {
        console.log(`🔑 [ABHYAS CHAT]: User API Key header detected! Prefix: "${userApiKey.substring(0, 6)}...". Instantiating custom SDK client.`);
        try {
            activeClient = new GoogleGenAI({ apiKey: userApiKey });
        } catch (e) {
            console.error("❌ Failed to initialize user-provided Gemini SDK client:", e.message);
        }
    } else {
        console.log("ℹ [ABHYAS CHAT]: No custom API Key found in headers. Utilizing default server credentials.");
    }

    if (!activeClient) {
        console.log("🤖 Running simulated chat fallback...");
        return res.json({
            reply: `🤖 [SIMULATED ABHYAS]\n\nI received your prompt: "${message}".\n\nTo enable live responses, please click the "🔑 Set API Key" button at the top right of the terminal and add your own Gemini API Key!`
        });
    }

    try {
        console.log("🤖 ABHYAS Terminal querying Gemini API...");
        const response = await activeClient.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: contents,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.7
            }
        });

        res.json({
            reply: response.text
        });
    } catch (err) {
        console.error("❌ Gemini API Error in ABHYAS Chat:", err.message);

        // Attempt Tier 2 Fallback: Cloud OpenRouter Cascade Fallback
        if (openRouterKey) {
            try {
                const { content, modelUsed } = await tryOpenRouterFallback(message, context, history, systemPrompt, openRouterKey);
                console.log(`✔ [ABHYAS CHAT]: Successfully retrieved cloud OpenRouter response using ${modelUsed}!`);
                return res.json({
                    reply: `🤖 **[ABHYAS COACH - CLOUD FALLBACK ACTIVE (${modelUsed})]**\n\n${content}`
                });
            } catch (openRouterErr) {
                console.warn("⚠️ [ABHYAS CHAT]: Cloud OpenRouter fallback failed:", openRouterErr.message);
            }
        }

        // Tier 3 Fallback: Graceful simulated text dialogs
        const isQuotaExceeded = err.message.toLowerCase().includes("quota") || err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED");
        const isKeyInvalid = err.message.toLowerCase().includes("key not valid") || err.message.includes("400") || err.message.toLowerCase().includes("invalid_argument") || err.message.toLowerCase().includes("api_key_invalid");

        if (isQuotaExceeded || isKeyInvalid) {
            console.log("ℹ [ABHYAS CHAT]: API Key has quota limits or is invalid. Engaging intelligent simulated fallback.");

            let explanation = "Main aapke queries ko capture kar paa rahi hoon! Lekin aesa lagta hai ki aapka Gemini API Key currently **Rate Limited (429 Quota Exceeded)** hai, ya is key par free-tier requests block hain (Limit: 0).";
            if (isKeyInvalid) {
                explanation = "Main aapke queries ko capture kar paa rahi hoon! Lekin aesa lagta hai ki jo Gemini API Key enter kiya gaya hai, woh **Invalid** hai ya active nahi hai.";
            }

            return res.json({
                reply: `🤖 **[ABHYAS COACH - RESILIENT FALLBACK MODE]**\n\n*⚠️ Note: ${explanation} (Hum yahan temporary simulated coaching mode mein run kar rahe hain taaki aapki preparation halt na ho!)\n\n💡 Tip: Aap settings modal 🔑 mein **OpenRouter API Key** bhi configure kar sakte hain taaki quota limits par automatic cloud fallback active rahe!*\n\n---\n\nBilkul! Main aapki help karti hoon. Aapne poocha: "${message}". \n\nClosures, indexing, or system queries ho — jab bhi hum Gemini API constraints encounter karte hain, ABHYAS intelligent simulations provide karti hai.\n\n### 💡 Key Concept Highlight:\n1. **Lexical Scopes & Closures**: In JS, functions nested inside outer functions always hold on to the variables of their parent context, forming a closure.\n2. **Star Method Behavioral Prep**: Use Situation, Task, Action, Result to anchor your behavioral answers.\n\nBatao Jayesh, aap is question ka mock answer try karna chahte ho? Write it down here, and main use evaluate karke aapko readiness rating doongi!`
            });
        }

        res.status(500).json({ error: "Failed to connect to Gemini API.", details: err.message });
    }
});

module.exports = router;
