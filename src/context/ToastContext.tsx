import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { triggerHaptic } from '../utils/haptics'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

// Singleton global para permitir chamadas diretas como toast.success(...)
let globalShowToast: ((message: string, type?: ToastType, duration?: number) => void) | null = null

export const toast = {
  show: (message: string, type: ToastType = 'info', duration?: number) => {
    if (globalShowToast) globalShowToast(message, type, duration)
    else console.log(`[Toast ${type}]: ${message}`)
  },
  success: (message: string, duration?: number) => toast.show(message, 'success', duration),
  error: (message: string, duration?: number) => toast.show(message, 'error', duration),
  info: (message: string, duration?: number) => toast.show(message, 'info', duration),
  warning: (message: string, duration?: number) => toast.show(message, 'warning', duration)
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3800) => {
    // Aciona feedback háptico de acordo com o tipo de mensagem
    if (type === 'success') triggerHaptic('success')
    else if (type === 'error') triggerHaptic('error')
    else if (type === 'warning') triggerHaptic('warning')
    else triggerHaptic('medium')

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newToast: ToastItem = { id, message, type, duration }

    setToasts(prev => [newToast, ...prev.slice(0, 3)]) // Máximo 4 toasts simultâneos

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }, [removeToast])

  // Regista singleton
  globalShowToast = showToast

  const success = useCallback((msg: string, dur?: number) => showToast(msg, 'success', dur), [showToast])
  const error = useCallback((msg: string, dur?: number) => showToast(msg, 'error', dur), [showToast])
  const info = useCallback((msg: string, dur?: number) => showToast(msg, 'info', dur), [showToast])
  const warning = useCallback((msg: string, dur?: number) => showToast(msg, 'warning', dur), [showToast])

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
      {children}

      {/* Contentor Visual dos Toasts (Top-Center no Mobile, Top-Right no Desktop) */}
      <div 
        className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-[9999] flex flex-col gap-2.5 w-[92%] max-w-sm sm:max-w-md pointer-events-none select-none"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const isSuccess = t.type === 'success'
          const isError = t.type === 'error'
          const isWarning = t.type === 'warning'
          const isInfo = t.type === 'info'

          return (
            <div
              key={t.id}
              onClick={() => removeToast(t.id)}
              className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border flex items-start gap-3 transition-all transform animate-scale-in cursor-pointer ${
                isSuccess
                  ? 'bg-gradient-to-r from-emerald-900 to-teal-950 text-white border-emerald-600/80 shadow-emerald-950/40'
                  : isError
                  ? 'bg-gradient-to-r from-red-900 to-rose-950 text-white border-red-600/80 shadow-red-950/40'
                  : isWarning
                  ? 'bg-gradient-to-r from-amber-800 to-amber-950 text-white border-amber-500/80 shadow-amber-950/40'
                  : 'bg-gradient-to-r from-csc-dark via-gray-900 to-black text-white border-csc-gold/60 shadow-black/50'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 size={20} className="text-emerald-400" />}
                {isError && <AlertCircle size={20} className="text-red-400" />}
                {isWarning && <AlertTriangle size={20} className="text-amber-400" />}
                {isInfo && <Info size={20} className="text-csc-gold" />}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <p className="text-xs sm:text-sm font-black leading-snug tracking-tight whitespace-pre-line break-words">
                  {t.message}
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeToast(t.id)
                }}
                className="shrink-0 p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    return {
      showToast: toast.show,
      success: toast.success,
      error: toast.error,
      info: toast.info,
      warning: toast.warning
    }
  }
  return context
}
