-- ============================================================================
-- RESTAURO DE PERFIL E ALERTAS DE PAGAMENTO: RUI MARIANO
-- ============================================================================
-- Rui Mariano acumula funções de Direção ('admin') e Atleta ativo ('player', #17).
-- O script de limpeza anterior removeu indevidamente o papel de 'player',
-- fazendo com que as quotas e os alertas de pagamento deixassem de ser calculados.
--
-- Este script repõe 'player' no array de papéis (roles), restabelecendo:
-- 1. As quotas devidas na vista public.v_quota_status
-- 2. Os alertas de pagamentos em atraso na app e cabeçalho (€)
-- 3. Os avisos push automáticos de quotas em atraso
-- ============================================================================

UPDATE public.profiles
SET role = 'player'::public.user_role,
    roles = ARRAY['admin', 'player']::public.user_role[],
    quota_start_date = NULL,
    quota_end_date = NULL
WHERE email = 'rpmariano@gmail.com';

-- 1. Verificação do perfil atualizado
SELECT id, name, email, role, roles, jersey_number, status
FROM public.profiles
WHERE email = 'rpmariano@gmail.com';

-- 2. Verificação dos meses de quota gerados e em atraso
SELECT player_label, month_year, expected_amount, due_date, status, payment_status, owed_amount
FROM public.v_quota_status
WHERE player_id IN (
    SELECT id FROM public.profiles WHERE email = 'rpmariano@gmail.com'
)
ORDER BY month_year;
