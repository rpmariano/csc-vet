import React, { useId } from 'react'
import { AlertCircle, Trash2, CheckCircle, AlertTriangle } from 'lucide-react'
import { triggerHaptic } from '../utils/haptics'
import { useModalA11y } from '../hooks/useModalA11y'

export interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info' | 'success'
  icon?: React.ReactNode
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  icon,
  onConfirm,
  onCancel,
  isLoading = false
}) => {
  // Escape, prisão de foco e bloqueio de scroll, mantendo o visual próprio deste modal.
  const painelRef = useModalA11y({ isOpen, onClose: onCancel })
  const tituloId = useId()

  if (!isOpen) return null

  const handleConfirm = () => {
    triggerHaptic(variant === 'danger' ? 'warning' : 'medium')
    onConfirm()
  }

  const handleCancel = () => {
    triggerHaptic('light')
    onCancel()
  }

  /*
    As quatro variantes, nos tokens do clube.
    
    Estavam nas paletas do Tailwind do tema claro: um vermelho-50 a 80% de
    opacidade como fundo da caixa da mensagem, e um vermelho-950 no texto. No
    tema claro era um tom discreto sobre branco; sobre o fundo escuro era um
    retângulo quase branco com texto quase preto, aceso no meio de um diálogo
    escuro. E este diálogo é o de **todas** as confirmações de apagar da app.
    (Sem nomes de classe neste comentário de propósito: o
    `scripts/escurecer-tema.py` traduz o que encontra, comentários incluídos.)

    A cor de cada variante mantém-se — vermelho para eliminar, dourado para
    avisar, verde para confirmar, azul para informar: é informação e não
    decoração. O que muda é a forma de a aplicar, que passa a ser a do
    redesenho: a cor em translúcido sobre o fundo escuro, e o texto a branco.
  */
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-csc-red/16 text-csc-vermelho-texto border border-csc-red/32',
          defaultIcon: <Trash2 size={24} />,
          confirmBtn: 'bg-csc-red text-white',
          boxBg: 'bg-csc-red/10 border-csc-red/28 text-white/85',
        }
      case 'warning':
        return {
          iconBg: 'bg-csc-gold/16 text-csc-gold border border-csc-gold/32',
          defaultIcon: <AlertCircle size={24} />,
          confirmBtn: 'bg-csc-gold text-csc-tinta',
          boxBg: 'bg-csc-gold/10 border-csc-gold/28 text-white/85',
        }
      case 'success':
        return {
          iconBg: 'bg-csc-light/16 text-csc-verde-texto border border-csc-light/32',
          defaultIcon: <CheckCircle size={24} />,
          confirmBtn: 'bg-csc-light text-white',
          boxBg: 'bg-csc-light/10 border-csc-light/28 text-white/85',
        }
      default:
        return {
          iconBg: 'bg-csc-blue/20 text-csc-azul-texto border border-csc-blue/35',
          defaultIcon: <AlertTriangle size={24} />,
          confirmBtn: 'bg-csc-blue text-white',
          boxBg: 'bg-white/6 border-white/12 text-white/85',
        }
    }
  }

  const vStyles = getVariantStyles()

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal-confirm animate-fade-in select-none"
      onMouseDown={e => { if (e.target === e.currentTarget) handleCancel() }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="bg-csc-superficie rounded-3xl max-w-md w-full p-6 shadow-2xl border border-white/12 space-y-5 animate-scale-in outline-none"
      >
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${vStyles.iconBg}`}>
            {icon || vStyles.defaultIcon}
          </div>
          <div>
            <h3 id={tituloId} className="text-base font-black text-white leading-tight">
              {title}
            </h3>
            <p className="text-xs text-white/62 mt-0.5">
              Confirmação necessária
            </p>
          </div>
        </div>

        {description && (
          <div className={`border rounded-2xl p-4 text-xs font-semibold leading-relaxed ${vStyles.boxBg}`}>
            {description}
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          {/* Botão de Confirmação Principal */}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleConfirm}
            className={`w-full min-h-12 px-4 font-display font-black text-[12.5px] rounded-2xl transition-transform duration-150
              flex items-center justify-center gap-2 cursor-pointer active:scale-97 disabled:opacity-45
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${vStyles.confirmBtn}`}
          >
            <span>{isLoading ? 'A processar...' : confirmText}</span>
          </button>

          {/* Botão Cancelar */}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleCancel}
            className="w-full min-h-11 px-4 bg-white/9 border border-white/20 text-white font-display font-bold text-[12.5px]
              rounded-2xl transition-transform duration-150 active:scale-97 cursor-pointer text-center
              flex items-center justify-center gap-1.5 disabled:opacity-45
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <span>{cancelText}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
