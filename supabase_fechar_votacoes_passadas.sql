-- ============================================================================
-- MIGRAÇÃO DEFINITIVA: CORRIGIR NOTIFICAÇÕES MVP, ENCERRAR JOGOS PASSADOS,
-- ELIMINAR NOTIFICAÇÕES DE FALTA DE CONVOCATÓRIA E CORRIGIR PERFIS
-- ============================================================================
-- 1. Garante a coluna mvp_voting_closed em public.events
-- 2. Fecha a votação de MVP de todos os jogos amigáveis passados
-- 3. Fecha a votação de MVP do jogo da 1ª jornada (11/10/2026 vs Estrelas Lisboa)
-- 4. Corrige o perfil de Rui Mariano e membros de Direção (remove coach/player dos roles)
-- 5. Atualiza a constraint de tipo em notification_deliveries para suportar 'voto_mvp'
-- 6. Marca na base de dados (notification_deliveries) os avisos de MVP dos jogos passados
--    como já entregues para que nunca mais voltem a ser enviados
-- 7. Elimina as notificações push de falta de convocatória da fila avisos_pendentes()
--    (o alerta visual permanece intacto na homepage da app)
-- 8. Atualiza avisos_pendentes() com tipagem compatível (origem_id uuid) e
--    exclusão estrita de Direção (admin) e jogos passados/encerrados.
-- ============================================================================

-- 1. Coluna mvp_voting_closed
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS mvp_voting_closed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.events.mvp_voting_closed IS 'Indica se a votação de MVP para este jogo foi encerrada.';

-- 2. Encerrar votações dos amigáveis passados
UPDATE public.events
SET mvp_voting_closed = TRUE
WHERE is_friendly = TRUE 
  AND date_time < now();

-- 3. Encerrar votação do jogo da 1ª jornada (11/10/2026 vs Estrelas Lisboa) e anteriores
UPDATE public.events
SET mvp_voting_closed = TRUE
WHERE type = 'match'
  AND (
    matchday = 1 
    OR date_time <= '2026-10-12 23:59:59+01'::timestamptz
  );

-- 4. Corrigir perfis de Direção (garante que Rui Mariano é apenas admin, não treinador nem jogador)
UPDATE public.profiles
SET roles = ARRAY['admin']::public.user_role[],
    role = 'admin'
WHERE email = 'rpmariano@gmail.com';

UPDATE public.profiles
SET roles = ARRAY['admin']::public.user_role[]
WHERE role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.callups c WHERE c.player_id = profiles.id)
  AND NOT EXISTS (SELECT 1 FROM public.stats s WHERE s.player_id = profiles.id);

-- 5. Atualizar constraint de tipo em notification_deliveries
ALTER TABLE public.notification_deliveries 
DROP CONSTRAINT IF EXISTS notification_deliveries_tipo_check;

ALTER TABLE public.notification_deliveries 
ADD CONSTRAINT notification_deliveries_tipo_check 
CHECK (tipo IN (
  'convocatoria',
  'comunicado',
  'quota_em_atraso',
  'quota',
  'evento_sem_convocatoria',
  'sem-convocatoria',
  'ficha_por_preencher',
  'ficha',
  'convocatoria_aberta',
  'voto_mvp'
));

-- 6. Registar envio prévio de voto_mvp para todos os jogos encerrados/amigáveis/1ª jornada
-- para garantir que a fila SQL nunca mais os seleciona para nenhum utilizador
INSERT INTO public.notification_deliveries (profile_id, tipo, titulo, corpo, destino, origem_id, enviada_em)
SELECT p.id,
       'voto_mvp',
       'Votação de MVP encerrada',
       'A votação para este jogo já se encontra encerrada.',
       '/',
       e.id,
       now()
  FROM public.profiles p
 CROSS JOIN public.events e
 WHERE e.type = 'match'
   AND (
     e.mvp_voting_closed = TRUE
     OR e.is_friendly = TRUE
     OR e.date_time <= '2026-10-12 23:59:59+01'::timestamptz
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.notification_deliveries nd
      WHERE nd.profile_id = p.id
        AND nd.tipo = 'voto_mvp'
        AND nd.origem_id = e.id
   );

-- 7. Função registar_envio() atualizada
CREATE OR REPLACE FUNCTION public.registar_envio(
  p_profile_id uuid,
  p_tipo       text,
  p_titulo     text,
  p_corpo      text,
  p_destino    text,
  p_origem_id  uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO notification_deliveries (profile_id, tipo, titulo, corpo, destino, origem_id, enviada_em)
  VALUES (p_profile_id, p_tipo, p_titulo, p_corpo, p_destino, p_origem_id, now())
  ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.registar_envio(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registar_envio(uuid, text, text, text, text, uuid) TO service_role;

-- 8. Função avisos_pendentes() definitiva (sem avisos push de falta de convocatória)
DROP FUNCTION IF EXISTS public.avisos_pendentes();

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
           AND ('player'::user_role = ANY (COALESCE(p.roles, ARRAY[p.role])))
         )                                                                                    AS joga,
         (ARRAY['coach','admin']::user_role[] && COALESCE(p.roles, ARRAY[p.role]))            AS gere,
         (
           -- Treinador elegível para votar MVP:
           -- Apenas treinadores puros. Membros de Direção (admin) NUNCA votam como treinador!
           (
             p.role = 'coach'::user_role 
             OR ('coach'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
           )
           AND NOT (
             p.role = 'admin'::user_role 
             OR ('admin'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
           )
           AND p.email <> 'rpmariano@gmail.com'
         )                                                                                    AS treinador
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
         c.id AS origem_id
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

-- 3. Quotas
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

-- 4. Fichas por preencher
fichas AS (
  SELECT a.profile_id,
         'ficha'::text AS tipo,
         'Ficha de jogo por preencher'::text AS titulo,
         'O jogo de ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' ainda não tem resultado.' AS corpo,
         '/competicao?ver=fichas&jogo=' || e.id::text AS destino,
         e.id AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.fichas AND a.gere
     AND e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time < now() - interval '12 hours'
     AND e.date_time > now() - interval '30 days'
     AND e.home_score IS NULL
),

-- 5. Votos de MVP pendentes:
-- APENAS para jogos futuros com votação aberta (NUNCA amigáveis, NUNCA 1ª jornada ou jogos passados já fechados)
-- e APENAS para treinadores puros ou atletas convocados (não recusados) ou que jogaram.
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
     -- Regras de exclusão estritas de jogos passados/fechados:
     AND COALESCE(e.mvp_voting_closed, false) = false
     AND COALESCE(e.is_friendly, false) = false
     AND e.date_time > '2026-10-12 23:59:59+01'::timestamptz
     -- APENAS treinadores puros ou atletas convocados (não recusados) ou que jogaram
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

tudo AS (
  SELECT * FROM convocatorias
  UNION ALL SELECT * FROM comunicados
  UNION ALL SELECT * FROM quotas
  UNION ALL SELECT * FROM fichas
  UNION ALL SELECT * FROM votos_mvp_pendentes
)
SELECT t.profile_id, t.tipo, t.titulo, t.corpo, t.destino, t.origem_id
  FROM tudo t
 WHERE NOT EXISTS (
   SELECT 1 FROM notification_deliveries d
    WHERE d.profile_id = t.profile_id
      AND d.tipo = t.tipo
      AND d.origem_id IS NOT DISTINCT FROM t.origem_id
 );
$$;

REVOKE ALL ON FUNCTION public.avisos_pendentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avisos_pendentes() TO service_role;
