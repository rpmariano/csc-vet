-- ============================================================================
-- Documentos dos atletas, segunda parte: as colunas antigas saem (2026-09-26)
-- ============================================================================
--
-- **Aplicar só depois de a app nova estar no ar.** A primeira parte
-- (`supabase_documentos_por_epoca_migration.sql`) criou `documentos_atleta` e
-- copiou para lá o que havia; a app que estava em produção continuou a ler e
-- a escrever as três colunas da ficha até ao deploy. Esta parte traz o que ela
-- tenha escrito entretanto, e depois tira as colunas.
-- ============================================================================

-- 1. O que a app antiga escreveu depois da primeira parte -----------------------
--    Com as mesmas regras da cópia inicial: só caminhos da pasta da própria
--    ficha, de ficheiros que existem. Com o gatilho desligado, para ficar a
--    data e a época do ficheiro, e não as de hoje.

alter table public.documentos_atleta disable trigger documentos_atleta_carimbar;

-- a) Substituições: a app antiga trocava o ficheiro na coluna. Se o da coluna
--    é mais recente do que a linha, a linha passa a ser ele. (Se a app nova já
--    mexeu na linha depois disso, a linha é mais recente e fica.)
with origem as (
  select p.id as profile_id, x.tipo, x.caminho, o.created_at,
         case when x.tipo in ('seguro', 'atestado')
              then public.financial_season((o.created_at at time zone 'Europe/Lisbon')::date) end as epoca
  from public.profiles p
  cross join lateral (values
    ('cc', p.id_document_url),
    ('seguro', p.insurance_doc_url),
    ('atestado', p.medical_exam_doc_url)
  ) as x (tipo, caminho)
  join storage.objects o on o.bucket_id = 'documentos_atletas' and o.name = x.caminho
  where x.caminho is not null
    and split_part(x.caminho, '/', 1) = p.id::text
)
update public.documentos_atleta d
   set caminhos = array[origem.caminho], carregado_em = origem.created_at, carregado_por = null
  from origem
 where d.profile_id = origem.profile_id
   and d.tipo = origem.tipo
   and d.epoca is not distinct from origem.epoca
   and not (origem.caminho = any (d.caminhos))
   and origem.created_at > d.carregado_em;

-- b) Documentos que não havia.
insert into public.documentos_atleta (profile_id, tipo, epoca, caminhos, carregado_em)
select p.id, x.tipo,
       case when x.tipo in ('seguro', 'atestado')
            then public.financial_season((o.created_at at time zone 'Europe/Lisbon')::date) end,
       array[x.caminho], o.created_at
from public.profiles p
cross join lateral (values
  ('cc', p.id_document_url),
  ('seguro', p.insurance_doc_url),
  ('atestado', p.medical_exam_doc_url)
) as x (tipo, caminho)
join storage.objects o on o.bucket_id = 'documentos_atletas' and o.name = x.caminho
where x.caminho is not null
  and split_part(x.caminho, '/', 1) = p.id::text
on conflict do nothing;

alter table public.documentos_atleta enable trigger documentos_atleta_carimbar;

-- 2. A fusão manual de fichas deixa de copiar as colunas ------------------------
--    Os documentos passam pelo `_merge_profile_references()`, como o resto.
--    Igual à que estava, sem as três linhas dos documentos.

create or replace function public.admin_merge_profiles(id_manter uuid, id_apagar uuid)
 returns profiles
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
    manter public.profiles%ROWTYPE;
    apagar public.profiles%ROWTYPE;
    resultado public.profiles%ROWTYPE;
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem fundir fichas.';
    END IF;
    IF id_manter = id_apagar THEN
        RAISE EXCEPTION 'Escolhe duas fichas diferentes para fundir.';
    END IF;

    SELECT * INTO manter FROM public.profiles WHERE id = id_manter;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a manter não encontrada.'; END IF;
    SELECT * INTO apagar FROM public.profiles WHERE id = id_apagar;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha a apagar não encontrada.'; END IF;

    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = id_apagar) THEN
        RAISE EXCEPTION 'A ficha a apagar tem uma conta de login própria — escolhe-a para manter (trocando a ordem) em vez de a apagar.';
    END IF;

    UPDATE public.profiles p SET
        name                     = coalesce(manter.name, apagar.name),
        nickname                 = coalesce(manter.nickname, apagar.nickname),
        shirt_name               = coalesce(manter.shirt_name, apagar.shirt_name),
        phone                    = coalesce(manter.phone, apagar.phone),
        photo_url                = coalesce(manter.photo_url, apagar.photo_url),
        status                   = coalesce(manter.status, apagar.status),
        jersey_number            = coalesce(manter.jersey_number, apagar.jersey_number),
        kit_size                 = coalesce(manter.kit_size, apagar.kit_size),
        birth_date               = coalesce(manter.birth_date, apagar.birth_date),
        nationality              = coalesce(manter.nationality, apagar.nationality),
        position                 = coalesce(manter.position, apagar.position),
        address                  = coalesce(manter.address, apagar.address),
        postal_code              = coalesce(manter.postal_code, apagar.postal_code),
        city                     = coalesce(manter.city, apagar.city),
        nif                      = coalesce(manter.nif, apagar.nif),
        id_number                = coalesce(manter.id_number, apagar.id_number),
        id_card_expiry           = coalesce(manter.id_card_expiry, apagar.id_card_expiry),
        iban                     = coalesce(manter.iban, apagar.iban),
        member_number            = coalesce(manter.member_number, apagar.member_number),
        emergency_contact_name   = coalesce(manter.emergency_contact_name, apagar.emergency_contact_name),
        emergency_contact_phone  = coalesce(manter.emergency_contact_phone, apagar.emergency_contact_phone),
        medical_notes            = coalesce(manter.medical_notes, apagar.medical_notes),
        gdpr_consent             = coalesce(manter.gdpr_consent, apagar.gdpr_consent),
        quota_start_date         = coalesce(manter.quota_start_date, apagar.quota_start_date),
        quota_end_date           = coalesce(manter.quota_end_date, apagar.quota_end_date)
    WHERE p.id = id_manter
    RETURNING p.* INTO resultado;

    PERFORM public._merge_profile_references(id_apagar, id_manter);

    DELETE FROM public.profiles WHERE id = id_apagar;

    RETURN resultado;
END;
$function$;

-- 3. As colunas -------------------------------------------------------------------

alter table public.profiles
  drop column if exists id_document_url,
  drop column if exists insurance_doc_url,
  drop column if exists medical_exam_doc_url;
