import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAnnouncements } from '../context/AnnouncementsContext'
import { triggerHaptic } from '../utils/haptics'

interface AnnouncementsInboxButtonProps {
  /** 'light': gatilho sobre fundo claro (cabeçalhos). 'dark': sobre fundo escuro (sidebar). */
  tone?: 'light' | 'dark'
  /** 'md' (padrão, 36px): cabeçalho desktop e sidebar. 'sm' (28px): cabeçalho mobile, ao lado de um avatar mais pequeno. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * O sino dos comunicados, no canto do cabeçalho de todos os ecrãs, com o
 * número dos que estão por ler.
 *
 * **Leva ao ecrã dos Comunicados** (`/announcements`), aberto a toda a gente.
 * Até 2026-09-25 abria uma persiana com a lista, e o ecrã era só da gestão:
 * duas portas para o mesmo sítio, e um comunicado comprido lia-se numa caixa
 * a 90% da altura. É lá que se marcam como lidos — ver `AnnouncementsPage`.
 */
export const AnnouncementsInboxButton: React.FC<AnnouncementsInboxButtonProps> = ({ tone = 'light', size = 'md', className = '' }) => {
  const { unreadCount } = useAnnouncements()
  const { pathname } = useLocation()

  const corBotao = tone === 'dark'
    ? 'bg-white/10 hover:bg-white/20 text-white'
    : 'bg-white/10 hover:bg-white/15 text-csc-dark'
  const tamanhoBotao = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'

  return (
    <Link
      to="/announcements"
      onClick={() => triggerHaptic('light')}
      aria-label={unreadCount > 0 ? `Comunicados — ${unreadCount} por ler` : 'Comunicados'}
      aria-current={pathname === '/announcements' ? 'page' : undefined}
      className={`alvo-toque ${tamanhoBotao} rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${corBotao} ${className}`}
    >
      <Bell size={size === 'sm' ? 14 : 16} />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1.5 rounded-full bg-csc-gold text-csc-tinta font-display text-[10px] font-extrabold flex items-center justify-center border-2 border-black/25">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  )
}

export default AnnouncementsInboxButton
