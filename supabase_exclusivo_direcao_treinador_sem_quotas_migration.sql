-- ============================================================================
-- MIGRAÇÃO: Perfis Exclusivos de Direção ou Treinador Não Devem Quotas
-- ============================================================================
--
-- REGRA DE NEGÓCIO:
-- Quem tem exclusivamente perfil de direção (admin) ou treinador (coach)
-- (sem acumular papel de jogador 'player') não entra para as contas de quotas,
-- logo nunca deve quotas nem tem meses de quota gerados.
--
-- 1. Atualiza a vista public.v_quota_status para garantir que apenas membros com
--    papel efetivo de jogador ('player' em roles, ou role='player' caso roles seja vazio)
--    e que não sejam adeptos entram como atletas elegíveis para quotas.
-- 2. Atualiza public.avisos_pendentes() com a mesma lógica estrita para push de quotas.
-- 3. Limpa datas de atividade de quotas (quota_start_date, quota_end_date) e dispensas
--    residuais em quota_exemptions para membros que não tenham papel de jogador.
-- ============================================================================

-- 1. Atualizar v_quota_status
CREATE OR REPLACE VIEW public.v_quota_status
WITH (security_invoker = true) AS
WITH s AS (
  SELECT *
    FROM public.financial_settings
   WHERE id = 1
), season AS (
  SELECT public.financial_season(CURRENT_DATE) AS label,
         make_date(
           CASE
             WHEN s.season_start_month <= s.season_end_month THEN EXTRACT(year FROM CURRENT_DATE)::integer
             WHEN EXTRACT(month FROM CURRENT_DATE)::integer >= s.season_start_month THEN EXTRACT(year FROM CURRENT_DATE)::integer
             ELSE EXTRACT(year FROM CURRENT_DATE)::integer - 1
           END, s.season_start_month, 1) AS first_month,
         CASE
           WHEN s.season_end_month >= s.season_start_month THEN s.season_end_month - s.season_start_month + 1
           ELSE 12 - s.season_start_month + s.season_end_month + 1
         END AS n_months
    FROM s
), months AS (
  SELECT (season.first_month + ((i.i || ' month')::interval))::date AS month_start
    FROM season, generate_series(0, 11) i(i)
   WHERE i.i < season.n_months
), quota_months AS (
  SELECT m.month_start
    FROM months m, s
   WHERE NOT (EXTRACT(month FROM m.month_start)::integer = ANY (s.quota_excluded_months))
), eligible AS (
  SELECT p.id AS player_id,
         COALESCE(p.shirt_name, p.name) AS player_label,
         p.jersey_number,
         p.status,
         p.quota_start_date,
         COALESCE(p.quota_end_date,
           CASE WHEN p.status = 'inactive' THEN CURRENT_DATE ELSE NULL::date END) AS quota_end_date
    FROM public.profiles p
   WHERE (
     -- Deve ter papel de jogador (quando roles está definido e não vazio, manda roles; senão role)
     (
       CASE
         WHEN p.roles IS NOT NULL AND array_length(p.roles, 1) > 0 THEN
           'player'::user_role = ANY (p.roles)
         ELSE
           p.role = 'player'::user_role
       END
     )
     -- Nunca ser adepto
     AND p.role <> 'supporter'::user_role
     AND NOT ('supporter'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
   )
)
SELECT e.player_id,
       e.player_label,
       e.jersey_number,
       e.status AS player_status,
       (SELECT season.label FROM season) AS season,
       to_char(qm.month_start::timestamp with time zone, 'YYYY-MM') AS month_year,
       qm.month_start,
       s.quota_amount AS expected_amount,
       d.id AS due_id,
       d.amount AS paid_amount,
       d.paid_at,
       (qm.month_start + (((s.quota_due_day - 1) || ' day')::interval))::date AS due_date,
       CASE
         WHEN d.id IS NOT NULL THEN 'paid'
         WHEN CURRENT_DATE > (qm.month_start + (((s.quota_due_day - 1) || ' day')::interval))::date THEN 'late'
         ELSE 'pending'
       END AS status,
       CASE WHEN d.id IS NOT NULL THEN 'paid' ELSE 'unpaid' END AS payment_status,
       CASE WHEN d.id IS NULL THEN s.quota_amount ELSE 0::numeric END AS owed_amount
  FROM eligible e
  CROSS JOIN quota_months qm
  CROSS JOIN s
  LEFT JOIN public.dues d
         ON d.player_id = e.player_id
        AND d.month_year = to_char(qm.month_start::timestamp with time zone, 'YYYY-MM')
 WHERE (e.quota_start_date IS NULL OR (qm.month_start + '1 mon -1 days'::interval)::date >= e.quota_start_date)
   AND (e.quota_end_date IS NULL OR qm.month_start <= e.quota_end_date)
   AND NOT EXISTS (
         SELECT 1
           FROM public.quota_exemptions qe
          WHERE qe.profile_id = e.player_id
            AND right(qe.month_year, 2) = to_char(qm.month_start, 'MM')
            AND (left(qe.month_year, 4) = '0000'
                 OR left(qe.month_year, 4) = to_char(qm.month_start, 'YYYY'))
       );

REVOKE ALL ON public.v_quota_status FROM PUBLIC, anon;
GRANT SELECT ON public.v_quota_status TO authenticated;

-- 2. Atualizar avisos_pendentes()
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
         (
           p.role = 'supporter'::user_role
           OR ('supporter'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
         )                                                                                    AS adepto,
         (
           p.role <> 'supporter'::user_role
           AND NOT ('supporter'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
           AND (
             CASE
               WHEN p.roles IS NOT NULL AND array_length(p.roles, 1) > 0 THEN
                 'player'::user_role = ANY (p.roles)
               ELSE
                 p.role = 'player'::user_role
             END
           )
         )                                                                                    AS joga,
         (ARRAY['coach','admin']::user_role[] && COALESCE(p.roles, ARRAY[p.role]))            AS gere
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

-- Convocatórias
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
     -- Adeptos só recebem avisos de jogos e convívios (nunca de treinos)
     AND (NOT a.adepto OR e.type IN ('match', 'gathering'))
),

-- Comunicados (respeita público-alvo)
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

-- Quotas vencidas (APENAS atletas que jogam, NUNCA adeptos nem membros exclusivamente treinador/direção)
quotas AS (
  SELECT a.profile_id,
         'quota'::text AS tipo,
         'Quota em atraso'::text AS titulo,
         initcap(to_char(v.month_start, 'TMMonth')) || ' ' || to_char(v.month_start, 'YYYY')
           || ' — ' || trim(to_char(v.expected_amount, '999D99')) || ' €' AS corpo,
         '/settings'::text AS destino,
         md5(a.profile_id::text || v.month_year)::uuid AS origem_id
    FROM acordados a
    JOIN v_quota_status v ON v.player_id = a.profile_id
   WHERE a.quotas
     AND a.joga
     AND NOT a.adepto
     AND v.status = 'late'
),

-- Evento por convocar (gestão)
sem_convocatoria AS (
  SELECT a.profile_id,
         'sem-convocatoria'::text AS tipo,
         'Evento sem convocatória'::text AS titulo,
         COALESCE(e.title, 'Evento') || ' a ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' — ninguém foi convocado.' AS corpo,
         '/events?convocatoria=' || e.id::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.sem_convocatoria AND a.gere
     AND e.type IN ('match', 'gathering')
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time > now()
     AND NOT EXISTS (SELECT 1 FROM callups c WHERE c.event_id = e.id)
),

-- Ficha de jogo por preencher (gestão)
fichas_pendentes AS (
  SELECT a.profile_id,
         'ficha-pendente'::text AS tipo,
         'Ficha de jogo por preencher'::text AS titulo,
         COALESCE(e.title, 'Jogo') || ' de ontem — falta lançar o resultado.' AS corpo,
         '/events?ficha=' || e.id::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.fichas AND a.gere
     AND e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND (e.date_time AT TIME ZONE 'Europe/Lisbon')::date = (CURRENT_DATE - 1)
     AND NOT EXISTS (
       SELECT 1 FROM tournament_matches tm
        WHERE tm.tournament_id = e.tournament_id
          AND tm.matchday = e.matchday
          AND tm.home_score IS NOT NULL
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
SELECT * FROM fichas_pendentes;
$$;

-- 3. Limpeza de dados residuais para membros sem papel de jogador
UPDATE public.profiles
   SET quota_start_date = NULL,
       quota_end_date = NULL
 WHERE (
   (roles IS NOT NULL AND array_length(roles, 1) > 0 AND NOT ('player'::user_role = ANY (roles)))
   OR ((roles IS NULL OR array_length(roles, 1) = 0) AND role <> 'player'::user_role)
 )
 AND (quota_start_date IS NOT NULL OR quota_end_date IS NOT NULL);

DELETE FROM public.quota_exemptions qe
 WHERE EXISTS (
   SELECT 1 FROM public.profiles p
    WHERE p.id = qe.profile_id
      AND (
        (p.roles IS NOT NULL AND array_length(p.roles, 1) > 0 AND NOT ('player'::user_role = ANY (p.roles)))
        OR ((p.roles IS NULL OR array_length(p.roles, 1) = 0) AND p.role <> 'player'::user_role)
      )
 );
