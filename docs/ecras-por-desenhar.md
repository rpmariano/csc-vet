# Ecrãs por desenhar — CSC Veteranos

Estado em 2026-09-07. O redesenho de 2026 cobriu **49 dos 58 ecrãs** do handoff
(`Redesign UI app futebol veteranos/design_handoff_app_veteranos/Ecrãs Jogador.dc.html`).
Faltam nove, e **seis deles vão ser desenhados** — três foram postos de lado
por decisão do cliente (ver o fim do documento). Este documento é o que
precisas de saber para os desenhar sem inventar dados que a app não tem.

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

## Presença, nesta app, é a resposta à convocatória

**Decidido.** Não há presenças marcadas no dia do jogo, e não vai haver.

A tabela `attendances` existe (`event_id, player_id, present, excuse_reason`)
mas **nunca é escrita em lado nenhum da app** — zero `insert`, zero `update`,
0 linhas em produção. Era lida num sítio, o número "Presenças" da Home, que por
isso mostrava sempre um traço.

O que existe de facto é `callups.status`: `called` (convocado, sem resposta),
`confirmed` (disse que sim), `declined` (disse que não).

**⚠️ E quase ninguém responde.** Das 1252 convocatórias em produção,
**1243 estão em `called`** — sem resposta. Há **8 "sim" e 1 "não"** em toda a
base. Uma taxa de resposta de 0,7%.

Isto muda o que se pode desenhar. "Últimos 5 jogos" não tem cinco respostas
para mostrar em atleta nenhum; a percentagem de "sim" é 100% para as oito
pessoas que responderam uma vez, e nada para as outras. **Estes ecrãs precisam
de um estado vazio que seja a norma e não a exceção** — "ainda sem respostas" —
e não de um gráfico bonito com dados a fingir.

Vale a pena perguntar porquê antes de desenhar em cima disto: as pessoas sabem
que podem responder na app? Se a resposta à convocatória não é usada, um ecrã
que a mostra em detalhe está a resolver o problema errado.

**A regra, para desenhar:**

- Uma convocatória **respondida** é `confirmed` ou `declined`. Só essas contam
  para percentagens: quem foi convocado ontem e ainda não respondeu não deve ser
  contado como falta.
- O `called` é um terceiro estado com nome próprio — "sem resposta" — e não um
  "não".
- **Não escrever "presenças" no ecrã.** Ninguém marcou presença nenhuma; o que
  se sabe é quem disse que ia. Já mudei o mosaico da Home de "Presenças" para
  **"Disse que sim"**, e o número passou a ler `callups`.

**No 4a**, o handoff desenha "P P F P P — últimos 5 jogos". A tradução é as
últimas cinco convocatórias respondidas, com dois estados em vez de três (sim /
não), e as por responder simplesmente não entram. Cabe ao desenho decidir a
forma — pontos, letras, barras — mas o vocabulário tem de ser o da resposta e
não o da presença, e o caso normal hoje é **nenhuma resposta**.

## Os seis ecrãs

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
- Resposta: `callups.status`, `callups.responded_at`, `callups.notes`.
  A coluna **`responded_at` foi acrescentada** (migração
  `supabase_callups_responded_at_migration.sql`, aplicada a 2026-09-07),
  preenchida por um gatilho no servidor e nunca pelo cliente. O "ontem, 21:14"
  do handoff passa a ser possível.
  ⚠️ **As nove respostas que já existiam ficaram sem hora** — não havia como
  saber quando foram dadas. O desenho tem de aguentar a falta: "Confirmou
  presença" sem o "· ontem, 21:14" ao lado.
- `callups.created_at` é de quando a pessoa foi **convocada**, não de quando
  respondeu. Não confundir.
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
- Presenças: ver a secção acima — são as respostas à convocatória, e é assim
  que se lhes deve chamar.

**Decisões em aberto:**
1. Vale a pena a tira de convocados no topo para saltar entre atletas, ou
   fecha-se e abre-se o seguinte? A tira é bonita mas obriga a carregar a
   convocatória inteira.
2. Com 9 respostas em toda a base, o bloco de histórico vale a pena, ou o ecrã
   deve ser sobretudo o contacto e as ações? Aqui o estado vazio é o normal.

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


---

### 11a · Conta criada, ficha por ligar
**Prioridade: alta — e o texto do handoff está errado para este clube.**

**Como funciona aqui.** As fichas do plantel são criadas pela direção **antes**
de as pessoas se registarem. Quando alguém se regista, a app tenta ligar
sozinha: o `AuthContext` chama `find_my_profile_match({ p_email_only: true })`
e, se o email do registo bater certo com o da ficha, a associação acontece sem
ninguém dar por ela. Se o email não bater mas o telefone ou o nome baterem, o
`AutoAssociationModal` propõe a ficha e pede confirmação.

**O caso que falta é o terceiro:** registou-se com um email que não está na
ficha, e nem o telefone nem o nome deram correspondência. Aí não aparece
mensagem nenhuma — a pessoa vê a app normal, sem convocatórias, sem aparecer no
plantel, e sem uma linha que explique porquê.

**Não é um caso raro.** Em produção, hoje: **28 fichas, 8 contas registadas, e
1 dessas 8 está exatamente neste estado.** Uma em oito.

**⚠️ O texto do handoff não serve.** O 11a diz *"a tua conta está criada, mas
ainda não está ligada a uma ficha de atleta"* e põe o utilizador **"À espera da
direção"**, com um botão "Preencher o meu perfil". Isso descreve um clube onde
a ficha ainda não existe. Aqui a ficha **existe** — o que falta é a ligação, e
quem a pode fazer é a direção, com o ecrã 3d (já feito), ou o próprio, se
alguém lhe disser qual é o email certo. "Preencher o meu perfil" é o conselho
errado: preencher dados numa ficha órfã só cria uma segunda ficha da mesma
pessoa, que é precisamente o problema que o 3d existe para desfazer.

**O que a mensagem deve dizer** (a decidir no desenho, mas esta é a substância):
a conta está criada; há uma ficha tua no plantel mas não conseguimos ligá-la,
provavelmente porque te registaste com outro email; fala com a direção, que
liga em dois toques. E o que se pode fazer entretanto — ver a agenda, as
classificações e os comunicados — que é verdade e continua a valer.

**O que existe hoje:** nada. Nem faixa, nem ecrã, nem mensagem.

**Dados disponíveis:** a condição é a mesma que a RPC `admin_contas_sem_atleta()`
já usa, do lado da direção: um perfil que tem conta em `auth.users` e não tem
`jersey_number`, nem `member_number`, nem `birth_date`, nem `position`. Do lado
do próprio, lê-se o seu perfil e verifica-se o mesmo — sem RPC nenhuma.

**Decisões em aberto:**
1. **Ecrã inteiro ou faixa?** Um ecrã que substitui a Home é claro mas
   bloqueante; uma faixa no topo da Home deixa a pessoa usar o que pode usar.
   O handoff desenha um ecrã. A app já tem faixas para coisas do género (o
   aviso de quotas em atraso, o alerta de convocatórias) — há linguagem
   estabelecida para as duas hipóteses.
2. Deve haver uma ação que o próprio possa fazer, ou só "fala com a direção"?
   Uma hipótese: um botão que mostre o email com que se registou, para ele o
   passar a quem liga as contas.

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

## Resumo para priorizar

| Ecrã | Prioridade | Porquê | Bloqueio |
|---|---|---|---|
| **4e** Evento em falta na Agenda | Alta | Fecha o par com o alerta que já existe | — |
| **4a** Toque num convocado | Alta | Uso diário de quem convoca | 9 respostas em toda a base |
| **11a** Ficha por ligar | Alta | 1 das 8 contas está neste estado hoje | Texto do handoff não serve |
| **11b** Agenda vazia | Média | Barato, e a agenda passa semanas vazia | — |
| **9h** Ficha de adversário | Média | Ecrã novo, com história de confrontos | Jornadas vazias |
| **9i** Ficha de campo | Média | Ecrã novo | Não há mapa embebido |

## Postos de lado — não desenhar

Três ecrãs do handoff que o cliente decidiu não fazer. Ficam aqui registados
para não parecerem esquecimento:

- **5c · Tesouraria (só direção).** Tudo o que mostra já está na página
  financeira, que tem seis separadores e é mais completa. Um segundo ecrã de
  tesouraria criava dois sítios para a mesma verdade.
- **6b · Gestão (treinador e direção).** Sobrepõe-se ao Clube (6a), que já tem
  os mesmos destinos com as contagens. A parte que não existe — o bloco "3
  coisas a tratar" — pode um dia entrar no Clube sem precisar de um ecrã novo.
- **11c · Clube no primeiro dia.** O clube tem 28 fichas, 52 eventos e a época
  montada; este ecrã só se veria numa instalação nova.

## O que **não** falta

Para não haver dúvidas: 1a–1d, 2a–2f, 3a–3d, 4b, 4c, 4d, 4f, 4g, 5a, 5b, 6a,
7a, 7b, 8a–8i, 9a–9g, 10a–10d, 12b e 12c **estão feitos**. O 12a não é um ecrã
da app — é a ilustração de uma notificação no ecrã bloqueado do telemóvel, e
depende de um sistema de envio que não existe.
