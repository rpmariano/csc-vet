import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * A app vista por cada perfil.
 *
 * O resto da suite corre sempre como **admin** — é o que o mock cria por
 * omissão —, e por isso nada exercitava o que o jogador e o treinador veem: a
 * barra de baixo por perfil, e as rotas que o `ProtectedRoute` lhes fecha. Num
 * redesenho que mudou precisamente a navegação por perfil, isso era o maior
 * vazio da rede.
 *
 * Verifica três coisas por papel: os lugares da barra, que as rotas próprias
 * abrem, e que as outras devolvem à Home. Mais: que nenhuma delas rebenta nem
 * fica em branco — um `pageerror` ou um ecrã vazio contam como falha.
 */

const AMANHA = new Date(Date.now() + 2 * 864e5).toISOString()

const COLUNAS_PLANTEL = [
  'id', 'name', 'nickname', 'shirt_name', 'jersey_number', 'photo_url',
  'position', 'status', 'role', 'roles', 'birth_date',
] as const
const soPlantel = (p: Record<string, unknown>) =>
  Object.fromEntries(COLUNAS_PLANTEL.filter(c => c in p).map(c => [c, p[c]]))

function fixtures(papel: 'player' | 'coach' | 'admin') {
  const eu = {
    id: UTILIZADOR_TESTE.id, name: 'Atleta de Teste', email: UTILIZADOR_TESTE.email,
    role: papel, roles: [papel], status: 'active', jersey_number: 7,
    shirt_name: 'TESTE', nickname: 'Teste', position: 'MDC', photo_url: null,
    phone: null, birth_date: '1980-05-05',
  }
  return {
    profiles: [eu],
    v_players_public: [soPlantel(eu)],
    club_settings: [{ id: 1, home_field_id: null, club_name: 'GDS Cascais', initials: 'CSC' }],
    events: [{
      id: 'e1', title: 'Treino', type: 'practice', date_time: AMANHA, location: 'Estádio',
      is_active: true, home_score: null, away_score: null, meeting_time: null, description: null,
    }],
    callups: [{ id: 'c1', event_id: 'e1', player_id: eu.id, status: 'called', responded_at: null, player: soPlantel(eu) }],
    announcements: [{ id: 'a1', title: 'Aviso', content: 'Corpo', created_at: AMANHA, is_active: true, priority: 'normal' }],
  }
}

/** Rotas de todos, e as que cada papel tem a mais. */
const DE_TODOS: string[] = ['', 'calendar', 'competicao?ver=classificacoes', 'competicao?ver=fichas',
  'competicao?ver=estatisticas', 'settings']
const DE_GESTAO: string[] = ['announcements', 'events', 'admin', 'team-management']
const SO_DIRECAO: string[] = ['finance']

interface Perfil {
  papel: 'player' | 'coach' | 'admin'
  barra: string[]
  abre: string[]
  /** Rotas que este papel não tem: têm de devolver à Home. */
  fecha: string[]
}

const PERFIS: Perfil[] = [
  { papel: 'player', barra: ['Hoje', 'Agenda', 'Competição'], abre: DE_TODOS, fecha: [...DE_GESTAO, ...SO_DIRECAO] },
  { papel: 'coach', barra: ['Hoje', 'Agenda', 'Plantel', 'Clube'], abre: [...DE_TODOS, ...DE_GESTAO], fecha: SO_DIRECAO },
  { papel: 'admin', barra: ['Hoje', 'Agenda', 'Plantel', 'Clube'], abre: [...DE_TODOS, ...DE_GESTAO, ...SO_DIRECAO], fecha: [] },
]

for (const { papel, barra, abre, fecha } of PERFIS) {
  test(`a app como ${papel}`, async ({ page }) => {
    test.setTimeout(120_000)
    const erros: string[] = []
    page.on('pageerror', e => erros.push(`${e.message}`))

    await montarSupabaseFalso(page, fixtures(papel))
    const problemas: string[] = []

    for (const rota of [...abre, ...fecha]) {
      erros.length = 0
      await page.goto('/csc-vet/' + rota)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(400)

      const r = await page.evaluate(() => ({
        onde: location.pathname + location.search,
        // Os lugares da barra: o [+] é só ícone e não entra na lista.
        barra: Array.from(document.querySelectorAll('nav a, nav button'))
          .map(b => (b.textContent || '').trim()).filter(Boolean),
        vazio: document.body.innerText.trim().length < 40,
      }))

      const esperado = fecha.includes(rota) ? '/csc-vet/' : `/csc-vet/${rota}`
      if (r.onde !== esperado) problemas.push(`/${rota} foi parar a ${r.onde} (esperado ${esperado})`)
      if (r.vazio) problemas.push(`/${rota} abriu em branco`)
      if (erros.length) problemas.push(`/${rota} rebentou: ${erros[0].slice(0, 120)}`)
      if (rota === '' && JSON.stringify(r.barra) !== JSON.stringify(barra)) {
        problemas.push(`barra de baixo: ${JSON.stringify(r.barra)} em vez de ${JSON.stringify(barra)}`)
      }
    }

    expect(problemas, problemas.join('\n')).toEqual([])
  })
}
