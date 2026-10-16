-- ============================================================================
-- MIGRAÇÃO: Correção de Quotas de Setembro (Marinho, PP e outros atletas)
-- ============================================================================
-- Motivo:
-- 1. Atletas criados, ativados ou fundidos em Outubro receberam automaticamente
--    quota_start_date em Outubro (pelo trigger ou pela conta nova).
-- 2. Na vista v_quota_status, a condição filtrava meses cuja data de fim era
--    anterior a quota_start_date (Set/26 termina a 30/09, pelo que ficava excluído).
-- 3. Além disso, mesmo quando o mês já estava pago em `dues`, a vista filtrava
--    a linha se a data de atividade estivesse desfasada.
-- ============================================================================

-- 1. Atualizar a vista v_quota_status
-- Garante que:
-- a) Qualquer mês que já tenha pagamento registado em `dues` (d.id IS NOT NULL) NUNCA é ocultado.
-- b) Apenas meses por pagar respeitam quota_start_date / quota_end_date / dispensas.
CREATE OR REPLACE VIEW public.v_quota_status
WITH (security_invoker = true) AS
WITH s AS (
  SELECT *
    FROM public.financial_settings
   WHERE id = 1
), season AS (
  SELECT public.financial_season(CURRENT_DATE) AS label,
         make_date(
           CASE
             WHEN s.season_start_month <= s.season_end_month THEN EXTRACT(year FROM CURRENT_DATE)::integer
             WHEN EXTRACT(month FROM CURRENT_DATE)::integer >= s.season_start_month THEN EXTRACT(year FROM CURRENT_DATE)::integer
             ELSE EXTRACT(year FROM CURRENT_DATE)::integer - 1
           END, s.season_start_month, 1) AS first_month,
         CASE
           WHEN s.season_end_month >= s.season_start_month THEN s.season_end_month - s.season_start_month + 1
           ELSE 12 - s.season_start_month + s.season_end_month + 1
         END AS n_months
    FROM s
), months AS (
  SELECT (season.first_month + ((i.i || ' month')::interval))::date AS month_start
    FROM season, generate_series(0, 11) i(i)
   WHERE i.i < season.n_months
), quota_months AS (
  SELECT m.month_start
    FROM months m, s
   WHERE NOT (EXTRACT(month FROM m.month_start)::integer = ANY (s.quota_excluded_months))
), eligible AS (
  SELECT p.id AS player_id,
         COALESCE(p.shirt_name, p.name) AS player_label,
         p.jersey_number,
         p.status,
         p.quota_start_date,
         COALESCE(p.quota_end_date,
           CASE WHEN p.status = 'inactive' THEN CURRENT_DATE ELSE NULL::date END) AS quota_end_date
    FROM public.profiles p
   WHERE (
     (
       (p.roles IS NOT NULL AND 'player'::user_role = ANY (p.roles))
       OR p.role = 'player'::user_role
     )
     AND p.role <> 'supporter'::user_role
     AND NOT ('supporter'::user_role = ANY (COALESCE(p.roles, ARRAY[]::user_role[])))
   )
)
SELECT e.player_id,
       e.player_label,
       e.jersey_number,
       e.status AS player_status,
       (SELECT season.label FROM season) AS season,
       to_char(qm.month_start::timestamp with time zone, 'YYYY-MM') AS month_year,
       qm.month_start,
       s.quota_amount AS expected_amount,
       d.id AS due_id,
       d.amount AS paid_amount,
       d.paid_at,
       (qm.month_start + (((s.quota_due_day - 1) || ' day')::interval))::date AS due_date,
       CASE
         WHEN d.id IS NOT NULL THEN 'paid'
         WHEN CURRENT_DATE > (qm.month_start + (((s.quota_due_day - 1) || ' day')::interval))::date THEN 'late'
         ELSE 'pending'
       END AS status,
       CASE WHEN d.id IS NOT NULL THEN 'paid' ELSE 'unpaid' END AS payment_status,
       CASE WHEN d.id IS NULL THEN s.quota_amount ELSE 0::numeric END AS owed_amount
  FROM eligible e
  CROSS JOIN quota_months qm
  CROSS JOIN s
  LEFT JOIN public.dues d
         ON d.player_id = e.player_id
        AND d.month_year = to_char(qm.month_start::timestamp with time zone, 'YYYY-MM')
 WHERE (
   -- Se o mês está pago em dues, tem SEMPRE de aparecer na lista de quotas
   d.id IS NOT NULL
   OR (
     (e.quota_start_date IS NULL OR (qm.month_start + '1 mon -1 days'::interval)::date >= e.quota_start_date)
     AND (e.quota_end_date IS NULL OR qm.month_start <= e.quota_end_date)
     AND NOT EXISTS (
           SELECT 1
             FROM public.quota_exemptions qe
            WHERE qe.profile_id = e.player_id
              AND right(qe.month_year, 2) = to_char(qm.month_start, 'MM')
              AND (left(qe.month_year, 4) = '0000'
                   OR left(qe.month_year, 4) = to_char(qm.month_start, 'YYYY'))
         )
   )
 );

REVOKE ALL ON public.v_quota_status FROM PUBLIC, anon;
GRANT SELECT ON public.v_quota_status TO authenticated;

-- 2. Corrigir quota_start_date de jogadores ativos que ficaram com Outubro/2026
-- Se o atleta é jogador ativo e tem quota_start_date em Outubro de 2026,
-- recuamos para 2026-09-01 para incluir Setembro na época atual.
UPDATE public.profiles
   SET quota_start_date = DATE '2026-09-01'
 WHERE (
   (roles IS NOT NULL AND 'player'::user_role = ANY (roles))
   OR role = 'player'::user_role
 )
 AND status <> 'inactive'
 AND quota_start_date > DATE '2026-09-30';

-- 3. Atualizar a função admin_merge_profiles para preservar a data de quota mais antiga
CREATE OR REPLACE FUNCTION public.admin_merge_profiles(id_manter UUID, id_apagar UUID)
RETURNS public.profiles AS $$
DECLARE
    manter public.profiles%ROWTYPE;
    apagar public.profiles%ROWTYPE;
    resultado public.profiles%ROWTYPE;
    v_roles public.user_role[];
    v_primary_role public.user_role;
    v_start_date DATE;
BEGIN
    IF auth.uid() IS NOT NULL
       AND public.get_user_role() IS DISTINCT FROM 'admin'
       AND NOT ('admin' = ANY(public.get_user_roles())) THEN
        RAISE EXCEPTION 'Apenas administradores podem fundir fichas.';
    END IF;

    IF id_manter = id_apagar THEN
        RAISE EXCEPTION 'Escolhe duas fichas diferentes para fundir.';
    END IF;

    SELECT * INTO manter FROM public.profiles WHERE id = id_manter;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a manter não encontrada (id: %).', id_manter; END IF;
    SELECT * INTO apagar FROM public.profiles WHERE id = id_apagar;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a apagar não encontrada (id: %).', id_apagar; END IF;

    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = apagar.id) THEN
        RAISE EXCEPTION 'Não é possível apagar uma ficha com conta associada. Troca a direção da fusão para manter essa conta.';
    END IF;

    -- Combinar papéis
    v_roles := ARRAY(
        SELECT DISTINCT unnest(
            COALESCE(manter.roles, ARRAY[manter.role]) || 
            COALESCE(apagar.roles, ARRAY[apagar.role])
        )
    );
    v_roles := array_remove(v_roles, 'unassigned'::user_role);

    IF v_roles IS NULL OR array_length(v_roles, 1) = 0 THEN
        v_primary_role := CASE 
            WHEN manter.role <> 'unassigned' THEN manter.role 
            WHEN apagar.role <> 'unassigned' THEN apagar.role 
            ELSE 'player'::user_role 
        END;
        v_roles := ARRAY[v_primary_role];
    ELSE
        IF 'admin' = ANY(v_roles) THEN v_primary_role := 'admin'::user_role;
        ELSIF 'coach' = ANY(v_roles) THEN v_primary_role := 'coach'::user_role;
        ELSIF 'player' = ANY(v_roles) THEN v_primary_role := 'player'::user_role;
        ELSIF 'supporter' = ANY(v_roles) THEN v_primary_role := 'supporter'::user_role;
        ELSE v_primary_role := v_roles[1];
        END IF;
    END IF;

    -- Manter a data de início mais antiga entre as duas fichas
    IF manter.quota_start_date IS NOT NULL AND apagar.quota_start_date IS NOT NULL THEN
        v_start_date := LEAST(manter.quota_start_date, apagar.quota_start_date);
    ELSE
        v_start_date := COALESCE(apagar.quota_start_date, manter.quota_start_date);
    END IF;

    UPDATE public.profiles
    SET
        name             = coalesce(nullif(btrim(apagar.name), ''), manter.name),
        nickname         = coalesce(nullif(btrim(apagar.nickname), ''), manter.nickname),
        shirt_name       = coalesce(nullif(btrim(apagar.shirt_name), ''), manter.shirt_name),
        phone            = coalesce(nullif(btrim(manter.phone), ''), apagar.phone),
        role             = v_primary_role,
        roles            = v_roles,
        status           = CASE WHEN manter.status = 'active' OR apagar.status = 'active' THEN 'active' ELSE manter.status END,
        jersey_number    = coalesce(manter.jersey_number, apagar.jersey_number),
        position         = coalesce(nullif(btrim(manter.position), ''), apagar.position),
        preferred_foot   = coalesce(nullif(btrim(manter.preferred_foot), ''), apagar.preferred_foot),
        kit_size         = coalesce(nullif(btrim(manter.kit_size), ''), apagar.kit_size),
        birth_date       = coalesce(manter.birth_date, apagar.birth_date),
        nationality      = coalesce(nullif(btrim(manter.nationality), ''), apagar.nationality),
        address          = coalesce(nullif(btrim(manter.address), ''), apagar.address),
        postal_code      = coalesce(nullif(btrim(manter.postal_code), ''), apagar.postal_code),
        city             = coalesce(nullif(btrim(manter.city), ''), apagar.city),
        nif              = coalesce(nullif(btrim(manter.nif), ''), apagar.nif),
        id_number        = coalesce(nullif(btrim(manter.id_number), ''), apagar.id_number),
        id_card_expiry   = coalesce(manter.id_card_expiry, apagar.id_card_expiry),
        iban             = coalesce(nullif(btrim(manter.iban), ''), apagar.iban),
        member_number    = coalesce(manter.member_number, apagar.member_number),
        quota_start_date = v_start_date,
        quota_end_date   = coalesce(manter.quota_end_date, apagar.quota_end_date),
        emergency_contact_name     = coalesce(nullif(btrim(manter.emergency_contact_name), ''), apagar.emergency_contact_name),
        emergency_contact_phone    = coalesce(nullif(btrim(manter.emergency_contact_phone), ''), apagar.emergency_contact_phone),
        emergency_contact_relation = coalesce(nullif(btrim(manter.emergency_contact_relation), ''), apagar.emergency_contact_relation),
        medical_notes    = coalesce(nullif(btrim(manter.medical_notes), ''), apagar.medical_notes),
        gdpr_consent     = coalesce(manter.gdpr_consent, apagar.gdpr_consent)
    WHERE id = id_manter
    RETURNING * INTO resultado;

    PERFORM public._merge_profile_references(apagar.id, id_manter);
    DELETE FROM public.profiles WHERE id = apagar.id;

    RETURN resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
