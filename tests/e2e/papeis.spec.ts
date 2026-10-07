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

function fixtures(papel: 'player' | 'coach' | 'admin' | 'supporter') {
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
/* Os Comunicados abrem a todos desde 2026-09-25: é para lá que o sino leva, e
   quem só lê lê-os ali. O que é da gestão — publicar, editar — só aparece a
   treinador e direção. */
const DE_TODOS: string[] = ['', 'calendar', 'competicao?ver=classificacoes', 'competicao?ver=fichas',
  'competicao?ver=estatisticas', 'settings', 'announcements']
const DE_GESTAO: string[] = [
  'events', 'team-management',
  // O Clube é o índice da gestão, e as quatro secções que ele abre.
  'clube', 'clube?ver=dados', 'clube?ver=campos', 'clube?ver=adversarios', 'clube?ver=torneios',
]
const SO_DIRECAO: string[] = ['finance']

interface Perfil {
  papel: 'player' | 'coach' | 'admin' | 'supporter'
  barra: string[]
  abre: string[]
  /** Rotas que este papel não tem: têm de devolver à Home. */
  fecha: string[]
}

const PERFIS: Perfil[] = [
  { papel: 'supporter', barra: ['Hoje', 'Agenda', 'Competição'], abre: DE_TODOS, fecha: [...DE_GESTAO, ...SO_DIRECAO] },
  { papel: 'player', barra: ['Hoje', 'Agenda', 'Competição'], abre: DE_TODOS, fecha: [...DE_GESTAO, ...SO_DIRECAO] },
  { papel: 'coach', barra: ['Hoje', 'Agenda', 'Competição', 'Clube'], abre: [...DE_TODOS, ...DE_GESTAO], fecha: SO_DIRECAO },
  { papel: 'admin', barra: ['Hoje', 'Agenda', 'Competição', 'Clube'], abre: [...DE_TODOS, ...DE_GESTAO, ...SO_DIRECAO], fecha: [] },
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

test('administrador não-programador (ex: João Matuto) não vê "Ver a app como" e limpa resíduos de simulação', async ({ page }) => {
  const perfilNaoDev = {
    id: '00000000-0000-4000-8000-000000000099',
    name: 'João Matuto',
    email: 'jocamatuto@gmail.com',
    role: 'admin',
    roles: ['admin'],
    status: 'active',
    jersey_number: 10,
    shirt_name: 'MATUTO',
    nickname: 'Matuto',
    position: 'Médio',
    photo_url: null,
    phone: null,
    birth_date: '1980-01-01',
  }

  await montarSupabaseFalso(page, {
    profiles: [perfilNaoDev],
    v_players_public: [soPlantel(perfilNaoDev)],
    club_settings: [{ id: 1, home_field_id: null, club_name: 'GDS Cascais', initials: 'CSC' }],
  })

  // Simular resíduo de simulação em localStorage deixado antes da restrição
  await page.addInitScript(() => {
    window.localStorage.setItem('csc_simulated_role', 'coach')
  })

  await page.goto('/csc-vet/settings')
  await page.waitForLoadState('networkidle')

  // O bloco de simulação não deve ser visível para não-desenvolvedores
  await expect(page.getByText('Ver a app como')).not.toBeVisible()

  // O resíduo deve ter sido limpo automaticamente do localStorage
  const simulatedRoleNoStorage = await page.evaluate(() => window.localStorage.getItem('csc_simulated_role'))
  expect(simulatedRoleNoStorage).toBeNull()

  // Deve manter o seu cargo real de Direção
  await expect(page.getByText('Administrador / Direção')).toBeVisible()
})

test('programador (rpmariano@gmail.com) vê "Ver a app como" e pode alternar perfil', async ({ page }) => {
  const perfilDev = {
    id: '00000000-0000-4000-8000-000000000088',
    name: 'Rui Mariano',
    email: 'rpmariano@gmail.com',
    role: 'admin',
    roles: ['admin'],
    status: 'active',
    jersey_number: 17,
    shirt_name: 'MARIANO',
    nickname: 'Mariano',
    position: 'Defesa',
    photo_url: null,
    phone: null,
    birth_date: '1981-02-28',
  }

  await montarSupabaseFalso(page, {
    profiles: [perfilDev],
    v_players_public: [soPlantel(perfilDev)],
    club_settings: [{ id: 1, home_field_id: null, club_name: 'GDS Cascais', initials: 'CSC' }],
  })

  await page.goto('/csc-vet/settings')
  await page.waitForLoadState('networkidle')

  // O bloco deve estar visível
  await expect(page.getByText('Ver a app como')).toBeVisible()

  // Deve ter botões para Direção, Treinador, Jogador, Adepto
  const btnTreinador = page.getByRole('button', { name: 'Treinador' })
  await expect(btnTreinador).toBeVisible()

  // Clicar em Treinador deve ativar a simulação
  await btnTreinador.click()
  const simulatedRoleNoStorage = await page.evaluate(() => window.localStorage.getItem('csc_simulated_role'))
  expect(simulatedRoleNoStorage).toBe('coach')
})

test('adepto não vê sinal de pagamentos, não tem "Os meus pagamentos" nem opção de quotas nos avisos', async ({ page }) => {
  const perfilAdepto = {
    id: '00000000-0000-4000-8000-000000000077',
    name: 'Adepto Fiel',
    email: 'adepto@clube.pt',
    role: 'supporter',
    roles: ['supporter'],
    status: 'active',
    jersey_number: null,
    shirt_name: null,
    nickname: null,
    position: null,
    photo_url: null,
    phone: '912345678',
    birth_date: null,
  }

  await montarSupabaseFalso(page, {
    profiles: [perfilAdepto],
    v_players_public: [soPlantel(perfilAdepto)],
    club_settings: [{ id: 1, home_field_id: null, club_name: 'GDS Cascais', initials: 'CSC' }],
    financial_settings: [{
      id: 1, season_start_month: 9, season_end_month: 7,
      quota_amount: 15, quota_excluded_months: [8], quota_due_day: 8,
    }],
    notification_preferences: [{
      profile_id: perfilAdepto.id,
      convocatorias: true,
      comunicados: true,
      quotas_em_atraso: false,
    }],
  })

  // 1. Na Home, não deve aparecer o sinal de € de pagamentos nem a faixa de convite com quotas
  await page.goto('/csc-vet/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('button[aria-label*="pagamento"]')).toHaveCount(0)
  await expect(page.getByText('Não estás a receber avisos')).not.toBeVisible()

  // 2. Nas Definições, não deve ter o cartão "Os meus pagamentos"
  await page.goto('/csc-vet/settings')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Os meus pagamentos')).not.toBeVisible()

  // 3. Ao abrir "Avisos", não deve listar a opção de Quotas
  await page.getByRole('button', { name: /Avisos/i }).click()
  await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible()
  await expect(page.getByText('Apoio à equipa')).toBeVisible()
  await expect(page.getByText('Comunicados', { exact: true })).toBeVisible()
  await expect(page.getByText('Quotas', { exact: true })).not.toBeVisible()
})

