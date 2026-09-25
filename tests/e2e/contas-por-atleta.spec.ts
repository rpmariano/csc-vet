import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE } from './supabase-mock'

/**
 * Contas por atleta — quem deve o quê, o que está a pagamento e o que já
 * entrou, e a mesma coisa em texto para o WhatsApp.
 *
 * O relógio fica parado a 20/09/2026: as regras dependem do dia, e o encargo
 * "Jantar de abertura" vence nesse mesmo dia — é o caso que o separador
 * Encargos contava mal, dando por devedor quem ainda estava dentro do prazo.
 * (Um dia no passado, e não no futuro: a sessão falsa expira 24 horas depois
 * da hora real, e um relógio à frente dela deixava a app no rodopio.)
 */

const HOJE = new Date('2026-09-20T10:00:00')
const EURO = (n: string) => `${n} €`

const ATLETAS = [
  { id: 'p1', name: 'Bruno Costa', shirt_name: 'Bruno', jersey_number: 2 },
  { id: 'p2', name: 'Carlos Nogueira', shirt_name: 'Carlos', jersey_number: 9 },
  { id: 'p3', name: 'Vieira Silva', shirt_name: 'Vieira', jersey_number: 11 },
  { id: 'p4', name: 'Alves Pinto', shirt_name: 'Alves', jersey_number: 7 },
  { id: 'p5', name: 'Duarte Lopes', shirt_name: 'Duarte', jersey_number: 5 },
  { id: 'p6', name: 'João Moreira', shirt_name: 'João', jersey_number: 14 },
].map(a => ({ ...a, status: 'active', role: 'player', roles: ['player'] }))

const quota = (
  player_id: string,
  month_year: string,
  status: 'paid' | 'late' | 'pending',
  paid_at: string | null = null,
) => ({
  player_id,
  month_year,
  status,
  expected_amount: 10,
  due_id: status === 'paid' ? `d-${player_id}-${month_year}` : null,
  paid_amount: status === 'paid' ? 10 : null,
  paid_at,
  due_date: `${month_year}-08`,
  owed_amount: status === 'paid' ? 0 : 10,
})

const FIXTURES = {
  ...FIXTURES_BASE,
  financial_settings: [{
    id: 1, season_start_month: 8, season_end_month: 7, quota_amount: 10, quota_due_day: 8,
    quota_excluded_months: [], initial_balance: 0,
  }],
  v_players_public: ATLETAS,
  expense_categories: [
    { id: 'c1', name: 'Seguro Desportivo', allow_income: true },
    { id: 'c2', name: 'Equipamento', allow_income: true },
    { id: 'c3', name: 'Convívio', allow_income: true },
  ],
  v_quota_status: [
    quota('p1', '2026-09', 'late'), quota('p1', '2026-10', 'pending'),
    quota('p2', '2026-08', 'late'), quota('p2', '2026-09', 'late'),
    quota('p3', '2026-09', 'paid', '2026-09-05T10:00:00Z'), quota('p3', '2026-10', 'pending'),
    quota('p4', '2026-09', 'paid', '2026-09-03T10:00:00Z'), quota('p4', '2026-10', 'paid', '2026-09-03T10:00:00Z'),
    quota('p5', '2026-09', 'late'),
    quota('p6', '2026-09', 'late'),
  ],
  charges: [
    // Dentro do prazo: a pagamento.
    { id: 'ch1', title: 'Seguro desportivo 26/27', amount: 25, category_id: 'c1', due_date: '2026-09-30', is_intermediary: false },
    // Prazo passado: em dívida para quem não pagou.
    { id: 'ch2', title: 'Equipamento de treino', amount: 30, category_id: 'c2', due_date: '2026-09-15', is_intermediary: false },
    // O prazo é hoje — ainda se está a tempo.
    { id: 'ch3', title: 'Jantar de abertura', amount: 15, category_id: 'c3', due_date: '2026-09-20', is_intermediary: false },
  ],
  charge_players: [
    ...['p1', 'p2', 'p3', 'p4'].map(p => ({ id: `cp1-${p}`, charge_id: 'ch1', player_id: p })),
    ...['p1', 'p5'].map(p => ({ id: `cp2-${p}`, charge_id: 'ch2', player_id: p })),
    { id: 'cp3-p2', charge_id: 'ch3', player_id: 'p2' },
  ],
  charge_payments: [
    { id: 'pg1', charge_id: 'ch1', player_id: 'p3', amount: 25, paid_at: '2026-09-10', notes: null },
    // Pago em parte: 10 de 25.
    { id: 'pg2', charge_id: 'ch1', player_id: 'p4', amount: 10, paid_at: '2026-09-12', notes: null },
    { id: 'pg3', charge_id: 'ch2', player_id: 'p5', amount: 30, paid_at: '2026-09-14', notes: null },
  ],
}

/** O que o WhatsApp e a área de transferência receberam — sem sair da página. */
const apanharPartilhas = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __abertos: string[]; __copiado: string | null }
    w.__abertos = []
    w.__copiado = null
    window.open = ((url?: string | URL) => {
      w.__abertos.push(String(url))
      return null
    }) as typeof window.open
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (texto: string) => { w.__copiado = texto } },
    })
  })

const mensagemAberta = async (page: Page) => {
  const abertos = await page.evaluate(() => (window as unknown as { __abertos: string[] }).__abertos)
  expect(abertos).toHaveLength(1)
  expect(abertos[0].startsWith('https://wa.me/?text=')).toBe(true)
  return decodeURIComponent(abertos[0].slice('https://wa.me/?text='.length))
}

/* As contas vivem nos Relatórios do Clube desde 2026-09-25; eram o separador
   "Por atleta" do Financeiro, cujo endereço redireciona (ver o último teste). */
const abrir = async (page: Page, endereco = '/csc-vet/clube?ver=relatorios&relatorio=contas') => {
  await page.clock.setFixedTime(HOJE)
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto(endereco)
  await expect(page.getByRole('region', { name: 'Em dívida' }).first()).toBeVisible({ timeout: 15000 })
}

test('quem está em dívida: os atletas, de quê e quanto', async ({ page }) => {
  await abrir(page)
  const divida = page.getByRole('region', { name: 'Em dívida' })

  await expect(divida).toContainText(EURO('80,00'))
  await expect(divida.getByRole('button', { name: /Bruno/ })).toContainText('Quotas set · Equipamento')
  await expect(divida.getByRole('button', { name: /Bruno/ })).toContainText(EURO('40,00'))
  await expect(divida.getByRole('button', { name: /Carlos/ })).toContainText('Quotas ago, set')
  await expect(divida.getByRole('button', { name: /Duarte/ })).toContainText(EURO('10,00'))

  // Por nome, e só quem deve.
  const texto = await divida.innerText()
  const ordem = ['Bruno', 'Carlos', 'Duarte', 'João'].map(n => texto.indexOf(n))
  expect(ordem.every(i => i >= 0)).toBe(true)
  expect([...ordem].sort((a, b) => a - b)).toEqual(ordem)
  expect(texto).not.toContain('Alves')
  expect(texto).not.toContain('Vieira')
})

test('o prazo é o último dia: o que vence hoje ainda está a pagamento', async ({ page }) => {
  await abrir(page)
  const divida = page.getByRole('region', { name: 'Em dívida' })
  const aPagamento = page.getByRole('region', { name: 'A pagamento' })

  // O jantar vence hoje: o Carlos ainda está a tempo.
  await expect(aPagamento.getByRole('button', { name: /Carlos/ })).toContainText('Convívio até 20/09')
  await expect(divida.getByRole('button', { name: /Carlos/ })).not.toContainText('Convívio')

  // O equipamento venceu a 15/09: o Bruno já deve.
  await expect(divida.getByRole('button', { name: /Bruno/ })).toContainText('Equipamento')
  await expect(aPagamento).toContainText(EURO('80,00'))
})

test('um encargo pago em parte conta nas duas secções, e o pago abre à mão', async ({ page }) => {
  await abrir(page)
  await expect(page.getByRole('region', { name: 'A pagamento' }).getByRole('button', { name: /Alves/ }))
    .toContainText(EURO('15,00'))

  // O que já entrou é consulta: começa fechado.
  const pago = page.getByRole('region', { name: 'Pago' })
  const banda = pago.getByRole('button', { expanded: false })
  await expect(banda).toContainText(EURO('95,00'))
  await expect(pago.getByRole('button', { name: /Alves/ })).toHaveCount(0)
  await banda.click()
  await expect(pago.getByRole('button', { name: /Alves/ })).toContainText('Quotas set, out · Seguro Desportivo')
  await expect(pago.getByRole('button', { name: /Alves/ })).toContainText(EURO('30,00'))
})

test('a conta de um atleta: o que deve, o que tem a pagamento e o que já pagou', async ({ page }) => {
  await abrir(page)
  await page.getByRole('region', { name: 'A pagamento' }).getByRole('button', { name: /Alves/ }).click()

  const conta = page.getByRole('dialog', { name: 'Alves' })
  await expect(conta).toBeVisible()
  await expect(page).toHaveURL(/conta=p4/)

  await expect(conta.getByRole('region', { name: 'Em dívida' })).toContainText('Nada em dívida.')
  const aPagamento = conta.getByRole('region', { name: 'A pagamento' })
  await expect(aPagamento).toContainText('Seguro desportivo 26/27')
  await expect(aPagamento).toContainText(`até 30/09 · já pagou ${EURO('10,00')}`)
  const pago = conta.getByRole('region', { name: 'Pago' })
  await expect(pago).toContainText('Setembro 2026')
  await expect(pago).toContainText('Outubro 2026')
  await expect(pago).toContainText(`pago a 12/09 · de ${EURO('25,00')}`)
  await expect(pago).toContainText(EURO('30,00'))

  // Vai no endereço: retroceder fecha.
  await page.goBack()
  await expect(conta).toBeHidden()
  await expect(page).not.toHaveURL(/conta=/)
})

test('procurar encontra sem acentos, e mostra tudo o que o atleta tem', async ({ page }) => {
  await abrir(page)
  const procura = page.getByRole('searchbox', { name: 'Procurar atleta' })

  await procura.fill('joao')
  await expect(page.getByRole('region', { name: 'Em dívida' }).getByRole('button', { name: /João/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Em dívida' }).getByRole('button', { name: /Bruno/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'A pagamento' })).toHaveCount(0)

  // Quem não deve nada não traz a secção da dívida; a do pago abre sozinha.
  await procura.fill('vieira')
  await expect(page.getByRole('region', { name: 'Em dívida' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Pago' }).getByRole('button', { name: /Vieira/ }))
    .toContainText(EURO('35,00'))
})

test('o funil filtra por categoria e por mês, e a lista diz que filtro é', async ({ page }) => {
  await abrir(page)

  await page.getByRole('button', { name: 'Filtros', exact: true }).click()
  await page.getByLabel('Categoria').selectOption('Quotas')
  await page.getByRole('button', { name: 'Ver a lista' }).click()

  await expect(page.getByRole('button', { name: 'Filtros (ativos)' })).toBeVisible()
  const divida = page.getByRole('region', { name: 'Em dívida' })
  // Dentro do filtro "Quotas" a linha já não repete a categoria.
  await expect(divida.getByRole('button', { name: /Carlos/ })).toContainText('ago, set')
  await expect(divida.getByRole('button', { name: /Bruno/ })).toContainText(EURO('10,00'))
  await expect(page.getByRole('region', { name: 'A pagamento' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Filtros (ativos)' }).click()
  await page.getByLabel('Mês').selectOption({ label: 'Agosto 2026' })
  await page.getByRole('button', { name: 'Ver a lista' }).click()
  await expect(page.getByRole('button', { name: /Quotas · Agosto 2026/ })).toBeVisible()
  await expect(divida.getByRole('button', { name: /Carlos/ })).toContainText(EURO('10,00'))
  await expect(divida.getByRole('button', { name: /Bruno/ })).toHaveCount(0)

  // O resumo do filtro limpa-o.
  await page.getByRole('button', { name: /Quotas · Agosto 2026/ }).click()
  await expect(divida.getByRole('button', { name: /Bruno/ })).toContainText(EURO('40,00'))
})

test('partilhar a lista: a mensagem é a do ecrã, e abre o WhatsApp com ela', async ({ page }) => {
  await apanharPartilhas(page)
  await abrir(page)
  await page.getByRole('button', { name: 'Partilhar' }).click()

  const folha = page.getByRole('dialog', { name: 'Partilhar no WhatsApp' })
  const previa = folha.getByLabel('Pré-visualização da mensagem')
  await expect(previa).toContainText(`Em dívida: ${EURO('80,00')}`)
  // O pago não vai por omissão — quem pagou não precisa de ser lembrado.
  await expect(previa).not.toContainText('Pago:')

  await folha.getByRole('button', { name: 'Pago', exact: true }).click()
  await expect(previa).toContainText(`Pago: ${EURO('95,00')}`)

  const esperado = [
    '*GDS Cascais*',
    'Contas a 20/09/2026',
    '',
    `*Em dívida: ${EURO('80,00')}* (4 atletas)`,
    `- Bruno — ${EURO('40,00')} (Quotas set · Equipamento)`,
    `- Carlos — ${EURO('20,00')} (Quotas ago, set)`,
    `- Duarte — ${EURO('10,00')} (Quotas set)`,
    `- João — ${EURO('10,00')} (Quotas set)`,
    '',
    `*A pagamento: ${EURO('80,00')}* (3 atletas)`,
    `- Alves — ${EURO('15,00')} (Seguro Desportivo até 30/09)`,
    `- Bruno — ${EURO('25,00')} (Seguro Desportivo até 30/09)`,
    `- Carlos — ${EURO('40,00')} (Convívio até 20/09 · Seguro Desportivo até 30/09)`,
    '',
    `*Pago: ${EURO('95,00')}* (3 atletas)`,
    `- Alves — ${EURO('30,00')} (Quotas set, out · Seguro Desportivo)`,
    `- Duarte — ${EURO('30,00')} (Equipamento)`,
    `- Vieira — ${EURO('35,00')} (Quotas set · Seguro Desportivo)`,
  ].join('\n')

  await folha.getByRole('button', { name: 'Abrir no WhatsApp' }).click()
  expect(await mensagemAberta(page)).toBe(esperado)

  await folha.getByRole('button', { name: 'Copiar' }).click()
  await expect(page.getByText('Mensagem copiada. Cola-a no WhatsApp.')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __copiado: string }).__copiado)).toBe(esperado)
})

test('a conta de um atleta sai para o WhatsApp tal como se lê', async ({ page }) => {
  await apanharPartilhas(page)
  await abrir(page, '/csc-vet/clube?ver=relatorios&relatorio=contas&conta=p1')

  const conta = page.getByRole('dialog', { name: 'Bruno' })
  await expect(conta).toBeVisible()
  await conta.getByRole('button', { name: 'Enviar pelo WhatsApp' }).click()

  // Sem secção do pago: o Bruno ainda não pagou nada, e uma secção vazia não
  // diz nada a quem recebe a mensagem.
  expect(await mensagemAberta(page)).toBe([
    '*GDS Cascais · Bruno*',
    'Contas a 20/09/2026',
    '',
    `*Em dívida: ${EURO('40,00')}*`,
    `- Quotas: setembro — ${EURO('10,00')}`,
    `- Equipamento de treino — ${EURO('30,00')} (prazo 15/09)`,
    '',
    `*A pagamento: ${EURO('25,00')}*`,
    `- Seguro desportivo 26/27 — ${EURO('25,00')} (até 30/09)`,
  ].join('\n'))
})

/**
 * A barra de separadores do Financeiro tem sete, e num telemóvel cabem três.
 *
 * Cortava no fim de um separador sem nada a espreitar, e quem lá chegava não
 * sabia que havia mais. E o realce do separador ativo não aparecia de todo:
 * o `right` era medido a partir do fim do conteúdo e não da parte visível,
 * e numa fila que rola a aresta direita caía à esquerda da esquerda.
 */
test('a barra de separadores mostra que há mais, e o realce acompanha o ativo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(HOJE)
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/finance?ver=quotas')

  const fila = page.getByRole('tablist', { name: 'Secções do financeiro' })
  const setas = fila.locator('xpath=..').locator('button[aria-hidden="true"]')

  // "Quotas" é o terceiro de seis: há separadores dos dois lados.
  await expect(page.getByRole('tab', { name: 'Quotas' })).toBeInViewport({ timeout: 15000 })
  await expect(setas).toHaveCount(2)

  // O realce está por baixo do ativo, com a largura dele.
  await expect.poll(() => fila.evaluate(el => {
    const realce = el.querySelector(':scope > [aria-hidden="true"]')!.getBoundingClientRect()
    const ativo = el.querySelector('[aria-selected="true"]')!.getBoundingClientRect()
    return Math.round(Math.abs(realce.left - ativo.left) + Math.abs(realce.width - ativo.width))
  })).toBeLessThanOrEqual(2)

  // No primeiro separador só há mais para a direita, e a seta leva lá.
  await page.getByRole('tab', { name: 'Visão Geral' }).click()
  await expect(page).toHaveURL(/ver=overview/)
  await expect(setas).toHaveCount(1)
  /* O Archivo pode ainda estar a chegar numa página acabada de abrir: quando
     chega, os separadores ganham um ou dois píxeis e a fila volta a centrar
     o ativo — com razão, a geometria mudou. Espera-se por ele. */
  await page.evaluate(async () => { await document.fonts.ready })
  /* E espera-se que a fila assente outra vez só com a seta da direita: sob a
     carga da bateria inteira, a recentragem que o tipo de letra provoca ainda
     estava a meio quando se clicava, e havia duas setas no ecrã. */
  await expect(setas).toHaveCount(1)
  await setas.click()
  await expect.poll(() => fila.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  /* E a fila fica onde a seta a pôs: medições que não mudam nada — a do
     observador novo que a troca de separador cria — não a devolvem ao ativo. */
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)))
  expect(await fila.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  // Agora há mais para trás: aparece a seta da esquerda (numa janela larga,
  // um toque chega ao fim e a da direita sai).
  const filaEsquerda = (await fila.boundingBox())!.x
  const bordas = await setas.evaluateAll(botoes => botoes.map(b => b.getBoundingClientRect().left))
  expect(bordas.some(x => Math.abs(x - filaEsquerda) <= 1)).toBe(true)
})

/**
 * As contas saíram do Financeiro para os Relatórios do Clube, que são só da
 * direção. O endereço antigo anda em links e continua a abrir — com a conta
 * que lá vinha, se vinha.
 */
test('o endereço antigo do Financeiro abre as contas nos Relatórios', async ({ page }) => {
  await page.clock.setFixedTime(HOJE)
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/finance?ver=atletas&conta=p1')
  await expect(page).toHaveURL(/\/clube\?ver=relatorios&relatorio=contas&conta=p1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Contas por atleta' })).toBeVisible()
  // O Financeiro já não tem o separador.
  await page.goto('/csc-vet/finance')
  await expect(page.getByRole('tab', { name: 'Visão Geral' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('tab', { name: 'Por atleta' })).toHaveCount(0)
})
