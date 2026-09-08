import React, { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  Home,
  Calendar,
  Users,
  Trophy,
  Shield,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { BottomSheet } from './BottomSheet'
import { FaixaTopo } from './ui'
import { BarraNavegacao, type ItemNavegacao } from './nav/BarraNavegacao'
import { FolhaCriar } from './nav/FolhaCriar'
import { triggerHaptic } from '../utils/haptics'
import { usePlayerQuotaDebt } from '../hooks/usePlayerQuotaDebt'

/**
 * A moldura da app depois do redesenho de 2026.
 *
 * O que era duas navegações — sidebar de 256px no computador, cabeçalho mais
 * gaveta de traços no telemóvel — passou a ser uma só. A app é de telemóvel;
 * num ecrã largo é a mesma coisa ao meio (ver o `#root` em `index.css`), sem
 * uma segunda estrutura a manter em paralelo.
 *
 * O que a moldura dá é a faixa do topo, a barra inferior com os lugares do
 * perfil de quem está a ver, e a folha do [+] para quem cria. O cabeçalho não
 * é dela: cada ecrã tem o seu título, e o que se repete é só a fotografia que
 * abre o Perfil (`<CabecalhoEcra>`, ou a saudação no caso da Home).
 *
 * Tudo o resto — Financeiro, Torneios, Adversários, Campos — vive dentro do
 * ecrã Clube, como o handoff manda, e não numa lista lateral.
 */

/* Euros em português — a mesma notação do Financeiro. */
const EUROS = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const fmtEuro = (n: number) => EUROS.format(n)

/** Barra de três lugares: quem só consulta. */
const ITENS_JOGADOR: readonly ItemNavegacao[] = [
  { to: '/', etiqueta: 'Hoje', Icone: Home },
  { to: '/calendar', etiqueta: 'Agenda', Icone: Calendar },
  { to: '/competicao', etiqueta: 'Competição', Icone: Trophy },
]

/** Barra de quatro lugares com [+] ao meio: treinador e direção. */
const ITENS_GESTAO: readonly ItemNavegacao[] = [
  { to: '/', etiqueta: 'Hoje', Icone: Home },
  { to: '/calendar', etiqueta: 'Agenda', Icone: Calendar },
  { to: '/team-management', etiqueta: 'Plantel', Icone: Users },
  {
    to: '/clube',
    etiqueta: 'Clube',
    Icone: Shield,
    // O Backoffice ainda é uma página à parte (desmembra-se na fase 6); até
    // lá pertence ao Clube para efeitos de navegação.
    tambemEm: ['/admin', '/finance'],
  },
]

const Layout: React.FC = () => {
  const { profile } = useAuth()
  const location = useLocation()

  const [dividaAberta, setDividaAberta] = useState(false)
  const [criarAberto, setCriarAberto] = useState(false)

  const eAdmin = profile?.role === 'admin'
  const eTreinador = profile?.role === 'coach'
  const eJogador = !eAdmin && !eTreinador
  const gere = eAdmin || eTreinador

  const dividaQuotas = usePlayerQuotaDebt(profile, eJogador)

  // A barra flutua sobre o conteúdo, por isso o fim da coluna tem de acabar
  // acima dela — com `margin-bottom`, não `padding-bottom`: com padding, o
  // último cartão fica dentro da caixa de scroll mas por baixo da barra.
  const margemFinal = gere ? 110 : 104

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* A faixa é da moldura, não de cada ecrã: passa por trás do cabeçalho
          e sangra até às margens da coluna, como no protótipo. Um ecrã que
          precise de uma capa mais alta desenha a sua por cima. */}
      <FaixaTopo />

      {/*
        Aviso de quota em atraso. Estava no cartão de Quotas da gaveta, que
        desapareceu com ela. Fica à vista até a fase 8 lhe dar casa própria
        em "Os meus pagamentos" (12c), no Perfil.
      */}
      {eJogador && dividaQuotas.hasDebt && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium')
            setDividaAberta(true)
          }}
          className="mx-[18px] mt-1 min-h-11 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl
            bg-csc-red/15 border border-csc-red/35 text-left cursor-pointer
            transition-transform duration-150 active:scale-97"
        >
          <AlertTriangle size={16} className="text-csc-vermelho-texto shrink-0" />
          <span className="flex-1 font-display font-bold text-[11px] text-csc-vermelho-suave">
            {dividaQuotas.overdueMonths.length}{' '}
            {dividaQuotas.overdueMonths.length === 1 ? 'mês de quota em atraso' : 'meses de quota em atraso'}
            {' · '}
            {fmtEuro(dividaQuotas.totalDebt)}
          </span>
          <ArrowRight size={14} className="text-csc-vermelho-texto shrink-0" />
        </button>
      )}

      <main className="flex-1 px-[18px] pt-3" style={{ marginBottom: `${margemFinal}px` }}>
        <Outlet />
      </main>

      {/* O conteúdo passa por trás da barra translúcida; sem este esbatimento
          a barra deixa de se ler quando lhe passa texto por baixo. */}
      <div
        aria-hidden="true"
        className="fixed bottom-0 h-30 z-30 pointer-events-none esbate-fundo"
        style={{
          left: 'max(0px, calc(50vw - 240px))',
          right: 'max(0px, calc(50vw - 240px))',
        }}
      />

      <BarraNavegacao
        itens={gere ? ITENS_GESTAO : ITENS_JOGADOR}
        caminho={location.pathname}
        aoCriar={gere ? () => setCriarAberto(true) : undefined}
      />

      <FolhaCriar isOpen={criarAberto} onClose={() => setCriarAberto(false)} />

      {/* Detalhe da dívida de quotas. */}
      <BottomSheet
        isOpen={dividaAberta}
        onClose={() => setDividaAberta(false)}
        title="Quotas em atraso"
        description={`${dividaQuotas.overdueMonths.length} ${
          dividaQuotas.overdueMonths.length === 1 ? 'mês por regularizar' : 'meses por regularizar'
        }`}
        tone="dark"
        size="md"
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-red/20 text-csc-vermelho-texto flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
        }
      >
        <div className="space-y-1.5">
          {dividaQuotas.overdueMonths.map(mes => (
            <div
              key={mes.monthYear}
              className="flex items-center justify-between px-4 py-3 rounded-2xl bg-csc-red/12 border border-csc-red/25"
            >
              <span className="text-sm font-bold text-white capitalize">{mes.label}</span>
              <span className="font-display text-sm font-black text-csc-vermelho-texto tabular-nums">
                {fmtEuro(mes.amount)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="font-display font-extrabold uppercase text-[9.5px] tracking-[0.18em] text-white/62">
            Total em dívida
          </span>
          <span className="font-display text-xl font-black text-csc-vermelho-texto tabular-nums">
            {fmtEuro(dividaQuotas.totalDebt)}
          </span>
        </div>

        <Link
          to="/settings"
          onClick={() => setDividaAberta(false)}
          className="mt-4 w-full min-h-12 flex items-center justify-center gap-2 px-4 rounded-3xl
            bg-csc-gold text-csc-tinta font-display font-extrabold text-[12.5px] cursor-pointer
            transition-transform duration-150 active:scale-97"
        >
          <span>Consultar IBAN e regularizar</span>
          <ArrowRight size={15} />
        </Link>
      </BottomSheet>

      {/*
        Aqui vivia o `AutoAssociationModal`, que propunha uma ficha ao primeiro
        acesso e pedia confirmação. Saiu quando a identidade passou a ser o
        email e mais nada (`supabase_identidade_por_email_migration.sql`): com
        o email como chave a correspondência é certa, o `AuthContext` liga-a
        sozinho e não há nada para confirmar.

        O modal propunha também, quando a sugestão não servia, escolher
        **qualquer** ficha do plantel — que é precisamente o que a regra nova
        proíbe. O servidor recusava as que não batessem certo, mas a porta que
        ele abria era o telefone, que é auto-editável.
      */}
    </div>
  )
}

export default Layout
