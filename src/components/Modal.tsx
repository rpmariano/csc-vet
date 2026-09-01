import React, { useId } from 'react'
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
  /** 'light': cartão branco (padrão). 'dark': cartão csc-dark, como a persiana de eventos. */
  tone?: 'light' | 'dark'
  /**
   * Cabeçalho: 'plain' é o título sobre o próprio cartão; 'brand' é a barra
   * csc-dark com ícone dourado e botão de fechar redondo — a moldura usada nos
   * formulários do clube (torneios, encargos, jornadas).
   */
  headerStyle?: 'plain' | 'brand'
  /** Este modal abre a partir de dentro de outro (ex.: editar algo cujo detalhe já está numa persiana) — sobe para `z-modal-top` em vez do `z-modal` base. */
  stacked?: boolean
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
  tone = 'light',
  headerStyle = 'plain',
  stacked = false,
  children,
}) => {
  const painelRef = useModalA11y({ isOpen, onClose, closeOnEscape })
  const tituloId = useId()

  if (!isOpen) return null

  const temCabecalho = Boolean(title || description || icon || showCloseButton)
  const cabecalhoBranded = headerStyle === 'brand'
  const corFundo = tone === 'dark' ? 'bg-csc-dark text-white' : 'bg-white'
  const corBordo = tone === 'dark' ? 'border-white/10' : 'border-gray-100'
  const corTitulo = tone === 'dark' ? 'text-white' : 'text-gray-900'
  const corDescricao = tone === 'dark' ? 'text-white/60' : 'text-gray-500'
  const corBotaoFechar =
    tone === 'dark'
      ? 'bg-white/10 hover:bg-white/20 text-white'
      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'

  return (
    <div
      className={`fixed inset-0 ${stacked ? 'z-modal-top' : 'z-modal'} flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fade-in`}
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
        aria-labelledby={title ? tituloId : undefined}
        tabIndex={-1}
        className={`${corFundo} rounded-2xl w-full ${LARGURAS[size]} shadow-2xl border ${corBordo} relative my-auto max-h-[90vh] flex flex-col animate-scale-up outline-none ${cabecalhoBranded ? 'overflow-hidden' : ''}`}
      >
        {temCabecalho && cabecalhoBranded && (
          <div className="flex items-center justify-between gap-3 p-4 bg-csc-dark text-white border-b border-black/10 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {icon && <div className="shrink-0">{icon}</div>}
              <div className="min-w-0">
                {title && (
                  <h2 id={tituloId} className="font-black text-sm leading-tight truncate">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-[11px] font-medium text-white/60 mt-0.5 truncate">{description}</p>
                )}
              </div>
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="shrink-0 w-8 h-8 rounded-full bg-white text-csc-dark hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-md border-2 border-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={16} className="stroke-[2.5]" />
              </button>
            )}
          </div>
        )}

        {temCabecalho && !cabecalhoBranded && (
          <div className={`flex items-start gap-3 p-5 pb-3 border-b ${corBordo} shrink-0`}>
            {icon && <div className="shrink-0 mt-0.5">{icon}</div>}

            <div className="flex-1 min-w-0">
              {title && (
                <h2 id={tituloId} className={`text-lg font-black leading-tight ${corTitulo}`}>
                  {title}
                </h2>
              )}
              {description && (
                <p className={`text-xs font-medium mt-0.5 ${corDescricao}`}>{description}</p>
              )}
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

        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className={`flex items-center justify-end gap-2.5 border-t ${corBordo} shrink-0 ${cabecalhoBranded ? 'p-4' : 'p-5 pt-3'} ${cabecalhoBranded && tone === 'light' ? 'bg-gray-50' : ''}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
