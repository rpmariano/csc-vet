-- A jornada do nosso jogo, e a ligação entre a ficha de jogo e a tabela.
--
-- Até aqui um jogo do clube não entrava na classificação: a `StandingsPage`
-- ia buscar os nossos jogos a `events` com `status = 'finished'` e
-- `home_away = 'casa'`, e nenhum desses valores existe neste esquema
-- (`event_status` é 'agendado'/'concluído'/'adiado'/'cancelado' e
-- `match_location_type` é 'home'/'away'/'neutral'). O resultado era uma
-- condição que nunca dava verdade — quem quisesse o nosso jogo na tabela
-- tinha de o escrever outra vez à mão como jornada.
--
-- Passa a haver uma linha só: ao escolher o torneio no evento escolhe-se
-- também a jornada, e o jogo é espelhado em `tournament_matches` com o
-- `event_id` a dizer de onde veio. A ficha de jogo lança o resultado nos dois
-- sítios ao mesmo tempo.
--
-- Aplicada a 2026-09-09.

-- 1. A jornada em que o jogo conta. Fica nula nos amigáveis e nos treinos —
--    e nos jogos de torneio criados antes desta migração, que continuam a
--    valer como evento e podem ser ligados editando-os.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS matchday INTEGER
  CHECK (matchday IS NULL OR matchday > 0);

COMMENT ON COLUMN public.events.matchday IS
  'Jornada do torneio em que este jogo conta. Obrigatória na app quando o jogo tem torneio.';

-- 2. De que evento veio a linha da jornada. `ON DELETE CASCADE` porque a
--    linha é o espelho do jogo: apagado o jogo, a jornada não fica com um
--    resultado órfão.
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.tournament_matches.event_id IS
  'Evento que gerou esta linha, quando é um jogo nosso. NULL nos jogos entre as outras equipas da série, lançados à mão.';

-- Um evento espelha-se numa linha e numa só.
CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_event_id_key
  ON public.tournament_matches (event_id)
  WHERE event_id IS NOT NULL;

-- A RLS não muda: `tournament_matches` já é escrita só por coach/admin, que é
-- quem cria eventos e lança fichas de jogo.
