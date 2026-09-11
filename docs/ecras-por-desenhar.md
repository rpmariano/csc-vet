# Ecrãs por desenhar — CSC Veteranos

**Estado em 2026-09-11: os seis estão feitos.** O redesenho de 2026 cobre os
**55 ecrãs** do handoff
(`Redesign UI app futebol veteranos/design_handoff_app_veteranos/Ecrãs Jogador.dc.html`)
que o cliente decidiu fazer; os outros três foram postos de lado por decisão
dele (ver o fim do documento).

Este documento nasceu a 2026-09-07 como o que era preciso saber para os
desenhar sem inventar dados que a app não tem. Fica como **registo**: o que
cada ecrã precisava, o que ficou decidido, e onde vive hoje. As restrições da
secção seguinte e a regra da presença continuam a valer para qualquer ecrã
novo.

| Ecrã | Onde vive |
|---|---|
| **4a** Toque num convocado | `src/components/callups/FichaConvocado.tsx` |
| **4e** Evento em falta na Agenda | `src/pages/CalendarPage.tsx` — `renderCartaoPorConvocar` e o contador do cartão |
| **9h** Ficha de adversário | `src/components/clube/FichaAdversario.tsx` |
| **9i** Ficha de campo | `src/components/clube/FichaCampo.tsx` |
| **11a** Conta por ligar | `src/components/FichaPorLigar.tsx` |
| **11b** Agenda sem nada marcado | `src/pages/CalendarPage.tsx` — o vazio sem filtros, com `AniversariosDoMes` |

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

**Paleta.** Fundo `#262d2b`. Superfícies: verde escuro `#164f16`, verde
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

**⚠️ E quase ninguém responde.** Das 1200 convocatórias em produção,
**1191 estão em `called`** — sem resposta. Há **8 "sim" e 1 "não"** em toda a
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

**No 4a**, o handoff desenha "P P F P P — últimos 5 jogos". A tradução são as
últimas convocatórias respondidas, com dois estados em vez de três (sim / não),
e as por responder simplesmente não entram. O bloco ficou a contar — "1 de 34
convocatórias" — e não em percentagem: a percentagem de uma resposta é 100% e
não significa nada. O vocabulário é o da resposta e não o da presença, e o caso
normal continua a ser **nenhuma resposta**.

## Os seis ecrãs

### 4a · Toque num convocado
**Feito** — `src/components/callups/FichaConvocado.tsx`. Era de prioridade
alta, por ser de uso diário para quem gere.

**O handoff mostra:** uma persiana sobre a convocatória, com a tira de
convocados no topo (números, com o escolhido em destaque). Dentro: número,
posições, nome completo, estado (Apto), a resposta com a hora ("Confirmou
presença · ontem, 21:14"), **PRESENÇAS** (P P F P P, últimos 5 jogos),
**DISCIPLINA** (2 amarelos, 0 vermelhos, "sem suspensão"), o telefone com
**Ligar** e **WhatsApp**, e as ações: ✓ Confirmado, ✕ Recusou, Remover da
convocatória, Abrir ficha completa →.

**O que existia antes:** `src/components/callups/CallupRow.tsx` — a linha do
convocado, com o número numa bolha, o nome, as posições e quatro botões de
ação de 44px (confirmar, recusar, repor sem resposta, remover). **A linha não
abria nada**: não havia ficha rápida.

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
- Contactos: `profiles.phone` (25 de 27 fichas preenchidas). ⚠️ **RLS:** só a
  equipa técnica e o próprio leem `profiles`; os colegas leem
  `v_players_public`, que **não tem telefone**. Como este ecrã é de quem
  convoca (coach/admin), o telefone está acessível — mas o desenho não pode ser
  reaproveitado para o jogador comum.
- Presenças: ver a secção acima — são as respostas à convocatória, e é assim
  que se lhes deve chamar.

**Decidido:**
1. **A tira ficou.** A convocatória já está carregada por quem abre a ficha —
   é filha da persiana da convocatória —, por isso saltar entre atletas não
   custa um pedido novo.
2. **O histórico ficou, contado e não em percentagem.** Diz "1 de 34
   convocatórias" e escreve em letra pequena que as por responder não são
   falta de ninguém: a percentagem de uma resposta é 100% e não significa
   nada. O contacto e as quatro ações são o corpo do ecrã, agora em botões
   com nome e não só em ícones.
3. **Não vai no endereço.** É filha de uma persiana que já lá está
   (`?event=`, `?convocatoria=`); um `?convocado=` sozinho não abriria nada e
   empilhar dois detalhes com endereço agravava a falha do retroceder.

---

### 4e · Agenda, com o evento em falta
**Feito** — `src/pages/CalendarPage.tsx`, em `renderCartaoPorConvocar` e no
contador do cartão de evento. Fechou o par com o alerta que já existia.

**O handoff mostra:** na Agenda, o evento sem convocatória sobe para o topo num
cartão destacado: data grande, "CSC vs Sesimbra", "18:00 · Liga Setúbal",
**"Ninguém foi convocado"**, a linha "Sem convocatória o plantel não recebe
pedido de resposta", e um botão **Convocar**. Por baixo, "ESTA SEMANA" com os
eventos normais, cada um com "16 convocados · 11 sim" ou "18 convocados · 7 sem
resp.". O handoff é explícito: *"na Agenda o evento em falta fica marcado, sem
alarme — o aviso a 6 dias é o alerta flutuante do 4c"*.

**O que existia antes:** `src/pages/CalendarPage.tsx` — os cartões de evento
(`renderEventCard`) mostravam tipo, confronto, concentração/início e local.
**Não diziam quantos foram convocados nem quantos responderam**, e não havia
marca nenhuma para "sem convocatória". Confirmado à data: zero ocorrências.

O alerta flutuante (4c/4d) **já estava feito** —
`src/components/AlertaSemConvocatoria.tsx`, na Home de quem gere.

**Dados disponíveis:** tudo. `callups` por `event_id`, com `status`. Basta uma
consulta agregada.

**Decidido:**
1. **O contador é só de quem gere.** Para o jogador é ruído — o que lhe diz
   respeito é a hora, o local e a sua própria resposta, que estão mais abaixo
   no mesmo cartão. E mostra os "sim" enquanto houver algum; só quando não há
   nenhum é que passa a dizer quantos faltam responder, senão, com 0,7% de
   respostas, um "0 sim" em cada cartão seria a única coisa que a Agenda
   dizia.
2. **O cartão em falta sobe ao topo**, fora da lista, como no handoff — e só
   aparece a quem gere, que é quem pode convocar.

---

### 9h · Adversário — ver e editar
**Feito** — `src/components/clube/FichaAdversario.tsx`, aberta por
`?adversario=`.

**O handoff mostra:** cabeçalho com a sigla numa bolha, nome, campo principal.
Três números: **JOGOS 3 · V 1 · E 1 · D 1**. Cartão **CAMPO PRINCIPAL** com
botão "Mudar". **TORNEIOS E POSIÇÕES**: uma linha por prova com a posição
final ("1º Liga Setúbal · 25/26 · a decorrer · 17 pontos", "3º · 24/25 ·
terminada", "1/4 Taça · quartos de final"). **JOGOS ENTRE NÓS**: os confrontos
com resultado, data, prova e casa/fora. No fim, **Editar adversário** e
**Eliminar adversário**, com a nota "não se pode eliminar um adversário com
jogos registados — nesse caso só se edita".

**O que existia antes:** nada. Um adversário editava-se num diálogo
(`AdminDashboard`, separador `?ver=opponents`) e não tinha ficha. A gestão
mudou de sítio entretanto: hoje é `src/components/clube/GestaoAdversarios.tsx`,
secção `?ver=adversarios` do ecrã Clube.

**Dados disponíveis:**
- Identidade: `opponents` (`name, initials, logo_url, contact_name,
  contact_phone, home_field_id`). ⚠️ Só **2 adversários** em produção.
- Confrontos: `events` com `opponent_id`, `home_score`, `away_score`,
  `home_away`, `tournament_id`. É daqui que sai o V/E/D.
- Posições em torneios: `tournament_teams` + `tournament_matches`. ⚠️
  `tournament_matches` está **vazia** (0 linhas): a classificação por prova não
  tem com que ser calculada hoje. O "1º · 17 pontos" fica em branco até alguém
  lançar jornadas.

**Decidido:**
1. **O bloco das provas desenha-se na mesma, vazio e a tracejado.** Escondê-lo
   deixava a pessoa sem perceber se o adversário não está em prova nenhuma ou
   se é a app que não sabe. Fica a prova, com o lugar da posição a tracejado e
   o caminho para lançar as jornadas.
2. **"Mudar" abre o diálogo de edição**, que já tem o seletor de campo. O
   handoff mandava-o para a lista de campos, que é de leitura e não mudava
   nada.

**E um cartão não repete o título do ecrã.** A primeira versão tinha o nome do
adversário no título da persiana e outra vez, truncado, no primeiro cartão —
com o campo por baixo, que num clube como o "Grupo Desportivo dos Pescadores da
Costa da Caparica" é quase a mesma frase. O cartão ficou com o emblema, a sigla
e o histórico contra nós; o campo tem a sua secção mais abaixo.

---

### 9i · Campo — ver e editar
**Feito** — `src/components/clube/FichaCampo.tsx`, aberta por `?campo=`.

**O handoff mostra:** etiqueta "★ CAMPO DO CLUBE" quando é o de casa, nome,
localidade, um mapa (com o estado "mapa por carregar"), **Ver no mapa** e
**Copiar morada**. **PRÓXIMOS EVENTOS AQUI**: data em coluna, tipo/confronto,
hora e prova. No fim, **Editar campo** e **Eliminar campo**, com a nota "o
campo do clube não se elimina sem escolher outro em Clube".

**O que existia antes:** nada. Editava-se num diálogo (`AdminDashboard`,
`?ver=fields`), hoje `src/components/clube/GestaoCampos.tsx` em `?ver=campos`.

**Dados disponíveis:**
- `fields` (`id, name, address`). ⚠️ Só **2 campos** em produção, e o `address`
  pode ser vazio.
- Próximos eventos: `events.field_id`. 52 eventos em produção.
- Campo de casa: `club_settings.home_field_id`.
- ⚠️ **Não há mapa embebido.** A app abre o Google Maps por URL
  (`getGoogleMapsUrl` em `CalendarPage`), sem chave de API nem componente de
  mapa. O quadrado de mapa do handoff seria um trabalho novo (e uma chave a
  pagar). O desenho deve assumir que não há mapa, ou marcar isso como decisão.

**Decidido:**
1. **Não há mapa dentro da app, e a ficha di-lo.** Embeber um mapa a sério
   obriga a um componente novo e a uma chave que se paga por utilização, para
   mostrar um retângulo de dois campos que toda a gente do clube já conhece. O
   "Ver no Maps" abre o Google Maps por URL, como a Agenda sempre fez, e uma
   linha em letra pequena explica-o para ninguém pensar que o mapa não
   carregou.
2. **Sem morada, os dois botões ficam desativados**, com uma frase a dizer
   porquê. Um "Copiar morada" que copia vazio é pior do que um botão apagado.


---


---

### 11a · Conta criada, ficha por ligar
**Feito** — `src/components/FichaPorLigar.tsx`, com o `useFichaPorLigar()` a
decidir na Home. Era de prioridade alta, e **o texto do handoff estava errado
para este clube** — ver abaixo.

**Como funciona aqui.** As fichas são criadas pela direção **antes** de as
pessoas se registarem, e **a identidade é o endereço de email**: o `AuthContext`
chama `find_my_profile_match()`, que procura a ficha com o email da sessão, e a
associação acontece sem ninguém dar por ela. Se não houver ficha com esse email,
a conta fica por ligar — é a regra, e não uma falha da correspondência.

⚠️ **Atualizado a 2026-09-07.** Até aí valiam também o telefone e o primeiro-e-
último nome, e o `AutoAssociationModal` propunha a ficha nesses casos. Saíram os
dois: o telefone da própria ficha é auto-editável, e servia para reclamar a ficha
de outra pessoa. O modal foi apagado com eles.

**O caso que este ecrã cobre:** registou-se com um email que não está em ficha
nenhuma. Sem ele não aparece mensagem — a pessoa vê a app normal, sem
convocatórias, sem aparecer no plantel, e sem uma linha que explique porquê.

**Quantas contas estão neste estado, hoje: nenhuma.** ⚠️ Corrigido a
2026-09-07, ao implementar. A contagem anterior deste documento dizia "1 das 8
contas" — era a condição da RPC aplicada em cru, e a conta que ela apanhava é
a de um **treinador**: sem camisola nem posição porque não joga, com 48
convocatórias e a ficha ligada como deve ser. Em produção há 27 fichas, 8
contas registadas e **zero** contas de jogador por ligar.

O ecrã continua a valer a pena — a associação automática falha sempre que
alguém se regista com outro email, e é a direção que cria as fichas antes de as
pessoas se registarem —, mas é um estado que **hoje ninguém vê**, e não um
problema a arder. E a lição para a implementação é que a condição da RPC
sozinha não serve deste lado: listar alguém a mais num ecrã de admin é um
incómodo, substituir-lhe a Home é tirar-lhe a app.

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

**O que existia antes:** nada. Nem faixa, nem ecrã, nem mensagem.

**Dados disponíveis:** a condição é a mesma que a RPC `admin_contas_por_ligar()`
usa do lado da direção (`supabase_contas_por_ligar_migration.sql`). ⚠️ **Não é a
que aqui estava.** A anterior — sem `jersey_number`, `member_number`,
`birth_date` nem `position` — chamava-se "contas sem atleta" e estava errada:
`profiles` são as **pessoas** do clube e nem todas jogam. A condição de hoje usa
só colunas que o próprio não pode escrever (`role`, `roles`, `jersey_number`,
`position`) e exige que o clube nunca tenha contado com a pessoa — sem
convocatórias, sem estatísticas, sem quotas.

**Decidido:**
1. **Substitui o corpo da Home, e o cabeçalho fica.** Como no handoff. O que
   desaparece com ele é o que não faz sentido a quem não tem ficha — o sinal
   de pagamentos e a pastilha de estado clínico. O sino dos comunicados e a
   fotografia ficam.
2. **Nenhuma ação para o próprio, além de ler e copiar o email do registo.**
   O "Preencher o meu perfil" do handoff era o conselho errado: preencher
   dados numa ficha órfã cria uma segunda ficha da mesma pessoa, que é
   precisamente o que o ecrã 3d existe para desfazer. O email está lá em texto
   que se lê e se copia, para se passar a quem liga as contas.
3. **A verificação é em dois tempos**, e isto é da implementação. O teste das
   colunas é de graça; só para quem passa é que se vai confirmar à rede que
   não há convocatórias. Aqui um falso positivo não é uma linha a mais numa
   lista de admin — é a app inteira que desaparece.

---

### 11b · Agenda sem nada marcado
**Feito** — `src/pages/CalendarPage.tsx`, no vazio sem filtros, com
`<AniversariosDoMes>`.

**O handoff mostra:** o calendário do mês vazio, "Nada marcado ainda" com "o
próximo jogo ou treino aparece aqui assim que a equipa técnica o criar", e —
este é o ponto — um cartão **🎂 Aniversários deste mês** ("Tiago a 6, Paulo a
22"), com a nota: *"mesmo sem eventos, a agenda mostra os aniversários do
plantel — não fica uma página em branco"*.

**O que existia antes:** um vazio genérico em `CalendarPage`: "Nenhum evento
encontrado. / Limpa os filtros, ou marca alguma coisa no [+]". Não havia
aniversários na Agenda (zero ocorrências).

**Dados disponíveis:** `v_players_public.birth_date` — 25 das 27 fichas
preenchidas. A **Home já mostra aniversários** (`src/pages/Home.tsx`), com o
código feito; é reaproveitável.

**Decidido: só no vazio, e só sem filtros postos.** Sempre à vista, competiriam
com os eventos. E há três vazios diferentes, não um: com filtro posto, o que
falta é tirá-lo; fora de época, com jogos já realizados, o vazio manda ver os
realizados — dizer "Nada marcado ainda" aí era mentira, e deixava o histórico
sem porta. Os aniversários ficam no terceiro, o de quem não tem mesmo nada
marcado.


---

## Resumo — o que era o plano, e o que ficou

Os seis estão feitos. A prioridade e o bloqueio ficam registados porque
explicam as decisões: onde havia bloqueio, foi ele que decidiu a forma do
ecrã.

| Ecrã | Prioridade | Bloqueio | Como ficou |
|---|---|---|---|
| **4e** Evento em falta na Agenda | Alta | — | Cartão no topo, e o contador só para quem gere |
| **4a** Toque num convocado | Alta | 9 respostas em toda a base | Histórico contado, nunca em percentagem |
| **11a** Ficha por ligar | Média | Texto do handoff não serve | Substitui o corpo da Home, sem ação para o próprio |
| **11b** Agenda vazia | Média | — | Aniversários só no vazio sem filtros |
| **9h** Ficha de adversário | Média | Jornadas vazias | Bloco das provas desenhado a tracejado |
| **9i** Ficha de campo | Média | Não há mapa embebido | Botão que abre o Maps, e a ficha di-lo |

## Postos de lado — não desenhar

Três ecrãs do handoff que o cliente decidiu não fazer. Ficam aqui registados
para não parecerem esquecimento:

- **5c · Tesouraria (só direção).** Tudo o que mostra já está na página
  financeira, que tem seis separadores e é mais completa. Um segundo ecrã de
  tesouraria criava dois sítios para a mesma verdade.
- **6b · Gestão (treinador e direção).** Sobrepõe-se ao Clube (6a), que já tem
  os mesmos destinos com as contagens. A parte que não existe — o bloco "3
  coisas a tratar" — pode um dia entrar no Clube sem precisar de um ecrã novo.
- **11c · Clube no primeiro dia.** O clube tem 27 fichas, 52 eventos e a época
  montada; este ecrã só se veria numa instalação nova.

## O que **não** falta

Para não haver dúvidas: 1a–1d, 2a–2f, 3a–3d, 4a–4g, 5a, 5b, 6a, 7a, 7b,
8a–8i, 9a–9i, 10a–10d, 11a, 11b, 12b e 12c **estão feitos**. O 12a não é um ecrã
da app — é a ilustração de uma notificação no ecrã bloqueado do telemóvel, e
depende de um sistema de envio que não existe.

---

# Setembro de 2026 — a paleta e a Home

O handoff trouxe um `PROMPT.md` com dois trabalhos. Ficam os dois feitos, e
aqui o que deles não coube.

## Paleta

Troca de tokens, sem mexer em estrutura: fundo `#0e1011` → `#262d2b`, a faixa
do topo e a moldura da entrada nos tons novos, os cartões um degrau mais
claros, e a barra de navegação em `rgba(53,61,58,.9)`.

Duas coisas que a troca obrigou:

- **Persianas e modais ganharam token próprio** (`--color-csc-superficie`,
  `#2d3532`). Usavam a cor da página; com o fundo aclarado ficavam *mais
  escuros* do que aquilo sobre que flutuam, e a elevação lia-se ao contrário.
- **Os alfas de leitura subiram** de `/40`–`/55` para `/62`, em 231 sítios. O
  pior caso era a barra de navegação, onde `text-white/62` levava
  `opacity-90` por cima — a opacidade multiplica o alfa e punha o rótulo em
  3,65:1. Passou a `/82` com opacidade cheia.

## A Home (cartão 4a)

Feita por blocos: cabeçalho com época e estado clínico, próximo jogo em
carrossel, "por responder" em carrossel, último jogo, provas a decorrer em
carrossel, e os anos de quem faz este mês. Os três carrosséis levam o realce
deslizante da barra de navegação, em `src/components/home/CarrosselCartoes.tsx`.

### O que ficou de fora, e porquê

Três coisas do desenho não têm como ser feitas com os dados que existem. Não
foram inventadas.

**1. A meteorologia no cartão do jogo** ("19° · vento 24 km/h"). Não há fonte
nenhuma na app — nem serviço, nem chave. Precisa de uma API de meteorologia
com chave (a maioria é paga acima de um limite), de guardar a última resposta
para o cartão não ficar vazio sem rede, e de uma decisão sobre o que mostrar
quando a previsão não chega. Um número inventado num cartão que diz a que
horas é a concentração seria pior do que não o ter.

**2. A cronologia dos golos no último jogo** ("12' Nuno Aleixo, as. Paulo").
`stats` guarda **contagens por jogador e por jogo** — `goals`, `assists` —, não
golos como acontecimentos: não há minuto, e não há forma de dizer quem assistiu
qual golo. Precisa de uma tabela nova, algo como:

```sql
create table public.match_goals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  scorer_id uuid references public.profiles(id) on delete set null,
  assist_id uuid references public.profiles(id) on delete set null,
  minute smallint,
  own_goal boolean not null default false,
  created_at timestamptz not null default now()
);
```

e, sobretudo, de mudar a ficha de jogo: hoje lança-se "2 golos do Nuno", e
passaria a lançar-se cada golo. É trabalho de UI, não só de esquema. Até lá a
Home mostra o resultado e quem marcou e assistiu, com as contagens.

**3. A tabela de classificação.** `tournament_matches` tem **zero linhas** —
sem jornadas lançadas não há classificação para calcular. E o algoritmo, com os
desempates por confronto direto e diferença de golos, vive dentro da
`StandingsPage` com mais de cem linhas: duplicá-lo para a Home criava duas
classificações que podiam discordar. O caminho é extraí-lo para `src/lib`, e só
depois a Home mostra a tabela. Por agora mostra a prova e leva às
classificações, que é onde a conta é feita.

### Uma diferença deliberada face ao desenho

O cartão 4a põe **Vou / Não num treino**, no bloco "por responder". A app não
faz isso: um treino não pede resposta — são semanais, convocam automaticamente
todos os aptos, e perguntar semana após semana ensina a ignorar o pedido. O
desenho é anterior a essa decisão. O bloco leva jogos e convívios.
