-- A identidade de uma pessoa é o email, e mais nada.
--
-- Uma conta liga-se à ficha que a direção criou quando — e só quando — o email
-- do registo é igual ao email da ficha. Se não houver ficha com esse email, a
-- conta fica por ligar, e é a direção que resolve no ecrã 3d.
--
-- ## O que estava mal
--
-- `find_my_profile_match()` e `associate_my_profile()` aceitavam três provas de
-- identidade: o email, o **telefone** com 9 ou mais dígitos, e o **primeiro e o
-- último nome** iguais. As duas últimas são adivinhações, e a do telefone era
-- pior do que isso — era uma porta.
--
-- **A falha.** A política de UPDATE da própria ficha é
-- `WITH CHECK (auth.uid() = id AND role = get_user_role()
--              AND NOT (roles IS DISTINCT FROM get_user_roles()))`:
-- guarda o papel, e mais nada. O `email` e o `phone` da própria ficha ficam
-- escrevíveis por quem lá está — a UI das Definições não os oferece, mas a chave
-- anónima está no bundle e um `update({ phone })` direto passa à mesma. E
-- `associate_my_profile()` comparava `me.phone`, lido de `public.profiles`.
--
-- Portanto: registar uma conta, pôr no telefone da própria ficha o número de um
-- sócio, ir buscar o `id` dele a `v_players_public` — que é legível por qualquer
-- autenticado — e chamar `associate_my_profile(esse_id)`. A função copiava para
-- a conta do atacante o NIF, o IBAN, a morada, o cartão de cidadão e as notas
-- médicas da vítima, transferia-lhe as referências e **apagava a ficha original**.
-- O mesmo pelo nome, para dois homónimos.
--
-- ## O que passa a valer
--
-- A única prova aceite é `auth.users.email` — o email com que a sessão foi
-- iniciada, verificado pelo Supabase e que ninguém pode escrever a partir do
-- cliente. Em especial **deixa de se olhar para `public.profiles.email` do lado
-- de quem chama**: essa coluna é auto-editável e servia igualmente para forjar a
-- correspondência. Do lado da ficha alvo, `profiles.email` continua a ser o que
-- se compara — é a ficha que a direção criou, e a direção é que lhe escreve.
--
-- Sai também a exigência de a ficha ter `jersey_number` para ser candidata:
-- `profiles` são as pessoas do clube e nem todas jogam. Um treinador que não
-- entra em campo tem ficha sem camisola, e não havia como a associação
-- automática lha encontrar.
--
-- ## Compatibilidade
--
-- O parâmetro `p_email_only` fica na assinatura, ignorado, porque a `main` em
-- produção ainda chama `find_my_profile_match({ p_email_only: true })` e
-- `find_my_profile_match()`. Assim esta migração aperta a produção de imediato,
-- sem esperar pela fusão do redesenho. Tira-se a assinatura antiga quando a
-- `redesign` entrar na `main`.
--
-- Verificado antes de aplicar: as 19 fichas sem conta têm todas email, por isso
-- passar a exigir email não deixa ninguém para trás.

CREATE OR REPLACE FUNCTION public.find_my_profile_match(p_email_only BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
    id            UUID,
    name          TEXT,
    nickname      TEXT,
    shirt_name    TEXT,
    jersey_number INTEGER,
    "position"    TEXT,
    birth_date    DATE,
    status        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    me_email TEXT;
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;

    -- Só de `auth.users`: é o email verificado da sessão. O de `public.profiles`
    -- é auto-editável e não prova identidade nenhuma.
    SELECT lower(btrim(coalesce(u.email, ''))) INTO me_email
    FROM auth.users u WHERE u.id = auth.uid();

    IF coalesce(me_email, '') = '' THEN RETURN; END IF;

    RETURN QUERY
    SELECT p.id, p.name, p.nickname, p.shirt_name, p.jersey_number, p.position,
           p.birth_date, p.status
    FROM public.profiles p
    WHERE p.id <> auth.uid()
      -- Uma ficha que já tem conta é de outra pessoa.
      AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
      AND lower(btrim(coalesce(p.email, ''))) = me_email
    ORDER BY p.created_at
    LIMIT 1;
END $$;

COMMENT ON FUNCTION public.find_my_profile_match(BOOLEAN) IS
'A ficha do clube com o mesmo email da sessão, se existir e ainda não tiver '
'conta. O email é o de auth.users — a identidade é o email e mais nada. O '
'parâmetro p_email_only é ignorado: existe só porque a versão em produção ainda '
'o passa.';

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

    -- A única prova. O telefone e o nome saíram: o primeiro era auto-editável e
    -- dava para reclamar a ficha de outra pessoa; o segundo confundia homónimos.
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
$$;

COMMENT ON FUNCTION public.associate_my_profile(UUID) IS
'Liga a conta com sessão iniciada à ficha do clube que tem o mesmo email, '
'transferindo as referências e apagando a ficha antiga. A identidade é o email '
'de auth.users e mais nada — o telefone e o nome deixaram de servir como prova, '
'porque o telefone da própria ficha é auto-editável e permitia reclamar a ficha '
'de outra pessoa.';

-- Os privilégios não mudam com o CREATE OR REPLACE, mas repetem-se para o
-- ficheiro poder ser aplicado de novo num projeto limpo. Ver o ponto 7 dos
-- riscos no CLAUDE.md: este esquema concede EXECUTE a anon por omissão.
REVOKE ALL ON FUNCTION public.find_my_profile_match(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.associate_my_profile(UUID)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_my_profile_match(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.associate_my_profile(UUID)     TO authenticated;
