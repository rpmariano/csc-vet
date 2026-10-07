-- ============================================================================
-- MIGRATION: Público-alvo nos comunicados (Todos incluindo adeptos / Sem adeptos)
-- ============================================================================

-- 1. Adicionar coluna target_audience à tabela announcements
ALTER TABLE public.announcements 
ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'all';

COMMENT ON COLUMN public.announcements.target_audience IS 
'Público-alvo do comunicado: "all" (todos incluindo adeptos) ou "no_supporters" (apenas atletas, equipa técnica e direção)';

-- 2. Atualizar avisos_pendentes() para não notificar adeptos de comunicados restritos
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

-- Comunicado publicado e ainda por ler (respeita público-alvo para adeptos).
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
     -- Se for adepto, apenas vê comunicados que incluam adeptos
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
      -- Meses desde que entrou no clube (ou da época atual se entrou antes) até ao mês corrente
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
     -- Só notifica uma vez por mês
     AND NOT EXISTS (
       SELECT 1 FROM push_logs pl
        WHERE pl.profile_id = a.profile_id
          AND pl.tipo = 'quota_atrasada'
          AND pl.enviado_em >= date_trunc('month', now())
     )
   LIMIT 1
),

-- Evento sem convocatória (só para quem gere).
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

-- Ficha de jogo por preencher (só para quem gere).
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
