-- ============================================================================
-- Migração: Preservação de Papel de Adepto no 1º Login e Correção de Fusão
-- ============================================================================
--
-- PROBLEMA IDENTIFICADO:
-- 1. Quando a direção criava um Adepto na app (TeamManagementPage), era criada
--    uma ficha em `public.profiles` com role='supporter' e roles=['supporter'].
-- 2. Quando esse adepto fazia login pela 1ª vez, o gatilho `handle_new_user()`
--    inseria uma nova linha em `profiles` forçando cegamente `role = 'player'`.
-- 3. A função `associate_my_profile()` transferia os dados mas NÃO atualizava as
--    colunas `role` e `roles`, mantendo 'player' e apagando a ficha original de adepto.
--    Resultado: o adepto transformava-se em "jogador" (ou criava um jogador duplicado).
--
-- SOLUÇÃO:
-- 1. `handle_new_user()`: verifica se já existe uma ficha pré-criada com o mesmo email.
--    Se existir, adota IMEDIATAMENTE todos os dados e o papel (ex: 'supporter'),
--    faz a fusão e elimina a ficha antiga.
--    Se NÃO existir ficha prévia, cria como 'unassigned' (nunca como 'player').
-- 2. `associate_my_profile()`: passa a copiar `role` e `roles` da ficha prévia.
-- 3. `admin_merge_profiles()`: preserva o papel de adepto na fusão.
-- 4. Script de autocorreção: deteta adeptos que ficaram como jogadores e repõe 'supporter'.
-- ============================================================================

--------------------------------------------------------------------------------
-- 1. Atualizar handle_new_user()
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  existing_profile public.profiles%ROWTYPE;
BEGIN
  -- Verificar se já existe uma ficha pré-criada pela direção com este email
  SELECT * INTO existing_profile
  FROM public.profiles
  WHERE lower(btrim(coalesce(email, ''))) = lower(btrim(coalesce(new.email, '')))
    AND id <> new.id
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = public.profiles.id)
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    -- Adota todos os dados da ficha pré-existente (preserva 'supporter', 'coach', etc.)
    INSERT INTO public.profiles (
      id, name, nickname, shirt_name, email, phone, photo_url, role, roles, status,
      jersey_number, kit_size, birth_date, nationality, position,
      address, postal_code, city, nif, id_number, id_card_expiry, iban,
      member_number, quota_start_date, quota_end_date, gdpr_consent
    )
    VALUES (
      new.id,
      COALESCE(existing_profile.name, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', 'Novo Membro'),
      existing_profile.nickname,
      existing_profile.shirt_name,
      new.email,
      existing_profile.phone,
      existing_profile.photo_url,
      COALESCE(existing_profile.role, 'unassigned'::user_role),
      COALESCE(existing_profile.roles, CASE WHEN existing_profile.role IS NOT NULL THEN ARRAY[existing_profile.role]::user_role[] ELSE ARRAY[]::user_role[] END),
      COALESCE(existing_profile.status, 'active'),
      existing_profile.jersey_number,
      existing_profile.kit_size,
      existing_profile.birth_date,
      existing_profile.nationality,
      existing_profile.position,
      existing_profile.address,
      existing_profile.postal_code,
      existing_profile.city,
      existing_profile.nif,
      existing_profile.id_number,
      existing_profile.id_card_expiry,
      existing_profile.iban,
      existing_profile.member_number,
      existing_profile.quota_start_date,
      existing_profile.quota_end_date,
      existing_profile.gdpr_consent
    )
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      roles = EXCLUDED.roles,
      name = COALESCE(public.profiles.name, EXCLUDED.name);

    -- Transfere referências e elimina a ficha antiga
    PERFORM public._merge_profile_references(existing_profile.id, new.id);
    DELETE FROM public.profiles WHERE id = existing_profile.id;
  ELSE
    -- Novo utilizador sem ficha no clube: entra sempre como 'unassigned' (isolado)
    INSERT INTO public.profiles (id, name, email, role, roles, status)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', 'Novo Utilizador'),
      new.email,
      'unassigned'::user_role,
      ARRAY[]::user_role[],
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: falha ao criar perfil para %: %', new.id, SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Garantir que o trigger está ativo
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--------------------------------------------------------------------------------
-- 2. Atualizar associate_my_profile() para copiar role e roles
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.associate_my_profile(target_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    me_id     UUID := auth.uid();
    me_email  TEXT;
    alvo      public.profiles%ROWTYPE;
    resultado public.profiles%ROWTYPE;
BEGIN
    IF me_id IS NULL THEN
        RAISE EXCEPTION 'Sem sessão iniciada.';
    END IF;
    IF target_id = me_id THEN
        RAISE EXCEPTION 'Essa ficha já é a sua.';
    END IF;

    SELECT * INTO alvo FROM public.profiles p WHERE p.id = target_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ficha não encontrada.';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = alvo.id) THEN
        RAISE EXCEPTION 'Essa ficha já pertence a uma conta.';
    END IF;

    SELECT lower(btrim(coalesce(u.email, ''))) INTO me_email
    FROM auth.users u WHERE u.id = me_id;

    IF coalesce(me_email, '') = ''
       OR lower(btrim(coalesce(alvo.email, ''))) <> me_email THEN
        RAISE EXCEPTION 'Essa ficha está registada com outro email. Fala com a direção.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = me_id) THEN
        UPDATE public.profiles p SET
            name             = coalesce(alvo.name, p.name),
            nickname         = coalesce(alvo.nickname, p.nickname),
            shirt_name       = coalesce(alvo.shirt_name, alvo.nickname, p.shirt_name),
            phone            = coalesce(alvo.phone, p.phone),
            photo_url        = coalesce(alvo.photo_url, p.photo_url),
            role             = coalesce(alvo.role, p.role),
            roles            = coalesce(alvo.roles, p.roles),
            status           = coalesce(alvo.status, p.status),
            jersey_number    = coalesce(alvo.jersey_number, p.jersey_number),
            kit_size         = coalesce(alvo.kit_size, p.kit_size),
            birth_date       = coalesce(alvo.birth_date, p.birth_date),
            nationality      = coalesce(alvo.nationality, p.nationality),
            position         = coalesce(alvo.position, p.position),
            address          = coalesce(alvo.address, p.address),
            postal_code      = coalesce(alvo.postal_code, p.postal_code),
            city             = coalesce(alvo.city, p.city),
            nif              = coalesce(alvo.nif, p.nif),
            id_number        = coalesce(alvo.id_number, p.id_number),
            id_card_expiry   = coalesce(alvo.id_card_expiry, p.id_card_expiry),
            iban             = coalesce(alvo.iban, p.iban),
            member_number    = coalesce(alvo.member_number, p.member_number),
            quota_start_date = coalesce(alvo.quota_start_date, p.quota_start_date),
            quota_end_date   = coalesce(alvo.quota_end_date, p.quota_end_date)
        WHERE p.id = me_id
        RETURNING p.* INTO resultado;
    ELSE
        INSERT INTO public.profiles (
            id, name, nickname, shirt_name, email, phone, photo_url, role, roles, status,
            jersey_number, kit_size, birth_date, nationality, position,
            address, postal_code, city, nif, id_number, id_card_expiry, iban,
            member_number, quota_start_date, quota_end_date
        )
        SELECT
            me_id, alvo.name, alvo.nickname, coalesce(alvo.shirt_name, alvo.nickname),
            coalesce(u.email, alvo.email), alvo.phone, alvo.photo_url, alvo.role, alvo.roles, alvo.status,
            alvo.jersey_number, alvo.kit_size, alvo.birth_date, alvo.nationality, alvo.position,
            alvo.address, alvo.postal_code, alvo.city, alvo.nif, alvo.id_number,
            alvo.id_card_expiry, alvo.iban, alvo.member_number,
            alvo.quota_start_date, alvo.quota_end_date
        FROM auth.users u WHERE u.id = me_id
        RETURNING * INTO resultado;
    END IF;

    PERFORM public._merge_profile_references(alvo.id, me_id);

    DELETE FROM public.profiles WHERE id = alvo.id;

    RETURN resultado;
END;
$$;

--------------------------------------------------------------------------------
-- 3. Atualizar admin_merge_profiles()
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_merge_profiles(id_manter UUID, id_apagar UUID)
RETURNS public.profiles AS $$
DECLARE
    manter public.profiles%ROWTYPE;
    apagar public.profiles%ROWTYPE;
    resultado public.profiles%ROWTYPE;
BEGIN
    IF public.get_user_role() <> 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem fundir fichas.';
    END IF;
    IF id_manter = id_apagar THEN
        RAISE EXCEPTION 'Escolhe duas fichas diferentes para fundir.';
    END IF;

    SELECT * INTO manter FROM public.profiles WHERE id = id_manter;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a manter não encontrada.'; END IF;
    SELECT * INTO apagar FROM public.profiles WHERE id = id_apagar;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a apagar não encontrada.'; END IF;

    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = apagar.id) THEN
        RAISE EXCEPTION 'Não é possível apagar uma ficha com conta associada. Troca a direção da fusão para manter essa conta.';
    END IF;

    UPDATE public.profiles SET
        name             = coalesce(manter.name, apagar.name),
        nickname         = coalesce(manter.nickname, apagar.nickname),
        shirt_name       = coalesce(manter.shirt_name, apagar.shirt_name),
        email            = coalesce(manter.email, apagar.email),
        phone            = coalesce(manter.phone, apagar.phone),
        photo_url        = coalesce(manter.photo_url, apagar.photo_url),
        role             = CASE WHEN apagar.role = 'supporter' AND manter.role = 'player' THEN 'supporter'::user_role ELSE manter.role END,
        roles            = CASE WHEN apagar.role = 'supporter' AND (manter.roles IS NULL OR manter.roles = ARRAY['player']::user_role[]) THEN ARRAY['supporter']::user_role[] ELSE manter.roles END,
        status           = coalesce(manter.status, apagar.status),
        jersey_number    = coalesce(manter.jersey_number, apagar.jersey_number),
        kit_size         = coalesce(manter.kit_size, apagar.kit_size),
        birth_date       = coalesce(manter.birth_date, apagar.birth_date),
        nationality      = coalesce(manter.nationality, apagar.nationality),
        position         = coalesce(manter.position, apagar.position),
        address          = coalesce(manter.address, apagar.address),
        postal_code      = coalesce(manter.postal_code, apagar.postal_code),
        city             = coalesce(manter.city, apagar.city),
        nif              = coalesce(manter.nif, apagar.nif),
        id_number        = coalesce(manter.id_number, apagar.id_number),
        id_card_expiry   = coalesce(manter.id_card_expiry, apagar.id_card_expiry),
        iban             = coalesce(manter.iban, apagar.iban),
        member_number    = coalesce(manter.member_number, apagar.member_number),
        quota_start_date = coalesce(manter.quota_start_date, apagar.quota_start_date),
        quota_end_date   = coalesce(manter.quota_end_date, apagar.quota_end_date)
    WHERE id = id_manter
    RETURNING * INTO resultado;

    PERFORM public._merge_profile_references(apagar.id, id_manter);
    DELETE FROM public.profiles WHERE id = apagar.id;

    RETURN resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

--------------------------------------------------------------------------------
-- 4. Autocorreção: fundir perfis duplicados e corrigir adeptos que ficaram jogadores
--------------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Se existe uma conta auth (que ficou como player) e uma ficha pré-criada como supporter com o mesmo email:
  FOR rec IN
    SELECT p_auth.id as id_manter, p_orphan.id as id_apagar, p_orphan.name, p_orphan.email
    FROM public.profiles p_auth
    JOIN auth.users u ON u.id = p_auth.id
    JOIN public.profiles p_orphan ON lower(btrim(p_orphan.email)) = lower(btrim(u.email))
    WHERE p_orphan.id <> p_auth.id
      AND p_orphan.role = 'supporter'
      AND NOT EXISTS (SELECT 1 FROM auth.users u2 WHERE u2.id = p_orphan.id)
  LOOP
    RAISE NOTICE 'A corrigir e fundir adepto duplicado: % (%)', rec.name, rec.email;
    UPDATE public.profiles
       SET role = 'supporter'::user_role,
           roles = ARRAY['supporter']::user_role[],
           jersey_number = NULL,
           position = NULL
     WHERE id = rec.id_manter;
    PERFORM public._merge_profile_references(rec.id_apagar, rec.id_manter);
    DELETE FROM public.profiles WHERE id = rec.id_apagar;
  END LOOP;
END $$;

-- Atualizar adeptos conhecidos que possam ter ficado com role='player'
UPDATE public.profiles
   SET role = 'supporter'::user_role,
       roles = ARRAY['supporter']::user_role[],
       jersey_number = NULL,
       position = NULL,
       quota_start_date = NULL,
       quota_end_date = NULL
 WHERE (name ILIKE '%sonia%' OR email ILIKE '%sonia%')
   AND role <> 'supporter';
