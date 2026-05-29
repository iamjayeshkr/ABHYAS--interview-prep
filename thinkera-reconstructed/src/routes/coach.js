const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const COACH_HISTORY_PATH = path.join(__dirname, '../../../communication-coach/coach_history.json');

router.get('/history', (req, res) => {
    if (!fs.existsSync(COACH_HISTORY_PATH)) {
        return res.json({ history: [] });
    }
    try {
        const fileContent = fs.readFileSync(COACH_HISTORY_PATH, 'utf-8');
        const history = JSON.parse(fileContent || '[]');
        res.json({ history });
    } catch (e) {
        console.error("❌ Error reading coach history:", e.message);
        res.status(500).json({ error: "Failed to read history logs." });
    }
});

router.post('/log', (req, res) => {
    const { question, category, duration_seconds, self_rating, notes } = req.body;

    if (!question || !category || self_rating === undefined) {
        return res.status(400).json({ error: "Missing required logging fields." });
    }

    const logEntry = {
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        category,
        question,
        duration_seconds: parseInt(duration_seconds) || 0,
        self_rating: parseInt(self_rating) || 3,
        notes: notes || ""
    };

    let history = [];
    try {
        const dirPath = path.dirname(COACH_HISTORY_PATH);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        if (fs.existsSync(COACH_HISTORY_PATH)) {
            const fileContent = fs.readFileSync(COACH_HISTORY_PATH, 'utf-8');
            history = JSON.parse(fileContent || '[]');
        }

        history.push(logEntry);
        fs.writeFileSync(COACH_HISTORY_PATH, JSON.stringify(history, null, 4), 'utf-8');
        res.json({ success: true, entry: logEntry });
    } catch (e) {
        console.error("❌ Error writing coach history:", e.message);
        res.status(500).json({ error: "Failed to log practice session." });
    }
});

module.exports = router;
