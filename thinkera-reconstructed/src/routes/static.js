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

router.get('/assets/sprites/snorlax.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../Sprites/Gemini_Generated_Image_ldyxzildyxzildyx.png'));
});

router.get('/assets/sprites/mypic.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../Sprites/Mypic/mypic.jpeg'));
});

router.get('/assets/sprites/guide_groq.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../Sprites/guide_groq.png'));
});

router.get('/assets/sprites/guide_gemini.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../Sprites/guide_gemini.png'));
});

router.get('/assets/sprites/guide_eleven.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../Sprites/guide_eleven.png'));
});

router.get('/assets/sprites/guide_save.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../Sprites/guide_save.png'));
});

module.exports = router;
