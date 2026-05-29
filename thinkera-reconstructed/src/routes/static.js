const express = require('express');
const router = express.Router();
const path = require('path');

// serving HTML files
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../communication-coach/vani_terminal.html'));
});

router.get('/coach', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../communication-coach/coach_client.html'));
});

router.get('/playground', (req, res) => {
    res.sendFile(path.join(__dirname, '../../editor_client.html'));
});

// serve sprite assets
router.get('/assets/sprites/download.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../Sprites/download.png'));
});

module.exports = router;
