-- ============================================================================
-- Correção de segurança à migração supabase_profile_merge_migration.sql
-- ============================================================================
-- Aplicada horas depois da anterior, na mesma sessão, depois de correr
-- get_advisors(security) e has_function_privilege() sobre o que tinha acabado
-- de ser criado. Dois problemas confirmados:
--
-- 1. `REVOKE ALL ... FROM PUBLIC` não bastou para _merge_profile_references.
--    Neste projeto o schema `public` tem default privileges que concedem
--    EXECUTE a `anon` e `authenticated` diretamente em toda função nova (não
--    via PUBLIC) — é a mesma classe de armadilha que o ponto 2 dos "Riscos
--    conhecidos" do CLAUDE.md documenta para vistas SECURITY DEFINER, agora
--    para funções: REVOKE FROM PUBLIC não cobre concessões diretas a
--    `anon`/`authenticated`. Confirmado com
--    has_function_privilege('anon', ..., 'EXECUTE') = true mesmo depois do
--    REVOKE FROM PUBLIC. Corrigido com REVOKE explícito dessas duas roles.
--
-- 2. admin_merge_profiles() e admin_linked_profile_ids() usavam
--    `IF public.get_user_role() <> 'admin' THEN RAISE EXCEPTION`. Quando
--    get_user_role() devolve NULL — auth.uid() nulo (chamada anon) ou uma
--    conta autenticada sem linha em `profiles` ainda (o próprio estado que
--    a migração anterior trata) — o operador `<>` com NULL dá NULL, e um IF
--    com condição NULL em plpgsql conta como FALSE: a exceção nunca
--    disparava e a função prosseguia como se o caller fosse admin. Qualquer
--    conta autenticada sem perfil próprio podia fundir ou apagar fichas
--    alheias à vontade. Corrigido com `IS DISTINCT FROM`, que trata NULL
--    como um valor a sério em vez de propagar NULL.
--
-- Verificado depois de aplicar: has_function_privilege('anon', ...) = false
-- para _merge_profile_references; `NULL IS DISTINCT FROM 'admin'` = true.
-- ============================================================================

REVOKE ALL ON FUNCTION public._merge_profile_references(UUID, UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_merge_profiles(id_manter UUID, id_apagar UUID)
RETURNS public.profiles AS $$
DECLARE
    manter public.profiles%ROWTYPE;
    apagar public.profiles%ROWTYPE;
    resultado public.profiles%ROWTYPE;
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem fundir fichas.';
    END IF;
    IF id_manter = id_apagar THEN
        RAISE EXCEPTION 'Escolhe duas fichas diferentes para fundir.';
    END IF;

    SELECT * INTO manter FROM public.profiles WHERE id = id_manter;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a manter não encontrada.'; END IF;
    SELECT * INTO apagar FROM public.profiles WHERE id = id_apagar;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a apagar não encontrada.'; END IF;

    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = id_apagar) THEN
        RAISE EXCEPTION 'A ficha a apagar tem uma conta de login própria — escolhe-a para manter (trocando a ordem) em vez de a apagar.';
    END IF;

    UPDATE public.profiles p SET
        name                     = coalesce(manter.name, apagar.name),
        nickname                 = coalesce(manter.nickname, apagar.nickname),
        shirt_name               = coalesce(manter.shirt_name, apagar.shirt_name),
        phone                    = coalesce(manter.phone, apagar.phone),
        photo_url                = coalesce(manter.photo_url, apagar.photo_url),
        status                   = coalesce(manter.status, apagar.status),
        jersey_number            = coalesce(manter.jersey_number, apagar.jersey_number),
        kit_size                 = coalesce(manter.kit_size, apagar.kit_size),
        birth_date               = coalesce(manter.birth_date, apagar.birth_date),
        nationality              = coalesce(manter.nationality, apagar.nationality),
        position                 = coalesce(manter.position, apagar.position),
        address                  = coalesce(manter.address, apagar.address),
        postal_code              = coalesce(manter.postal_code, apagar.postal_code),
        city                     = coalesce(manter.city, apagar.city),
        nif                      = coalesce(manter.nif, apagar.nif),
        id_number                = coalesce(manter.id_number, apagar.id_number),
        id_card_expiry           = coalesce(manter.id_card_expiry, apagar.id_card_expiry),
        iban                     = coalesce(manter.iban, apagar.iban),
        member_number            = coalesce(manter.member_number, apagar.member_number),
        emergency_contact_name   = coalesce(manter.emergency_contact_name, apagar.emergency_contact_name),
        emergency_contact_phone  = coalesce(manter.emergency_contact_phone, apagar.emergency_contact_phone),
        medical_notes            = coalesce(manter.medical_notes, apagar.medical_notes),
        id_document_url          = coalesce(manter.id_document_url, apagar.id_document_url),
        insurance_doc_url        = coalesce(manter.insurance_doc_url, apagar.insurance_doc_url),
        medical_exam_doc_url     = coalesce(manter.medical_exam_doc_url, apagar.medical_exam_doc_url),
        gdpr_consent             = coalesce(manter.gdpr_consent, apagar.gdpr_consent),
        quota_start_date         = coalesce(manter.quota_start_date, apagar.quota_start_date),
        quota_end_date           = coalesce(manter.quota_end_date, apagar.quota_end_date)
    WHERE p.id = id_manter
    RETURNING p.* INTO resultado;

    PERFORM public._merge_profile_references(id_apagar, id_manter);

    DELETE FROM public.profiles WHERE id = id_apagar;

    RETURN resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_linked_profile_ids()
RETURNS SETOF UUID AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem consultar esta informação.';
    END IF;

    RETURN QUERY
    SELECT p.id FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
