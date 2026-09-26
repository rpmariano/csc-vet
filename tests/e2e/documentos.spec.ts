import { test, expect, type Page, type Request } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * Os documentos dos atletas vivem num bucket privado (2026-09-26).
 *
 * Iam para o `club_assets`, que é público, e a app guardava o endereço
 * público: o cartão de cidadão de um atleta abria-se sem sessão. Hoje vão para
 * `documentos_atletas/<profile_id>/…`, a ficha guarda o caminho, e para abrir
 * pede-se um link temporário. Os antigos são copiados para lá da primeira vez
 * que a equipa técnica abre o Plantel.
 */

const ATLETA = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste', email: UTILIZADOR_TESTE.email,
  role: 'admin', roles: ['admin', 'player'], status: 'active',
  jersey_number: 99, shirt_name: 'Teste', position: 'Médio Centro',
  id_document_url: null as string | null, insurance_doc_url: null as string | null, medical_exam_doc_url: null as string | null,
}

const PUBLICO = 'https://teste.supabase.co/storage/v1/object/public/club_assets/member_idDoc_1_abc.pdf'

const pedidos = (page: Page, filtro: (r: Request) => boolean) => {
  const lista: Request[] = []
  page.on('request', r => { if (filtro(r)) lista.push(r) })
  return lista
}

test('um documento no bucket privado abre por um link temporário', async ({ page }) => {
  const caminho = `${ATLETA.id}/cc-1.pdf`
  await montarSupabaseFalso(page, {
    profiles: [{ ...ATLETA, id_document_url: caminho }],
    v_players_public: [ATLETA],
  })
  await page.goto(`/csc-vet/team-management?atleta=${ATLETA.id}`)

  const link = page.getByRole('link', { name: /Doc\. Identificação/ })
  await expect(link).toBeVisible({ timeout: 15000 })
  // O link é o temporário, do caminho guardado — nunca um endereço público.
  await expect(link).toHaveAttribute('href', new RegExp(`/storage/v1/object/sign/documentos_atletas/${caminho}\\?token=`))
})

test('um documento antigo, ainda público, continua a abrir enquanto não passa', async ({ page }) => {
  await montarSupabaseFalso(page, {
    profiles: [{ ...ATLETA, role: 'player', roles: ['player'], id_document_url: PUBLICO }],
    v_players_public: [ATLETA],
  })
  await page.goto('/csc-vet/settings')
  await expect(page.getByRole('link', { name: /Ver Documento CC anexado/ })).toHaveAttribute('href', PUBLICO, { timeout: 15000 })
})

test('no Perfil, o documento carrega-se para a pasta do próprio, no bucket privado', async ({ page }) => {
  const envios = pedidos(page, r => r.url().includes('/storage/v1/object/') && r.method() === 'POST' && !r.url().includes('/sign/'))
  await montarSupabaseFalso(page, { profiles: [ATLETA], v_players_public: [ATLETA] })
  await page.goto('/csc-vet/settings')

  await page.getByLabel('Doc. Identificação (CC / Passaporte)').setInputFiles({
    name: 'cartao.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste'),
  })

  await expect.poll(() => envios.length).toBeGreaterThan(0)
  expect(envios[0].url()).toMatch(new RegExp(`/storage/v1/object/documentos_atletas/${ATLETA.id}/cc-\\d+\\.pdf$`))
  expect(envios.some(r => r.url().includes('club_assets'))).toBe(false)
  // E o link que aparece é o temporário.
  await expect(page.getByRole('link', { name: /Ver Documento CC anexado/ }))
    .toHaveAttribute('href', /\/object\/sign\/documentos_atletas\//)
})

test('a equipa técnica abre o Plantel e os documentos antigos passam para o bucket privado', async ({ page }) => {
  const envios = pedidos(page, r => r.url().includes('/storage/v1/object/documentos_atletas/') && r.method() === 'POST')
  const fichas = pedidos(page, r => r.url().includes('/rest/v1/profiles') && r.method() === 'PATCH')
  const apagados = pedidos(page, r => r.url().includes('/storage/v1/object/club_assets') && r.method() === 'DELETE')

  await montarSupabaseFalso(page, {
    profiles: [{ ...ATLETA, id_document_url: PUBLICO }],
    v_players_public: [ATLETA],
  })
  await page.goto('/csc-vet/team-management')

  // Copia para a pasta da ficha…
  await expect.poll(() => envios.length, { timeout: 15000 }).toBe(1)
  expect(envios[0].url()).toMatch(new RegExp(`/documentos_atletas/${ATLETA.id}/cc-\\d+\\.pdf$`))
  // …aponta a ficha para a cópia…
  await expect.poll(() => fichas.length).toBe(1)
  expect(JSON.parse(fichas[0].postData() ?? '{}').id_document_url).toMatch(new RegExp(`^${ATLETA.id}/cc-\\d+\\.pdf$`))
  // …e só então apaga o original do bucket público.
  await expect.poll(() => apagados.length).toBe(1)
  expect(apagados[0].postData() ?? '').toContain('member_idDoc_1_abc.pdf')
})

/**
 * O relatório de documentos (Clube → Relatórios → Documentos dos atletas).
 *
 * Junta num `.zip` um tipo de documento de vários atletas. Dois passos, porque
 * no iPhone a partilha nativa só abre logo a seguir a um toque: preparar, e
 * com o ficheiro pronto descarregar ou partilhar. Cada entrega fica registada
 * pela função do servidor.
 */
test.describe('O relatório de documentos', () => {
  const RUI = { id: '00000000-0000-4000-8000-000000000011', name: 'Rui Bandarra', shirt_name: 'RUI', jersey_number: 8, status: 'active', role: 'player', roles: ['player'], id_document_url: '00000000-0000-4000-8000-000000000011/cc-1.pdf' }
  const ZE = { id: '00000000-0000-4000-8000-000000000012', name: 'José Maria', shirt_name: 'ZÉ', jersey_number: 10, status: 'active', role: 'player', roles: ['player'], id_document_url: '00000000-0000-4000-8000-000000000012/cc-2.pdf' }
  const SEM = { id: '00000000-0000-4000-8000-000000000013', name: 'Sem Documento', status: 'active', role: 'player', roles: ['player'], id_document_url: null }

  const abrir = async (page: Page) => {
    await montarSupabaseFalso(page, {
      profiles: [ATLETA, RUI, ZE, SEM],
      v_players_public: [ATLETA, RUI, ZE, SEM],
      'rpc:registar_exportacao_documentos': [{ id: 'exportacao-1' }],
    })
    // Os ficheiros, pedidos por link temporário, respondem com um PDF mínimo.
    await page.route(/\/storage\/v1\/object\/(authenticated\/)?documentos_atletas\//, r =>
      r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 teste' }))
    await page.goto('/csc-vet/clube?ver=relatorios&relatorio=documentos')
    await expect(page.getByRole('heading', { level: 1, name: 'Documentos dos atletas' })).toBeVisible({ timeout: 15000 })
  }

  const registos = (page: Page) => pedidos(page, r => r.url().includes('/rpc/registar_exportacao_documentos'))

  test('escolhe-se o documento e os atletas, e só entra quem o tem', async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole('radio', { name: /Cartão de cidadão/ })).toBeChecked()
    // Quem não tem cartão de cidadão não aparece.
    await expect(page.getByRole('checkbox')).toHaveCount(2)
    await expect(page.getByText('Sem Documento')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Preparar o .zip (2)' })).toBeVisible()

    // Outro documento, que ninguém tem: diz isso.
    await page.getByText('Atestado médico').click()
    await expect(page.getByText('Nenhum atleta tem atestado médico na ficha.')).toBeVisible()
  })

  test('descarregar entrega o .zip com os documentos escolhidos, e fica registado', async ({ page }) => {
    const pedidosDeRegisto = registos(page)
    await abrir(page)
    await page.getByRole('checkbox', { name: /ZÉ/ }).uncheck()
    await page.getByRole('button', { name: 'Preparar o .zip (1)' }).click()
    await expect(page.getByText(/^CSC-CC-\d{4}-\d{2}-\d{2}\.zip · 1 documento$/)).toBeVisible({ timeout: 15000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descarregar' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^CSC-CC-\d{4}-\d{2}-\d{2}\.zip$/)

    // O que está dentro: o documento do Rui, com o nome da camisola.
    const { unzipSync } = await import('fflate')
    const { readFile } = await import('node:fs/promises')
    const dentro = unzipSync(new Uint8Array(await readFile((await download.path())!)))
    expect(Object.keys(dentro)).toEqual(['RUI-CC.pdf'])

    await expect.poll(() => pedidosDeRegisto.length).toBe(1)
    expect(JSON.parse(pedidosDeRegisto[0].postData() ?? '{}')).toEqual({
      p_tipo: 'cc', p_perfis: [RUI.id], p_destino: 'descarregar',
    })
  })

  test('partilhar pergunta antes, e fica registado como partilha', async ({ page }) => {
    // A partilha nativa do telemóvel, fingida: o Chromium de teste não a tem.
    await page.addInitScript(() => {
      const w = window as unknown as { partilhados: string[] }
      w.partilhados = []
      Object.assign(navigator, {
        canShare: () => true,
        share: async (dados: { files?: File[] }) => { w.partilhados.push(...(dados.files ?? []).map(f => f.name)) },
      })
    })
    const pedidosDeRegisto = registos(page)
    await abrir(page)
    await page.getByRole('button', { name: 'Preparar o .zip (2)' }).click()
    await page.getByRole('button', { name: /Partilhar/ }).click({ timeout: 15000 })

    // O aviso: os documentos saem do clube.
    const aviso = page.getByRole('dialog', { name: /Partilhar documentos de identificação/ })
    await expect(aviso).toBeVisible()
    await aviso.getByRole('button', { name: 'Partilhar' }).click()

    await expect.poll(() => page.evaluate(() => (window as unknown as { partilhados: string[] }).partilhados))
      .toEqual([expect.stringMatching(/^CSC-CC-\d{4}-\d{2}-\d{2}\.zip$/)])
    await expect.poll(() => pedidosDeRegisto.length).toBe(1)
    expect(JSON.parse(pedidosDeRegisto[0].postData() ?? '{}').p_destino).toBe('partilhar')
  })
})
