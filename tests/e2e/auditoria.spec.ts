import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

const LOGS_EXEMPLO = [
  {
    id: 'log-1',
    created_at: '2026-10-07T21:10:00Z',
    user_id: UTILIZADOR_TESTE.id,
    user_name: 'Presidente Silva',
    user_email: 'presidente@csc-vet.local',
    user_role: 'admin',
    action: 'UPDATE',
    table_name: 'profiles',
    record_id: 'p-sonia',
    record_title: 'Sónia Ferreira',
    old_data: { id: 'p-sonia', name: 'Sónia Ferreira', role: 'player', jersey_number: 14 },
    new_data: { id: 'p-sonia', name: 'Sónia Ferreira', role: 'supporter', jersey_number: null },
    changes: {
      role: { antigo: 'player', novo: 'supporter' },
      jersey_number: { antigo: 14, novo: null },
    },
    description: 'Atualizou perfil de Sónia Ferreira',
  },
  {
    id: 'log-2',
    created_at: '2026-10-07T20:30:00Z',
    user_id: UTILIZADOR_TESTE.id,
    user_name: 'Presidente Silva',
    user_email: 'presidente@csc-vet.local',
    user_role: 'admin',
    action: 'INSERT',
    table_name: 'announcements',
    record_id: 'ann-1',
    record_title: 'Jantar de Natal do Clube',
    old_data: null,
    new_data: { id: 'ann-1', title: 'Jantar de Natal do Clube', target_audience: 'all' },
    changes: { title: 'Jantar de Natal do Clube', target_audience: 'all' },
    description: 'Publicou comunicado: Jantar de Natal do Clube',
  },
  {
    id: 'log-3',
    created_at: '2026-10-07T19:00:00Z',
    user_id: UTILIZADOR_TESTE.id,
    user_name: 'Presidente Silva',
    user_email: 'presidente@csc-vet.local',
    user_role: 'admin',
    action: 'DELETE',
    table_name: 'events',
    record_id: 'ev-antigo',
    record_title: 'Treino Cancelado',
    old_data: { id: 'ev-antigo', title: 'Treino Cancelado' },
    new_data: null,
    changes: { title: 'Treino Cancelado' },
    description: 'Eliminou evento: Treino Cancelado',
  },
]

test.describe('Registo de Auditoria', () => {
  test('Direção acede ao registo de auditoria no Clube e consulta histórico com diff', async ({ page }) => {
    await montarSupabaseFalso(page, {
      audit_logs: LOGS_EXEMPLO,
    })

    // 1. Abrir o Clube
    await page.goto('/csc-vet/clube')
    const cartaoAuditoria = page.getByRole('link', { name: /Registo de auditoria/ })
    await expect(cartaoAuditoria).toBeVisible({ timeout: 15000 })

    // 2. Clicar no Registo de Auditoria
    await cartaoAuditoria.click()
    await expect(page).toHaveURL(/ver=auditoria/)
    await expect(page.getByRole('heading', { name: 'Registo de auditoria' })).toBeVisible({ timeout: 15000 })

    // 3. Verificação dos logs carregados
    await expect(page.getByText('Atualizou perfil de Sónia Ferreira')).toBeVisible()
    await expect(page.getByText('Publicou comunicado: Jantar de Natal do Clube')).toBeVisible()
    await expect(page.getByText('Eliminou evento: Treino Cancelado')).toBeVisible()

    // 4. Badges semânticos de ação
    await expect(page.getByText('✎ Alteração')).toBeVisible()
    await expect(page.getByText('+ Criação')).toBeVisible()
    await expect(page.getByText('✕ Eliminação')).toBeVisible()

    // 5. Expandir detalhe da alteração de perfil para verificar o diff
    await page.getByText('Atualizou perfil de Sónia Ferreira').click()
    await expect(page.getByText('Campos Alterados (2):')).toBeVisible()
    await expect(page.getByText('Papel principal')).toBeVisible()
    await expect(page.getByText('Jogador')).toBeVisible()
    await expect(page.getByText('Adepto')).toBeVisible()

    // 6. Testar filtros por Módulo: Plantel
    await page.getByRole('button', { name: 'Plantel', exact: true }).click()
    await expect(page.getByText('Atualizou perfil de Sónia Ferreira')).toBeVisible()
    await expect(page.getByText('Publicou comunicado: Jantar de Natal do Clube')).toHaveCount(0)

    // Voltar a Todos
    await page.getByRole('button', { name: 'Todos', exact: true }).click()
    await expect(page.getByText('Publicou comunicado: Jantar de Natal do Clube')).toBeVisible()

    // 7. Testar filtros por Ação: Criações
    await page.getByRole('button', { name: 'Criações', exact: true }).click()
    await expect(page.getByText('Publicou comunicado: Jantar de Natal do Clube')).toBeVisible()
    await expect(page.getByText('Atualizou perfil de Sónia Ferreira')).toHaveCount(0)
    await expect(page.getByText('Eliminou evento: Treino Cancelado')).toHaveCount(0)
  })

  test('Treinador sem papel de direção não vê o Registo de Auditoria', async ({ page }) => {
    const perfilTreinador = {
      id: 'treinador-1',
      name: 'Mário Silva',
      email: 'mario@csc-vet.local',
      role: 'coach',
      roles: ['coach'],
      status: 'active',
      jersey_number: null,
      shirt_name: 'Mário',
      position: null,
    }

    await montarSupabaseFalso(page, {
      profiles: [perfilTreinador],
      v_players_public: [perfilTreinador],
      audit_logs: LOGS_EXEMPLO,
    }, { id: perfilTreinador.id, email: perfilTreinador.email })

    await page.goto('/csc-vet/clube')
    // No índice do Clube, não deve aparecer o cartão de auditoria
    await expect(page.getByRole('link', { name: /Registo de auditoria/ })).toHaveCount(0)

    // E se tentar aceder diretamente por URL, deve ser redirecionado de volta ao índice
    await page.goto('/csc-vet/clube?ver=auditoria')
    await expect(page.getByRole('link', { name: /Registo de auditoria/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Registo de auditoria' })).toHaveCount(0)
  })
})
