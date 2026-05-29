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
function buildAdaptiveSystemPrompt(level, domain, language = 'hinglish') {

    const langLower = language.trim().toLowerCase();
    let languageInstruction = '';
    let hintText = '';
    let scoreLabels = '';
    
    if (langLower === 'english') {
        languageInstruction = 'You must conduct the ENTIRE conversation, feedback, scores, explanations, and respond ONLY in fluent, professional English (absolutely no Hindi, Hinglish, or other languages).';
        hintText = '*[Hint: Want more details? → say "expand"!]*';
        scoreLabels = '💡 Key Strengths / 📈 Growth Areas';
    } else if (langLower === 'hinglish') {
        languageInstruction = 'You must conduct the ENTIRE conversation, feedback, scores, explanations, and respond in natural Hinglish (Hindi + English mix).';
        hintText = '*[Hint: Aur detail chahiye toh → expand karo!]*';
        scoreLabels = '💡 Key Strengths / 📈 Growth Areas';
    } else if (langLower === 'hindi') {
        languageInstruction = 'You must conduct the ENTIRE conversation, feedback, scores, explanations, and respond ONLY in fluent, high-quality Hindi (absolutely no English, Hinglish, or other languages except essential technical words like code names).';
        hintText = '*[संकेत: और विवरण चाहिए तो → "expand" कहें!]*';
        scoreLabels = '💡 मुख्य विशेषताएं / 📈 सुधार के क्षेत्र';
    } else {
        const capitalizedLang = language.trim().charAt(0).toUpperCase() + language.trim().slice(1);
        languageInstruction = `You must conduct the ENTIRE conversation, feedback, scores, explanations, and respond ONLY in fluent, high-quality, and grammatically correct ${capitalizedLang} (absolutely no English, Hinglish, or other languages). All questions, answers, scoring parameters, and explanations must be rendered exclusively in ${capitalizedLang}.`;
        hintText = `An appropriate ending hint translated natively into ${capitalizedLang} (e.g. meaning "Want more details? → say 'expand'!")`;
        scoreLabels = `The exact translation of "💡 Key Strengths / 📈 Growth Areas" in ${capitalizedLang}`;
    }

    // ── Persona core (always applies) ──
    const core = `You are ABHYAS — a highly professional, brilliant, and realistic mentor who explains concepts with complete clarity and genuine depth. You cover technology, science, mathematics, history, economics, philosophy, and more.

You have a key skill: you instantly sense how much the user knows and speak exactly at their level — never talking down to them, and never overcomplicating things.

UNIVERSAL RULES (always follow these):
1. ${languageInstruction}
2. Absolutely DO NOT use generic, superficial, or patronizing filler praises such as "Bahut badiya!", "Accha", "Very good!", "Sahi socha tumne!", "Smart question!" or fake enthusiasm. Keep the evaluation strictly objective and professional. Praise must only be given when there is actual outstanding substance.
3. ALWAYS answer the actual question directly and immediately — no fluff, no introductory filler.
4. For interview answers, score objectively and strictly as: [ABHYAS SCORE: X/10] followed by ${scoreLabels}.
5. Keep replies short by default (2-3 sentences). End with the following hint block: ${hintText}.
6. Only give detailed explanations when user says "expand", "deep-dive", "elaborate", or "tell me more".
7. If a reference document is provided, anchor all feedback to it.
8. ALWAYS use at least ONE real-world analogy or example — something concrete the user can picture in their daily life.`;

    // ── Level-specific tone layer ──
    const levelLayer = {
        child: `
AUDIENCE: You are speaking to a young child (Class 1–5 level, age 6–10).
COMMUNICATION STYLE FOR THIS CHILD:
- Use the SIMPLEST words possible. No jargon at all. If you must use a new word, immediately explain it in brackets.
- Use very short sentences. Max 1-2 sentences per thought.
- Use fun, relatable analogies — toys, food, cartoons, animals, home things (e.g. "think of RAM like a lunch box — it holds only today's food").
- Do NOT use fake praises. Keep feedback realistic and helpful.
- Use emojis moderately to make it visual and clear 🌟🍎🐘🚂
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
- Tone: objective, supportive, serious, never condescending.
- End with a constructive next-step suggestion or challenge.`,

        intermediate: `
AUDIENCE: You are speaking to someone with some knowledge who wants to go deeper.
COMMUNICATION STYLE FOR THIS INTERMEDIATE LEARNER:
- You can use domain terms but briefly confirm understanding ("You already know X, so think of Y as...").
- Give practical examples: real code snippets, real-world applications.
- Explain the "why" behind concepts, not just the "what".
- Encourage deep technical curiosity without sugarcoating.`,

        expert: `
AUDIENCE: You are speaking to a domain expert, researcher, or senior professional.
COMMUNICATION STYLE FOR THIS EXPERT:
- Skip basic explanations. Use precise technical vocabulary fluently.
- Engage as a peer / fellow expert: share nuances, trade-offs, edge cases.
- Reference deeper concepts, papers, or advanced patterns where relevant.
- Use Hinglish/English professionally (depending on preference) — it should feel like two senior engineers having chai ☕ and discussing hard problems.
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
    const { message, context, history, language } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    // ── Detect level + domain for this specific message ──
    const detectedLevel  = detectLevel(message);
    const detectedDomain = detectDomain(message);
    const adaptivePrompt = buildAdaptiveSystemPrompt(detectedLevel, detectedDomain, language);

    console.log(`🧠 [MENTOR ADAPT]: Level="${detectedLevel}" | Domain="${detectedDomain}" | Language="${language || 'hinglish'}"`);

    // ── Cache check (skip for context-anchored or expand requests) ──
    const wantsExpand = /\b(expand|deep.?dive|elaborate|tell me more|detail)\b/i.test(message);
    const cacheKey = getCacheKey(message, detectedLevel);

    if (!context && !wantsExpand) {
        const cached = responseCache.get(cacheKey);
        if (cached) {
            console.log('⚡ [CACHE HIT]: Streaming cached response.');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('x-detected-level', detectedLevel);
            res.setHeader('x-detected-domain', detectedDomain);
            res.setHeader('x-detected-provider', 'cache');

            // Stream cached reply with a sleek virtual typing effect
            const chunkSize = 30;
            for (let i = 0; i < cached.length; i += chunkSize) {
                res.write(cached.slice(i, i + chunkSize));
                await new Promise(resolve => setTimeout(resolve, 8));
            }
            res.end();
            return;
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

    let streamSuccessful = false;
    let providerName = '';
    let fullContent = '';

    // Helper to capture res.write to build cache
    const originalWrite = res.write.bind(res);
    res.write = (chunk) => {
        fullContent += chunk;
        return originalWrite(chunk);
    };

    // ── TIER 1: GROQ (fastest, <500ms) ──
    if (groqKey && !streamSuccessful) {
        try {
            console.log('⚡ [TIER 1 - GROQ]: Streaming Groq...');
            const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey.trim()}`,
                    'HTTP-Referer': 'https://abhyas-interview-prep.vercel.app',
                    'X-Title': 'ABHYAS Prep Terminal'
                },
                body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, stream: true })
            }, 8000);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            providerName = 'groq';
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('x-detected-level', detectedLevel);
            res.setHeader('x-detected-domain', detectedDomain);
            res.setHeader('x-detected-provider', providerName);

            const decoder = new TextDecoder();
            let buffer = '';
            
            for await (const chunk of response.body) {
                buffer += decoder.decode(chunk, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const dataStr = trimmed.slice(6);
                        if (dataStr === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(dataStr);
                            const text = parsed.choices?.[0]?.delta?.content || '';
                            if (text) {
                                res.write(text);
                            }
                        } catch (e) { }
                    }
                }
            }

            console.log('✔ [GROQ]: Stream OK');
            streamSuccessful = true;
        } catch (err) {
            console.warn('⚠️ [GROQ]: Stream failed:', err.message);
            if (res.headersSent) {
                res.write(`\n\n❌ [STREAM INTERRUPTED]: Groq error: ${err.message}`);
                res.end();
                return;
            }
        }
    }

    // ── TIER 2: GEMINI (best quality, 1M context) ──
    if (geminiClient && !streamSuccessful) {
        try {
            console.log('🤖 [TIER 2 - GEMINI]: Streaming Gemini...');
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

            const responseStream = await geminiClient.models.generateContentStream({
                model: 'gemini-2.0-flash',
                contents,
                config: { systemInstruction: adaptivePrompt, temperature: 0.7 }
            });

            providerName = 'gemini';
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('x-detected-level', detectedLevel);
            res.setHeader('x-detected-domain', detectedDomain);
            res.setHeader('x-detected-provider', providerName);

            for await (const chunk of responseStream) {
                if (chunk.text) {
                    res.write(chunk.text);
                }
            }

            console.log('✔ [GEMINI]: Stream OK');
            streamSuccessful = true;
        } catch (err) {
            console.warn('⚠️ [GEMINI]: Stream failed:', err.message);
            if (res.headersSent) {
                res.write(`\n\n❌ [STREAM INTERRUPTED]: Gemini error: ${err.message}`);
                res.end();
                return;
            }
        }
    }

    // ── TIER 3: CEREBRAS (1M tokens/day free) ──
    if (cerebrasKey && !streamSuccessful) {
        try {
            console.log('🧠 [TIER 3 - CEREBRAS]: Streaming Cerebras...');
            const response = await fetchWithTimeout('https://api.cerebras.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cerebrasKey.trim()}`,
                    'HTTP-Referer': 'https://abhyas-interview-prep.vercel.app',
                    'X-Title': 'ABHYAS Prep Terminal'
                },
                body: JSON.stringify({ model: 'llama3.1-70b', messages, stream: true })
            }, 8000);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            providerName = 'cerebras';
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('x-detected-level', detectedLevel);
            res.setHeader('x-detected-domain', detectedDomain);
            res.setHeader('x-detected-provider', providerName);

            const decoder = new TextDecoder();
            let buffer = '';
            
            for await (const chunk of response.body) {
                buffer += decoder.decode(chunk, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const dataStr = trimmed.slice(6);
                        if (dataStr === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(dataStr);
                            const text = parsed.choices?.[0]?.delta?.content || '';
                            if (text) {
                                res.write(text);
                            }
                        } catch (e) { }
                    }
                }
            }

            console.log('✔ [CEREBRAS]: Stream OK');
            streamSuccessful = true;
        } catch (err) {
            console.warn('⚠️ [CEREBRAS]: Stream failed:', err.message);
            if (res.headersSent) {
                res.write(`\n\n❌ [STREAM INTERRUPTED]: Cerebras error: ${err.message}`);
                res.end();
                return;
            }
        }
    }

    // ── TIER 4: OPENROUTER (11+ free models, last resort) ──
    if (openRouterKey && !streamSuccessful) {
        const orModels = ['openrouter/auto', 'meta-llama/llama-3.2-3b-instruct:free', 'qwen/qwen3-coder:free'];
        for (const model of orModels) {
            try {
                console.log(`🌐 [TIER 4 - OPENROUTER]: Streaming OpenRouter model "${model}"...`);
                const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openRouterKey.trim()}`,
                        'HTTP-Referer': 'https://abhyas-interview-prep.vercel.app',
                        'X-Title': 'ABHYAS Prep Terminal'
                    },
                    body: JSON.stringify({ model, messages, stream: true })
                }, 8000);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                providerName = 'openrouter';
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.setHeader('Transfer-Encoding', 'chunked');
                res.setHeader('x-detected-level', detectedLevel);
                res.setHeader('x-detected-domain', detectedDomain);
                res.setHeader('x-detected-provider', providerName);

                const decoder = new TextDecoder();
                let buffer = '';
                
                for await (const chunk of response.body) {
                    buffer += decoder.decode(chunk, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ')) {
                            const dataStr = trimmed.slice(6);
                            if (dataStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(dataStr);
                                const text = parsed.choices?.[0]?.delta?.content || '';
                                if (text) {
                                    res.write(text);
                                }
                            } catch (e) { }
                        }
                    }
                }

                console.log(`✔ [OPENROUTER]: Stream OK via ${model}`);
                streamSuccessful = true;
                break;
            } catch (err) {
                console.warn(`⚠️ [OPENROUTER] "${model}" stream failed:`, err.message);
                if (res.headersSent) {
                    res.write(`\n\n❌ [STREAM INTERRUPTED]: OpenRouter error: ${err.message}`);
                    res.end();
                    return;
                }
            }
        }
    }

    if (streamSuccessful) {
        if (!context && !wantsExpand && fullContent.trim()) {
            cacheSet(cacheKey, fullContent);
        }
        res.end();
    } else {
        // ── All providers failed or no keys at all ──
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('x-detected-level', detectedLevel);
        res.setHeader('x-detected-domain', detectedDomain);
        res.setHeader('x-detected-provider', 'none');

        const hasAnyKey = groqKey || geminiClient || cerebrasKey || openRouterKey;
        const msgText = hasAnyKey
            ? `⚠️ **Sabhi providers temporarily down hain.**\n\nThodi der baad try karo — Groq/OpenRouter free tiers kabhi kabhi busy ho jaate hain.\n\nAapka sawaal tha: *"${message}"*`
            : `⚠️ **Koi API key nahi mili.**\n\nSettings 🔑 mein **Groq** (free, console.groq.com) ya **OpenRouter** (free, openrouter.ai) key add karo — ek bhi kaafi hai!`;

        const chunkSize = 20;
        for (let i = 0; i < msgText.length; i += chunkSize) {
            res.write(msgText.slice(i, i + chunkSize));
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        res.end();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM VOICES LIST PROXY ROUTE
// GET /api/abhyas/voices
// ─────────────────────────────────────────────────────────────────────────────
router.get('/voices', async (req, res) => {
    const elevenKey = req.headers['x-eleven-key'] || process.env.ELEVENLABS_API_KEY || '087f72f83ea442fae1762d2d1a3f920964b542cf2a5a56636907a84c777afee7';

    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: {
                'xi-api-key': elevenKey.trim()
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`ElevenLabs error: ${errText}`);
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('❌ Failed to fetch ElevenLabs voices:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM TEXT-TO-SPEECH PROXY ROUTE
// POST /api/abhyas/tts
// ─────────────────────────────────────────────────────────────────────────────
router.post('/tts', async (req, res) => {
    const { text, provider, voice } = req.body;
    
    const openaiKey = req.headers['x-openai-key'] || process.env.OPENAI_API_KEY || '';
    const elevenKey = req.headers['x-eleven-key'] || process.env.ELEVENLABS_API_KEY || '087f72f83ea442fae1762d2d1a3f920964b542cf2a5a56636907a84c777afee7';

    if (!text) {
        return res.status(400).json({ error: 'Text is required.' });
    }

    try {
        if (provider === 'elevenlabs' && elevenKey) {
            let voiceId = voice || '21m00Tcm4TlvDq8ikWAM'; 
            console.log(`🎙️ [TTS - ElevenLabs]: Fetching available voices for key validation...`);
            
            try {
                const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
                    method: 'GET',
                    headers: {
                        'xi-api-key': elevenKey.trim()
                    }
                });

                if (voicesResponse.ok) {
                    const voicesData = await voicesResponse.json();
                    if (voicesData.voices && voicesData.voices.length > 0) {
                        const voiceList = voicesData.voices;
                        console.log(`✔ [ElevenLabs]: Found ${voiceList.length} voices in account.`);
                        
                        // ElevenLabs blocks "premade" and "cloned" voices for free accounts via the API.
                        // Free accounts can ONLY use voices in the "generated" category (created via Voice Design)!
                        const generatedVoices = voiceList.filter(v => v.category === 'generated');
                        
                        if (generatedVoices.length > 0) {
                            const exists = generatedVoices.some(v => v.voice_id === voiceId);
                            if (!exists) {
                                voiceId = generatedVoices[0].voice_id;
                                console.log(`ℹ [ElevenLabs]: Voice not in "generated" category. Dynamic fallback to first valid generated voice: "${voiceId}" (${generatedVoices[0].name})`);
                            }
                        } else {
                            throw new Error("No 'generated' voice models found in your ElevenLabs account. Free tier API keys can ONLY use voices created via the 'Voice Design' tool. Please log in to elevenlabs.io, go to 'Voices' -> 'Add Voice' -> 'Voice Design', generate a voice, add it to your VoiceLab, and try again! It takes less than a minute and is 100% free.");
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ [ElevenLabs]: Voice listing query failed:', err.message);
                if (err.message.includes("No 'generated' voice models")) {
                    throw err;
                }
            }

            console.log(`🎙️ [TTS - ElevenLabs]: Synthesizing with voice "${voiceId}" using eleven_multilingual_v2...`);
            
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': elevenKey.trim()
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`ElevenLabs error: ${errText}`);
            }

            res.setHeader('Content-Type', 'audio/mpeg');
            for await (const chunk of response.body) {
                res.write(chunk);
            }
            res.end();
            return;
        } 
        
        if (provider === 'openai' && openaiKey) {
            const selectedVoice = voice || 'alloy';
            console.log(`🎙️ [TTS - OpenAI]: Synthesizing voice "${selectedVoice}"...`);

            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiKey.trim()}`
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: selectedVoice
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI error: ${errText}`);
            }

            res.setHeader('Content-Type', 'audio/mpeg');
            for await (const chunk of response.body) {
                res.write(chunk);
            }
            res.end();
            return;
        }

        return res.status(400).json({ error: 'No active premium TTS credentials configured.' });

    } catch (err) {
        console.error('❌ TTS Proxy failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
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
