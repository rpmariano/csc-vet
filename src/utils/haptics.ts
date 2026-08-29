export type HapticFeedbackType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'

/**
 * Triggers subtle haptic feedback vibrations on supported devices (Android, iOS Webkit, Chrome, PWA).
 */
export const triggerHaptic = (type: HapticFeedbackType = 'light'): void => {
  if (typeof window === 'undefined') return

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      switch (type) {
        case 'light':
        case 'selection':
          navigator.vibrate(12)
          break
        case 'medium':
          navigator.vibrate(25)
          break
        case 'heavy':
          navigator.vibrate(45)
          break
        case 'success':
          navigator.vibrate([18, 40, 22])
          break
        case 'warning':
          navigator.vibrate([30, 50, 30])
          break
        case 'error':
          navigator.vibrate([40, 60, 40, 60, 40])
          break
        default:
          navigator.vibrate(15)
      }
    }
  } catch {
    // Ignore devices where vibration is disabled or not supported
  }
}
