const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { aiClient } = require('../config/ai');

// Asynchronous helper to query local Qwen 2.5:3b model for mentor hints via Ollama
async function tryOllamaMentorFallback(code, language, errorContext, systemPrompt, userPrompt) {
    console.log("🤖 [OLLAMA FALLBACK]: Querying local qwen2.5:3b model for mentor hints...");
    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'qwen2.5:3b',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            stream: false
        })
    });

    if (!ollamaRes.ok) {
        throw new Error(`Ollama HTTP Error: ${ollamaRes.status}`);
    }

    const ollamaData = await ollamaRes.json();
    return ollamaData.message.content;
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

        // Attempt Tier 2 Fallback: Local Qwen 2.5:3b via Ollama
        try {
            const qwenHint = await tryOllamaMentorFallback(code, language, errorContext, systemPrompt, userPrompt);
            console.log("✔ [MENTOR HINT]: Successfully retrieved local Qwen response!");
            return res.json({
                hint: `🤖 **[MENTOR HINT - QWEN2.5 LOCAL AI ACTIVE]**\n\n${qwenHint}`
            });
        } catch (ollamaErr) {
            console.warn("⚠️ [MENTOR HINT]: Local Qwen Ollama fallback failed:", ollamaErr.message);

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
                    hint: `🤖 **[MENTOR HINT - RESILIENT FALLBACK MODE]**\n\n*⚠️ Note: It looks like ${explanation} (Providing intelligent simulation to keep your practice uninterrupted!)*\n\n---\n\nGreat start with your implementation! I've analyzed your logic:\n\n1. **Logic Check**: Make sure your loop indices correctly start from \`i + 1\` if you are checking pair-wise matches, avoiding duplicate element matches.\n2. **Optimization Guide**: Consider using a Hash Map/Object to store already visited numbers. This transforms your search from \`O(N^2)\` time complexity to \`O(N)\`!\n\nTry updating your loop logic or code structure and check again!`
                });
            }

            res.status(500).json({ error: "Failed to connect to Gemini API.", details: err.message });
        }
    }
});

module.exports = router;
