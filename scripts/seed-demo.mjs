import { createClient } from '../backend/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from '../backend/node_modules/dotenv/lib/main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for .env file
const envPath = path.resolve(__dirname, '../backend/.env');
dotenv.config({ path: envPath });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
    process.exit(1);
}

if (url.includes('supabase.co') && process.env.ALLOW_PRODUCTION_MIGRATION !== 'true') {
    console.error("[ERROR] Production URL detected. Refusing to seed demo data. Use ALLOW_PRODUCTION_MIGRATION=true if you really mean it.");
    process.exit(1);
}

const supabase = createClient(url, key);

async function seed() {
    console.log("=== SEEDING SKILLBRIDGE DEMO DATA ===\n");

    console.log("--- Seeding Skills Catalog ---");
    const skills = [
        { name: "JavaScript", category: "Programming" },
        { name: "Python", category: "Programming" },
        { name: "React Native", category: "Mobile Development" },
        { name: "Machine Learning", category: "Data Science" },
        { name: "Data Structures", category: "Computer Science" },
        { name: "UI/UX", category: "Design" },
        { name: "Research Methodology", category: "Academics" },
        { name: "Public Speaking", category: "Soft Skills" }
    ];

    const { error: skillError } = await supabase.from('skills').upsert(skills, { onConflict: 'name' });
    if (skillError) {
        console.error(`[FAIL] Error seeding skills: ${skillError.message}`);
    } else {
        console.log(`[PASS] Skills catalog seeded successfully.`);
    }

    console.log("\n--- Note on Users & Rooms ---");
    console.log("Demo users and rooms require active Supabase Auth records.");
    console.log("To fully test the app, sign up normally through the Frontend GUI and create rooms there.");
    console.log("This script only seeds global reference catalogs.");

    console.log("\n[SUCCESS] Demo seeding complete.");
}

seed();
