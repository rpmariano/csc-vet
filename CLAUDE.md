# CSC Veteranos — GDS Cascais

PWA de gestão da equipa de futebol de veteranos do GD Sport Cascais.
Interface em **português de Portugal**. **Uma só UI, a de telemóvel**: num ecrã largo
é a mesma app numa coluna de 480px ao meio (`#root` em `src/index.css`). A UI de
computador — sidebar de 256px, gaveta de traços — foi retirada no redesenho de 2026.

Os pontos de corte responsivos do Tailwind estão **desligados** no `@theme`
(`--breakpoint-*: 9999px`): olham para a janela e não para a coluna, e num monitor
largo poriam grelhas de três colunas dentro de 480px. As classes `sm:`/`md:`/`lg:`
que ainda restam nas páginas por redesenhar não geram nada — tiram-se à medida que
cada ecrã é tocado.

## Stack

| Camada | Tecnologia |
|---|---|
| Build | Vite 8 (`base: '/csc-vet/'`) + `vite-plugin-pwa` (generateSW, autoUpdate) |
| UI | React 19, React Router 7 (`BrowserRouter`), Tailwind CSS **v4** |
| Design | Redesenho 2026 — handoff em `Redesign UI app futebol veteranos/design_handoff_app_veteranos/README.md` |
| Ícones | `lucide-react` |
| Backend | Supabase (auth + Postgres + RLS) |
| Lint | oxlint (`.oxlintrc.json`) |
| Deploy | GitHub Actions → GitHub Pages, em push para `main` |

Comandos: `npm run dev` · `npm run build` (`tsc -b && vite build`) · `npm run lint` ·
`npm run test:e2e` (Playwright)

Os testes de fumo em `tests/e2e/` correm contra um Vite apontado a um Supabase
inventado, com todos os pedidos intercetados no browser (`tests/e2e/supabase-mock.ts`):
não tocam na base de dados real nem precisam de credenciais. Cobrem o contrato de
acessibilidade dos diálogos — `role="dialog"`, nome acessível, foco ao abrir, Escape a
fechar e empilhamento.

## Arquitetura

```
src/
├── App.tsx              Rotas + composição dos 3 providers
├── context/
│   ├── AuthContext      sessão, perfil, papéis, simulação de papel, estado clínico
│   ├── ClubContext      club_settings (id=1), campo de casa
│   └── ToastContext     toasts + singleton global `toast.success(...)`
├── components/
│   ├── ui/              primitivos do redesenho: cartões, faixa, botões, separadores
│   ├── nav/             barra inferior, cabeçalho, folha do [+]
│   └── …                Layout (a moldura), modais partilhados, PWA prompt
├── hooks/
│   ├── useModalA11y     Escape, prisão de foco e pilha de diálogos empilhados
│   └── useRealceDeslizante  o realce que corre por trás do item ativo ("minhoca")
├── pages/               uma página por rota
├── lib/
│   ├── supabaseClient   cliente único
│   ├── finance          regra da época, quotas, encargos
│   ├── clube            nome do clube por omissão (a verdade está em club_settings)
│   └── rotas            endereços absolutos, com o `base` do Vite
└── utils/haptics        vibração (navigator.vibrate)

scripts/escurecer-tema.py   passa um ficheiro do tema claro para o escuro
```

### Papéis e autorização

Três papéis: `player` · `coach` · `admin`.

- O papel **real** vive na coluna `profiles.role` (protegida por RLS).
- Os papéis **atribuídos** são extraídos por `extractRolesFromProfile()`, que faz parse
  de uma etiqueta `<!--roles:admin,coach-->` escondida em `medical_notes` ou `position`.
  Isto é um *workaround* ao esquema, não um desenho intencional — ver Riscos.
- Um utilizador com vários papéis pode **simular** outro papel (persistido em
  `localStorage['csc_simulated_role']`). `profile.role` devolvido pelo contexto é o papel
  *efetivo* (simulado); `actualRole` é o real.
- `ProtectedRoute` faz as barreiras no cliente; a autorização a sério é a RLS do Supabase.

### Tabelas Supabase

`profiles`, `fields`, `opponents`, `tournaments`, `tournament_players`,
`tournament_suspensions`, `tournament_groups`, `tournament_teams`, `tournament_matches`,
`events`, `callups`, `attendances`, `stats`, `announcements`, `announcement_reads`,
`dues`, `transactions`, `club_settings`.

Criadas na fase 1 do redesenho (`supabase_redesign_migration.sql`) e **ainda sem uso
na app** — existem para os ecrãs das fases seguintes nascerem com os campos certos:
`quota_exemptions` (meses dispensados de quota, escrita só de admin, leitura do
próprio — mesma repartição de `dues`), `notification_preferences` e
`notification_deliveries` (ambas privadas do próprio, como `announcement_reads`; a
segunda **sem política de INSERT** de propósito, porque quem envia é o lado do
servidor). Mais a coluna `profiles.preferred_foot` e a função
`admin_contas_sem_atleta()`, para o ecrã de associação manual de conta a atleta.

Quatro campos que o handoff pede como novos **já existiam**:
`profiles.quota_start_date`/`quota_end_date` e `tournaments.organizer_name`/`image_url`.

`v_players_public` (`supabase_profiles_pii_migration.sql`) é a vista por onde a app lê os
colegas de equipa — sem email, telefone, morada, NIF, cartão de cidadão nem IBAN. A tabela
`profiles` só é legível pelo próprio e por `coach`/`admin`. A associação de uma conta à sua
ficha de atleta é feita pelas funções `find_my_profile_match()` e `associate_my_profile()`.

Vistas de reporting (`supabase_finance_reporting_migration.sql`, ambas `security_invoker`):
`v_financial_movements` (facto único: quotas + encargos + despesas/receitas, com época,
categoria e jogador) e `v_quota_status` (matriz jogador × mês; é o único sítio onde existe
a quota **por pagar** — em `dues` só há linha para as pagas).
A função `public.financial_season(date)` espelha `getSeasonLabel()` de `src/lib/finance.ts` —
qualquer mudança à regra da época tem de ser feita **nos dois sítios**.
Ver `docs/financeiro-campos-reporting.md`.

`announcement_reads` (`supabase_announcement_reads_migration.sql`) guarda que comunicados
cada pessoa já leu. Estava em `localStorage`, que é por dispositivo — o badge de por ler
não sincronizava entre o telemóvel e o desktop. Cada um só vê e escreve as suas linhas,
nem a equipa técnica lê as dos outros.

RLS: leitura aberta a qualquer autenticado — **exceto `profiles` e `announcement_reads`**,
ver acima; escrita
restrita a `coach`/`admin` via `public.get_user_role()` (`SECURITY DEFINER`). Esquema em `supabase_schema.sql` e
`supabase_players_migration.sql`.

## Convenções

- **Design tokens** em `src/index.css` (`@theme` do Tailwind v4), não em `tailwind.config.js`
  (esse ficheiro é legado da v3 e está inerte). De superfície:
  `csc-dark #164f16` · `csc-light #009662` · `csc-gold #e3c04d` · `csc-blue #005296` ·
  `csc-red #ef3223`. De texto sobre o fundo escuro, porque as de superfície são
  escuras de mais para uma frase: `csc-verde-texto #4ecf9d` · `csc-azul-texto #7fb3e0` ·
  `csc-vermelho-texto #f08a7f`. Fundo `csc-fundo #0e1011`; `csc-tinta #121415` é o
  texto sobre dourado. Tipo de letra de display: **Archivo**.
- Tipografia densa e pesada: `font-black`, tamanhos `text-[9px]`–`text-sm`.
- **Cartões: usar os primitivos**, não classes à mão — `<CartaoVidro>` para o cartão
  principal de um ecrã (translúcido, deixa passar a faixa do topo) e `<CartaoSimples>`
  para listas e blocos. Idem `<Botao>`, `<Pastilha>`, `<TituloEcra>`,
  `<EtiquetaSeccao>` e `<FilaSeparadores>` (`src/components/ui`).
- **Todos os alvos de toque têm no mínimo 44px de altura**, sem exceções — inclui
  pastilhas, separadores e botões de linha.
- O fim da coluna acaba acima da barra inferior com `margin-bottom`, nunca
  `padding-bottom`: com padding o último cartão fica por baixo da barra.
- **Passar uma página ao tema escuro começa por `python scripts/escurecer-tema.py
  --estados <ficheiros>`**, que traduz o cinzento do tema claro (`text-gray-700` →
  `text-white/80` e por aí, prefixos de variante incluídos) e, com `--estados`,
  também as cores de estado (`bg-emerald-100`, `text-amber-900`,
  `border-blue-200` → os tokens do clube em translúcido). Depois conta os
  `bg-white` opacos que sobram para se olhar um a um — esses exigem
  julgamento: um painel de diálogo passa a `bg-csc-fundo`, o fundo de um
  emblema fica branco. **Correr sem `--estados` não chega:** foi assim que a
  página de Eventos ficou dada por escura com 28 pastilhas verde-menta e
  amarelo-pálido ainda a brilhar sobre o fundo preto. **E a seguir grepar por
  `bg-white text-white`:** o script traduz o `text-gray-900` de dentro de uma
  caixa que fica branca, e o campo passa a ter texto branco sobre branco — o
  Plantel tinha dezoito assim, todos ilegíveis e nenhum visível numa leitura
  do diff.
- **Um `Modal` não tem tom.** O painel é sempre `bg-csc-fundo`. Havia um
  `tone` cujo `'dark'` dava o verde do clube, ao contrário do `BottomSheet`,
  onde a mesma palavra dá o fundo escuro — um modal escrito por analogia com
  uma persiana saía verde-garrafa. Se algum dia for preciso um painel verde,
  é uma prop nova com o nome da cor, não um "tom".
- **Um cartão que se clica não pode ser um `div` com `onClick`.** Se puder ser
  `<button>`, é; quando tem um link dentro (o do Maps, por exemplo) e isso o
  proíbe, leva `role="button"`, `tabIndex={0}`, um `onKeyDown` para Enter e
  Espaço, e um `aria-label` que diga o que abre. É também o que dá aos testes
  um seletor estável: procurar por `div.bg-csc-dark` partiu-se duas vezes num
  dia, à segunda e à terceira vez que um cartão mudou de aspeto.
- Ações do utilizador disparam `triggerHaptic(...)` e confirmam com `toast.*`.
- **O plantel lê-se de `v_players_public`, não de `profiles`.** Tudo o que mostre
  colegas de equipa — listas, convocatórias, fichas de jogo, estatísticas — usa a
  vista, que só tem colunas de equipa. `profiles` fica para a própria ficha e para o
  Plantel (treinador/admin), onde os dados pessoais são o assunto.
- **Guardar um evento leva à convocatória**, e é lá que as linhas de `callups`
  são escritas — em mais lado nenhum do fluxo de criação
  (`ConvocatoriaAoCriar`, ecrãs 4f/4g). Era um bloco no meio do formulário, e
  ter dois sítios a escrever a mesma tabela é como se perde a conta de quem
  está chamado.
- **Detalhe é persiana, e vai no endereço.** Ver um evento ou uma ficha de atleta
  abre o `<VistaDetalhe>` e põe o item no endereço (`?event=`, `?atleta=`), portanto
  há link próprio e o retroceder do browser fecha (ver Riscos, ponto 6). Modais ficam
  para inserções curtas (criar um campo, confirmar) — não para consultar uma
  entidade. Assim estão o detalhe do evento, a ficha de atleta, o dossier de
  convocatória e a ficha de jogo.
- Comentários e strings de UI em português.
- Assets públicos são referenciados com o prefixo literal `/csc-vet/` (não com
  `import.meta.env.BASE_URL`).

## Riscos conhecidos (revisto em 2026-09)

1. **~~P1 — Qualquer autenticado lê a ficha completa de toda a gente.~~ Corrigido em
   2026-09-02** (`supabase_rls_profiles_migration.sql`, aplicada). Havia uma política
   `FOR ALL ... USING (true)` que, por serem as permissivas somadas por OR, dava leitura
   *e escrita* de todas as fichas a qualquer conta. Hoje: a própria ficha e a equipa
   técnica. Verificado na base — admin vê 27, jogador vê 1.
   A contrapartida no cliente está feita: as leituras de plantel passaram para a vista
   `public.v_players_public` (nome, alcunha, camisola, número, foto, posição, estado,
   papéis — sem IBAN, NIF, morada, contactos ou notas médicas), incluindo as
   convocatórias e estatísticas que trazem o jogador aninhado. A tabela `profiles` fica
   para a própria ficha (AuthContext, Definições), para a associação de conta e para o
   Plantel, que é de treinador/admin.
2. **~~Crítico — escrita anónima em `profiles` pela vista do plantel.~~ Corrigido em
   2026-09-02** (`supabase_rls_v_players_public_migration.sql`, aplicada).
   `v_players_public` é SECURITY DEFINER (é o que lhe permite servir o plantel depois
   de `profiles` estar fechada) e, sendo uma vista simples, é automaticamente
   atualizável — e os privilégios por omissão davam INSERT/UPDATE/DELETE a `anon`. Ou
   seja, a chave anónima do bundle público dava escrita direta em `profiles` sem
   sessão, incluindo `role = 'admin'`. Hoje: só `SELECT`, e só a `authenticated`.
   **Lição para vistas novas:** uma vista SECURITY DEFINER sobre uma tabela protegida
   precisa sempre de `REVOKE ALL` + `GRANT SELECT` — a RLS da tabela base não a cobre.
   **A mesma lição vale para funções:** `REVOKE ALL ... FROM PUBLIC` não chega — este
   projeto tem *default privileges* no schema `public` que concedem `EXECUTE` a `anon`
   e `authenticated` diretamente em toda função nova, não via `PUBLIC`. Uma função
   interna (não pensada para RPC) precisa de `REVOKE ALL ... FROM anon, authenticated`
   explícito. Apanhado em 2026-09-02 no `_merge_profile_references` do ponto 3 — ver
   `get_advisors(security)` do Supabase, que sinaliza isto.
3. **~~P1 — Associação de conta a jogador partida.~~ Corrigido em 2026-09-02**
   (`supabase_profile_merge_migration.sql` +
   `supabase_profile_merge_security_fix_migration.sql`, aplicadas). `associate_my_profile()`
   referia `public.tournament_players`, tabela que nunca existiu neste esquema — a função
   rebentava a meio sempre que a associação automática (por email, telefone ou nome)
   chegava a esse ponto, desfazendo os passos já feitos (é uma transação implícita só).
   Confirmado nos logs: o login do André Couto às 20:56:13 gerou o erro
   `relation "public.tournament_players" does not exist` um segundo depois. Corrigida a
   lista de tabelas (com `insurance_payments` e `announcement_reads`, que a função
   original não cobria e por isso perdiam-se em CASCADE DELETE ao apagar a ficha antiga).
   De caminho, criado `admin_merge_profiles()` para o admin fundir duas fichas à mão —
   ver Plantel, "Fundir com Outra Ficha" — e corrigida (na segunda migração) uma falha de
   autorização introduzida nessa própria função: `IF get_user_role() <> 'admin'` não
   dispara quando `get_user_role()` é `NULL` (chamada anon, ou conta sem perfil ainda) —
   `<>` com `NULL` dá `NULL`, e um `IF` com condição `NULL` em plpgsql conta como `FALSE`.
   **Lição:** uma guarda de autorização em plpgsql tem de usar `IS DISTINCT FROM`, nunca
   `<>`/`=`, quando o valor comparado pode ser `NULL`.
4. **~~P1 — Escalada de privilégios na UI pela etiqueta em `medical_notes`.~~ Já não
   se aplica** (verificado na base em 2026-09-06). O texto anterior dizia que um
   jogador podia injetar `<!--roles:admin-->` nas suas notas médicas e ganhar a UI de
   admin. Entretanto passou a existir a coluna `profiles.roles`, que
   `extractRolesFromProfile()` lê **primeiro** e só ignora se vier vazia — e está
   preenchida nas 28 fichas. Mudá-la está travado: a política de UPDATE do próprio
   tem `WITH CHECK (… AND role = get_user_role() AND NOT (roles IS DISTINCT FROM
   get_user_roles()))`. A etiqueta é hoje um resto, alcançável só numa ficha com
   `roles` vazio, que não existe.
   **~~O que ficava por apertar.~~ Corrigido em 2026-09-06**
   (`supabase_seguranca_insert_execute_migration.sql`, aplicada). A política de
   INSERT era `WITH CHECK (auth.uid() = id OR equipa técnica)` e não dizia nada sobre
   `role` — uma ficha criada pelo próprio podia nascer admin. Ninguém lá chegava,
   porque o gatilho `on_auth_user_created` cria a ficha com `role = 'player'` no
   mesmo instante em que a conta nasce e um INSERT do próprio bate na chave primária
   (zero contas sem ficha); mas esse gatilho engole os seus erros com um `EXCEPTION
   WHEN OTHERS` e `profiles.email` é NOT NULL, por isso uma conta sem email deixaria
   a ficha por criar e a porta aberta. Hoje o WITH CHECK exige que uma ficha criada
   pelo próprio nasça `role = 'player'` e `roles = {player}`. Verificado: inserir
   como admin dá 42501, inserir como jogador — o que a app faz — passa.
7. **~~Funções SECURITY DEFINER chamáveis sem sessão.~~ Corrigido em 2026-09-06**
   (mesma migração). Sete funções estavam expostas em `/rest/v1/rpc/…` à chave
   anónima. Tinham guarda interna, mas a guarda é a segunda linha de defesa.
   **Completa a lição do ponto 2:** ali o problema era o EXECUTE estar concedido
   *diretamente* a `anon`/`authenticated`, e um `REVOKE ... FROM PUBLIC` não chegar.
   O inverso também é verdade — o Postgres concede EXECUTE a `PUBLIC` em toda a
   função nova, e `anon` herda de lá. **Uma função nova precisa de
   `REVOKE ... FROM PUBLIC, anon` e de um `GRANT` explícito a quem a deve chamar.**
   `handle_new_user`, sendo gatilho e não RPC, saiu da API para os dois lados.
5. **P2 — Ficheiros grandes:** `CalendarPage` tem ~3100 linhas e `EventsPage` ~2900.
   Não há modais escritos à mão sem acessibilidade — todos passaram pelo `<Modal>`,
   `<ConfirmModal>`, `<UnsavedChangesModal>` ou pelo hook `useModalA11y`.
   O redesenho parte-os por secções à medida que cada área é tocada — não como
   refactor à parte.
6. **P2 — O retroceder do browser nem sempre fecha a persiana.** Muito melhorado em
   2026-09-06; não fechado. O endereço muda, mas a atualização de localização do
   React Router não chega a ser confirmada: o `popstate` não vê mudança nenhuma, o
   efeito que fecha o detalhe nunca corre e a persiana fica aberta por cima da
   lista. Reproduzido com `history.back()` do próprio browser (não é artefacto do
   Playwright) e no código anterior ao redesenho.
   **A causa é o `React.lazy` nas rotas.** Medido em `tests/e2e/vista-detalhe.spec.ts`,
   com `--retries=0 --repeat-each=3`: com um `<Suspense>` extra dentro da Competição
   falhava sempre; com `React.lazy` e só o `<Suspense>` do `App`, ~50%; sem
   `React.lazy` nas rotas que abrem detalhe, ~7%. Mover o `<Suspense>` do `App` para
   dentro do `Layout` piora.
   **Por isso `CalendarPage`, `EventsPage`, `TeamManagementPage` e `CompeticaoPage`
   são importadas diretamente em `src/App.tsx`** — são as quatro que abrem um detalhe
   com endereço próprio. O resto continua em `React.lazy`. A poupança perdida é
   pequena: o service worker da PWA já pré-carrega todos os pedaços à primeira
   visita, por isso a divisão só valia nos primeiros segundos da primeiríssima
   abertura. Arranque: ~87 kB → ~156 kB comprimidos.
   **Uma página nova que abra um detalhe pelo endereço não pode ser `lazy`.**
   Sobram ~7% de falhas, que continuam a passar à segunda pelo `retries: 1`.

**Sobre o `.env` e a chave anónima.** O `.env` deixou de ser versionado (`cdf2187`) mas
continua no histórico, e a chave que lá está tem `role: anon` — é pública por desenho:
o Vite injeta-a no bundle que qualquer visitante do site descarrega. Rodá-la não muda
nada, porque a nova volta para o mesmo sítio público. O que protege os dados é a RLS,
ou seja, o ponto 1. Nunca foi versionada uma `service_role` — essa sim seria crítica e
teria de ser rodada de imediato.

## Regras de trabalho

- O redesenho de 2026 vive na branch de integração **`redesign`**; a `main` fica em
  produção intacta até estar tudo pronto. Uma branch e um PR por fase, contra a
  `redesign`. Nunca fazer push direto para `main`.
- Antes de cada commit: `npm run lint`, `npm run build` e `npm run test:e2e` têm de
  passar.
- Qualquer alteração de UI tem de ser verificada em janela **estreita e larga**: em
  ambas tem de aparecer a mesma coisa, centrada. Diferenças entre as duas são bug.
- Ao redesenhar um ecrã, cruzar com `Mapa de Navegação.dc.html` do handoff para
  nenhum botão ficar sem destino, e manter o vocabulário do código (posições GR–PL,
  estados Apto/Lesionado/Inativo, tipos de evento, participação na ficha de jogo).
