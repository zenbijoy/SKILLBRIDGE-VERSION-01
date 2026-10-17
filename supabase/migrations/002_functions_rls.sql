create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,username)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','New member'),'user_'||substr(replace(new.id::text,'-',''),1,10));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.join_room_atomic(p_room_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.rooms; existing boolean;
begin
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if r.status not in ('open','scheduled','live') then raise exception 'Room closed'; end if;
  select exists(select 1 from public.room_members where room_id=p_room_id and user_id=p_user_id) into existing;
  if existing then return jsonb_build_object('already_member',true,'member_count',r.member_count); end if;
  if r.member_count>=r.capacity then raise exception 'Room full'; end if;
  if r.visibility='invite_only' then raise exception 'Invite required'; end if;
  insert into public.room_members(room_id,user_id,role) values(p_room_id,p_user_id,'member');
  update public.rooms set member_count=member_count+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('joined',true,'member_count',r.member_count+1);
end $$;

create or replace function public.recompute_reputation(p_user_id uuid) returns void language sql security definer set search_path=public as $$
  update public.profiles set reputation=greatest(0,coalesce((select sum(points) from public.points_ledger where user_id=p_user_id),0)) where id=p_user_id;
$$;
create or replace function public.points_after_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='DELETE' then perform public.recompute_reputation(old.user_id); return old; end if;
  perform public.recompute_reputation(new.user_id); return new;
end $$;
create trigger points_reputation_after after insert or update or delete on public.points_ledger for each row execute procedure public.points_after_change();

create or replace function public.find_dm_conversation(p_user_a uuid,p_user_b uuid)
returns table(id uuid,title text,kind text,updated_at timestamptz) language sql security definer set search_path=public as $$
select c.id,c.title,c.kind,c.updated_at from public.conversations c
where c.kind='dm' and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=p_user_a)
and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=p_user_b)
and (select count(*) from public.conversation_members m where m.conversation_id=c.id)=2 limit 1;
$$;

create or replace function public.recommend_people(p_user_id uuid,p_limit int default 20)
returns setof public.profiles language sql stable security definer set search_path=public as $$
with mine as (select skill_id,kind from public.user_skills where user_id=p_user_id), scored as (
 select p.id,
   count(*) filter(where us.skill_id in(select skill_id from mine where kind in ('wanted','research'))) * 3 +
   count(*) filter(where us.skill_id in(select skill_id from mine where kind='known')) as score
 from public.profiles p left join public.user_skills us on us.user_id=p.id
 where p.id<>p_user_id and p.profile_visibility<>'private' and p.account_status='active'
 and not exists(select 1 from public.blocks b where (b.blocker_id=p_user_id and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=p_user_id))
 group by p.id
)
select p.* from scored s join public.profiles p on p.id=s.id order by s.score desc,p.reputation desc limit greatest(1,least(p_limit,50));
$$;
create or replace function public.suggest_connections(p_user_id uuid,p_limit int default 10)
returns setof public.profiles language sql stable security definer set search_path=public as $$
select p.* from public.recommend_people(p_user_id,p_limit*3) p
where not exists(select 1 from public.connections c where (c.user_a=p_user_id and c.user_b=p.id) or (c.user_b=p_user_id and c.user_a=p.id))
limit greatest(1,least(p_limit,30));
$$;

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.teaching_requests enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.reviews enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.events enable row level security;
alter table public.event_applications enable row level security;
alter table public.resources enable row level security;
alter table public.saved_items enable row level security;
alter table public.points_ledger enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.reports enable row level security;

create policy profile_public_read on public.profiles for select using (profile_visibility='public' or id=auth.uid());
create policy profile_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy skills_read on public.skills for select using(true);
create policy user_skills_read on public.user_skills for select using(user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=user_id and p.profile_visibility='public'));
create policy user_skills_self on public.user_skills for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy connection_request_involved on public.connection_requests for select using(auth.uid() in(requester_id,recipient_id));
create policy connections_involved on public.connections for select using(auth.uid() in(user_a,user_b));
create policy blocks_owner on public.blocks for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy room_public_read on public.rooms for select using(visibility='public' or owner_id=auth.uid() or exists(select 1 from public.room_members rm where rm.room_id=id and rm.user_id=auth.uid()));
create policy room_members_self_read on public.room_members for select using(user_id=auth.uid());
create policy sessions_member_read on public.sessions for select using(teacher_id=auth.uid() or exists(select 1 from public.session_participants sp where sp.session_id=id and sp.user_id=auth.uid()));
create policy reviews_public_read on public.reviews for select using(true);
create policy clubs_public_read on public.clubs for select using(true);
create policy club_members_public_read on public.club_members for select using(true);
create policy events_public_read on public.events for select using(status in ('published','open','completed'));
create policy applications_self_read on public.event_applications for select using(user_id=auth.uid());
create policy resources_room_read on public.resources for select using(room_id is null or exists(select 1 from public.room_members rm where rm.room_id=room_id and rm.user_id=auth.uid()));
create policy saved_self on public.saved_items for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy ledger_self_read on public.points_ledger for select using(user_id=auth.uid());
create policy achievements_read on public.achievements for select using(true);
create policy user_achievements_read on public.user_achievements for select using(true);
create policy quizzes_read on public.quizzes for select using(active=true);
-- Intentionally no client SELECT policy on quiz_questions: correct_answer must never be exposed. API service role returns safe fields only.
create policy attempts_self_read on public.quiz_attempts for select using(user_id=auth.uid());
create policy notifications_self on public.notifications for select using(user_id=auth.uid());
create policy device_tokens_self on public.device_tokens for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy reports_self_insert on public.reports for insert with check(reporter_id=auth.uid());
create policy reports_self_read on public.reports for select using(reporter_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('resources','resources',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do nothing;
create policy avatars_public_read on storage.objects for select using(bucket_id='avatars');
create policy avatars_self_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_self_update on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy resources_member_read on storage.objects for select to authenticated using(bucket_id='resources' and exists(select 1 from public.room_members rm where rm.user_id=auth.uid() and rm.room_id::text=(storage.foldername(name))[2]));
create policy resources_member_write on storage.objects for insert to authenticated with check(bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.room_members rm where rm.user_id=auth.uid() and rm.room_id::text=(storage.foldername(name))[2]));
