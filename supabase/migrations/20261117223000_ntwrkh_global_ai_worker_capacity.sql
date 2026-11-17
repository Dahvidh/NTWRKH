create table if not exists private.ai_worker_slots (
  slot_id integer primary key,
  worker_id uuid,
  acquired_at timestamptz,
  lease_expires_at timestamptz,
  constraint ai_worker_slots_lease_consistency check (
    (worker_id is null and acquired_at is null and lease_expires_at is null)
    or (worker_id is not null and acquired_at is not null and lease_expires_at is not null)
  )
);

insert into private.ai_worker_slots (slot_id)
select n from generate_series(1, 5) n
on conflict (slot_id) do nothing;

revoke all on private.ai_worker_slots from public, anon, authenticated;
grant select, insert, update, delete on private.ai_worker_slots to service_role;

create or replace function private.acquire_ai_worker_slot(p_worker_id uuid, p_lease_seconds integer default 120)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id integer;
begin
  if p_worker_id is null then
    raise exception 'worker_id is required';
  end if;
  with candidate as (
    select s.slot_id
    from private.ai_worker_slots s
    where s.worker_id is null or s.lease_expires_at < now()
    order by s.slot_id
    for update skip locked
    limit 1
  )
  update private.ai_worker_slots s
  set worker_id = p_worker_id,
      acquired_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(600, p_lease_seconds)))
  from candidate c
  where s.slot_id = c.slot_id
  returning s.slot_id into v_slot_id;
  return v_slot_id;
end;
$$;

create or replace function private.release_ai_worker_slot(p_slot_id integer, p_worker_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.ai_worker_slots
  set worker_id = null, acquired_at = null, lease_expires_at = null
  where slot_id = p_slot_id and worker_id = p_worker_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function private.acquire_ai_worker_slot(uuid, integer) from public, anon, authenticated;
revoke all on function private.release_ai_worker_slot(integer, uuid) from public, anon, authenticated;
grant execute on function private.acquire_ai_worker_slot(uuid, integer) to service_role;
grant execute on function private.release_ai_worker_slot(integer, uuid) to service_role;

create or replace function public.ntwrkh_acquire_ai_worker_slot(p_worker_id uuid, p_lease_seconds integer default 120)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.acquire_ai_worker_slot(p_worker_id, p_lease_seconds);
$$;

create or replace function public.ntwrkh_release_ai_worker_slot(p_slot_id integer, p_worker_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.release_ai_worker_slot(p_slot_id, p_worker_id);
$$;

revoke all on function public.ntwrkh_acquire_ai_worker_slot(uuid, integer) from public, anon, authenticated;
revoke all on function public.ntwrkh_release_ai_worker_slot(integer, uuid) from public, anon, authenticated;
grant execute on function public.ntwrkh_acquire_ai_worker_slot(uuid, integer) to service_role;
grant execute on function public.ntwrkh_release_ai_worker_slot(integer, uuid) to service_role;
