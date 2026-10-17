-- ============================================================================
-- MIGRAÇÃO: ENCERRAR VOTAÇÃO MVP DOS JOGOS AMIGÁVEIS E DA 1ª JORNADA
-- ============================================================================
-- 1. Garante a coluna mvp_voting_closed na tabela public.events
-- 2. Marca mvp_voting_closed = true para:
--    - Jogos amigáveis passados (is_friendly = true)
--    - Jogo da 1ª jornada (11/10/2026 vs Estrelas Lisboa)
-- 3. Atualiza a função avisos_pendentes() para não gerar notificações para
--    jogos com votação fechada.
-- 4. Fornece o template/instruções para carregamento dos votos da 1ª jornada
--    diretamente na base de dados quando o utilizador pretender.
-- ============================================================================

-- 1. Adicionar coluna mvp_voting_closed à tabela events (se ainda não existir)
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS mvp_voting_closed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.events.mvp_voting_closed IS 'Indica se a votação de MVP para este jogo foi encerrada.';

-- 2. Encerrar votações dos amigáveis passados
UPDATE public.events
SET mvp_voting_closed = TRUE
WHERE is_friendly = TRUE 
  AND date_time < now();

-- 3. Encerrar votação do jogo da 1ª jornada (11/10/2026 vs Estrelas Lisboa)
UPDATE public.events
SET mvp_voting_closed = TRUE
WHERE type = 'match'
  AND (
    matchday = 1 
    OR date_time <= '2026-10-12 23:59:59+01'::timestamptz
  );

-- 4. Atualizar avisos_pendentes() para filtrar jogos com votação de MVP encerrada
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
                   ELSE ' — clica para ver os detalhes e dar feedback.' END AS corpo,
         '/agenda'::text AS destino,
         e.id::text AS origem_id
    FROM acordados a
    JOIN callups c ON c.player_id = a.profile_id
    JOIN events e ON e.id = c.event_id
   WHERE a.convocatorias
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time > now()
     AND c.status = 'called'
),

-- 2. Comunicados
comunicados AS (
  SELECT a.profile_id,
         'comunicado'::text AS tipo,
         anc.title AS titulo,
         COALESCE(
           NULLIF(trim(anc.summary), ''),
           CASE WHEN length(anc.body) > 120 THEN left(anc.body, 117) || '...' ELSE anc.body END
         ) AS corpo,
         '/comunicados'::text AS destino,
         anc.id::text AS origem_id
    FROM acordados a
    CROSS JOIN announcements anc
   WHERE a.comunicados
     AND anc.published_at IS NOT NULL
     AND anc.published_at > now() - interval '24 hours'
     AND NOT EXISTS (
       SELECT 1 FROM announcement_reads r
        WHERE r.announcement_id = anc.id AND r.profile_id = a.profile_id
     )
),

-- 3. Quotas em atraso
quotas AS (
  SELECT a.profile_id,
         'quota_atraso'::text AS tipo,
         'Quotas em atraso'::text AS titulo,
         'Tens quotas pendentes de pagamento. Regulariza a tua situação no separador de Quotas.'::text AS corpo,
         '/quotas'::text AS destino,
         a.profile_id::text || '_' || to_char(now() AT TIME ZONE 'Europe/Lisbon', 'YYYY_MM') AS origem_id
    FROM acordados a
   WHERE a.quotas
     AND NOT a.gere
     AND (
       SELECT count(*) FROM charges ch
        WHERE ch.player_id = a.profile_id
          AND ch.status = 'pending'
          AND ch.due_date < CURRENT_DATE
     ) > 0
),

-- 4. Convocatórias abertas (treinadores/admin)
abertas AS (
  SELECT a.profile_id,
         'convocatoria_aberta'::text AS tipo,
         'Convocatória ainda em aberto'::text AS titulo,
         'O jogo de ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' é daqui a menos de 48h e a convocatória ainda está aberta.' AS corpo,
         '/agenda'::text AS destino,
         e.id::text AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.gere
     AND a.convocatorias_abertas
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time BETWEEN now() AND now() + interval '48 hours'
     AND COALESCE(e.callup_closed, false) = false
),

-- 5. Fichas de jogo por preencher (treinadores/admin)
fichas AS (
  SELECT a.profile_id,
         'ficha_por_preencher'::text AS tipo,
         'Ficha de jogo por preencher'::text AS titulo,
         'O jogo de ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' já terminou há mais de 12 horas. Preenche o resultado e a ficha de jogo.' AS corpo,
         '/agenda'::text AS destino,
         e.id::text AS origem_id
    FROM acordados a
    CROSS JOIN events e
   WHERE a.gere
     AND a.fichas
     AND e.type = 'match'
     AND e.is_active IS DISTINCT FROM false
     AND e.date_time < now() - interval '12 hours'
     AND e.date_time > now() - interval '30 days'
     AND e.home_score IS NULL
),

-- 6. Votos de MVP pendentes: APENAS para jogadores convocados e TREINADORES em jogos com votação ABERTA
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
     -- A votação NÃO pode estar encerrada:
     AND COALESCE(e.mvp_voting_closed, false) = false
     AND COALESCE(e.is_friendly, false) = false
     AND e.date_time > '2026-10-12 23:59:59+01'::timestamptz
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


-- ============================================================================
-- TEMPLATE PARA CARREGAR OS VOTOS DA 1ª JORNADA VIA BD (QUANDO PRETENDIDO)
-- ============================================================================
-- Podes executar um INSERT como este no SQL Editor do Supabase para registar
-- os votos da 1ª jornada (11/10/2026 vs Estrelas Lisboa):
--
-- DO $$
-- DECLARE
--   v_event_id UUID;
-- BEGIN
--   -- Localizar o id do evento da 1ª jornada
--   SELECT id INTO v_event_id 
--   FROM public.events 
--   WHERE (matchday = 1 OR date_time::date = '2026-10-11') AND type = 'match'
--   LIMIT 1;
--
--   -- Exemplo de inserção de votos (voter_id, 1º lugar com 3 pts, 2º lugar com 1 pt):
--   -- INSERT INTO public.mvp_votes (event_id, voter_id, player1_id, player2_id)
--   -- VALUES
--   --   (v_event_id, '<uuid-do-votante-1>', '<uuid-1o-melhor>', '<uuid-2o-melhor>'),
--   --   (v_event_id, '<uuid-do-votante-2>', '<uuid-1o-melhor>', '<uuid-2o-melhor>');
--
-- END $$;
-- ============================================================================
