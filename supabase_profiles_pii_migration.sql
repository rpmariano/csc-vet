-- ============================================================================
-- PII: a tabela `profiles` deixa de ser legível por toda a gente.
--
-- `profiles` guarda morada, NIF, nº de cartão de cidadão e IBAN, e a política
-- antiga era `USING (true)`: qualquer utilizador autenticado lia a tabela
-- inteira, com os dados de toda a gente. Passa a ler-se a ficha completa só do
-- próprio e da equipa técnica; para o resto da app existe a vista
-- v_players_public, com os campos que os colegas de equipa precisam de ver uns
-- dos outros e mais nenhum.
--
-- Como o cliente deixa de poder ler as fichas dos outros, a associação de uma
-- conta à sua ficha de atleta passa para o servidor (secção 2), onde também
-- fica melhor guardada: só se pode reclamar uma ficha que não tenha conta, e
-- só se corresponder (email, telefone ou nome) a quem está a chamar — o
-- servidor repete a verificação, nunca confia no id que o cliente escolheu.
--
-- Idempotente — pode ser corrido várias vezes em segurança.
-- ============================================================================

--------------------------------------------------------------------------------
-- 1. VISTA PÚBLICA DO PLANTEL + RLS FECHADA
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_players_public
-- SEM security_invoker de propósito: a vista corre como o dono e por isso
-- continua a mostrar o plantel todo, mesmo com a RLS de `profiles` fechada.
-- É seguro porque as colunas sensíveis não estão aqui.
WITH (security_invoker = false) AS
SELECT
    id, name, nickname, shirt_name, jersey_number, photo_url, position,
    status, role, roles, kit_size, birth_date, nationality,
    quota_start_date, quota_end_date, created_at
FROM public.profiles;

COMMENT ON VIEW public.v_players_public IS
'Plantel com os campos não sensíveis: sem email, telefone, morada, NIF, cartão de cidadão, IBAN, contacto de emergência, notas clínicas nem documentos. É por aqui que a app lê os colegas de equipa.';

GRANT SELECT ON public.v_players_public TO authenticated;

DROP POLICY IF EXISTS "Profiles são legíveis por membros da equipa" ON public.profiles;
DROP POLICY IF EXISTS "Ficha completa: só o próprio e a equipa técnica" ON public.profiles;
CREATE POLICY "Ficha completa: só o próprio e a equipa técnica"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.get_user_role() IN ('coach', 'admin'));

--------------------------------------------------------------------------------
-- 2. ASSOCIAÇÃO DE CONTA A FICHA DE ATLETA
--------------------------------------------------------------------------------

-- Palavras significativas de um nome (as de 3 ou mais letras), para a
-- correspondência por primeiro + último nome.
CREATE OR REPLACE FUNCTION public.nome_palavras(n TEXT)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY(
        SELECT w FROM unnest(regexp_split_to_array(lower(btrim(coalesce(n, ''))), '\s+')) AS w
        WHERE length(w) > 2
    );
$$;

-- Devolve, no máximo, uma ficha de atleta sem conta associada que corresponda a
-- quem chama. Mesmas regras, e mesma ordem, do modal de associação: email
-- exato, telefone com 9+ dígitos e — só se p_email_only for falso — primeiro e
-- último nome iguais.
CREATE OR REPLACE FUNCTION public.find_my_profile_match(p_email_only BOOLEAN DEFAULT FALSE)
-- "position" tem de vir entre aspas: é palavra reservada e sem elas o
-- PostgreSQL rejeita a declaração da coluna de saída.
RETURNS TABLE (
    id UUID, name TEXT, nickname TEXT, shirt_name TEXT,
    jersey_number INTEGER, "position" TEXT, birth_date DATE, status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
    me public.profiles%ROWTYPE;
    me_email TEXT;
    me_phone TEXT;
    me_words TEXT[];
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;

    SELECT * INTO me FROM public.profiles p WHERE p.id = auth.uid();

    SELECT lower(btrim(coalesce(me.email, u.email, ''))) INTO me_email
    FROM auth.users u WHERE u.id = auth.uid();
    me_email := coalesce(me_email, '');
    me_phone := regexp_replace(coalesce(me.phone, ''), '\D', '', 'g');
    me_words := public.nome_palavras(me.name);

    RETURN QUERY
    WITH fichas AS (
        SELECT p.* FROM public.profiles p
        WHERE p.id <> auth.uid()
          AND p.jersey_number IS NOT NULL
          -- Uma ficha com conta associada pertence a outra pessoa.
          AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
    ),
    candidatas AS (
        SELECT f.*, 1 AS prioridade FROM fichas f
        WHERE me_email <> '' AND lower(btrim(coalesce(f.email, ''))) = me_email

        UNION ALL
        SELECT f.*, 2 FROM fichas f
        WHERE length(me_phone) >= 9
          AND length(regexp_replace(coalesce(f.phone, ''), '\D', '', 'g')) >= 9
          AND regexp_replace(coalesce(f.phone, ''), '\D', '', 'g') = me_phone

        UNION ALL
        SELECT f.*, 3 FROM fichas f
        WHERE NOT p_email_only
          AND coalesce(array_length(me_words, 1), 0) >= 2
          AND lower(btrim(coalesce(me.name, ''))) NOT IN ('novo atleta', 'novo jogador')
          -- Se a ficha já tem outro email atribuído, não associar pelo nome.
          AND (me_email = '' OR coalesce(lower(btrim(f.email)), '') IN ('', me_email))
          AND coalesce(array_length(public.nome_palavras(f.name), 1), 0) >= 2
          AND (public.nome_palavras(f.name))[1] = me_words[1]
          AND (public.nome_palavras(f.name))[array_length(public.nome_palavras(f.name), 1)]
              = me_words[array_length(me_words, 1)]
    )
    SELECT c.id, c.name, c.nickname, c.shirt_name, c.jersey_number, c.position, c.birth_date, c.status
    FROM candidatas c ORDER BY c.prioridade LIMIT 1;
END $$;

COMMENT ON FUNCTION public.find_my_profile_match(BOOLEAN) IS
'A ficha de atleta sem conta associada que corresponde a quem chama (email, telefone ou nome). Devolve só campos não sensíveis.';

-- Reclama uma ficha de atleta: copia-lhe os dados para o perfil de quem chama,
-- transfere as referências (convocatórias, presenças, estatísticas, quotas,
-- encargos, torneios) e apaga a ficha órfã.
CREATE OR REPLACE FUNCTION public.associate_my_profile(target_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
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

    -- Transferir as referências. Onde há chave única por (evento, jogador) ou
    -- (mês, jogador), apagam-se primeiro as linhas da ficha que colidiriam com
    -- as que a conta já tem — senão o UPDATE violava a restrição.
    DELETE FROM public.callups c WHERE c.player_id = alvo.id
        AND EXISTS (SELECT 1 FROM public.callups x WHERE x.player_id = me_id AND x.event_id = c.event_id);
    UPDATE public.callups SET player_id = me_id WHERE player_id = alvo.id;

    DELETE FROM public.attendances a WHERE a.player_id = alvo.id
        AND EXISTS (SELECT 1 FROM public.attendances x WHERE x.player_id = me_id AND x.event_id = a.event_id);
    UPDATE public.attendances SET player_id = me_id WHERE player_id = alvo.id;

    DELETE FROM public.stats s WHERE s.player_id = alvo.id
        AND EXISTS (SELECT 1 FROM public.stats x WHERE x.player_id = me_id AND x.event_id = s.event_id);
    UPDATE public.stats SET player_id = me_id WHERE player_id = alvo.id;

    DELETE FROM public.dues d WHERE d.player_id = alvo.id
        AND EXISTS (SELECT 1 FROM public.dues x WHERE x.player_id = me_id AND x.month_year = d.month_year);
    UPDATE public.dues SET player_id = me_id WHERE player_id = alvo.id;

    DELETE FROM public.charge_players cp WHERE cp.player_id = alvo.id
        AND EXISTS (SELECT 1 FROM public.charge_players x WHERE x.player_id = me_id AND x.charge_id = cp.charge_id);
    UPDATE public.charge_players SET player_id = me_id WHERE player_id = alvo.id;
    UPDATE public.charge_payments SET player_id = me_id WHERE player_id = alvo.id;

    DELETE FROM public.tournament_players tp WHERE tp.player_id = alvo.id
        AND EXISTS (SELECT 1 FROM public.tournament_players x WHERE x.player_id = me_id AND x.tournament_id = tp.tournament_id);
    UPDATE public.tournament_players SET player_id = me_id WHERE player_id = alvo.id;
    UPDATE public.tournament_suspensions SET player_id = me_id WHERE player_id = alvo.id;

    DELETE FROM public.profiles WHERE id = alvo.id;

    RETURN resultado;
END $$;

COMMENT ON FUNCTION public.associate_my_profile(UUID) IS
'Reclama uma ficha de atleta sem conta associada e que corresponda (email, telefone ou nome) a quem chama: copia os dados para o perfil de quem chama, transfere as referências e apaga a ficha órfã. Repete a verificação de correspondência de find_my_profile_match — nunca confia no target_id isolado.';

REVOKE ALL ON FUNCTION public.find_my_profile_match(BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.associate_my_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_my_profile_match(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.associate_my_profile(UUID) TO authenticated;
