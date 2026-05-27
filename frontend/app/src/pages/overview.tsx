// ============================================================================
// Overview Page -- Stat strip + Sigma Graph + Node Detail Panel + Right Sidebar
// Enhanced: richer KPIs, live uptime, accent pulse, throughput display
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboardStore } from '@/stores/use-dashboard-store'
import {
  useCreateEvidencePackage,
  useLaunchPS3Scenario,
  usePS3Readiness,
  useRefreshIntel,
  useSnapshot,
  useSimulateIntelSignal,
} from '@/hooks/use-api'
import SigmaGraph from '@/components/panels/sigma-graph'
import { PreFraudIntelBrief } from '@/components/panels/pre-fraud-intel-brief'
import { NodeDetailPanel } from '@/components/panels/node-detail-panel'
import { RightSidebar } from '@/components/layout/right-sidebar'
import { useUIStore } from '@/stores/use-ui-store'
import { fmtNum } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import {
  ArrowRightLeft,
  Brain,
  Bell,
  CircleDot,
  GitBranch,
  AlertTriangle,
  Gauge,
  Thermometer,
  Activity,
  Shield,
  TrendingUp,
  Eye,
  FileText,
  Play,
  Radar,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PS3ScenarioId } from '@/lib/types'

/* ── Stat definition ── */
interface StatDef {
  label: string
  value: string
  accent: string
  iconAccent: string
  Icon: LucideIcon
  pulse?: boolean
}

/* ── Live throughput counter ── */
function useThroughput() {
  const [tps, setTps] = useState(0)
  const eventsIngested = useDashboardStore((s) => s.orchestrator?.events_ingested ?? 0)
  const previous = useRef({ count: eventsIngested, time: 0 })

  useEffect(() => {
    const now = Date.now()
    if (previous.current.time === 0) {
      previous.current = { count: eventsIngested, time: now }
      return
    }
    const elapsed = (now - previous.current.time) / 1000
    if (elapsed > 0.5) {
      const delta = eventsIngested - previous.current.count
      setTps(Math.round(delta / elapsed))
      previous.current = { count: eventsIngested, time: now }
    }
  }, [eventsIngested])

  return tps
}

/* ── Compact horizontal KPI strip shown above the graph ── */
function StatStrip() {
  const sseOrch = useDashboardStore((s) => s.orchestrator)
  const sseHw   = useDashboardStore((s) => s.hardware)
  const graphMetrics = useDashboardStore((s) => s.graphMetrics)
  const graphSize = useDashboardStore((s) => s.graphSize)
  const graphSummary = useDashboardStore((s) => s.graphSummary)
  const { data: snap } = useSnapshot()
  const tps = useThroughput()
  const t = useT()

  const orch = sseOrch ?? snap?.orchestrator ?? null
  const hw = sseHw ?? snap?.hardware ?? null
  const graphSz = graphSize ?? snap?.graph?.graph ?? null
  const pendingFromSnapshot = snap?.circuit_breaker?.pending_alerts
  const pendingAlerts = typeof pendingFromSnapshot === 'number' ? pendingFromSnapshot : 0

  const gpuUtil = hw?.gpu_utilization_pct ?? 0

  const stats: StatDef[] = [
    {
      label: t('transactions'),
      value: fmtNum(orch?.events_ingested ?? 0),
      accent: 'text-accent-primary',
      iconAccent: 'text-accent-primary/70',
      Icon: ArrowRightLeft,
    },
    {
      label: t('throughput'),
      value: `${tps}/s`,
      accent: tps > 0 ? 'text-green-400' : 'text-text-muted',
      iconAccent: tps > 0 ? 'text-green-500/70' : 'text-text-muted/50',
      Icon: Activity,
      pulse: tps > 0,
    },
    {
      label: t('ml_inferences'),
      value: fmtNum(orch?.ml_inferences ?? 0),
      accent: 'text-violet-400',
      iconAccent: 'text-violet-500/70',
      Icon: Brain,
    },
    {
      label: t('alerts'),
      value: fmtNum(orch?.alerts_routed ?? 0),
      accent: 'text-amber-400',
      iconAccent: 'text-amber-500/70',
      Icon: Bell,
    },
    {
      label: t('nodes'),
      value: fmtNum(graphSz?.nodes ?? 0),
      accent: 'text-blue-400',
      iconAccent: 'text-blue-500/70',
      Icon: CircleDot,
    },
    {
      label: t('edges'),
      value: fmtNum(graphSz?.edges ?? 0),
      accent: 'text-blue-300',
      iconAccent: 'text-blue-400/70',
      Icon: GitBranch,
    },
    {
      label: t('mule_nets'),
      value: fmtNum(graphMetrics?.mule_detections ?? 0),
      accent: (graphMetrics?.mule_detections ?? 0) > 0 ? 'text-rose-400' : 'text-text-muted',
      iconAccent: (graphMetrics?.mule_detections ?? 0) > 0 ? 'text-rose-500/70' : 'text-text-muted/50',
      Icon: AlertTriangle,
      pulse: (graphMetrics?.mule_detections ?? 0) > 0,
    },
    {
      label: t('frozen'),
      value: fmtNum(pendingAlerts),
      accent: pendingAlerts > 0 ? 'text-red-400' : 'text-text-muted',
      iconAccent: pendingAlerts > 0 ? 'text-red-500/70' : 'text-text-muted/50',
      Icon: Shield,
    },
    {
      label: t('fraud_ratio'),
      value: graphSummary.edgeCount === 0 ? '0%' : `${((graphSummary.fraudEdges / graphSummary.edgeCount) * 100).toFixed(1)}%`,
      accent: 'text-rose-400',
      iconAccent: 'text-rose-500/70',
      Icon: TrendingUp,
    },
    {
      label: t('suspicious'),
      value: fmtNum(graphSummary.suspiciousNodes),
      accent: 'text-yellow-400',
      iconAccent: 'text-yellow-500/70',
      Icon: Eye,
    },
    {
      label: 'GPU',
      value: `${gpuUtil}%`,
      accent: gpuUtil > 85 ? 'text-red-400' : gpuUtil > 60 ? 'text-amber-400' : 'text-green-400',
      iconAccent: gpuUtil > 85 ? 'text-red-500/70' : gpuUtil > 60 ? 'text-amber-500/70' : 'text-green-500/70',
      Icon: Gauge,
    },
    {
      label: 'VRAM',
      value: `${((hw?.gpu_vram_used_mb ?? 0) / 1024).toFixed(1)}G`,
      accent: 'text-green-300',
      iconAccent: 'text-green-400/70',
      Icon: Thermometer,
    },
  ]

  return (
    <div className="flex items-stretch border-b border-border-subtle bg-bg-surface/80 backdrop-blur-sm shrink-0 overflow-x-auto animate-fade-in">
      {stats.map(({ label, value, accent, iconAccent, Icon, pulse }) => (
        <div
          key={label}
          className="group flex items-center gap-2 px-3 py-1.5 border-r border-border-subtle last:border-r-0 shrink-0 card-hover cursor-default"
        >
          <div className={cn(
            'flex items-center justify-center w-6 h-6 rounded-md bg-bg-elevated/60 border border-border-subtle group-hover:border-border-default transition-colors',
            pulse && 'animate-data-pulse',
          )}>
            <Icon className={cn('w-3 h-3', iconAccent)} strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-start">
            <span className={cn('text-[13px] font-mono font-semibold tabular-nums leading-tight', accent)}>
              {value}
            </span>
            <span className="text-[8px] uppercase tracking-[0.12em] text-text-muted">
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function CommandRail() {
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const setActiveCaseId = useUIStore((s) => s.setActiveCaseId)
  const refreshIntel = useRefreshIntel()
  const simulateIntel = useSimulateIntelSignal()
  const launchPS3 = useLaunchPS3Scenario()
  const evidence = useCreateEvidencePackage()
  const { data: readiness } = usePS3Readiness()
  const [caseId, setCaseId] = useState<string | null>(null)
  const [statusKey, setStatusKey] = useState<'continuous_stream' | 'refreshing_intel' | 'playbooks_refreshed' | 'launching_ps3' | 'case_opened' | 'generating_fiu' | 'evidence_ready'>('continuous_stream')
  const [statusSuffix, setStatusSuffix] = useState('')
  const t = useT()

  const readyCount = useMemo(
    () => readiness?.requirements.filter((item) => item.status === 'ready').length ?? 0,
    [readiness],
  )

  async function primeIntel() {
    setStatusKey('refreshing_intel'); setStatusSuffix('')
    await refreshIntel.mutateAsync(undefined)
    await simulateIntel.mutateAsync('digital_arrest_mule')
    setStatusKey('playbooks_refreshed')
  }

  async function launchCase(scenario: PS3ScenarioId = 'rapid_layering') {
    setStatusKey('launching_ps3'); setStatusSuffix('')
    const response = await launchPS3.mutateAsync({ scenario, intensity: 'demo', seed: Date.now() % 100000 })
    setActiveCaseId(response.primary_case_id)
    setCaseId(response.primary_case_id)
    setStatusKey('case_opened'); setStatusSuffix(` ${response.primary_case_id}`)
    setActiveTab('investigations')
  }

  async function packageEvidence() {
    if (!caseId) {
      await launchCase('round_tripping')
      return
    }
    setStatusKey('generating_fiu'); setStatusSuffix('')
    await evidence.mutateAsync(caseId)
    setStatusKey('evidence_ready'); setStatusSuffix(` ${caseId}`)
    setActiveTab('investigations')
  }

  const busy = refreshIntel.isPending || simulateIntel.isPending || launchPS3.isPending || evidence.isPending
  const statusText = `${t(statusKey)}${statusSuffix}`

  return (
    <section className="shrink-0 border-b border-border-default bg-bg-surface px-4 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 min-w-48">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-primary">
            {t('ps3_command_rail')}
          </div>
          <div className="font-mono text-[9px] text-text-muted">
            {t('ps3_tagline')} | {readyCount}/5 {t('ready')} | {statusText}
          </div>
        </div>
        <CommandButton
          icon={Sparkles}
          label={t('prime_intel')}
          busy={busy}
          onClick={() => void primeIntel()}
        />
        <CommandButton
          icon={Play}
          label={t('launch_case')}
          busy={busy}
          onClick={() => void launchCase('rapid_layering')}
        />
        <CommandButton
          icon={FileText}
          label={t('fiu_package')}
          busy={busy}
          onClick={() => void packageEvidence()}
        />
        <CommandButton
          icon={Radar}
          label={t('intel_radar')}
          onClick={() => setActiveTab('pre-fraud-intel')}
        />
      </div>
    </section>
  )
}

function CommandButton({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: LucideIcon
  label: string
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-text-secondary shadow-sm transition-colors hover:border-accent-primary hover:bg-accent-primary/10 hover:text-accent-primary disabled:cursor-wait disabled:opacity-60"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

export function OverviewPage() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId)

  return (
    <div className="flex flex-col h-full">
      <StatStrip />
      <PreFraudIntelBrief variant="overview" />
      <CommandRail />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 h-full bg-bg-deep">
          <SigmaGraph />
        </div>
        {selectedNodeId && <NodeDetailPanel />}
        <RightSidebar />
      </div>
    </div>
  )
}
