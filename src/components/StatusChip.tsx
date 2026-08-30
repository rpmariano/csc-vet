import React from 'react'
import { Shield, ClipboardList, Goal } from 'lucide-react'
import type { UserRole, ProfileStatus } from '../context/AuthContext'

/**
 * Chips de estado partilhados por toda a app: um ponto colorido em vez de
 * emoji (🟢🔴🛡️📋⚽). Os emoji desenham-se de forma diferente em cada
 * telemóvel e um leitor de ecrã anuncia-os por extenso ("círculo vermelho") em
 * vez do que significam — ver a auditoria de UX/UI de agosto de 2026.
 */

const TAMANHOS = {
  sm: { pad: 'px-2 py-0.5', text: 'text-[11px]', dot: 'w-1.5 h-1.5', gap: 'gap-1' },
  md: { pad: 'px-2.5 py-1', text: 'text-xs', dot: 'w-2 h-2', gap: 'gap-1.5' },
} as const

export type ChipSize = keyof typeof TAMANHOS

export const ClinicalStatusChip: React.FC<{ status: ProfileStatus; size?: ChipSize; className?: string }> = ({
  status,
  size = 'md',
  className = '',
}) => {
  const t = TAMANHOS[size]
  const isInjured = status === 'injured'
  return (
    <span
      className={`inline-flex items-center ${t.gap} ${t.pad} rounded-full font-bold ${t.text} border ${
        isInjured
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
      } ${className}`}
    >
      <span className={`${t.dot} rounded-full shrink-0 ${isInjured ? 'bg-red-600' : 'bg-emerald-600'}`} />
      <span>{isInjured ? 'Lesionado' : 'Apto'}</span>
    </span>
  )
}

const PAPEL_INFO: Record<UserRole, { label: string; icon: typeof Shield; bg: string; text: string }> = {
  admin: { label: 'Admin', icon: Shield, bg: 'bg-csc-gold', text: 'text-csc-dark' },
  coach: { label: 'Treinador', icon: ClipboardList, bg: 'bg-blue-600', text: 'text-white' },
  player: { label: 'Jogador', icon: Goal, bg: 'bg-csc-light', text: 'text-white' },
}

export const RoleChip: React.FC<{ role: UserRole; size?: ChipSize; className?: string }> = ({
  role,
  size = 'md',
  className = '',
}) => {
  const t = TAMANHOS[size]
  const { label, icon: Icon, bg, text } = PAPEL_INFO[role]
  return (
    <span className={`inline-flex items-center ${t.gap} ${t.pad} rounded-full font-black uppercase tracking-wide ${t.text} ${bg} ${text} ${className}`}>
      <Icon size={size === 'sm' ? 10 : 12} />
      <span>{label}</span>
    </span>
  )
}

/** Ícone de papel em avatar quadrado, para o seletor de perfil. */
export const RoleAvatar: React.FC<{ role: UserRole; size?: number }> = ({ role, size = 40 }) => {
  const { icon: Icon, bg, text } = PAPEL_INFO[role]
  return (
    <div
      className={`rounded-xl ${bg} ${text} flex items-center justify-center shrink-0 shadow-xs`}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.5} strokeWidth={2.25} />
    </div>
  )
}
