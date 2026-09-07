# Ecrãs por desenhar — CSC Veteranos

Estado em 2026-09-07. O redesenho de 2026 cobriu **49 dos 58 ecrãs** do handoff
(`Redesign UI app futebol veteranos/design_handoff_app_veteranos/Ecrãs Jogador.dc.html`).
Faltam **nove**. Este documento é o que precisas de saber para os desenhar sem
inventar dados que a app não tem.

---

## Antes de desenhar: as regras desta app

Não são preferências — são restrições que o código já impõe e que o desenho
tem de respeitar.

**Uma só UI, a de telemóvel.** Num ecrã largo é a mesma app numa coluna de
**480px** ao meio. Não há layout de desktop, e os pontos de corte responsivos
do Tailwind estão **desligados** (`--breakpoint-*: 9999px`): um `sm:grid-cols-2`
não gera nada. Desenha para 393px de largura útil e mais nada.

**Todos os alvos de toque têm no mínimo 44px de altura.** Sem exceções —
pastilhas, separadores, botões de linha, ícones clicáveis.

**Paleta.** Fundo `#0e1011`. Superfícies: verde escuro `#164f16`, verde
`#009662`, dourado `#e3c04d`, azul `#005296`, vermelho `#ef3223`. Para texto
sobre o fundo escuro, porque as de superfície são escuras de mais para uma
frase: verde `#4ecf9d`, azul `#7fb3e0`, vermelho `#f08a7f`. Tinta sobre
dourado: `#121415`. Tipo de letra: **Archivo**, pesos 500–900.

**Ícones:** `lucide-react`, traço fino. **Sem emoji** — desenham-se de forma
diferente em cada telemóvel e os leitores de ecrã leem-nos por extenso ("quadrado
grande amarelo" para 🟨). Um cartão amarelo é um `<span>` com fundo dourado e um
texto escondido a dizer o que é.

**Primitivos que já existem** (`src/components/ui`): `CartaoVidro` (o cartão
principal de um ecrã, translúcido), `CartaoSimples` (listas e blocos), `Botao`,
`Pastilha`, `CabecalhoEcra`, `EtiquetaSeccao`, `FilaSeparadores`, `AvatarPerfil`,
`CampoEntrada`. Mais `BottomSheet` (persiana), `Modal`, `ConfirmModal`.

**Detalhe é persiana, e vai no endereço.** Ver uma entidade abre uma
`BottomSheet` e põe o item no endereço (`?event=`, `?atleta=`, `?jogo=`) — há
link próprio e o retroceder do browser fecha. Modais ficam para inserções
curtas.

**Vocabulário do código**, que o desenho deve usar: posições GR, DCE, DCD, LD,
LE, MDC, MCO, ME, MD, PL. Estados **Apto / Lesionado / Inativo**. Tipos de
evento **Jogo / Treino / Convívio**. Convocatória: **Confirmado / Recusou / Sem
resposta**.

---

## Uma lacuna de dados que atravessa dois destes ecrãs

**As presenças nunca são registadas.** A tabela `attendances` existe
(`id, event_id, player_id, present, excuse_reason`), é lida num sítio
(`src/pages/Home.tsx:184`, para o número "Presenças") e **nunca é escrita em
lado nenhum da app** — zero `insert`, zero `update`. Está vazia: 0 linhas em
produção. O número de presenças na Home mostra sempre um traço.

O que existe de facto é a **resposta à convocatória**: `callups.status` com
`called` / `confirmed` / `declined`, 1252 linhas em produção. Isso é intenção
antes do jogo, não presença depois dele.

Isto afeta o **4a** (que o handoff desenha com "P P F P P — últimos 5 jogos") e
qualquer ideia de estatística de assiduidade. Há duas saídas, e é uma decisão
de produto, não de desenho:

- **Desenhar com o que existe:** mostrar as últimas cinco *respostas* à
  convocatória, e chamar-lhes isso. Honesto, sem trabalho de backend.
- **Desenhar a presença a sério:** implica um fluxo novo de marcar presenças no
  dia do jogo, que não existe em ecrã nenhum do handoff.

---

## Os nove ecrãs

### 4a · Toque num convocado
**Prioridade: alta.** É de uso diário para quem gere.

**O handoff mostra:** uma persiana sobre a convocatória, com a tira de
convocados no topo (números, com o escolhido em destaque). Dentro: número,
posições, nome completo, estado (Apto), a resposta com a hora ("Confirmou
presença · ontem, 21:14"), **PRESENÇAS** (P P F P P, últimos 5 jogos),
**DISCIPLINA** (2 amarelos, 0 vermelhos, "sem suspensão"), o telefone com
**Ligar** e **WhatsApp**, e as ações: ✓ Confirmado, ✕ Recusou, Remover da
convocatória, Abrir ficha completa →.

**O que existe hoje:** `src/components/callups/CallupRow.tsx` — a linha do
convocado, com o número numa bolha, o nome, as posições e quatro botões de
ação de 44px (confirmar, recusar, repor sem resposta, remover). **A linha não
abre nada**: não há ficha rápida.

**Dados disponíveis:**
- Resposta: `callups.status`, `callups.created_at`, `callups.notes`.
  ⚠️ Não há coluna com o instante da *resposta* — o `created_at` é de quando
  foi convocado. O "ontem, 21:14" do handoff não existe sem uma coluna nova.
- Disciplina: `stats.yellow_cards`, `stats.red_cards` por jogo (11 linhas em
  produção — pouca história).
- Suspensões: `tournament_suspensions` (`player_id, tournament_id, reason,
  status`) — existe e é escrita pelo lançamento de vermelho na ficha de jogo,
  mas está **vazia** em produção.
- Contactos: `profiles.phone` (25 de 28 fichas preenchidas). ⚠️ **RLS:** só a
  equipa técnica e o próprio leem `profiles`; os colegas leem
  `v_players_public`, que **não tem telefone**. Como este ecrã é de quem
  convoca (coach/admin), o telefone está acessível — mas o desenho não pode ser
  reaproveitado para o jogador comum.
- Presenças: ver a lacuna acima.

**Decisões em aberto:**
1. Presenças ou respostas? (ver a secção acima)
2. Vale a pena a tira de convocados no topo para saltar entre atletas, ou
   fecha-se e abre-se o seguinte? A tira é bonita mas obriga a carregar a
   convocatória inteira.
3. "Confirmou presença · ontem, 21:14" precisa de uma coluna nova
   (`callups.responded_at`). Desenhar com ou sem?

---

### 4e · Agenda, com o evento em falta
**Prioridade: alta.** Fecha o par com o alerta que já existe.

**O handoff mostra:** na Agenda, o evento sem convocatória sobe para o topo num
cartão destacado: data grande, "CSC vs Sesimbra", "18:00 · Liga Setúbal",
**"Ninguém foi convocado"**, a linha "Sem convocatória o plantel não recebe
pedido de resposta", e um botão **Convocar**. Por baixo, "ESTA SEMANA" com os
eventos normais, cada um com "16 convocados · 11 sim" ou "18 convocados · 7 sem
resp.". O handoff é explícito: *"na Agenda o evento em falta fica marcado, sem
alarme — o aviso a 6 dias é o alerta flutuante do 4c"*.

**O que existe hoje:** `src/pages/CalendarPage.tsx` — os cartões de evento
(`renderEventCard`, ~linha 2000) mostram tipo, confronto, concentração/início,
local. **Não mostram quantos foram convocados nem quantos responderam**, e não
há marca nenhuma para "sem convocatória". Confirmado: zero ocorrências.

O alerta flutuante (4c/4d) **já está feito** —
`src/components/AlertaSemConvocatoria.tsx`, na Home de quem gere.

**Dados disponíveis:** tudo. `callups` por `event_id`, com `status`. Basta uma
consulta agregada.

**Decisões em aberto:**
1. O contador "16 convocados · 11 sim" aparece a toda a gente ou só a quem
   gere? Um jogador saber que 7 ainda não responderam é informação útil ou
   ruído?
2. O cartão em falta sobe ao topo, ou fica na ordem cronológica com a marca?
   O handoff mostra-o em cima, fora da lista.

---

### 9h · Adversário — ver e editar
**Prioridade: média.**

**O handoff mostra:** cabeçalho com a sigla numa bolha, nome, campo principal.
Três números: **JOGOS 3 · V 1 · E 1 · D 1**. Cartão **CAMPO PRINCIPAL** com
botão "Mudar". **TORNEIOS E POSIÇÕES**: uma linha por prova com a posição
final ("1º Liga Setúbal · 25/26 · a decorrer · 17 pontos", "3º · 24/25 ·
terminada", "1/4 Taça · quartos de final"). **JOGOS ENTRE NÓS**: os confrontos
com resultado, data, prova e casa/fora. No fim, **Editar adversário** e
**Eliminar adversário**, com a nota "não se pode eliminar um adversário com
jogos registados — nesse caso só se edita".

**O que existe hoje:** nada. Um adversário edita-se num diálogo
(`src/pages/AdminDashboard.tsx`, separador `?ver=opponents`) e não tem ficha.

**Dados disponíveis:**
- Identidade: `opponents` (`name, initials, logo_url, contact_name,
  contact_phone, home_field_id`). ⚠️ Só **2 adversários** em produção.
- Confrontos: `events` com `opponent_id`, `home_score`, `away_score`,
  `home_away`, `tournament_id`. É daqui que sai o V/E/D.
- Posições em torneios: `tournament_teams` + `tournament_matches`. ⚠️
  `tournament_matches` está **vazia** (0 linhas): a classificação por prova não
  tem com que ser calculada hoje. O "1º · 17 pontos" fica em branco até alguém
  lançar jornadas.

**Decisões em aberto:**
1. Com `tournament_matches` vazia, o bloco "Torneios e posições" desenha-se na
   mesma (vazio, com uma frase) ou fica de fora até haver dados?
2. "Mudar campo principal" abre o quê — um `select` na própria ficha, ou a
   folha de escolher campo?

---

### 9i · Campo — ver e editar
**Prioridade: média.**

**O handoff mostra:** etiqueta "★ CAMPO DO CLUBE" quando é o de casa, nome,
localidade, um mapa (com o estado "mapa por carregar"), **Ver no mapa** e
**Copiar morada**. **PRÓXIMOS EVENTOS AQUI**: data em coluna, tipo/confronto,
hora e prova. No fim, **Editar campo** e **Eliminar campo**, com a nota "o
campo do clube não se elimina sem escolher outro em Clube".

**O que existe hoje:** nada. Edita-se num diálogo
(`AdminDashboard`, `?ver=fields`).

**Dados disponíveis:**
- `fields` (`id, name, address`). ⚠️ Só **2 campos** em produção, e o `address`
  pode ser vazio.
- Próximos eventos: `events.field_id`. 52 eventos em produção.
- Campo de casa: `club_settings.home_field_id`.
- ⚠️ **Não há mapa embebido.** A app abre o Google Maps por URL
  (`getGoogleMapsUrl` em `CalendarPage`), sem chave de API nem componente de
  mapa. O quadrado de mapa do handoff seria um trabalho novo (e uma chave a
  pagar). O desenho deve assumir que não há mapa, ou marcar isso como decisão.

**Decisões em aberto:**
1. Mapa embebido ou só o botão que abre o Maps? (implica custo e chave)
2. "Copiar morada" faz sentido quando 1 dos 2 campos não tem morada?

---

### 5c · Tesouraria (só direção)
**Prioridade: média-baixa.** Sobrepõe-se ao que já existe.

**O handoff mostra:** um ecrã curto: **SALDO EM CAIXA 1 019,00 €**, três
números (Recebido +2 080 €, Despesas −1 061 €, Em atraso 120 €), dois
separadores (Quotas · Movimentos). Em Quotas: "SETEMBRO · 18 ATLETAS · 15 em
dia", e uma linha por atleta com o estado e um botão **Receber** para quem
está em atraso. Depois "Ver os 18 atletas →". Em baixo, **ÚLTIMOS
MOVIMENTOS**.

**O que existe hoje:** a página financeira completa
(`src/pages/FinancePage.tsx`, `/finance?ver=…`) com seis separadores — Visão
Geral, Quotas, Encargos, Despesas/Receitas, Movimentos, Definições. Tudo o que
o 5c mostra já lá está, mais completo.

**Dados disponíveis:** tudo. `v_financial_movements` e `v_quota_status` (a
matriz jogador × mês, o único sítio onde existe a quota **por pagar** — em
`dues` só há linha para as pagas).

**Decisão em aberto — e é a principal:** o 5c é um ecrã novo ou uma **entrada
mais curta** para o que já existe? O handoff põe-no no Clube, ao lado dos
outros destinos; a app hoje tem lá "Financeiro e quotas", que abre a página
completa. Desenhar um segundo ecrã de tesouraria cria dois sítios para a mesma
verdade. Alternativa: o 5c é a Visão Geral (8a) com um caminho mais curto.

---

### 6b · Gestão (treinador e direção)
**Prioridade: média-baixa.** Sobrepõe-se ao Clube.

**O handoff mostra:** sobrancelha "TREINADOR", título "Gestão", e por cima de
tudo **"3 COISAS A TRATAR"** com o primeiro em destaque ("1 jogo sem
convocatória · Sesimbra, sábado · faltam 6 dias"). Depois três blocos: **EQUIPA**
(Convocatórias "13 confirmados · 7 sem resposta", Eventos, Plantel "18 atletas ·
1 lesionado"), **COMPETIÇÃO** (Torneios "2 a decorrer · jornada 8 por lançar",
Fichas de jogo "1 por preencher"), **CLUBE** (Tesouraria, Comunicados) com
🔒 SÓ DIREÇÃO.

**O que existe hoje:** `src/pages/ClubePage.tsx` — o Clube, com os mesmos
destinos organizados em Equipa e Gestão, e já com contagens ("18 atletas", "2 a
decorrer"). O que **não** tem é o bloco "coisas a tratar" com as pendências.

**Dados disponíveis:**
- Eventos sem convocatória: já calculado em
  `src/components/AlertaSemConvocatoria.tsx` (`useEventosSemConvocatoria`).
- Convocatórias por responder: `callups.status = 'called'` nos eventos futuros.
- Fichas por preencher: `events` do tipo `match` já passados com `home_score`
  nulo.
- Jornada por lançar: `tournament_matches` com `status != 'finished'`. ⚠️
  tabela **vazia**.
- Quotas em atraso: `v_quota_status`.

**Decisão em aberto:** o 6b substitui o Clube para quem gere, ou é um bloco de
pendências **dentro** do Clube que já existe? A segunda hipótese evita dois
ecrãs quase iguais e é pouco trabalho: o Clube ganha "3 coisas a tratar" no
topo. A primeira é mais fiel ao handoff mas duplica a lista de destinos.

---

### 11a · Conta criada, ficha por ligar
**Prioridade: depende de como as contas nascem.**

**O handoff mostra:** "Bem-vindo, Nuno", um cartão grande **"À espera da
direção"** com a explicação ("a tua conta está criada, mas ainda não está
ligada a uma ficha de atleta. Enquanto isso não acontecer, não recebes
convocatórias nem apareces no plantel"), um botão **Preencher o meu perfil**, e
**ENTRETANTO PODES**: ver a agenda e as classificações, completar os dados e
documentos, ler os comunicados.

**O que existe hoje:** nada. Quem se regista e não tem ficha vê a app normal,
sem convocatórias e sem explicação. Existe o `AutoAssociationModal`, que salta
quando a app *encontra* uma correspondência por email — mas quando não
encontra, não há mensagem nenhuma.

**Dados disponíveis:** um perfil sem dados de atleta é o que a RPC
`admin_contas_sem_atleta()` já identifica: sem `jersey_number`, sem
`member_number`, sem `birth_date` e sem `position`. A mesma condição serve do
lado do próprio.

**Decisão em aberto:** com que frequência isto acontece? Se a direção cria as
fichas antes de as pessoas se registarem, é raro. **Tu sabes melhor do que eu**
— se for raro, este ecrã vale pouco.

---

### 11b · Agenda sem nada marcado
**Prioridade: média.** Barato e nota-se.

**O handoff mostra:** o calendário do mês vazio, "Nada marcado ainda" com "o
próximo jogo ou treino aparece aqui assim que a equipa técnica o criar", e —
este é o ponto — um cartão **🎂 Aniversários deste mês** ("Tiago a 6, Paulo a
22"), com a nota: *"mesmo sem eventos, a agenda mostra os aniversários do
plantel — não fica uma página em branco"*.

**O que existe hoje:** `src/pages/CalendarPage.tsx:1823` — um vazio genérico:
"Nenhum evento encontrado. / Limpa os filtros, ou marca alguma coisa no [+]".
Não há aniversários na Agenda (zero ocorrências).

**Dados disponíveis:** `v_players_public.birth_date` — 25 das 28 fichas
preenchidas. A **Home já mostra aniversários** (`src/pages/Home.tsx`), com o
código feito; é reaproveitável.

**Decisão em aberto:** os aniversários aparecem só quando a agenda está vazia,
ou sempre? Se sempre, competem com os eventos; se só no vazio, o ecrã muda de
conteúdo conforme o mês, o que pode confundir.

---

### 11c · Clube no primeiro dia
**Prioridade: baixa.** Provavelmente já não se aplica.

**O handoff mostra:** "PRIMEIRA VEZ · Vamos montar a época", quatro passos
numerados com estado (Dados do clube ✓, Campo do clube, Plantel "nenhum atleta
ainda", Torneio e quotas), "podes fazê-los por qualquer ordem", e um aviso de
que "as quotas começam a contar quando definires a época e o valor mensal".

**O que existe hoje:** nada.

**Dados disponíveis:** contagens simples de `profiles`, `fields`, `tournaments`
e `financial_settings`.

**Decisão em aberto:** este clube tem **28 fichas, 52 eventos, 2 campos e a
época montada**. O ecrã só se veria numa instalação nova. Vale desenhar? Se a
app for para servir outros clubes, sim; se é só para o GDS Cascais, não.

---

## Resumo para priorizar

| Ecrã | Prioridade | Porquê | Bloqueio |
|---|---|---|---|
| **4e** Evento em falta na Agenda | Alta | Fecha o par com o alerta que já existe | — |
| **4a** Toque num convocado | Alta | Uso diário de quem convoca | Presenças não existem |
| **11b** Agenda vazia | Média | Barato, e a agenda passa semanas vazia | — |
| **9h** Ficha de adversário | Média | Ecrã novo, com história de confrontos | Jornadas vazias |
| **9i** Ficha de campo | Média | Ecrã novo | Não há mapa embebido |
| **6b** Gestão | Média-baixa | Sobrepõe-se ao Clube | Decidir se é ecrã ou bloco |
| **5c** Tesouraria | Média-baixa | Sobrepõe-se ao Financeiro | Decidir se é ecrã ou atalho |
| **11a** Ficha por ligar | ? | Depende da frequência do caso | — |
| **11c** Primeiro dia | Baixa | O clube já está montado | — |

## O que **não** falta

Para não haver dúvidas: 1a–1d, 2a–2f, 3a–3d, 4b, 4c, 4d, 4f, 4g, 5a, 5b, 6a,
7a, 7b, 8a–8i, 9a–9g, 10a–10d, 12b e 12c **estão feitos**. O 12a não é um ecrã
da app — é a ilustração de uma notificação no ecrã bloqueado do telemóvel, e
depende de um sistema de envio que não existe.
