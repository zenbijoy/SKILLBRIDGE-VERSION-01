import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envLines = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const { createApp } = await import('../backend/dist/app.js');
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createClient } = require('../backend/node_modules/@supabase/supabase-js');

const app = createApp();

const env = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const anonKey = env.match(/SUPABASE_ANON_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);
const anonClient = createClient(url, anonKey);

const PORT = 4005;
const server = app.listen(PORT, async () => {
  console.log(`Test backend listening on http://localhost:${PORT}`);
  try {
    await runFullSuite();
  } catch (e) {
    console.error("Suite fatal error:", e);
  } finally {
    server.close();
    process.exit(0);
  }
});

async function getAuthToken() {
  const { data: linkData } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'sahabijoy20062022@gmail.com'
  });
  const hashed_token = linkData.properties.hashed_token;
  const { data: verifyData } = await anonClient.auth.verifyOtp({
    token_hash: hashed_token,
    type: 'magiclink'
  });
  return verifyData.session.access_token;
}

async function runFullSuite() {
  const token = await getAuthToken();
  const BASE_URL = `http://localhost:${PORT}/api/v1`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

  const results = [];
  let testClubId = null;
  let testPostId = null;
  let testEventId = null;
  let testRecruitmentId = null;
  let testApplicationId = null;
  let testTeamId = null;
  let testProjectId = null;
  let testTaskId = null;
  let testResourceId = null;
  let testAchievementId = null;
  let attendanceCode = null;

  async function test(name, fn) {
    try {
      const res = await fn();
      results.push({ name, passed: true, detail: res });
      console.log(`[PASS] ${name}`);
    } catch (err) {
      results.push({ name, passed: false, error: err.message });
      console.error(`[FAIL] ${name}:`, err.message);
    }
  }

  // 1. Create Club
  await test("1. POST /clubs - Create Club", async () => {
    const res = await fetch(`${BASE_URL}/clubs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `RUET Robotics Test Suite ${Date.now()}`,
        tagline: "Innovating Robotics and Autonomous Systems",
        description: "Official club suite test verifying all 100% club capabilities.",
        category: "Technology",
        university: "Rajshahi University of Engineering & Technology",
        department: "Computer Science & Engineering",
        membership_type: "open",
        mission: "Build autonomous machines",
        vision: "Pioneer robotics in Bangladesh",
        contact_email: "robotics@ruet.ac.bd"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testClubId = data.club?.id || data.id;
    if (!testClubId) throw new Error("No club id returned");
    return `Club ID: ${testClubId}`;
  });

  if (!testClubId) {
    console.error("Stopping suite: cannot create club.");
    return;
  }

  // 2. GET /clubs/:id - Club details & tabs data
  await test("2. GET /clubs/:id - Club Profile Tabs Data", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    if (!data.club) throw new Error("No club profile returned");
    return `Verified role: ${data.club.my_role}, is_member: ${data.club.is_member}`;
  });

  // 3. PATCH /clubs/:id/settings - Update Club Settings
  await test("3. PATCH /clubs/:id/settings - Update Club Settings", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/settings`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        tagline: "Updated Tagline for Testing",
        contact_phone: "+8801700000000"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return "Settings updated";
  });

  // 4. POST /clubs/:id/follow - Toggle Follow
  await test("4. POST /clubs/:id/follow - Toggle Follow", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/follow`, {
      method: "POST",
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `Following: ${data.following}`;
  });

  // 5. GET /clubs/:id/members - Directory
  await test("5. GET /clubs/:id/members - List Members", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/members`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `Member count: ${data.members.length}`;
  });

  // 6. Community Feed: POST /clubs/:id/posts
  await test("6. POST /clubs/:id/posts - Create Post & Announcement", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "announcement",
        title: "Welcome to our RoboTech Suite Test",
        content: "We are testing the complete club architecture end to end.",
        is_pinned: true
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testPostId = data.post.id;
    return `Post ID: ${testPostId}`;
  });

  // 7. Post Likes & Comments
  await test("7. POST /clubs/posts/:id/like - Like Post", async () => {
    const res = await fetch(`${BASE_URL}/clubs/posts/${testPostId}/like`, {
      method: "POST",
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `Liked: ${data.liked}`;
  });

  await test("8. POST /clubs/posts/:id/comments - Add Comment", async () => {
    const res = await fetch(`${BASE_URL}/clubs/posts/${testPostId}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: "Excited for this club launch!" })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `Comment ID: ${data.comment.id}`;
  });

  // 9. Events: POST /clubs/:id/events
  await test("9. POST /clubs/:id/events - Create Event with Attendance Code", async () => {
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Autonomous Robotics Workshop 2026",
        description: "Hands-on micro-controller coding and sensor fusion.",
        starts_at: startsAt,
        ends_at: endsAt,
        location: "RUET CSE Seminar Hall",
        venue_type: "offline",
        capacity: 100
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testEventId = data.event.id;
    attendanceCode = data.event.attendance_code;
    return `Event ID: ${testEventId}, Code: ${attendanceCode}`;
  });

  // 10. Event Registration & Calendar Sync
  await test("10. POST /clubs/events/:id/register - Register with Calendar Auto-Sync", async () => {
    const res = await fetch(`${BASE_URL}/clubs/events/${testEventId}/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({ addToCalendar: true })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `Registered: ${data.registered}, count: ${data.count}`;
  });

  // 11. Event Check-in
  await test("11. POST /clubs/events/:id/checkin - Verify Attendance Code", async () => {
    const res = await fetch(`${BASE_URL}/clubs/events/${testEventId}/checkin`, {
      method: "POST",
      headers,
      body: JSON.stringify({ code: attendanceCode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `Attendance: ${data.message}`;
  });

  // 12. Recruitment: POST /clubs/:id/recruitments
  await test("12. POST /clubs/:id/recruitments - Launch Recruitment Campaign", async () => {
    const deadline = new Date(Date.now() + 7 * 86400000).toISOString();
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/recruitments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Spring 2026 Core Executive Recruitment",
        description: "Join the robotics team as firmware developer or event coordinator.",
        open_positions: ["Firmware Lead", "Event Coordinator"],
        required_skills: ["C++", "ROS", "Electronics"],
        deadline
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testRecruitmentId = data.recruitment.id;
    return `Recruitment ID: ${testRecruitmentId}`;
  });

  // 13. Apply for Recruitment
  await test("13. POST /clubs/:id/recruitments/:recId/apply - Submit Application", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/recruitments/${testRecruitmentId}/apply`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        applied_position: "Firmware Lead",
        statement: "Passionate about embedded systems and autonomous drones.",
        portfolio_url: "https://github.com/testuser"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testApplicationId = data.application.id;
    return `Application ID: ${testApplicationId}`;
  });

  // 14. Review Applications (Kanban stage transition)
  await test("14. PATCH /clubs/applications/:id - Kanban Pipeline Transition", async () => {
    const res = await fetch(`${BASE_URL}/clubs/applications/${testApplicationId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        status: "shortlisted",
        review_notes: "Strong firmware profile, proceed to interview."
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `New status: ${data.application.status}`;
  });

  // 15. Teams & Projects
  await test("15. POST /clubs/:id/teams - Create Sub-Team", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/teams`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Drone Development Wing",
        description: "Autonomous quadcopters and computer vision systems"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testTeamId = data.team.id;
    return `Team ID: ${testTeamId}`;
  });

  await test("16. POST /clubs/:id/projects - Create Club Project", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Autonomous Search & Rescue Drone",
        description: "Aerial mapping and human detection with onboard AI.",
        team_id: testTeamId,
        status: "active"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testProjectId = data.project.id;
    return `Project ID: ${testProjectId}`;
  });

  await test("17. POST /clubs/projects/:id/tasks - Create Project Task", async () => {
    const res = await fetch(`${BASE_URL}/clubs/projects/${testProjectId}/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Configure Optical Flow Sensor",
        priority: "high"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testTaskId = data.task.id;
    return `Task ID: ${testTaskId}`;
  });

  // 18. Resources & Achievements
  await test("18. POST /clubs/:id/resources - Share Resource", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/resources`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "ROS 2 Navigation & SLAM Handbook",
        url: "https://example.com/ros2-handbook.pdf",
        category: "Learning"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testResourceId = data.resource.id;
    return `Resource ID: ${testResourceId}`;
  });

  await test("19. POST /clubs/:id/achievements - Add Club Achievement", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/achievements`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "National Robotics Olympiad 2026 Champion",
        description: "1st Place in Autonomous Line-Following & Obstacle Avoidance.",
        date: "2026-02-15"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    testAchievementId = data.achievement.id;
    return `Achievement ID: ${testAchievementId}`;
  });

  // 20. Analytics
  await test("20. GET /clubs/:id/analytics - Club Management Analytics", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/analytics`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return JSON.stringify(data.analytics);
  });

  // 21. Workspace (Room OS)
  await test("21. GET /clubs/:id/workspace - Room OS Collaboration Space", async () => {
    const res = await fetch(`${BASE_URL}/clubs/${testClubId}/workspace`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
    return `Room OS Room ID: ${data.roomId}`;
  });

  // Cleanup
  console.log("\n--- Cleaning up test artifacts ---");
  await adminClient.from("clubs").delete().eq("id", testClubId);
  console.log("Deleted test club:", testClubId);

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n========================================`);
  console.log(`TEST SUITE FINISHED: ${passed}/${total} PASSED`);
  console.log(`========================================`);
}
