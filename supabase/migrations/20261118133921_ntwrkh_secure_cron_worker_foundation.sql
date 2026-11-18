do $$
begin
  if not exists (select 1 from vault.secrets where name='ntwrkh_cron_hmac_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ntwrkh_cron_hmac_secret',
      'HMAC key used only by the scheduled NTWRKH AI queue worker'
    );
  end if;
end $$;

create or replace function private.verify_ntwrkh_cron_signature(p_timestamp text, p_signature text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_expected text;
  v_epoch bigint;
begin
  if p_timestamp is null or p_signature is null
     or p_timestamp !~ '^[0-9]{10}$'
     or p_signature !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  v_epoch := p_timestamp::bigint;
  if abs(extract(epoch from now())::bigint - v_epoch) > 300 then
    return false;
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='ntwrkh_cron_hmac_secret'
  limit 1;
  if v_secret is null then return false; end if;
  v_expected := encode(
    extensions.hmac(convert_to(p_timestamp, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'),
    'hex'
  );
  return lower(p_signature) = v_expected;
end;
$$;

create or replace function public.ntwrkh_verify_cron_worker_signature(p_timestamp text, p_signature text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.verify_ntwrkh_cron_signature(p_timestamp, p_signature);
$$;

revoke all on function private.verify_ntwrkh_cron_signature(text,text) from public, anon, authenticated;
grant execute on function private.verify_ntwrkh_cron_signature(text,text) to service_role;
revoke all on function public.ntwrkh_verify_cron_worker_signature(text,text) from public, anon, authenticated;
grant execute on function public.ntwrkh_verify_cron_worker_signature(text,text) to service_role;

create or replace function public.ntwrkh_claim_next_ai_job_global()
returns table (
  id uuid,
  user_id uuid,
  request_id uuid,
  action text,
  payload jsonb,
  status text,
  attempt_count integer,
  max_attempts integer
)
language sql
security definer
set search_path = ''
as $$
  select j.id, j.user_id, j.request_id, j.action, j.payload, j.status, j.attempt_count, j.max_attempts
  from private.claim_next_ai_job(120) j;
$$;

revoke all on function public.ntwrkh_claim_next_ai_job_global() from public, anon, authenticated;
grant execute on function public.ntwrkh_claim_next_ai_job_global() to service_role;
