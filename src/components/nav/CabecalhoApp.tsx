import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AnnouncementsInboxButton } from '../AnnouncementsInbox'
import { ClinicalStatusChip } from '../StatusChip'
import { triggerHaptic } from '../../utils/haptics'

/**
 * O cabeçalho da app: fotografia à direita, comunicados ao lado.
 *
 * No redesenho não há barra de topo com o logótipo nem menu de traços — o
 * Perfil abre-se na fotografia e os comunicados no sino ao lado, com o
 * contador de não lidos. Fica transparente, por cima da faixa geométrica de
 * cada ecrã, para não haver duas superfícies escuras empilhadas.
 *
 * O estado clínico (Apto/Lesionado) continua a alternar-se com um toque,
 * como já acontecia: é o gesto que o atleta faz mais vezes e não vale a pena
 * enterrá-lo dentro do Perfil.
 */

export interface CabecalhoAppProps {
  /** Quem pode trocar de papel abre o seletor aqui. */
  aoTrocarPapel?: () => void
  className?: string
}

export const CabecalhoApp: React.FC<CabecalhoAppProps> = ({ aoTrocarPapel, className = '' }) => {
  const { profile, assignedRoles, toggleClinicalStatus } = useAuth()
  const podeTrocarPapel = (assignedRoles?.length ?? 1) > 1

  if (!profile) return null

  return (
    <header className={`flex items-center justify-end gap-2.5 pt-safe ${className}`}>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('medium')
          toggleClinicalStatus()
        }}
        title="Alternar entre Apto e Lesionado"
        className="cursor-pointer rounded-full transition-transform duration-150 active:scale-97
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        <ClinicalStatusChip status={profile.status} size="sm" />
      </button>

      {podeTrocarPapel && (
        <button
          type="button"
          onClick={aoTrocarPapel}
          className="h-9 px-3 rounded-full bg-white/9 border border-white/20 text-white/80
            font-display font-bold text-[10px] uppercase tracking-[0.14em] cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
        >
          {profile.role === 'admin' ? 'Direção' : profile.role === 'coach' ? 'Treinador' : 'Jogador'}
        </button>
      )}

      <AnnouncementsInboxButton tone="dark" size="md" />

      <Link
        to="/settings"
        title="Ver perfil"
        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        {profile.photo_url ? (
          <img
            src={profile.photo_url}
            alt="Perfil"
            className="w-10 h-10 rounded-full object-cover border border-csc-gold/60"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/12 border border-white/20 text-white font-display font-black text-sm flex items-center justify-center">
            {profile.name.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>
    </header>
  )
}

export default CabecalhoApp
