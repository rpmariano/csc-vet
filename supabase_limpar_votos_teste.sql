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

-- 2. Limpa qualquer aviso push registado de teste para o tipo 'voto_mvp'
DELETE FROM public.avisos_enviados
WHERE profile_id IN (
    SELECT id FROM public.profiles WHERE email = 'rpmariano@gmail.com'
) AND tipo = 'voto_mvp';

-- 3. Resumo dos votos atuais na base de dados
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
