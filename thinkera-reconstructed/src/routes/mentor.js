const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { aiClient } = require('../config/ai');

// Asynchronous helper to query cloud models via OpenRouter with resilient model candidate cascade for mentor hints
async function tryOpenRouterMentorFallback(code, language, errorContext, systemPrompt, userPrompt, openRouterKey) {
    if (!openRouterKey) {
        throw new Error("No OpenRouter Key provided.");
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    const candidateModels = [
        'qwen/qwen-2.5-coder-32b-instruct:free',
        'meta-llama/llama-3-8b-instruct:free',
        'google/gemma-2-9b-it:free',
        'openrouter/free'
    ];

    let lastError = null;
    for (const model of candidateModels) {
        try {
            console.log(`🤖 [OPENROUTER CLOUD FALLBACK]: Querying cloud model "${model}" for mentor hints...`);
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openRouterKey.trim()}`,
                    'HTTP-Referer': 'http://localhost:5001',
                    'X-Title': 'ThinkEra DSA Mentor'
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

router.post('/hint', async (req, res) => {
    const { code, language, errorContext, problemStatement } = req.body;

    const systemPrompt = `
You are a highly encouraging, elite technical mentor at ThinkEra, a premier DSA learning platform.
Your goal is to guide students to fix their logic bugs in C++ or JavaScript.

CRITICAL RULES:
1. Do NOT write or provide the corrected code solution under any circumstances.
2. Read the user's code, identify their logical error (e.g. out of bounds, wrong condition, missing base case).
3. Explain the logic issue clearly and simply.
4. Give a small, strategic hint or ask a guiding question to lead them to the correct answer themselves.
5. Keep your tone supportive, motivating, and highly professional.
`;

    const userPrompt = `
Problem: Two Sum (Find indices of the two numbers that add up to target).
User's Language: ${language}
User's Code:
\`\`\`${language}
${code}
\`\`\`

Compile / Logic Error Context:
${errorContext || "Code runs but failed test cases."}

Explain my bug and give me a helpful hint without showing me the solution.
`;

    const userApiKey = req.headers['x-api-key'];
    const openRouterKey = req.headers['x-openrouter-key'];
    let activeClient = aiClient;

    if (userApiKey) {
        console.log(`🔑 [MENTOR HINT]: User API Key header detected! Prefix: "${userApiKey.substring(0, 6)}...". Instantiating custom SDK client.`);
        try {
            activeClient = new GoogleGenAI({ apiKey: userApiKey });
        } catch (e) {
            console.error("❌ Failed to initialize user-provided Gemini SDK client:", e.message);
        }
    } else {
        console.log("ℹ [MENTOR HINT]: No custom API Key found in headers. Utilizing default server credentials.");
    }

    if (!activeClient) {
        // Fallback Mock Mentor response if no API key is provided
        console.log("🤖 Running simulated mentor fallback...");
        
        // Custom smart mock responses based on code features
        let hint = "It looks like your code is missing some elements. Ensure you are either using a nested loop to check all pairs (O(N^2) time) or a Hash Map to store values and lookup complements in O(N) time!";
        if (code.toLowerCase().includes("for") && !code.toLowerCase().includes("map")) {
            hint = "Great start with the loop! Right now, you are iterating through the elements. If you are doing a nested loop, make sure your inner loop starts at 'i + 1' to avoid matching an element with itself, and check if arr[i] + arr[j] equals the target.";
        }
        
        return res.json({
            hint: `🤖 [SIMULATED MENTOR]\n\n${hint}\n\n*Note: To enable live AI mentor hints, click the '🔑 Set API Key' button at the top right of the terminal and enter your own Gemini API Key!*`
        });
    }

    try {
        console.log("🤖 Querying Gemini API for contextual hint...");
        
        // Request completion using the new google-genai SDK format
        const response = await activeClient.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: userPrompt,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.3
            }
        });

        res.json({
            hint: response.text
        });
    } catch (err) {
        console.error("❌ Gemini API Error in Mentor Hint:", err.message);

        // Attempt Tier 2 Fallback: Cloud OpenRouter Cascade Fallback
        if (openRouterKey) {
            try {
                const { content, modelUsed } = await tryOpenRouterMentorFallback(code, language, errorContext, systemPrompt, userPrompt, openRouterKey);
                console.log(`✔ [MENTOR HINT]: Successfully retrieved cloud OpenRouter response using ${modelUsed}!`);
                return res.json({
                    hint: `🤖 **[MENTOR HINT - CLOUD FALLBACK ACTIVE (${modelUsed})]**\n\n${content}`
                });
            } catch (openRouterErr) {
                console.warn("⚠️ [MENTOR HINT]: Cloud OpenRouter fallback failed:", openRouterErr.message);
            }
        }

        // Tier 3 Fallback: Graceful simulated text hints
        const isQuotaExceeded = err.message.toLowerCase().includes("quota") || err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED");
        const isKeyInvalid = err.message.toLowerCase().includes("key not valid") || err.message.includes("400") || err.message.toLowerCase().includes("invalid_argument") || err.message.toLowerCase().includes("api_key_invalid");

        if (isQuotaExceeded || isKeyInvalid) {
            console.log("ℹ [MENTOR HINT]: API Key has quota limits or is invalid. Engaging simulated fallback.");

            let explanation = "API Key is rate-limited (429) or has a zero-limit quota constraint on this model.";
            if (isKeyInvalid) {
                explanation = "the API Key entered is invalid or active parameters failed to resolve.";
            }

            return res.json({
                hint: `🤖 **[MENTOR HINT - RESILIENT FALLBACK MODE]**\n\n*⚠️ Note: It looks like ${explanation} (Providing intelligent simulation to keep your practice uninterrupted!)\n\n💡 Tip: Aap settings modal 🔑 mein **OpenRouter API Key** bhi configure kar sakte hain taaki quota exhaustion par automatic cloud fallback active rahe!*`
            });
        }

        res.status(500).json({ error: "Failed to connect to Gemini API.", details: err.message });
    }
});

module.exports = router;
