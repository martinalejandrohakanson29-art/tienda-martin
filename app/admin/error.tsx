"use client"

import { useEffect } from "react"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[AdminError]", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-8">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-10 text-center max-w-md w-full">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl text-rose-500">error</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Algo salió mal
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Ocurrió un error inesperado en el panel de administración.
          {error.digest && (
            <span className="block mt-1 font-mono text-xs text-slate-400">
              Ref: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-[#2b8cee] hover:bg-[#1a76cc] text-white font-bold rounded-xl text-sm transition-all shadow-sm"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
