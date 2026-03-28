import { useState, useCallback, useEffect } from 'react'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
  action?: {
    label: string
    onClick: () => void
  }
}

const toasts: Toast[] = []
const listeners: Set<(toasts: Toast[]) => void> = new Set()

function notifyListeners() {
  listeners.forEach(listener => listener([...toasts]))
}

export function useToast() {
  const [toastList, setToastList] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setToastList(newToasts)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const newToast: Toast = { ...toast, id, variant: toast.variant || 'default' }
    toasts.push(newToast)
    notifyListeners()

    setTimeout(() => {
      const index = toasts.findIndex(t => t.id === id)
      if (index > -1) {
        toasts.splice(index, 1)
        notifyListeners()
      }
    }, 5000)

    return id
  }, [])

  const dismissToast = useCallback((id: string) => {
    const index = toasts.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.splice(index, 1)
      notifyListeners()
    }
  }, [])

  const toast = useCallback((toast: Omit<Toast, 'id'>) => {
    return addToast(toast)
  }, [addToast])

  return { toast, dismiss: dismissToast, toasts: toastList }
}
