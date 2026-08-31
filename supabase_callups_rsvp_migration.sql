-- Migração: permite ao jogador registar a sua própria resposta a convocatórias "virtuais".
--
-- Contexto: para treinos, a app convoca automaticamente todos os atletas aptos sem criar
-- uma linha em `callups` — é um convocado apenas no cliente (id "auto-..."). Quando esse
-- jogador toca em "Sim"/"Não", o cliente faz um upsert nessa linha inexistente, ou seja,
-- um INSERT. Só existia política de UPDATE para o próprio jogador; o INSERT era permitido
-- apenas a coach/admin, pelo que a escrita falhava silenciosamente (RLS rejeita sem lançar
-- exceção) e a resposta nunca era guardada — na próxima carga o jogador reaparecia como se
-- nunca tivesse respondido, "fora" da convocatória real na base de dados.
--
-- Aplicar esta migração numa base já existente. Já está refletida em supabase_schema.sql
-- para instalações novas.

DROP POLICY IF EXISTS "Jogadores registam a sua própria resposta de convocatória" ON public.callups;

CREATE POLICY "Jogadores registam a sua própria resposta de convocatória"
ON public.callups FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = player_id AND status IN ('confirmed', 'declined'));
