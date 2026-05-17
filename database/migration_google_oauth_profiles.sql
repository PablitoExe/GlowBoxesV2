-- ============================================================
-- GLOW BOXES - Google OAuth profile sync
-- Run in Supabase SQL Editor after schema/grants/policies.
-- Stores safe public profile fields from Supabase Auth metadata.
-- ============================================================

alter table public.perfiles
  add column if not exists email text,
  add column if not exists avatar_url text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
  v_nombre text := coalesce(
    nullif(new.raw_user_meta_data->>'nombre', ''),
    nullif(new.raw_user_meta_data->>'given_name', ''),
    nullif(split_part(v_full_name, ' ', 1), ''),
    ''
  );
  v_apellido text := coalesce(
    nullif(new.raw_user_meta_data->>'apellido', ''),
    nullif(new.raw_user_meta_data->>'family_name', ''),
    nullif(btrim(regexp_replace(v_full_name, '^\S+\s*', '')), ''),
    ''
  );
  v_avatar text := coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'picture', '')
  );
begin
  insert into public.perfiles (id, email, nombre, apellido, avatar_url)
  values (
    new.id,
    new.email,
    v_nombre,
    v_apellido,
    v_avatar
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, public.perfiles.email),
    nombre = coalesce(nullif(public.perfiles.nombre, ''), excluded.nombre),
    apellido = coalesce(nullif(public.perfiles.apellido, ''), excluded.apellido),
    avatar_url = coalesce(excluded.avatar_url, public.perfiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant execute on function public.handle_new_user() to service_role;

notify pgrst, 'reload schema';
