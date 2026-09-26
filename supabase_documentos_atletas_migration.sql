-- ============================================================================
-- Documentos dos atletas num bucket privado (2026-09-26)
-- ============================================================================
--
-- O cartão de cidadão, a apólice do seguro e o atestado médico eram carregados
-- para o `club_assets`, que é público, e a app guardava o `getPublicUrl`:
--
--   * quem tivesse o endereço abria o documento sem sessão nenhuma;
--   * o `SELECT` para `public` deixava a chave anónima do bundle LISTAR o
--     bucket inteiro — os nomes dos ficheiros, e com eles os endereços;
--   * o `UPDATE` para qualquer `authenticated` deixava um jogador substituir
--     o documento de outro;
--   * e uma política de INSERT com `WITH CHECK (true)` deixava qualquer conta
--     escrever em QUALQUER bucket, `finance_documents` incluído.
--
-- Esta migração é só aditiva e não parte a app que está em produção: as
-- fotografias e os emblemas continuam no `club_assets`, e continuam a abrir
-- pelo endereço público — um bucket público serve os seus ficheiros por esse
-- caminho sem passar pela RLS. O que muda é quem pode listar e escrever.
--
-- Os quatro documentos que já existem são copiados para o bucket novo pela
-- própria app (`migrarDocumentosPublicos`, em src/lib/documentos.ts), da
-- primeira vez que alguém da equipa técnica abre o Plantel — é a única forma
-- de copiar os ficheiros sem credenciais de serviço.
-- ============================================================================

-- 1. O bucket privado, com uma pasta por ficha: <profile_id>/<tipo>-<data>.<ext>
insert into storage.buckets (id, name, public)
values ('documentos_atletas', 'documentos_atletas', false)
on conflict (id) do update set public = false;

-- 2. Quem lê e escreve: o próprio (a pasta é o seu id) e a equipa técnica —
--    a mesma repartição da tabela `profiles`, que já dá ao treinador o número
--    do cartão de cidadão. A exportação em bloco é outra coisa, e é só da
--    direção (ver o relatório de documentos).
create policy "Documentos: o próprio e a equipa técnica leem"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos_atletas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.get_user_role() in ('coach', 'admin')
    )
  );

create policy "Documentos: o próprio e a equipa técnica carregam"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos_atletas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.get_user_role() in ('coach', 'admin')
    )
  );

create policy "Documentos: o próprio e a equipa técnica substituem"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documentos_atletas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.get_user_role() in ('coach', 'admin')
    )
  )
  with check (
    bucket_id = 'documentos_atletas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.get_user_role() in ('coach', 'admin')
    )
  );

create policy "Documentos: o próprio e a equipa técnica apagam"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos_atletas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.get_user_role() in ('coach', 'admin')
    )
  );

-- 3. Fechar o INSERT aberto a todos os buckets. As duas políticas de INSERT
--    do `club_assets` que ficam já dizem `bucket_id = 'club_assets'`.
drop policy if exists "Enable insert for authenticated users only" on storage.objects;

-- 4. Listar o `club_assets` passa a exigir sessão. As duas políticas eram
--    iguais e davam o bucket a `public`; os ficheiros continuam a abrir pelo
--    endereço público, e quem carrega fotografias (com `upsert`) continua a
--    ter o SELECT de que precisa.
drop policy if exists "Leitura publica club_assets" on storage.objects;
drop policy if exists "Permitir leitura a todos" on storage.objects;
create policy "club_assets: lê quem tem sessão"
  on storage.objects for select to authenticated
  using (bucket_id = 'club_assets');

-- 5. A equipa técnica pode apagar do `club_assets` — é o que deixa a app
--    retirar de lá os documentos depois de os copiar para o bucket privado.
create policy "club_assets: a equipa técnica apaga"
  on storage.objects for delete to authenticated
  using (bucket_id = 'club_assets' and public.get_user_role() in ('coach', 'admin'));
