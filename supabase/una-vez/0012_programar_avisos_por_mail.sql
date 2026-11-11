-- GONGAS — que los avisos por mail corran solos, todos los días a las 9:00.
--
-- SE CORRE UNA VEZ sobre el proyecto real: usa pg_cron, pg_net y Vault, que el
-- Postgres de los tests no tiene. Por eso no está en migrations/.
--
-- La base llama a la función del servidor `avisos-por-mail` con una clave
-- propia (x-token), que se genera acá adentro y nadie ve: queda guardada en
-- Vault, y la función la verifica preguntándole a la base.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- La dirección del proyecto y la clave de la llamada, en Vault.
select vault.create_secret('https://kmmklpkjpulptyygheau.supabase.co', 'project_url');
select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'avisos_mail_token');

-- La función del servidor pregunta si la clave que le llegó es la buena.
create function public.token_avisos_mail_valido(p_token text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'avisos_mail_token' and s.decrypted_secret = p_token
  )
$$;

revoke execute on function public.token_avisos_mail_valido(text) from public, anon, authenticated;
grant execute on function public.token_avisos_mail_valido(text) to service_role;

-- Lo que hace la tarea programada, en una función, para poder dispararla a mano.
create function public.disparar_avisos_por_mail(p_simular boolean default false) returns bigint
language sql security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/avisos-por-mail',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-token', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_mail_token')
    ),
    body := jsonb_build_object('simular', p_simular),
    timeout_milliseconds := 60000
  )
$$;

revoke execute on function public.disparar_avisos_por_mail(boolean) from public, anon, authenticated;

-- 12:00 UTC son las 9:00 en Montevideo, todo el año (no hay horario de verano).
select cron.schedule('avisos-por-mail', '0 12 * * *', 'select public.disparar_avisos_por_mail()');
