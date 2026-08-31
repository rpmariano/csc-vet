-- Diagnóstico (só leitura): agrupa eventos que parecem a mesma marcação
-- (mesmo tipo, data/hora, campo e adversário) e mostra o que cada cópia já tem
-- associado, para decidires qual manter antes de apagar as outras.
SELECT
  e.id,
  e.title,
  e.type,
  e.date_time,
  e.field_id,
  e.opponent_id,
  e.is_active,
  e.home_score,
  e.away_score,
  e.created_at,
  (SELECT count(*) FROM public.callups     c WHERE c.event_id = e.id) AS callups_count,
  (SELECT count(*) FROM public.attendances a WHERE a.event_id = e.id) AS attendances_count,
  (SELECT count(*) FROM public.stats       s WHERE s.event_id = e.id) AS stats_count,
  count(*) OVER (PARTITION BY e.type, e.date_time, e.field_id, e.opponent_id) AS duplicate_group_size
FROM public.events e
WHERE e.id IN (
  SELECT id FROM (
    SELECT id,
           count(*) OVER (PARTITION BY type, date_time, field_id, opponent_id) AS grp_size
    FROM public.events
  ) sub
  WHERE grp_size > 1
)
ORDER BY e.type, e.date_time, e.field_id, e.opponent_id, e.created_at;
