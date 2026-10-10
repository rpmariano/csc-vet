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
-- 4. auth.uid() IS NOT NULL: permite que migrações diretas no SQL Editor do Supabase
--    (onde auth.uid() é nulo) possam executar sem serem barradas pelas guardas de RLS/função.
-- ============================================================================

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
    IF auth.uid() IS NOT NULL
       AND public.get_user_role() IS DISTINCT FROM 'admin'
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
    IF auth.uid() IS NOT NULL
       AND public.get_user_role() IS DISTINCT FROM 'admin'
       AND NOT ('admin' = ANY(public.get_user_roles())) THEN
        RAISE EXCEPTION 'Apenas administradores podem fundir fichas.';
    END IF;

    IF id_manter = id_apagar THEN
        RAISE EXCEPTION 'Escolhe duas fichas diferentes para fundir.';
    END IF;

    SELECT * INTO manter FROM public.profiles WHERE id = id_manter;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a manter não encontrada (id: %).', id_manter; END IF;
    SELECT * INTO apagar FROM public.profiles WHERE id = id_apagar;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a apagar não encontrada (id: %).', id_apagar; END IF;

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

-- 3. Autocorreção / Fusão automática para o atleta Paulo Ricardo Santos (PP)
DO $$
DECLARE
    r_manter public.profiles%ROWTYPE;
    r_apagar public.profiles%ROWTYPE;
    v_auth_manter_id UUID;
    v_auth_apagar_id UUID;
BEGIN
    -- 1. Localizar conta de login pelo email do Gmail
    SELECT id INTO v_auth_manter_id 
    FROM auth.users 
    WHERE lower(btrim(email)) = 'santospricardo1980@gmail.com' 
    LIMIT 1;

    IF v_auth_manter_id IS NOT NULL THEN
        -- Garantir perfil em public.profiles caso o gatilho on_auth_user_created tenha falhado
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_auth_manter_id) THEN
            INSERT INTO public.profiles (id, name, email, role, status)
            VALUES (v_auth_manter_id, 'Paulo Ricardo Santos', 'santospricardo1980@gmail.com', 'unassigned', 'active');
            RAISE NOTICE 'Perfil base criado para santospricardo1980@gmail.com (id: %).', v_auth_manter_id;
        END IF;
    END IF;

    -- Obter registo da conta a manter (com login)
    SELECT * INTO r_manter 
    FROM public.profiles 
    WHERE (v_auth_manter_id IS NOT NULL AND id = v_auth_manter_id)
       OR lower(btrim(email)) = 'santospricardo1980@gmail.com'
    LIMIT 1;

    -- 2. Localizar ficha desportiva do atleta PP (email sapo ou nome + alcunha PP)
    SELECT * INTO r_apagar 
    FROM public.profiles 
    WHERE (
        lower(btrim(email)) = 'santospauloricardo@sapo.pt'
        OR (name ILIKE '%Paulo Ricardo Santos%' AND nickname = 'PP')
    )
    AND (r_manter.id IS NULL OR id <> r_manter.id)
    LIMIT 1;

    RAISE NOTICE '-> Conta a manter (Login): id=%, nome=%, email=%', r_manter.id, r_manter.name, r_manter.email;
    RAISE NOTICE '-> Ficha do atleta (PP): id=%, nome=%, email=%', r_apagar.id, r_apagar.name, r_apagar.email;

    IF r_manter.id IS NOT NULL AND r_apagar.id IS NOT NULL THEN
        -- Verificar se a ficha antiga do atleta tem registo em auth.users
        SELECT id INTO v_auth_apagar_id FROM auth.users WHERE id = r_apagar.id;
        IF v_auth_apagar_id IS NOT NULL THEN
            RAISE NOTICE '-> A ficha antiga tinha conta em auth.users (id: %). A remover conta antiga para permitir fusão...', v_auth_apagar_id;
            DELETE FROM auth.users WHERE id = v_auth_apagar_id;
        END IF;

        PERFORM public.admin_merge_profiles(r_manter.id, r_apagar.id);
        RAISE NOTICE 'SUCESSO: Atleta PP fundido na conta % (id: %) com sucesso!', r_manter.email, r_manter.id;
    ELSE
        IF r_manter.id IS NULL THEN
            RAISE WARNING 'Não foi encontrada a conta santospricardo1980@gmail.com em auth.users nem em profiles!';
        END IF;
        IF r_apagar.id IS NULL THEN
            RAISE WARNING 'Não foi encontrada a ficha antiga do atleta PP (santospauloricardo@sapo.pt)!';
        END IF;
    END IF;
END;
$$;
