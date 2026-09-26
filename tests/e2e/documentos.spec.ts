import { test, expect, type Page, type Request } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * Os documentos dos atletas (2026-09-26): uma linha de `documentos_atleta`
 * por documento, com até 4 ficheiros no bucket privado.
 *
 * O cartão de cidadão e a proposta de sócio são um só por pessoa; a apólice do
 * seguro e o atestado médico são um por época — a do Financeiro — e os das
 * épocas anteriores ficam guardados. Para abrir um ficheiro pede-se um link
 * temporário; carregar e eliminar gravam logo, sem o "Gravar" da ficha.
 */

/** A época em curso com as definições por omissão (começa em setembro), como a app a calcula. */
const epocaQueComecaEm = (ano: number) => `${ano}/${ano + 1}`
const hoje = new Date()
const ANO = hoje.getMonth() + 1 >= 9 ? hoje.getFullYear() : hoje.getFullYear() - 1
const EPOCA = epocaQueComecaEm(ANO)
const ANTERIOR = epocaQueComecaEm(ANO - 1)
const EPOCA_NO_NOME = EPOCA.replace('/', '-')

const ATLETA = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste', email: UTILIZADOR_TESTE.email,
  role: 'admin', roles: ['admin', 'player'], status: 'active',
  jersey_number: 99, shirt_name: 'Teste', position: 'Médio Centro',
}

const documento = (d: { id: string; profile_id?: string; tipo: string; epoca?: string | null; caminhos: string[] }) => ({
  profile_id: ATLETA.id, epoca: null, carregado_em: '2026-09-20T10:00:00Z', ...d,
})

const pedidos = (page: Page, filtro: (r: Request) => boolean) => {
  const lista: Request[] = []
  page.on('request', r => { if (filtro(r)) lista.push(r) })
  return lista
}

const ficheiro = (nome: string) => ({ name: nome, mimeType: 'image/jpeg', buffer: Buffer.from('imagem de teste') })

test('na ficha do atleta, cada ficheiro de um documento abre por um link temporário', async ({ page }) => {
  const frente = `${ATLETA.id}/cc-1-1.jpg`
  const verso = `${ATLETA.id}/cc-1-2.jpg`
  await montarSupabaseFalso(page, {
    profiles: [ATLETA],
    v_players_public: [ATLETA],
    documentos_atleta: [documento({ id: 'doc-cc', tipo: 'cc', caminhos: [frente, verso] })],
  })
  await page.goto(`/csc-vet/team-management?atleta=${ATLETA.id}`)

  const primeiro = page.getByRole('link', { name: /Imagem 1 — cartão de cidadão/ })
  await expect(primeiro).toBeVisible({ timeout: 15000 })
  // O link é o temporário, do caminho guardado — nunca um endereço público.
  await expect(primeiro).toHaveAttribute('href', new RegExp(`/storage/v1/object/sign/documentos_atletas/${frente}\\?token=`))
  await expect(page.getByRole('link', { name: /Imagem 2 — cartão de cidadão/ }))
    .toHaveAttribute('href', new RegExp(`/object/sign/documentos_atletas/${verso}\\?token=`))
})

test('a apólice e o atestado são da época em curso, e os de épocas anteriores ficam recolhidos', async ({ page }) => {
  await montarSupabaseFalso(page, {
    profiles: [ATLETA],
    v_players_public: [ATLETA],
    documentos_atleta: [
      documento({ id: 'doc-seguro', tipo: 'seguro', epoca: EPOCA, caminhos: [`${ATLETA.id}/seguro-1-1.pdf`] }),
      documento({ id: 'doc-atestado-antigo', tipo: 'atestado', epoca: ANTERIOR, caminhos: [`${ATLETA.id}/atestado-1-1.pdf`] }),
    ],
  })
  await page.goto(`/csc-vet/team-management?atleta=${ATLETA.id}`)

  const lista = page.getByRole('list', { name: 'Documentos', exact: true })
  await expect(lista).toBeVisible({ timeout: 15000 })
  // As linhas dos documentos, e não as dos ficheiros lá dentro.
  const linhas = lista.locator(':scope > li')
  const seguro = linhas.filter({ hasText: 'Apólice do seguro' })
  await expect(seguro).toContainText(`· ${EPOCA}`)
  await expect(seguro).toContainText('1 ficheiro')
  // O atestado desta época falta — o da época passada não conta.
  const atestado = linhas.filter({ hasText: 'Atestado médico' })
  await expect(atestado).toContainText(`· ${EPOCA}`)
  await expect(atestado).toContainText('Em falta')

  const anteriores = page.getByRole('button', { name: 'Épocas anteriores (1)' })
  await expect(anteriores).toHaveAttribute('aria-expanded', 'false')
  await anteriores.click()
  const antigo = page.getByRole('link', { name: new RegExp(`PDF — atestado médico ${ANTERIOR}`) })
  await expect(antigo).toHaveAttribute('href', /\/object\/sign\/documentos_atletas\//)
  // Só se abre: nada para eliminar numa época que já acabou.
  await expect(page.getByRole('button', { name: new RegExp(`atestado médico ${ANTERIOR}`) })).toHaveCount(0)
})

test('no Perfil, carregar sobe os ficheiros para a pasta do próprio e junta-os ao documento', async ({ page }) => {
  const envios = pedidos(page, r => r.url().includes('/storage/v1/object/') && r.method() === 'POST' && !r.url().includes('/sign/'))
  const juntar = pedidos(page, r => r.url().includes('/rpc/acrescentar_ficheiros'))
  const fichas = pedidos(page, r => r.url().includes('/rest/v1/profiles') && r.method() === 'PATCH')
  await montarSupabaseFalso(page, { profiles: [ATLETA], v_players_public: [ATLETA] })
  await page.goto('/csc-vet/settings')

  // A proposta de sócio, com duas páginas de uma vez.
  await page.getByLabel(/Carregar — proposta de sócio/).setInputFiles([ficheiro('pagina1.jpg'), ficheiro('pagina2.jpg')])

  await expect.poll(() => juntar.length, { timeout: 15000 }).toBe(1)
  expect(envios.map(r => r.url())).toEqual([
    expect.stringMatching(new RegExp(`/storage/v1/object/documentos_atletas/${ATLETA.id}/proposta-\\d+-1\\.jpg$`)),
    expect.stringMatching(new RegExp(`/storage/v1/object/documentos_atletas/${ATLETA.id}/proposta-\\d+-2\\.jpg$`)),
  ])
  const corpo = JSON.parse(juntar[0].postData() ?? '{}')
  expect(corpo).toEqual({
    p_perfil: ATLETA.id,
    p_tipo: 'proposta',
    p_caminhos: envios.map(r => decodeURIComponent(r.url().split('/documentos_atletas/')[1])),
  })
  // Não passa pelo "Gravar" da ficha, nem pelo bucket público.
  expect(fichas).toHaveLength(0)
  expect(envios.some(r => r.url().includes('club_assets'))).toBe(false)
})

test('um documento leva até 4 ficheiros', async ({ page }) => {
  const juntar = pedidos(page, r => r.url().includes('/rpc/acrescentar_ficheiros'))
  await montarSupabaseFalso(page, {
    profiles: [ATLETA],
    v_players_public: [ATLETA],
    documentos_atleta: [
      documento({ id: 'doc-cc', tipo: 'cc', caminhos: [1, 2, 3].map(n => `${ATLETA.id}/cc-1-${n}.jpg`) }),
      documento({ id: 'doc-proposta', tipo: 'proposta', caminhos: [1, 2, 3, 4].map(n => `${ATLETA.id}/proposta-1-${n}.jpg`) }),
    ],
  })
  await page.goto('/csc-vet/settings')

  // Com 4, já não se acrescenta.
  await expect(page.getByRole('link', { name: /Imagem 4 — proposta de sócio/ })).toBeVisible({ timeout: 15000 })
  await expect(page.getByLabel(/^(Carregar|Acrescentar) — proposta de sócio/)).toHaveCount(0)

  // Com 3, cabe mais um: o segundo fica de fora, e diz-se.
  await page.getByLabel(/Acrescentar — cartão de cidadão/).setInputFiles([ficheiro('a.jpg'), ficheiro('b.jpg')])
  await expect(page.getByText(/ficaram de fora/)).toBeVisible()
  await expect.poll(() => juntar.length).toBe(1)
  expect(JSON.parse(juntar[0].postData() ?? '{}').p_caminhos).toHaveLength(1)
})

test('eliminar um ficheiro pergunta antes, e tira-o do documento e do bucket', async ({ page }) => {
  const verso = `${ATLETA.id}/cc-1-2.jpg`
  const tirar = pedidos(page, r => r.url().includes('/rpc/tirar_ficheiro'))
  const apagados = pedidos(page, r => r.url().includes('/storage/v1/object/documentos_atletas') && r.method() === 'DELETE')
  await montarSupabaseFalso(page, {
    profiles: [ATLETA],
    v_players_public: [ATLETA],
    documentos_atleta: [documento({ id: 'doc-cc', tipo: 'cc', caminhos: [`${ATLETA.id}/cc-1-1.jpg`, verso] })],
  })
  await page.goto('/csc-vet/settings')

  await page.getByRole('button', { name: 'Eliminar imagem 2 — cartão de cidadão' }).click({ timeout: 15000 })
  const aviso = page.getByRole('dialog', { name: 'Eliminar imagem 2' })
  await expect(aviso).toBeVisible()
  // Antes de confirmar, nada saiu.
  expect(tirar).toHaveLength(0)
  await aviso.getByRole('button', { name: 'Sim, eliminar imagem 2' }).click()

  await expect.poll(() => tirar.length).toBe(1)
  expect(JSON.parse(tirar[0].postData() ?? '{}')).toEqual({ p_documento: 'doc-cc', p_caminho: verso })
  await expect.poll(() => apagados.length).toBe(1)
  expect(apagados[0].postData() ?? '').toContain(verso)
})

/**
 * O relatório de documentos (Clube → Relatórios → Documentos dos atletas).
 *
 * Junta num `.zip` um tipo de documento — ou a fotografia de perfil — de
 * vários atletas; a apólice e o atestado escolhem-se por época. Diz também a
 * quem falta. Dois passos, porque no iPhone a partilha nativa só abre logo a
 * seguir a um toque: preparar, e com o ficheiro pronto descarregar ou
 * partilhar. Cada entrega fica registada pela função do servidor.
 */
test.describe('O relatório de documentos', () => {
  const RUI = { id: '00000000-0000-4000-8000-000000000011', name: 'Rui Bandarra', shirt_name: 'RUI', jersey_number: 8, status: 'active', role: 'player', roles: ['player'], photo_url: 'https://teste.supabase.co/storage/v1/object/public/club_assets/rui.jpg' }
  const ZE = { id: '00000000-0000-4000-8000-000000000012', name: 'José Maria', shirt_name: 'ZÉ', jersey_number: 10, status: 'active', role: 'player', roles: ['player'], photo_url: null }
  const SEM = { id: '00000000-0000-4000-8000-000000000013', name: 'Sem Documento', shirt_name: 'SEM', status: 'active', role: 'player', roles: ['player'], photo_url: null }
  const INATIVO = { id: '00000000-0000-4000-8000-000000000014', name: 'Já Saiu', shirt_name: 'SAIU', status: 'inactive', role: 'player', roles: ['player'], photo_url: null }

  const abrir = async (page: Page) => {
    await montarSupabaseFalso(page, {
      profiles: [ATLETA, RUI, ZE, SEM, INATIVO],
      v_players_public: [ATLETA, RUI, ZE, SEM, INATIVO],
      documentos_atleta: [
        documento({ id: 'cc-rui', profile_id: RUI.id, tipo: 'cc', caminhos: [`${RUI.id}/cc-1-1.pdf`] }),
        documento({ id: 'cc-ze', profile_id: ZE.id, tipo: 'cc', caminhos: [`${ZE.id}/cc-1-1.pdf`] }),
        documento({ id: 'at-rui', profile_id: RUI.id, tipo: 'atestado', epoca: EPOCA, caminhos: [`${RUI.id}/atestado-1-1.jpg`, `${RUI.id}/atestado-1-2.jpg`] }),
        documento({ id: 'at-ze', profile_id: ZE.id, tipo: 'atestado', epoca: ANTERIOR, caminhos: [`${ZE.id}/atestado-1-1.pdf`] }),
      ],
      'rpc:registar_exportacao_documentos': [{ id: 'exportacao-1' }],
    })
    // Os ficheiros, pedidos pelo bucket privado, respondem com um PDF mínimo;
    // a fotografia, pelo endereço público, com uma imagem.
    await page.route(/\/storage\/v1\/object\/(authenticated\/)?documentos_atletas\//, r =>
      r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 teste' }))
    await page.route(/\/storage\/v1\/object\/public\/club_assets\//, r =>
      r.fulfill({ status: 200, contentType: 'image/jpeg', body: 'jpeg de teste' }))
    await page.goto('/csc-vet/clube?ver=relatorios&relatorio=documentos')
    await expect(page.getByRole('heading', { level: 1, name: 'Documentos dos atletas' })).toBeVisible({ timeout: 15000 })
  }

  const registos = (page: Page) => pedidos(page, r => r.url().includes('/rpc/registar_exportacao_documentos'))

  const descarregarZip = async (page: Page) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descarregar' }).click(),
    ])
    const { unzipSync } = await import('fflate')
    const { readFile } = await import('node:fs/promises')
    const dentro = unzipSync(new Uint8Array(await readFile((await download.path())!)))
    return { nome: download.suggestedFilename(), ficheiros: Object.keys(dentro) }
  }

  test('escolhe-se o documento e os atletas, e quem não o tem fica numa lista à parte', async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole('radio', { name: /^Cartão de cidadão/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^Proposta de sócio/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /^Fotografia de perfil/ })).toBeVisible()
    // Quem tem entra na escolha…
    await expect(page.getByRole('checkbox')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Preparar o .zip (2)' })).toBeVisible()
    // …e a quem falta, fica à parte — os atletas no ativo, e não quem saiu.
    const emFalta = page.getByRole('region', { name: /^Sem cartão de cidadão · 2/ })
    await expect(emFalta).toContainText('SEM')
    await expect(emFalta).toContainText('Teste')
    await expect(emFalta).not.toContainText('SAIU')

    // Um documento que ninguém tem: di-lo.
    await page.getByText('Apólice do seguro').click()
    await expect(page.getByText(`Nenhum atleta tem apólice do seguro de ${EPOCA}.`)).toBeVisible()
  })

  test('descarregar entrega o .zip com os documentos escolhidos, e fica registado', async ({ page }) => {
    const pedidosDeRegisto = registos(page)
    await abrir(page)
    await page.getByRole('checkbox', { name: /ZÉ/ }).uncheck()
    await page.getByRole('button', { name: 'Preparar o .zip (1)' }).click()
    await expect(page.getByText(/^CSC-CC-\d{4}-\d{2}-\d{2}\.zip · 1 ficheiro$/)).toBeVisible({ timeout: 15000 })

    const zip = await descarregarZip(page)
    expect(zip.nome).toMatch(/^CSC-CC-\d{4}-\d{2}-\d{2}\.zip$/)
    // O documento do Rui, com o nome da camisola.
    expect(zip.ficheiros).toEqual(['RUI-CC.pdf'])

    await expect.poll(() => pedidosDeRegisto.length).toBe(1)
    expect(JSON.parse(pedidosDeRegisto[0].postData() ?? '{}')).toEqual({
      p_tipo: 'cc', p_perfis: [RUI.id], p_destino: 'descarregar', p_epoca: null,
    })
  })

  test('a apólice e o atestado escolhem-se por época, e cada imagem sai no seu ficheiro', async ({ page }) => {
    const pedidosDeRegisto = registos(page)
    await abrir(page)
    await page.getByText('Atestado médico').click()

    // A época em curso por omissão, e a anterior porque há documentos dela.
    await expect(page.getByRole('button', { name: new RegExp(`^${EPOCA}`) })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: ANTERIOR })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('checkbox')).toHaveCount(1)
    await expect(page.getByRole('region', { name: new RegExp(`^Sem atestado médico de ${EPOCA}`) })).toContainText('ZÉ')

    await page.getByRole('button', { name: 'Preparar o .zip (1)' }).click()
    await expect(page.getByText(/· 2 ficheiros$/)).toBeVisible({ timeout: 15000 })
    const zip = await descarregarZip(page)
    expect(zip.nome).toMatch(new RegExp(`^CSC-Atestado-${EPOCA_NO_NOME}-\\d{4}-\\d{2}-\\d{2}\\.zip$`))
    // A frente e o verso: um ficheiro cada, numerados.
    expect(zip.ficheiros).toEqual([`RUI-Atestado-${EPOCA_NO_NOME}-1.jpg`, `RUI-Atestado-${EPOCA_NO_NOME}-2.jpg`])
    await expect.poll(() => pedidosDeRegisto.length).toBe(1)
    expect(JSON.parse(pedidosDeRegisto[0].postData() ?? '{}')).toMatchObject({ p_tipo: 'atestado', p_epoca: EPOCA })

    // A época anterior mostra o que é dela.
    await page.getByRole('button', { name: ANTERIOR }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(1)
    await expect(page.getByRole('checkbox', { name: /ZÉ/ })).toBeVisible()
  })

  test('a fotografia de perfil também sai num .zip', async ({ page }) => {
    const pedidosDeRegisto = registos(page)
    await abrir(page)
    await page.getByText('Fotografia de perfil').click()
    await expect(page.getByRole('checkbox')).toHaveCount(1)
    await page.getByRole('button', { name: 'Preparar o .zip (1)' }).click()
    await expect(page.getByText(/^CSC-Foto-\d{4}-\d{2}-\d{2}\.zip · 1 ficheiro$/)).toBeVisible({ timeout: 15000 })

    const zip = await descarregarZip(page)
    expect(zip.ficheiros).toEqual(['RUI-Foto.jpg'])
    await expect.poll(() => pedidosDeRegisto.length).toBe(1)
    expect(JSON.parse(pedidosDeRegisto[0].postData() ?? '{}')).toMatchObject({ p_tipo: 'foto', p_perfis: [RUI.id], p_epoca: null })
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
