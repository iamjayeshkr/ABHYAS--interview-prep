const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

// Dynamic .env loader to support running via npm or IDE run configurations
function loadEnv() {
    const envPaths = [
        path.join(__dirname, '../../.env'),
        path.join(__dirname, '../../../.env'),
        path.join(__dirname, '../../../vani-reconstructed/.env')
    ];

    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            try {
                const content = fs.readFileSync(envPath, 'utf-8');
                content.split('\n').forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return;
                    
                    const match = trimmed.match(/^([^=]+)=(.*)$/);
                    if (match) {
                        const key = match[1].trim();
                        let val = match[2].trim();
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            val = val.slice(1, -1);
                        }
                        if (!process.env[key]) {
                            process.env[key] = val;
                        }
                    }
                });
                console.log(`✔ Loaded environment from: ${envPath}`);
                break;
            } catch (e) {
                console.warn(`⚠️ Warning: Failed to parse env at ${envPath}:`, e.message);
            }
        }
    }
}

loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let aiClient = null;

if (GEMINI_API_KEY) {
    try {
        // Initialize Gemini using official SDK
        aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        console.log("✔ Gemini AI Client initialized successfully.");
    } catch (e) {
        console.log("⚠️ Error initializing Gemini SDK, falling back to mock mentor: ", e.message);
    }
} else {
    console.log("ℹ No GEMINI_API_KEY found in environment. Mentor will run in fallback simulation mode.");
}

module.exports = {
    aiClient,
    GEMINI_API_KEY
};
