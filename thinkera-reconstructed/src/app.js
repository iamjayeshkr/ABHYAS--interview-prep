const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const compilerRouter = require('./routes/compiler');
const mentorRouter = require('./routes/mentor');
const coachRouter = require('./routes/coach');
const abhyasRouter = require('./routes/abhyas');
const staticRouter = require('./routes/static');

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// API route registrations
app.use('/api', compilerRouter);
app.use('/api/mentor', mentorRouter);
app.use('/api/coach', coachRouter);
app.use('/api/abhyas', abhyasRouter);

// Central static routes
app.use('/', staticRouter);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("❌ Unhandled Application Error:", err.stack);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
});

module.exports = app;
