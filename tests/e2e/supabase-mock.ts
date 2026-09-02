import type { Page, Route } from '@playwright/test'

/**
 * Supabase falso para os testes de fumo.
 *
 * O Vite dos testes arranca apontado a `https://teste.supabase.co` (ver
 * playwright.config.ts), um domínio que não existe: aqui interceta-se tudo o
 * que lhe seja dirigido e responde-se com fixtures em memória. Nenhum teste
 * toca no projeto real nem precisa de credenciais.
 */

const URL_SUPABASE = 'https://teste.supabase.co'
const CHAVE_SESSAO = 'sb-teste-auth-token'

export const UTILIZADOR_TESTE = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'teste@csc-vet.local',
}

/** Linhas devolvidas por tabela; o que não estiver aqui devolve lista vazia. */
export type Fixtures = Record<string, Record<string, unknown>[]>

const PERFIL_ADMIN = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste',
  email: UTILIZADOR_TESTE.email,
  role: 'admin',
  status: 'active',
  jersey_number: 99,
  shirt_name: 'Teste',
  position: 'Médio Centro',
  medical_notes: null,
  photo_url: null,
  phone: null,
}

export const FIXTURES_BASE: Fixtures = {
  profiles: [PERFIL_ADMIN],
  club_settings: [{ id: 1, home_field_id: null, club_name: 'GDS Cascais' }],
  fields: [],
  opponents: [],
  tournaments: [],
  events: [],
  callups: [],
  attendances: [],
  stats: [],
  announcements: [],
  dues: [],
  transactions: [],
}

/** Sessão com validade longa: o cliente aceita-a sem ir à rede renovar. */
function sessaoFalsa() {
  const expiraEm = Math.floor(Date.now() / 1000) + 60 * 60 * 24
  return {
    access_token: 'token-de-teste',
    refresh_token: 'refresh-de-teste',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: expiraEm,
    user: {
      id: UTILIZADOR_TESTE.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: UTILIZADOR_TESTE.email,
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'Utilizador de Teste' },
      identities: [],
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    },
  }
}

/** Nome da tabela em `/rest/v1/<tabela>?...`. */
function tabelaDoPedido(url: string): string {
  const caminho = new URL(url).pathname
  return caminho.replace('/rest/v1/', '').split('/')[0]
}

function responder(route: Route, corpo: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(corpo),
  })
}

/**
 * Instala a sessão e as rotas falsas. Chamar ANTES do primeiro `page.goto`.
 */
export async function montarSupabaseFalso(page: Page, fixtures: Fixtures = {}) {
  const tabelas: Fixtures = { ...FIXTURES_BASE, ...fixtures }

  await page.addInitScript(
    ([chave, sessao]) => {
      window.localStorage.setItem(chave as string, JSON.stringify(sessao))
      // Sem isto, o papel simulado de uma execução anterior contaminava a seguinte.
      window.localStorage.removeItem('csc_simulated_role')
    },
    [CHAVE_SESSAO, sessaoFalsa()] as const,
  )

  // Rede de segurança: qualquer outro Supabase (o real, se alguma configuração
  // escapar) é bloqueado antes de sair para a rede. Registada primeiro porque a
  // rota específica abaixo tem precedência sobre esta.
  await page.route(/https:\/\/(?!teste\.)[a-z0-9-]+\.supabase\.(co|in)\//, route => {
    console.error(`[supabase-mock] pedido bloqueado para fora do Supabase de teste: ${route.request().url()}`)
    return route.abort('blockedbyclient')
  })

  await page.route(`${URL_SUPABASE}/**`, route => {
    const pedido = route.request()
    const url = pedido.url()
    const metodo = pedido.method()

    if (metodo === 'OPTIONS') return responder(route, {})

    if (url.includes('/auth/v1/')) {
      if (url.includes('/logout')) return responder(route, {})
      return responder(route, sessaoFalsa())
    }

    if (url.includes('/rest/v1/')) {
      const linhas = tabelas[tabelaDoPedido(url)] ?? []

      // Escritas: devolver a linha como se tivesse sido gravada, por cima da
      // fixture — assim os campos que a UI assume (nome, papel) nunca faltam.
      if (metodo !== 'GET' && metodo !== 'HEAD') {
        let corpo: unknown = {}
        try {
          corpo = JSON.parse(pedido.postData() || '{}')
        } catch {
          corpo = {}
        }
        const enviadas = Array.isArray(corpo) ? corpo : [corpo]
        const base = linhas[0] ?? {}
        const gravadas = enviadas.map((l, i) => ({ id: `novo-${i}`, ...base, ...(l as object) }))
        const querObjetoNaEscrita = (pedido.headers()['accept'] || '').includes('pgrst.object')
        return responder(route, querObjetoNaEscrita ? gravadas[0] : gravadas, 201)
      }

      // `single()`/`maybeSingle()` pedem um objeto, não uma lista.
      const querObjeto = (pedido.headers()['accept'] || '').includes('pgrst.object')
      if (querObjeto) {
        if (linhas.length === 0) {
          return responder(
            route,
            {
              code: 'PGRST116',
              details: 'The result contains 0 rows',
              hint: null,
              message: 'JSON object requested, multiple (or no) rows returned',
            },
            406,
          )
        }
        return responder(route, linhas[0])
      }

      return responder(route, linhas)
    }

    // Storage, realtime e o resto: resposta vazia em vez de erro de rede.
    return responder(route, {})
  })
}
