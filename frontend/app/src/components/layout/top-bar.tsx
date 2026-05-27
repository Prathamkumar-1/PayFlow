// ============================================================================
// Top Bar -- Union Bank-facing institutional shell
// ============================================================================

import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/use-ui-store'
import { ConnectionStatus } from '@/components/shared/connection-status'
import { Building2, Radio, Search, ShieldCheck, Languages } from 'lucide-react'
import { useT, useLanguage } from '@/lib/i18n'

export function TopBar() {
  const [clock, setClock] = useState(formatClock())
  const [date, setDate] = useState(formatDate())
  const t = useT()
  const { toggle } = useLanguage()

  useEffect(() => {
    const interval = setInterval(() => {
      setClock(formatClock())
      setDate(formatDate())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const connected = useUIStore((s) => s.connected)
  const setActiveTab = useUIStore((s) => s.setActiveTab)

  return (
    <>
      <div className="ubi-access-strip hidden shrink-0 items-center justify-between px-5 text-[10px] font-medium lg:flex">
        <div className="flex items-center gap-4">
          <span>{t('skip_to_main')}</span>
          <span className="h-3 w-px bg-border-subtle" />
          <span>{t('screen_reader')}</span>
          <span className="h-3 w-px bg-border-subtle" />
          <span>A-</span>
          <span>A</span>
          <span>A+</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{t('contact_us')}</span>
          <button onClick={() => setActiveTab('pre-fraud-intel')} className="rounded-full bg-accent-primary px-3 py-1 font-bold text-white">
            {t('payflow_portal')}
          </button>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 py-1 font-semibold text-accent-primary transition-colors hover:bg-accent-primary/20"
          >
            <Languages className="h-3 w-3" />
            {t('language_toggle')}
          </button>
        </div>
      </div>

      <header className="ubi-official-header flex h-16 shrink-0 items-center justify-between border-b border-border-default px-5">
        <a href="/landing" title="Union Bank prototype landing" target="_self" className="flex min-w-0 items-center gap-3">
          <span className="ubi-brand-mark shrink-0">
            <span className="sr-only">Union Bank of India</span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="ubi-wordmark-title truncate text-[16px] leading-tight">
              Union Bank <span>of India</span>
            </span>
            <span className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted leading-tight">
              {t('govt_tagline')}
            </span>
          </span>
        </a>

        <div className="hidden min-w-0 flex-1 items-center justify-center px-6 xl:flex">
          <div className="ubi-pill-menu flex items-center gap-5 px-6 py-2 text-[11px] font-bold">
            <button onClick={() => setActiveTab('pre-fraud-intel')}>{t('nav_pre_fraud')}</button>
            <button onClick={() => setActiveTab('overview')}>{t('nav_fund_flow')}</button>
            <button onClick={() => setActiveTab('threat-sim')}>{t('nav_event_lab')}</button>
            <button onClick={() => setActiveTab('investigations')}>{t('nav_investigator')}</button>
            <button onClick={() => setActiveTab('compliance')}>{t('nav_fiu')}</button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <a href="/docs" className="hidden items-center gap-2 rounded-full bg-bg-elevated px-3 py-1.5 text-[10px] font-semibold text-text-secondary lg:flex">
            <Search className="h-3.5 w-3.5" />
            {t('api_docs')}
          </a>
          {/* Language toggle — visible on smaller screens where the access strip is hidden */}
          <button
            onClick={toggle}
            className="flex items-center gap-1 rounded-full border border-accent-primary/30 bg-accent-primary/10 px-2.5 py-1 text-[9px] font-semibold text-accent-primary transition-colors hover:bg-accent-primary/20 lg:hidden"
          >
            <Languages className="h-3 w-3" />
            {t('language_toggle')}
          </button>
          <div className="hidden items-center gap-2 md:flex">
            <Building2 className="h-3.5 w-3.5 text-accent-primary" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-text-secondary">
              {t('good_people')}
            </span>
          </div>
          <div className="hidden h-4 w-px bg-border-subtle md:block" />
          <ShieldCheck className="hidden h-3.5 w-3.5 text-alert-low md:block" />
          <ConnectionStatus connected={connected} />
          <div className="h-4 w-px bg-border-subtle" />
          <div className="flex items-center gap-2">
            <Radio className="w-3 h-3 text-text-muted" />
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-mono font-semibold text-text-primary tabular-nums leading-tight">
                {clock}
              </span>
              <span className="text-[8px] font-mono text-text-muted uppercase leading-tight">
                {date}
              </span>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}

function formatClock(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
