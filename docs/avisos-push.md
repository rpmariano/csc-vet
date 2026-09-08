# Avisos por notificação push

O que falta para os avisos saírem, e o que já está feito.

## Já está

| Peça | Onde |
|---|---|
| Subscrições por dispositivo | tabela `push_subscriptions` (RLS: cada um só vê as suas) |
| As regras do que se envia | `public.avisos_pendentes()` — só o `service_role` a pode chamar |
| Registo do que saiu | `public.registar_envio()` + `notification_deliveries` |
| Receção no telemóvel | `public/push-sw.js`, importado pelo service worker gerado |
| Subscrever / cancelar | `src/lib/push.ts` e o ecrã 12b (`PreferenciasAvisos`) |
| Envio | Edge Function `enviar-avisos`, já publicada |
| Relógio | `.github/workflows/avisos.yml`, de 15 em 15 min entre as 7h e as 23h |

## Falta (e só a direção o pode fazer)

**1. Gerar o par de chaves VAPID.** São a identidade de quem envia:

```bash
node scripts/gerar-chaves-vapid.mjs
```

Não descarrega nada — é só uma chave P-256, e o Node sabe fazê-las sozinho.

O `npx web-push generate-vapid-keys` faz o mesmo, mas no PowerShell desta
máquina é recusado: a política de execução não deixa correr o `npx.ps1`
(«running scripts is disabled on this system»). Quem preferir esse caminho
chama o `.cmd`, que passa ao lado do wrapper de PowerShell:

```bash
npx.cmd web-push generate-vapid-keys
```

O script escreve as duas num ficheiro, `chaves-vapid.local.txt`, e é **de lá
que se copiam**: a pública tem 87 caracteres e quebra em duas linhas em
qualquer terminal, o que leva a copiá-la a meio — e o servidor de push
responde então «Vapid public key should be 65 bytes long when decoded».

Comprimentos, para conferir o que colaste:

| Chave | Caracteres |
|---|---|
| `VAPID_PUBLIC_KEY` | 87 |
| `VAPID_PRIVATE_KEY` | 43 |

A pública é pública mesmo — vai no bundle da app, como a chave anónima do
Supabase. **A privada vai só para os segredos do Supabase**: nem para o
repositório, nem para um chat. O ficheiro está no `.gitignore`; apaga-o depois
de guardares as chaves.

**2. Pôr os segredos no Supabase** (Project Settings → Edge Functions →
Secrets), para a função `enviar-avisos`:

| Nome | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | a chave pública |
| `VAPID_PRIVATE_KEY` | a chave privada — **nunca no repositório** |
| `VAPID_SUBJECT` | `mailto:` mais um email do clube |
| `AVISOS_TOKEN` | a senha do passo 4, igual à do GitHub |

**3. Pôr a chave pública no build da app.** No `.env` local e no segredo
`VITE_VAPID_PUBLIC_KEY` do GitHub (o workflow de deploy tem de o passar ao
`npm run build`):

```
VITE_VAPID_PUBLIC_KEY=<a chave pública>
```

Sem ela, o ecrã de avisos diz "o envio ainda não está configurado no servidor"
em vez de mostrar um botão que não faz nada.

**4. Pôr os segredos no GitHub** (Settings → Secrets → Actions):

| Nome | Valor |
|---|---|
| `SUPABASE_FUNCTION_URL` | `https://vwvsfrzwcwdvbuaxftoh.supabase.co/functions/v1/enviar-avisos` |
| `AVISOS_TOKEN` | uma senha longa à tua escolha — a **mesma** que puseres no `AVISOS_TOKEN` dos segredos da função no Supabase |

O `AVISOS_TOKEN` é só a chave desta porta. **Não uses a chave de serviço do
Supabase para isto**: foi o que estava, e dava 401 sem se perceber porquê — a
chave que a plataforma injeta na função e a que se copia do painel podem não
ser a mesma, porque o Supabase está a passar as chaves antigas em JWT para o
formato novo `sb_secret_…`. Um segredo próprio não depende dessa migração.

Inventa-o como quiseres; serve, por exemplo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**5. Reconstruir a app.** Um segredo só entra no bundle quando a app é
construída de novo. Actions → **Deploy to GitHub Pages** → Run workflow.

**6. Correr uma vez à mão** — Actions → "Enviar avisos" → Run workflow — e ver
a resposta: `{"enviados":N,"falhados":0,"caixas_apagadas":0}`.

## O que cada aviso é

| Tipo | Quando | Leva a |
|---|---|---|
| `convocatoria` | convocado e ainda sem resposta (treinos só a 6 dias) | `/calendar?event=` |
| `comunicado` | publicado há menos de 14 dias e por ler | `/` |
| `quota` | mês de quota vencido e por pagar | `/settings` |
| `sem-convocatoria` | evento futuro sem ninguém convocado (só quem gere) | `/events?convocatoria=` |
| `ficha` | jogo passado sem resultado (só quem gere) | `/competicao?ver=fichas&jogo=` |

O mesmo assunto só sai uma vez: `notification_deliveries` guarda
`(profile_id, tipo, origem_id)` e a fila exclui o que lá está.

O silêncio da noite de cada pessoa (23h–08h por omissão) é aplicado **dentro da
consulta**, com a hora de Lisboa — a base corre em UTC, e uma janela que
atravessa a meia-noite testa-se ao contrário.

## No iPhone

O Safari só dá notificações push a uma PWA **instalada no ecrã principal**
(iOS 16.4+). Num Safari normal o ecrã de avisos diz isso em vez de oferecer um
botão que não funciona.
