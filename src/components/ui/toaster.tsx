'use client'

import { useToast } from '@/hooks/use-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'mb-2 flex w-full items-center justify-between rounded-lg border p-4 shadow-lg animate-in fade-in slide-in-from-right-full',
            toast.variant === 'destructive'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-gray-200 bg-white text-gray-900',
          )}
        >
          <div className="flex-1">
            {toast.title && <div className="font-medium">{toast.title}</div>}
            {toast.description && (
              <div
                className={cn(
                  'text-sm',
                  toast.variant === 'destructive' ? 'text-red-700' : 'text-gray-600',
                )}
              >
                {toast.description}
              </div>
            )}
          </div>
          <div className="ml-4 flex items-center gap-2">
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onClick()
                  dismiss(toast.id)
                }}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded whitespace-nowrap',
                  toast.variant === 'destructive'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                )}
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
