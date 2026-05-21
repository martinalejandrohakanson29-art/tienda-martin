"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { usePathname } from "next/navigation";

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMain = pathname === "/admin/erp";

  return (
    <div className="flex flex-col flex-1">
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#101922]/90 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={isMain ? "/admin" : "/admin/erp"}
              className="p-2 text-slate-500 hover:text-[#2b8cee] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
              <span className="text-sm font-medium">{isMain ? "Panel" : "ERP"}</span>
            </Link>
            {!isMain && (
              <>
                <span className="text-slate-300 dark:text-slate-600 select-none">|</span>
                <div className="flex items-center gap-2">
                  <div className="bg-[#2b8cee] p-1.5 rounded-md text-white flex items-center justify-center">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>account_balance</span>
                  </div>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">ERP</span>
                </div>
              </>
            )}
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <Globe className="h-4 w-4 text-emerald-500" />
            <span className="hidden sm:inline">Ver Tienda</span>
          </Link>
        </div>
      </header>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
