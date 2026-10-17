-- ============================================================================
-- MIGRAÇÃO: VOTAÇÃO MVP EXCLUSIVA A TREINADORES E JOGADORES CONVOCADOS
-- ============================================================================
-- O perfil de direção não dá direito de votar no MVP.
-- Apenas podem votar utilizadores com perfil de treinador (coach)
-- ou utilizadores com perfil de jogador convocados para a partida.
-- ============================================================================

-- 1. Atualizar RLS de inserção em public.mvp_votes
DROP POLICY IF EXISTS "Utilizador regista o seu próprio voto MVP" ON public.mvp_votes;
CREATE POLICY "Utilizador regista o seu próprio voto MVP"
ON public.mvp_votes FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = voter_id
    AND (
        -- Apenas treinadores (perfil de direção não tem direito a voto)
        public.get_user_role() = 'coach'
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND ('coach'::user_role = ANY (COALESCE(p.roles, ARRAY[p.role])))
        )
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

-- 2. Atualizar avisos_pendentes() para notificar APENAS treinadores e convocados
CREATE OR REPLACE FUNCTION public.avisos_pendentes()
RETURNS TABLE (
    profile_id   UUID,
    tipo         TEXT,
    titulo       TEXT,
    corpo        TEXT,
    destino      TEXT,
    origem_id    TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH prefs AS (
  SELECT p.id                                                                               AS profile_id,
         COALESCE(np.convocatorias, true)                                                   AS convocatorias,
         COALESCE(np.comunicados, true)                                                     AS comunicados,
         COALESCE(np.quotas, true)                                                          AS quotas,
         COALESCE(np.convocatorias_abertas, true)                                           AS convocatorias_abertas,
         COALESCE(np.fichas_por_preencher, true)                                            AS fichas,
         COALESCE(np.silencio_inicio, TIME '23:00')                                         AS silencio_inicio,
         COALESCE(np.silencio_fim, TIME '08:00')                                            AS silencio_fim,
         (
           p.role = 'supporter'::user_role
           OR ('supporter'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
         )                                                                                  AS adepto,
         (
           p.role <> 'supporter'::user_role
           AND NOT ('supporter'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
           AND ('player'::user_role = ANY (COALESCE(p.roles, ARRAY[p.role])))
         )                                                                                  AS joga,
         (ARRAY['coach','admin']::user_role[] && COALESCE(p.roles, ARRAY[p.role]))         AS gere,
         ('coach'::user_role = ANY (COALESCE(p.roles, ARRAY[p.role])))                     AS treinador
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

-- 1. Convocatórias
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
         c.id::text AS origem_id
    FROM acordados a
    JOIN callups c ON c.player_id = a.profile_id AND c.status = 'called'
    JOIN events  e ON e.id = c.event_id
   WHERE a.convocatorias
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time > now()
     AND (e.type <> 'practice' OR e.date_time <= now() + interval '6 days')
     AND (NOT a.adepto OR e.type IN ('match', 'gathering'))
),

-- 2. Comunicados
comunicados AS (
  SELECT a.profile_id,
         'comunicado'::text AS tipo,
         'Novo comunicado'::text AS titulo,
         an.title AS corpo,
         '/'::text AS destino,
         an.id::text AS origem_id
    FROM acordados a
    CROSS JOIN announcements an
   WHERE a.comunicados
     AND an.published_at > now() - interval '14 days'
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

-- 3. Quotas vencidas
quotas AS (
  SELECT a.profile_id,
         'quota'::text AS tipo,
         'Quota em atraso'::text AS titulo,
         initcap(to_char(v.month_start, 'TMMonth')) || ' ' || to_char(v.month_start, 'YYYY')
           || ' — ' || trim(to_char(v.expected_amount, '999D99')) || ' €' AS corpo,
         '/settings'::text AS destino,
         md5(a.profile_id::text || v.month_year)::text AS origem_id
    FROM acordados a
    JOIN v_quota_status v ON v.player_id = a.profile_id
   WHERE a.quotas
     AND a.joga
     AND v.balance < 0
     AND NOT (
       v.month_start >= date_trunc('month', now() AT TIME ZONE 'Europe/Lisbon')::date
       AND (now() AT TIME ZONE 'Europe/Lisbon')::date < (date_trunc('month', now() AT TIME ZONE 'Europe/Lisbon') + interval '7 days')::date
     )
),

-- 4. Convocatórias por abrir (gestão)
abertas AS (
  SELECT a.profile_id,
         'convocatoria_aberta'::text AS tipo,
         'Convocatória por abrir'::text AS titulo,
         'O jogo de ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' ainda não tem convocatória.' AS corpo,
         '/calendar?event=' || e.id::text AS destino,
         e.id::text AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.convocatorias_abertas AND a.gere
     AND e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time BETWEEN now() AND now() + interval '5 days'
     AND NOT EXISTS (SELECT 1 FROM callups c WHERE c.event_id = e.id)
),

-- 5. Jogo passado sem ficha (gestão)
fichas AS (
  SELECT a.profile_id,
         'ficha'::text AS tipo,
         'Ficha de jogo por preencher'::text AS titulo,
         'O jogo de ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' ainda não tem resultado.' AS corpo,
         '/competicao?ver=fichas&jogo=' || e.id::text AS destino,
         e.id::text AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.fichas AND a.gere
     AND e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time < now() - interval '12 hours'
     AND e.date_time > now() - interval '30 days'
     AND e.home_score IS NULL
),

-- 6. Votos de MVP pendentes: APENAS para jogadores convocados e TREINADORES (direção pura não vota)
votos_mvp_pendentes AS (
  SELECT a.profile_id,
         'voto_mvp'::text AS tipo,
         'Votação de MVP em aberto'::text AS titulo,
         'A ficha de jogo já saiu. Vota nos 2 melhores atletas da partida!'::text AS corpo,
         '/?mvp_event=' || e.id::text AS destino,
         e.id::text AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.home_score IS NOT NULL
     AND e.away_score IS NOT NULL
     AND e.date_time BETWEEN now() - interval '7 days' AND now()
     -- APENAS treinadores ou atletas convocados (não recusados) ou que jogaram
     AND (
       a.treinador
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
),

todos AS (
  SELECT * FROM convocatorias
   UNION ALL
  SELECT * FROM comunicados
   UNION ALL
  SELECT * FROM quotas
   UNION ALL
  SELECT * FROM abertas
   UNION ALL
  SELECT * FROM fichas
   UNION ALL
  SELECT * FROM votos_mvp_pendentes
)
SELECT t.profile_id,
       t.tipo,
       t.titulo,
       t.corpo,
       t.destino,
       t.origem_id
  FROM todos t
 WHERE NOT EXISTS (
   SELECT 1 FROM avisos_enviados env
    WHERE env.profile_id = t.profile_id
      AND env.tipo = t.tipo
      AND env.origem_id = t.origem_id
 );
$$;

REVOKE ALL ON FUNCTION public.avisos_pendentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avisos_pendentes() TO service_role;
