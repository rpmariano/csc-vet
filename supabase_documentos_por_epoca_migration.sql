-- ============================================================================
-- Documentos dos atletas numa tabela própria, com a época (2026-09-26)
-- ============================================================================
--
-- Os documentos eram três colunas da ficha (`id_document_url`,
-- `insurance_doc_url`, `medical_exam_doc_url`) — um ficheiro de cada, para
-- sempre. Mas a apólice do seguro e o atestado médico renovam-se todas as
-- épocas, e o que conta é o da época em curso; entra um quarto documento, a
-- proposta de sócio; e um documento é muitas vezes mais do que uma imagem.
-- Decisões da direção (2026-09-26):
--
--   * cartão de cidadão e proposta de sócio: um só por pessoa;
--   * apólice e atestado: um por época — a do Financeiro, `financial_season()`;
--   * carrega-se só para a época em curso, nunca para a seguinte;
--   * as épocas anteriores ficam guardadas;
--   * cada documento leva até 4 imagens — a frente e o verso do cartão, as
--     páginas da proposta.
--
-- **Quem decide a época é o servidor**, pela hora de Lisboa (a base corre em
-- UTC, e na primeira hora de 1 de setembro ainda contava a época anterior). O
-- gatilho `documentos_atleta_carimbar` põe a época, a hora e quem carregou — o
-- cliente não os manda, e por isso não os pode inventar (mesma lição de
-- `callups.responded_at`).
--
-- **As épocas passadas só a equipa técnica lhes mexe.** O atleta junta e tira
-- imagens ao documento em vigor; o de uma época que já acabou fica como estava
-- — a linha e o ficheiro: pelo Storage, quem não é da equipa técnica só apaga
-- ou sobrepõe ficheiros que já não estejam em documento nenhum. E eliminar
-- fichas passa a ser só da equipa técnica: a regra deixava também eliminar a
-- ficha "do meu email", e a eliminação arrastava os documentos com ela.
--
-- **A fusão de fichas leva os documentos.** Até aqui o `associate_my_profile()`
-- não copiava as colunas dos documentos: um cartão de cidadão carregado pela
-- direção na ficha, antes de o atleta criar conta, perdia-se quando ele a
-- ligava. Agora o `_merge_profile_references()` passa as linhas para a ficha
-- que fica, nos dois caminhos de fusão. De caminho, passa também os meses
-- dispensados de quota (que se perdiam da mesma maneira — há 4 em fichas sem
-- conta) e corrige o registo das exportações, que ficava a apontar para a
-- ficha apagada.
--
-- **E quem é dono de um documento pode abri-lo, esteja o ficheiro onde
-- estiver.** O ficheiro fica na pasta da ficha onde foi carregado; depois de
-- uma fusão essa pasta já não é a do dono, e a regra do bucket (a pasta é o
-- teu id) deixava-o de fora. A leitura do bucket passa a aceitar também quem
-- tem a linha. Por isso o próprio só pode juntar ficheiros da **sua** pasta:
-- sem isso, apontar uma linha para o ficheiro de outro dava acesso a ele. A
-- regra vive no gatilho e não na RLS, porque só o gatilho vê o que a linha já
-- tinha — e o atleta tem de poder juntar o verso a um cartão de cidadão que a
-- direção carregou, na pasta da ficha antiga, antes de ele ligar a conta.
--
-- Esta parte é só aditiva: as três colunas ficam até a app nova estar no ar
-- (a que está em produção ainda as lê e escreve). Saem na segunda parte,
-- `supabase_documentos_por_epoca_colunas_migration.sql`.
-- ============================================================================

-- 1. A tabela ------------------------------------------------------------------

create table if not exists public.documentos_atleta (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null check (tipo in ('cc', 'proposta', 'seguro', 'atestado')),
  -- A época do Financeiro ("2026/2027"), só nos documentos que são por época.
  epoca text,
  -- Os ficheiros do documento, 1 a 4: `<profile_id>/<tipo>-<ms>-<n>.<ext>` no
  -- bucket privado `documentos_atletas`.
  caminhos text[] not null,
  carregado_em timestamptz not null default now(),
  -- A NULL se a ficha de quem carregou for eliminada; e nas linhas copiadas
  -- das colunas antigas, de que não se sabe o autor.
  carregado_por uuid references public.profiles (id) on delete set null,
  constraint documentos_atleta_epoca_so_nos_da_epoca
    check ((tipo in ('seguro', 'atestado')) = (epoca is not null)),
  constraint documentos_atleta_ate_quatro_ficheiros
    check (cardinality(caminhos) between 1 and 4 and array_position(caminhos, null) is null),
  -- Um cartão de cidadão por pessoa, um atestado por pessoa e época.
  constraint documentos_atleta_um_por_tipo_e_epoca
    unique nulls not distinct (profile_id, tipo, epoca)
);

-- O relatório lê por tipo e época, a ficha por pessoa (essa vem do unique), e
-- as regras do bucket procuram o documento de um ficheiro.
create index if not exists documentos_atleta_tipo_epoca on public.documentos_atleta (tipo, epoca);
create index if not exists documentos_atleta_caminhos on public.documentos_atleta using gin (caminhos);

-- A época em curso, pela hora de Lisboa. É o `financial_season()` de sempre,
-- só com o dia certo: a base corre em UTC.
create or replace function public.epoca_em_curso()
returns text
language sql
stable
set search_path = ''
as $$
  select public.financial_season((now() at time zone 'Europe/Lisbon')::date);
$$;

revoke all on function public.epoca_em_curso() from public, anon;
grant execute on function public.epoca_em_curso() to authenticated;

-- 2. O que já existe passa para a tabela ----------------------------------------
--    Antes de criar o gatilho, para ficar a data em que o ficheiro foi
--    carregado e não a de hoje. Hoje há 4 cartões de cidadão e nenhuma apólice
--    nem atestado; a apólice e o atestado ficariam na época da data do
--    ficheiro.
--    **Só caminhos da pasta da própria ficha, e de ficheiros que existem.** O
--    próprio pode escrever o que quiser nestas colunas: sem o filtro, pôr lá o
--    caminho do cartão de outro dava-lhe acesso permanente ao ficheiro, pela
--    regra de leitura do ponto 5.

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

-- 3. O carimbo do servidor ------------------------------------------------------

create or replace function public.documentos_atleta_carimbar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  eu uuid := auth.uid();
  da_equipa boolean := coalesce(public.get_user_role()::text, '') in ('coach', 'admin');
begin
  -- O mesmo ficheiro não entra duas vezes: tirá-lo deixava o documento vazio.
  if cardinality(new.caminhos) <> (select count(distinct u.c) from unnest(new.caminhos) as u (c)) then
    raise exception 'O mesmo ficheiro não entra duas vezes no documento.' using errcode = '23505';
  end if;

  if eu is not null and not da_equipa then
    -- Quem não é da equipa técnica só junta ficheiros da sua pasta; os que a
    -- linha já tinha contam como estão (ver o topo). Sem sessão — a própria
    -- migração, o service_role — não há regra: o `anon` nem chega aqui, não
    -- tem privilégios sobre a tabela.
    if exists (
      select 1 from unnest(new.caminhos) as n (caminho)
      where n.caminho not like (eu::text || '/%')
        and (tg_op = 'INSERT' or not (n.caminho = any (old.caminhos)))
    ) then
      raise exception 'Só podes juntar ficheiros da tua pasta.' using errcode = '42501';
    end if;
    -- E o documento de uma época que já acabou fica como estava.
    if tg_op = 'UPDATE'
       and new.caminhos is distinct from old.caminhos
       and old.epoca is not null
       and old.epoca is distinct from public.epoca_em_curso() then
      raise exception 'Os documentos de épocas anteriores já não se alteram.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.epoca := case when new.tipo in ('seguro', 'atestado') then public.epoca_em_curso() end;
    new.carregado_em := now();
    new.carregado_por := eu;
    return new;
  end if;

  -- Numa alteração, o tipo e a época não mudam: juntar uma imagem ao atestado
  -- de 2026/2027 não o passa para outra época.
  new.tipo := old.tipo;
  new.epoca := old.epoca;
  if new.caminhos is distinct from old.caminhos then
    -- Uma imagem a mais ou a menos é um carregamento novo.
    new.carregado_em := now();
    new.carregado_por := eu;
  else
    -- A fusão de fichas muda só o dono: o carregamento continua a ser o que era.
    new.carregado_em := old.carregado_em;
    -- O autor só passa a NULL pelo `on delete set null` da chave estrangeira,
    -- quando a ficha de quem carregou é eliminada — e esse corre dentro do
    -- gatilho da integridade referencial, um nível abaixo. Repor o autor aí
    -- deixava a chave a apontar para uma ficha que já não existe, e eliminar
    -- a ficha de um treinador que carregou documentos falhava. Vindo do
    -- cliente, o NULL não passa.
    if not (new.carregado_por is null and pg_trigger_depth() > 1) then
      new.carregado_por := old.carregado_por;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.documentos_atleta_carimbar() from public, anon, authenticated;

drop trigger if exists documentos_atleta_carimbar on public.documentos_atleta;
create trigger documentos_atleta_carimbar
  before insert or update on public.documentos_atleta
  for each row execute function public.documentos_atleta_carimbar();

-- 4. Quem lê e escreve: o próprio e a equipa técnica ------------------------------
--    A mesma repartição de `profiles` e do bucket. A regra da pasta e a das
--    épocas passadas estão no gatilho; eliminar o documento de uma época
--    passada fica aqui, só para a equipa técnica.

alter table public.documentos_atleta enable row level security;

drop policy if exists "Documentos: o próprio e a equipa técnica leem" on public.documentos_atleta;
create policy "Documentos: o próprio e a equipa técnica leem"
  on public.documentos_atleta for select to authenticated
  using (profile_id = (select auth.uid()) or public.get_user_role() in ('coach', 'admin'));

drop policy if exists "Documentos: o próprio e a equipa técnica carregam" on public.documentos_atleta;
create policy "Documentos: o próprio e a equipa técnica carregam"
  on public.documentos_atleta for insert to authenticated
  with check (profile_id = (select auth.uid()) or public.get_user_role() in ('coach', 'admin'));

drop policy if exists "Documentos: o próprio e a equipa técnica alteram" on public.documentos_atleta;
create policy "Documentos: o próprio e a equipa técnica alteram"
  on public.documentos_atleta for update to authenticated
  using (profile_id = (select auth.uid()) or public.get_user_role() in ('coach', 'admin'))
  with check (profile_id = (select auth.uid()) or public.get_user_role() in ('coach', 'admin'));

drop policy if exists "Documentos: o próprio e a equipa técnica eliminam" on public.documentos_atleta;
create policy "Documentos: o próprio e a equipa técnica eliminam"
  on public.documentos_atleta for delete to authenticated
  using (
    (profile_id = (select auth.uid()) and (epoca is null or epoca = public.epoca_em_curso()))
    or public.get_user_role() in ('coach', 'admin')
  );

revoke all on public.documentos_atleta from anon;

-- 5. O bucket ------------------------------------------------------------------
--    `alter policy` e não largar e criar: não fica um instante sem regra, com a
--    app antiga a pedir links.

-- Um ficheiro está num documento? Vê todas as linhas, e não só as de quem
-- pergunta — as regras do bucket correm com a RLS de quem chama.
create or replace function public.documento_usa_ficheiro(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.documentos_atleta d where d.caminhos @> array[p_caminho]);
$$;

revoke all on function public.documento_usa_ficheiro(text) from public, anon;
grant execute on function public.documento_usa_ficheiro(text) to authenticated;

-- a) Quem é dono da linha também lê o ficheiro.

alter policy "Documentos: o próprio e a equipa técnica leem"
  on storage.objects
  using (
    bucket_id = 'documentos_atletas'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.get_user_role() in ('coach', 'admin')
      or exists (
        select 1 from public.documentos_atleta d
        where d.profile_id = (select auth.uid()) and d.caminhos @> array[objects.name]
      )
    )
  );

-- b) Apagar e sobrepor um ficheiro que está num documento é só da equipa
--    técnica. Sem isto, o congelamento das épocas passadas e o carimbo de quem
--    carregou guardavam só a linha: o atleta podia apagar pelo Storage o
--    ficheiro de um atestado antigo, ou pôr outro com o mesmo nome. A app nova
--    só apaga ficheiros que já saíram do documento (ao tirar um, ou quando a
--    linha falha ao juntar); a antiga nunca apaga neste bucket.
alter policy "Documentos: o próprio e a equipa técnica apagam"
  on storage.objects
  using (
    bucket_id = 'documentos_atletas'
    and (
      public.get_user_role() in ('coach', 'admin')
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and not public.documento_usa_ficheiro(name)
      )
    )
  );

alter policy "Documentos: o próprio e a equipa técnica substituem"
  on storage.objects
  using (
    bucket_id = 'documentos_atletas'
    and (
      public.get_user_role() in ('coach', 'admin')
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and not public.documento_usa_ficheiro(name)
      )
    )
  );

-- 6. Juntar e tirar ficheiros ----------------------------------------------------
--    SECURITY INVOKER — correm com a RLS e o gatilho de quem chama. Os
--    ficheiros apagam-se na app, depois: em SQL o Storage recusa.

-- Junta ficheiros ao documento — ao único, ou ao desta época —, criando-o se
-- ainda não existe. Mais de 4 esbarra na regra da tabela.
create or replace function public.acrescentar_ficheiros(p_perfil uuid, p_tipo text, p_caminhos text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.documentos_atleta as d (profile_id, tipo, caminhos)
  values (p_perfil, p_tipo, p_caminhos)
  on conflict on constraint documentos_atleta_um_por_tipo_e_epoca
  do update set caminhos = d.caminhos || excluded.caminhos;
end;
$$;

-- Tira um ficheiro do documento; o último leva o documento com ele. **Se não
-- tirou nada, dá erro** — a app apaga o ficheiro do bucket a seguir, e um
-- "correu bem" calado (a RLS a filtrar o DELETE de uma época passada, um
-- documento que outro telemóvel já mudou) deixava a linha a apontar para um
-- ficheiro apagado.
create or replace function public.tirar_ficheiro(p_documento uuid, p_caminho text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.documentos_atleta
     set caminhos = array_remove(caminhos, p_caminho)
   where id = p_documento
     and p_caminho = any (caminhos)
     and cardinality(array_remove(caminhos, p_caminho)) > 0;
  if found then
    return;
  end if;

  delete from public.documentos_atleta
   where id = p_documento
     and p_caminho = any (caminhos)
     and cardinality(array_remove(caminhos, p_caminho)) = 0;
  if not found then
    raise exception 'Este ficheiro já não se pode tirar deste documento.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.acrescentar_ficheiros(uuid, text, text[]) from public, anon;
grant execute on function public.acrescentar_ficheiros(uuid, text, text[]) to authenticated;
revoke all on function public.tirar_ficheiro(uuid, text) from public, anon;
grant execute on function public.tirar_ficheiro(uuid, text) to authenticated;

-- 7. A fusão de fichas leva os documentos (e os meses dispensados) ---------------
--    Igual à que estava, mais os três blocos marcados.

create or replace function public._merge_profile_references(id_antigo uuid, id_novo uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
    DELETE FROM public.callups c WHERE c.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.callups x WHERE x.player_id = id_novo AND x.event_id = c.event_id);
    UPDATE public.callups SET player_id = id_novo WHERE player_id = id_antigo;

    DELETE FROM public.attendances a WHERE a.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.attendances x WHERE x.player_id = id_novo AND x.event_id = a.event_id);
    UPDATE public.attendances SET player_id = id_novo WHERE player_id = id_antigo;

    DELETE FROM public.stats s WHERE s.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.stats x WHERE x.player_id = id_novo AND x.event_id = s.event_id);
    UPDATE public.stats SET player_id = id_novo WHERE player_id = id_antigo;

    DELETE FROM public.dues d WHERE d.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.dues x WHERE x.player_id = id_novo AND x.month_year = d.month_year);
    UPDATE public.dues SET player_id = id_novo WHERE player_id = id_antigo;

    DELETE FROM public.charge_players cp WHERE cp.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.charge_players x WHERE x.player_id = id_novo AND x.charge_id = cp.charge_id);
    UPDATE public.charge_players SET player_id = id_novo WHERE player_id = id_antigo;

    DELETE FROM public.announcement_reads ar WHERE ar.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.announcement_reads x WHERE x.player_id = id_novo AND x.announcement_id = ar.announcement_id);
    UPDATE public.announcement_reads SET player_id = id_novo WHERE player_id = id_antigo;

    -- [novo] Os documentos: o que a ficha que fica já tem, ganha.
    DELETE FROM public.documentos_atleta dd WHERE dd.profile_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.documentos_atleta x WHERE x.profile_id = id_novo
                    AND x.tipo = dd.tipo AND x.epoca IS NOT DISTINCT FROM dd.epoca);
    UPDATE public.documentos_atleta SET profile_id = id_novo WHERE profile_id = id_antigo;

    -- [novo] Os meses dispensados de quota — perdiam-se na cascata do DELETE.
    DELETE FROM public.quota_exemptions q WHERE q.profile_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.quota_exemptions x WHERE x.profile_id = id_novo AND x.month_year = q.month_year);
    UPDATE public.quota_exemptions SET profile_id = id_novo WHERE profile_id = id_antigo;

    -- [novo] O registo das exportações fala da ficha que fica.
    UPDATE public.exportacoes_documentos SET perfis = array_replace(perfis, id_antigo, id_novo)
     WHERE id_antigo = ANY (perfis);

    UPDATE public.charge_payments SET player_id = id_novo WHERE player_id = id_antigo;
    UPDATE public.insurance_payments SET player_id = id_novo WHERE player_id = id_antigo;
    UPDATE public.tournament_suspensions SET player_id = id_novo WHERE player_id = id_antigo;

    UPDATE public.announcements SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.charges SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.dues SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.events SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.charge_payments SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.insurance_payments SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.transactions SET created_by = id_novo WHERE created_by = id_antigo;
END;
$function$;

-- 8. O registo das exportações: a proposta, a fotografia e a época ---------------

alter table public.exportacoes_documentos drop constraint if exists exportacoes_documentos_tipo_check;
alter table public.exportacoes_documentos add constraint exportacoes_documentos_tipo_check
  check (tipo in ('cc', 'proposta', 'seguro', 'atestado', 'foto'));
alter table public.exportacoes_documentos add column if not exists epoca text;

-- A assinatura muda (mais um argumento, com omissão): largar a antiga para não
-- ficarem duas. A app em produção chama com três argumentos, e a nova serve-a.
drop function if exists public.registar_exportacao_documentos(text, uuid[], text);

create or replace function public.registar_exportacao_documentos(
  p_tipo text,
  p_perfis uuid[],
  p_destino text,
  p_epoca text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  novo uuid;
begin
  -- IS DISTINCT FROM e não <>: ver o ponto 3 dos riscos no CLAUDE.md.
  if public.get_user_role() is distinct from 'admin' then
    raise exception 'Só a direção exporta documentos.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_perfis, 1), 0) = 0 then
    raise exception 'Uma exportação sem atletas não se regista.' using errcode = '22023';
  end if;

  insert into public.exportacoes_documentos (feito_por, tipo, perfis, destino, epoca)
  values (auth.uid(), p_tipo, p_perfis, p_destino, p_epoca)
  returning id into novo;
  return novo;
end;
$$;

revoke all on function public.registar_exportacao_documentos(text, uuid[], text, text) from public, anon;
grant execute on function public.registar_exportacao_documentos(text, uuid[], text, text) to authenticated;

-- 9. Só a equipa técnica elimina fichas ---------------------------------------------
--    A regra deixava também eliminar a ficha "do meu email" — a própria, ou a
--    que a direção criou para mim. Nenhum ecrã o faz (só o Plantel elimina, e é
--    da equipa técnica), e a eliminação arrasta tudo o que é da ficha: as
--    convocatórias, as estatísticas, as quotas pagas, e os documentos das
--    épocas passadas que a direção decidiu guardar.

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
             and policyname = 'Apagar fichas: equipa técnica, ou as do meu email') then
    alter policy "Apagar fichas: equipa técnica, ou as do meu email"
      on public.profiles rename to "Apagar fichas: só a equipa técnica";
  end if;
end $$;

alter policy "Apagar fichas: só a equipa técnica"
  on public.profiles
  using (public.get_user_role() in ('coach', 'admin'));
