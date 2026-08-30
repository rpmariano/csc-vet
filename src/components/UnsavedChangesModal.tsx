import React, { useRef } from 'react'
import { AlertCircle, Save, LogOut, ArrowLeft } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'

export interface UnsavedChangesModalProps {
  isOpen: boolean
  title?: string
  description?: string
  onSaveAndExit: () => void | Promise<void>
  onExitWithoutSaving: () => void
  onCancel: () => void
  isSaving?: boolean
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  title = "Tens alterações por guardar",
  description = "Se saíres agora, as informações preenchidas ou alteradas serão perdidas. O que pretendes fazer?",
  onSaveAndExit,
  onExitWithoutSaving,
  onCancel,
  isSaving = false
}) => {
  // Escape fecha com 'Cancelar', que é a opção segura: não sai nem descarta nada.
  const painelRef = useModalA11y({ isOpen, onClose: onCancel })
  const tituloId = useRef(`por-guardar-${Math.random().toString(36).slice(2, 9)}`)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-70 animate-fade-in select-none">
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId.current}
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-scale-in outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 id={tituloId.current} className="text-base font-black text-gray-900 leading-tight">
              {title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Alterações pendentes de gravação
            </p>
          </div>
        </div>

        <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-950">
          <p className="font-semibold leading-relaxed text-gray-800">
            {description}
          </p>
        </div>

        <div className="space-y-2.5 pt-1">
          {/* Opção 1: Gravar e Sair */}
          <button
            type="button"
            disabled={isSaving}
            onClick={onSaveAndExit}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            <Save size={16} />
            <span>{isSaving ? 'A guardar...' : 'Gravar e Sair'}</span>
          </button>

          {/* Opção 2: Sair sem Gravar */}
          <button
            type="button"
            disabled={isSaving}
            onClick={onExitWithoutSaving}
            className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 border border-red-200 disabled:opacity-50"
          >
            <LogOut size={16} />
            <span>Sair sem Gravar</span>
          </button>

          {/* Opção 3: Cancelar / Continuar a Editar */}
          <button
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <ArrowLeft size={14} />
            <span>Cancelar (Continuar a Editar)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
