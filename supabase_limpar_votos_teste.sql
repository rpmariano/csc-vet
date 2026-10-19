-- ============================================================================
-- SCRIPT DE LIMPEZA: ELIMINAR VOTOS DE TESTE DE RUI MARIANO
-- ============================================================================
-- Executa este script no SQL Editor do Supabase para apagar em definitivo
-- os votos de teste registados por Rui Mariano (rpmariano@gmail.com).
-- ============================================================================

-- 1. Elimina os votos inseridos por Rui Mariano
DELETE FROM public.mvp_votes
WHERE voter_id IN (
    SELECT id FROM public.profiles WHERE email = 'rpmariano@gmail.com'
);

-- 2. Assegura que nenhum aviso push de voto_mvp volta a ser enfileirado para Rui Mariano
-- ao marcar todos os jogos como já enviados em avisos_enviados:
INSERT INTO public.avisos_enviados (profile_id, tipo, origem_id, enviado_em)
SELECT p.id, 'voto_mvp', e.id::text, now()
FROM public.profiles p
CROSS JOIN public.events e
WHERE p.email = 'rpmariano@gmail.com'
  AND e.type = 'match'
ON CONFLICT (profile_id, tipo, origem_id) DO NOTHING;

-- 3. Repõe a coluna is_mvp a falso na tabela stats para não expor vencedores
UPDATE public.stats
SET is_mvp = FALSE
WHERE is_mvp = TRUE;

-- 4. Repõe o perfil de Rui Mariano como Direção e Jogador ('admin' + 'player'):
UPDATE public.profiles
SET role = 'player'::public.user_role,
    roles = ARRAY['admin', 'player']::public.user_role[]
WHERE email = 'rpmariano@gmail.com';

-- 4. Resumo dos votos atuais na base de dados
SELECT 
    v.id,
    v.event_id,
    p.name as votante,
    p1.name as melhor_3pts,
    p2.name as segundo_1pt,
    v.created_at
FROM public.mvp_votes v
JOIN public.profiles p ON p.id = v.voter_id
LEFT JOIN public.profiles p1 ON p1.id = v.player1_id
LEFT JOIN public.profiles p2 ON p2.id = v.player2_id
ORDER BY v.created_at DESC;
