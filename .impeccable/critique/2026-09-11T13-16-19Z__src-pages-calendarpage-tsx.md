---
target: a Agenda
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:C:\\Users\\rpmar\\CSC\\src\\pages\\CalendarPage.tsx"
target_fingerprint: "sha256:154125c26c436c8d39b7177f86dcf1b6a95ea83ba42ba79fc1c7838267f6f649"
target_path: "C:\\Users\\rpmar\\CSC\\src\\pages\\CalendarPage.tsx"
timestamp: 2026-09-11T13-16-19Z
slug: src-pages-calendarpage-tsx
---
# Crítica — Agenda (src/pages/CalendarPage.tsx)

Método: dual-agent (A: revisão de desenho · B: evidência determinística), em subagentes isolados.

## Saúde do desenho — 24/40

| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | Nunca se diz até quando se pode responder, embora `convocatoriaFechada()` saiba o prazo |
| 2 | Correspondência com o mundo real | 3 | Na persiana o jogo é `CSC vs GDP`, e o nome do adversário não aparece em lado nenhum |
| 3 | Controlo e liberdade | 3 | Setas do mês a 36px e do carrossel a 28px, com o fechar a 30px de distância |
| 4 | Consistência e normas | 1 | Cartão e persiana discordam sobre o local do jogo; seis palavras para "sem resposta" |
| 5 | Prevenção de erro | 2 | "Sim, vou" e "Não posso" colados, sem confirmação; o "podes mudar" só aparece depois |
| 6 | Reconhecer em vez de recordar | 2 | A lista não é agrupada por mês; a sobrancelha segue o calendário, não a lista |
| 7 | Flexibilidade e eficiência | 2 | Rádio de sete valores mistura tempo com resposta |
| 8 | Estética e minimalismo | 2 | 414px por evento, cartão vazio por omissão, oito números a dizer quatro coisas |
| 9 | Diagnóstico e recuperação | 3 | O texto da convocatória fechada é exemplar; falta o simétrico |
| 10 | Ajuda e documentação | 3 | Os três vazios explicam-se e dão saída; nada explica o prazo |
| **Total** | | **24/40** | |

## Especificidade

Metade autoral, metade calendário genérico, e a genérica está por cima. O cartão de evento e o cartão "Ninguém foi convocado" são inconfundivelmente deste clube. Os primeiros 686px verticais podiam ser de qualquer app de calendário: num viewport de 727px, o primeiro cartão de evento começa a 712px.

Varrimento determinístico: 17 achados (15 `design-system-font-size`, todos já listados no DESIGN.md como deriva conhecida; 2 `border-accent-on-rounded` que são a mesma linha do rodopio de carregamento — falso positivo).

Sem sobreposição visual: a Agenda exige sessão, e as capturas foram feitas pelo simulador de Supabase dos testes em vez da injeção do detetor na página.

Medição no browser: 10 alvos de toque abaixo de 44px e 4 falhas de contraste em texto estático.

## Problemas prioritários

### [P0] O "0 confirmados" é mostrado ao jogador, ao lado da pergunta
O contador na faixa dourada (`CalendarPage.tsx:1823`) e o bloco da convocatória na persiana (`:2632` em diante) não têm guarda de papel. O atleta lê "Contamos contigo?" e, a dois centímetros, "0 confirmados"; na persiana lê "Convocatória (22) · 0 confirmados · 22 pendentes".
**Porquê importa:** prova social invertida no momento de maior aposta, contra o objetivo nº1 do produto (subir os 0,7% de respostas). A regra já está no CLAUDE.md e aplicada às pastilhas do cabeçalho do cartão.
**Correção:** guardar os dois com `isCoachOrAdmin`; na faixa dourada pôr o prazo, que `convocatoriaFechada()` já calcula.
**Comando:** /impeccable clarify

### [P1] Dez alvos de toque abaixo dos 44px
Setas do mês 36px (`:2010`, `:2029`), setas do carrossel 28px (`:2348`, `:2366`), fechar das persianas 36px (`BottomSheet.tsx:298`), pega de arrastar 18px (`:275`), sinal de pagamentos 36px, sino 36px, avatar 38px. O botão "Hoje", na mesma fila das setas do mês, tem 44px.
**Comando:** /impeccable audit

### [P1] "Sim, vou" falha o contraste mínimo
Branco sobre `csc-light` dá 3,79:1 a 13px/700 (mínimo 4,5). Também o crachá do sino (4,08), e as pastilhas de tipo de evento a 10px (4,09 e 4,46), e a pastilha "Jogo" na persiana a 9,5px (3,67). O sinal de euro desce a 2,52 a meio do `animate-pulse`, mas mede 5,79 estático.
**Comando:** /impeccable audit

### [P1] O cartão e a persiana discordam sobre onde é o jogo
`getEventLocationParts()` (`:649`) dá precedência ao `location` e devolve morada vazia; a persiana (`:2494`) faz o inverso. Com ambos preenchidos, dizem sítios diferentes.
**Correção:** uma função só, com uma precedência só, importada pelos dois.
**Comando:** /impeccable harden

### [P1] Nenhum evento acima da dobra
Cabeçalho, procura, calendário e o cartão "Sem eventos neste dia" enchem 686px de 727px. Esse cartão está vazio em 355 dias do ano.
**Correção:** não desenhar o painel do dia quando não há eventos (+160px); abrir o calendário na semana corrente (+170px).
**Comando:** /impeccable layout

### [P2] O filtro de estado é um rádio de sete valores com dois eixos
Mistura quando (por realizar / realizados / todos) com a minha resposta (confirmados / por responder / recusados / convocado). "O que vem aí que ainda não respondi" é inexprimível.
**Correção:** dois grupos combináveis, QUANDO e A MINHA RESPOSTA, mais "Por convocar" para quem gere.
**Comando:** /impeccable shape

## Bandeiras por persona

**Manuel, 48 anos, sol na cara:** rola 712px para ver o jogo; a morada não vem no cartão; no detalhe o adversário perde o nome; dois botões de resposta colados sem confirmação.

**Joaquim, treinador:** os mesmos quatro números duas vezes, em duas linguagens visuais com nomes diferentes; sem filtro para "o que falta convocar"; o bloco por convocar salta a ordem cronológica sem explicar.

**O atleta que nunca respondeu (99,3%):** a primeira coisa acima do seu botão é a contagem de zeros; nada diz que a resposta serve para alguma coisa nem até quando a pode dar.

## Observações menores

- `getMyCallupForEvent()` compara por **nome** e está duplicada (`:1261` e `:1323`). Com homónimos, um responde pela convocatória do outro.
- Resto da UI de computador: `size="7xl"` (`:2303`) e `grid-cols-1 lg:grid-cols-12` (`:2446`) nunca geram nada.
- "Casa"/"Fora" sob os dois emblemas dizem duas vezes o mesmo facto invertido.
- O título do evento só se desenha para `gathering` (`:1728`); um jogo sem adversário fica sem linha de identificação.
- Treze cores cruas de Tailwind fora da paleta; o âmbar está reservado ao dinheiro.
- Largura estreita e larga mostram o mesmo, centrado. Verificado.

## Perguntas

1. Se a Home já é o próximo jogo, o que é a Agenda? Como arquivo e máquina de filtrar, cabiam oito eventos no ecrã.
2. E se responder não fosse uma coisa que se faz dentro de um evento? Uma faixa "faltam-te três respostas" apontaria ao número que o produto quer mover.
3. Para que serve uma grelha de 42 células num clube que joga ao sábado?
