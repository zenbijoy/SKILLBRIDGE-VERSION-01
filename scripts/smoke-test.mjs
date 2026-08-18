import fs from 'fs';
import path from 'path';
import http from 'http';

console.log("=== SKILLBRIDGE SMOKE TEST ===");

// 1. Check environments
console.log("\n--- Environment Check ---");
const beEnv = fs.existsSync(path.join(process.cwd(), 'backend', '.env'));
const feEnv = fs.existsSync(path.join(process.cwd(), 'frontend', '.env'));

console.log(`Backend .env: ${beEnv ? 'PASS' : 'FAIL (Missing)'}`);
console.log(`Frontend .env: ${feEnv ? 'PASS' : 'FAIL (Missing)'}`);

if (!beEnv || !feEnv) {
    console.warn("[WARNING] Missing .env files! Did you copy the .env.example files?");
}

// 2. Check Backend Health
console.log("\n--- Backend Connectivity Check ---");
const req = http.get('http://localhost:4000/health', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log(`[PASS] Backend is alive (200 OK)`);
            console.log(`Response: ${data}`);
        } else {
            console.log(`[FAIL] Backend returned ${res.statusCode}`);
        }
        
        // 3. Database Check via backend ready endpoint
        http.get('http://localhost:4000/health/ready', (readyRes) => {
            let readyData = '';
            readyRes.on('data', chunk => readyData += chunk);
            readyRes.on('end', () => {
                if (readyRes.statusCode === 200) {
                    console.log(`[PASS] Readiness Check (Database reachable)`);
                    console.log(`Response: ${readyData}`);
                    console.log("\n[SUCCESS] Smoke test completed.");
                } else {
                    console.log(`[FAIL] Readiness Check failed: ${readyRes.statusCode}`);
                    console.log(`Response: ${readyData}`);
                }
            });
        }).on('error', (e) => {
            console.log(`[FAIL] Could not reach backend readiness endpoint. Is it running? (${e.message})`);
        });

    });
}).on('error', (e) => {
    console.log(`[FAIL] Could not reach backend on localhost:4000. Is it running? (${e.message})`);
});
