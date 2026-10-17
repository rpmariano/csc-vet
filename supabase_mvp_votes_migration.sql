-- ============================================================================
-- MIGRATION: Votação de MVP dos Jogos (2 votos por utilizador elegível)
-- ============================================================================
--
-- Substitui a escolha manual do MVP pela equipa técnica por uma votação
-- aberta a todos os atletas convocados e equipa técnica.
-- Cada votante escolhe 2 jogadores da partida.
-- O jogador com mais votos no jogo é o MVP da partida.
--
-- Garantias de segurança e integridade:
-- 1. Apenas os convocados (que não recusaram a convocatória ou que participaram no jogo)
--    e a equipa técnica/direção podem votar.
-- 2. Cada votante pode submeter no máximo 1 voto por jogo (com 2 atletas distintos).
-- 3. Apenas convocados e equipa técnica recebem avisos / notificações push de voto pendente.
-- 4. Acesso às tabelas classificativas de MVP no menu Competição reservado a
--    Pedro Vieira e Rui Mariano (admin/dev).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mvp_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(event_id, voter_id),
    CHECK (player1_id <> player2_id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_votes_event ON public.mvp_votes(event_id);
CREATE INDEX IF NOT EXISTS idx_mvp_votes_voter ON public.mvp_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_mvp_votes_player1 ON public.mvp_votes(player1_id);
CREATE INDEX IF NOT EXISTS idx_mvp_votes_player2 ON public.mvp_votes(player2_id);

ALTER TABLE public.mvp_votes ENABLE ROW LEVEL SECURITY;

-- 1. Leitura: Todos os utilizadores autenticados podem consultar os votos
-- (necessário para calcular contagem de votos, MVP eleito e lista de quem já votou)
DROP POLICY IF EXISTS "Votos MVP legíveis por utilizadores autenticados" ON public.mvp_votes;
CREATE POLICY "Votos MVP legíveis por utilizadores autenticados"
ON public.mvp_votes FOR SELECT
TO authenticated
USING (true);

-- 2. Inserção: Apenas o próprio utilizador E apenas se for convocado ou equipa técnica
DROP POLICY IF EXISTS "Utilizador regista o seu próprio voto MVP" ON public.mvp_votes;
CREATE POLICY "Utilizador regista o seu próprio voto MVP"
ON public.mvp_votes FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = voter_id
    AND (
        -- Equipa técnica ou direção
        public.get_user_role() IN ('coach', 'admin')
        -- Ou atleta convocado que não recusou
        OR EXISTS (
            SELECT 1 FROM public.callups c
            WHERE c.event_id = mvp_votes.event_id
              AND c.player_id = auth.uid()
              AND c.status <> 'declined'
        )
        -- Ou atleta que participou no jogo
        OR EXISTS (
            SELECT 1 FROM public.stats s
            WHERE s.event_id = mvp_votes.event_id
              AND s.player_id = auth.uid()
        )
    )
);

-- 3. Atualização: Apenas o próprio utilizador E apenas se mantiver elegibilidade
DROP POLICY IF EXISTS "Utilizador altera o seu próprio voto MVP" ON public.mvp_votes;
CREATE POLICY "Utilizador altera o seu próprio voto MVP"
ON public.mvp_votes FOR UPDATE
TO authenticated
USING (
    auth.uid() = voter_id
    AND (
        public.get_user_role() IN ('coach', 'admin')
        OR EXISTS (
            SELECT 1 FROM public.callups c
            WHERE c.event_id = mvp_votes.event_id
              AND c.player_id = auth.uid()
              AND c.status <> 'declined'
        )
        OR EXISTS (
            SELECT 1 FROM public.stats s
            WHERE s.event_id = mvp_votes.event_id
              AND s.player_id = auth.uid()
        )
    )
)
WITH CHECK (auth.uid() = voter_id);

-- 4. Remoção: O próprio utilizador ou equipa técnica/admin pode remover
DROP POLICY IF EXISTS "Utilizador ou admin remove voto MVP" ON public.mvp_votes;
CREATE POLICY "Utilizador ou admin remove voto MVP"
ON public.mvp_votes FOR DELETE
TO authenticated
USING (auth.uid() = voter_id OR public.get_user_role() IN ('coach', 'admin'));


-- ============================================================================
-- ATUALIZAÇÃO DE AVISOS PENDENTES (PUSH NOTIFICATIONS)
-- ============================================================================
-- Garante que apenas os atletas convocados e a equipa técnica recebem
-- notificação push a pedir o voto no MVP da partida.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.avisos_pendentes()
RETURNS TABLE (
  profile_id uuid,
  tipo       text,
  titulo     text,
  corpo      text,
  destino    text,
  origem_id  uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH prefs AS (
  SELECT p.id AS profile_id,
         COALESCE(np.convocatorias, true)              AS convocatorias,
         COALESCE(np.comunicados, true)                AS comunicados,
         COALESCE(np.quotas_em_atraso, true)           AS quotas,
         COALESCE(np.eventos_sem_convocatoria, true)   AS sem_convocatoria,
         COALESCE(np.fichas_por_preencher, true)       AS fichas,
         COALESCE(np.silencio_inicio, TIME '23:00')    AS silencio_inicio,
         COALESCE(np.silencio_fim, TIME '08:00')       AS silencio_fim,
         ('player'::user_role = ANY (COALESCE(p.roles, ARRAY[p.role])))                       AS joga,
         (ARRAY['coach','admin']::user_role[] && COALESCE(p.roles, ARRAY[p.role]))            AS gere,
         ('supporter'::user_role = ANY (COALESCE(p.roles, ARRAY[p.role])))                    AS adepto
    FROM profiles p
    LEFT JOIN notification_preferences np ON np.profile_id = p.id
   WHERE EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.profile_id = p.id)
), acordados AS (
  SELECT * FROM prefs
   WHERE CASE
           WHEN silencio_inicio = silencio_fim THEN true
           WHEN silencio_inicio < silencio_fim
             THEN (now() AT TIME ZONE 'Europe/Lisbon')::time NOT BETWEEN silencio_inicio AND silencio_fim
           ELSE (now() AT TIME ZONE 'Europe/Lisbon')::time < silencio_inicio
            AND (now() AT TIME ZONE 'Europe/Lisbon')::time >= silencio_fim
         END
),

-- 1. Convocatórias pendentes
convocatorias AS (
  SELECT a.profile_id,
         'convocatoria'::text AS tipo,
         CASE WHEN e.type = 'match' THEN
                CASE WHEN a.adepto THEN 'Vem apoiar-nos em mais um jogo!'
                     ELSE 'Foste convocado para um jogo' END
              WHEN e.type = 'gathering' THEN 'Foste convocado para um convívio'
              ELSE 'Foste convocado para um treino' END AS titulo,
         to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' às ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'HH24:MI')
           || CASE WHEN e.type = 'match' AND a.adepto
                   THEN ' — confirma a tua presença para nos apoiares.'
                   ELSE ' — diz se podes ir.' END AS corpo,
         '/calendar?event=' || e.id::text AS destino,
         c.id AS origem_id
    FROM acordados a
    JOIN callups c ON c.player_id = a.profile_id AND c.status = 'called'
    JOIN events  e ON e.id = c.event_id
   WHERE a.convocatorias
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time > now()
     AND (e.type <> 'practice' OR e.date_time <= now() + interval '6 days')
),

-- 2. Comunicados publicados
comunicados AS (
  SELECT a.profile_id,
         'comunicado'::text AS tipo,
         'Novo comunicado'::text AS titulo,
         an.title AS corpo,
         '/'::text AS destino,
         an.id AS origem_id
    FROM acordados a
    CROSS JOIN announcements an
   WHERE a.comunicados
     AND an.published_at > now() - interval '14 days'
     AND an.is_active IS DISTINCT FROM false
     AND (
       NOT a.adepto 
       OR (
         COALESCE(an.target_audience, 'all') <> 'no_supporters'
         AND an.content NOT LIKE '%<!--target:no_supporters-->%'
       )
     )
     AND NOT EXISTS (
       SELECT 1 FROM announcement_reads r
        WHERE r.announcement_id = an.id AND r.player_id = a.profile_id
     )
),

-- 3. Quotas em atraso
quotas AS (
  SELECT a.profile_id,
         'quota_atrasada'::text AS tipo,
         'Tens quotas em atraso'::text AS titulo,
         to_char(q.mes, 'TMMonth "de" YYYY', 'nls_date_language=Portuguese') || ' por regularizar.' AS corpo,
         '/financas'::text AS destino,
         ('00000000-0000-0000-0000-' || to_char(q.mes, 'YYYYMMDD') || '0000')::uuid AS origem_id
    FROM acordados a
    JOIN profiles p ON p.id = a.profile_id
    CROSS JOIN LATERAL (
      SELECT date_trunc('month', d)::date AS mes
        FROM generate_series(
          date_trunc('month', GREATEST(COALESCE(p.created_at::date, CURRENT_DATE), '2024-09-01'::date))::timestamp,
          date_trunc('month', CURRENT_DATE)::timestamp,
          interval '1 month'
        ) d
    ) q
   WHERE a.quotas
     AND a.joga
     AND NOT EXISTS (
       SELECT 1 FROM monthly_dues md
        WHERE md.player_id = a.profile_id
          AND md.month = q.mes
          AND md.status = 'pago'
     )
     AND NOT EXISTS (
       SELECT 1 FROM push_logs pl
        WHERE pl.profile_id = a.profile_id
          AND pl.tipo = 'quota_atrasada'
          AND pl.enviado_em >= date_trunc('month', now())
     )
   LIMIT 1
),

-- 4. Eventos sem convocatória (apenas staff/direção)
sem_convocatoria AS (
  SELECT a.profile_id,
         'sem_convocatoria'::text AS tipo,
         'Evento sem convocatória'::text AS titulo,
         e.title || ' (' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM HH24:MI') || ') ainda não tem convocados.' AS corpo,
         '/events'::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.gere
     AND a.sem_convocatoria
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time BETWEEN now() AND now() + interval '3 days'
     AND NOT EXISTS (SELECT 1 FROM callups c WHERE c.event_id = e.id)
     AND NOT EXISTS (
       SELECT 1 FROM push_logs pl
        WHERE pl.profile_id = a.profile_id
          AND pl.tipo = 'sem_convocatoria'
          AND pl.origem_id = e.id
          AND pl.enviado_em >= now() - interval '24 hours'
     )
),

-- 5. Fichas de jogo por preencher (apenas staff/direção)
fichas_pendentes AS (
  SELECT a.profile_id,
         'ficha_jogo'::text AS tipo,
         'Ficha de jogo por preencher'::text AS titulo,
         'O jogo contra ' || COALESCE(o.name, 'adversário') || ' terminou. Preenche o resultado e os marcadores.' AS corpo,
         '/events'::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
    LEFT JOIN opponents o ON o.id = e.opponent_id
   WHERE a.gere
     AND a.fichas
     AND e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time BETWEEN now() - interval '48 hours' AND now() - interval '2 hours'
     AND (e.home_score IS NULL OR e.away_score IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM push_logs pl
        WHERE pl.profile_id = a.profile_id
          AND pl.tipo = 'ficha_jogo'
          AND pl.origem_id = e.id
          AND pl.enviado_em >= now() - interval '24 hours'
     )
),

-- 6. Votos de MVP pendentes: APENAS para jogadores convocados e equipa técnica/direção que ainda não votaram
votos_mvp_pendentes AS (
  SELECT a.profile_id,
         'voto_mvp'::text AS tipo,
         'Votação de MVP em aberto'::text AS titulo,
         'A ficha de jogo já saiu. Vota nos 2 melhores atletas da partida!'::text AS corpo,
         '/?mvp_event=' || e.id::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.home_score IS NOT NULL
     AND e.away_score IS NOT NULL
     AND e.date_time BETWEEN now() - interval '7 days' AND now()
     -- APENAS equipa técnica ou atletas convocados (não recusados) ou que jogaram
     AND (
       a.gere
       OR EXISTS (
         SELECT 1 FROM callups c
          WHERE c.event_id = e.id
            AND c.player_id = a.profile_id
            AND c.status <> 'declined'
       )
       OR EXISTS (
         SELECT 1 FROM stats s
          WHERE s.event_id = e.id
            AND s.player_id = a.profile_id
       )
     )
     -- Ainda não votou neste jogo
     AND NOT EXISTS (
       SELECT 1 FROM mvp_votes mv
        WHERE mv.event_id = e.id
          AND mv.voter_id = a.profile_id
     )
     -- Só notifica uma vez por dia por jogo
     AND NOT EXISTS (
       SELECT 1 FROM push_logs pl
        WHERE pl.profile_id = a.profile_id
          AND pl.tipo = 'voto_mvp'
          AND pl.origem_id = e.id
          AND pl.enviado_em >= now() - interval '24 hours'
     )
)

SELECT * FROM convocatorias
UNION ALL
SELECT * FROM comunicados
UNION ALL
SELECT * FROM quotas
UNION ALL
SELECT * FROM sem_convocatoria
UNION ALL
SELECT * FROM fichas_pendentes
UNION ALL
SELECT * FROM votos_mvp_pendentes;
$$;
