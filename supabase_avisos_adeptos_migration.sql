-- ============================================================================
-- MIGRATION: Avisos push para adeptos ("Vem apoiar-nos em mais um jogo!")
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
  -- O silêncio da noite é hora local, e a base corre em UTC. Uma janela que
  -- atravessa a meia-noite (23:00–08:00) testa-se ao contrário.
  SELECT * FROM prefs
   WHERE CASE
           WHEN silencio_inicio = silencio_fim THEN true
           WHEN silencio_inicio < silencio_fim
             THEN (now() AT TIME ZONE 'Europe/Lisbon')::time NOT BETWEEN silencio_inicio AND silencio_fim
           ELSE (now() AT TIME ZONE 'Europe/Lisbon')::time < silencio_inicio
            AND (now() AT TIME ZONE 'Europe/Lisbon')::time >= silencio_fim
         END
),

-- Fui convocado e ainda não respondi.
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
     -- Um treino só pede resposta a seis dias, como na app.
     AND (e.type <> 'practice' OR e.date_time <= now() + interval '6 days')
),

-- Comunicado publicado e ainda por ler.
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
     AND NOT EXISTS (
       SELECT 1 FROM announcement_reads r
        WHERE r.announcement_id = an.id AND r.player_id = a.profile_id
     )
),

-- Quota vencida e por pagar.
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
      SELECT generate_series(
               date_trunc('month', COALESCE(p.quota_start_date, p.created_at::date)),
               date_trunc('month', CURRENT_DATE),
               interval '1 month'
             )::date AS mes
    ) q
   WHERE a.quotas
     AND a.joga
     AND p.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM payments pay
        WHERE pay.player_id = a.profile_id
          AND pay.month = to_char(q.mes, 'YYYY-MM')
          AND pay.status = 'completed'
     )
),

-- Eventos sem convocatória a aproximarem-se (para equipa técnica / admin).
sem_convocatoria AS (
  SELECT a.profile_id,
         'sem_convocatoria'::text AS tipo,
         'Evento sem convocatória'::text AS titulo,
         CASE WHEN e.type = 'match' THEN 'Jogo de ' ELSE 'Treino de ' END
           || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' ainda não tem atletas convocados.' AS corpo,
         '/events'::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.sem_convocatoria
     AND a.gere
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time > now()
     AND e.date_time <= now() + interval '3 days'
     AND NOT EXISTS (
       SELECT 1 FROM callups c WHERE c.event_id = e.id
     )
),

-- Fichas de jogo por preencher (para equipa técnica / admin).
fichas AS (
  SELECT a.profile_id,
         'ficha_por_preencher'::text AS tipo,
         'Ficha de jogo por preencher'::text AS titulo,
         'O jogo de ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' já terminou. Lança o resultado e a ficha.' AS corpo,
         '/events'::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.fichas
     AND a.gere
     AND e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time < now() - interval '2 hours'
     AND e.date_time >= now() - interval '7 days'
     AND (e.home_score IS NULL OR e.away_score IS NULL)
)

SELECT * FROM convocatorias
UNION ALL
SELECT * FROM comunicados
UNION ALL
SELECT * FROM quotas
UNION ALL
SELECT * FROM sem_convocatoria
UNION ALL
SELECT * FROM fichas;
$$;

REVOKE ALL ON FUNCTION public.avisos_pendentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avisos_pendentes() TO service_role;
