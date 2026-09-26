-- ============================================================================
-- Registo das exportações de documentos dos atletas (2026-09-26)
-- ============================================================================
--
-- O relatório de documentos (Clube → Relatórios → Documentos) junta num .zip
-- os cartões de cidadão, as apólices ou os atestados de vários atletas. É uma
-- exportação em bloco de documentos de identificação, e o RGPD pede rasto:
-- quem exportou, quando, que documento, de quem, e se descarregou ou
-- partilhou.
--
-- **Escrito pelo servidor, nunca pelo cliente.** A tabela não tem política de
-- INSERT: a única porta é a função `registar_exportacao_documentos()`, que
-- põe o `auth.uid()` e o `now()` ela própria — um registo que o cliente
-- escrevesse podia dizer outra pessoa ou outra hora. Mesma lição de
-- `callups.responded_at`.
--
-- Leem-na só a direção, que é quem pode exportar.
-- ============================================================================

create table if not exists public.exportacoes_documentos (
  id uuid primary key default gen_random_uuid(),
  -- Pode ficar a NULL: se a ficha de quem exportou for apagada, o registo
  -- fica, sem o nome. Quem o põe é sempre a função, que usa o auth.uid().
  feito_por uuid references public.profiles (id) on delete set null,
  feito_em timestamptz not null default now(),
  tipo text not null check (tipo in ('cc', 'seguro', 'atestado')),
  perfis uuid[] not null,
  destino text not null check (destino in ('descarregar', 'partilhar'))
);

alter table public.exportacoes_documentos enable row level security;

create policy "Exportações: a direção lê"
  on public.exportacoes_documentos for select to authenticated
  using (public.get_user_role() = 'admin');

-- Sem INSERT, UPDATE nem DELETE para ninguém: o registo não se apaga nem se
-- reescreve pela API.
revoke all on public.exportacoes_documentos from anon;
revoke insert, update, delete on public.exportacoes_documentos from authenticated;

create or replace function public.registar_exportacao_documentos(
  p_tipo text,
  p_perfis uuid[],
  p_destino text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  novo uuid;
begin
  -- IS DISTINCT FROM e não <>: com get_user_role() a NULL (sem sessão, ou
  -- conta sem ficha), `<>` dava NULL e o IF deixava passar. Ver o ponto 3 dos
  -- riscos no CLAUDE.md.
  if public.get_user_role() is distinct from 'admin' then
    raise exception 'Só a direção exporta documentos.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_perfis, 1), 0) = 0 then
    raise exception 'Uma exportação sem atletas não se regista.' using errcode = '22023';
  end if;

  insert into public.exportacoes_documentos (feito_por, tipo, perfis, destino)
  values (auth.uid(), p_tipo, p_perfis, p_destino)
  returning id into novo;
  return novo;
end;
$$;

-- Uma função nova precisa de REVOKE de PUBLIC e anon, e de GRANT explícito a
-- quem a chama (ponto 7 dos riscos no CLAUDE.md).
revoke all on function public.registar_exportacao_documentos(text, uuid[], text) from public, anon;
grant execute on function public.registar_exportacao_documentos(text, uuid[], text) to authenticated;
