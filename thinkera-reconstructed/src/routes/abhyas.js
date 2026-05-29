const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { aiClient } = require('../config/ai');

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE CACHE — LRU in-memory cache for common/repeated questions
// Skips the API entirely for repeat queries → saves quota + reduces latency
// ─────────────────────────────────────────────────────────────────────────────
const responseCache = new Map();
const CACHE_MAX_SIZE = 500;

function getCacheKey(message, level) {
    return `${level}:${message.trim().toLowerCase().slice(0, 120)}`;
}

function cacheSet(key, value) {
    if (responseCache.size >= CACHE_MAX_SIZE) {
        responseCache.delete(responseCache.keys().next().value);
    }
    responseCache.set(key, value);
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMEOUT HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPENAI-COMPATIBLE PROVIDER CALL
// ─────────────────────────────────────────────────────────────────────────────
async function callOpenAICompatible(baseUrl, apiKey, model, messages, timeoutMs = 8000) {
    const response = await fetchWithTimeout(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`,
            'HTTP-Referer': 'https://abhyas-interview-prep.vercel.app',
            'X-Title': 'ABHYAS Prep Terminal'
        },
        body: JSON.stringify({ model, messages, stream: false })
    }, timeoutMs);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(`API Error: ${JSON.stringify(data.error)}`);
    if (!data.choices || data.choices.length === 0) throw new Error('Empty choices returned.');

    return data.choices[0].message.content;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD messages array
// ─────────────────────────────────────────────────────────────────────────────
function buildMessages(systemPrompt, message, context, history) {
    const messages = [{ role: 'system', content: systemPrompt }];

    if (history && history.length > 0) {
        history.forEach(msg => messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));
    }

    const userText = context
        ? `[REFERENCE CONTEXT DOCUMENT]:\n${context}\n\n[USER INSTRUCTION]:\n${message}`
        : message;

    messages.push({ role: 'user', content: userText });
    return messages;
}

// ─────────────────────────────────────────────────────────────────────────────
// ███████╗███╗   ███╗ █████╗ ██████╗ ████████╗    ██╗     ███████╗██╗   ██╗███████╗██╗
// ██╔════╝████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝    ██║     ██╔════╝██║   ██║██╔════╝██║
// ███████╗██╔████╔██║███████║██████╔╝   ██║       ██║     █████╗  ██║   ██║█████╗  ██║
// ╚════██║██║╚██╔╝██║██╔══██║██╔══██╗   ██║       ██║     ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║
// ███████║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║       ███████╗███████╗ ╚████╔╝ ███████╗███████╗
// ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝       ╚══════╝╚══════╝  ╚═══╝  ╚══════╝╚══════╝
//
// MENTOR ADAPT ENGINE — detects user's knowledge level from their message
// Returns: 'child' | 'beginner' | 'intermediate' | 'expert'
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects the user's expertise level from vocabulary, question structure,
 * and jargon density. Works across ALL domains — not just tech.
 *
 * Signals used:
 *   child      → very short / simple words / "what is" / "why does" / class-level vocabulary
 *   beginner   → basic how-to questions, no jargon, simple sentence structure
 *   intermediate → some domain terms, moderately structured, "how does X work under hood"
 *   expert     → dense jargon, acronyms, nuanced comparisons, research-level phrasing
 */
function detectLevel(message) {
    // ── Typo normalization: fix common misspellings before pattern matching ──
    const typoMap = {
        'transofrmer': 'transformer', 'transfomer': 'transformer', 'transformr': 'transformer',
        'backpropogation': 'backpropagation',
        'recusion': 'recursion', 'recurssion': 'recursion',
        'algorythm': 'algorithm', 'algorithim': 'algorithm',
        'nueral': 'neural', 'nural': 'neural',
        'learing': 'learning', 'lerning': 'learning',
        'classifcation': 'classification', 'clasification': 'classification',
        'optimzation': 'optimization', 'optmization': 'optimization',
        'gradiant': 'gradient', 'graident': 'gradient',
        'atention': 'attention', 'attension': 'attention',
        'embeding': 'embedding', 'embeddng': 'embedding',
        'tokennizer': 'tokenizer', 'toeknizer': 'tokenizer',
    };
    let normalized = message.trim().toLowerCase();
    // Use word-split replacement (more reliable than regex \b in all runtimes)
    normalized = normalized.split(/\s+/).map(word => typoMap[word] || word).join(' ');
    const msg = normalized;
    const wordCount = msg.split(/\s+/).length;

    // ── EXPERT signals ──
    const expertPatterns = [
        /\b(amortized|asymptotic|eigenvector|stochastic|isomorphic|idempotent|polymorphism|concurrency|race condition|deadlock|entropy|gradient descent|backpropagation|hyperparameter|quantization|transformer|attention mechanism|attention head|self.?attention|multi.?head|positional encoding|tokenizer|embedding|llm|gpt|bert|t5|diffusion model|vae|gan|rlhf|fine.?tun|lora|rag|retrieval augmented|vector database|topology|manifold|differential equation|laplace|fourier|convex optimization|bayes theorem|p-value|multicollinearity|heteroscedasticity|anova|regression coefficient|time complexity|space complexity|big.?o|nlogn|dynamic programming|memoization|dijkstra|bellman.ford|segment tree|fenwick|trie|bitmask|coroutine|async.?await internals|event loop internals|jit compiler|garbage collector|memory leak|heap dump|profiling|benchmark|throughput|latency|p99|sla|slo|cap theorem|acid|base consistency|sharding|replication|consensus|raft|paxos|grpc|protobuf|graphql resolver|oauth|jwt|csrf|xss|sql injection|buffer overflow|zero.day|cve|rce)\b/i,
    ];

    // ── INTERMEDIATE signals ──
    const intermediatePatterns = [
        /\b(api|rest|http|json|database|sql|array|loop|function|class|object|algorithm|recursion|stack|queue|linked list|binary tree|sorting|searching|framework|library|component|state|props|hook|async|promise|callback|closure|prototype|inheritance|interface|module|import|export|variable|pointer|reference|complexity|index|query|schema|migration|deployment|server|client|frontend|backend|full.?stack|machine learning|deep learning|neural network|neural networks|artificial intelligence|natural language|nlp|computer vision|model|training|dataset|feature|layer|activation|loss function|gradient|epoch|batch|overfitting|underfitting|regression|classification|clustering|pca|svm|random forest|photosynthesis|mitosis|meiosis|dna|rna|protein|enzyme|atom|molecule|bond|reaction|periodic table|newton|velocity|acceleration|momentum|force|energy|thermodynamics|entropy|magnetism|electric field|circuit|current|voltage|resistance|integration|differentiation|derivative|limit|matrix|vector|determinant)\b/ig,
    ];

    // ── CHILD signals ──
    const childPatterns = [
        /\b(what is|why does|how does|can you explain|i don.?t understand|what are|tell me about|whats|hows|so like|basically|simply|easy way|in simple words|for kids|class [1-9]|grade [1-9]|school|teacher said|my homework|simple explain)\b/i,
    ];

    // ── Count expert jargon density ──
    let expertScore = 0;
    let intermediateScore = 0;

    expertPatterns.forEach(p => { if (p.test(msg)) expertScore += 3; });
    intermediatePatterns.forEach(p => { const matches = msg.match(p); if (matches) intermediateScore += matches.length; });

    // Child signal only counts if NO domain jargon is present
    // "what is transformer in ml" → child phrase + expert jargon → NOT child
    const childScore = (childPatterns.some(p => p.test(msg)) && expertScore === 0 && intermediateScore === 0) ? 2 : 0;

    // Word-count heuristic: very short simple questions lean child/beginner
    const isVeryShort = wordCount <= 6;
    const hasTechSymbols = /[<>{}()\[\]=+\-*\/\\|&^%$@!`~]/.test(message);
    const hasMath = /\b\d+\s*[\+\-\*\/\^]\s*\d+\b|\bintegral|sigma|sum of|derivative of\b/.test(msg);

    if (hasTechSymbols) expertScore += 2;
    if (hasMath) intermediateScore += 2;

    // Final decision
    // Rule: if ANY domain jargon detected, minimum level is intermediate (never child)
    if (expertScore >= 3) return 'expert';
    if (intermediateScore >= 1) return 'intermediate';   // any jargon → at least intermediate
    if (childScore >= 2 || (isVeryShort && !hasTechSymbols)) return 'child';
    return 'beginner';
}

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN DETECTOR — what field is the user asking about?
// Returns one of: tech | science | math | history | general | interview
// ─────────────────────────────────────────────────────────────────────────────
function detectDomain(message) {
    // Same typo normalization as detectLevel
    const typoMap = {
        'transofrmer': 'transformer', 'transfomer': 'transformer',
        'nueral': 'neural', 'nural': 'neural',
        'learing': 'learning', 'lerning': 'learning',
        'algorythm': 'algorithm', 'gradiant': 'gradient',
    };
    const msg = message.trim().toLowerCase().split(/\s+/).map(w => typoMap[w] || w).join(' ');

    if (/\b(interview|resume|cv|hr|behavioral|star method|tell me about yourself|why should we hire|salary|offer|placement|job|internship|leetcode|system design|mock)\b/.test(msg)) return 'interview';
    if (/\b(code|coding|algorithm|api|database|sql|javascript|python|react|node|server|cloud|deploy|git|docker|kubernetes|linux|compiler|runtime|framework|css|html|frontend|backend|ml|ai|machine learning|deep learning|neural network|neural networks|llm|gpt|bert|transformer|nlp|computer vision|data science|model|training|dataset|tensorflow|pytorch|keras|scikit|numpy|pandas|cuda|gpu training)\b/.test(msg)) return 'tech';
    if (/\b(physics|chemistry|biology|cell|atom|molecule|dna|photosynthesis|evolution|gravity|force|energy|element|periodic|enzyme|ecosystem|organism|species|quantum|relativity)\b/.test(msg)) return 'science';
    if (/\b(math|maths|algebra|geometry|calculus|integral|derivative|matrix|equation|probability|statistics|prime|fraction|percentage|theorem|proof|number|angle|trigonometry)\b/.test(msg)) return 'math';
    if (/\b(history|war|ancient|empire|revolution|independence|civilization|king|queen|president|democracy|politics|economics|gdp|inflation|policy|constitution|amendment)\b/.test(msg)) return 'history';

    return 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTIVE SYSTEM PROMPT BUILDER
// Builds a tailored system prompt based on detected level + domain
// ─────────────────────────────────────────────────────────────────────────────
function buildAdaptiveSystemPrompt(level, domain) {

    // ── Persona core (always applies) ──
    const core = `You are ABHYAS — a brilliant, warm, and endlessly patient mentor who can explain ANYTHING from ANY domain of human knowledge: technology, science, mathematics, history, economics, philosophy, arts, and more.

You have a magical superpower: you instantly sense how much the user knows and speak EXACTLY at their level — never too simple, never too complex.

UNIVERSAL RULES (always follow these):
1. Speak in natural Hinglish (Hindi + English mix) with a warm, encouraging masculine tone.
2. ALWAYS answer the actual question directly — never go off-topic.
3. For interview answers, score as: [ABHYAS SCORE: X/10] with 👍 Kya accha tha / 🔧 Kahan improvement chahiye.
4. Keep replies short by default (2-3 sentences). End with: *[Hint: Aur detail chahiye toh → expand karo!]*
5. Only give detailed explanations when user says "expand", "deep-dive", "elaborate", or "tell me more".
6. If a reference document is provided, anchor all feedback to it.
7. ALWAYS use at least ONE real-world analogy or example — something the user can picture in their daily life.`;

    // ── Level-specific tone layer ──
    const levelLayer = {
        child: `
AUDIENCE: You are speaking to a young child (Class 1–5 level, age 6–10).
COMMUNICATION STYLE FOR THIS CHILD:
- Use the SIMPLEST words possible. No jargon at all. If you must use a new word, immediately explain it in brackets.
- Use very short sentences. Max 1-2 sentences per thought.
- Use fun, relatable analogies — toys, food, cartoons, animals, home things (e.g. "think of RAM like a lunch box — it holds only today's food").
- Add encouraging words: "Bahut badiya!", "Sahi socha tumne!", "Kya smart question hai!"
- Use emojis generously to make it visual and playful 🌟🍎🐘🚂
- Never use mathematical notation or complex diagrams.
- If domain is 'tech': compare to toys, games, magic.
- If domain is 'science': compare to animals, kitchen, sky, body.
- If domain is 'math': use apples, chocolates, counting fingers.`,

        beginner: `
AUDIENCE: You are speaking to a complete beginner / fresher (someone who is new to this topic).
COMMUNICATION STYLE FOR THIS BEGINNER:
- Avoid heavy jargon. When you must use a term, explain it in one simple sentence.
- Use relatable real-world analogies (e.g. "Array is like a row of lockers in school — each locker has a number").
- Build up from the simplest version first, then add one layer of depth.
- Tone: friendly, encouraging, never condescending.
- End with a "Try this" challenge or a simple next-step suggestion.`,

        intermediate: `
AUDIENCE: You are speaking to someone with some knowledge who wants to go deeper.
COMMUNICATION STYLE FOR THIS INTERMEDIATE LEARNER:
- You can use domain terms but briefly confirm understanding ("You already know X, so think of Y as...").
- Give practical examples: real code snippets, real experiments, real-world applications.
- Explain the "why" behind concepts, not just the "what".
- Encourage curiosity: "Isko samajhne ke baad, tum Z bhi explore karo!"`

,
        expert: `
AUDIENCE: You are speaking to a domain expert, researcher, or senior professional.
COMMUNICATION STYLE FOR THIS EXPERT:
- Skip basic explanations. Use precise technical vocabulary fluently.
- Engage as a peer / fellow expert: share nuances, trade-offs, edge cases.
- Reference deeper concepts, papers, or advanced patterns where relevant.
- Use Hinglish professionally — it should feel like two senior engineers having chai ☕ and discussing hard problems.
- For interview prep: push hard on depth, edge cases, system design trade-offs, and follow-up probing questions.`
    };

    // ── Domain-specific addition ──
    const domainLayer = {
        tech:      `\nDOMAIN CONTEXT: This is a technology/coding question. Use programming examples, system analogies, and code where helpful.`,
        science:   `\nDOMAIN CONTEXT: This is a science question. Use nature, lab, and everyday-life examples. Make abstract science feel tangible.`,
        math:      `\nDOMAIN CONTEXT: This is a mathematics question. Show the intuition FIRST, then the formula. Use visual/physical analogies before symbols.`,
        history:   `\nDOMAIN CONTEXT: This is a history/social science question. Use storytelling, connect events to cause-and-effect chains, and make it feel like a vivid story.`,
        interview: `\nDOMAIN CONTEXT: This is an interview preparation question. Apply the STAR method where relevant, score answers, and give actionable improvement tips.`,
        general:   `\nDOMAIN CONTEXT: This is a general knowledge question. Be comprehensive yet concise. Connect the topic to everyday Indian life where possible.`
    };

    return `${core}\n${levelLayer[level] || levelLayer.beginner}\n${domainLayer[domain] || domainLayer.general}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CHAT ROUTE
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
    const { message, context, history } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    // ── Detect level + domain for this specific message ──
    const detectedLevel  = detectLevel(message);
    const detectedDomain = detectDomain(message);
    const adaptivePrompt = buildAdaptiveSystemPrompt(detectedLevel, detectedDomain);

    console.log(`🧠 [MENTOR ADAPT]: Level="${detectedLevel}" | Domain="${detectedDomain}"`);

    // ── Cache check (skip for context-anchored or expand requests) ──
    const wantsExpand = /\b(expand|deep.?dive|elaborate|tell me more|detail)\b/i.test(message);
    const cacheKey = getCacheKey(message, detectedLevel);

    if (!context && !wantsExpand) {
        const cached = responseCache.get(cacheKey);
        if (cached) {
            console.log('⚡ [CACHE HIT]: Returning cached response.');
            return res.json({ reply: cached, cached: true, level: detectedLevel, domain: detectedDomain });
        }
    }

    // ── Resolve API keys: header (user) → env → empty ──
    const groqKey       = req.headers['x-groq-key']       || process.env.GROQ_API_KEY       || '';
    const userGeminiKey = req.headers['x-api-key']        || process.env.GEMINI_API_KEY      || '';
    const cerebrasKey   = req.headers['x-cerebras-key']   || process.env.CEREBRAS_API_KEY    || '';
    const openRouterKey = req.headers['x-openrouter-key'] || process.env.OPENROUTER_API_KEY  || '';

    // Build Gemini client from whichever key is available
    let geminiClient = aiClient; // server-env key (already initialized in config/ai.js)
    if (userGeminiKey && userGeminiKey !== (process.env.GEMINI_API_KEY || '')) {
        try {
            geminiClient = new GoogleGenAI({ apiKey: userGeminiKey });
        } catch (e) {
            console.error('❌ Failed to init Gemini client:', e.message);
            geminiClient = null;
        }
    }

    const messages = buildMessages(adaptivePrompt, message, context, history);

    // ─────────────────────────────────────────────────────────────────────────
    // FLAT CASCADE — try each provider independently, stop at first success.
    // ANY single key working = full response. Order: Groq → Gemini → Cerebras → OpenRouter
    // ─────────────────────────────────────────────────────────────────────────

    // ── TIER 1: GROQ (fastest, <500ms) ──
    if (groqKey) {
        try {
            console.log('⚡ [TIER 1 - GROQ]: Trying Groq...');
            const content = await callOpenAICompatible(
                'https://api.groq.com/openai/v1/chat/completions',
                groqKey, 'llama-3.3-70b-versatile', messages, 8000
            );
            console.log('✔ [GROQ]: OK');
            if (!context && !wantsExpand) cacheSet(cacheKey, content);
            return res.json({ reply: content, provider: 'groq', level: detectedLevel, domain: detectedDomain });
        } catch (err) {
            console.warn('⚠️ [GROQ]: Failed:', err.message);
        }
    }

    // ── TIER 2: GEMINI (best quality, 1M context) ──
    if (geminiClient) {
        try {
            console.log('🤖 [TIER 2 - GEMINI]: Trying Gemini...');
            const contents = [];
            if (history && history.length > 0) {
                history.forEach(msg => contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                }));
            }
            const userText = context
                ? `[REFERENCE CONTEXT DOCUMENT]:\n${context}\n\n[USER INSTRUCTION]:\n${message}`
                : message;
            contents.push({ role: 'user', parts: [{ text: userText }] });
            const response = await geminiClient.models.generateContent({
                model: 'gemini-2.0-flash',
                contents,
                config: { systemInstruction: adaptivePrompt, temperature: 0.7 }
            });
            console.log('✔ [GEMINI]: OK');
            if (!context && !wantsExpand) cacheSet(cacheKey, response.text);
            return res.json({ reply: response.text, provider: 'gemini', level: detectedLevel, domain: detectedDomain });
        } catch (err) {
            console.warn('⚠️ [GEMINI]: Failed:', err.message);
        }
    }

    // ── TIER 3: CEREBRAS (1M tokens/day free) ──
    if (cerebrasKey) {
        try {
            console.log('🧠 [TIER 3 - CEREBRAS]: Trying Cerebras...');
            const content = await callOpenAICompatible(
                'https://api.cerebras.ai/v1/chat/completions',
                cerebrasKey, 'llama3.1-70b', messages, 8000
            );
            console.log('✔ [CEREBRAS]: OK');
            if (!context && !wantsExpand) cacheSet(cacheKey, content);
            return res.json({ reply: content, provider: 'cerebras', level: detectedLevel, domain: detectedDomain });
        } catch (err) {
            console.warn('⚠️ [CEREBRAS]: Failed:', err.message);
        }
    }

    // ── TIER 4: OPENROUTER (11+ free models, last resort) ──
    if (openRouterKey) {
        const orModels = ['openrouter/auto', 'meta-llama/llama-3.2-3b-instruct:free', 'qwen/qwen3-coder:free'];
        for (const model of orModels) {
            try {
                console.log(`🌐 [TIER 4 - OPENROUTER]: Trying model "${model}"...`);
                const content = await callOpenAICompatible(
                    'https://openrouter.ai/api/v1/chat/completions',
                    openRouterKey, model, messages, 8000
                );
                console.log(`✔ [OPENROUTER]: OK via ${model}`);
                if (!context && !wantsExpand) cacheSet(cacheKey, content);
                return res.json({ reply: content, provider: 'openrouter', level: detectedLevel, domain: detectedDomain });
            } catch (e) {
                console.warn(`⚠️ [OPENROUTER] "${model}" failed:`, e.message);
            }
        }
    }

    // ── All providers failed or no keys at all ──
    const hasAnyKey = groqKey || geminiClient || cerebrasKey || openRouterKey;
    return res.json({
        reply: hasAnyKey
            ? `⚠️ **Sabhi providers temporarily down hain.**\n\nThodi der baad try karo — Groq/OpenRouter free tiers kabhi kabhi busy ho jaate hain.\n\nAapka sawaal tha: *"${message}"*`
            : `⚠️ **Koi API key nahi mili.**\n\nSettings 🔑 mein **Groq** (free, console.groq.com) ya **OpenRouter** (free, openrouter.ai) key add karo — ek bhi kaafi hai!`,
        provider: 'none',
        level: detectedLevel,
        domain: detectedDomain
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL DETECTION UTILITY ROUTE — lets the frontend show level badge
// POST /api/abhyas/detect-level  { message }
// Returns { level, domain }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/detect-level', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const level  = detectLevel(message);
    const domain = detectDomain(message);
    res.json({ level, domain });
});

module.exports = router;
