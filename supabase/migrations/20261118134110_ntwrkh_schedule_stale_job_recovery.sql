do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='ntwrkh-ai-worker-drain';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  perform cron.schedule(
    'ntwrkh-ai-worker-drain',
    '* * * * *',
    $job$
      with recovery as materialized (
        select private.recover_stale_ai_jobs(600) as recovered_count
      )
      select net.http_post(
        url := 'https://sssqevjzvdpwdeahugcm.supabase.co/functions/v1/ntwrkh-ai-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'sb_publishable_3dv6_Vr7IjMgoX_YjbBJZg_7zvWb0Nw',
          'x-ntwrkh-timestamp', signed.ts,
          'x-ntwrkh-signature', encode(
            extensions.hmac(
              convert_to(signed.ts, 'UTF8'),
              convert_to(secret.decrypted_secret, 'UTF8'),
              'sha256'
            ),
            'hex'
          )
        ),
        body := '{"mode":"cron"}'::jsonb,
        timeout_milliseconds := 120000
      )
      from recovery
      cross join generate_series(1, 5) as workers(n)
      cross join lateral (
        select extract(epoch from clock_timestamp())::bigint::text as ts
      ) as signed
      cross join lateral (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ntwrkh_cron_hmac_secret'
        limit 1
      ) as secret;
    $job$
  );
end $$;
