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

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-red-100 text-red-700 border border-red-200',
          defaultIcon: <Trash2 size={24} />,
          confirmBtn: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
          boxBg: 'bg-red-50/80 border-red-200/90 text-red-950'
        }
      case 'warning':
        return {
          iconBg: 'bg-amber-100 text-amber-700 border border-amber-200',
          defaultIcon: <AlertCircle size={24} />,
          confirmBtn: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-csc-dark font-black shadow-sm',
          boxBg: 'bg-amber-50/80 border-amber-200/90 text-amber-950'
        }
      case 'success':
        return {
          iconBg: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
          defaultIcon: <CheckCircle size={24} />,
          confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm',
          boxBg: 'bg-emerald-50/80 border-emerald-200/90 text-emerald-950'
        }
      default:
        return {
          iconBg: 'bg-blue-100 text-blue-700 border border-blue-200',
          defaultIcon: <AlertTriangle size={24} />,
          confirmBtn: 'bg-csc-dark hover:bg-emerald-950 text-white shadow-sm',
          boxBg: 'bg-gray-50 border-gray-200 text-gray-800'
        }
    }
  }

  const vStyles = getVariantStyles()

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-70 animate-fade-in select-none"
      onMouseDown={e => { if (e.target === e.currentTarget) handleCancel() }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-scale-in outline-none"
      >
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${vStyles.iconBg}`}>
            {icon || vStyles.defaultIcon}
          </div>
          <div>
            <h3 id={tituloId} className="text-base font-black text-gray-900 leading-tight">
              {title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
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
            className={`w-full py-3 font-black text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 ${vStyles.confirmBtn}`}
          >
            <span>{isLoading ? 'A processar...' : confirmText}</span>
          </button>

          {/* Botão Cancelar */}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleCancel}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span>{cancelText}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
