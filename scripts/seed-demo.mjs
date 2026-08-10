import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Check for .env file
const envPath = path.join(process.cwd(), 'backend', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#\s][^=]+)="?(.*?)"?$/);
        if (match) {
            process.env[match[1]] = match[2];
        }
    });
}

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
        { name: "JavaScript", category: "Programming", icon: "code" },
        { name: "Python", category: "Programming", icon: "code" },
        { name: "React Native", category: "Mobile Development", icon: "smartphone" },
        { name: "Machine Learning", category: "Data Science", icon: "cpu" },
        { name: "Data Structures", category: "Computer Science", icon: "database" },
        { name: "UI/UX", category: "Design", icon: "pen-tool" },
        { name: "Research Methodology", category: "Academics", icon: "book-open" },
        { name: "Public Speaking", category: "Soft Skills", icon: "mic" }
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
