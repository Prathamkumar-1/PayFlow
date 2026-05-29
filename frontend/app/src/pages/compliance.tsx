// ============================================================================
// Compliance & Regulatory Intelligence Page
// Fraud Intelligence Layer: Rule Engine, STR/CTR/FMR, CFR-RBI, AML Stages,
// FIU-IND, Investigation Management, Mule Detection, Victim Fund Tracing
// ============================================================================

import { useState, useCallback } from 'react'
import { useT } from '@/lib/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Shield, ShieldCheck, ShieldAlert, FileCheck, Scale, AlertTriangle,
  Landmark, Search, Eye, Layers, GitBranch, Users, Fingerprint,
  Activity, ToggleLeft, ToggleRight, Gavel, FileText,
  Network, Banknote, UserX, Route, Brain, Radio,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchRules, fetchRuleStats, toggleRule,
  fetchGateStats, fetchReports, fetchCFRStats,
  fetchAMLStats, fetchFIUStats, fetchFIUHighRisk,
  fetchInvestigationStats, fetchMuleChains, fetchMuleStats,
  fetchSuspectedMules, fetchVictimStats, fetchAnomalyStats,
  fetchClusters, fetchIntermediaries,
} from '@/lib/api-client'
import type {
  RuleInfo, GateStatsResponse,
  FIUStatsResponse, InvestigationStatsResponse,
} from '@/lib/types'

// ============================================================================
// Constants
// ============================================================================

const REFETCH_INTERVAL = 8_000

const ACCENT = {
  emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  cyan: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  rose: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  violet: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  pink: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
  indigo: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  teal: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
}

// ============================================================================
// Metric Card
// ============================================================================

function MetricCard({ icon: Icon, label, value, accent, pulse, sub }: {
  icon: typeof Activity
  label: string
  value: string | number
  accent: string
  pulse?: boolean
  sub?: string
}) {
  return (
    <div className={cn(
      'relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg border backdrop-blur-sm',
      'bg-bg-surface/70 border-border-subtle/40 hover:border-border-subtle/70',
      'transition-all duration-300 group min-w-0',
    )}>
      <div className={cn(
        'flex items-center justify-center w-8 h-8 rounded-md border shrink-0',
        accent,
      )}>
        <Icon className={cn('w-4 h-4', pulse && 'animate-pulse')} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-text-muted truncate uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-text-primary tabular-nums">{value}</p>
        {sub && <p className="text-[9px] text-text-muted/70 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ============================================================================
// Panel Shell
// ============================================================================

function Panel({ title, icon: Icon, accent, children, className }: {
  title: string
  icon: typeof Activity
  accent: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      'flex flex-col rounded-lg border backdrop-blur-sm overflow-hidden',
      'bg-bg-surface/60 border-border-subtle/40',
      className,
    )}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-subtle/30 bg-bg-elevated/30 shrink-0">
        <div className={cn(
          'flex items-center justify-center w-6 h-6 rounded-md border',
          accent,
        )}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-semibold text-text-primary tracking-wide">{title}</h3>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar p-3">
        {children}
      </div>
    </div>
  )
}

// ============================================================================
// Rule Engine Panel
// ============================================================================

function RuleEnginePanel() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: rulesData } = useQuery({
    queryKey: ['fraud', 'rules'],
    queryFn: fetchRules,
    refetchInterval: REFETCH_INTERVAL,
  })
  const { data: ruleStats } = useQuery({
    queryKey: ['fraud', 'rules', 'stats'],
    queryFn: fetchRuleStats,
    refetchInterval: REFETCH_INTERVAL,
  })

  const [toggling, setToggling] = useState<string | null>(null)

  const handleToggle = useCallback(async (rule: RuleInfo) => {
    setToggling(rule.rule_id)
    try {
      await toggleRule(rule.rule_id, !rule.enabled)
      queryClient.invalidateQueries({ queryKey: ['fraud', 'rules'] })
    } finally {
      setToggling(null)
    }
  }, [queryClient])

  const rules = rulesData?.rules ?? []

  return (
    <Panel title={t('rule_engine')} icon={Scale} accent={ACCENT.emerald}>
      {/* Stats strip */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('evaluations')}</p>
          <p className="text-xs font-bold text-emerald-400 tabular-nums">{ruleStats?.total_evaluations ?? 0}</p>
        </div>
        <div className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('rules_active')}</p>
          <p className="text-xs font-bold text-cyan-400 tabular-nums">{rules.filter(r => r.enabled).length}/{rules.length}</p>
        </div>
        <div className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('avg_eval')}</p>
          <p className="text-xs font-bold text-violet-400 tabular-nums">{(ruleStats?.last_evaluation_ms ?? 0).toFixed(1)}ms</p>
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-1.5">
        {rules.map(rule => (
          <div
            key={rule.rule_id}
            className={cn(
              'flex items-center gap-2 px-2.5 py-2 rounded-md border transition-all duration-200',
              rule.enabled
                ? 'bg-emerald-400/5 border-emerald-400/15 hover:border-emerald-400/30'
                : 'bg-bg-elevated/30 border-border-subtle/20 opacity-60 hover:opacity-80',
            )}
          >
            <button
              onClick={() => handleToggle(rule)}
              disabled={toggling === rule.rule_id}
              className="shrink-0 transition-transform active:scale-90"
            >
              {rule.enabled
                ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                : <ToggleLeft className="w-5 h-5 text-text-muted" />
              }
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-text-primary truncate">{rule.name}</p>
              <p className="text-[9px] text-text-muted truncate">{rule.description}</p>
            </div>
            <span className={cn(
              'shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border',
              rule.category === 'velocity' ? ACCENT.amber :
              rule.category === 'amount' ? ACCENT.rose :
              rule.category === 'pattern' ? ACCENT.violet :
              ACCENT.cyan,
            )}>
              {rule.category}
            </span>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-[10px] text-text-muted text-center py-4">{t('no_rules')}</p>
        )}
      </div>
    </Panel>
  )
}

// ============================================================================
// Regulatory Reports Panel
// ============================================================================

function RegulatoryReportsPanel() {
  const t = useT()
  const { data: reportsData } = useQuery({
    queryKey: ['fraud', 'reports'],
    queryFn: () => fetchReports(undefined, 30),
    refetchInterval: REFETCH_INTERVAL,
  })

  const reports = reportsData?.reports ?? []

  const typeIcon = (rtype: string) => {
    if (rtype === 'STR') return <AlertTriangle className="w-3 h-3 text-rose-400" />
    if (rtype === 'CTR') return <Banknote className="w-3 h-3 text-amber-400" />
    if (rtype === 'FMR') return <FileText className="w-3 h-3 text-cyan-400" />
    return <FileCheck className="w-3 h-3 text-text-muted" />
  }

  const statusColor = (s: string) => {
    if (s === 'filed') return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
    if (s === 'pending') return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    return 'text-rose-400 bg-rose-400/10 border-rose-400/20'
  }

  return (
    <Panel title={t('regulatory_filings')} icon={FileCheck} accent={ACCENT.amber}>
      {/* Summary counts */}
      <div className="flex gap-2 mb-3">
        {(['STR', 'CTR', 'FMR'] as const).map(type => {
          const count = reports.filter(r => r.report_type === type).length
          return (
            <div key={type} className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2.5 py-1.5 text-center">
              <p className="text-[9px] text-text-muted uppercase tracking-wider">{type}</p>
              <p className={cn('text-xs font-bold tabular-nums',
                type === 'STR' ? 'text-rose-400' : type === 'CTR' ? 'text-amber-400' : 'text-cyan-400'
              )}>{count}</p>
            </div>
          )
        })}
      </div>

      <div className="space-y-1">
        {reports.slice(0, 20).map(report => (
          <div
            key={report.report_id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-elevated/20 border border-border-subtle/15 hover:border-border-subtle/30 transition-all"
          >
            {typeIcon(report.report_type)}
            <span className="text-[10px] font-mono text-text-secondary min-w-[32px]">{report.report_type}</span>
            <span className="text-[10px] text-text-muted flex-1 truncate font-mono">{report.report_id.slice(0, 12)}</span>
            <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded border', statusColor(report.status))}>
              {report.status}
            </span>
          </div>
        ))}
        {reports.length === 0 && (
          <p className="text-[10px] text-text-muted text-center py-4">{t('no_filings')}</p>
        )}
      </div>
    </Panel>
  )
}

// ============================================================================
// AML Stage Detection Panel
// ============================================================================

function AMLStagePanel() {
  const t = useT()
  const { data: amlStats } = useQuery({
    queryKey: ['fraud', 'aml', 'stats'],
    queryFn: fetchAMLStats,
    refetchInterval: REFETCH_INTERVAL,
  })

  const stages = [
    {
      nameKey: 'placement' as const,
      descKey: 'placement_desc' as const,
      icon: Layers,
      color: 'text-rose-400',
      bg: 'bg-rose-400/10 border-rose-400/20',
      evals: amlStats?.placement?.total_evaluations ?? 0,
      alerts: amlStats?.placement?.alerts_raised ?? 0,
    },
    {
      nameKey: 'layering' as const,
      descKey: 'layering_desc' as const,
      icon: GitBranch,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10 border-amber-400/20',
      evals: 0,
      alerts: 0,
    },
    {
      nameKey: 'integration_stage' as const,
      descKey: 'integration_desc' as const,
      icon: Network,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10 border-violet-400/20',
      evals: amlStats?.integration?.total_evaluations ?? 0,
      alerts: amlStats?.integration?.alerts_raised ?? 0,
    },
  ]

  return (
    <Panel title={t('aml_stage_detection')} icon={Layers} accent={ACCENT.rose}>
      <div className="space-y-2">
        {stages.map(stage => {
          const alertRate = stage.evals > 0 ? ((stage.alerts / stage.evals) * 100).toFixed(1) : '0.0'
          return (
            <div key={stage.nameKey} className={cn(
              'rounded-md border px-3 py-2.5 transition-all',
              stage.bg,
            )}>
              <div className="flex items-center gap-2 mb-1.5">
                <stage.icon className={cn('w-4 h-4', stage.color)} />
                <span className="text-[11px] font-semibold text-text-primary">{t(stage.nameKey)}</span>
                {stage.alerts > 0 && (
                  <span className="ml-auto flex items-center gap-1 text-[9px] text-rose-400 font-bold">
                    <Radio className="w-3 h-3 animate-pulse" /> {stage.alerts} {t('alerts')}
                  </span>
                )}
              </div>
              <p className="text-[9px] text-text-muted mb-1.5">{t(stage.descKey)}</p>
              <div className="flex gap-3 text-[9px]">
                <span className="text-text-muted">{t('evaluations')}: <span className="text-text-secondary font-medium">{stage.evals}</span></span>
                <span className="text-text-muted">{t('alert_rate')} <span className={cn('font-medium', parseFloat(alertRate) > 10 ? 'text-rose-400' : 'text-emerald-400')}>{alertRate}%</span></span>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ============================================================================
// CFR-RBI Registry Panel
// ============================================================================

function CFRRegistryPanel() {
  const t = useT()
  const { data: cfrStats } = useQuery({
    queryKey: ['fraud', 'cfr', 'stats'],
    queryFn: fetchCFRStats,
    refetchInterval: REFETCH_INTERVAL,
  })

  const registry = cfrStats?.registry
  const categories = registry?.categories ?? {}

  return (
    <Panel title={t('cfr_registry')} icon={Landmark} accent={ACCENT.indigo}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('records')}</p>
          <p className="text-xs font-bold text-indigo-400 tabular-nums">{registry?.total_records ?? 0}</p>
        </div>
        <div className="rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('accounts')}</p>
          <p className="text-xs font-bold text-cyan-400 tabular-nums">{registry?.unique_accounts ?? 0}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {Object.entries(categories).length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">{t('fraud_categories')}</p>
          {Object.entries(categories).map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg-elevated/30 border border-border-subtle/15">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
              <span className="text-[10px] text-text-secondary flex-1 truncate capitalize">{cat.replace(/_/g, ' ')}</span>
              <span className="text-[10px] font-mono font-bold text-text-primary tabular-nums">{count as number}</span>
            </div>
          ))}
        </div>
      )}
      {Object.entries(categories).length === 0 && (
        <p className="text-[10px] text-text-muted text-center py-3">{t('registry_empty')}</p>
      )}
    </Panel>
  )
}

// ============================================================================
// FIU Intelligence Panel
// ============================================================================

function FIUIntelligencePanel() {
  const t = useT()
  const { data: fiuStats } = useQuery({
    queryKey: ['fraud', 'fiu', 'stats'],
    queryFn: fetchFIUStats,
    refetchInterval: REFETCH_INTERVAL,
  })
  const { data: highRisk } = useQuery({
    queryKey: ['fraud', 'fiu', 'high-risk'],
    queryFn: fetchFIUHighRisk,
    refetchInterval: REFETCH_INTERVAL,
  })

  const stats = fiuStats ?? {} as FIUStatsResponse

  return (
    <Panel title={t('fiu_ind')} icon={Eye} accent={ACCENT.teal}>
      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[
          { label: t('str_collected'), val: stats.str_collected ?? 0, color: 'text-rose-400' },
          { label: t('alerts'), val: stats.alerts_collected ?? 0, color: 'text-amber-400' },
          { label: t('packages'), val: stats.packages_prepared ?? 0, color: 'text-cyan-400' },
          { label: t('disseminated'), val: stats.packages_disseminated ?? 0, color: 'text-emerald-400' },
          { label: t('high_risk_word'), val: stats.high_risk_accounts ?? 0, color: 'text-rose-400' },
          { label: t('total_entries'), val: stats.total_entries ?? 0, color: 'text-violet-400' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-1.5 py-1.5 text-center">
            <p className="text-[8px] text-text-muted uppercase tracking-wider leading-tight">{kpi.label}</p>
            <p className={cn('text-xs font-bold tabular-nums', kpi.color)}>{kpi.val}</p>
          </div>
        ))}
      </div>

      {/* High-Risk accounts */}
      {(highRisk?.count ?? 0) > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-rose-400" /> {t('high_risk_accounts')}
          </p>
          <div className="space-y-1 max-h-[140px] overflow-auto custom-scrollbar">
            {highRisk!.high_risk_accounts.map(acc => (
              <div key={acc} className="flex items-center gap-2 px-2 py-1 rounded bg-rose-400/5 border border-rose-400/10">
                <Fingerprint className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="text-[10px] font-mono text-rose-300 truncate">{acc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ============================================================================
// Investigation Management Panel
// ============================================================================

function InvestigationPanel() {
  const t = useT()
  const { data: invStats } = useQuery({
    queryKey: ['fraud', 'investigation', 'stats'],
    queryFn: fetchInvestigationStats,
    refetchInterval: REFETCH_INTERVAL,
  })

  const stats = invStats ?? {} as InvestigationStatsResponse

  const stages = [
    { label: t('open_cases'), val: stats.open_cases ?? 0, icon: Search, color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/15' },
    { label: t('referred_lea'), val: stats.referred_cases ?? 0, icon: Gavel, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/15' },
    { label: t('legal_proceedings'), val: stats.legal_proceedings ?? 0, icon: Scale, color: 'text-rose-400', bg: 'bg-rose-400/10 border-rose-400/15' },
  ]

  return (
    <Panel title={t('investigation_mgmt')} icon={Gavel} accent={ACCENT.orange}>
      <div className="rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-3 py-2 mb-3 text-center">
        <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('total_cases')}</p>
        <p className="text-lg font-bold text-orange-400 tabular-nums">{stats.total_cases ?? 0}</p>
      </div>

      <div className="space-y-2">
        {stages.map(stage => (
          <div key={stage.label} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-md border', stage.bg)}>
            <stage.icon className={cn('w-4 h-4 shrink-0', stage.color)} />
            <span className="text-[10px] text-text-secondary flex-1">{stage.label}</span>
            <span className={cn('text-sm font-bold tabular-nums', stage.color)}>{stage.val}</span>
          </div>
        ))}
      </div>

      {(stats.total_fraud_amount_paisa ?? 0) > 0 && (
        <div className="mt-3 rounded-md bg-rose-400/5 border border-rose-400/10 px-3 py-2 text-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('total_fraud_amount')}</p>
          <p className="text-sm font-bold text-rose-400 tabular-nums">
            ₹{((stats.total_fraud_amount_paisa ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
      )}
    </Panel>
  )
}

// ============================================================================
// Mule Detection Panel
// ============================================================================

function MuleDetectionPanel() {
  const t = useT()
  const { data: muleStats } = useQuery({
    queryKey: ['fraud', 'mule', 'stats'],
    queryFn: fetchMuleStats,
    refetchInterval: REFETCH_INTERVAL,
  })
  const { data: chainsData } = useQuery({
    queryKey: ['fraud', 'mule', 'chains'],
    queryFn: fetchMuleChains,
    refetchInterval: REFETCH_INTERVAL,
  })
  const { data: suspectedData } = useQuery({
    queryKey: ['fraud', 'mule', 'suspected'],
    queryFn: () => fetchSuspectedMules(0.5),
    refetchInterval: REFETCH_INTERVAL,
  })

  const chains = chainsData?.chains ?? []
  const mules = suspectedData?.mules ?? []
  const chainStats = muleStats?.chain_detector
  const accountStats = muleStats?.account_scorer

  return (
    <Panel title={t('mule_detection')} icon={UserX} accent={ACCENT.pink}>
      {/* KPI strip */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2 py-1.5 text-center">
          <p className="text-[8px] text-text-muted uppercase tracking-wider">{t('chains')}</p>
          <p className="text-xs font-bold text-pink-400 tabular-nums">{chainStats?.total_chains_detected ?? 0}</p>
        </div>
        <div className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2 py-1.5 text-center">
          <p className="text-[8px] text-text-muted uppercase tracking-wider">{t('suspected')}</p>
          <p className="text-xs font-bold text-rose-400 tabular-nums">{accountStats?.suspected_mules ?? 0}</p>
        </div>
        <div className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2 py-1.5 text-center">
          <p className="text-[8px] text-text-muted uppercase tracking-wider">{t('scored')}</p>
          <p className="text-xs font-bold text-violet-400 tabular-nums">{accountStats?.total_scored ?? 0}</p>
        </div>
      </div>

      {/* Detected chains */}
      {chains.length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Route className="w-3 h-3 text-pink-400" /> {t('detected_chains')}
          </p>
          <div className="space-y-1.5 max-h-[120px] overflow-auto custom-scrollbar">
            {chains.slice(0, 8).map((chain, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-pink-400/5 border border-pink-400/10">
                <GitBranch className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-mono text-text-secondary truncate">
                    {chain.origin_node.slice(0, 8)} → {chain.terminal_node.slice(0, 8)}
                  </p>
                  <p className="text-[9px] text-text-muted">
                    {chain.chain_length} hops · ₹{(chain.total_amount_paisa / 100).toLocaleString('en-IN')}
                  </p>
                </div>
                <span className="text-[9px] font-mono text-pink-400/70 shrink-0">{chain.detection_time_ms.toFixed(0)}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suspected mule accounts */}
      {mules.length > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <UserX className="w-3 h-3 text-rose-400" /> {t('suspected_accounts')}
          </p>
          <div className="space-y-1 max-h-[120px] overflow-auto custom-scrollbar">
            {mules.slice(0, 8).map(mule => (
              <div key={mule.account_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-elevated/30 border border-border-subtle/15">
                <Fingerprint className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="text-[10px] font-mono text-text-secondary truncate flex-1">{mule.account_id.slice(0, 12)}</span>
                <div className="flex gap-1 shrink-0">
                  {mule.indicators.newly_opened > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="Newly opened" />}
                  {mule.indicators.high_frequency > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="High frequency" />}
                  {mule.indicators.rapid_forward > 0 && <span className="w-1.5 h-1.5 rounded-full bg-violet-400" title="Rapid forward" />}
                  {mule.indicators.large_cashout > 0 && <span className="w-1.5 h-1.5 rounded-full bg-pink-400" title="Large cashout" />}
                </div>
                <span className={cn(
                  'text-[9px] font-bold tabular-nums shrink-0',
                  mule.mule_score > 0.8 ? 'text-rose-400' : mule.mule_score > 0.6 ? 'text-amber-400' : 'text-emerald-400',
                )}>{(mule.mule_score * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {chains.length === 0 && mules.length === 0 && (
        <p className="text-[10px] text-text-muted text-center py-4">{t('no_mule')}</p>
      )}
    </Panel>
  )
}

// ============================================================================
// Anomaly Detection Panel
// ============================================================================

function AnomalyDetectionPanel() {
  const t = useT()
  const { data: anomalyStats } = useQuery({
    queryKey: ['fraud', 'anomaly', 'stats'],
    queryFn: fetchAnomalyStats,
    refetchInterval: REFETCH_INTERVAL,
  })
  const { data: clustersData } = useQuery({
    queryKey: ['fraud', 'clusters'],
    queryFn: fetchClusters,
    refetchInterval: REFETCH_INTERVAL,
  })

  const iforest = anomalyStats?.isolation_forest
  const autoenc = anomalyStats?.autoencoder
  const clusters = clustersData?.clusters ?? []

  return (
    <Panel title={t('anomaly_detection')} icon={Brain} accent={ACCENT.violet}>
      {/* Model stats */}
      <div className="space-y-1.5 mb-3">
        {[
          { label: t('isolation_forest'), scored: iforest?.total_scored ?? 0, anomalies: iforest?.anomalies_detected ?? 0, color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/15' },
          { label: t('autoencoder'), scored: autoenc?.total_scored ?? 0, anomalies: autoenc?.anomalies_detected ?? 0, color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/15' },
        ].map(model => (
          <div key={model.label} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-md border', model.bg)}>
            <Brain className={cn('w-4 h-4 shrink-0', model.color)} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-text-primary">{model.label}</p>
              <p className="text-[9px] text-text-muted">
                {model.scored} {t('scored')} · <span className={model.anomalies > 0 ? 'text-rose-400 font-medium' : ''}>
                  {model.anomalies} {t('anomalies')}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Suspicious clusters */}
      {clusters.length > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Users className="w-3 h-3 text-violet-400" /> {t('suspicious_communities')}
          </p>
          <div className="space-y-1 max-h-[130px] overflow-auto custom-scrollbar">
            {clusters.slice(0, 8).map(cluster => (
              <div key={cluster.community_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-elevated/30 border border-border-subtle/15">
                <Network className="w-3 h-3 text-violet-400 shrink-0" />
                <span className="text-[10px] text-text-secondary flex-1">
                  Community #{cluster.community_id} · {cluster.node_count} nodes
                </span>
                <span className={cn(
                  'text-[9px] font-bold tabular-nums',
                  cluster.anomaly_score > 0.7 ? 'text-rose-400' : cluster.anomaly_score > 0.4 ? 'text-amber-400' : 'text-emerald-400',
                )}>{(cluster.anomaly_score * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ============================================================================
// Centrality Intermediaries Panel
// ============================================================================

function CentralityPanel() {
  const t = useT()
  const { data: intermediariesData } = useQuery({
    queryKey: ['fraud', 'centrality', 'intermediaries'],
    queryFn: () => fetchIntermediaries(15),
    refetchInterval: REFETCH_INTERVAL,
  })

  const intermediaries = intermediariesData?.intermediaries ?? []

  return (
    <Panel title={t('centrality_analysis')} icon={Network} accent={ACCENT.blue}>
      {intermediaries.length === 0 ? (
        <p className="text-[10px] text-text-muted text-center py-4">{t('no_intermediaries')}</p>
      ) : (
        <div className="space-y-1.5">
          {intermediaries.slice(0, 12).map((node, i) => {
            const barWidth = Math.min(100, node.betweenness_centrality * 100)
            return (
              <div key={node.node_id} className="relative px-2.5 py-2 rounded-md bg-bg-elevated/30 border border-border-subtle/15 overflow-hidden">
                {/* Background bar */}
                <div
                  className="absolute inset-y-0 left-0 bg-blue-400/5 rounded-md"
                  style={{ width: `${barWidth}%` }}
                />
                <div className="relative flex items-center gap-2">
                  <span className="text-[9px] text-text-muted font-mono w-4 shrink-0">#{i + 1}</span>
                  <Fingerprint className="w-3 h-3 text-blue-400 shrink-0" />
                  <span className="text-[10px] font-mono text-text-secondary truncate flex-1">{node.node_id.slice(0, 14)}</span>
                  <div className="flex gap-2 shrink-0 text-[9px] text-text-muted tabular-nums">
                    <span title="Betweenness">BC: <span className="text-blue-400 font-medium">{node.betweenness_centrality.toFixed(3)}</span></span>
                    <span title="PageRank">PR: <span className="text-cyan-400 font-medium">{node.pagerank.toFixed(4)}</span></span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

// ============================================================================
// Victim Fund Tracing Panel
// ============================================================================

function VictimTracingPanel() {
  const t = useT()
  const { data: victimStats } = useQuery({
    queryKey: ['fraud', 'victim', 'stats'],
    queryFn: fetchVictimStats,
    refetchInterval: REFETCH_INTERVAL,
  })

  return (
    <Panel title={t('victim_tracing')} icon={Route} accent={ACCENT.cyan}>
      <div className="flex flex-col items-center justify-center py-6 gap-3">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-cyan-400/10 border border-cyan-400/20">
          <Route className="w-7 h-7 text-cyan-400" />
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-cyan-400 tabular-nums">
            {victimStats?.total_victims_traced ?? 0}
          </p>
          <p className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{t('victims_traced')}</p>
        </div>
        <p className="text-[9px] text-text-muted text-center max-w-[220px] leading-relaxed">
          {t('victim_tracing_desc')}
        </p>
      </div>
    </Panel>
  )
}

// ============================================================================
// Pre-Approval Gate Panel
// ============================================================================

function GatePanel() {
  const t = useT()
  const { data: gateStats } = useQuery({
    queryKey: ['fraud', 'gate', 'stats'],
    queryFn: fetchGateStats,
    refetchInterval: REFETCH_INTERVAL,
  })

  const stats = gateStats ?? {} as GateStatsResponse
  const total = stats.total_evaluations ?? 0

  const segments = [
    { label: t('approved'), count: stats.approved ?? 0, color: 'bg-emerald-400', text: 'text-emerald-400' },
    { label: t('held'), count: stats.held ?? 0, color: 'bg-amber-400', text: 'text-amber-400' },
    { label: t('blocked'), count: stats.blocked ?? 0, color: 'bg-rose-400', text: 'text-rose-400' },
  ]

  return (
    <Panel title={t('pre_approval_gate')} icon={Shield} accent={ACCENT.emerald}>
      {/* Total evaluations */}
      <div className="text-center mb-3">
        <p className="text-2xl font-bold text-text-primary tabular-nums">{total}</p>
        <p className="text-[9px] text-text-muted uppercase tracking-wider">{t('transactions_evaluated')}</p>
      </div>

      {/* Proportion bar */}
      {total > 0 && (
        <div className="flex h-2.5 rounded-full overflow-hidden mb-3 bg-bg-elevated/50">
          {segments.map(seg => {
            const pct = (seg.count / total) * 100
            return pct > 0 ? (
              <div key={seg.label} className={cn('h-full transition-all', seg.color)} style={{ width: `${pct}%` }} />
            ) : null
          })}
        </div>
      )}

      {/* Breakdown */}
      <div className="flex gap-2">
        {segments.map(seg => (
          <div key={seg.label} className="flex-1 rounded-md bg-bg-elevated/50 border border-border-subtle/25 px-2 py-1.5 text-center">
            <p className="text-[8px] text-text-muted uppercase tracking-wider">{seg.label}</p>
            <p className={cn('text-sm font-bold tabular-nums', seg.text)}>{seg.count}</p>
          </div>
        ))}
      </div>

      {(stats.avg_evaluation_ms ?? 0) > 0 && (
        <div className="mt-2 text-center">
          <p className="text-[9px] text-text-muted">
            {t('avg_evaluation')} <span className="text-emerald-400 font-medium">{(stats.avg_evaluation_ms ?? 0).toFixed(1)}ms</span>
          </p>
        </div>
      )}
    </Panel>
  )
}

// ============================================================================
// Main Compliance Page
// ============================================================================

export function CompliancePage() {
  const t = useT()
  // Aggregate stats for the hero metrics strip
  const { data: gateStats } = useQuery({ queryKey: ['fraud', 'gate', 'stats'], queryFn: fetchGateStats, refetchInterval: REFETCH_INTERVAL })
  const { data: ruleStats } = useQuery({ queryKey: ['fraud', 'rules', 'stats'], queryFn: fetchRuleStats, refetchInterval: REFETCH_INTERVAL })
  const { data: cfrStats } = useQuery({ queryKey: ['fraud', 'cfr', 'stats'], queryFn: fetchCFRStats, refetchInterval: REFETCH_INTERVAL })
  const { data: amlStats } = useQuery({ queryKey: ['fraud', 'aml', 'stats'], queryFn: fetchAMLStats, refetchInterval: REFETCH_INTERVAL })
  const { data: fiuStats } = useQuery({ queryKey: ['fraud', 'fiu', 'stats'], queryFn: fetchFIUStats, refetchInterval: REFETCH_INTERVAL })
  const { data: invStats } = useQuery({ queryKey: ['fraud', 'investigation', 'stats'], queryFn: fetchInvestigationStats, refetchInterval: REFETCH_INTERVAL })
  const { data: muleStats } = useQuery({ queryKey: ['fraud', 'mule', 'stats'], queryFn: fetchMuleStats, refetchInterval: REFETCH_INTERVAL })
  const { data: victimStats } = useQuery({ queryKey: ['fraud', 'victim', 'stats'], queryFn: fetchVictimStats, refetchInterval: REFETCH_INTERVAL })

  return (
    <div className="flex flex-col h-full">
      {/* ---- Page header ---- */}
      <div className="shrink-0 px-5 pt-5 pb-3 animate-fade-in">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-400/10 border border-emerald-400/20">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-text-primary tracking-wide flex items-center gap-2">
              {t('compliance_title')}
              <Landmark className="w-4 h-4 text-indigo-400/80" />
            </h1>
            <p className="text-[10px] text-text-muted leading-relaxed mt-0.5">
              {t('compliance_subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* ---- Metrics Strip ---- */}
      <div className="shrink-0 px-5 pb-3 animate-fade-in" style={{ animationDelay: '30ms' }}>
        <div className="grid grid-cols-4 xl:grid-cols-8 gap-2">
          <MetricCard icon={Shield} label={t('gate_evals')} value={gateStats?.total_evaluations ?? 0} accent={ACCENT.emerald} sub={`${gateStats?.blocked ?? 0} ${t('blocked')}`} />
          <MetricCard icon={Scale} label={t('rule_evals')} value={ruleStats?.total_evaluations ?? 0} accent={ACCENT.cyan} />
          <MetricCard icon={Landmark} label={t('cfr_records')} value={cfrStats?.registry?.total_records ?? 0} accent={ACCENT.indigo} />
          <MetricCard icon={Layers} label={t('aml_alerts')} value={(amlStats?.placement?.alerts_raised ?? 0) + (amlStats?.integration?.alerts_raised ?? 0)} accent={ACCENT.rose} pulse={(amlStats?.placement?.alerts_raised ?? 0) > 0} />
          <MetricCard icon={Eye} label={t('fiu_strs')} value={fiuStats?.str_collected ?? 0} accent={ACCENT.teal} sub={`${fiuStats?.packages_prepared ?? 0} ${t('packages')}`} />
          <MetricCard icon={Gavel} label={t('cases')} value={invStats?.total_cases ?? 0} accent={ACCENT.orange} sub={`${invStats?.open_cases ?? 0} ${t('open_word')}`} />
          <MetricCard icon={UserX} label={t('mule_chains')} value={muleStats?.chain_detector?.total_chains_detected ?? 0} accent={ACCENT.pink} />
          <MetricCard icon={Route} label={t('victims_traced')} value={victimStats?.total_victims_traced ?? 0} accent={ACCENT.cyan} />
        </div>
      </div>

      {/* ---- Content Grid ---- */}
      <div className="flex-1 overflow-auto custom-scrollbar px-5 pb-5 space-y-3">
        {/* Row 1: Gate + Rule Engine + Regulatory Reports */}
        <div className="flex gap-3 animate-fade-in" style={{ animationDelay: '60ms' }}>
          <div className="w-[280px] shrink-0">
            <GatePanel />
          </div>
          <div className="flex-1 min-w-0">
            <RuleEnginePanel />
          </div>
          <div className="w-[320px] shrink-0">
            <RegulatoryReportsPanel />
          </div>
        </div>

        {/* Row 2: AML Stages + CFR-RBI + FIU Intelligence */}
        <div className="flex gap-3 animate-fade-in" style={{ animationDelay: '120ms' }}>
          <div className="flex-1 min-w-0">
            <AMLStagePanel />
          </div>
          <div className="flex-1 min-w-0">
            <CFRRegistryPanel />
          </div>
          <div className="flex-1 min-w-0">
            <FIUIntelligencePanel />
          </div>
        </div>

        {/* Row 3: Investigation + Mule Detection + Anomaly + Centrality */}
        <div className="flex gap-3 animate-fade-in" style={{ animationDelay: '180ms' }}>
          <div className="w-[260px] shrink-0">
            <InvestigationPanel />
          </div>
          <div className="flex-1 min-w-0">
            <MuleDetectionPanel />
          </div>
          <div className="flex-1 min-w-0">
            <AnomalyDetectionPanel />
          </div>
        </div>

        {/* Row 4: Centrality + Victim Tracing */}
        <div className="flex gap-3 animate-fade-in" style={{ animationDelay: '240ms' }}>
          <div className="flex-[2] min-w-0">
            <CentralityPanel />
          </div>
          <div className="w-[280px] shrink-0">
            <VictimTracingPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
