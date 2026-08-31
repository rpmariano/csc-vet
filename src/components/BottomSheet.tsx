import React, { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'

/**
 * Persiana / bottom sheet: a moldura para ecrãs de "ver" (detalhe de evento,
 * de jogador, de comunicado, de ficha de jogo em modo leitura...). No
 * telemóvel desliza do fundo, com arrasto para fechar pela alça ou pelo
 * corpo quando este está no topo do scroll; a partir do breakpoint `sm:`
 * degrada para um modal centrado, tal como o `Modal`.
 *
 * Ecrãs de "editar" (formulários, confirmações, ações destrutivas) devem
 * continuar a usar `Modal` — pedem um contentor mais deliberado, sem um
 * gesto de arrastar que possa fechar o ecrã por engano com alterações por
 * guardar.
 *
 * A física de arrasto foi extraída do modal de detalhe de evento do
 * CalendarPage (persiana original da app) — mesmo comportamento, agora
 * partilhado por qualquer ecrã de detalhe.
 */

export type BottomSheetSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

const LARGURAS: Record<BottomSheetSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
}

/** Distância arrastada para baixo, em px, a partir da qual a persiana fecha. */
const DISTANCIA_FECHO = 110

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Título do diálogo, ligado ao painel por `aria-labelledby`. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Ícone opcional à esquerda do título. */
  icon?: React.ReactNode
  size?: BottomSheetSize
  /** Rodapé fixo, tipicamente ações rápidas (ex.: RSVP). */
  footer?: React.ReactNode
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  showCloseButton?: boolean
  /** Nome acessível quando não há título visível. */
  ariaLabel?: string
  /** 'light': cartão branco, como o `Modal`. 'dark': cartão csc-dark, como a persiana de eventos. */
  tone?: 'light' | 'dark'
  children?: React.ReactNode
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  size = 'lg',
  footer,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  ariaLabel,
  tone = 'light',
  children,
}) => {
  const painelRef = useModalA11y({ isOpen, onClose, closeOnEscape })
  const tituloId = useId()

  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startY: number } | null>(null)

  // Sem `isOpen`, o componente desmonta — o estado de arrasto acima já reinicia sozinho
  // no próximo `mount`, não precisa de um efeito a repô-lo.
  if (!isOpen) return null

  const ehMobile = typeof window !== 'undefined' && window.innerWidth < 640

  const onTouchStart = (e: React.TouchEvent) => {
    const scrollTop = painelRef.current ? painelRef.current.scrollTop : 0
    dragRef.current = { startY: e.touches[0].clientY }
    if (scrollTop <= 0) setIsDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current || !isDragging) return
    const deltaY = e.touches[0].clientY - dragRef.current.startY
    if (deltaY > 0) {
      e.stopPropagation()
      setTranslateY(deltaY)
    }
  }

  const onTouchEnd = () => {
    if (!dragRef.current) return
    setIsDragging(false)
    dragRef.current = null

    if (translateY > DISTANCIA_FECHO) {
      // Desliza para fora do ecrã antes de desmontar, em vez de desaparecer a meio do gesto.
      setTranslateY(window.innerHeight || 800)
      window.setTimeout(onClose, 220)
    } else {
      setTranslateY(0)
    }
  }

  const temCabecalho = Boolean(title || description || icon || showCloseButton)
  const corFundo = tone === 'dark' ? 'bg-csc-dark text-white' : 'bg-white'
  const corBordo = tone === 'dark' ? 'border-white/10' : 'border-gray-100'
  const corTitulo = tone === 'dark' ? 'text-white' : 'text-gray-900'
  const corDescricao = tone === 'dark' ? 'text-white/60' : 'text-gray-500'
  const corAlca = tone === 'dark' ? 'bg-white/25' : 'bg-gray-300'
  const corBotaoFechar =
    tone === 'dark'
      ? 'bg-white/10 hover:bg-white/20 text-white'
      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/60 backdrop-blur-xs overflow-hidden animate-fade-in"
      onMouseDown={e => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={!title ? ariaLabel : undefined}
        aria-labelledby={title ? tituloId : undefined}
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: ehMobile ? `translateY(${translateY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        className={`${corFundo} w-full ${LARGURAS[size]} rounded-t-3xl sm:rounded-3xl shadow-2xl relative max-h-[90vh] sm:max-h-[88vh] flex flex-col outline-none overscroll-contain animate-scale-up`}
      >
        {/* Alça de arrasto — só no telemóvel; também funciona como botão de fecho */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="sm:hidden flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0"
        >
          <span className={`w-12 h-1.5 rounded-full transition-colors ${corAlca}`} />
        </button>

        {temCabecalho && (
          <div className={`flex items-start gap-3 px-5 pb-3 pt-1 sm:pt-5 border-b ${corBordo} shrink-0`}>
            {icon && <div className="shrink-0 mt-0.5">{icon}</div>}

            <div className="flex-1 min-w-0">
              {title && (
                <h2 id={tituloId} className={`text-lg font-black leading-tight ${corTitulo}`}>
                  {title}
                </h2>
              )}
              {description && <p className={`text-xs font-medium mt-0.5 ${corDescricao}`}>{description}</p>}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className={`shrink-0 -mt-1 -mr-1 p-2 rounded-xl transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-light ${corBotaoFechar}`}
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        <div className="px-5 pb-5 pt-3 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className={`flex items-center justify-end gap-2.5 p-5 pt-3 border-t ${corBordo} shrink-0`}>{footer}</div>
        )}
      </div>
    </div>
  )
}

export default BottomSheet
