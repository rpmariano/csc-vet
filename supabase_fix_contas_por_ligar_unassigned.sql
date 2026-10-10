-- ============================================================================
-- Migração: Suporte a contas 'unassigned' em admin_contas_por_ligar e admin_merge_profiles
-- ============================================================================
-- Contexto:
-- 1. Novos utilizadores que se registam sem correspondência prévia de email entram
--    com role='unassigned' (isolados na página de boas-vindas com contacto da direção).
-- 2. admin_contas_por_ligar() procurava apenas role='player', pelo que contas
--    'unassigned' (ex: Paulo Ricardo Santos / PP) não apareciam em "Contas por ligar".
-- 3. admin_merge_profiles() mantinha o role de id_manter; quando a conta com login
--    é 'unassigned', deve adotar o role da ficha do atleta ('player' ou outro).
-- 4. Suporte a administradores com múltiplos papéis (roles[]).
-- ============================================================================

BEGIN;

-- 1. Atualizar admin_contas_por_ligar() para incluir 'unassigned'
CREATE OR REPLACE FUNCTION public.admin_contas_por_ligar()
RETURNS TABLE (
    id         UUID,
    name       TEXT,
    email      TEXT,
    photo_url  TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'admin'
       AND NOT ('admin' = ANY(public.get_user_roles())) THEN
        RAISE EXCEPTION 'Apenas administradores podem consultar esta informação.';
    END IF;

    RETURN QUERY
    SELECT p.id, p.name, p.email, p.photo_url, p.created_at
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
      -- Contas sem perfil atribuído ('unassigned') ou que ficaram com valores default de player
      AND (
        p.role = 'unassigned'
        OR (p.role = 'player' AND (p.roles IS NULL OR p.roles = ARRAY['player']::user_role[]))
      )
      -- O bloco desportivo está por preencher, e só o clube o escreve.
      AND p.jersey_number IS NULL
      AND COALESCE(btrim(p.position), '') = ''
      -- E o clube nunca contou com esta pessoa para nada.
      AND NOT EXISTS (SELECT 1 FROM public.callups c WHERE c.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.stats   s WHERE s.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.dues    d WHERE d.player_id = p.id)
    ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_contas_por_ligar() TO authenticated;

-- 2. Atualizar admin_merge_profiles() para adotar o perfil desportivo da ficha apagada
CREATE OR REPLACE FUNCTION public.admin_merge_profiles(id_manter UUID, id_apagar UUID)
RETURNS public.profiles AS $$
DECLARE
    manter public.profiles%ROWTYPE;
    apagar public.profiles%ROWTYPE;
    resultado public.profiles%ROWTYPE;
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'admin'
       AND NOT ('admin' = ANY(public.get_user_roles())) THEN
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
        name             = coalesce(nullif(btrim(manter.name), ''), apagar.name),
        nickname         = coalesce(nullif(btrim(manter.nickname), ''), apagar.nickname),
        shirt_name       = coalesce(nullif(btrim(manter.shirt_name), ''), apagar.shirt_name),
        email            = coalesce(nullif(btrim(manter.email), ''), apagar.email),
        phone            = coalesce(nullif(btrim(manter.phone), ''), apagar.phone),
        photo_url        = coalesce(nullif(btrim(manter.photo_url), ''), apagar.photo_url),
        role             = CASE 
                             WHEN manter.role = 'unassigned' THEN COALESCE(apagar.role, 'player'::user_role)
                             WHEN apagar.role = 'supporter' AND manter.role = 'player' THEN 'supporter'::user_role 
                             ELSE manter.role 
                           END,
        roles            = CASE 
                             WHEN manter.role = 'unassigned' OR manter.roles IS NULL OR cardinality(manter.roles) = 0 
                               THEN COALESCE(apagar.roles, ARRAY[apagar.role]::user_role[])
                             WHEN apagar.role = 'supporter' AND (manter.roles IS NULL OR manter.roles = ARRAY['player']::user_role[]) 
                               THEN ARRAY['supporter']::user_role[] 
                             ELSE manter.roles 
                           END,
        status           = CASE
                             WHEN manter.status = 'inactive' AND apagar.status IS NOT NULL THEN apagar.status
                             ELSE coalesce(manter.status, apagar.status, 'active')
                           END,
        jersey_number    = coalesce(manter.jersey_number, apagar.jersey_number),
        kit_size         = coalesce(nullif(btrim(manter.kit_size), ''), apagar.kit_size),
        birth_date       = coalesce(manter.birth_date, apagar.birth_date),
        nationality      = coalesce(nullif(btrim(manter.nationality), ''), apagar.nationality),
        position         = coalesce(nullif(btrim(manter.position), ''), apagar.position),
        address          = coalesce(nullif(btrim(manter.address), ''), apagar.address),
        postal_code      = coalesce(nullif(btrim(manter.postal_code), ''), apagar.postal_code),
        city             = coalesce(nullif(btrim(manter.city), ''), apagar.city),
        nif              = coalesce(nullif(btrim(manter.nif), ''), apagar.nif),
        id_number        = coalesce(nullif(btrim(manter.id_number), ''), apagar.id_number),
        id_card_expiry   = coalesce(manter.id_card_expiry, apagar.id_card_expiry),
        iban             = coalesce(nullif(btrim(manter.iban), ''), apagar.iban),
        member_number    = coalesce(manter.member_number, apagar.member_number),
        quota_start_date = coalesce(manter.quota_start_date, apagar.quota_start_date),
        quota_end_date   = coalesce(manter.quota_end_date, apagar.quota_end_date),
        emergency_contact_name     = coalesce(nullif(btrim(manter.emergency_contact_name), ''), apagar.emergency_contact_name),
        emergency_contact_phone    = coalesce(nullif(btrim(manter.emergency_contact_phone), ''), apagar.emergency_contact_phone),
        emergency_contact_relation = coalesce(nullif(btrim(manter.emergency_contact_relation), ''), apagar.emergency_contact_relation),
        medical_notes    = coalesce(nullif(btrim(manter.medical_notes), ''), apagar.medical_notes),
        gdpr_consent     = coalesce(manter.gdpr_consent, apagar.gdpr_consent)
    WHERE id = id_manter
    RETURNING * INTO resultado;

    PERFORM public._merge_profile_references(apagar.id, id_manter);
    DELETE FROM public.profiles WHERE id = apagar.id;

    RETURN resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_merge_profiles(UUID, UUID) TO authenticated;

-- 3. Autocorreção / Fusão automática para o atleta Paulo Ricardo Santos (PP) se ambas as fichas existirem
DO $$
DECLARE
    v_manter UUID;
    v_apagar UUID;
BEGIN
    SELECT id INTO v_manter FROM public.profiles WHERE lower(email) = 'santospricardo1980@gmail.com' LIMIT 1;
    SELECT id INTO v_apagar FROM public.profiles WHERE lower(email) = 'santospauloricardo@sapo.pt' LIMIT 1;

    IF v_manter IS NOT NULL AND v_apagar IS NOT NULL AND v_manter <> v_apagar THEN
        -- Só funde se a ficha v_manter tiver conta associada em auth.users e v_apagar não tiver
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_manter) AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_apagar) THEN
            PERFORM public.admin_merge_profiles(v_manter, v_apagar);
            RAISE NOTICE 'Fusão automática concluída: atleta PP associado à conta santospricardo1980@gmail.com.';
        END IF;
    END IF;
END;
$$;

COMMIT;
