# Auditoria de design — inconsistências (2026-09-25)

Auditoria feita **ao código** (`src/`), cruzada com as convenções do `CLAUDE.md`.
Não houve inspeção visual com capturas: onde um problema só se confirma a olho, está
dito. As contagens com heurística (alvos de toque, cartões à mão) são aproximadas.
As referências `ficheiro:linha` são do commit em que este documento entrou.

Severidade:
- **Alta** — o utilizador vê comportamento diferente para a mesma situação, ou há
  algo ilegível/inacessível.
- **Média** — inconsistência visual visível.
- **Baixa** — só no código, ou quase impercetível.

---

## 1. Resumo — o que corrigir primeiro

| # | Problema | Sev. | Onde |
|---|---|---|---|
| A1 | Texto invisível: branco sobre branco / escuro sobre escuro | Alta | `EventsPage.tsx:1528`, `QuickFieldModal.tsx:90`, `QuickOpponentModal`, ícone de procura nas 3 Gestões, spinner das Estatísticas |
| A2 | O "‹" das secções do Clube acrescenta histórico; nos outros ecrãs substitui | Alta | `GestaoAdversarios.tsx:176`, `GestaoCampos.tsx:129`, `Relatorios.tsx:48`, `ClubePage.tsx:215` |
| A3 | Fichas abertas de fora (Home, Classificação, convocado) voltam para a lista errada no "‹" | Alta | `CartaoProximoJogo:123`, `PorResponder:47`, `UltimoJogo:62`, `StandingsPage:725`, `FichaConvocado:428` |
| A4 | O Perfil tem uma seta de voltar diferente de todas as outras | Média | `SettingsPage.tsx:310` |
| A5 | Apagar pede confirmação num sítio e apaga logo noutro | Alta | categorias (`FinancePage:2425`), tirar um atleta da convocatória, desmarcar quota |
| A6 | Filtros de estado à vista num ecrã e escondidos no funil noutro | Alta | Comunicados, Torneios, mosaicos do Plantel, Movimentos |
| A7 | Erros de gravação silenciosos (só `console`) ou com toast de sucesso falso | Alta | `TeamManagementPage:553`, `GestaoTorneios:188`, `MatchReportModal:392`, `EventsPage:519` |
| A8 | Vocabulário proibido ("presença", "RSVP") num toast | Alta | `CalendarPage.tsx:717-719`, `EventsPage.tsx:1025` |
| A9 | ~45 alvos de toque abaixo de 44px | Alta | ver §5.7 |
| A10 | Setas de linha: umas linhas tocáveis têm `›`, outras não | Alta | ver §3.5 |

---

## 2. Navegação e setas de retorno

### 2.1 Duas setas de voltar — Média
- **Canónica — `BotaoVoltar`** (20 sítios; todas as `EcraDetalhe` e as secções do Clube): `ChevronLeft` 16 dourado + nome do destino a 11px, `min-h-11`.
- **À mão — `SettingsPage.tsx:310-320`**: disco `bg-white/10` de 36px, chevron branco 18, texto **"Voltar"** (contraria a regra do próprio `BotaoVoltar`: o texto é o nome do destino). Faz `navigate(-1)` — aberto por link direto, sai da app. O ecrã filho (`PreferenciasAvisos:249`) usa a canónica, e por isso pai e filho têm setas diferentes.

### 2.2 O "‹" mexe no histórico de duas maneiras — Alta
- **`replace` (maioria)**: `CalendarPage:328`, `EventsPage:1172`, `MatchReportsPage:229`, `TeamManagementPage:466`, `ContasPorAtleta:203`.
- **`push`**: `GestaoAdversarios:176`, `GestaoCampos:129`, `Relatorios:48`, `ClubePage:215` (voltar ao índice).
  Com `push`, depois de tocar "‹", o retroceder do browser **reabre** a ficha/secção de onde se saiu. Todas as ocorrências estão no Clube.

### 2.3 "‹ X" e o retroceder do browser levam a sítios diferentes — Alta
Fichas abertas **de fora** da sua lista têm um destino fixo no "‹":

| Aberta de | Abre | "‹" diz | Retroceder leva a |
|---|---|---|---|
| Home (próximo jogo, por responder) | `/calendar?event=` | Agenda | Home |
| Home (último jogo), Classificação | `/competicao?ver=fichas&jogo=` | "Fichas" (o separador chama-se "Fichas de Jogo") | Home / Classificação |
| Ficha do convocado | `/team-management?atleta=` | Plantel | o evento |
| Agenda, alerta sem convocatória | `/events?convocatoria=` | Eventos | Agenda |

As fichas abertas por estado dentro da app já calculam o `voltarPara` (`EventsPage:2246`, `TeamManagementPage:1475`) — é esse o padrão a generalizar (p. ex. `?de=home`).

### 2.4 Destinos do índice do Clube sem caminho de volta — Alta
As secções `?ver=` têm "‹ Clube"; as linhas do mesmo índice que são rotas (`/team-management`, `/events`, `/finance`) não têm. `/events` nem tem cabeçalho (`EventsPage.tsx:1218`).

### 2.5 Cabeçalhos — Média
- Sem `CabecalhoEcra`: Eventos (nenhum), Perfil (`SettingsPage:323`, nome a 26px sem `h1`), Home (`h2` 44px, sobrancelha copiada à mão em `CartaoProximoJogo:143`).
- `ClubePage.tsx:35-40` define `sobrancelha` em cada secção e a linha 279 nunca a passa — dado morto; as secções não têm sobrancelha e as fichas irmãs têm.
- Sobrancelhas das fichas: "Ficha oficial de jogo", "Convocatória", "Relatórios" (repete o "‹ Relatórios" logo acima), e nenhuma no evento/atleta/adversário/campo.
- O mesmo evento tem título "CSC vs ADV" na Agenda (`CalendarPage:1893`) e `event.title` nos Eventos (`EventsPage:2024`).
- Criar: "Novo evento / Novo jogo", "Novo membro / Criar ficha", "— / Novo torneio", "— / Novo encargo". Editar é consistente ("Editar …").

### 2.6 Fechar persianas e diálogos — Média (Alta onde < 44px)

| Onde | X | Alvo |
|---|---|---|
| `BottomSheet:298` | 20 | 44px, `rounded-xl` |
| `Modal:124` | 16 | 44px, `rounded-full` com aro |
| `Modal:152` (cabeçalho simples) | 20 | **36px** |
| Gestão Adversários/Campos, Comunicados | 18 | 44px |
| `QuickFieldModal:75`, `QuickOpponentModal:85` | 20 | **32px** |
| `ToastContext:114` | — | **~19px** |

- O `BottomSheet` tem **dois botões chamados "Fechar"** (a pega em `:274` e o X).
- `tone`: os filtros da Agenda/Eventos/Estatísticas/Fichas são `dark`; os do Plantel (`TM:1167`) e das Contas (`CPA:361`) ficam no tom claro — a mesma persiana de filtros com dois aspetos.
- Só 2 de ~10 diálogos usam `<Modal>`; 9 painéis estão feitos à mão (`ConfirmModal`, `UnsavedChangesModal`, `ResendCallupsModal`, `QuickField`, `QuickOpponent`, Gestão Adversários/Campos, …). É daí que vêm os botões e X diferentes.
- Títulos de diálogo: `h2 text-sm` / `h3 text-base` / `h3 text-lg`; Title Case ("Criar Novo Adversário") ao lado de frase ("Novo torneio").

### 2.7 Onde fica o "Guardar" — Média
- Preso ao fundo (`bottom-[108px]`): Convocatória, Ficha de jogo, Encargo.
- No fim do formulário: Evento, Torneio (**lista longa de inscritos — devia ser preso**), Atleta (longo), Avisos, Dados do clube, Perfil, Comunicado.
- Abaixo de 44px: `FinancePage:2116` (movimento), `:2394` (Guardar Definições, nem é largura inteira).
- `ConvocatoriaAoCriar` tem "Agora não" (`:162`) **e** "‹ Eventos" (`:176`) — o CLAUDE.md diz que um substituiu o outro.
- `LeagueManager` é um `EcraDetalhe` aberto por estado local (`GestaoTorneios:785`): sem link, e o retroceder sai da página.

---

## 3. Submenus, separadores, filtros e listas

### 3.1 Separadores — Baixa/Alta
- `FilaSeparadores` só em Competição (completa, com `tabpanel`) e Financeiro (sem `idPainel` → sem `aria-controls`).
- **Controlos segmentados feitos à mão, usados como filtro de estado e à vista** — Alta:
  - `AnnouncementsPage:460-500` — cor do ativo muda por opção (dourado / verde / branco), sem `aria-pressed`.
  - `GestaoTorneios:300-316` — ativo `bg-white`, rótulos crus da base ("ativo", "agendado") em `capitalize`.
- **Mosaicos de estado como filtro**: `QuorumFilterCards` tem "Todos"; a cópia à mão em `TeamManagementPage:1094` não tem (limpa-se tocando outra vez), e no Plantel o mesmo estado aparece três vezes (mosaico aceso, funil aceso, linha de resumo).
- Classificação: "Agendados e ativos ↔ Histórico" é um filtro em texto dourado fora do funil (`StandingsPage:293`).

### 3.2 Pastilhas — Média
- `Pastilha` mete sempre `aria-pressed`, também quando é navegação (torneio/fase/jornada em `StandingsPage:312,359,537`).
- Etiquetas de estado à mão em vez de `CHIP_*`: `GestaoTorneios:347`, `AnnouncementsPage:579`.
- "Rascunho": `EventsPage:1916` ("Rascunho / Inativo", `rounded-md 10px`) vs `MatchReportsPage:507` (`rounded-full 8.5px uppercase`).

### 3.3 Procura + funil — Alta
- **Seguem o padrão**: Agenda, Eventos, Fichas, Plantel, Contas por atleta (Estatísticas só funil, como documentado).
- **Desviam**:
  - Comunicados — sem funil, filtro à vista, campo `h-11 rounded-[13px]`, "Pesquisar...".
  - Gestão Adversários/Campos/Torneios — ícone de procura `text-white/62` **sobre campo branco** (invisível); [+] no lugar do funil; X de limpar < 44px; "Pesquisar…" (o resto diz "Procurar…").
  - Financeiro — Quotas e Encargos sem procura; Movimentos com `<select>` de mês/ano à vista, sem resumo nem "Limpar".
- **O que acende o funil**: Agenda/Eventos/Fichas/Plantel contam o texto da procura; Contas não conta; o Plantel conta a **ordenação** (que não é filtro).
- Resumo sem contagem em Contas (`CPA:267`); Fichas diz "Por torneio" sem dizer qual.
- Procura dentro da convocatória na Agenda (`CalendarPage:2359`, ~30px, "Limpar Filtro"); a mesma lista nos Eventos não tem procura.

### 3.4 Cabeçalhos de secção e grupos — Média
Cinco estilos para "etiqueta de secção":
1. `EtiquetaSeccao` — `9.5px 0.18em /62` (≈10 ficheiros).
2. `ETIQUETA_GRUPO` e o próprio CLAUDE.md — `0.16em /70` (contradiz o primitivo).
3. `ETIQUETA_SECCAO` do Financeiro — `0.14em` dourado (copiado em `FinancePage:2150`, `TM:1054`, `StatsPage:85`).
4. Etiquetas das persianas de filtros — `9px bold 0.1em /60` (Agenda, Eventos) vs `9px extrabold 0.14em /62` (Fichas, Estatísticas, Plantel, Contas).
5. Estilo antigo `text-xs font-black uppercase tracking-wider` — ~16× em `TeamManagementPage`, `GestaoTorneios`, `FinancePage:2283`.

Grupo "caixa única com banda" — fundo da banda varia: `/[0.07]` (Quotas, Despesas, Plantel, Contas), `/[0.09]` (Pag. Programados), `/[0.055]` dourado (Visão Geral), `/[0.05]` (Encargos). **Ainda no padrão antigo**: Movimentos (`FinancePage:2272`, com `emerald-400/red-400`), Plantel em vista de cartões, as três Gestões (cartões irmãos dentro de um cartão).

### 3.5 Linhas de lista — Alta/Média
- **Seta `›` em linha tocável**: tem em Pag. Programados, Eventos, Clube, Relatórios; **não tem** na Agenda, Plantel, Contas, Gestões; Fichas usa "Ver ficha ›". Mesma ação, sinal diferente.
- Bola da camisola feita à mão em 5 sítios (`StatsPage:601` w-6, `CallupRow:51` w-7, `GestaoTorneios:721` w-9, `MatchReportModal`…), com três vazios diferentes (`-`, `—`, `–`).
- Altura de linha `min-h-12` / `min-h-11` / sem mínimo / `min-h-9`; fios `/8` e `/7`.
- Cartões de Eventos feitos à mão (`EventsPage:1903`, `border-2 shadow-2xs`).

### 3.6 Carregamento e vazio — Média
- Rodopios: 4 variantes; o das Estatísticas é `border-csc-dark` (verde-escuro sobre fundo escuro — quase invisível); Classificação só texto; Gestões sem estado de carregamento; só a Agenda anuncia a leitores de ecrã.
- Vazios: a Agenda é a referência (`cartao-simples` tracejado, ícone 32, texto que conhece os filtros). Plantel e Fichas usam `bg-csc-dark` com ícones 48/42; **as Fichas dizem "sem jogos" mesmo com filtros ativos**; Estatísticas numa linha em itálico; Financeiro texto simples.
- Tratamento: "Tente alterar…", "Ajuste os filtros" (você) ao lado de "Tenta…", "Limpa…" (tu).

---

## 4. Comportamentos

### 4.1 Apagar — Alta
- Com `ConfirmModal` (15 sítios): eventos, adversários, campos, torneios, equipas, jogos, encargos, pagamentos, movimentos, comunicados, membros, fusão, limpar convocatória.
- **Sem confirmação**: categorias de despesa (`FinancePage:2425` → `:917`, pode deixar movimentos órfãos), tirar **um** atleta da convocatória (`CallupRow:157`, `FichaConvocado:421`) — mas tirar **todos** pergunta —, e desmarcar um mês de quota (apaga a linha de `dues`).
- Botão de confirmar: "Sim, eliminar X" / "Sim, Eliminar Evento" / "Apagar" / "Confirmar" (sem `confirmText` nos 5 do Financeiro, Classificação, Liga).
- Só os Comunicados mostram o rodopio durante o apagar; os outros fecham antes do `await` (duplo toque possível).

### 4.2 Retorno depois de uma ação — Alta/Média
- **Erros ignorados**: treinos (`TM:553`), inscritos do torneio (`GestaoTorneios:188`), `stats` (`MatchReportModal:392`), `lib/jornadaDoJogo.ts:59,91`.
- **Sucesso falso**: `EventsPage:519` engole o erro e diz "Evento ativado com sucesso!".
- Sem toast: remover equipa da liga; ficha de jogo só com faixa inline. Falhas a carregar em Fichas/Estatísticas/Ficha de jogo só em `console` (em inglês) — ecrã fica vazio.
- **Vibração dupla**: o `toast` já vibra (`ToastContext:47`), e `FinancePage:642,660,775` e `StandingsPage:223,250` chamam `triggerHaptic('success')` antes. A regra do CLAUDE.md ("haptic + toast") está desatualizada.
- Mensagens: "Erro ao…" (~70) vs "Não foi possível…" (~10); o `error.message` do Supabase (inglês) é colado em quase todos os toasts; fallbacks "Erro" / "Erro desconhecido" / "erro inesperado" / "Verifique a base de dados"; "você" em `EventsPage:491,775,984`, `SettingsPage:294`, `TM:777,863,2132`.

### 4.3 Guarda de alterações — Média
Sem guarda: registar/corrigir pagamento (`FinancePage:1808,1837`) — a edição de resultado na Classificação, equivalente, tem.

### 4.4 Gravar — Média
- Texto durante a gravação: "A guardar…" (8) / "A guardar..." (7) / "A enviar dados..." / "A processar…" / "A registar..." / "A criar...".
- Sem estado de gravação nem `disabled`: Dados do clube, Campos, resultado na Classificação, pagamentos do Financeiro; Atleta só desativa durante o upload.
- Validação: `required` nativo do browser em uns, `toast.warning` noutros, e **os dois ao mesmo tempo** (o toast nunca aparece) em Dados do clube, Campos, Adversários, Torneios.
- Perfil mostra faixa inline **e** toast.

### 4.5 Acessibilidade das linhas — Alta
`div onClick` sem `role`/teclado em `TeamManagementPage:2859` (escolher a conta a ligar) — proibido pelo CLAUDE.md.

### 4.6 Datas, horas, euros — Média/Baixa
- Data de evento em ≥7 formatos; `formatDataCurta` usado uma vez. Hora "18h30" no prazo de resposta vs "18:30" no resto.
- `fmtData` (2 usos) vs `new Date(x).toLocaleDateString` em Financeiro/Perfil/Plantel (é o bug de fuso que o `fmtData` evita).
- `fmtEuro` reimplementado em `SinalPagamentos`, `OsMeusPagamentos`, `SettingsPage`.

### 4.7 Vocabulário
- **Alta**: "Estado de presença atualizado!" e "Erro ao atualizar RSVP" (`CalendarPage:717-719`); "Estado atualizado para: Confirmado/Recusado/Convocado" (`EventsPage:1025`) — a mesma ação com duas frases, nenhuma com "Disse que sim/não".
- Apagar (13) / Eliminar (20) / Remover (4): "Apagar evento" nos Eventos vs "Eliminar evento" na Agenda; o botão "Eliminar comunicado" abre um "Apagar este comunicado?".
- "Tirar da convocatória" vs "Remover da convocatória"; "Jogador removido" vs "Atleta adicionado".
- "Guardar" (23) vs "Gravar e Sair" / "Gravar assim"; "Atualizar campo/adversário" vs "Guardar alterações".
- Sem brasileirismos. 

---

## 5. Primitivos, cores e tipografia

### 5.1 Cartões — Alta
`<CartaoVidro>` 6× e `<CartaoSimples>` 15×; a classe `cartao-simples`/`cartao-vidro` escrita à mão ~115×; mais **~96 cartões inventados** com 34 combinações de raio/padding/borda (`TeamManagementPage` 36). Nenhum bate com os tokens.

### 5.2 Botões — Alta
`<Botao>` 47× vs 223 `<button>` estilizados à mão.
- "Guardar": 7 aspetos (incl. `bg-blue-600` na Liga, `bg-emerald-600` e `hover:bg-amber-400` nos Eventos, `bg-csc-dark` nos diálogos rápidos).
- "Cancelar": 5 aspetos. "Apagar": 7 aspetos — só 1 usa `<Botao aparencia="perigo">`.

### 5.3 Campos de formulário — Alta
`<CampoEntrada>` só no login; o estilo `CAMPO` (46px, `rounded-[14px]`) está **copiado 13 vezes** como constante local. Dez estilos de campo diferentes — o pior é o `GestaoTorneios:499-544` (14 campos transparentes de ~32px). Três estilos de rótulo. Três interruptores feitos à mão (um `bg-emerald-600`).

### 5.4 Cores fora dos tokens — Alta
163 classes da paleta Tailwind (amber 63, red 45, emerald 30…). Piores: bloco de admin do Perfil (`SettingsPage:410-751`, todo âmbar), paleta dos gráficos (`FinancePage:145`), receitas/despesas a `emerald-400/red-400`, toasts, badges de tipo nos Eventos (`bg-blue-600/emerald-700/purple-700` — o CLAUDE.md diz que a cor do tipo vive em `CORES_TIPO`). Hex solto em `ContasPorAtleta:84`, `SoccerPitchSelector:39`, `SettingsPage:327`.
**Branco sobre branco**: `EventsPage.tsx:1528` — os dias da semana por escolher na recorrência são ilegíveis (confirmado).

### 5.5 Prefixos responsivos mortos — Média
70 `sm:/md:/lg:` ainda no código (Eventos 13, Ficha de jogo 12, Agenda 11). Não geram nada, mas escondem a intenção (p. ex. `text-3xl sm:text-4xl`).

### 5.6 Tipografia — Média
25 tamanhos arbitrários `text-[Npx]`. Títulos de ecrã: 36 / 26 / 22 / 2xl. Números grandes: `NumeroGrande` (28) usado 2×, e à mão 22/24/26/30. Títulos de linha: 11/12/12.5/13/sm.

### 5.7 Alvos de toque < 44px — Alta
~45 elementos; `.alvo-toque` usado 3×. Incluem: fechar do `Modal` simples (36), diálogos rápidos (32), toast (19), `+/−` das estatísticas na ficha de jogo (36), interruptores dos Comunicados (24), dias da semana da recorrência, apagar linha nas Gestões, `LeagueManager:250`, `SoccerPitchSelector:131`, chips "+ jogador" (`EventsPage:2172`).

### 5.8 Ícones — Baixa
Editar com 4 glifos (`Pencil`, `Edit`, `Edit2`, `Edit3`); X em 7 tamanhos; `Trash2` em 4; `ChevronRight` em 5; `Plus` e `Check` em 8.

---

## 6. Proposta de correção por vagas

| Vaga | Âmbito | Esforço | Porquê primeiro |
|---|---|---|---|
| **1 — Defeitos** | A1, A7, A8, `div onClick`, alvos < 44px dos X de fechar, validação dupla | S | Coisas partidas ou ilegíveis; cada uma é local |
| **2 — Navegação** | `replace` no Clube, `voltarPara` por origem (`?de=`), "‹ Clube" nas rotas do índice, seta do Perfil → `BotaoVoltar`, sobrancelhas, "Agora não" duplicado, `LeagueManager` no endereço | M | É a queixa principal: mesma situação, comportamento diferente |
| **3 — Regras de ação** | Confirmação para apagar em todo o lado (ou toast de anular nos toggles), rótulos do `ConfirmModal`, Apagar/Eliminar/Remover → um verbo, "A guardar…", vibração dupla, mensagens de erro sem `error.message` cru | M | Consistência de comportamento |
| **4 — Primitivos em falta** | `<Campo>`/`<Selecao>`/`<Interruptor>`/`<BotaoIcone>` (44px) em `components/ui`; `<EstadoVazio>`/`<ACarregar>`; todos os diálogos por `<Modal>`; uma só `EtiquetaSeccao` | L | Sem isto as vagas seguintes voltam a divergir |
| **5 — Migração** | Filtros de estado para o funil (Comunicados, Torneios, Movimentos, mosaico do Plantel), grupos "caixa com banda", seta `›` em todas as linhas tocáveis, cores para tokens, `sm:` fora, formatadores únicos | L | Feita ecrã a ecrã, como o CLAUDE.md manda |

## 7. Decisões (2026-09-25)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Verbo destrutivo | **Eliminar** — em botões, títulos de confirmação e toasts ("Apagar" e "Remover" saem) |
| 2 | `›` em linhas tocáveis | **Nunca** — o cartão/linha basta; sai dos Eventos, Clube, Relatórios e Pagamentos Programados. O `ChevronDown` de expandir fica |
| 3 | Tirar um atleta, desmarcar quota | **Faz logo, com "Anular" no toast** — sem confirmação |
| 4 | "‹" de ficha aberta de fora | **Volta à origem** (Home, Classificação, o evento), como o retroceder do browser |

## 8. Estado

- **Vaga 1 — feita** (texto ilegível, erros silenciosos, vocabulário, `div` clicável, X de fechar < 44px).
  Ficou para a vaga 3 a validação dupla (`required` + toast), por ser uma regra de comportamento e não um defeito.
