const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const userId = '41a1cfc6-91ae-4fc8-afd8-5dbbbf3922ef';

async function test() {
  try {
    const { data: profile, error: pErr } = await admin
      .from('profiles')
      .select('university')
      .eq('id', userId)
      .maybeSingle();
    console.log('Profile:', profile, 'Err:', pErr);

    const university = profile?.university || 'Campus';
    const { data: existing, error: eErr } = await admin
      .from("rooms")
      .select("id, title")
      .or(`title.ilike.%${university}%Help%,title.ilike.%Academic Help%,title.ilike.%Campus Help%`)
      .limit(5);
    console.log('Existing help rooms:', existing, 'eErr:', eErr);

    let targetRoomId = existing?.[0]?.id;

    if (!targetRoomId) {
      console.log('No existing room, trying create:');
      const { data: newRoom, error: nErr } = await admin
        .from("rooms")
        .insert({
          title: `${university} Academic Help Center`,
          description: "University-wide canonical academic questions, peer troubleshooting, and study assistance.",
          topic: "Academic Help",
          visibility: "public",
          mode: "online",
          capacity: 250,
          owner_id: userId,
          tags: ["help", "qa", "academics"],
          enabled_modules: ["posts", "chat", "learn"],
          default_landing_tab: "learn",
        })
        .select("id")
        .maybeSingle();
      console.log('New room:', newRoom, 'nErr:', nErr);
      targetRoomId = newRoom?.id;
    }

    console.log('targetRoomId:', targetRoomId);

    // Try canonical question insert from help.ts:
    const { data: question, error } = await admin
      .from("room_questions")
      .insert({
        room_id: targetRoomId,
        author_id: userId,
        title: 'Binary search tree insertion algorithm question',
        body: 'How does AVL tree self-balancing work during insertion with right-left rotation?',
        subject: null,
        topic: null,
        urgency: 'normal',
        tags: [],
        is_campus_wide: true,
        image_url: null,
      })
      .select(`
        id, room_id, title, body, is_resolved, upvotes_count, created_at,
        subject, topic, urgency, tags, image_url,
        author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    console.log('Insert result question:', question ? 'SUCCESS' : 'FAILED', 'error:', error);

    // Now test award_reputation_atomic
    if (question) {
      const { data: rep, error: rErr } = await admin.rpc("award_reputation_atomic", {
        p_user_id: userId,
        p_event_type: "doubt_asked",
        p_points: 5,
        p_reference_type: "room_question",
        p_reference_id: question.id,
      });
      console.log('RPC rep result:', rep, 'rErr:', rErr);
    }
  } catch (e) {
    console.error('Exception caught:', e);
  }
}
test();
