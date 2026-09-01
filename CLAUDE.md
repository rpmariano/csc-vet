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

Comandos: `npm run dev` · `npm run build` (`tsc -b && vite build`) · `npm run lint`

## Arquitetura

```
src/
├── App.tsx              Rotas + composição dos 3 providers
├── context/
│   ├── AuthContext      sessão, perfil, papéis, simulação de papel, estado clínico
│   ├── ClubContext      club_settings (id=1), campo de casa
│   └── ToastContext     toasts + singleton global `toast.success(...)`
├── components/          Layout (nav desktop+mobile), modais, PWA prompt
├── pages/               uma página por rota
├── data/initialPlayers  seed do plantel  ⚠️ ver Riscos
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

Vistas de reporting (`supabase_finance_reporting_migration.sql`, ambas `security_invoker`):
`v_financial_movements` (facto único: quotas + encargos + despesas/receitas, com época,
categoria e jogador) e `v_quota_status` (matriz jogador × mês; é o único sítio onde existe
a quota **por pagar** — em `dues` só há linha para as pagas).
A função `public.financial_season(date)` espelha `getSeasonLabel()` de `src/lib/finance.ts` —
qualquer mudança à regra da época tem de ser feita **nos dois sítios**.
Ver `docs/financeiro-campos-reporting.md`.

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
- Comentários e strings de UI em português.
- Assets públicos são referenciados com o prefixo literal `/csc-vet/` (não com
  `import.meta.env.BASE_URL`).

## Riscos conhecidos (auditoria de 2026-08)

1. **P0 — PII real no bundle público.** `src/data/initialPlayers.ts` contém morada, NIF,
   nº de cartão de cidadão, IBAN, telefone e data de nascimento de ~31 pessoas reais, e é
   importado por `AuthContext` → vai para dentro do JS servido publicamente. Não adicionar
   mais dados aqui; mover para a base de dados.
2. **P0 — `.env` com credenciais Supabase está versionado em git.**
3. **P1 — Escalada de privilégios na UI:** um jogador pode editar o seu próprio
   `medical_notes` e injetar `<!--roles:admin-->`, ganhando a UI de admin (a RLS continua a
   travar as escritas, mas a leitura de `profiles` já expõe IBAN/NIF de todos).
4. **P1 — `ProtectedRoute` deixa passar** quando `profile` é `null` e há `allowedRoles`.
5. **P2 —** Bundle único de ~1 MB, sem code-splitting; `CalendarPage` tem 4400 linhas e
   `EventsPage` 3300; 33 modais escritos à mão sem `Escape`, sem *focus trap* e sem
   `role="dialog"`.

## Regras de trabalho

- Desenvolvimento na branch indicada pela tarefa; nunca fazer push direto para `main`.
- Antes de cada commit: `npm run lint` e `npm run build` têm de passar.
- Qualquer alteração de UI tem de ser verificada **nas duas** UIs (mobile e desktop).
