-- ============================================================================
-- Redesenho 2026 — fase 1: o que a base de dados ainda não tem
--
-- Os ecrãs do handoff pressupõem dados que hoje não existem. Estas colunas e
-- tabelas entram antes do trabalho de interface, e ficam vazias: nada nesta
-- migração é lido ou escrito pela app tal como está. É de propósito — assim os
-- ecrãs das fases seguintes nascem já com os campos certos, em vez de se
-- mexer duas vezes em cada um.
--
-- **Não estão aqui** quatro colunas que o handoff pede como novas mas que já
-- existem no esquema: `profiles.quota_start_date`, `profiles.quota_end_date`,
-- `tournaments.organizer_name` e `tournaments.image_url`.
--
-- Idempotente — pode ser corrida várias vezes em segurança.
-- ============================================================================


--------------------------------------------------------------------------------
-- 1. Pé preferido
--------------------------------------------------------------------------------
-- Ficha do atleta (ecrã 3b/3c). Em português, como o resto do vocabulário da
-- app — as posições já são GR/LE/DCE… e não GK/LB/LCB.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS preferred_foot TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND conname = 'profiles_preferred_foot_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_preferred_foot_check
            CHECK (preferred_foot IS NULL
                   OR preferred_foot IN ('direito', 'esquerdo', 'ambos'));
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.preferred_foot IS
'Pé preferido: direito, esquerdo ou ambos. Nulo enquanto não for preenchido.';


--------------------------------------------------------------------------------
-- 2. Meses dispensados de quota
--------------------------------------------------------------------------------
-- O handoff pede, no editar atleta (3c), "meses dispensados de quota" — um
-- atleta a quem a direção perdoa um mês em concreto, sem mexer no período de
-- atividade nem na regra da época.
--
-- Tabela e não um array em `profiles`: a dispensa é uma decisão da direção
-- sobre a conta de um atleta, e num array dentro da ficha ficaria sujeita à
-- política de UPDATE do próprio, que deixa cada um editar a sua ficha. Aqui a
-- escrita é só de admin, como em `dues`.
--
-- `month_year` em texto 'YYYY-MM' para casar com `dues.month_year` e com o
-- `monthYear` de `src/lib/finance.ts` — a matriz de quotas cruza os dois.

CREATE TABLE IF NOT EXISTS public.quota_exemptions (
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    month_year TEXT NOT NULL CHECK (month_year ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    reason     TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (profile_id, month_year)
);

ALTER TABLE public.quota_exemptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.quota_exemptions IS
'Meses em que um atleta está dispensado de quota. Distinto do período de atividade (profiles.quota_start_date/quota_end_date): aqui é uma dispensa pontual, decidida pela direção.';

-- Mesma repartição de `dues`: a direção gere tudo, cada um vê o que é seu.
--
-- `(SELECT auth.uid())` e não `auth.uid()`: dentro de um subselect o Postgres
-- avalia-o uma vez por consulta em vez de uma vez por linha. Sem isto o
-- advisor do Supabase assinala `auth_rls_initplan` — e numa matriz de quotas,
-- que lê jogador × mês de uma vez, a diferença nota-se.
DROP POLICY IF EXISTS "Admins gerem as dispensas de quota" ON public.quota_exemptions;
CREATE POLICY "Admins gerem as dispensas de quota"
ON public.quota_exemptions FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin')
WITH CHECK (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Cada um vê as suas dispensas" ON public.quota_exemptions;
CREATE POLICY "Cada um vê as suas dispensas"
ON public.quota_exemptions FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = profile_id);


--------------------------------------------------------------------------------
-- 3. Notificações — preferências
--------------------------------------------------------------------------------
-- Ecrãs 12a/12b. Uma linha por pessoa, criada à primeira vez que alguém mexe
-- nas preferências; sem linha valem os valores por omissão das colunas, que
-- são os do handoff (tudo ligado, silêncio das 23h às 8h).
--
-- As duas últimas só interessam a quem gere; ficam na mesma tabela porque um
-- jogador pode passar a treinador e não se perde o que tinha escolhido.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    convocatorias              BOOLEAN NOT NULL DEFAULT TRUE,
    comunicados                BOOLEAN NOT NULL DEFAULT TRUE,
    quotas_em_atraso           BOOLEAN NOT NULL DEFAULT TRUE,
    eventos_sem_convocatoria   BOOLEAN NOT NULL DEFAULT TRUE,
    fichas_por_preencher       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Horas locais (Europe/Lisbon), não UTC: "não me incomodes depois das 23h"
    -- é uma frase sobre o relógio de quem recebe, e não muda com o horário de
    -- verão nem com o servidor.
    silencio_inicio TIME NOT NULL DEFAULT '23:00',
    silencio_fim    TIME NOT NULL DEFAULT '08:00',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.notification_preferences IS
'O que cada pessoa quer receber e a que horas. Sem linha, valem os valores por omissão das colunas.';

-- Como em `announcement_reads`: isto é do próprio, nem a equipa técnica tem
-- nada que ver com o que cada um escolheu receber.
DROP POLICY IF EXISTS "Cada um vê as suas preferências" ON public.notification_preferences;
CREATE POLICY "Cada um vê as suas preferências"
ON public.notification_preferences FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS "Cada um cria as suas preferências" ON public.notification_preferences;
CREATE POLICY "Cada um cria as suas preferências"
ON public.notification_preferences FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS "Cada um altera as suas preferências" ON public.notification_preferences;
CREATE POLICY "Cada um altera as suas preferências"
ON public.notification_preferences FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = profile_id)
WITH CHECK ((SELECT auth.uid()) = profile_id);


--------------------------------------------------------------------------------
-- 4. Notificações — registo de envios
--------------------------------------------------------------------------------
-- O que foi enviado a quem, para não se repetir o mesmo aviso e para o ecrã
-- 12a poder listar o que chegou.
--
-- **Sem política de INSERT de propósito.** Quem escreve aqui é o lado do
-- servidor (a `service_role` não passa pela RLS): notificar é uma decisão do
-- sistema — "faltam três dias e este jogo não tem convocatória" — não um gesto
-- de alguém no browser. Se a fase 8 decidir que há um caminho a partir do
-- cliente, é aqui que se acrescenta a política, com a restrição que o caso
-- pedir.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    tipo       TEXT NOT NULL CHECK (tipo IN (
                   'convocatoria',
                   'comunicado',
                   'quota_em_atraso',
                   'evento_sem_convocatoria',
                   'ficha_por_preencher'
               )),
    titulo     TEXT NOT NULL,
    corpo      TEXT,
    -- Caminho dentro da app onde o aviso se resolve (ex.: '/calendar?event=…').
    -- O handoff é explícito: cada notificação abre onde se resolve, não numa
    -- lista.
    destino    TEXT,
    -- O evento, comunicado ou encargo a que o aviso diz respeito. Sem chave
    -- estrangeira porque aponta para tabelas diferentes conforme o `tipo`.
    origem_id  UUID,
    enviada_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    lida_em    TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- O ecrã de notificações lê sempre as da pessoa com sessão, por ordem inversa.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pessoa
    ON public.notification_deliveries(profile_id, enviada_em DESC);

-- Para não enviar duas vezes o mesmo aviso sobre a mesma coisa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_sem_repetidos
    ON public.notification_deliveries(profile_id, tipo, origem_id)
    WHERE origem_id IS NOT NULL;

COMMENT ON TABLE public.notification_deliveries IS
'Avisos enviados a cada pessoa. Escrito pelo lado do servidor (service_role); do cliente só se lê e se marca como lido.';

DROP POLICY IF EXISTS "Cada um vê os seus avisos" ON public.notification_deliveries;
CREATE POLICY "Cada um vê os seus avisos"
ON public.notification_deliveries FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = profile_id);

-- Marcar como lido é o único gesto do cliente sobre uma linha destas.
DROP POLICY IF EXISTS "Cada um marca os seus avisos como lidos" ON public.notification_deliveries;
CREATE POLICY "Cada um marca os seus avisos como lidos"
ON public.notification_deliveries FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = profile_id)
WITH CHECK ((SELECT auth.uid()) = profile_id);


--------------------------------------------------------------------------------
-- 5. Contas por ligar a uma ficha de atleta
--------------------------------------------------------------------------------
-- Ecrã 3d: a associação automática falhou e a direção escolhe, à mão, que
-- conta pertence àquele atleta.
--
-- É uma função e não uma vista, ao contrário do que o plano previa. Uma vista
-- teria de ler `auth.users` — que a role `authenticated` não pode ler — e por
-- isso teria de ser SECURITY DEFINER; e uma vista SECURITY DEFINER só se
-- fecha com REVOKE/GRANT à tabela toda, o que a deixaria legível por qualquer
-- autenticado. Uma função guarda o acesso lá dentro, e é o padrão que este
-- esquema já usa em `admin_linked_profile_ids()`.
--
-- "Conta por ligar" é uma ficha que **tem login** e não tem sinal nenhum de
-- ser uma ficha de atleta: sem número de camisola, sem número de sócio, sem
-- data de nascimento e sem posição. É o que sobra de um registo novo antes de
-- alguém o ligar ao plantel. É uma heurística — a fase 5, ao desenhar o ecrã,
-- pode apertá-la.
--
-- A guarda usa IS DISTINCT FROM e não <>: com `get_user_role()` a devolver
-- NULL (conta ainda sem ficha), um `<>` daria NULL e o IF não dispararia.

CREATE OR REPLACE FUNCTION public.admin_contas_sem_atleta()
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
    IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem consultar esta informação.';
    END IF;

    RETURN QUERY
    SELECT p.id, p.name, p.email, p.photo_url, p.created_at
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
      AND p.jersey_number IS NULL
      AND p.member_number IS NULL
      AND p.birth_date    IS NULL
      AND (p.position IS NULL OR btrim(p.position) = '')
    ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_contas_sem_atleta() IS
'Contas com login que não parecem ainda estar ligadas a uma ficha de atleta. Para o ecrã de associação manual (3d). Só admin.';

-- Este esquema tem privilégios por omissão que dão EXECUTE a `anon` e
-- `authenticated` em toda a função nova — um REVOKE a PUBLIC não chegava.
REVOKE ALL ON FUNCTION public.admin_contas_sem_atleta() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_contas_sem_atleta() TO authenticated;
