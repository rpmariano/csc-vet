import React from 'react'
import { useAuth } from '../../context/AuthContext'

/**
 * O estado clínico de quem está a usar a app — "Apto", "Lesionado", "Inativo" —,
 * na pastilha do canto do cabeçalho.
 *
 * Está em todos os ecrãs, ao lado do sino e da fotografia: o cabeçalho é o
 * mesmo em toda a app, e é aqui que se lê se se pode jogar. Vivia só na Home,
 * escrito à mão, e nos outros ecrãs não havia forma de saber.
 *
 * O vocabulário é o do plantel (`profiles.status`) — Apto, Lesionado, Inativo —,
 * e não "ativo/inativo", que é a palavra da base e não a do balneário.
 */

const ESTADOS: Record<string, { texto: string; classe: string }> = {
  active: { texto: 'Apto', classe: 'bg-csc-light/20 border-csc-light/35 text-csc-verde-texto' },
  injured: { texto: 'Lesionado', classe: 'bg-csc-red/15 border-csc-red/32 text-csc-vermelho-texto' },
  inactive: { texto: 'Inativo', classe: 'bg-white/10 border-white/20 text-white/62' },
}

export const PastilhaEstado: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { profile } = useAuth()
  if (!profile) return null

  const estado = ESTADOS[profile.status ?? 'active'] ?? ESTADOS.active

  return (
    <span
      className={`flex-none font-display font-bold text-[11.5px] px-2.5 h-7 flex items-center rounded-[14px] border ${estado.classe} ${className}`}
    >
      {estado.texto}
    </span>
  )
}

export default PastilhaEstado
