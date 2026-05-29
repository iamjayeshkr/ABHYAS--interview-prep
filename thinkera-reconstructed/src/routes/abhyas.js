const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { aiClient } = require('../config/ai');

// Helper to execute fetch calls with strict abort timeouts to prevent slow model queue delays
async function fetchWithTimeout(url, options, timeoutMs = 2000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// Asynchronous helper to query cloud models via OpenRouter with a blazing-fast, timed candidate cascade
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

    // Prioritize openrouter/free first for instant auto-routing to the fastest free model, with resilient backups
    const candidateModels = [
        'openrouter/free',
        'meta-llama/llama-3.2-3b-instruct:free',
        'qwen/qwen3-coder:free'
    ];

    let lastError = null;
    for (const model of candidateModels) {
        try {
            console.log(`🤖 [OPENROUTER CLOUD FALLBACK]: Querying cloud model "${model}"...`);
            const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
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
            }, 2000); // Strict 2-second timeout per candidate!

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

1. HINGLISH DIALOGUE (NATURAL & COMFORTABLE - MASCULINE PERSONA):
   - Speak in a natural, comfortable, and professional mix of Hindi and English (Hinglish), just like top tech engineers communicate.
   - Speak in a supportive, professional MASCULINE (male) tone (e.g., use "sakta hoon", "samjhata hoon", "karta hoon" instead of feminine variants like "sakti hoon", "samjhati hoon", "karti hoon").
   - Use Hindi phrasing for explanations, analogies, and encouragement, while keeping standard technical terms in English (e.g., "Bilkul Jayesh, closures ka concept main aapko interactive way mein samjhata hoon. Jab ek function apne outer lexical scope ko remember rakhta hai, use hum closure bolte hain...").

2. INTERVIEW READINESS SCORING:
   - When Jayesh answers a mock question, gives a pitch, or explains an architecture, evaluate it thoroughly.
   - You MUST output a clear, highlighted score block at the top of your assessment in the format:
     [ABHYAS SCORE: X/10]
   - Provide concrete feedback broken down into:
     * 👍 **Kya accha tha** (What went well)
     * 🔧 **Kahan improvement chahiye** (Gaps, filler words, or missing detail)
     * STAR-method adherence and structure checks.

3. TALK SMALL & CONCISE BY DEFAULT (EXPAND ON REQUEST):
   - By default, you MUST keep your responses extremely short, concise, and snappy (typically 2-3 sentences max). Speak in a highly conversational and focused tone.
   - Proactively suggest at the end of your response that Jayesh can ask to "expand" or "deep-dive" if he wants a detailed explanation, custom diagrams, or code blocks (e.g., "*[Hint: Agar details or code chahiye, toh ask me to 'expand' or 'deep-dive'!]*").
   - ONLY write detailed explanations, code blocks, checklists, or custom ASCII diagrams if the user explicitly asks to "expand", "deep-dive", "elaborate", "tell me more", "explain in detail", or similar keywords in their prompt.

4. INTERACTIVE MD CONCEPT TEACHING (ONLY ON EXPANSION REQUEST):
   - When the user explicitly requests an expansion, deep-dive, or detailed explanation, structure your detailed answer as an interactive Markdown study guide.
   - Use clear headers, checklists, bullet points, and code blocks.
   - Draw custom ASCII diagrams or visual text flows to explain architectural data lines.
   - End EVERY expanded explanation with a quick, engaging interactive challenge, follow-up quiz, or reflective question to prompt Jayesh (e.g., "Chalo ab ek simple challenge: Agar main continuous write operations karoon, toh custom index performance par kya impact padega? Aap try karo!").

5. CONTEXT ANCHORING:
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
        const isQueryingClosure = message.toLowerCase().includes("closure");
        const wantsExpand = message.toLowerCase().match(/\b(expand|deep-dive|deepdive|elaborate|detail|more)\b/);

        let simulatedReply = `🤖 **[SIMULATED ABHYAS - KEY REQUIRED]**\n\nI received your prompt: "${message}". To enable live model responses, please click the "🔑 Set API Key" button at the top right of the terminal and add your own Gemini/OpenRouter API Key!\n\n*[Hint: Try asking about 'Closures' or type 'expand' to see simulated responses!]*`;

        if (isQueryingClosure) {
            if (wantsExpand) {
                simulatedReply = `🤖 **[SIMULATED ABHYAS - EXPANDED GUIDE]**\n\n### 📚 Complete Guide: Closures in JavaScript\n\nIn JavaScript, **closures** occur when a nested function retains access to the variables of its parent scope even after that parent function has finished executing.\n\n#### 💻 Example Code:\n\`\`\`javascript\nfunction outerFunction(outerVariable) {\n    return function innerFunction(innerVariable) {\n        console.log('Outer Variable: ' + outerVariable);\n        console.log('Inner Variable: ' + innerVariable);\n    }\n}\nconst newFunction = outerFunction('outside');\nnewFunction('inside'); // Outputs both!\n\`\`\`\n\n#### 🎯 Interactive Challenge:\nCan you write a function that acts as a private counter using closures? Try typing it in the terminal!`;
            } else {
                simulatedReply = `🤖 **[SIMULATED ABHYAS - TALK SMALL]**\n\nClosures JavaScript ka ek special feature hain jahan ek nested function apne outer (parent) lexical scope variables ko dynamic context access provide karta hai.\n\n*(To get a complete guide, ASCII diagrams, and code snippets, ask me to **"expand"** or **"deep-dive"**!)*`;
            }
        } else if (wantsExpand) {
            simulatedReply = `🤖 **[SIMULATED ABHYAS - EXPANDED VIEW]**\n\nHere is the detailed deep-dive expansion for your request: "${message}".\n\n1. **Detailed Explanation**: We provide architectural deep-dives here.\n2. **Best Practices**: Ensure clean, modular coding standards.\n\nTo enable live custom models, configure your key using the settings button in the top right!`;
        }

        return res.json({
            reply: simulatedReply
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

            let explanation = "Main aapke queries ko capture kar paa raha hoon! Lekin aesa lagta hai ki aapka Gemini API Key currently **Rate Limited (429 Quota Exceeded)** hai, ya is key par free-tier requests block hain (Limit: 0).";
            if (isKeyInvalid) {
                explanation = "Main aapke queries ko capture kar paa raha hoon! Lekin aesa lagta hai ki jo Gemini API Key enter kiya gaya hai, woh **Invalid** hai ya active nahi hai.";
            }

            return res.json({
                reply: `🤖 **[ABHYAS COACH - RESILIENT FALLBACK MODE]**\n\n*⚠️ Note: ${explanation} (Hum yahan temporary simulated coaching mode mein run kar rahe hain taaki aapki preparation halt na ho!)\n\n💡 Tip: Aap settings modal 🔑 mein **OpenRouter API Key** bhi configure kar sakte hain taaki quota limits par automatic cloud fallback active rahe!*\n\n---\n\nBilkul! Main aapki help karta hoon. Aapne poocha: "${message}". \n\nClosures, indexing, or system queries ho — jab bhi hum Gemini API constraints encounter karte hain, ABHYAS intelligent simulations provide karta hai.\n\n### 💡 Key Concept Highlight:\n1. **Lexical Scopes & Closures**: In JS, functions nested inside outer functions always hold on to the variables of their parent context, forming a closure.\n2. **Star Method Behavioral Prep**: Use Situation, Task, Action, Result to anchor your behavioral answers.\n\nBatao Jayesh, aap is question ka mock answer try karna chahte ho? Write it down here, and main use evaluate karke aapko readiness rating doonga!`
            });
        }

        res.status(500).json({ error: "Failed to connect to Gemini API.", details: err.message });
    }
});

module.exports = router;
