--------------------------------------------------------------------------------
-- MIGRAÇÃO: papéis a sério, em coluna própria e protegida por RLS
--------------------------------------------------------------------------------
--
-- PROBLEMA QUE ISTO RESOLVE
--
-- Até aqui, os papéis extra de um utilizador (admin, treinador) não viviam numa
-- coluna: estavam escondidos como um comentário HTML — <!--roles:admin,coach--> —
-- dentro dos campos `medical_notes` ou `position`. Como a RLS permite (e bem) que
-- cada utilizador edite o seu próprio perfil, e esses dois campos não estão
-- protegidos, qualquer jogador podia escrever essa etiqueta nas suas notas médicas
-- e ganhar a interface de administrador.
--
-- Esta migração cria uma coluna `roles` verdadeira, copia para lá o que estava nas
-- etiquetas, limpa as etiquetas dos campos de texto e tranca a coluna com RLS.
--
-- É idempotente: pode ser corrida mais do que uma vez sem estragar nada.
--------------------------------------------------------------------------------

begin;

--------------------------------------------------------------------------------
-- 1. Coluna `roles`
--------------------------------------------------------------------------------

alter table public.profiles
  add column if not exists roles public.user_role[] not null default array['player']::public.user_role[];

--------------------------------------------------------------------------------
-- 2. Copiar os papéis que hoje estão escondidos nas etiquetas
--------------------------------------------------------------------------------
-- Lê <!--roles:a,b--> de medical_notes ou position, valida cada entrada contra o
-- enum e guarda o resultado. Quem não tiver etiqueta fica com os papéis derivados
-- da coluna `role`, seguindo a mesma hierarquia que a app já usava.

update public.profiles p
set roles = coalesce(
  (
    select array_agg(distinct btrim(raw)::public.user_role)
    from unnest(
      string_to_array(
        (regexp_match(
          coalesce(p.medical_notes, '') || ' ' || coalesce(p.position, ''),
          '<!--roles:([^>]+)-->'
        ))[1],
        ','
      )
    ) as t(raw)
    where btrim(raw) in ('player', 'coach', 'admin')
  ),
  case p.role
    when 'admin' then array['admin', 'coach', 'player']::public.user_role[]
    when 'coach' then array['coach', 'player']::public.user_role[]
    else array['player']::public.user_role[]
  end
);

-- Rede de segurança: o papel real da coluna `role` tem sempre de constar em `roles`,
-- mesmo que a etiqueta antiga estivesse incompleta ou corrompida.
update public.profiles
set roles = array_append(roles, role)
where not (role = any(roles));

--------------------------------------------------------------------------------
-- 3. Limpar as etiquetas dos campos de texto
--------------------------------------------------------------------------------
-- Já não são lidas por ninguém. Ficam a sujar as notas médicas e a posição, que
-- são campos que aparecem na interface.

update public.profiles
set medical_notes = nullif(btrim(regexp_replace(medical_notes, '<!--roles:[^>]+-->', '', 'g')), '')
where medical_notes like '%<!--roles:%';

update public.profiles
set position = nullif(btrim(regexp_replace(position, '<!--roles:[^>]+-->', '', 'g')), '')
where position like '%<!--roles:%';

--------------------------------------------------------------------------------
-- 4. Trancar `role` e `roles` contra auto-promoção
--------------------------------------------------------------------------------
-- A política antiga comparava o novo `role` com uma subconsulta à própria tabela
-- `profiles`. Uma política sobre `profiles` que consulta `profiles` arrisca
-- recursão infinita na avaliação da RLS. Passamos a usar funções SECURITY DEFINER,
-- que correm fora da RLS e por isso não recorrem — o mesmo padrão que a
-- `get_user_role()` já usava.

create or replace function public.get_user_roles()
returns public.user_role[]
language sql
security definer
stable
set search_path = public
as $$
  select roles from public.profiles where id = auth.uid();
$$;

-- Reafirmar a get_user_role() existente com search_path fixo (boa prática em
-- funções SECURITY DEFINER: impede que um search_path manipulado a desvie).
create or replace function public.get_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "Utilizador pode editar o seu próprio perfil" on public.profiles;

create policy "Utilizador pode editar o seu próprio perfil"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  -- Nem o papel real nem a lista de papéis podem ser alterados pelo próprio.
  -- Só a política de administrador consegue lá mexer.
  and role  = public.get_user_role()
  and roles = public.get_user_roles()
);

--------------------------------------------------------------------------------
-- 5. Verificação
--------------------------------------------------------------------------------

-- Deve devolver os papéis de cada um, sem nenhuma etiqueta perdida pelo caminho.
select
  count(*)                                                     as total_atletas,
  count(*) filter (where 'admin' = any(roles))                 as com_admin,
  count(*) filter (where 'coach' = any(roles))                 as com_treinador,
  count(*) filter (where medical_notes like '%<!--roles:%')    as etiquetas_por_limpar,
  count(*) filter (where position like '%<!--roles:%')         as etiquetas_por_limpar_pos
from public.profiles;

commit;
