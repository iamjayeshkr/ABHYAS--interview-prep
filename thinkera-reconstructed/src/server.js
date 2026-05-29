const app = require('./app');
const PORT = process.env.PORT || 5001;

// Start Server
app.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`🚀 ThinkEra Backend Server successfully running on: http://localhost:${PORT}`);
    console.log(`=============================================================`);
});
