---
name: CSC Veteranos
description: A app de telemóvel do GDS Cascais — placard iluminado, vidro sobre a faixa do clube, dourado só onde se toca.
colors:
  verde-clube: "#164f16"
  verde-equipamento: "#009662"
  dourado-emblema: "#e3c04d"
  azul-institucional: "#005296"
  vermelho-cartao: "#ef3223"
  ambar-aviso: "#f59e0b"
  ambar-texto: "#fcd34d"
  faixa-verde-vivo: "#22691f"
  faixa-verde-fundo: "#17452a"
  fundo: "#262d2b"
  superficie: "#2d3532"
  tinta: "#121415"
  branco: "#ffffff"
  verde-texto: "#4ecf9d"
  azul-texto: "#7fb3e0"
  vermelho-texto: "#f08a7f"
  vermelho-suave: "#f0b8b0"
  vidro-cartao: "rgba(255,255,255,0.11)"
  vidro-bloco: "rgba(255,255,255,0.07)"
  vidro-barra: "rgba(53,61,58,0.9)"
  fio-forte: "rgba(255,255,255,0.14)"
  fio: "rgba(255,255,255,0.12)"
  marca-agua: "rgba(255,255,255,0.065)"
typography:
  heroi:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "44px"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  display:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "36px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "28px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.03em"
  numero:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "22px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.03em"
  subtitulo:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.15
  enfase:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "normal"
  linha:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.25
  linha-forte:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "12.5px"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  apoio:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.45
  nota:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  nota-fraca:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "9.5px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.18em"
  label-campo:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
  pastilha-estado:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "8.5px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  campo: "15px"
  bloco: "22px"
  cartao: "26px"
  persiana: "30px"
  faixa: "44px"
  circulo: "9999px"
spacing:
  linha: "12px"
  bloco: "16px"
  coluna: "18px"
  ecra: "20px"
components:
  botao-dourado:
    backgroundColor: "{colors.dourado-emblema}"
    textColor: "{colors.tinta}"
    rounded: "24px"
    padding: "0 24px"
    height: "48px"
  botao-vidro:
    backgroundColor: "rgba(255,255,255,0.09)"
    textColor: "#ffffff"
    rounded: "24px"
    padding: "0 24px"
    height: "48px"
  botao-verde:
    backgroundColor: "{colors.verde-equipamento}"
    textColor: "#ffffff"
    rounded: "24px"
    padding: "0 24px"
    height: "48px"
  botao-perigo:
    backgroundColor: "rgba(239,50,35,0.15)"
    textColor: "{colors.vermelho-texto}"
    rounded: "24px"
    padding: "0 24px"
    height: "48px"
  pastilha:
    backgroundColor: "rgba(255,255,255,0.05)"
    textColor: "rgba(255,255,255,0.70)"
    rounded: "{rounded.bloco}"
    padding: "0 16px"
    height: "44px"
  pastilha-ativa:
    backgroundColor: "{colors.dourado-emblema}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.bloco}"
    padding: "0 16px"
    height: "44px"
  cartao-vidro:
    backgroundColor: "rgba(255,255,255,0.11)"
    textColor: "#ffffff"
    rounded: "{rounded.cartao}"
    padding: "16px"
  cartao-simples:
    backgroundColor: "rgba(255,255,255,0.07)"
    textColor: "#ffffff"
    rounded: "{rounded.bloco}"
    padding: "16px"
  campo-entrada:
    backgroundColor: "#ffffff"
    textColor: "{colors.tinta}"
    rounded: "{rounded.campo}"
    padding: "0 14px"
    height: "50px"
  persiana:
    backgroundColor: "{colors.superficie}"
    textColor: "#ffffff"
    rounded: "{rounded.persiana} {rounded.persiana} 0 0"
    padding: "20px"
---

# Design System: CSC Veteranos

## Overview

**Creative North Star: "O Placard Iluminado"**

A app lê-se como o marcador de um campo à noite. O fundo é escuro e ligeiramente
esverdeado, os números são grandes e tabulares, e o dourado do emblema é a única
luz acesa — aparece onde há uma ação a tomar e em mais lado nenhum. A faixa
geométrica verde que atravessa o topo de cada ecrã é a bancada por trás do
marcador: os cartões de vidro deixam-na passar, e é daí que vem a profundidade
de um ecrã que, de outra forma, seria preto e liso.

É oficial sem ser corporativa. As cores são as do manual de normas do clube, o
tipo de letra é pesado e o vocabulário é o da direção — mas há pessoas do outro
lado, e nota-se: o botão cede ao dedo, o telemóvel vibra quando se confirma, os
aniversários do mês enchem uma agenda que de outra forma estaria vazia. A
densidade é alta de propósito. Assume um adulto que quer ver o jogo, a hora, o
campo e a sua resposta sem rolar, não uma app que o leva pela mão.

Quatro coisas que este sistema recusa, e que foram confirmadas: **não é uma app
de apostas** (nada de verde-néon, urgência ou números a piscar), **não é um
dashboard SaaS** (nada de cinzentos neutros, cartões brancos iguais e barra
lateral), **não é uma rede social desportiva** (nada de feed, gostos ou
fotografias grandes de gente a celebrar) e **não é a app de um clube
profissional** (não há loja, bilhetes nem patrocínios — esta equipa é amadora e
não tem nada disso para vender).

**Key Characteristics:**

- Uma só coluna de 480px, em qualquer largura de ecrã, sem exceção.
- Fundo escuro esverdeado com vidro translúcido por cima da faixa do clube.
- Dourado raro e sempre acionável; verde, âmbar e vermelho reservados a estado.
- Archivo pesado (500–900), tamanhos pequenos, maiúsculas espaçadas nas etiquetas.
- Cantos largos (22–30px) e 44px de altura em tudo o que se toca.

## Colors

A paleta é a do manual de normas do clube, dobrada em duas famílias: as cheias,
para superfícies, e as mesmas clareadas, para texto sobre o fundo escuro.

### Primary

- **Dourado do Emblema** (`{colors.dourado-emblema}`): a ação. Botão principal,
  item ativo da barra de navegação, o botão de criar, a sobrancelha da data no
  cartão do próximo jogo. É o que se toca, e a sua raridade é o que o faz
  funcionar.
- **Verde do Clube** (`{colors.verde-clube}`): a cor institucional de superfície.
  Vive no gradiente da faixa do topo e no realce deslizante por trás do separador
  ativo. Escura de mais para uma frase.

### Secondary

- **Verde de Equipamento** (`{colors.verde-equipamento}`): confirmação positiva —
  disse que sim, quota paga, atleta apto. Também os blocos inclinados da faixa,
  a 30% de opacidade.
- **Azul Institucional** (`{colors.azul-institucional}`): a terceira cor do
  clube, usada para categorizar sem julgar — o convívio, na cor do tipo de evento.

### Tertiary

- **Vermelho de Cartão** (`{colors.vermelho-cartao}`): eliminar, recusar, em
  atraso. Nunca decorativo.
- **Âmbar de Aviso** (`{colors.ambar-aviso}`, texto em `{colors.ambar-texto}`):
  **a única cor deste sistema que não é do clube**, e existe porque o dinheiro
  precisa de um estado entre o pago e o em atraso. Uma quota que vence daqui a
  três dias não é verde nem vermelha. Fora do dinheiro e do ponto que marca uma
  jornada por lançar, não se usa.

### Cores da faixa

Não são tokens de interface — são a matéria de que a faixa do topo é feita, e
por isso vivem só ali e na moldura do ecrã de entrada.

- **Verde Vivo da Faixa** (`{colors.faixa-verde-vivo}`): o início do gradiente,
  no canto superior esquerdo.
- **Verde de Fundo da Faixa** (`{colors.faixa-verde-fundo}`): onde o gradiente
  aterra antes de se esbater para o fundo da página, e a cor do bloco inclinado
  da direita.

### Neutral

- **Fundo de Noite** (`{colors.fundo}`): a página inteira, e a única cor que
  chega às margens do ecrã num monitor largo.
- **Superfície Elevada** (`{colors.superficie}`): um degrau acima do fundo, para
  o que flutua — persianas, modais, painéis de diálogo.
- **Tinta sobre Dourado** (`{colors.tinta}`): o texto escuro dentro de um botão
  dourado, e mais nada.
- **Verde, Azul e Vermelho de Leitura** (`{colors.verde-texto}`,
  `{colors.azul-texto}`, `{colors.vermelho-texto}`): as três cores do clube
  clareadas até lerem sobre o fundo. **É esta família que se escreve.**
- **Branco em translucidez**: a escala de leitura real da app.
  `{colors.branco}` para o que decide, `/82` para rótulos sobre vidro, `/70`
  para o inativo, `/62` para a nota secundária. Abaixo de `/62` não se desce.
- **Os brancos de superfície** são quatro, e não se improvisam:
  `{colors.vidro-cartao}` no cartão principal, `{colors.vidro-bloco}` no cartão
  simples, `{colors.fio-forte}` e `{colors.fio}` nos fios que os contornam.
  `{colors.vidro-barra}` é o vidro esverdeado da barra de navegação, e
  `{colors.marca-agua}` é a palavra CASCAIS na faixa.

### Named Rules

**A Regra das Duas Famílias.** Uma cor de superfície nunca se escreve. Verde do
Clube, Verde de Equipamento, Azul Institucional e Vermelho de Cartão são para
fundos, faixas e barras; para uma frase usa-se a mesma cor na versão de leitura.
Ignorar isto dá texto verde-escuro sobre fundo escuro, que é como a app estava
antes de a segunda família existir.

**A Regra da Luz Única.** O dourado é acionável. Se um elemento dourado não
responde ao toque, ou está errado ou é a sobrancelha de um título — e nesse caso
é o único ornamento dourado do ecrã. Dois botões dourados no mesmo ecrã querem
dizer que a ação principal ainda não foi escolhida.

**A Regra da Opacidade que Multiplica.** Um alfa de texto nunca leva `opacity`
por cima: os dois multiplicam-se, e foi assim que o rótulo da barra de navegação
chegou a 3,65:1 de contraste. Ou se baixa o alfa, ou se baixa a opacidade, nunca
ambos.

**A Regra das Três Cores do Dinheiro.** Vermelho em atraso, âmbar a vencer,
verde pago — e uma barra de 3px à esquerda da linha a dizer o mesmo sem se ler
nada. Vivem num sítio só, em `src/components/financeiro/estilos.ts`, e não se
reescrevem à mão em cada ecrã.

## Typography

**Display Font:** Archivo (com Helvetica, sans-serif)
**Body Font:** Helvetica (com Arial, sans-serif)

**Character:** Archivo em pesos altos — 500 a 900, e quase sempre 800 ou 900. É
uma grotesca condensada o suficiente para caber nomes de clube numa coluna de
480px sem truncar, e pesada o suficiente para se ler ao sol com o telemóvel na
mão. O corpo em Helvetica é o contraponto neutro: quando uma frase é para ser
lida e não para ser vista, sai do tipo de display.

### Hierarchy

**O ramo é denso no fundo e esparso no topo**, e isso é a consequência de uma
coluna de 480px que carrega muita informação: entre os 8,5px e os 13px há sete
degraus com meio pixel de diferença entre vizinhos, porque é aí que a app passa
a maior parte do tempo e meio pixel decide se uma linha cabe. Acima dos 16px há
quatro degraus e todos vivem dentro de um primitivo.

- **Herói** (900, 44px, `-0.04em`): o confronto do próximo jogo na Home, que é o
  título dessa página. Existe uma vez em toda a app.
- **Display** (900, 36px, entrelinha 1, `-0.035em`): o título do ecrã.
- **Headline** (900, 28px, `-0.03em`, `tabular-nums`): saldos, contagens,
  resultados. Os dígitos são tabulares para não dançarem quando o valor muda.
- **Número** (900, 22px): o resultado num placar de cartão e a contagem num
  mosaico.
- **Subtítulo** (800, 18px) e **Ênfase** (800, 16px): o cabeçalho de um bloco
  dentro de um cartão. São os dois degraus menos usados, e é de propósito.
- **Título** (800, 14px): o título de um cartão e o nome de uma secção.
- **Linha** (800, 13px) e **Linha forte** (800, 12,5px): o nome numa lista, o
  rótulo de um botão. É aqui que a app fala a maior parte do tempo.
- **Corpo** (400, 12px, entrelinha 1.5) e **Apoio** (400, 11,5px): frases
  inteiras — explicações, moradas.
- **Nota** (400, 11px), **Nota fraca** (400, 10,5px) e **Micro** (400, 10px): a
  segunda linha de uma linha de lista, sempre em branco translúcido.
- **Etiqueta** (800, 9,5px, `0.18em`, maiúsculas) e **Etiqueta de campo** (700,
  9px, `0.1em`): a linha pequena que anuncia uma secção ou nomeia um campo. O
  espaçamento entre letras só assenta em maiúsculas.
- **Pastilha de estado** (900, 8,5px, `0.1em`): o degrau mais pequeno do
  sistema, e só para pastilhas de duas ou três palavras.

**A marca de água não é texto e não conta para o ramo.** É tipo desenhado:
Archivo 900 a 78px na faixa dos ecrãs, e a 96px na moldura do ecrã de entrada,
onde a faixa ocupa o ecrã todo em vez dos 250px do topo. O tamanho entra pela
propriedade `--marca-agua-tamanho`, e é a única coisa que varia: a tinta é uma
só, `{colors.marca-agua}`.

**Degraus fora do ramo, a caminho de sair.** Existem no código e não são
intencionais: 8px, 13,5px, 15px, 17px, 19px, 20px, 24px, 26px e 30px, em cerca
de sessenta sítios. Cada um deles nasceu de um ajuste local que ninguém
reconciliou, e o mais frequente — 15px, em quinze sítios — está a fazer o
trabalho do degrau de 16px. Um ecrã tocado de novo devolve-os ao ramo; não se
acrescentam degraus novos sem os escrever aqui.

### Named Rules

**A Regra da Etiqueta e do Conteúdo.** Numa lista agrupada, o cabeçalho é
etiqueta — maiúsculas pequenas e espaçadas sobre uma banda mais clara — e a linha
é conteúdo, a 13px e peso 800, com um recuo e uma barra de cor à esquerda. Com o
mesmo peso nos dois, a categoria e o item colam-se e não se percebe qual é o
título de qual.

**A Regra do Título que não se Repete.** Um cartão nunca repete o título do ecrã
em que está. Sob um título, o cartão carrega o que o título **não** diz.

**A Regra da Linha que não Ecoa o Cabeçalho.** Dentro de um grupo chamado
"Inscrição — Liga Masters +35", a linha "Liga Masters +35 — Tranche 1" fica
"Tranche 1". O corte é por travessão, e um título de uma parte só fica intacto.

## Layout

**Uma só coluna de 480px, ao meio, em qualquer ecrã.** O `#root` fixa
`max-width: 480px` e os pontos de corte responsivos do Tailwind estão desligados
de propósito (`--breakpoint-*: 9999px`): olham para a janela e não para a coluna,
e num monitor largo poriam grelhas de três colunas dentro de 480px. Uma classe
`sm:` ou `md:` num ficheiro desta app não gera nada.

A coluna tem 18px de margem lateral. Os cartões respiram a 16px por dentro (12px
nas linhas densas de lista), e os blocos separam-se por 12px. O conteúdo acaba
acima da barra de navegação flutuante com `margin-bottom` — nunca
`padding-bottom`, que deixaria o último cartão por baixo da barra.

Cada ecrã abre no topo. A janela volta a zero a cada mudança de caminho e de
`?ver=`, mas **não** quando se abre uma persiana de detalhe: fechá-la tem de
devolver a pessoa ao sítio de onde abriu.

### Named Rules

**A Regra dos 44px.** Tudo o que se toca tem no mínimo 44px de altura. Sem
exceções: pastilhas, separadores, botões de linha, ícones clicáveis. É a razão de
os botões e as pastilhas serem primitivos e não classes à mão — a altura mínima é
a primeira coisa que se perde quando se está a fazer caber uma linha apertada.

**A Regra da Largura Única.** Uma janela estreita e uma janela larga têm de
mostrar exatamente a mesma coisa, centrada. Qualquer diferença entre as duas é um
defeito, e há um teste que o verifica sozinho em todos os ecrãs.

## Elevation & Depth

Duas regras, cada uma no seu sítio. **Dentro do ecrã, a profundidade é vidro:** o
cartão principal é branco a 11% com desfoque de 26px, e o que ele deixa passar é
a faixa verde do topo e o gradiente do fundo. **O que flutua por cima sobe de
tom:** persianas, modais e a barra de navegação assentam em Superfície Elevada
(#2d3532), um degrau acima do fundo, porque um painel da cor exata da página não
se distingue dela.

O desfoque é caro a pintar. O cartão de vidro tem `backdrop-filter`; o cartão
simples, de que há dezenas por ecrã, não tem — a diferença entre os dois não é só
de opacidade.

### Shadow Vocabulary

- **Cartão de vidro** (`0 20px 46px -24px rgba(0,0,0,0.95)`): a sombra larga e
  quase preta que descola o cartão principal da faixa.
- **Barra de navegação** (`0 16px 40px -14px rgba(0,0,0,0.95)`): a barra flutua,
  e a sombra é o que o diz.
- **Persiana** (`0 -20px 60px -12px rgba(0,0,0,0.9)`): projetada para cima, do
  fundo do ecrã.
- **Botão de criar** (`0 0 0 5px rgba(227,192,77,0.14), 0 12px 28px -8px
  rgba(227,192,77,0.5)`): o único halo colorido do sistema, e é o do dourado.

### Named Rules

**A Regra do Esbatimento.** Uma faixa nunca acaba a direito e uma barra
translúcida nunca fica sobre conteúdo cru. A faixa do topo esbate-se para o fundo
antes de o conteúdo começar, e a barra de baixo tem um gradiente por trás — sem
ele, o que passa por trás do vidro entra-lhe pela cara e a barra deixa de se ler.

## Shapes

Cantos largos e consistentes: 15px nos campos de formulário, 22px nos blocos e
pastilhas, 26px no cartão principal e na barra de navegação, 30px no topo de uma
persiana, 44px nos blocos inclinados da faixa, e círculo completo nas bolhas de
número, nos avatares e no botão de criar. Nada nesta app tem cantos vivos.

As bordas são fios de branco translúcido — `/14` no cartão de vidro, `/12` no
simples — e não linhas desenhadas. A faixa do topo é a única geometria com
carácter próprio: um gradiente a 155°, dois blocos de 230–270px inclinados a
`skewY(-14deg)` e `skewY(12deg)` com 44px de raio, e a palavra CASCAIS em
Archivo 900 a 78px, branca a 6,5%, encostada ao canto inferior esquerdo.

## Components

### Buttons

- **Carácter:** táteis e generosos. Cedem ao dedo — `scale(0.97)` no `:active`,
  não numa animação, para não haver nada a correr quando ninguém está a carregar
  — e confirmam com vibração.
- **Shape:** cantos muito largos (24px), 48px de altura, 24px de folga lateral.
- **Dourado:** a ação principal do ecrã, idealmente uma só. Fundo dourado, texto
  em Tinta.
- **Vidro:** a secundária — cancelar, alternativas. Branco a 9% com fio a 20%.
- **Verde:** confirmação positiva. **Perigo:** vermelho a 15% com texto na versão
  de leitura, nunca vermelho cheio com texto branco.
- **Foco:** contorno dourado de 2px com 2px de afastamento, em todos eles.

### Chips

- **Style:** 44px de altura, 22px de raio, 12px em peso 700. Inativa é branco a
  5% com fio a 12% e texto a 70%; ativa toma a cor da sua aparência.
- **State:** sem realce deslizante, ao contrário dos separadores — a pastilha
  ativa muda de fundo no sítio. Leva sempre `aria-pressed`.
- **Semântica:** uma pastilha à vista é navegação. O que filtra fica escondido
  atrás do funil.

### Cards / Containers

- **Cartão de vidro:** o principal de cada ecrã. Branco a 11%, fio a 14%, raio de
  26px, desfoque de 26px com 160% de saturação, e a sombra larga.
- **Cartão simples:** listas e blocos secundários. Branco a 7%, fio a 12%, raio
  de 22px, **sem desfoque**.
- **Internal padding:** 16px, ou 12px nas linhas densas.
- **Grupo:** um grupo de lista é uma caixa só — banda de cabeçalho em cima, um
  fio entre linhas, nada de caixas irmãs.

### Inputs / Fields

- **Style:** a única superfície branca opaca do sistema, e é deliberada — são os
  campos onde se escreve o email e a palavra-passe antes de haver sessão, e o
  contraste máximo ajuda quem escreve num telemóvel ao sol. 50px de altura, raio
  de 15px, texto em Tinta.
- **Label:** por cima, 9px em maiúsculas com `0.1em` de espaçamento, a 60%.
- **Focus:** anel dourado de 2px. **Erro:** anel vermelho, com a nota por baixo
  em Vermelho Suave e `aria-invalid` no campo.

### Navigation

- **Barra inferior flutuante**, ancorada à coluna e não ao ecrã, com 26px de raio
  sobre vidro esverdeado (`rgba(53,61,58,0.9)`) e desfoque de 28px. Cinco lugares,
  com o botão de criar redondo e dourado ao meio.
- **Ativo:** um realce dourado de 22px de raio que **corre por trás** do item
  escolhido, com halo dourado por baixo. O ícone ativo passa a Tinta; os outros
  ficam a branco 82%, com o rótulo a 9px.
- **Separadores de página:** o mesmo mecanismo com a cor trocada — realce em
  Verde do Clube. É um `tablist` a sério: setas andam entre separadores, Home e
  End saltam para as pontas, e só o ativo entra na ordem de tabulação.

### Persiana (BottomSheet)

O componente que carrega o detalhe de qualquer entidade, e a assinatura de
interação da app. Sobe do fundo em 240ms com
`cubic-bezier(0.16, 1, 0.3, 1)`, ocupa **sempre pelo menos 55dvh** (uma persiana
curta colada ao fundo do telemóvel punha o título à altura dos botões do sistema)
e no máximo 90dvh. Alça de arrastar em cima, topo arredondado a 30px, fundo em
Superfície Elevada, e o item que mostra vai no endereço — há link próprio, e o
retroceder do browser fecha.

### Faixa do topo

A assinatura visual, atrás do conteúdo (`-z-10`) e não em `background` do ecrã: é
o que os cartões de vidro têm para deixar passar. 250px nos ecrãs de lista, 340px
na Home, onde o próximo jogo é o título da página. É decorativa e está marcada
como tal para o leitor de ecrã.

## Do's and Don'ts

### Do:

- **Do** usar os primitivos: `CartaoVidro` para o cartão principal de um ecrã,
  `CartaoSimples` para listas e blocos, e `Botao`, `Pastilha`, `TituloEcra`,
  `EtiquetaSeccao` e `FilaSeparadores` para o resto. Escritos à mão, divergem ao
  terceiro ecrã.
- **Do** dar 44px de altura a tudo o que se toca, incluindo pastilhas e
  separadores.
- **Do** escrever o texto colorido na família de leitura
  (`{colors.verde-texto}`, `{colors.azul-texto}`, `{colors.vermelho-texto}`), e
  guardar as cores cheias para superfícies.
- **Do** desenhar o estado vazio como o caso normal. Nesta app é a norma: nove
  respostas em mil e duzentas convocatórias, duas fichas de adversário, jornadas
  por lançar.
- **Do** desenhar um escudo quando falta o emblema de um clube, nunca as
  iniciais — a sigla já está na linha ao lado.
- **Do** acabar a coluna acima da barra de navegação com `margin-bottom`.
- **Do** dar `role="dialog"`, nome acessível e foco lá para dentro a qualquer
  painel que abra por cima, e fechá-lo com Escape.

### Don't:

- **Don't** usar emoji na interface. Cada telemóvel desenha-os à sua maneira e os
  leitores de ecrã leem-nos por extenso — um cartão amarelo é uma marca desenhada
  com texto escondido a dizer o que é.
- **Don't** pôr dois botões dourados no mesmo ecrã.
- **Don't** dar tom a um modal. O painel é sempre Superfície Elevada; se algum
  dia for preciso um painel verde, é uma prop nova com o nome da cor.
- **Don't** fazer de um `div` com `onClick` um cartão clicável. Se puder ser
  `<button>`, é; quando não puder, leva papel, `tabIndex`, resposta a Enter e
  Espaço, e um rótulo que diga o que abre.
- **Don't** escrever classes `sm:`, `md:` ou `lg:` — não geram nada nesta app.
- **Don't** somar um alfa de texto a uma `opacity`.
- **Don't** repetir o título do ecrã dentro do primeiro cartão desse ecrã.
- **Don't** cortar uma descrição que possa quebrar. Numa linha de caixa, é a
  descrição o que se lê primeiro.
- **Don't** esconder linhas para dizer que estão desatualizadas. Um convocado que
  ficou lesionado continua na lista, marcado.
