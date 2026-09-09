import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * Preferências de avisos (ecrã 12b).
 *
 * "Sem silêncio" é uma janela de comprimento zero — as duas horas iguais —, e
 * não `null`: as colunas são `NOT NULL` na base. Desligar o interruptor
 * mandava `null` e a gravação rebentava com um erro da base à frente de quem
 * só queria desligar um aviso.
 *
 * O `avisos_pendentes()` já trata `inicio = fim` como "esta pessoa nunca está
 * em silêncio", por isso o significado é o mesmo sem precisar de migração.
 */

const PREFS = {
  profile_id: UTILIZADOR_TESTE.id,
  convocatorias: true, comunicados: true, quotas_em_atraso: true,
  eventos_sem_convocatoria: true, fichas_por_preencher: true,
  silencio_inicio: '23:00:00', silencio_fim: '08:00:00',
}

async function abrePreferencias(page: import('@playwright/test').Page) {
  await page.goto('/csc-vet/settings')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /O que quero saber/ }).click()
  await expect(page.getByRole('switch', { name: /Silêncio à noite/ })).toBeVisible()
}

test('desligar o silêncio guarda horas iguais, e não nulos', async ({ page }) => {
  const gravados: string[] = []
  page.on('request', r => {
    if (r.url().includes('notification_preferences') && r.method() !== 'GET') {
      gravados.push(r.postData() ?? '')
    }
  })

  await montarSupabaseFalso(page, { notification_preferences: [PREFS] })
  await abrePreferencias(page)

  const silencio = page.getByRole('switch', { name: /Silêncio à noite/ })
  await expect(silencio).toHaveAttribute('aria-checked', 'true')
  await silencio.click()
  await expect(silencio).toHaveAttribute('aria-checked', 'false')

  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect.poll(() => gravados.length).toBeGreaterThan(0)

  const corpo = gravados.join(' ')
  expect(corpo).toContain('"silencio_inicio":"00:00"')
  expect(corpo).toContain('"silencio_fim":"00:00"')
  expect(corpo).not.toContain('"silencio_inicio":null')
  expect(corpo).not.toContain('"silencio_fim":null')
})

test('um perfil sem silêncio abre com o interruptor desligado', async ({ page }) => {
  await montarSupabaseFalso(page, {
    notification_preferences: [{ ...PREFS, silencio_inicio: '00:00:00', silencio_fim: '00:00:00' }],
  })
  await abrePreferencias(page)

  await expect(page.getByRole('switch', { name: /Silêncio à noite/ }))
    .toHaveAttribute('aria-checked', 'false')
})

test('voltar a ligar repõe as 23h–08h', async ({ page }) => {
  await montarSupabaseFalso(page, {
    notification_preferences: [{ ...PREFS, silencio_inicio: '00:00:00', silencio_fim: '00:00:00' }],
  })
  await abrePreferencias(page)

  await page.getByRole('switch', { name: /Silêncio à noite/ }).click()
  await expect(page.getByLabel('Das')).toHaveValue('23:00')
  await expect(page.getByLabel('Às')).toHaveValue('08:00')
})

/**
 * Nada está ligado à partida, e é o "Guardar" que liga o telemóvel.
 *
 * Havia um botão "Ligar" à parte, e eram dois gestos para uma intenção:
 * escolher os avisos e depois autorizar a app. Quem fizesse só o primeiro
 * ficava com tudo pedido e nada a chegar.
 *
 * A escolha grava-se sempre, mesmo que a subscrição falhe: as preferências são
 * da pessoa e valem em todos os aparelhos, a subscrição é deste. Nos testes o
 * browser não tem chave VAPID, por isso a subscrição nunca dá — e é a
 * gravação que tem de acontecer na mesma.
 */
test.describe('Avisos desligados à partida', () => {
  async function abreSemPreferencias(page: import('@playwright/test').Page) {
    await montarSupabaseFalso(page, { notification_preferences: [] })
    await abrePreferencias(page)
  }

  test('quem nunca escolheu abre com tudo desligado', async ({ page }) => {
    await abreSemPreferencias(page)

    for (const nome of [/Convocatórias/, /Comunicados/, /Quotas/]) {
      await expect(page.getByRole('switch', { name: nome })).toHaveAttribute('aria-checked', 'false')
    }
    await expect(page.getByText('Este telemóvel não recebe avisos')).toBeVisible()
  })

  test('já não há botão de Ligar à parte', async ({ page }) => {
    await abreSemPreferencias(page)
    await expect(page.getByRole('button', { name: 'Ligar', exact: true })).toHaveCount(0)
  })

  /*
    Sem `VITE_VAPID_PUBLIC_KEY` — que é o caso nos testes, e era o caso em
    produção antes de a direção criar as chaves — o cartão diz que o envio não
    está configurado, em vez de prometer avisos que nunca sairiam.
  */
  test('sem chave VAPID, o cartão diz porque é que não recebe', async ({ page }) => {
    await abreSemPreferencias(page)
    await expect(page.getByText(/o envio ainda não está configurado no servidor/i)).toBeVisible()
  })

  test('a escolha grava-se mesmo quando o telemóvel não pode receber', async ({ page }) => {
    const gravados: string[] = []
    page.on('request', r => {
      if (r.url().includes('notification_preferences') && r.method() !== 'GET') {
        gravados.push(r.postData() ?? '')
      }
    })

    await abreSemPreferencias(page)
    await page.getByRole('switch', { name: /Convocatórias/ }).click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()

    await expect.poll(() => gravados.length).toBeGreaterThan(0)
    expect(gravados.join(' ')).toContain('"convocatorias":true')
  })
})
