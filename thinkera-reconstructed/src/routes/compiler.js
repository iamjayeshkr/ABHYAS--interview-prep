const express = require('express');
const router = express.Router();

// Mock database problem test cases: Two Sum problem
const TWO_SUM_TEST_CASES = [
    { input: "[2,7,11,15], 9", expected: "[0,1]" },
    { input: "[3,2,4], 6", expected: "[1,2]" },
    { input: "[3,3], 6", expected: "[0,1]" }
];

router.post('/run', (req, res) => {
    const { code, language } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Source code is required." });
    }

    console.log(`\n⚙ Evaluating submission for Language: ${language}...`);

    // Simple heuristic parser for mock validation
    const isCpp = language === 'cpp';
    const codeLower = code.toLowerCase();
    
    let hasTargetLogic = false;
    if (isCpp) {
        // Checking if user has Two Sum loop / mapping logic
        hasTargetLogic = codeLower.includes("unordered_map") || (codeLower.includes("for") && codeLower.includes("vector"));
    } else {
        // JavaScript logic check
        hasTargetLogic = codeLower.includes("map") || codeLower.includes("new map") || codeLower.includes("for");
    }

    // Generate test case results
    const results = [];
    let passedCount = 0;

    TWO_SUM_TEST_CASES.forEach((tc, idx) => {
        const passed = hasTargetLogic; // Mock compiler result based on basic presence of loops/hashmap
        if (passed) passedCount++;
        
        results.push({
            testCase: idx + 1,
            input: tc.input,
            expected: tc.expected,
            actual: passed ? tc.expected : "[] (Compilation failed or empty array returned)",
            status: passed ? "PASSED" : "FAILED"
        });
    });

    const overallStatus = passedCount === TWO_SUM_TEST_CASES.length ? "ACCEPTED" : "WRONG ANSWER";

    res.json({
        status: overallStatus,
        passed: passedCount,
        total: TWO_SUM_TEST_CASES.length,
        details: results
    });
});

module.exports = router;
