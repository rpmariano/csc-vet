import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Wallet, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useClub } from '../../context/ClubContext'
import { CLUBE_SIGLA } from '../../lib/clube'
import { triggerHaptic } from '../../utils/haptics'
import { CartaoSimples } from '../ui'
import { EcraDetalhe } from '../EcraDetalhe'
import { ContasPorAtleta } from '../financeiro/ContasPorAtleta'
import { contasDosAtletas, type DadosDasContas } from '../financeiro/contasDosAtletas'

/**
 * Relatórios — o que se tira da app para fora, para a direção.
 *
 * É uma secção do Clube (`?ver=relatorios`), só da direção, no bloco
 * "Direção" ao lado do Financeiro. Cada relatório abre num ecrã seu
 * (`&relatorio=…`), com link próprio e o retroceder a voltar à lista.
 *
 * **As Contas por atleta vieram do Financeiro** (era o separador "Por
 * atleta", até 2026-09-25): são o que se partilha no grupo da equipa, e não
 * trabalho de tesouraria. Saíram de lá, e não ficaram nos dois sítios — um
 * destino, uma porta. O endereço antigo (`/finance?ver=atletas`) redireciona
 * para aqui.
 *
 * O relatório dos documentos dos atletas vem a seguir, e entra nesta lista.
 */

interface Relatorio {
  chave: string
  titulo: string
  descricao: string
  Icone: LucideIcon
}

const RELATORIOS: readonly Relatorio[] = [
  {
    chave: 'contas',
    titulo: 'Contas por atleta',
    descricao: 'Quem deve o quê, e a mensagem para o WhatsApp',
    Icone: Wallet,
  },
]

export const Relatorios: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const aberto = params.get('relatorio')

  const fechar = () => {
    const seguintes = new URLSearchParams(params)
    seguintes.delete('relatorio')
    seguintes.delete('conta')
    setParams(seguintes)
  }

  return (
    <>
      <div className="space-y-2">
        {RELATORIOS.map(r => {
          const seguintes = new URLSearchParams(params)
          seguintes.set('relatorio', r.chave)
          return (
            <CartaoSimples
              key={r.chave}
              como={Link}
              to={`?${seguintes.toString()}`}
              onClick={() => triggerHaptic('light')}
              className="min-h-14 flex items-center gap-3.5 px-4 py-3 cursor-pointer
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <r.Icone size={20} strokeWidth={2} className="shrink-0 text-csc-gold" />
              <span className="min-w-0 flex-1">
                <span className="block font-display font-extrabold text-sm text-white">{r.titulo}</span>
                <span className="block text-[11px] leading-snug text-white/62 mt-0.5">{r.descricao}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-white/35" />
            </CartaoSimples>
          )
        })}
      </div>

      <RelatorioContas aberto={aberto === 'contas'} aoVoltar={fechar} />
    </>
  )
}

/**
 * As contas por atleta. Carrega o que o Financeiro carregava para elas — as
 * mesmas tabelas e vistas —, e a conta é a mesma função (`contasDosAtletas`),
 * por isso diz o mesmo que as Quotas e os Encargos.
 */
const RelatorioContas: React.FC<{ aberto: boolean; aoVoltar: () => void }> = ({ aberto, aoVoltar }) => {
  const { clubSettings } = useClub()
  const [dados, setDados] = useState<DadosDasContas | null>(null)

  useEffect(() => {
    if (!aberto) return
    let cancelado = false
    Promise.all([
      supabase.from('v_players_public').select('id, name, shirt_name, jersey_number').order('jersey_number', { ascending: true, nullsFirst: false }),
      supabase.from('v_quota_status').select('player_id, month_year, expected_amount, paid_amount, paid_at, due_date, status, owed_amount').order('month_year'),
      supabase.from('charges').select('id, title, amount, due_date, category_id'),
      supabase.from('charge_players').select('charge_id, player_id'),
      supabase.from('charge_payments').select('charge_id, player_id, amount, paid_at'),
      supabase.from('expense_categories').select('id, name'),
    ]).then(([atletas, quotas, encargos, participacoes, pagamentos, categorias]) => {
      if (cancelado) return
      setDados({
        atletas: (atletas.data ?? []) as DadosDasContas['atletas'],
        quotas: (quotas.data ?? []) as DadosDasContas['quotas'],
        encargos: (encargos.data ?? []) as DadosDasContas['encargos'],
        participacoes: (participacoes.data ?? []) as DadosDasContas['participacoes'],
        pagamentos: (pagamentos.data ?? []) as DadosDasContas['pagamentos'],
        categorias: (categorias.data ?? []) as DadosDasContas['categorias'],
      })
    })
    return () => { cancelado = true }
  }, [aberto])

  const contas = useMemo(() => (dados ? contasDosAtletas(dados) : null), [dados])

  return (
    <EcraDetalhe aberto={aberto} voltarPara="Relatórios" aoVoltar={aoVoltar} sobrancelha="Relatórios" titulo="Contas por atleta">
      {contas === null ? (
        <div className="cartao-simples h-40 animate-pulse" role="status" aria-label="A carregar as contas" />
      ) : (
        <ContasPorAtleta contas={contas} clube={clubSettings?.initials || CLUBE_SIGLA} />
      )}
    </EcraDetalhe>
  )
}

export default Relatorios
