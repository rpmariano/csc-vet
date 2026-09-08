-- Avisos por notificação push: subscrições e fila
-- ===============================================
--
-- O ecrã 12b guardava preferências que ninguém lia — "os avisos ainda não
-- estão a ser enviados". Isto é o lado do servidor.
--
-- Três peças:
--
-- 1. `push_subscriptions` — a caixa de correio de cada dispositivo. Uma pessoa
--    tem tantas linhas quantos os telemóveis e browsers onde instalou a app.
--    O `endpoint` é único: o browser devolve sempre o mesmo para a mesma
--    instalação, e sem isso cada arranque criava uma linha nova e a pessoa
--    recebia o mesmo aviso cinco vezes.
--
-- 2. `avisos_pendentes()` — a fila. Diz **o que falta enviar a quem**, já
--    cruzada com as preferências de cada um, com o silêncio da noite e com o
--    que já foi enviado. É aqui que as regras vivem, e não na função de envio:
--    são regras sobre os dados, e em SQL testam-se com uma consulta.
--
-- 3. `registar_envio()` — marca o que saiu, para não voltar a sair.
--
-- **Ninguém pode chamar as duas últimas a não ser o `service_role`.** São o
-- motor de envio, e devolvem o que toda a gente tem por ler; ver a lição do
-- ponto 2 dos riscos no CLAUDE.md sobre os *default privileges* deste schema.

-- ---------------------------------------------------------------- 1. caixas
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_profile_idx
  ON public.push_subscriptions (profile_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada um gere as suas subscrições" ON public.push_subscriptions;
CREATE POLICY "Cada um gere as suas subscrições" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = profile_id)
  WITH CHECK ((SELECT auth.uid()) = profile_id);

REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- ------------------------------------------------------------------ 2. fila
--
-- Uma linha por aviso a enviar. `origem_id` é o que identifica o assunto — a
-- convocatória, o comunicado, o evento — e é por ele que se sabe que já foi
-- enviado. As quotas não têm linha própria (em `dues` só há as pagas), por
-- isso o identificador é derivado do jogador e do mês.
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
         (ARRAY['coach','admin']::user_role[] && COALESCE(p.roles, ARRAY[p.role]))            AS gere
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
         CASE WHEN e.type = 'match' THEN 'Foste convocado para um jogo'
              WHEN e.type = 'gathering' THEN 'Foste convocado para um convívio'
              ELSE 'Foste convocado para um treino' END AS titulo,
         to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'DD/MM')
           || ' às ' || to_char(e.date_time AT TIME ZONE 'Europe/Lisbon', 'HH24:MI')
           || ' — diz se podes ir.' AS corpo,
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

-- Quota vencida e por pagar. Sem linha própria na base: o identificador sai
-- do jogador e do mês, para o aviso de Setembro não calar o de Outubro.
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
   WHERE a.quotas AND a.joga AND v.status = 'late'
),

-- Evento por convocar — de quem gere.
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

-- Jogo passado sem ficha lançada — de quem gere.
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

tudo AS (
  SELECT * FROM convocatorias
  UNION ALL SELECT * FROM comunicados
  UNION ALL SELECT * FROM quotas
  UNION ALL SELECT * FROM sem_convocatoria
  UNION ALL SELECT * FROM fichas
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

-- --------------------------------------------------------------- 3. registo
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
  VALUES (p_profile_id, p_tipo, p_titulo, p_corpo, p_destino, p_origem_id, now());
$$;

-- O motor de envio é o único que lhes toca.
REVOKE ALL ON FUNCTION public.avisos_pendentes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registar_envio(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avisos_pendentes() TO service_role;
GRANT EXECUTE ON FUNCTION public.registar_envio(uuid, text, text, text, text, uuid) TO service_role;
