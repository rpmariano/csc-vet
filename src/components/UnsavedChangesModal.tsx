import React, { useId } from 'react'
import { AlertCircle, Save, LogOut } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'
import { Botao } from './ui'

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
  const tituloId = useId()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal-confirm animate-fade-in select-none">
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="bg-csc-superficie rounded-3xl max-w-md w-full p-6 shadow-2xl border border-white/12 space-y-5 animate-scale-in outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-csc-gold/15 text-csc-gold flex items-center justify-center shrink-0 shadow-2xs">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 id={tituloId} className="text-base font-black text-white leading-tight">
              {title}
            </h3>
            <p className="text-xs text-white/62 mt-0.5">
              Alterações pendentes de gravação
            </p>
          </div>
        </div>

        <div className="bg-csc-gold/10 border border-csc-gold/25 rounded-2xl p-4 text-xs text-csc-gold">
          <p className="font-semibold leading-relaxed text-white">
            {description}
          </p>
        </div>

        <div className="space-y-2.5 pt-1">
          <Botao largo aparencia="verde" disabled={isSaving} onClick={onSaveAndExit}>
            <Save size={16} aria-hidden="true" />
            {isSaving ? 'A guardar…' : 'Guardar e sair'}
          </Botao>
          <Botao largo aparencia="perigo" disabled={isSaving} onClick={onExitWithoutSaving}>
            <LogOut size={16} aria-hidden="true" />
            Sair sem guardar
          </Botao>
          <Botao largo aparencia="vidro" disabled={isSaving} onClick={onCancel}>
            Continuar a editar
          </Botao>
        </div>
      </div>
    </div>
  )
}
