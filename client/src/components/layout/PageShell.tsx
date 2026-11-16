import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

export function PageShell({ title, description, icon, children, action }: PageShellProps) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-6 sm:pt-8 pb-24 sm:pb-20">
      <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-black/[0.04] dark:border-white/[0.08] shadow-2xs [&>svg]:h-5 [&>svg]:w-5">
                {icon}
              </div>
            )}
            <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 sm:text-3xl font-sans">
              {title}
            </h1>
          </div>
          {description && (
            <p className="mt-2 max-w-2xl text-xs sm:text-sm text-stone-500 dark:text-stone-400 leading-relaxed font-sans">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>

      <section className="space-y-6">
        {children}
      </section>
    </main>
  );
}
