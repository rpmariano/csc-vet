# CSC Veteranos — GDS Cascais

PWA de gestão da equipa de futebol de veteranos do GD Sport Cascais.
Interface em **português de Portugal**. Duas UIs no mesmo código: **desktop** (sidebar
fixa de 256px) e **telemóvel** (header + bottom tab bar), separadas pelo breakpoint
Tailwind `md:`.

## Stack

| Camada | Tecnologia |
|---|---|
| Build | Vite 8 (`base: '/csc-vet/'`) + `vite-plugin-pwa` (generateSW, autoUpdate) |
| UI | React 19, React Router 7 (`BrowserRouter`), Tailwind CSS **v4** |
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
├── components/          Layout (nav desktop+mobile), modais partilhados, PWA prompt
├── hooks/
│   ├── useModalA11y     Escape, prisão de foco e pilha de diálogos empilhados
│   └── useEhDesktop     ponto de corte `md:` em JS, para o que muda de estrutura
├── pages/               uma página por rota
├── lib/supabaseClient   cliente único
└── utils/haptics        vibração (navigator.vibrate)
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
`events`, `callups`, `attendances`, `stats`, `announcements`, `dues`, `transactions`,
`club_settings`.

RLS: leitura aberta a qualquer autenticado; escrita restrita a `coach`/`admin` via
`public.get_user_role()` (`SECURITY DEFINER`). Esquema em `supabase_schema.sql` e
`supabase_players_migration.sql`.

## Convenções

- **Design tokens** em `src/index.css` (`@theme` do Tailwind v4), não em `tailwind.config.js`
  (esse ficheiro é legado da v3 e está inerte):
  `csc-dark #164f16` · `csc-light #009662` · `csc-gold #e3c04d` · `csc-blue #005296` ·
  `csc-red #ef3223` · `csc-black #3c3008`. Tipo de letra de display: Montserrat.
- Tipografia densa e pesada: `font-black`, tamanhos `text-[9px]`–`text-sm`, `rounded-xl`/`2xl`.
- Cartões: `bg-white rounded-2xl shadow-sm border border-gray-100`.
- Ações do utilizador disparam `triggerHaptic(...)` e confirmam com `toast.*`.
- **Detalhe é página no desktop, persiana no telemóvel.** Ver um evento ou uma ficha
  de atleta não abre janela nenhuma no desktop: o `<VistaDetalhe>` decide a moldura
  pelo `useEhDesktop()` e o endereço leva o item (`?event=`, `?atleta=`), portanto há
  link próprio e o retroceder do browser fecha. Modais ficam para inserções curtas
  (criar um campo, confirmar) — não para consultar uma entidade. Já assim estão o
  detalhe do evento, a ficha de atleta, o dossier de convocatória e a ficha de jogo;
  quando um detalhe abre outro (ficha de jogo a partir do evento), o de baixo sai da
  frente em vez de se sobreporem.
- Comentários e strings de UI em português.
- Assets públicos são referenciados com o prefixo literal `/csc-vet/` (não com
  `import.meta.env.BASE_URL`).

## Riscos conhecidos (revisto em 2026-09)

1. **P1 — Qualquer autenticado lê a ficha completa de toda a gente.** A política de
   SELECT em `profiles` é `USING (true)` para `authenticated`, e a tabela guarda IBAN,
   NIF, nº de cartão de cidadão, morada e telefone. Basta uma conta no clube para
   descarregar tudo. É o risco real de exposição de dados pessoais — não a chave anónima
   (ver nota abaixo). A correção é restringir a política por coluna ou por papel.
2. **P1 — Escalada de privilégios na UI:** um jogador pode editar o seu próprio
   `medical_notes` e injetar `<!--roles:admin-->`, ganhando a UI de admin. A RLS trava as
   escritas, mas combina-se com o ponto 1 na leitura.
3. **P2 — Ficheiros grandes:** `CalendarPage` tem ~3100 linhas e `EventsPage` ~2900.
   Não há modais escritos à mão sem acessibilidade — todos passaram pelo `<Modal>`,
   `<ConfirmModal>`, `<UnsavedChangesModal>` ou pelo hook `useModalA11y`.

**Sobre o `.env` e a chave anónima.** O `.env` deixou de ser versionado (`cdf2187`) mas
continua no histórico, e a chave que lá está tem `role: anon` — é pública por desenho:
o Vite injeta-a no bundle que qualquer visitante do site descarrega. Rodá-la não muda
nada, porque a nova volta para o mesmo sítio público. O que protege os dados é a RLS,
ou seja, o ponto 1. Nunca foi versionada uma `service_role` — essa sim seria crítica e
teria de ser rodada de imediato.

## Regras de trabalho

- Desenvolvimento na branch indicada pela tarefa; nunca fazer push direto para `main`.
- Antes de cada commit: `npm run lint` e `npm run build` têm de passar.
- Qualquer alteração de UI tem de ser verificada **nas duas** UIs (mobile e desktop).
