# Handoff: redesenho da app do CSC Veteranos

## Visão geral

Redesenho completo do interface da app de gestão do clube de veteranos (repositório `rpmariano/csc-vet`, branch `main`, commit de referência `29840edf4061`). Cobre a entrada na app, os ecrãs do jogador, os do treinador, os da direção, a gestão de dados (adversários, campos, torneios), o módulo financeiro completo, os estados vazios e as notificações.

A linguagem visual é a do manual de normas do clube: fundo escuro, faixas geométricas em verde, cartões de vidro (blur + transparência), dourado como cor de ação, tipografia Archivo.

## Sobre os ficheiros de design

Os ficheiros HTML deste pacote são **referências de design**, não código de produção. São protótipos que mostram o aspeto e o comportamento pretendidos.

A tarefa é **recriar estes ecrãs no ambiente existente da app** — React + TypeScript + Vite + Tailwind + Supabase, com as convenções que já lá estão (`src/pages`, `src/components`, `src/context`, `supabase` client, `AuthContext`, `ClubContext`) — e não copiar o HTML. As classes utilitárias, os componentes e o router já existem; o que muda é o aspeto, a estrutura de navegação e alguns fluxos novos.

## Fidelidade

**Alta fidelidade.** Cores, tipografia, espaçamentos, raios, sombras e animações estão definidos e devem ser reproduzidos com fidelidade, usando Tailwind e os tokens abaixo. O conteúdo é de exemplo (nomes, valores, datas) — os dados vêm do Supabase.

## Onde está cada coisa

Cada ecrã tem um código, visível como crachá no canto superior esquerdo do cartão em `Ecrãs Jogador.dc.html`. Abre o ficheiro no browser e procura o crachá.

| Código | Ecrã | Perfil |
| --- | --- | --- |
| 1a | Agenda | jogador |
| 1b | Fichas de jogo (lista) | jogador |
| 1c | Classificações | jogador |
| 1d | Estatísticas | jogador |
| 2a | Ficha de jogo — consulta | jogador |
| 2b | Ficha de jogo — registar | treinador |
| 2c | Detalhe do evento e ações | ambos |
| 2d | Torneios e jornadas | treinador |
| 2e | Criar ou editar evento | treinador |
| 2f | Quórum e convocados | treinador |
| 3a | Plantel | treinador |
| 3b | Ficha do atleta | treinador |
| 3c | Editar atleta | treinador |
| 3d | Ligar conta ao atleta (popup) | direção |
| 4a | Persiana de um convocado | treinador |
| 4b | Folha do [+] | treinador |
| 4c | Alerta de evento sem convocatória | treinador |
| 4d | Persiana do alerta | treinador |
| 4e | Agenda com evento em falta | treinador |
| 4f | Convocatória depois de guardar | treinador |
| 4g | Treino depois de guardar | treinador |
| 5a | Comunicados | todos |
| 5b | Perfil | todos |
| 6a | Clube | todos (bloco Gestão bloqueado) |
| 7a | Cabeçalho da Home | jogador |
| 7b | Competição | jogador |
| 8a–8d, 8f, 8g | Financeiro e Quotas (6 separadores) | direção |
| 8e | Novo encargo (popup) | direção |
| 8h | Lançar despesa ou receita (popup) | direção |
| 8i | Pagar tranche e nova categoria (popups) | direção |
| 9a | Novo torneio (popup) | treinador |
| 9b | Novo comunicado (popup) | treinador |
| 9c | Eliminar (popup genérica) | treinador |
| 9d | Adversários | treinador |
| 9e | Novo ou editar adversário (popup) | treinador |
| 9f | Campos | treinador |
| 9g | Novo ou editar campo (popup) | treinador |
| 9h | Ficha do adversário | treinador |
| 9i | Ficha do campo | treinador |
| 10a–10d | Entrar, registar, recuperar, nova palavra-passe | todos |
| 11a–11c | Conta por ligar, agenda vazia, primeiro dia | todos |
| 12a–12c | Notificações, preferências, os meus pagamentos | todos |

Ecrãs substituídos, a ignorar: 5c, 6b, 6c, 6d (versões antigas da tesouraria e do hub de gestão).

`Mapa de Navegação.dc.html` mostra, por área, o que cada ecrã abre — é o documento a usar para garantir que nenhum botão fica sem destino.

## Navegação e perfis

O papel vem de `assignedRoles` (`AuthContext`): `player`, `coach`, `admin`.

**Jogador — barra de três lugares**, sem botão central:
`Hoje · Agenda · Competição`. O Perfil abre na fotografia, no canto do cabeçalho da Home; os Comunicados num ícone ao lado, com contador de não lidos.

**Treinador e direção — barra de quatro lugares com botão central**:
`Hoje · Agenda · [+] · Plantel · Clube`. O [+] abre a folha de criação (4b): Jogo, Treino, Convívio, Comunicado, Jornada.

**Diferenças de acesso**: o jogador tem Home, Agenda, Competição (classificações, fichas de jogo, estatísticas), Perfil, Comunicados e Os meus pagamentos. O treinador tem tudo isso mais Plantel, criação de eventos, convocatórias, fichas de jogo, torneios, adversários e campos. A direção acrescenta o Financeiro e Quotas. A página Admin desapareceu: tudo o que era gestão vive no ecrã Clube, num bloco marcado com 🔒.

## Tokens

### Cores

| Token | Valor | Uso |
| --- | --- | --- |
| Fundo | `#0e1011` | fundo dos ecrãs |
| Fundo de cartão de vidro | `rgba(255,255,255,.09)` + `backdrop-filter: blur(26px) saturate(160%)` | cartão principal |
| Fundo de cartão simples | `rgba(255,255,255,.055)`, borda `rgba(255,255,255,.1)` | listas e blocos |
| Verde escuro | `#164f16` | faixas, realce dos separadores |
| Verde do clube | `#009662` | confirmações, estados positivos |
| Verde claro (texto) | `#4ecf9d` | texto sobre fundo escuro |
| Dourado | `#e3c04d` | ações principais, barra de navegação ativa, [+] |
| Azul institucional | `#005296` / texto `#7fb3e0` | convívios, posições, etiquetas |
| Vermelho | `#ef3223` / texto `#f08a7f`, `#f0b8b0` | atrasos, erros, eliminar |
| Tinta sobre dourado | `#121415` | texto em botões dourados |
| Barra de navegação | `rgba(24,28,29,.86)` + `blur(28px) saturate(160%)` | barra inferior |

Faixa geométrica do topo: `linear-gradient(155deg,#164f16,#0a2b16 62%,#0e1011)` com dois blocos `transform: skewY(±12–14deg); border-radius:44px` e a marca de água "CASCAIS" em `font:900 78px/.8 Archivo; color:rgba(255,255,255,.065)`.

### Tipografia

Archivo (Google Fonts, pesos 500–900) para títulos, números e etiquetas; Helvetica/Arial para texto corrido.

| Uso | Estilo |
| --- | --- |
| Título de ecrã | `font:900 36px/1 Archivo; letter-spacing:-.035em` |
| Título de cartão | `font:800 14–17px Archivo` |
| Etiqueta de secção | `font:800 9–10px Archivo; letter-spacing:.14–.24em` |
| Texto corrido | `font:400 11–12px/1.55 Helvetica` |
| Números grandes | `font:900 22–34px/1 Archivo; letter-spacing:-.03em` |
| Valores e IBAN | `ui-monospace, Menlo, monospace` |

### Espaçamento, raios e alvos

- Moldura do telefone no protótipo: 392 × 846 px.
- Coluna de conteúdo: `padding: 0 18px`, `gap: 13–16px`.
- Raios: cartão de vidro 24–26px, cartão simples 20–22px, campo de formulário 14–15px, pastilha 22px, persiana 30px no topo.
- **Todos os alvos de toque têm no mínimo 44px de altura.** Sem exceções — inclui chips, separadores e botões de linha.
- A coluna de scroll termina acima da barra: usar `margin-bottom: 104px` (barra de três) ou `110px` (barra com [+]), nunca `padding-bottom`, senão o último elemento fica debaixo da barra.

### Sombras

- Cartão de vidro: `0 20px 46px -24px rgba(0,0,0,.95)`
- Barra de navegação: `0 16px 40px -14px rgba(0,0,0,.95)`
- Persiana: `0 -20px 60px -12px rgba(0,0,0,.9)`
- [+]: `0 0 0 5px rgba(227,192,77,.14), 0 12px 28px -8px rgba(227,192,77,.5)`

## Animações

**Realce deslizante ("minhoca")** — usado na barra inferior e nos separadores das páginas. Um bloco absoluto atrás dos itens, que anima as duas arestas com tempos diferentes: a da frente chega primeiro, a de trás vai atrás.

- Avanço: `transition: right .5s cubic-bezier(.3,.85,.25,1), left .68s cubic-bezier(.45,0,.2,1) .18s`
- Recuo: as propriedades trocam (`left` rápido, `right` atrasado).
- O bloco é dourado `#e3c04d` na barra inferior e verde escuro `#164f16` nos separadores das páginas — a distinção é intencional.
- O ícone do item ativo desce 8px (`transform: translateY(8px)`) com `.42s cubic-bezier(.34,1.5,.56,1) .3s`, e o rótulo desaparece (`opacity:0`), ficando só o ícone sobre o realce.
- Nos separadores, a fila rola sozinha para centrar o ativo (`scrollLeft = L + W/2 − clientWidth/2`), nunca `scrollIntoView`.

Botões: `transform: scale(.96–.97)` ao premir, `transition .16s`.

## Fluxos novos ou alterados

1. **Guardar evento leva à convocatória.** Jogo e convívio: ao guardar (2e) abre a convocatória (4f), com "Todos os aptos", "Repetir última" e "Limpar"; lesionados e inativos entram desmarcados. Treino: a convocatória é automática (todos os aptos) e o que aparece é a confirmação (4g). Em qualquer dos casos existe **guardar como rascunho** — ninguém é avisado e o evento não entra no alerta.
2. **Alerta de evento sem convocatória.** A menos de sete dias, quem gere vê ao entrar uma barra flutuante (4c) que abre uma persiana (4d) com os eventos em falta e o atalho para convocar. Rascunhos não entram.
3. **Quotas por atleta.** No editar atleta (3c), bloco "Quotas deste atleta": data de início de atividade (preenchida automaticamente ao passar a ativo, editável), data de fim (gravada ao inativar — as quotas seguintes deixam de ser devidas e os totais são recalculados) e meses dispensados de quota.
4. **Ligação de conta.** Automática pelo email do registo. Quando falha, a direção resolve na ficha do atleta (3b → 3d): escolhe entre as contas sem atleta. Ligar substitui a anterior, que volta à lista; existe também desligar.
5. **Seguro desportivo deixou de ser especial** — é uma categoria como as outras, e os encargos criam-se na página de encargos (8c → 8e), escolhendo a categoria definida em Definições (8g).
6. **Recuperar palavra-passe** (10c → 10d): não existe hoje. Pedido por email, link de uso único válido uma hora, ecrã de nova palavra-passe. Quem entrou com Google não tem palavra-passe.
7. **Notificações** (12a, 12b): não existem hoje. Convocatória (com resposta no próprio aviso), comunicado, quota em atraso; para quem gere, evento sem convocatória e ficha por preencher. Preferências no Perfil, com silêncio das 23h às 8h.
8. **Os meus pagamentos** (5b → 12c): o jogador vê o total em dívida, os meses de quota pagos e em falta, os encargos e o IBAN do clube. O mês só fica pago quando o tesoureiro o registar.

## Módulo financeiro

Os seis separadores são os do `FinancePage` atual: Visão Geral, Quotas, Encargos, Despesas/Receitas, Movimentos, Definições.

- **Visão Geral (8a)**: cartões Saldo Disponível, Total Recebido, Total Pago e Saldo Previsto no Fim da Época; alerta de Pagamentos Programados com os que estão em atraso; Previsão da Época (fotografia do plano); Situação de Quotas dos Atletas; Valor Recebido por Categoria com objetivo, percentagem e excedente. Acrescentados (marcados "novo" no protótipo): saldo mês a mês, anel de cobrança e cartão "para fechar o plano".
- **Quotas (8b)**: matriz jogador × mês; tocar marca pago e grava logo; arrastar cobre meses seguidos; meses fora do período do atleta ficam tracejados.
- **Encargos (8c)**: valor por jogador × participantes, categoria, encargo intermediário (o clube recebe e volta a pagar, saldo a tender para zero), bloqueio quando está tudo pago; lista de Pagamentos Programados com tranches e prazos; saldo por categoria com estado "em progresso" ou "concluída".
- **Despesas/Receitas (8f)**: totais, categorias com recebido e pago, lançamentos avulsos. O lançamento (8h) tem só os campos reais de `transactions`: tipo, descrição, valor, data e categoria.
- **Movimentos (8d)**: origem quota, encargo ou avulso, agrupados por mês, com filtros e exportação.
- **Definições (8g)**: mês de início e de fim da época, valor da quota, dia de vencimento (o próprio dia ainda conta; o incumprimento começa no dia seguinte), meses sem quota, categorias com "aceita receita". A elegibilidade para quota é regra do sistema, não definição.

## Vocabulário a respeitar

Vem do código e deve ser mantido:

- Posições: GR, LE, DCE, DCD, LD, MDC, ME, MD, MCO, PL (`SoccerPitchSelector`).
- Estados do atleta: Apto, Lesionado, Inativo; atividade Ativo/Inativo é da direção, o estado físico é alternado pelo próprio.
- Nome mostrado: alcunha em destaque, nome completo abaixo.
- Tipos de evento: jogo, treino, convívio; estados ativo e rascunho.
- Participação na ficha de jogo: titular, suplente usado, suplente não usado, não convocado.
- Confirmações de eliminar usam a linguagem do código: "Todas as convocatórias e respostas associadas serão apagadas."

## Campos novos na base de dados

Estes ecrãs pressupõem colunas que hoje não existem:

- `profiles`: pé preferido; data de início e de fim de atividade para efeito de quotas; meses dispensados de quota.
- `tournaments`: entidade organizadora; imagem do torneio.
- Notificações: tabela de preferências por utilizador e registo de envios.
- Recuperação de palavra-passe: usar o fluxo do Supabase (`resetPasswordForEmail`), sem tabela nova.
- Contas sem atleta: já é possível listar perfis sem ligação, mas convém uma vista para o ecrã 3d.

## Estado atual da app (referência)

- `src/pages/Login.tsx` — email e palavra-passe, Google, alternador de registo. O nome do clube está fixo em código; passa a vir de `club_settings`.
- `src/pages/SettingsPage.tsx` — as sete secções da ficha do atleta; o bloco desportivo é só de leitura.
- `src/pages/TeamManagementPage.tsx`, `src/components/SoccerPitchSelector.tsx` — plantel, posições, estados.
- `src/pages/FinancePage.tsx`, `src/lib/finance.ts` — quotas, encargos, movimentos, definições da época.
- `src/pages/EventsPage.tsx`, `CalendarPage.tsx` — eventos e convocatórias.
- `src/pages/AdminDashboard.tsx` — torneios, campos, adversários, dados do clube (a desmembrar para o ecrã Clube).
- `src/pages/StandingsPage.tsx`, `MatchReportsPage.tsx`, `StatsPage.tsx`, `AnnouncementsPage.tsx`, `Home.tsx`.

## Assets

- `public/cascais-emblem.png` — brasão do clube, usado nos placares, no cabeçalho e no ecrã de entrada. Vem do próprio repositório.
- `public/logo-clube.png` — logótipo vertical.
- Sem ícones de biblioteca: os ícones do protótipo são formas geométricas em CSS. Na implementação, usar o `lucide-react` que já está no projeto, mantendo o traço fino e o tamanho.

## Ficheiros neste pacote

- `Ecrãs Jogador.dc.html` — todos os ecrãs, agrupados por turnos, cada um com o seu crachá.
- `Mapa de Navegação.dc.html` — o mapa de navegação e as ligações entre ecrãs.
- `Home Redesign.dc.html` — as primeiras propostas da Home, com a versão aprovada.
- `support.js` — runtime necessário para abrir os dois ficheiros no browser.
- `public/` — brasão e logótipo.

Abrir os `.html` diretamente no browser. São documentos de leitura: cada cartão é um ecrã de telefone, com os separadores e as barras funcionais para se ver as animações.
