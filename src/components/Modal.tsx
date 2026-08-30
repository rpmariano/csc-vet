import React, { useRef } from 'react'
import { X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'

/**
 * Modal base da aplicação: a moldura visual padrão (cabeçalho, corpo com scroll
 * próprio e rodapé de ações) já com o comportamento de acessibilidade do
 * useModalA11y — Escape, prisão de foco, devolução do foco, bloqueio do scroll
 * do body e `role="dialog"`.
 *
 * Modais com visual próprio, que não caibam nesta moldura, devem usar
 * diretamente o hook `useModalA11y` em vez de forçar o encaixe aqui.
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

const LARGURAS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  /** Título do diálogo, ligado ao painel por `aria-labelledby`. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Ícone opcional à esquerda do título. */
  icon?: React.ReactNode
  size?: ModalSize
  /** Rodapé fixo, tipicamente os botões de ação. */
  footer?: React.ReactNode
  /** Desligar quando houver alterações por guardar e o fecho tiver de ser deliberado. */
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  showCloseButton?: boolean
  /** Nome acessível quando não há título visível (ex.: um visualizador de fotos). */
  ariaLabel?: string
  children?: React.ReactNode
}

export const Modal: React.FC<ModalProps> = ({
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
  children,
}) => {
  const painelRef = useModalA11y({ isOpen, onClose, closeOnEscape })
  const tituloId = useRef(`modal-titulo-${Math.random().toString(36).slice(2, 9)}`)

  if (!isOpen) return null

  const temCabecalho = Boolean(title || description || icon || showCloseButton)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fade-in"
      onMouseDown={e => {
        // mousedown no fundo, e não um arrasto que começou dentro do painel
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={!title ? ariaLabel : undefined}
        aria-labelledby={title ? tituloId.current : undefined}
        tabIndex={-1}
        className={`bg-white rounded-2xl w-full ${LARGURAS[size]} shadow-2xl border border-gray-100 relative my-auto max-h-[90vh] flex flex-col animate-scale-up outline-none`}
      >
        {temCabecalho && (
          <div className="flex items-start gap-3 p-5 pb-3 border-b border-gray-100 shrink-0">
            {icon && <div className="shrink-0 mt-0.5">{icon}</div>}

            <div className="flex-1 min-w-0">
              {title && (
                <h2 id={tituloId.current} className="text-lg font-black text-gray-900 leading-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs text-gray-500 font-medium mt-0.5">{description}</p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="shrink-0 -mt-1 -mr-1 p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-light"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2.5 p-5 pt-3 border-t border-gray-100 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
