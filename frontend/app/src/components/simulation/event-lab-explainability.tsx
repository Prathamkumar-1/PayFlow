// ============================================================================
// EventLab Live Fraud Response Feed
// ---------------------------------------------------------------------------
// Replaces the old opaque "Backend Visibility" panel with a crystal-clear
// real-time narrative of exactly HOW each layer of PayFlow tackles the
// demo fraud — from intel priming → ML scoring → graph analysis →
// circuit-breaker → AI investigation → analyst decision → ledger anchor.
// ============================================================================

import { useMemo, useEffect, useRef } from 'react'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  Circle,
  Clock,
  Database,
  FileText,
  Fingerprint,
  Gavel,
  GitBranch,
  Hourglass,
  Layers,
  Loader2,
  Lock,
  Network,
  Radar,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Siren,
  Sparkles,
  TrendingUp,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApproveCountermeasure, useRejectCountermeasure } from '@/hooks/use-api'
import type {
  CountermeasureProposal,
  EventLabExplainabilityResponse,
  EventLabRunResponse,
} from '@/lib/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fmtAmount(paisa?: number) {
  if (!paisa) return '—'
  const inr = paisa / 100
  if (inr >= 1_00_000) return `₹${(inr / 1_00_000).toFixed(2)}L`
  if (inr >= 1_000) return `₹${(inr / 1_000).toFixed(1)}K`
  return `₹${inr.toFixed(0)}`
}

function short(val?: string, n = 10) {
  if (!val) return '—'
  return val.length > n + 3 ? `${val.slice(0, n)}…` : val
}

function fmtMs(ms?: number) {
  if (ms == null) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Verdict colour ──────────────────────────────────────────────────────────

function verdictColors(d: string | undefined) {
  const v = (d ?? '').toLowerCase()
  if (v.includes('fraud'))    return { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    dot: 'bg-red-500' }
  if (v.includes('suspic'))   return { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-500' }
  if (v.includes('legit'))    return { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  dot: 'bg-green-500' }
  if (v.includes('escalat'))  return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', dot: 'bg-purple-400' }
  return                              { bg: 'bg-bg-elevated/60', border: 'border-border-subtle', text: 'text-text-muted', dot: 'bg-text-muted' }
}

// ─── Stage-to-human mapping ──────────────────────────────────────────────────

const STAGE_META: Record<string, { label: string; icon: typeof Shield; color: string; what: string }> = {
  intel_primed:        { label: 'Intel Primed',            icon: Radar,       color: '#6366f1', what: 'OSINT/SOCMINT playbook loaded — typology seeds and watch-terms injected' },
  events_generated:    { label: 'Events Generated',        icon: Zap,         color: '#8b5cf6', what: 'Correlated Indian banking event chain generated from the template' },
  events_injected:     { label: 'Injected into Pipeline',  icon: Activity,    color: '#06b6d4', what: 'Events entered the live ingestion pipeline — same path as real bank traffic' },
  ingested:            { label: 'Schema & CRC Validated',  icon: Database,    color: '#0ea5e9', what: 'Pydantic validation + CRC32 checksum passed. Amount normalised to paisa.' },
  pipeline_dispatched: { label: 'Pipeline Dispatched',     icon: Workflow,    color: '#0ea5e9', what: 'Batch fanned out to all backend consumers (ML, graph, breaker, agent)' },
  ml_scored:           { label: 'ML Heuristics Scored',    icon: BrainCircuit,color: '#a855f7', what: '36-dim feature vector extracted → XGBoost CUDA classifier produced risk score' },
  graph_investigated:  { label: 'Graph Analysis Done',     icon: Network,     color: '#22c55e', what: 'NetworkX: mule chains (DFS), cycles (Johnson\'s), centrality, Louvain communities' },
  cb_evaluated:        { label: 'Circuit Breaker Voted',   icon: Shield,      color: '#f59e0b', what: 'Weighted consensus: ML(35%) + GNN(35%) + Graph(30%) → freeze/alert decision' },
  llm_started:         { label: 'AI Agent Investigating',  icon: Sparkles,    color: '#f97316', what: 'LangGraph ReAct loop: Qwen 3.5 4B reasoning + tool calls for evidence' },
  qwen_context_loaded: { label: 'AI Context Primed',       icon: Layers,      color: '#f97316', what: 'Qwen loaded the intel playbook context — bounded copilot, not decision engine' },
  analyst_decision:    { label: 'Analyst Decision',        icon: Gavel,       color: '#10b981', what: 'Human analyst approved or rejected the countermeasure proposal' },
  action_executed:     { label: 'Action Executed',         icon: ShieldCheck, color: '#10b981', what: 'Approved countermeasure executed through PayFlow blockchain controls' },
  ledger_anchored:     { label: 'Ledger Anchored',         icon: Lock,        color: '#6366f1', what: 'Evidence + audit hash committed to Ed25519-signed append-only blockchain' },
  evidence_ready:      { label: 'Evidence Ready',          icon: FileText,    color: '#06b6d4', what: 'FIU-ready evidence package prepared for regulatory submission' },
}

function getStageMeta(stage: string) {
  return STAGE_META[stage] ?? {
    label: stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    icon: Circle,
    color: '#64748b',
    what: '',
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionHeading({ icon: Icon, title, sub, color }: {
  icon: typeof Shield; title: string; sub?: string; color: string
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}20`, border: `1px solid ${color}35` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">{title}</div>
        {sub && <div className="text-[9px] text-text-muted mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StatusDot({ done, active }: { done: boolean; active: boolean }) {
  if (done)   return <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
  if (active) return <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
  return <div className="w-2 h-2 rounded-full border border-border-subtle bg-transparent shrink-0" />
}

// ─── Live Stage Timeline ─────────────────────────────────────────────────────

function LiveStageTimeline({ run }: { run: EventLabRunResponse | undefined }) {
  const stages = useMemo(() => run?.stages ?? [], [run?.stages])
  const doneSet = useMemo(() => new Set(stages.map(s => s.stage)), [stages])

  const ORDER = [
    'intel_primed', 'events_generated', 'events_injected',
    'pipeline_dispatched', 'ml_scored', 'graph_investigated',
    'cb_evaluated', 'llm_started', 'analyst_decision',
    'action_executed', 'ledger_anchored',
  ]

  const lastDone = ORDER.reduce((last, key, i) => doneSet.has(key) ? i : last, -1)
  // No LIVE badge if run is already completed/failed
  const isRunning = run && run.status !== 'completed' && run.status !== 'failed'
  const activeKey = isRunning && lastDone < ORDER.length - 1 ? ORDER[lastDone + 1] : null

  // Stages that are NOT done but sit between two done stages — visually confusing
  // if left as faded "waiting". Mark them auto-passed for honest display.
  const autoPassed = useMemo(() => {
    const passed = new Set<string>()
    let foundGapStart = false
    for (let i = 0; i < ORDER.length; i++) {
      if (doneSet.has(ORDER[i])) {
        foundGapStart = true
        continue
      }
      if (foundGapStart) {
        // Check if any later stage is done (gap situation)
        const laterDone = ORDER.slice(i + 1).some(k => doneSet.has(k))
        if (laterDone) passed.add(ORDER[i])
        else break
      }
    }
    return passed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneSet])

  return (
    <div className="space-y-1">
      {ORDER.map((key) => {
        const done = doneSet.has(key)
        const auto = !done && autoPassed.has(key)
        const active = key === activeKey
        const meta = getStageMeta(key)
        const StageIcon = meta.icon
        const stageData = stages.find(s => s.stage === key)

        return (
          <div
            key={key}
            className={cn(
              'flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-300',
              done   && 'bg-green-500/5 border border-green-500/10',
              auto   && 'bg-slate-500/5 border border-slate-500/10 opacity-70',
              active && 'bg-amber-500/8 border border-amber-500/20',
              !done && !auto && !active && 'opacity-35',
            )}
          >
            {/* icon */}
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
              style={
                done   ? { background: `${meta.color}20`, border: `1px solid ${meta.color}40` }
              : active ? { background: `${meta.color}15`, border: `1px solid ${meta.color}35` }
              : auto   ? { background: '#33415510', border: '1px solid #33415530' }
              : { background: 'transparent', border: '1px solid #1e293b' }
              }
            >
              <StageIcon
                className="w-3.5 h-3.5"
                style={{ color: done || active ? meta.color : auto ? '#64748b' : '#1e293b' }}
              />
            </div>

            {/* content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'text-[10px] font-bold',
                  done   ? 'text-text-primary'
                  : active ? 'text-text-primary'
                  : auto   ? 'text-text-muted'
                  : 'text-text-muted/50',
                )}>
                  {meta.label}
                </span>
                {done && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                {active && (
                  <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold uppercase tracking-wider animate-pulse">
                    live
                  </span>
                )}
                {auto && (
                  <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 font-bold uppercase tracking-wider">
                    auto
                  </span>
                )}
              </div>

              {/* Description — always shown for done/active; shown briefly for upcoming */}
              {(done || active) && (
                <p className="text-[8px] text-text-secondary mt-0.5 leading-relaxed">{meta.what}</p>
              )}
              {!done && !active && !auto && meta.what && (
                <p className="text-[7px] text-text-muted/50 mt-0.5 leading-relaxed line-clamp-1">{meta.what}</p>
              )}

              {/* stage-specific data badges */}
              {done && stageData?.meta && Object.keys(stageData.meta).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(stageData.meta)
                    .filter(([k]) => !['linked_intel', 'consumers', 'pipeline', 'error'].includes(k))
                    .slice(0, 5)
                    .map(([k, v]) => (
                      <span key={k} className="font-mono text-[7px] px-1.5 py-0.5 rounded" style={{
                        background: `${meta.color}10`, color: meta.color, border: `1px solid ${meta.color}25`,
                      }}>
                        {k.replace(/_/g, ' ')}: {String(v).slice(0, 22)}
                      </span>
                    ))
                  }
                </div>
              )}
            </div>

            {/* time */}
            {stageData?.duration_ms != null && (
              <span className="text-[8px] font-mono text-text-muted shrink-0 mt-1">
                {fmtMs(stageData.duration_ms)}
              </span>
            )}
            {!done && !auto && !active && (
              <span className="text-[7px] font-mono text-text-muted/30 shrink-0 mt-1">upcoming</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Detection Layer Breakdown ───────────────────────────────────────────────

function DetectionLayerBreakdown({ explainability }: {
  explainability: EventLabExplainabilityResponse | undefined
}) {
  const panels = explainability?.evidence_panels ?? []

  const LAYERS = [
    {
      key: 'intel',
      icon: Radar,
      label: 'Pre-Fraud Intel',
      sublabel: 'OSINT/SOCMINT',
      color: '#6366f1',
      roleText: 'Advisory only — primes scenario seeds, watchlists, Qwen context',
    },
    {
      key: 'internal',
      icon: BrainCircuit,
      label: 'Rules + ML + Graph',
      sublabel: 'Internal PayFlow',
      color: '#a855f7',
      roleText: 'Decision evidence — XGBoost, NetworkX, rule engine provide actual scoring',
    },
    {
      key: 'qwen',
      icon: Sparkles,
      label: 'AI Copilot (Qwen 3.5)',
      sublabel: 'Bounded LLM',
      color: '#f97316',
      roleText: 'Explanation only — translates evidence to analyst language, cannot execute',
    },
    {
      key: 'countermeasure',
      icon: Gavel,
      label: 'Analyst Gate',
      sublabel: 'Human approval',
      color: '#10b981',
      roleText: 'Execution authority — only humans can approve holds, freezes, routing pauses',
    },
    {
      key: 'audit',
      icon: Lock,
      label: 'Ledger Audit',
      sublabel: 'Blockchain anchor',
      color: '#6366f1',
      roleText: 'Immutable trail — every decision hashed + Ed25519-signed in append-only ledger',
    },
  ]

  return (
    <div className="space-y-2">
      {LAYERS.map(({ key, icon: Icon, label, sublabel, color, roleText }) => {
        const panel = panels.find(p => p.key === key)
        const statusOk  = panel?.status && !['waiting', 'shadow'].includes(panel.status)
        const statusWait = panel?.status === 'waiting' || !panel

        const metricsEntries = panel ? Object.entries(panel.metrics).slice(0, 3) : []

        return (
          <div
            key={key}
            className={cn(
              'rounded-lg border px-3 py-2.5 transition-all',
              statusOk ? 'border-opacity-30' : 'border-border-subtle/50 opacity-60',
            )}
            style={statusOk ? { borderColor: `${color}30`, background: `${color}05` } : {}}
          >
            <div className="flex items-start gap-2">
              {/* icon pill */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `${color}15`, border: `1px solid ${color}30` }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-text-primary">{label}</span>
                  <span
                    className="text-[7px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                    style={{ color, background: `${color}15`, border: `1px solid ${color}25` }}
                  >
                    {sublabel}
                  </span>
                  {statusOk && (
                    <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-bold uppercase tracking-wider">
                      {panel?.status ?? 'active'}
                    </span>
                  )}
                  {statusWait && (
                    <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border-subtle font-bold uppercase tracking-wider">
                      waiting
                    </span>
                  )}
                </div>

                <p className="text-[8px] text-text-secondary mt-0.5 leading-relaxed">{roleText}</p>

                {panel?.summary && panel.summary !== roleText && (
                  <p className="text-[8px] text-text-muted mt-1 italic leading-relaxed line-clamp-2">
                    "{panel.summary}"
                  </p>
                )}

                {metricsEntries.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {metricsEntries.map(([k, v]) => (
                      <span key={k} className="font-mono text-[7px] px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-text-secondary">
                        {k.replace(/_/g, ' ')}: <strong>{String(v)}</strong>
                      </span>
                    ))}
                  </div>
                )}

                {panel?.items && panel.items.filter(Boolean).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {panel.items.filter(Boolean).slice(0, 3).map((item, i) => (
                      <span key={i} className="text-[7px] px-1.5 py-0.5 rounded border border-border-subtle/50 text-text-muted bg-bg-elevated/60">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Proposal Status Card ─────────────────────────────────────────────────────

function ProposalStatusCard({
  proposal,
  onApprove,
  onReject,
  busy,
}: {
  proposal: CountermeasureProposal
  onApprove: (id: string) => void
  onReject: (id: string) => void
  busy: boolean
}) {
  const c = verdictColors(
    proposal.status === 'executed' ? 'legitimate'
      : proposal.status === 'rejected' ? 'suspicious'
      : proposal.status === 'failed' ? 'fraudulent'
      : 'escalated',
  )
  // eslint-disable-next-line react-hooks/purity
  const ttl = Math.max(0, Math.round(proposal.expires_at - Date.now() / 1000))
  const executable = proposal.execution_allowed && proposal.status === 'proposed'

  const ACTION_ICON: Record<string, typeof Shield> = {
    HOLD: ShieldAlert, FREEZE_NODE: ShieldX, FREEZE_1HOP: ShieldX,
    BAN_DEVICE: Fingerprint, PAUSE_ROUTING: AlertTriangle,
    WATCHLIST_DELTA: TrendingUp, CREATE_CASE: FileText,
    GENERATE_EVIDENCE: FileText,
  }
  const ActionIcon = ACTION_ICON[proposal.action] ?? Shield

  return (
    <div className={cn('rounded-lg border px-3 py-2.5 flex flex-col gap-3', c.border, c.bg)}>
      <div className="flex items-start gap-2">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5', c.bg, 'border', c.border)}>
          <ActionIcon className={cn('w-3.5 h-3.5', c.text)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-text-primary truncate">{proposal.title}</span>
            <span className={cn(
              'text-[7px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border',
              c.border, c.bg, c.text,
            )}>
              {proposal.status}
            </span>
          </div>

          <p className="text-[8px] text-text-secondary mt-0.5 line-clamp-2">{proposal.reason}</p>

          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[7px] text-text-muted font-mono">
            <span className="flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" />
              {proposal.action}
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {proposal.status === 'proposed' ? `TTL ${ttl}s` : proposal.status}
            </span>
            {proposal.audit_hash && (
              <span className="flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5" />
                {proposal.audit_hash.slice(0, 12)}
              </span>
            )}
            {proposal.rollback_available && (
              <span className="text-green-400">rollback ready</span>
            )}
          </div>

          {proposal.analyst && (
            <div className="mt-1 text-[7px] text-green-400 flex items-center gap-1">
              <BadgeCheck className="w-2.5 h-2.5" />
              {proposal.analyst}: "{proposal.analyst_reason ?? 'approved'}"
            </div>
          )}

          {proposal.execution_result && Object.keys(proposal.execution_result).length > 0 && (
            <div className="mt-1 text-[7px] font-mono text-text-muted">
              Result →&nbsp;
              {Object.entries(proposal.execution_result).slice(0, 2).map(([k, v]) =>
                `${k}: ${String(v)}`
              ).join(' | ')}
            </div>
          )}
        </div>
      </div>

      {proposal.status === 'proposed' && (
        <div className="flex shrink-0 gap-2 border-t border-border-subtle/50 pt-2.5 mt-1">
          <button
            type="button"
            onClick={() => onApprove(proposal.proposal_id)}
            disabled={!executable || busy}
            title={proposal.execution_allowed ? 'Approve countermeasure' : 'Advisory-only proposal cannot execute'}
            className="flex-1 inline-flex h-7 items-center justify-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-2 text-[9px] font-bold uppercase tracking-wider text-green-400 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-green-500/20 transition-colors"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Approve
          </button>
          <button
            type="button"
            onClick={() => onReject(proposal.proposal_id)}
            disabled={busy}
            className="flex-1 inline-flex h-7 items-center justify-center gap-1 rounded border border-border-default bg-bg-surface px-2 text-[9px] font-bold uppercase tracking-wider text-text-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-bg-elevated transition-colors"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ─── AI Reasoning Excerpt ────────────────────────────────────────────────────

function CountermeasureList({ proposals }: { proposals: CountermeasureProposal[] }) {
  const approve = useApproveCountermeasure()
  const reject = useRejectCountermeasure()
  
  const pendingProposals = proposals.filter((p) => p.status === 'proposed')
  const resolvedProposals = proposals.filter((p) => p.status !== 'proposed')

  return (
    <div>
      <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-text-muted mb-2 flex items-center gap-1">
        <Gavel className="w-3 h-3" />
        Countermeasure Proposals
      </div>
      <div className="space-y-2">
        {[...pendingProposals, ...resolvedProposals].map((p) => (
          <ProposalStatusCard
            key={p.proposal_id}
            proposal={p}
            busy={approve.isPending || reject.isPending}
            onApprove={(id) => void approve.mutateAsync(id)}
            onReject={(id) => void reject.mutateAsync(id)}
          />
        ))}
      </div>
    </div>
  )
}

function AIReasoningPanel({ run, explainability }: {
  run: EventLabRunResponse | undefined
  explainability: EventLabExplainabilityResponse | undefined
}) {
  const qwenExplanation = run?.qwen_explanation ?? explainability?.run?.qwen_explanation ?? ''
  const authority = explainability?.authority_matrix ?? []
  const indicators = run?.expected_indicators ?? []

  // Extract Groq pool metadata from qwen_context_loaded stage
  interface GroqMeta {
    provider?: string
    model?: string
    key_index?: number | string
    latency_ms?: number
    tokens?: number
    pool_available?: number
  }
  const groqMeta = useMemo((): GroqMeta | null => {
    const stages = run?.stages ?? explainability?.run?.stages ?? []
    const loaded = stages.find((s: { stage: string }) => s.stage === 'qwen_context_loaded')
    return (loaded?.meta as GroqMeta) ?? null
  }, [run?.stages, explainability?.run?.stages])

  const isGroqLive  = groqMeta?.provider === 'groq' || groqMeta?.provider === 'claude'
  const isLlmCalling = !!(run && run.stages?.some((s: { stage: string }) => s.stage === 'llm_started') && !groqMeta)

  return (
    <div className="space-y-3">
      {/* Qwen/Groq narrative */}
      <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="text-[10px] font-bold text-orange-400 uppercase tracking-[0.1em]">
            AI Copilot — Fraud Analysis (Not the Decision-Maker)
          </span>
          {isGroqLive && (
            <span className="ml-auto flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              {groqMeta.provider} · {groqMeta.model ?? 'cloud'} · key[{groqMeta.key_index ?? '?'}]
            </span>
          )}
          {isLlmCalling && (
            <span className="ml-auto flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Calling Groq pool…
            </span>
          )}
        </div>
        {qwenExplanation ? (
          <p className="text-[9px] text-text-secondary leading-relaxed">{qwenExplanation}</p>
        ) : (
          <p className="text-[9px] text-text-muted italic">
            Groq round-robin pool (30 keys) will generate a real-time analyst briefing once
            the event chain is launched. It explains the fraud pattern but cannot approve
            holds, freezes, or threshold changes.
          </p>
        )}
        {isGroqLive && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[7px] font-mono text-text-muted border-t border-orange-500/10 pt-2">
            {groqMeta.latency_ms != null && (
              <span className="flex items-center gap-0.5"><Zap className="w-2 h-2" /> {groqMeta.latency_ms}ms</span>
            )}
            {groqMeta.tokens != null && groqMeta.tokens > 0 && (
              <span>{groqMeta.tokens} tokens</span>
            )}
            {groqMeta.pool_available != null && (
              <span>{groqMeta.pool_available} keys available</span>
            )}
          </div>
        )}
      </div>

      {/* Expected fraud indicators */}
      {indicators.length > 0 && (
        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-text-muted mb-1.5 flex items-center gap-1">
            <Siren className="w-3 h-3" />
            Fraud Indicators Being Hunted
          </div>
          <div className="flex flex-wrap gap-1">
            {indicators.map((indicator, i) => (
              <span
                key={i}
                className="text-[8px] px-2 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/8 text-amber-300 font-medium"
              >
                {indicator}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Authority matrix - clear visual */}
      {authority.length > 0 && (
        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-text-muted mb-1.5 flex items-center gap-1">
            <Scale className="w-3 h-3" />
            Who Can Do What
          </div>
          <div className="space-y-1">
            {authority.map((row) => (
              <div
                key={row.layer}
                className="flex items-center gap-2 text-[8px] rounded-md px-2 py-1.5 bg-bg-elevated/60 border border-border-subtle/50"
              >
                <div
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    row.can_execute ? 'bg-green-400' : 'bg-text-muted/40',
                  )}
                />
                <span className="font-bold text-text-primary w-28 shrink-0 truncate">{row.layer}</span>
                <span className="text-text-muted flex-1 truncate">{row.role}</span>
                <span
                  className={cn(
                    'shrink-0 px-1.5 py-0.5 rounded-full text-[7px] font-bold uppercase tracking-wider border',
                    row.can_execute
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-bg-surface text-text-muted border-border-subtle',
                  )}
                >
                  {row.authority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Overall Run Summary ─────────────────────────────────────────────────────

function RunSummaryBanner({ run, explainability }: {
  run: EventLabRunResponse | undefined
  explainability: EventLabExplainabilityResponse | undefined
}) {
  if (!run) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border-subtle/50 p-6 text-center">
        <Hourglass className="w-8 h-8 text-text-muted/30 mx-auto mb-2" />
        <p className="text-[11px] font-semibold text-text-muted">
          Launch an event run to see live fraud response
        </p>
        <p className="text-[9px] text-text-muted/60 mt-1 max-w-xs mx-auto">
          Every backend stage — ML scoring, graph analysis, AI reasoning, and analyst decisions —
          will appear here in real-time as the demo fraud is processed.
        </p>
      </div>
    )
  }

  const runtime = explainability?.runtime
  const proposals = run.countermeasure_proposals ?? []
  const executed  = proposals.filter(p => p.status === 'executed').length
  const pending   = proposals.filter(p => p.status === 'proposed').length
  const rejected  = proposals.filter(p => p.status === 'rejected').length

  const pct = Math.round(
    ((runtime?.stage_count ?? run.stages.length) / 11) * 100,
  )

  const STATUS_LABELS: Record<string, string> = {
    launching: 'Launching…',
    injected:  'Events Injected — Pipeline Processing',
    running:   'Pipeline Running',
    completed: 'Complete',
    failed:    'Failed',
  }

  return (
    <div className="rounded-lg border border-border-default bg-bg-elevated/80 px-4 py-3 space-y-3">
      {/* top row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Run ID / Correlation
          </div>
          <div className="font-mono text-[11px] text-text-primary mt-0.5">
            {short(run.run_id, 14)} / {short(run.correlation_id, 12)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">Status</div>
          <div className={cn(
            'text-[11px] font-bold mt-0.5',
            run.status === 'completed' ? 'text-green-400'
              : run.status === 'failed'    ? 'text-red-400'
              : 'text-amber-400',
          )}>
            {STATUS_LABELS[run.status] ?? run.status}
          </div>
        </div>
      </div>

      {/* progress */}
      <div>
        <div className="flex items-center justify-between text-[8px] text-text-muted mb-1">
          <span>{runtime?.stage_count ?? run.stages.length} of 11 pipeline stages reached</span>
          <span className="font-mono font-bold">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-bg-deep overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: pct === 100
                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                : 'linear-gradient(90deg, #6366f1, #a855f7)',
            }}
          />
        </div>
      </div>

      {/* counters */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Events',   value: run.event_ids.length,     color: 'text-accent-primary' },
          { label: 'Pending',  value: pending,                    color: 'text-amber-400' },
          { label: 'Executed', value: executed,                   color: 'text-green-400' },
          { label: 'Rejected', value: rejected,                   color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-md bg-bg-surface border border-border-subtle px-2 py-1.5 text-center">
            <div className="text-[7px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
            <div className={cn('font-mono text-sm font-bold tabular-nums mt-0.5', color)}>{value}</div>
          </div>
        ))}
      </div>

      {/* audit hash */}
      {run.audit_hash && (
        <div className="flex items-center gap-1.5 text-[8px] font-mono text-text-muted border-t border-border-subtle/50 pt-2">
          <Lock className="w-3 h-3" />
          Audit hash: <span className="text-text-secondary">{run.audit_hash.slice(0, 32)}…</span>
        </div>
      )}
    </div>
  )
}

// ─── Live "What's happening RIGHT NOW" callout ────────────────────────────────

const STAGE_ORDER = [
  'intel_primed', 'events_generated', 'events_injected',
  'pipeline_dispatched', 'ml_scored', 'graph_investigated',
  'cb_evaluated', 'llm_started', 'analyst_decision',
  'action_executed', 'ledger_anchored',
]

function LiveStatusCallout({ run }: { run: EventLabRunResponse | undefined }) {
  if (!run) return null
  const isRunning = run.status !== 'completed' && run.status !== 'failed'

  const doneSet = new Set(run.stages.map(s => s.stage))
  const lastDoneIdx = STAGE_ORDER.reduce((last, key, i) => doneSet.has(key) ? i : last, -1)
  const lastDoneKey  = lastDoneIdx >= 0 ? STAGE_ORDER[lastDoneIdx] : null
  const activeKey    = isRunning && lastDoneIdx < STAGE_ORDER.length - 1
    ? STAGE_ORDER[lastDoneIdx + 1] : null
  const currentKey   = activeKey ?? lastDoneKey

  if (!currentKey) return null

  const meta         = getStageMeta(currentKey)
  const StageIcon    = meta.icon
  const stageData    = run.stages.find(s => s.stage === currentKey)
  const stageMeta    = stageData?.meta ?? {}

  // Build a human-readable "result so far" from the most recent stage's meta
  const resultBits: string[] = []
  if (stageMeta.risk_score != null)     resultBits.push(`Risk score: ${stageMeta.risk_score}`)
  if (stageMeta.tier)                   resultBits.push(`Tier: ${stageMeta.tier}`)
  if (stageMeta.provider)               resultBits.push(`Provider: ${stageMeta.provider}`)
  if (stageMeta.event_count != null)    resultBits.push(`${stageMeta.event_count} events`)
  if (stageMeta.proposal_count != null) resultBits.push(`${stageMeta.proposal_count} proposals`)
  if (stageMeta.count != null && !stageMeta.event_count) resultBits.push(`${stageMeta.count} events`)

  const isWaitingAnalyst = currentKey === 'analyst_decision' && run.countermeasure_proposals?.some(
    (p: CountermeasureProposal) => p.status === 'proposed',
  )

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 flex items-start gap-3',
        isRunning && !isWaitingAnalyst && 'border-amber-500/25 bg-amber-500/5',
        isWaitingAnalyst               && 'border-purple-500/30 bg-purple-500/5',
        !isRunning                     && 'border-green-500/20 bg-green-500/5',
      )}
    >
      {/* animated icon */}
      <div
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          isRunning && !isWaitingAnalyst && 'bg-amber-500/15 border border-amber-500/30',
          isWaitingAnalyst               && 'bg-purple-500/15 border border-purple-500/30',
          !isRunning                     && 'bg-green-500/15 border border-green-500/30',
        )}
      >
        {isRunning && !isWaitingAnalyst
          ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          : isWaitingAnalyst
          ? <Gavel className="w-4 h-4 text-purple-400" />
          : <ShieldCheck className="w-4 h-4 text-green-400" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={cn(
            'text-[11px] font-bold uppercase tracking-[0.1em]',
            isRunning && !isWaitingAnalyst && 'text-amber-300',
            isWaitingAnalyst               && 'text-purple-300',
            !isRunning                     && 'text-green-300',
          )}>
            {isRunning && !isWaitingAnalyst ? '⚡ PayFlow is currently: ' : ''}
            {isWaitingAnalyst ? '⏳ Waiting for analyst approval' : ''}
            {!isRunning ? '✓ All pipeline stages complete' : ''}
            {isRunning && !isWaitingAnalyst && meta.label}
          </span>
          {isRunning && !isWaitingAnalyst && (
            <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider animate-pulse">
              live
            </span>
          )}
        </div>

        <p className="text-[9px] text-text-secondary leading-relaxed">
          {isWaitingAnalyst
            ? `${run.countermeasure_proposals?.filter((p: CountermeasureProposal) => p.status === 'proposed').length ?? 0} countermeasure proposal(s) are awaiting analyst approval. Click Approve or Reject in the AI Reasoning panel to execute the response.`
            : !isRunning
            ? `Run completed. ${run.stages.length} pipeline stages recorded. Check countermeasure proposals and the ledger audit trail.`
            : meta.what
          }
        </p>

        {resultBits.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {resultBits.map(bit => (
              <span key={bit} className="font-mono text-[7px] px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-text-secondary">
                {bit}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* stage icon pill */}
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}
      >
        <StageIcon className="w-3.5 h-3.5" style={{ color: meta.color }} />
      </div>
    </div>
  )
}

// ─── Main exported component ─────────────────────────────────────────────────

export interface EventLabExplainabilityPanelProps {
  run: EventLabRunResponse | undefined
  explainability: EventLabExplainabilityResponse | undefined
}

export function EventLabExplainabilityPanel({
  run,
  explainability,
}: EventLabExplainabilityPanelProps) {
  const proposals = run?.countermeasure_proposals ?? []

  // Auto-scroll the stage feed when new stages arrive
  const timelineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (timelineRef.current && run?.stages?.length) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight
    }
  }, [run?.stages?.length])

  return (
    <div className="space-y-4">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-border-default bg-bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/15 to-blue-500/15 border border-purple-500/25 flex items-center justify-center">
            <Workflow className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-[12px] font-bold text-text-primary uppercase tracking-[0.1em]">
              Live Fraud Response — How PayFlow Is Fighting This Attack
            </h3>
            <p className="text-[9px] text-text-muted mt-0.5">
              Every layer from Intel → ML → Graph → AI → Analyst → Ledger shown in real-time
            </p>
          </div>
        </div>
      </div>

      {/* ── Run summary banner ──────────────────────────────── */}
      <RunSummaryBanner run={run} explainability={explainability} />

      {/* ── Live "What PayFlow is doing right now" callout ──── */}
      <LiveStatusCallout run={run} />

      {/* ── Main 3-column grid ──────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">

        {/* Column 1: Live stage-by-stage timeline */}
        <div className="rounded-lg border border-border-default bg-bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
            <Activity className="w-4 h-4 text-accent-primary" />
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">
              Pipeline Stages — Real Time
            </h4>
            {run && (
              <span className="ml-auto text-[8px] font-mono text-text-muted">
                {run.stages.length}/11
              </span>
            )}
          </div>
          <div ref={timelineRef} className="p-3 max-h-[520px] overflow-y-auto space-y-1">
            {run ? (
              <LiveStageTimeline run={run} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-[10px] text-text-muted">
                <Activity className="w-7 h-7 text-text-muted/25 mb-2" />
                Launch a run — stages appear here as each backend layer processes the event chain.
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Detection layer breakdown */}
        <div className="rounded-lg border border-border-default bg-bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
            <Layers className="w-4 h-4 text-accent-primary" />
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">
              Detection Layers — What Each Does
            </h4>
          </div>
          <div className="p-3 max-h-[520px] overflow-y-auto">
            <DetectionLayerBreakdown explainability={explainability} />
          </div>
        </div>

        {/* Column 3: AI reasoning + proposals */}
        <div className="rounded-lg border border-border-default bg-bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
            <GitBranch className="w-4 h-4 text-accent-primary" />
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">
              AI Reasoning + Countermeasures
            </h4>
            {proposals.length > 0 && (
              <span className="ml-auto text-[8px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                {proposals.filter(p => p.status === 'proposed').length} pending
              </span>
            )}
          </div>
          <div className="p-3 max-h-[520px] overflow-y-auto space-y-3">
            <AIReasoningPanel run={run} explainability={explainability} />

            {proposals.length > 0 && (
              <CountermeasureList proposals={proposals} />
            )}

            {!run && (
              <div className="text-[9px] text-text-muted text-center pt-4 italic">
                AI reasoning and countermeasures appear after launch
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Decision chain transparency footer ─────────────── */}
      <div className="rounded-lg border border-border-default bg-bg-surface px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-green-400" />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">
            How This Fraud Is Being Tackled — Decision Chain
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Radar,
              color: '#6366f1',
              step: '① Intel Primes',
              desc: 'External OSINT (FIU-IND, RBI circulars, SOCMINT) loads the fraud typology, watch-terms, and Qwen briefing — before any event is generated.',
            },
            {
              icon: BrainCircuit,
              color: '#a855f7',
              step: '② Pipeline Scores',
              desc: 'Real transactions hit XGBoost (36-dim features), NetworkX graph analysis (mule chains, cycles, centrality), and 15+ deterministic rules — all internal.',
            },
            {
              icon: Gavel,
              color: '#10b981',
              step: '③ Analyst Gates',
              desc: 'Proposed holds, freezes, and device bans show up in the console with TTL and rollback. Nothing executes until a human clicks Approve.',
            },
            {
              icon: Lock,
              color: '#6366f1',
              step: '④ Ledger Anchors',
              desc: 'Every approved or rejected decision is hashed with Ed25519 and committed to the append-only blockchain — permanent, FIU-ready audit trail.',
            },
          ].map(({ icon: Icon, color, step, desc }) => (
            <div
              key={step}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: `${color}20`, background: `${color}05` }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-[10px] font-bold" style={{ color }}>{step}</span>
              </div>
              <p className="text-[9px] text-text-secondary leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
