# Prompt para o Claude Code

Copia o texto abaixo para o Claude Code, com a pasta `design_handoff_app_veteranos/` na raiz do repositório.

---

Lê `design_handoff_app_veteranos/README.md` e `docs/ecras-por-desenhar.md` antes de escrever código. Os ficheiros `.dc.html` da pasta são referências visuais: abre-os para ver os ecrãs, mas não copies o HTML — implementa em React + Tailwind com os primitivos que já existem em `src/components/ui`.

São dois trabalhos, por esta ordem.

**1. Passagem de paleta, em toda a app.** É uma troca de tokens, nenhum ecrã muda de estrutura:

- fundo: `#0e1011` → `#262d2b`
- faixa do topo: `linear-gradient(155deg,#164f16,#0a2b16 62%,#0e1011)` → `linear-gradient(155deg,#22691f,#17452a 62%,#262d2b)`
- blocos inclinados da faixa: `rgba(11,45,11,.5/.65/.7)` → `rgba(23,69,42,.45/.55/.6)`
- cartão de vidro: branco `.09` → `.11`; cartão simples `.055` → `.07`; bordas `.1` → `.12`
- barra de navegação: `rgba(24,28,29,.86)` → `rgba(53,61,58,.9)`
- **persianas e modais: `rgba(24,28,29,.96–.98)` → `rgba(45,53,50,.96–.98)`.** Sem isto ficam mais escuros do que a página e a elevação lê-se ao contrário.
- **texto secundário:** os alfas de leitura `.38`–`.55` → `.62`, e `.5` → `.6`. Os rótulos inativos da barra de navegação passam a `.82` com `opacity:1` (se houver um `opacity` a multiplicar o alfa, remove-o). Na faixa verde, que é mais clara que a página, o texto pequeno precisa de `.85` ou de tinta cheia.
- **não mexas** nos alfas decorativos: a marca de água "CASCAIS" (`.05`–`.08`), os chevrons `›`, os dias fora do mês (`.2`–`.35`).
- verde, dourado, azul e vermelho não mudam.

Depois desta passagem, verifica o contraste: texto pequeno a 4,5:1 sobre a superfície onde assenta, e a superfície mais exigente é o interior de um cartão de vidro, não a página.

**2. A Home.** É o ecrã que ficou de fora da implementação anterior. A versão a fazer é o cartão **4a** do `Home Redesign.dc.html` — os cartões dos turnos anteriores desse ficheiro são explorações e não se implementam. A secção "A Home" do README descreve os seis blocos por ordem. Três coisas que costumam falhar: os carrosséis do jogo, do "por responder" e da classificação levam o traço com o mesmo efeito deslizante da barra de navegação; o traço fica centrado em baixo dentro do cartão; e a coluna de scroll termina acima da barra (`margin-bottom`, não `padding-bottom`), para o traço não passar por trás dela.

Duas regras de vocabulário que se aplicam a tudo o que tocares, incluindo a Home: **não escrevas "presenças" em nenhum ecrã** — a tabela `attendances` nunca é escrita, o que existe é `callups.status`, e uma convocatória em `called` é "sem resposta", não uma falta; e **o estado vazio é a norma** — de 1200 convocatórias, 1191 estão sem resposta, por isso nada de gráficos cheios com dados a fingir.

Restrições do ambiente, que o README detalha: uma só UI, a de telemóvel, numa coluna de 480px (os breakpoints do Tailwind estão desligados — um `sm:` não gera nada); todos os alvos de toque com 44px de altura no mínimo; detalhe abre em persiana e vai no endereço (`?event=`, `?atleta=`); ícones `lucide-react`, sem emoji.

Campos que a base de dados ainda não tem estão listados no README, em "Campos novos na base de dados" — propõe a migração antes de os usares, não inventes colunas.

Não alteres o `ecras-por-desenhar.md`; atualiza-o no fim com o que ficou feito.
