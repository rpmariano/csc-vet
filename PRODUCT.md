# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Três audiências, uma só app, **e o jogador e quem gere pesam o mesmo** — os
ecrãs de consulta são para o plantel, os de gestão para treinador e direção, e
nenhum dos dois lados cede ao outro quando as prioridades chocam.

- **O atleta veterano.** Futebol de veteranos, adultos com vida feita: trabalho,
  família, jogos ao fim de semana. Abre a app no telemóvel para saber onde e a
  que horas é o próximo jogo, responder à convocatória, ver o que deve ao clube
  e ler o que a direção comunicou.
- **A equipa técnica (`coach`).** Marca eventos, convoca, lança a ficha de jogo
  e acompanha o plantel — estados clínicos, disciplina, quem respondeu.
- **A direção (`admin`).** Faz o mesmo que a equipa técnica e ainda as quotas,
  os encargos, as despesas e receitas, as provas, os campos, os adversários e a
  ligação de contas a fichas.

Uma pessoa pode ser mais do que uma coisa: **metade da direção deste clube
também joga.** A app trata os papéis como acumuláveis (`profiles.roles`) e deixa
simular um papel para ver a app como outro a vê.

`profiles` são as **pessoas do clube**, não os atletas: há quem jogue, quem
jogue e treine, quem jogue e dirija, e quem não entre em campo de todo.

## Product Purpose

Tirar a gestão da equipa de veteranos do papel, das folhas de cálculo e do grupo
de mensagens, e pô-la num sítio só, consultável a partir do telemóvel.

O sucesso, à distância de uma época, mede-se por três coisas, todas confirmadas
com o cliente:

1. **O plantel passa a responder às convocatórias.** É o problema mais agudo:
   das ~1200 convocatórias em produção, 1191 estão sem resposta — 8 "sim" e 1
   "não". Qualquer trabalho que suba essa taxa vale mais do que um ecrã bonito
   sobre os dados que ela não produz.
2. **Menos trabalho de gestão.** Convocar, lançar o jogo, marcar uma quota ou
   registar uma despesa tem de ser mais rápido do que a alternativa em papel.
3. **Registo fiável da época.** Uma só verdade sobre jogos, golos, disciplina,
   classificações e dinheiro — sem segundas contas que possam discordar.

## Positioning

Não é uma app de liga nem um gestor de clube profissional adaptado: é a
ferramenta de uma **equipa de veteranos amadora**, onde a mesma pessoa marca o
jogo, paga a quota e joga a ponta de lança.

Daí duas escolhas que um produto vizinho não copia de graça:

- **Uma só interface, a de telemóvel** — nenhum layout de computador, nem
  sequer num monitor largo, porque o uso real é à beira do relvado.
- **Papéis acumuláveis com simulação**, em vez de contas separadas de jogador e
  de gestor.

## Operating Context

- **PWA instalada no telemóvel**, com service worker e avisos push. Usada de pé,
  com uma mão, muitas vezes com rede fraca — o arranque é dividido por rota para
  não descarregar a app inteira.
- **A época é a unidade de tempo.** Começa no mês definido em
  `financial_settings.season_start_month`, e a mesma regra vive em dois sítios
  que têm de andar a par: `getSeasonLabel()` no cliente e `financial_season()` na
  base.
- **As fichas nascem antes das contas.** A direção cria a ficha do atleta; a
  pessoa regista-se depois, e a ligação é automática **pelo endereço de email
  verificado, e mais nada**. Sem ficha com esse email, a conta fica por ligar e
  é a direção que resolve.
- **O calendário real do clube** — jogos de prova com jornada, treinos semanais,
  convívios — é o que enche a Agenda. Fora de época a Agenda passa semanas
  vazia, e isso é normal.
- **Quotas mensais e encargos** (inscrições em provas, seguro desportivo) são o
  lado financeiro; a cobrança acontece fora da app, e a app é o registo.

## Capabilities and Constraints

**O que a app faz hoje:** agenda e eventos, convocatórias e respostas, fichas de
jogo com golos e disciplina, plantel e fichas de atleta, classificações e
estatísticas por prova, comunicados com leitura por pessoa, avisos push,
financeiro completo (quotas, encargos, despesas, receitas, previsão de saldo) e
a gestão de clube — dados, campos, adversários, torneios.

**Vocabulário do código, que é o vocabulário dos ecrãs:**

- Posições: GR, DCE, DCD, LD, LE, MDC, MCO, ME, MD, PL.
- Estados clínicos: **Apto / Lesionado / Inativo** (um lesionado continua sócio
  e continua a pagar).
- Tipos de evento: **Jogo / Treino / Convívio**.
- Convocatória: **Confirmado / Recusou / Sem resposta**.

**Presença não existe neste produto.** A tabela `attendances` nunca foi escrita.
O que se sabe é quem **disse que ia** — `callups.status` e `callups.responded_at`.
Não se escreve "presenças", "faltas" nem "presente" em ecrã nenhum, e quem foi
convocado ontem e ainda não respondeu **não é uma falta**.

**Restrições duras:**

- Interface de telemóvel apenas; num ecrã largo é a mesma app numa coluna de
  480px ao meio. Os pontos de corte responsivos do Tailwind estão desligados de
  propósito.
- Todos os alvos de toque com um mínimo de 44px de altura, sem exceções.
- A autorização a sério é a RLS do Supabase; as barreiras no cliente são
  conforto. Os colegas de equipa leem-se por `v_players_public`, sem dados
  pessoais.
- Sem mapa embebido: a app abre o Google Maps por URL, sem chave de API.
- Sem emoji na interface — os leitores de ecrã leem-nos por extenso e cada
  telemóvel desenha-os à sua maneira.

**Decisões já tomadas, e a respeitar:**

- **O contador de convocados e respostas é só de quem gere.** Ao jogador é
  ruído: o que lhe diz respeito é a hora, o local e a sua própria resposta.
  E mostra os "sim" enquanto houver algum — só quando não há nenhum é que diz
  quantos faltam responder, senão a Agenda seria uma coluna de zeros.
- **Os aniversários aparecem só na Agenda vazia**, e sem filtro nenhum posto.
  Com filtro, o vazio pede é que se tire o filtro; fora de época, pede o
  histórico.
- **A conta por ligar substitui o corpo da Home**, mantendo o cabeçalho, e não
  oferece ação nenhuma ao próprio além de ler e copiar o email do registo.
  Preencher dados numa ficha órfã criaria a segunda ficha que a direção depois
  teria de desfazer.

**Âmbito:** um clube, uma instalação. Não é multi-clube, e não há intenção de o
tornar já — mas o cliente pediu que se evitem decisões que impeçam instalar
noutro clube mais tarde. O nome, o emblema e o campo de casa já vivem em
`club_settings` e não em código, e é assim que se mantém a porta aberta.

## Brand Commitments

- **Clube:** Grupo Dramático e Sportivo de Cascais. Nome curto **GDS Cascais**;
  a app chama-se **CSC Veteranos**. A verdade está em `club_settings`, não em
  código — `src/lib/clube.ts` é só o que se mostra enquanto a base não responde.
- **Língua:** português de Portugal, em toda a interface e em todos os
  comentários do código.
- **Assets existentes:** emblema do clube (`public/cascais-emblem.png`,
  `public/logo-clube.png`), logótipo horizontal (`logo-clube-horizontal.svg`),
  ícones da PWA, e o manual de normas do clube (`GDSC - ManualNormas.pdf`).
- **Handoff de desenho de 2026** em `Redesign UI app futebol veteranos/`, com o
  mapa de navegação e os 58 ecrãs — a referência que o cliente pinou.
- **Ícones:** `lucide-react`, traço fino.

## Evidence on Hand

Números de produção à data de Setembro de 2026, do documento
`docs/ecras-por-desenhar.md`. **São o caso real e não devem ser embelezados em
maquetes.**

- 27 fichas de pessoas, 8 contas registadas, zero contas de jogador por ligar.
- ~1200 convocatórias, das quais **9 respondidas** (8 sim, 1 não) — 0,7%.
- 52 eventos, 11 linhas de estatísticas de jogo, `tournament_matches` e
  `tournament_suspensions` vazias.
- 2 adversários e 2 campos, um deles sem morada.
- 25 das 27 fichas com data de nascimento; 25 com telefone.

**Estados vazios são a norma, não a exceção.** Um histórico desenhado cheio é um
histórico a fingir.

**Não existe, e não se inventa:** patrocinadores, testemunhos, número de
seguidores, histórico de épocas anteriores, mapas embebidos, presenças marcadas
no dia do jogo.

## Product Principles

1. **Uma verdade, num sítio só.** Uma regra escrita no cliente e na base tem de
   ser escrita nos dois; dois caminhos para o mesmo número acabam sempre por
   discordar.
2. **Não há duas portas para o mesmo destino.** Cinco superfícies de navegação, e
   cada destino escolhe uma.
3. **O vocabulário do ecrã é o vocabulário do dado.** Se a base sabe quem
   respondeu, o ecrã diz "disse que sim" — nunca "presente".
4. **Nada do que se escreve se perde**, e esconder linhas nunca é a forma de
   dizer que estão desatualizadas.
5. **O telemóvel à beira do relvado é a única condição de uso que conta** — com
   uma mão, ao sol e com rede fraca.

## Accessibility & Inclusion

- Plantel adulto, boa parte acima dos 40 — texto legível ao sol, contrastes
  medidos e alvos de toque generosos não são cortesia, são a condição de uso.
- **Alvos de toque com 44px de altura no mínimo**, sem exceções.
- Contraste de texto verificado sobre o fundo escuro; os alfas de leitura foram
  subidos em 231 sítios depois de a barra de navegação ter sido medida em 3,65:1.
- Diálogos e persianas com contrato de acessibilidade coberto por testes:
  `role="dialog"`, nome acessível, foco levado para dentro ao abrir, Escape a
  fechar, empilhamento correto.
- **Sem emoji na interface** — um cartão amarelo é uma marca desenhada com texto
  escondido a dizer o que é.
- Navegação por teclado tratada como caso real: um cartão que se clica é um
  `<button>`, ou leva papel, foco e resposta a Enter e Espaço.
