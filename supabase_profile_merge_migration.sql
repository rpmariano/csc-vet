-- ============================================================================
-- Migração: robustez da associação conta↔ficha + merge administrativo
-- ============================================================================
-- Contexto: um jogador (André Couto) fez login e ficou sem perfil — nem o
-- gatilho `handle_new_user` nem o fallback do cliente (AuthContext) criaram a
-- linha em `profiles`, e a ficha de atleta pré-existente (mesmo email) nunca
-- se associou porque `associate_my_profile()` rebentava sempre a meio: refere
-- `public.tournament_players`, tabela que não existe neste esquema (nunca foi
-- criada aqui, ao contrário do que a função presumia). Como a função corre
-- tudo numa transação implícita, o erro desfazia mesmo os passos que já
-- tinham corrido — nenhuma associação automática chegava a concluir-se.
--
-- Esta migração:
--   1. Extrai a transferência de referências para uma função auxiliar
--      partilhada (`_merge_profile_references`), com a lista de tabelas
--      correta (sem `tournament_players`; com `insurance_payments` e
--      `announcement_reads`, que a função original não cobria e por isso
--      perdia-se em CASCADE ao apagar a ficha antiga).
--   2. Corrige `associate_my_profile()` para usar essa função auxiliar.
--   3. Torna `handle_new_user()` (gatilho de signup) à prova de falhas —
--      idempotente e nunca bloqueia o login por causa da criação do perfil.
--   4. Cria `admin_merge_profiles()`: um administrador funde duas fichas à
--      mão, escolhendo qual das duas fica com o id (e portanto com a conta
--      de login, quando uma delas tiver uma). A outra é apagada depois de
--      as referências serem transferidas. Nunca apaga uma ficha que tenha
--      login próprio — é essa regra que evita reproduzir o bug do André.
--   5. Cria `admin_linked_profile_ids()`: expõe ao admin quais fichas têm
--      conta associada, para a UI saber que lado é seguro apagar.
-- ============================================================================

--------------------------------------------------------------------------------
-- 1. Função auxiliar: transfere todas as referências de uma ficha para outra
--------------------------------------------------------------------------------
-- Não é exposta via RPC (revogada de PUBLIC/authenticated/anon no fim) — só
-- é chamada de dentro de `associate_my_profile` e `admin_merge_profiles`,
-- que já verificam quem pode invocá-la e com que ids.
CREATE OR REPLACE FUNCTION public._merge_profile_references(id_antigo UUID, id_novo UUID)
RETURNS void AS $$
BEGIN
    -- callups: uma linha por (evento, jogador)
    DELETE FROM public.callups c WHERE c.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.callups x WHERE x.player_id = id_novo AND x.event_id = c.event_id);
    UPDATE public.callups SET player_id = id_novo WHERE player_id = id_antigo;

    -- attendances: uma linha por (evento, jogador)
    DELETE FROM public.attendances a WHERE a.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.attendances x WHERE x.player_id = id_novo AND x.event_id = a.event_id);
    UPDATE public.attendances SET player_id = id_novo WHERE player_id = id_antigo;

    -- stats: uma linha por (evento, jogador)
    DELETE FROM public.stats s WHERE s.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.stats x WHERE x.player_id = id_novo AND x.event_id = s.event_id);
    UPDATE public.stats SET player_id = id_novo WHERE player_id = id_antigo;

    -- dues: uma linha por (jogador, mês)
    DELETE FROM public.dues d WHERE d.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.dues x WHERE x.player_id = id_novo AND x.month_year = d.month_year);
    UPDATE public.dues SET player_id = id_novo WHERE player_id = id_antigo;

    -- charge_players: uma linha por (encargo, jogador)
    DELETE FROM public.charge_players cp WHERE cp.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.charge_players x WHERE x.player_id = id_novo AND x.charge_id = cp.charge_id);
    UPDATE public.charge_players SET player_id = id_novo WHERE player_id = id_antigo;

    -- announcement_reads: chave primária (comunicado, jogador)
    DELETE FROM public.announcement_reads ar WHERE ar.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.announcement_reads x WHERE x.player_id = id_novo AND x.announcement_id = ar.announcement_id);
    UPDATE public.announcement_reads SET player_id = id_novo WHERE player_id = id_antigo;

    -- Sem restrição de unicidade: transferência direta
    UPDATE public.charge_payments SET player_id = id_novo WHERE player_id = id_antigo;
    UPDATE public.insurance_payments SET player_id = id_novo WHERE player_id = id_antigo;
    UPDATE public.tournament_suspensions SET player_id = id_novo WHERE player_id = id_antigo;

    -- Autoria (quem criou o registo, tipicamente equipa técnica) — sem isto
    -- fica NULL (ON DELETE SET NULL) e perde-se quem lançou o quê.
    UPDATE public.announcements SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.charges SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.dues SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.events SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.charge_payments SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.insurance_payments SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.transactions SET created_by = id_novo WHERE created_by = id_antigo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public._merge_profile_references(UUID, UUID) FROM PUBLIC;

--------------------------------------------------------------------------------
-- 2. associate_my_profile — corrigida: sem tournament_players, via auxiliar
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.associate_my_profile(target_id UUID)
RETURNS public.profiles AS $$
DECLARE
    me public.profiles%ROWTYPE;
    me_id UUID := auth.uid();
    me_email TEXT;
    me_phone TEXT;
    me_words TEXT[];
    alvo public.profiles%ROWTYPE;
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
        RAISE EXCEPTION 'Ficha de atleta não encontrada.';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = alvo.id) THEN
        RAISE EXCEPTION 'Essa ficha já pertence a uma conta.';
    END IF;

    -- O target_id vem do cliente — não pode ser a única prova de identidade.
    -- find_my_profile_match só sugere; sem esta repetição aqui, qualquer conta
    -- autenticada podia reclamar a ficha de outra pessoa (todos os ids do
    -- plantel são públicos via v_players_public) só por saber ou escolher o
    -- id certo, ficando com a morada, o NIF, o cartão de cidadão e o IBAN de
    -- quem ainda não tem conta. Mesmas três regras e mesma ordem de
    -- find_my_profile_match, mas em modo completo — cobre também a
    -- correspondência automática por email só, que é o subconjunto mais
    -- restrito.
    SELECT * INTO me FROM public.profiles p WHERE p.id = me_id;
    SELECT lower(btrim(coalesce(me.email, u.email, ''))) INTO me_email
    FROM auth.users u WHERE u.id = me_id;
    me_email := coalesce(me_email, '');
    me_phone := regexp_replace(coalesce(me.phone, ''), '\D', '', 'g');
    me_words := public.nome_palavras(me.name);

    IF NOT (
        (me_email <> '' AND lower(btrim(coalesce(alvo.email, ''))) = me_email)
        OR (length(me_phone) >= 9
            AND length(regexp_replace(coalesce(alvo.phone, ''), '\D', '', 'g')) >= 9
            AND regexp_replace(coalesce(alvo.phone, ''), '\D', '', 'g') = me_phone)
        OR (coalesce(array_length(me_words, 1), 0) >= 2
            AND lower(btrim(coalesce(me.name, ''))) NOT IN ('novo atleta', 'novo jogador')
            AND (me_email = '' OR coalesce(lower(btrim(alvo.email)), '') IN ('', me_email))
            AND coalesce(array_length(public.nome_palavras(alvo.name), 1), 0) >= 2
            AND (public.nome_palavras(alvo.name))[1] = me_words[1]
            AND (public.nome_palavras(alvo.name))[array_length(public.nome_palavras(alvo.name), 1)]
                = me_words[array_length(me_words, 1)])
    ) THEN
        RAISE EXCEPTION 'Essa ficha não corresponde aos seus dados.';
    END IF;

    -- O perfil de quem chama pode ainda não existir (primeiro início de sessão).
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = me_id) THEN
        UPDATE public.profiles p SET
            name             = coalesce(alvo.name, p.name),
            nickname         = coalesce(alvo.nickname, p.nickname),
            shirt_name       = coalesce(alvo.shirt_name, alvo.nickname, p.shirt_name),
            phone            = coalesce(alvo.phone, p.phone),
            photo_url        = coalesce(alvo.photo_url, p.photo_url),
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
            id, name, nickname, shirt_name, email, phone, photo_url, status,
            jersey_number, kit_size, birth_date, nationality, position,
            address, postal_code, city, nif, id_number, id_card_expiry, iban,
            member_number, quota_start_date, quota_end_date
        )
        SELECT
            me_id, alvo.name, alvo.nickname, coalesce(alvo.shirt_name, alvo.nickname),
            coalesce(u.email, alvo.email), alvo.phone, alvo.photo_url, alvo.status,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

--------------------------------------------------------------------------------
-- 3. handle_new_user — defensivo: nunca bloqueia o signup, idempotente
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Novo Jogador'),
    new.email,
    'player', -- Por omissão, todos entram como Jogadores. Admin pode alterar.
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Uma falha aqui nunca pode impedir o login em si — fica para o fallback
  -- do cliente (AuthContext.fetchProfile) tentar criar o perfil a seguir.
  RAISE WARNING 'handle_new_user: falha ao criar perfil para %: %', new.id, SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--------------------------------------------------------------------------------
-- 4. admin_merge_profiles — merge administrativo de duas fichas
--------------------------------------------------------------------------------
-- O admin escolhe id_manter (a ficha que fica, com os seus próprios dados a
-- prevalecer nos conflitos) e id_apagar (a que desaparece, preenchendo só os
-- campos em falta na que fica). Nunca copia `role`/`roles` — mesma cautela
-- de associate_my_profile contra escalada de privilégio via ficha antiga.
--
-- Regra de segurança: id_apagar nunca pode ter conta de login própria. Se
-- tivesse, apagar essa ficha deixava essa conta sem perfil — exatamente o
-- bug que motivou esta função. Isto não impede escolher qualquer um dos dois
-- lados como sobrevivente: só impede apagar o lado que tem sessão.
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

GRANT EXECUTE ON FUNCTION public.admin_merge_profiles(UUID, UUID) TO authenticated;

--------------------------------------------------------------------------------
-- 5. admin_linked_profile_ids — quais fichas têm conta de login associada
--------------------------------------------------------------------------------
-- Só devolve ids (não há dados sensíveis aqui); mesmo assim, fica reservada
-- a admin — é informação de gestão de contas, não do plantel.
CREATE OR REPLACE FUNCTION public.admin_linked_profile_ids()
RETURNS SETOF UUID AS $$
BEGIN
    IF public.get_user_role() <> 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem consultar esta informação.';
    END IF;

    RETURN QUERY
    SELECT p.id FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_linked_profile_ids() TO authenticated;
