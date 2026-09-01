import React, { useState } from 'react'
import { Bell, ChevronDown, Megaphone } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
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
 * Inbox de comunicados: um ícone junto à imagem do perfil (cabeçalho mobile e
 * desktop, e cartão da sidebar) com o número de não lidos, e a persiana que
 * lista os comunicados. Substituiu o antigo carrossel na Home — ler passou a
 * ser um gesto junto do perfil, não um cartão a ocupar a página inicial.
 *
 * "Lido" é local ao dispositivo (ver AnnouncementsContext): não há tabela de
 * leituras na base de dados. Um comunicado fica marcado como lido assim que o
 * atleta o abre/expande — não é preciso nenhum outro gesto.
 */
export const AnnouncementsInboxButton: React.FC<AnnouncementsInboxButtonProps> = ({ tone = 'light', size = 'md', className = '' }) => {
  const { announcements, unreadCount, isRead, markAsRead, loading } = useAnnouncements()
  const [isOpen, setIsOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleOpen = () => {
    triggerHaptic('light')
    setIsOpen(true)
  }

  const handleToggleItem = (id: string) => {
    const next = expandedId === id ? null : id
    setExpandedId(next)
    if (next) markAsRead(id)
  }

  const corBotao = tone === 'dark'
    ? 'bg-white/10 hover:bg-white/20 text-white'
    : 'bg-gray-100 hover:bg-gray-200 text-csc-dark'
  const tamanhoBotao = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? `Comunicados — ${unreadCount} por ler` : 'Comunicados'}
        className={`relative ${tamanhoBotao} rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 ${corBotao} ${className}`}
      >
        <Bell size={size === 'sm' ? 14 : 16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-csc-red text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Comunicados"
        description={unreadCount > 0 ? `${unreadCount} por ler` : 'Estás em dia com os avisos do clube'}
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
            <Megaphone size={18} />
          </div>
        }
        tone="dark"
        size="md"
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-csc-gold border-t-transparent" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-10 text-white/60 text-xs font-medium">
            Sem comunicados no momento.
          </div>
        ) : (
          <div className="space-y-2.5">
            {announcements.map(a => {
              const aberto = expandedId === a.id
              const lido = isRead(a.id)
              return (
                <div
                  key={a.id}
                  className={`rounded-2xl border overflow-hidden transition-colors ${
                    lido ? 'bg-white/5 border-white/10' : 'bg-white/10 border-csc-gold/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleItem(a.id)}
                    aria-expanded={aberto}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left cursor-pointer"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${lido ? 'bg-transparent' : 'bg-csc-gold'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white leading-snug">{a.title}</p>
                      <p className="text-xs text-white/60 mt-0.5">
                        {new Date(a.published_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-white/60 shrink-0 mt-0.5 transition-transform ${aberto ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {aberto && (
                    <div className="px-4 pb-4 pl-[34px]">
                      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{a.content}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </BottomSheet>
    </>
  )
}

export default AnnouncementsInboxButton
