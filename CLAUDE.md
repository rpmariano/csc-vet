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
`admin_contas_por_ligar()` (criada como `admin_contas_sem_atleta()` e reescrita a
2026-09-07 — ver abaixo), para o ecrã de associação manual de conta a ficha.

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

`callups.responded_at` (`supabase_callups_responded_at_migration.sql`) guarda quando
o atleta confirmou ou recusou — `created_at` é de quando foi *convocado*, e não servia.
É preenchida pelo gatilho `callups_marcar_resposta` e nunca pelo cliente: a política de
UPDATE deixa o jogador escrever a sua própria linha e o `WITH CHECK` só olha ao `status`,
por isso uma hora enviada pelo cliente era uma hora falsificável. As respostas anteriores
à migração ficaram a NULL.

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
  do diff. **E grepar também por `-csc-[a-z]+/\d+/\d+`:** o script traduzia
  `bg-amber-50/80` para `bg-csc-gold/10/80`, que não é classe nenhuma — o
  Tailwind não gera nada e o elemento fica sem fundo, sem erro nem aviso.
  Corrigido em 2026-09-07 (o padrão passou a engolir o sufixo de opacidade da
  origem), mas o grep custa um segundo. **E o script traduz comentários**, que
  não sabe distinguir de classes: um comentário que cite `bg-red-50` fica a
  dizer `bg-csc-red/10` e passa a mentir.
- **Um diálogo tem de levar o foco lá para dentro ao abrir**, e o
  `useModalA11y` trata disso — mas insistindo por `requestAnimationFrame` até o
  painel existir, e não uma vez só. A versão anterior tentava com
  `setTimeout(…, 0)` e desistia em silêncio se a ref ainda fosse nula: chegava
  para os diálogos que abrem de um clique, e falhava nas persianas abertas
  **pelo endereço**, porque o `BottomSheet` monta o painel num segundo passo
  para animar a entrada. Medido antes da correção: a ficha do adversário ficava
  com o foco no `<body>` em 10 de 12 aberturas — quem navega por teclado abria o
  diálogo e continuava do lado de fora dele. `dialogos.spec.ts` cobre agora as
  persianas abertas por navegação direta, e repete cada uma quatro vezes: era
  uma corrida, e uma passagem única dava verde com o bug lá.
- **Um cabeçalho de grupo escreve-se como etiqueta; a linha, como conteúdo.**
  Numa lista agrupada — "Os meus pagamentos" — o cabeçalho leva maiúsculas
  pequenas e espaçadas (`9.5px`, `tracking-[0.16em]`, `text-white/70`) sobre
  uma banda mais clara, e as linhas ficam a `13px font-extrabold` com um recuo
  e uma barra de cor à esquerda com o seu estado. Tinham os dois o mesmo peso,
  e a categoria "Seguro Desportivo" aparecia colada ao encargo "Seguro
  Desportivo 26/27" sem nada a dizer que um era o título do outro.
- **Uma persiana sobe sempre até meio do ecrã** (`min-h-[55dvh]` no
  `BottomSheet`). Sem isso o painel agarrava-se ao conteúdo, e uma persiana
  curta abria uma tira colada ao fundo do telemóvel — o título à altura dos
  botões do sistema e a lista dentro do bezel. As alturas são em `dvh` e não
  em `vh`: no telemóvel a barra do browser entra e sai, e `vh` conta com ela
  sempre escondida.
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
- **Presença, nesta app, é a resposta à convocatória — e não se lhe chama
  presença.** A tabela `attendances` existe e nunca foi escrita: zero linhas.
  O que há é `callups.status` — `called` (sem resposta), `confirmed`,
  `declined` — e `callups.responded_at`. Daí o vocabulário dos ecrãs: "Disse
  que sim", "Disse que não", "Sem resposta", nunca "presente", "falta" ou
  "presenças". Só `confirmed` e `declined` entram em percentagens: quem foi
  convocado ontem e ainda não respondeu **não é uma falta**. E o estado vazio é
  a norma, não a exceção — em produção há 1191 convocatórias por responder para
  9 respostas, por isso um histórico desenhado cheio é um histórico a fingir.
- **Mudar o mês de início da época obriga a mexer nas fichas.** A época vive em
  `financial_settings.season_start_month`, mas quem já cá estava tem uma
  `quota_start_date` fixa — e um mês da época anterior a essa data não é devido
  por ninguém. A 2026-09-08 a direção pôs a época a começar em Agosto e tirou
  Agosto dos `quota_excluded_months`: a app continuou a começar em Setembro,
  não porque estivesse errada, mas porque as 22 fichas tinham `2026-09-02`.
  Passaram para `2026-08-01` e o mês entrou (previsão 2420 € → 2640 €, com
  220 € já vencidos). **A alternativa que não deriva é `quota_start_date` a
  NULL** — sem limite inferior, quem já cá estava deve a época toda, seja qual
  for. Ficou a data por ser visível na ficha; se a época voltar a mudar, as
  fichas têm de acompanhar.
- **Os avisos push: as regras vivem em SQL, a Edge Function é só o carteiro.**
  `public.avisos_pendentes()` diz o que falta enviar a quem — já cruzado com as
  preferências de cada um, com o silêncio da noite (hora de Lisboa, e a base
  corre em UTC) e com o que já saiu; a função `enviar-avisos` entrega e chama
  `registar_envio()`. São regras sobre os dados, e em SQL testam-se com uma
  consulta. **O mesmo assunto só sai uma vez**, por `(profile_id, tipo,
  origem_id)` em `notification_deliveries`. As duas funções são só do
  `service_role`. O relógio é o `.github/workflows/avisos.yml` e não o
  `pg_cron`, que não está instalado neste projeto.
  A chave VAPID está criada e a entrega verificada em produção (2026-09-09). A
  pública entra no bundle por `VITE_VAPID_PUBLIC_KEY`; a privada e o
  `AVISOS_TOKEN` vivem só nos segredos do Supabase e do repositório. **Trocar a
  chave invalida todas as subscrições existentes** — passam a responder 403, que
  a função conta e reporta sem as apagar. Ver `docs/avisos-push.md`.
- **Os avisos nascem todos desligados, e é o "Guardar" que liga o telemóvel.**
  `avisos_pendentes()` faz `COALESCE(np.<flag>, false)`: quem nunca abriu o ecrã
  12b não tem linha em `notification_preferences` e não recebe nada — verificado,
  7 subscrições sem preferências dão zero avisos. No cliente, `OMISSOES` em
  `src/components/PreferenciasAvisos.tsx` é tudo `false` e não há botão de
  "Ligar" à parte: guardar com pelo menos um aviso escolhido pede a permissão e
  subscreve; guardar com o último desligado apaga a subscrição deste aparelho.
  Eram dois gestos para uma intenção, e quem fizesse só o primeiro ficava com
  tudo pedido e nada a chegar.
  **A escolha grava-se sempre, mesmo que a subscrição falhe** — as preferências
  são da pessoa e valem em todos os aparelhos, a subscrição é de um só. Quem
  escolher os avisos num Safari sem a app instalada tem de os ver guardados na
  mesma; o aviso do que falhou vai num `toast.warning`, não num erro que
  desfaça o resto.
- **O dinheiro fala em três cores, e as pastilhas estão num sítio só.**
  `CHIP_ATRASO` / `CHIP_AVISO` / `CHIP_PAGO` / `CHIP_NEUTRO`, as barras
  `BARRA_*` e o `fmtEuro` vivem em `src/components/financeiro/estilos.ts` —
  vermelho em atraso, âmbar a vencer, verde pago, e uma barra de 3px à esquerda
  da linha a dizer o mesmo sem se ler nada, como em `OsMeusPagamentos`. As
  Quotas e os Encargos diziam a mesma coisa de maneiras diferentes. Estavam no
  topo de `FinancePage.tsx` e saíram para um módulo quando a Visão Geral passou
  a ficheiro próprio: um bloco que importasse constantes da página que o
  importa fecha um ciclo.
  **Os dois ecrãs eram, até 2026-09-09, `bg-white` opacos com `text-white`
  dentro** — o nome do jogador e o encargo inteiro invisíveis, brancos sobre
  branco. É a armadilha do `escurecer-tema.py` já descrita acima; foi a única
  ocorrência que restava em `src/` (o resto dos `bg-white` opacos são campos de
  formulário com tinta escura, fundos de emblema e botões de interruptor).
- **O Saldo Previsto no Fim da Época é o último ponto da linha do saldo, e mais
  nada.** A Visão Geral (`src/components/financeiro/VisaoGeralFinanceira.tsx`,
  saída do `FinancePage.tsx` a 2026-09-09) desenha o saldo mês a mês: até hoje
  o acumulado real dos movimentos, daí para a frente as quotas por pagar, o que
  falta de cada encargo e os Pagamentos Programados, cada um no seu prazo. O
  previsto era uma segunda conta à parte, e tinha um buraco — descontava as
  despesas avulsas já lançadas mas não somava as receitas avulsas já recebidas,
  por isso um patrocínio entrava em caixa sem mexer no previsto.
  **A ordem dos cartões é a das perguntas:** saldo, plano, o que está marcado
  para sair, como corre a época, como vai a cobrança — e só depois as
  repartições por categoria, que são consulta e não alerta. Saíram o "Total
  recebido" e o "Total pago" (são as duas parcelas do saldo, e estão inteiros
  mais abaixo) e a "Situação de Quotas dos Atletas", cuja lista de nomes é a do
  separador Quotas, que é onde se resolve.
- **O que se deve ao clube vive no `useEstadoPagamentos`, e mais em lado
  nenhum.** Quotas *e* encargos, com prazos: devolve a cor (vermelho com algo
  vencido, laranja a menos de `DIAS_DE_AVISO` — 8 — dias, nada em dia), a
  contagem e as listas. Alimenta o sinal de € do cabeçalho, a persiana que ele
  abre e o cartão "Os meus pagamentos" do Perfil — antes eram dois cálculos que
  podiam discordar, e o `usePlayerQuotaDebt` só via quotas vencidas: um encargo
  por pagar não aparecia em aviso nenhum.
  **Com um vencido e outro a aproximar-se manda o vermelho** — é o que precisa
  de ser tratado primeiro. **E mostra-se a quem tem o papel de jogador**, não a
  quem "não é da equipa técnica": a faixa antiga testava `!eAdmin &&
  !eTreinador`, e metade da direção deste clube também joga.
  O texto de como se paga é o `COMO_PAGAR` do `SinalPagamentos`, um só para os
  dois sítios que o mostram.
- **A janela de atividade escreve-se sozinha, a partir do estado.** O gatilho
  `profiles_janela_de_atividade` (`supabase_janela_atividade_trigger_migration.sql`,
  aplicada a 2026-09-08) põe `quota_end_date` ao passar a **Inativo**, e ao
  voltar atualiza `quota_start_date` e limpa o fim; uma ficha nova começa a
  contar no dia em que é criada. **`injured` conta como ativo** — um lesionado
  continua sócio e continua a pagar. Está num gatilho e não no cliente porque
  há mais do que um sítio a escrever `status` (o formulário do Plantel e o
  botão de "Marcar lesionado"), e a quota é calculada a partir desta janela.
  **Uma data escrita à mão no mesmo UPDATE ganha sempre** — a condição compara
  `NEW` com `OLD` em vez de olhar só ao estado. Quem já cá estava ficou com
  2026-09-02, por decisão da direção.
- **A ficha do atleta mostra tudo o que a base tem; a edição é que é
  restrita.** Ver não é editar: a ficha (`?atleta=`, no Plantel) é de
  treinador/direção, a mesma gente que pode abrir o formulário — esconder-lhe
  campos ali não protegia nada e obrigava a entrar em modo de edição só para
  ler um telemóvel. Faltavam-lhe o email, o telemóvel, o tamanho de
  equipamento, o pé preferido, a janela de quota e os meses dispensados. **A
  ficha rápida do convocado (4a) e o plantel do jogador continuam pelo
  `v_players_public`** — essas não têm PII e não mudam.
- **Tudo se responde, treinos incluídos — mas o treino tem janela.**
  `convocatoriaFechada()` é o único sítio onde a regra vive. Um evento aceita
  resposta assim que deixa de ser rascunho e tem gente convocada; fecha com a
  ficha de jogo lançada ou passada a hora limite. **O treino abre
  `DIAS_JANELA_TREINO` (6) dias antes e fecha à hora a que começa** — não à de
  concentração, como os outros. São semanais e convocam automaticamente todos
  os aptos: sem janela, a Agenda e a Home tinham sempre um treino por
  responder e a pergunta perdia o efeito. Fora da janela o estado é
  `'ainda-nao-abriu'` e o texto di-lo, para ninguém pensar que perdeu o prazo.
  **E um treino nunca sobe ao cartão de cima da Home** — esse é dos jogos.
  (Regra revista a 2026-09-08: até aí os treinos não se respondiam de todo.)
- **O canto do cabeçalho é o mesmo em todos os ecrãs**: estado clínico
  (`<PastilhaEstado>`), sino dos comunicados e fotografia, por esta ordem,
  dentro do `<CabecalhoEcra>` — a Home tem o seu próprio cabeçalho (o clube e a
  época no lugar do título) mas com o mesmo canto. Estavam só na Home, e nos
  outros ecrãs ficava a fotografia sozinha: um comunicado novo não tinha por
  onde ser visto sem passar pela Home. A sobrancelha é `truncate`, numa linha
  só — com o canto sempre a levar três coisas, uma sobrancelha que quebrasse
  fazia o cabeçalho mudar de altura de ecrã para ecrã. **A fotografia não leva
  lápis**: é sempre a mesma porta, e um lápis num ecrã e não nos outros fazia
  parecer que abriam sítios diferentes.
- **Uma equipa de torneio mostra-se pela sigla e pelo emblema** — nunca pelo
  nome por extenso, que numa tabela de dez colunas sai truncado a meio. O
  `equipaDoTorneio()` da `StandingsPage` é o único sítio que decide isso, e a
  gestão do torneio usa-o também. **A sigla de um adversário é a que a direção
  escreveu na ficha** (`opponents.initials`), e só na falta dela é que se
  recorre ao `formatOpponentSigla()`: esse é para os placares apertados, recusa
  espaços e corta a seis letras — de "Clube Atletismo do Montijo" faz "CADM",
  que ninguém escreveu. O emblema do próprio clube vem de `club_settings`, e
  não de um ficheiro estático nem de um `null` fixo, que era o que punha o
  escudo genérico na linha do clube.
- **Os controlos do mês vivem dentro do cartão do calendário**, com o "Hoje"
  entre as duas setas — não no cabeçalho do ecrã, longe do que mudam e
  encostados ao funil dos filtros. **E o mês passa com o dedo:** um arrasto
  lateral sobre o cartão avança ou recua. O gesto exige 45px de desvio
  horizontal **e** que esse desvio valha uma vez e meia o vertical — o gesto
  natural nesta página é rolar para baixo, e um calendário que mudasse de mês a
  meio de um scroll era pior do que não ter gesto nenhum. As setas ficam: um
  gesto não chega ao teclado nem a quem usa leitor de ecrã.
- **Meses dispensados de quota (ecrã 3c): a fila segue a época, não o
  calendário.** Começa em `season_start_month` e dá a volta aos doze meses. Os
  que o clube inteiro não paga (`financial_settings.quota_excluded_months`) e os
  que caem fora da época ficam **bloqueados e riscados** — ninguém os paga, e
  antes eram pastilhas normais que gravavam uma dispensa sem efeito nenhum.
  E **só o admin lhes mexe**: a ficha é de treinador e admin, mas
  `quota_exemptions` só aceita escrita de admin (RLS), por isso um treinador
  carregava numa pastilha e levava com 42501 ao gravar.
  **Uma dispensa desconta na previsão de receita.** O cliente já a respeitava
  (`getPlayerQuotaMonths`, `usePlayerQuotaDebt`), mas a previsão do Financeiro
  vem da vista `v_quota_status`, que não conhecia `quota_exemptions` e gerava
  linha com `expected_amount` para meses dispensados — corrigido a 2026-09-08
  em `supabase_quota_exemptions_reporting_migration.sql`, aplicada (2530 € →
  2420 € em produção). **Uma regra de quota escrita no cliente tem de ser
  escrita também na vista**, como já acontece com `financial_season()` e
  `getSeasonLabel()`.
- **Na Home, o próximo jogo é o título do ecrã.** A data em sobrancelha
  dourada, os dois clubes em 44px sobre a faixa verde e a linha do que falta
  vivem fora do cartão de vidro, que começa nos emblemas — é o cartão 4a, e é
  o que faz a Home abrir no jogo em vez de abrir num bloco de informação. Duas
  consequências: o herói vai **dentro** da página do carrossel (com dois jogos
  marcados, arrastar tem de mudar o título e o cartão ao mesmo tempo), e a
  `<FaixaTopo>` da Home é mais alta — 340px contra os 250px do resto —, altura
  que vem do `Layout` pela rota e não de uma segunda faixa desenhada pela Home,
  que sobreporia dois conjuntos de blocos inclinados.
- **O cartão de evento da Agenda desenha-se como o cartão do jogo da Home**:
  bandas de largura inteira separadas por uma linha — emblemas com o "VS"
  vazado a dourado, as duas horas divididas, o campo com a morada por baixo do
  nome, e o pedido de resposta na faixa dourada com "Sim, vou / Não posso". Não
  são caixas arredondadas soltas dentro de um `p-5`: o mesmo jogo aparecia de
  duas maneiras conforme o ecrã. Um emblema em falta desenha um escudo e nunca
  as iniciais — quem identifica o clube é a linha de baixo, e repeti-las era
  ler a sigla duas vezes; tirar a linha de baixo desalinhava os dois blocos
  quando só um dos clubes tem emblema.
- **A convocatória é o que está em `callups`, e mais nada — não se filtra por
  elegibilidade.** Quem foi convocado apto e ficou lesionado ou inativo antes do
  jogo continua na lista, marcado com o seu estado (`impedimento` no
  `<CallupRow>`); tirá-lo é decisão da equipa técnica, e há um botão para o
  fazer de uma vez. A persiana da Agenda tinha aqui um
  `filter(isPlayerEligible)` e as consequências foram todas medidas no jogo de
  12/09/2026: o cartão dizia "22 convocados" e a persiana 19; os 3 lesionados
  não apareciam e por isso não havia como os tirar; e a recusa de um deles
  sumia das contagens — uma resposta a menos numa base que tem nove.
  **Esconder linhas nunca é a forma de dizer que estão desatualizadas.**
- **A Agenda abre no que está por realizar** (`ESTADO_POR_OMISSAO`), não em
  "Todos": a lista é ordenada por data e a época tem meses feitos, por isso
  abrir em tudo era abrir num jogo de janeiro. Isto é o ponto de partida e não
  um filtro posto por alguém — o `temFiltros` mede-se a partir daqui, o funil
  não acende só por a app ter aberto, e o "Limpar" volta a este estado.
  **O filtro de tempo é da lista e não do calendário do mês:** o mês desenha
  `eventosDoCalendario` (todos os filtros menos o tempo) e a lista
  `filteredEvents`. Aplicá-lo aos dois apagava os pontos dos dias já passados
  do próprio mês que se está a ver, e escolher o dia de um jogo da semana
  anterior respondia "Sem eventos neste dia". Como o passado deixa de estar na
  lista, há duas saídas para ele que têm de continuar a existir: o "Ver
  realizados" ao lado do título e o vazio "Nada por realizar" — sem eles o
  histórico fica sem porta, com o filtro escondido atrás do funil.
- **A cor de um tipo de evento vive em `CORES_TIPO`**, num sítio só. O ponto do
  calendário e a pastilha do cartão diziam a mesma coisa em tons diferentes —
  o convívio era `csc-azul-texto` no ponto e `blue-300` no rótulo.
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
   **Por isso `CalendarPage`, `EventsPage`, `TeamManagementPage`, `CompeticaoPage`
   e `AdminDashboard` são importadas diretamente em `src/App.tsx`** — são as cinco que
   abrem um detalhe com endereço próprio (`?event=`, `?atleta=`, `?convocatoria=`,
   `?jogo=`, `?adversario=`, `?campo=`). O resto continua em `React.lazy`. A poupança
   perdida é pequena: o service worker da PWA já pré-carrega todos os pedaços à primeira
   visita, por isso a divisão só valia nos primeiros segundos da primeiríssima
   abertura. Arranque: ~87 kB → ~156 kB → ~161 kB comprimidos (o último salto é o
   `AdminDashboard`, que entrou em 2026-09-07 com as fichas 9h e 9i).
   **Uma página nova que abra um detalhe pelo endereço não pode ser `lazy`.**
   Sobram ~7% de falhas, que continuam a passar à segunda pelo `retries: 1`.

**A identidade de uma pessoa é o endereço de email, e mais nada.** Uma conta liga-se
à ficha que a direção criou quando — e só quando — o email do registo é igual ao
email da ficha; se não houver ficha com esse email, a conta fica por ligar e é a
direção que resolve no ecrã 3d (ou corrige o email na ficha, que resolve também
para a próxima vez). `supabase_identidade_por_email_migration.sql`, aplicada a
2026-09-07.

O email que conta é o de **`auth.users`**, verificado pelo Supabase. Nunca o de
`public.profiles`: a política de UPDATE da própria ficha só guarda `role` e
`roles`, por isso o `email` e o `phone` da própria ficha são escrevíveis pelo
cliente e não provam identidade nenhuma. Era por aí que entrava a falha que esta
migração fechou — `associate_my_profile()` aceitava também o telefone como prova,
e bastava pôr no telefone da própria ficha o número de um sócio, ir buscar o `id`
dele a `v_players_public` e chamar a função para lhe absorver a ficha (NIF, IBAN,
morada, notas médicas) e apagar a original. Saiu também a prova pelo primeiro e
último nome, que confundia homónimos.

**Consequências no cliente, para não voltarem a aparecer:** o `AutoAssociationModal`
foi apagado — com o email como chave a correspondência é certa e o `AuthContext`
liga-a sozinho, não há nada para confirmar, e o modal oferecia escolher *qualquer*
ficha do plantel. As sugestões de fusão do Plantel e as coincidências do ecrã 3d
também são só por email. **Nenhum caminho de ligação pode voltar a usar telefone
ou nome.**

**`profiles` são as pessoas do clube, não os atletas.** Há quem jogue, quem jogue
e treine, quem jogue e dirija, e quem não jogue de todo — um treinador, alguém da
direção. Uma ficha sem número de camisola nem posição **não** é uma ficha por
ligar: pode muito bem ser a de quem não entra em campo.

Isto tem consequência em dois sítios, e nos dois a regra é a mesma: **decidir só
por colunas que o próprio não pode escrever.** São elas `role` e `roles` (a
política de UPDATE da própria ficha impede mudá-los) e `jersey_number` e
`position` (no Perfil são só de leitura, e não vão no que o próprio guarda).
`birth_date` e `member_number` **não servem**, por muito que pareçam: as
Definições deixam o próprio escrevê-los, e bastava preencher o aniversário para
se deixar de ser contado. Idem telefone, fotografia e alcunha — e, desde
2026-09-08, **também o tamanho de equipamento e o pé preferido**, que passaram
a ser editáveis pelo próprio (estavam no mesmo bloco travado, e para mudar de
tamanho era preciso pedir à direção). O que fica travado no Perfil é só o que a
equipa técnica atribui: posições, funções e número de camisola.

- `public.admin_contas_por_ligar()` (`supabase_contas_por_ligar_migration.sql`,
  aplicada a 2026-09-07) alimenta o ecrã 3d. Chamava-se `admin_contas_sem_atleta()`
  e olhava a camisola, o sócio, o nascimento e a posição — listava o treinador do
  clube como "conta sem atleta". Hoje exige também que o clube nunca tenha contado
  com a pessoa: sem convocatórias, sem estatísticas, sem quotas.
- `useFichaPorLigar()` (`src/components/FichaPorLigar.tsx`) decide se o ecrã 11a
  substitui a Home. Faz o teste das colunas de graça e, só para quem passa, vai
  confirmar à rede que não há convocatórias — porque aqui um falso positivo não é
  uma linha a mais numa lista, é a app inteira que desaparece.

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
  **`tests/e2e/larguras.spec.ts` verifica-o sozinho**, de duas maneiras. A
  estrutural percorre os ecrãs todos e as persianas a 390px e a 1440px e compara
  o texto visível, a largura e o centro da coluna, e o scroll lateral, que nunca
  deve existir. A visual fotografa a coluna nas duas janelas — com a coluna à
  mesma largura dos dois lados, senão o texto quebra noutros sítios e falha
  sempre — e compara pixel a pixel, o que apanha o que muda de aspeto sem mudar
  de palavras. **Não guarda imagens de referência**: compara duas capturas do
  mesmo instante, portanto não há nada para versionar nem para atualizar quando o
  desenho mudar de propósito. Um ecrã novo acrescenta-se à lista `ECRAS`.
- Ao redesenhar um ecrã, cruzar com `Mapa de Navegação.dc.html` do handoff para
  nenhum botão ficar sem destino, e manter o vocabulário do código (posições GR–PL,
  estados Apto/Lesionado/Inativo, tipos de evento, participação na ficha de jogo).

# Model & Effort Selector

DESIGN/ARCHITECTURE → Opus 5 + xhigh
IMPLEMENTATION → Sonnet 5 + high
DEBUGGING → Opus 5 + high
REFACTOR → Opus 5 + xhigh
TESTING → Sonnet 5 + high
QUICK EDITS → Haiku 4.4 + low
DOCS → Sonnet 5 + medium
INFRASTRUCTURE → Opus 5 + high
CODE REVIEW → Opus 5 + high
MIGRATION → Fable 5.1 + high
INTEGRATION → Opus 5 + xhigh

Analyze the task and recommend /model and /effort.
