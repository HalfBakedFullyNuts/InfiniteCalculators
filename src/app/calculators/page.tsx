"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calculator,
  CheckCircle2,
  Clipboard,
  Crosshair,
  Database,
  Factory,
  FileText,
  Globe,
  Radar,
  Route,
  Ship,
  Swords,
  Target,
  Wallet,
} from 'lucide-react';
import gameDataRaw from '../../lib/game/game_data.json';
import pkg from '../../../package.json';
import {
  buildGameDefs,
  calculateCargoPlan,
  calculateFleetBalancePlan,
  calculateFleetScoreBreakdown,
  calculateFreighterRoundTrip,
  fleetFromBudget,
  FLEET_CARGO_ORDER,
  formatCombatScanAsDiscord,
  formatFleetOverviewAsDiscord,
  formatFleetScanAsDiscord,
  formatRadarSystemAsDiscord,
  formulaBuildRecommendation,
  formatHumanNumber,
  optimizeWarships,
  WARSHIP_IDS,
  parseCombatScanInput,
  parseFleetScanInput,
  parseFleetOverviewInput,
  parseHumanNumber,
  parseRadarInput,
  parseRatioInput,
  parseSnapshotInput,
  projectAvailableResources,
  type BattleReportShipRow,
  type CombatScanParseResult,
  type CombatSideSummary,
  type CombatPlayerSummary,
  type FleetScanEtaTable,
  type FleetScanParseResult,
  type RadarParseResult,
  type ShipDef,
  type FleetCargoId,
  type FleetOverviewParseResult,
  type FormulaBuildResult,
  type FreighterRoundTripResult,
  type ParsedSnapshot,
  type ResourceId,
  type WarshipBudgetResult,
} from '../../lib/calculators/engine';
import { copyToClipboard } from '../../lib/export/formatters';

const RESOURCE_ORDER: ResourceId[] = ['metal', 'mineral', 'food', 'energy'];
type DiscordTableCell = string | number;

const TOOL_GROUPS = [
  {
    id: 'planet', label: '🌍 Planet',
    tools: [
      { id: 'snapshot', label: 'Snapshot' },
      { id: 'cargo', label: 'Cargo' },
      { id: 'fleet-score', label: 'Fleet Score' },
      { id: 'ratio', label: 'Ratios' },
      { id: 'builds', label: 'Builds' },
      { id: 'budget', label: 'Budget' },
    ],
  },
  {
    id: 'warship', label: '⚔️ Warship',
    tools: [{ id: 'warships', label: 'Warship Budget' }],
  },
  {
    id: 'intel', label: '⚡ Intelligence',
    tools: [
      { id: 'fleet-overview', label: 'Fleet ETA' },
      { id: 'fleet-scan', label: 'Fleet Scan' },
      { id: 'combat-scan', label: 'Combat' },
      { id: 'radar', label: 'Radar' },
    ],
  },
] as const;

const DEFAULT_INPUT = `Paste either:
- Discord ANSI empire/planet blocks
- Ctrl+A from planet view

Example mini-input:
Metal 2.5M +110.9K/tick 83%
Mineral 1.2M +70.2K/tick 80%
Food 719.5K +18.6K/tick 80%
Energy 258.1K +1.6K/tick 74%
Worker 450k /450k (120k busy)
Ground Space 24
Orbital Space 18
19x Metal Mine
18x Mineral Extractor
6x Farm
4x Hydroponics Lab`;

const DEFAULT_RATIO = `Destroyer: 6
Cruiser: 3
Battleship: 1`;

function idLabel(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function cargoLabel(id: FleetCargoId): string {
  if (id === 'workers') {
    return 'Worker';
  }
  if (id === 'soldiers') {
    return 'Soldier';
  }
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function asDiscordCell(value: DiscordTableCell): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '0';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function formatDiscordTable(title: string, headers: string[], rows: DiscordTableCell[][]): string {
  const normalizedRows = rows.length ? rows : [['No rows']];
  const columnCount = Math.max(headers.length, ...normalizedRows.map((row) => row.length));
  const normalizedHeaders = Array.from({ length: columnCount }, (_, index) => asDiscordCell(headers[index] || ''));
  const normalizedBody = normalizedRows.map((row) => (
    Array.from({ length: columnCount }, (_, index) => asDiscordCell(row[index] ?? ''))
  ));
  const widths = normalizedHeaders.map((header, index) => (
    Math.max(header.length, ...normalizedBody.map((row) => row[index].length))
  ));
  const renderRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index])).join(' | ');
  const divider = widths.map((width) => '-'.repeat(width)).join('-+-');

  return [title, renderRow(normalizedHeaders), divider, ...normalizedBody.map(renderRow)].join('\n');
}

function wrapDiscordExport(parts: string[]): string {
  const body = parts.filter((part) => part.trim().length > 0).join('\n\n').trim();
  return body ? `\`\`\`\n${body}\n\`\`\`` : '';
}

// ── New Utility Components ──────────────────────────────────────────────────

function PasteInput({ value, onChange, placeholder, hint, height = 140, demoData: _demoData }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; height?: number; demoData?: string;
}) {
  const hasContent = value.trim().length > 0;
  return (
    <div>
      <textarea
        className="c-paste"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Paste game data here…'}
        style={{ height }}
        spellCheck={false}
      />
      <div className="flex justify-between items-center mt-1">
        <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{hint || ''}</span>
        {hasContent && (
          <div className="flex gap-2 items-center">
            <span className="text-[11px]" style={{ color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
              {value.length.toLocaleString()} chars
            </span>
            <button type="button" className="c-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => onChange('')}>× Clear</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DiscordBtn({ exportText, emptyText }: { exportText: string; emptyText?: string }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const hasData = exportText.trim().length > 0;

  const handleCopy = async () => {
    const ok = await copyToClipboard(exportText);
    if (ok) { setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 1600); }
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        className={`c-btn-discord${copied ? ' is-copied' : ''}`}
        onClick={() => hasData && setOpen((o) => !o)}
        disabled={!hasData}
        title={hasData ? 'Copy Discord export' : (emptyText || 'No data yet')}
      >⎘ Discord</button>
      {open && hasData && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="c-discord-popover absolute right-0" style={{ top: 'calc(100% + 6px)' }}>
            <pre style={{ padding: '10px 12px', fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--t2)', maxHeight: 200, overflow: 'auto', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{exportText}</pre>
            <div className="flex justify-end gap-2 p-2" style={{ borderTop: '1px solid var(--br)', background: 'rgba(0,0,0,0.2)' }}>
              <button type="button" className="c-btn-ghost" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => setOpen(false)}>Close</button>
              <button type="button" className={`c-btn-discord${copied ? ' is-copied' : ''}`} onClick={handleCopy}>{copied ? '✓ Copied!' : '⎘ Copy to clipboard'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ToolCard({ id, badge, icon, title, exportText, emptyExport, children }: {
  id?: string; badge?: string; icon?: string; title: string;
  exportText?: string; emptyExport?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="c-card" style={{ padding: '16px 18px', scrollMarginTop: 106 }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {badge && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--t3)', fontFamily: 'var(--mono)', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--br)', borderRadius: 4, padding: '1px 5px', flexShrink: 0, letterSpacing: '0.04em' }}>{badge}</span>
          )}
          {icon && <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.01em', minWidth: 0 }}>{title}</h2>
        </div>
        {exportText !== undefined && <DiscordBtn exportText={exportText} emptyText={emptyExport} />}
      </div>
      {children}
    </section>
  );
}

function GroupDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px" style={{ background: 'var(--br)' }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--br)' }} />
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 7, marginTop: 2 }}>{text}</div>;
}

function EmptyState({ icon, msg, sub }: { icon?: string; msg: string; sub?: string }) {
  return (
    <div className="py-8 text-center">
      <div style={{ fontSize: 26, opacity: 0.2, marginBottom: 8 }}>{icon || '📋'}</div>
      <div style={{ fontSize: 13, color: 'var(--t3)' }}>{msg}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', opacity: 0.6, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StatChip({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--br)', borderRadius: 7, padding: '7px 13px', minWidth: 90 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: dim ? 'var(--t3)' : 'var(--t1)' }}>{value}</div>
    </div>
  );
}

// ── Logic helpers (preserved exactly) ──────────────────────────────────────

function tradeEmoji(ownCost: number, enemyCost: number): string {
  if (enemyCost <= 0 && ownCost <= 0) return '🟡';
  if (enemyCost <= 0) return '🔴';
  const ratio = ownCost / Math.max(1, enemyCost);
  if (ratio < 0.92) return '🟢';
  if (ratio > 1.08) return '🔴';
  return '🟡';
}

function tradeLabel(ownCost: number, enemyCost: number): string {
  if (enemyCost <= 0 && ownCost <= 0) return 'Even';
  if (enemyCost <= 0) return 'No enemy losses';
  const ratio = ownCost / Math.max(1, enemyCost);
  if (ratio < 0.92) return 'Favorable';
  if (ratio > 1.08) return 'Unfavorable';
  return 'Roughly even';
}

function CombatSideCard({
  summary,
  enemyCost,
  shipIds,
  shipsById,
}: {
  summary: CombatSideSummary;
  enemyCost: number;
  shipIds: string[];
  shipsById: Record<string, ShipDef>;
}) {
  const emoji = tradeEmoji(summary.weightedCostLost, enemyCost);
  const label = tradeLabel(summary.weightedCostLost, enemyCost);
  const isAttacker = summary.side === 'attacker';

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${isAttacker ? 'rgba(34,211,238,0.3)' : 'rgba(245,158,11,0.3)'}`,
        background: isAttacker ? 'rgba(34,211,238,0.05)' : 'rgba(245,158,11,0.05)',
        padding: 12,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: isAttacker ? 'var(--cyan)' : 'var(--amber)',
          }}
        >
          {isAttacker ? '⚔️ Attackers' : '🛡️ Defenders'}
        </div>
        <div className="text-sm">{emoji} <span className="text-xs" style={{ color: 'var(--t3)' }}>{label}</span></div>
      </div>

      <div className="mb-2 text-xs" style={{ color: 'var(--t3)' }}>{summary.alliances.join(', ') || '—'}</div>
      <div className="mb-3 text-xs" style={{ color: 'var(--t2)' }}>{summary.players.join(', ') || '—'}</div>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div style={{ borderRadius: 4, border: '1px solid var(--br)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px' }}>
          <div style={{ color: 'var(--t3)' }}>Units lost</div>
          <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{formatHumanNumber(summary.totalUnitsLost)}</div>
        </div>
        <div style={{ borderRadius: 4, border: '1px solid var(--br)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px' }}>
          <div style={{ color: 'var(--t3)' }}>Score lost</div>
          <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{formatHumanNumber(summary.totalScoreLost)}</div>
        </div>
        <div style={{ borderRadius: 4, border: '1px solid var(--br)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px' }}>
          <div style={{ color: 'var(--t3)' }}>Metal destroyed</div>
          <div style={{ fontWeight: 600, color: 'var(--red)' }}>{formatHumanNumber(summary.totalCostLost.metal)}</div>
        </div>
        <div style={{ borderRadius: 4, border: '1px solid var(--br)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px' }}>
          <div style={{ color: 'var(--t3)' }}>Mineral destroyed</div>
          <div style={{ fontWeight: 600, color: 'var(--red)' }}>{formatHumanNumber(summary.totalCostLost.mineral)}</div>
        </div>
        <div style={{ borderRadius: 4, border: '1px solid var(--br)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', gridColumn: 'span 2' }}>
          <div style={{ color: 'var(--t3)' }}>Weighted cost destroyed</div>
          <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{formatHumanNumber(summary.weightedCostLost)}</div>
        </div>
      </div>

      {shipIds.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded" style={{ border: '1px solid var(--br)' }}>
          <table className="c-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Ship</th>
                <th>Lost</th>
                <th>% of total</th>
              </tr>
            </thead>
            <tbody>
              {shipIds.filter((id) => summary.unitsLost[id] > 0).map((id) => {
                const count = summary.unitsLost[id] || 0;
                const pct = summary.totalUnitsLost > 0 ? ((count / summary.totalUnitsLost) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={id}>
                    <td>{shipsById[id]?.name ?? id}</td>
                    <td>{formatHumanNumber(count)}</td>
                    <td style={{ color: 'var(--t3)' }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CombatOutput({ combatScan, shipsById }: { combatScan: CombatScanParseResult; shipsById: Record<string, ShipDef> }) {
  const { attackers, defenders, tradeRatio, battleReport } = combatScan;
  const atkWon = tradeRatio < 0.95;
  const defWon = tradeRatio > 1.05;

  const atkLossPct = attackers.weightedCostBefore > 0 ? attackers.weightedCostLost / attackers.weightedCostBefore * 100 : 0;
  const defLossPct = defenders.weightedCostBefore > 0 ? defenders.weightedCostLost / defenders.weightedCostBefore * 100 : 0;
  const marginPts = Math.abs(atkLossPct - defLossPct);

  const fmt = formatHumanNumber;
  const fmtPair = (a: number, b: number) => `${fmt(a)} / ${fmt(b)}`;
  const pct = (lost: number, before: number): string => before > 0 ? `${(lost / before * 100).toFixed(2)}%` : '—';

  // Compute per-side cost summaries from battle report rows
  type SideSummary = {
    metBef: number; minBef: number; scoreBef: number;
    metLost: number; minLost: number; scoreLost: number;
    wBef: number; wLost: number;
  };

  function computeSide(rows: BattleReportShipRow[], getCount: (r: BattleReportShipRow) => [number, number]): SideSummary {
    const s: SideSummary = { metBef: 0, minBef: 0, scoreBef: 0, metLost: 0, minLost: 0, scoreLost: 0, wBef: 0, wLost: 0 };
    for (const row of rows) {
      const ship = shipsById[row.shipId];
      if (!ship) continue;
      const [bef, aft] = getCount(row);
      const lost = Math.max(0, bef - aft);
      s.metBef += ship.costs.metal * bef;
      s.minBef += ship.costs.mineral * bef;
      s.scoreBef += ship.scoreValue * bef;
      s.metLost += ship.costs.metal * lost;
      s.minLost += ship.costs.mineral * lost;
      s.scoreLost += ship.scoreValue * lost;
      s.wBef += (ship.costs.metal + ship.costs.mineral * 1.5) * bef;
      s.wLost += (ship.costs.metal + ship.costs.mineral * 1.5) * lost;
    }
    return s;
  }

  const hasAllied = battleReport?.rows.some((r) => r.alliedBefore > 0 || r.alliedAfter > 0) ?? false;
  const ownedS = battleReport ? computeSide(battleReport.rows, (r) => [r.ownedBefore, r.ownedAfter]) : null;
  const alliedS = battleReport && hasAllied ? computeSide(battleReport.rows, (r) => [r.alliedBefore, r.alliedAfter]) : null;
  const hostileS = battleReport ? computeSide(battleReport.rows, (r) => [r.hostileBefore, r.hostileAfter]) : null;

  // Build column headers and row data
  type TradeRow = { label: string; cols: string[]; isLoss?: boolean } | null;
  let colHeaders: string[];
  let tradeRows: TradeRow[];

  const resScore = (met: number, min: number) => fmt(Math.round((met + min * 1.5) / 1000));

  if (ownedS && hostileS) {
    const cmt = (s: SideSummary): [string, string, string] => [
      fmtPair(s.metBef, s.minBef), resScore(s.metBef, s.minBef), fmt(s.scoreBef),
    ];
    const lst = (s: SideSummary): [string, string, string, string] => [
      fmtPair(s.metLost, s.minLost), resScore(s.metLost, s.minLost), fmt(s.scoreLost), pct(s.scoreLost, s.scoreBef),
    ];
    const oC = cmt(ownedS); const oL = lst(ownedS);
    const hC = cmt(hostileS); const hL = lst(hostileS);
    const aC = alliedS ? cmt(alliedS) : null;
    const aL = alliedS ? lst(alliedS) : null;

    const mk = (label: string, ov: string, av: string | null, hv: string, isLoss?: boolean): TradeRow => ({
      label,
      cols: aC ? [ov, av!, hv] : [ov, hv],
      isLoss,
    });

    colHeaders = [`Owned — ${battleReport!.ownedPlayers.join(', ')}`, ...(aC ? ['Allied'] : []), `Hostile — ${battleReport!.hostilePlayers.join(', ')}`];
    tradeRows = [
      mk('Resources committed', oC[0], aC?.[0] ?? null, hC[0]),
      mk('Resource score', oC[1], aC?.[1] ?? null, hC[1]),
      mk('Ship score pts', oC[2], aC?.[2] ?? null, hC[2]),
      null,
      mk('Resources lost', oL[0], aL?.[0] ?? null, hL[0], true),
      mk('Resource score lost', oL[1], aL?.[1] ?? null, hL[1], true),
      mk('Ship score pts lost', oL[2], aL?.[2] ?? null, hL[2], true),
      mk('% score lost', oL[3], aL?.[3] ?? null, hL[3], true),
    ];
  } else {
    const atkPct = pct(attackers.totalScoreLost, attackers.totalScoreBefore);
    const defPct = pct(defenders.totalScoreLost, defenders.totalScoreBefore);
    colHeaders = [`⚔️ Attk — ${attackers.players.join(', ')}`, `🛡️ Def — ${defenders.players.join(', ')}`];
    tradeRows = [
      { label: 'Resources committed', cols: [fmtPair(attackers.totalCostBefore.metal, attackers.totalCostBefore.mineral), fmtPair(defenders.totalCostBefore.metal, defenders.totalCostBefore.mineral)] },
      { label: 'Resource score', cols: [resScore(attackers.totalCostBefore.metal, attackers.totalCostBefore.mineral), resScore(defenders.totalCostBefore.metal, defenders.totalCostBefore.mineral)] },
      { label: 'Ship score pts', cols: [fmt(attackers.totalScoreBefore), fmt(defenders.totalScoreBefore)] },
      null,
      { label: 'Resources lost', cols: [fmtPair(attackers.totalCostLost.metal, attackers.totalCostLost.mineral), fmtPair(defenders.totalCostLost.metal, defenders.totalCostLost.mineral)], isLoss: true },
      { label: 'Resource score lost', cols: [resScore(attackers.totalCostLost.metal, attackers.totalCostLost.mineral), resScore(defenders.totalCostLost.metal, defenders.totalCostLost.mineral)], isLoss: true },
      { label: 'Ship score pts lost', cols: [fmt(attackers.totalScoreLost), fmt(defenders.totalScoreLost)], isLoss: true },
      { label: '% score lost', cols: [atkPct, defPct], isLoss: true },
    ];
  }

  return (
    <>
      {/* Battle Report Replica */}
      {battleReport && battleReport.rows.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel text="Battle Report" />
          <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'auto' }}>
            <table className="c-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }} rowSpan={2}>Ship</th>
                  <th colSpan={2} style={{ textAlign: 'center', borderBottom: '1px solid var(--br)', background: 'rgba(34,211,238,0.07)', color: 'var(--cyan)' }}>
                    Owned — {battleReport.ownedPlayers.join(', ')}
                  </th>
                  {hasAllied && (
                    <th colSpan={2} style={{ textAlign: 'center', borderBottom: '1px solid var(--br)', color: 'var(--t2)' }}>Allied</th>
                  )}
                  <th colSpan={2} style={{ textAlign: 'center', borderBottom: '1px solid var(--br)', background: 'rgba(248,113,113,0.06)', color: 'var(--r-mineral)' }}>
                    Hostile — {battleReport.hostilePlayers.join(', ')}
                  </th>
                </tr>
                <tr>
                  <th>Before</th><th>After</th>
                  {hasAllied && <><th>Before</th><th>After</th></>}
                  <th>Before</th><th>After</th>
                </tr>
              </thead>
              <tbody>
                {battleReport.rows.map((r) => (
                  <tr key={r.shipId}>
                    <td style={{ fontWeight: 500 }}>{shipsById[r.shipId]?.name ?? r.shipId}</td>
                    <td style={{ color: 'var(--t2)' }}>{r.ownedBefore || '—'}</td>
                    <td style={{ color: r.ownedAfter < r.ownedBefore ? 'var(--r-mineral)' : 'var(--t2)' }}>{r.ownedAfter || '—'}</td>
                    {hasAllied && (
                      <>
                        <td style={{ color: 'var(--t2)' }}>{r.alliedBefore || '—'}</td>
                        <td style={{ color: r.alliedAfter < r.alliedBefore ? 'var(--r-mineral)' : 'var(--t2)' }}>{r.alliedAfter || '—'}</td>
                      </>
                    )}
                    <td style={{ color: 'var(--t2)' }}>{r.hostileBefore || '—'}</td>
                    <td style={{ color: r.hostileAfter < r.hostileBefore ? 'var(--r-mineral)' : 'var(--t2)' }}>{r.hostileAfter || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trade Analysis */}
      <SectionLabel text="Trade Analysis" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginBottom: 10, background: atkWon || defWon ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${atkWon || defWon ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>Outcome</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: atkWon || defWon ? 'var(--green)' : 'var(--amber)' }}>
            {atkWon
              ? `🟢 ${ownedS ? 'Hostile' : 'Attackers'} won`
              : defWon
                ? `🟢 ${ownedS ? 'Owned' : 'Defenders'} won`
                : '🟡 Even trade'}
            {(atkWon || defWon) && marginPts > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginLeft: 8 }}>
                ({marginPts.toFixed(1)} pp margin)
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>Score lost ratio</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>
            {Number.isFinite(tradeRatio) && tradeRatio < 99 ? tradeRatio.toFixed(2) : '∞'}
          </div>
        </div>
      </div>
      <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
        <table className="c-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Metric</th>
              {colHeaders.map((h, i) => (
                <th key={i} style={{ textAlign: 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tradeRows.map((row, i) => {
              if (!row) {
                return <tr key={`sep-${i}`}><td colSpan={colHeaders.length + 1} style={{ padding: '2px 0', background: 'var(--br)', height: 1 }} /></tr>;
              }
              const { label, cols, isLoss } = row;
              return (
                <tr key={`${label}-${i}`}>
                  <td style={{ color: 'var(--t3)' }}>{label}</td>
                  {cols.map((v, j) => (
                    <td key={j} style={{ textAlign: 'right', color: isLoss && v !== '—' && v !== '0' && v !== '0.00%' ? 'var(--r-mineral)' : undefined }}>{v}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--br)', fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--t2)' }}>Score lost ratio</strong> = hostile ship score pts lost ÷ (owned + allied) ship score pts lost.
        {' '}A ratio &gt; 1 means hostile lost more score than the defending side — the higher the number, the more one-sided the victory.
        {' '}Based on each ship&apos;s <code>score_value</code> from the game data, not on resource costs.
      </div>
    </>
  );
}

function WarshipResultPanel({ label, result, accent, border }: { label: string; result: WarshipBudgetResult; accent: string; border: string }) {
  return (
    <div className={`rounded-lg border ${border} bg-black/20 p-3`}>
      <div className={`mb-3 text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}>{label}</div>

      {result.fleet.length === 0 ? (
        <div className="text-sm text-slate-400">Cannot afford any warship with this budget.</div>
      ) : (
        <>
          <div className="mb-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="c-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Ship</th>
                  <th>Count</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {result.fleet.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.name}</td>
                    <td>{formatHumanNumber(entry.count)}</td>
                    <td>{formatHumanNumber(entry.scoreContrib)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="text-slate-400">Total Score</div>
              <div className={`font-semibold ${accent}`}>{formatHumanNumber(result.totalScore)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="text-slate-400">Leftover (weighted)</div>
              <div className="font-semibold text-slate-100">{formatHumanNumber(result.leftoverWeighted)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="text-slate-400">Metal used / left</div>
              <div className="font-semibold text-slate-100">{formatHumanNumber(result.usedMetal)} / {formatHumanNumber(result.leftoverMetal)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="text-slate-400">Mineral used / left</div>
              <div className="font-semibold text-slate-100">{formatHumanNumber(result.usedMineral)} / {formatHumanNumber(result.leftoverMineral)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────────────────

export default function CalculatorsPage() {
  const defs = useMemo(() => buildGameDefs(gameDataRaw), []);

  const [rawInput, setRawInput] = useState(DEFAULT_INPUT);
  const [fleetCounts, setFleetCounts] = useState<Record<string, string>>({ destroyer: '120', cruiser: '50', battleship: '20' });
  const [ratioInput, setRatioInput] = useState(DEFAULT_RATIO);
  const [projectionTicks, setProjectionTicks] = useState(0);
  const [warshipMetal, setWarshipMetal] = useState('');
  const [warshipMineral, setWarshipMineral] = useState('');
  const [warshipAllowed, setWarshipAllowed] = useState<Record<string, boolean>>(
    () => Object.fromEntries(WARSHIP_IDS.map((id) => [id, true])),
  );
  const [fleetOverviewInput, setFleetOverviewInput] = useState('');
  const [fleetScanInput, setFleetScanInput] = useState('');
  const [combatScanInput, setCombatScanInput] = useState('');
  const [radarInput, setRadarInput] = useState('');

  const parsed = useMemo<ParsedSnapshot>(() => parseSnapshotInput(rawInput, defs), [rawInput, defs]);

  const fleetScan = useMemo<FleetScanParseResult>(() => parseFleetScanInput(fleetScanInput, defs), [fleetScanInput, defs]);

  const fleetOverview = useMemo<FleetOverviewParseResult>(() => parseFleetOverviewInput(fleetOverviewInput), [fleetOverviewInput]);

  const combatScan = useMemo<CombatScanParseResult>(
    () => parseCombatScanInput(combatScanInput, defs),
    [combatScanInput, defs],
  );

  const radarResult = useMemo<RadarParseResult>(() => parseRadarInput(radarInput), [radarInput]);

  const combatScanDiscordExport = useMemo(
    () => formatCombatScanAsDiscord(combatScan, defs.shipsById),
    [combatScan, defs.shipsById],
  );

  const fleetOverviewDiscordExport = useMemo(
    () => formatFleetOverviewAsDiscord(fleetOverview),
    [fleetOverview],
  );

  const fleetScanShipIds = useMemo(() => {
    const present = new Set<string>();
    for (const row of fleetScan.byAlliance) {
      for (const [id, count] of Object.entries(row.units)) {
        if (count > 0) present.add(id);
      }
    }
    return Object.keys(defs.shipsById).filter((id) => present.has(id));
  }, [fleetScan.byAlliance, defs.shipsById]);

  const fleetScanDiscordExport = useMemo(
    () => formatFleetScanAsDiscord(fleetScan, fleetScanShipIds),
    [fleetScan, fleetScanShipIds],
  );

  const parsedFleet = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const [id, val] of Object.entries(fleetCounts)) {
      const n = parseInt(val, 10);
      if (n > 0) result[id] = n;
    }
    return result;
  }, [fleetCounts]);

  const ratioWeights = useMemo(
    () => parseRatioInput(ratioInput, defs.shipNameToId),
    [ratioInput, defs.shipNameToId],
  );

  const cargoPlan = useMemo(() => calculateCargoPlan(parsed, defs.cargoShips), [parsed, defs.cargoShips]);

  const freighterRoundTrip = useMemo<FreighterRoundTripResult>(
    () => calculateFreighterRoundTrip(parsed.resourcesOutput, [16, 14, 12]),
    [parsed.resourcesOutput],
  );

  const fleetScore = useMemo(
    () => calculateFleetScoreBreakdown(parsedFleet, defs.shipsById),
    [parsedFleet, defs.shipsById],
  );

  const fleetBalance = useMemo(
    () => calculateFleetBalancePlan(parsedFleet, ratioWeights),
    [parsedFleet, ratioWeights],
  );

  const buildFormula = useMemo<FormulaBuildResult>(
    () => formulaBuildRecommendation(parsed, defs.structuresById),
    [parsed, defs.structuresById],
  );

  const availableNow = useMemo(() => projectAvailableResources(parsed, Math.max(0, Math.floor(projectionTicks))), [parsed, projectionTicks]);

  const budgetFleet = useMemo(
    () => fleetFromBudget(availableNow, ratioWeights, defs.shipsById),
    [availableNow, ratioWeights, defs.shipsById],
  );

  const totalOtherStored = parsed.resourcesStored.food + parsed.resourcesStored.energy;

  const warshipOptimizer = useMemo(() => {
    const m = parseHumanNumber(warshipMetal);
    const n = parseHumanNumber(warshipMineral);
    if (m <= 0 && n <= 0) return null;
    const allowedIds = WARSHIP_IDS.filter((id) => warshipAllowed[id]);
    if (allowedIds.length === 0) return null;
    return optimizeWarships(m, n, defs.shipsById, allowedIds);
  }, [warshipMetal, warshipMineral, defs.shipsById, warshipAllowed]);

  const cargoDiscordExport = useMemo(() => {
    const parts: string[] = [];
    if (cargoPlan) {
      const shipRows = defs.cargoShips.map((ship) => [
        ship.name,
        cargoPlan.shipCounts[ship.id] || 0,
        formatHumanNumber(ship.metalCap),
        formatHumanNumber(ship.mineralCap),
        formatHumanNumber(ship.otherCap),
      ]);
      const summaryRows = [
        ['Ships', cargoPlan.totals.ships],
        ['Metal target', formatHumanNumber(parsed.resourcesStored.metal)],
        ['Mineral target', formatHumanNumber(parsed.resourcesStored.mineral)],
        ['Food+Energy target', formatHumanNumber(totalOtherStored)],
        ['Metal overflow', formatHumanNumber(cargoPlan.overflow.metal)],
        ['Mineral overflow', formatHumanNumber(cargoPlan.overflow.mineral)],
        ['Food+Energy overflow', formatHumanNumber(cargoPlan.overflow.other)],
      ];
      parts.push(formatDiscordTable('Cargo One-Time Haul - Ships', ['Ship', 'Count', 'Metal Cap', 'Mineral Cap', 'Other Cap'], shipRows));
      parts.push(formatDiscordTable('Cargo One-Time Haul - Summary', ['Metric', 'Value'], summaryRows));
    }

    const roundTripRows = freighterRoundTrip.rows.map((row) => [
      row.label,
      formatHumanNumber(row.perTick),
      ...row.freighters.map((count) => count),
    ]);
    parts.push(formatDiscordTable('Freighter Round Trip Planning', ['Resource', 'Per Tick', ...freighterRoundTrip.tripOneTimes.map((turns) => `${turns}t out`)], roundTripRows));
    parts.push(formatDiscordTable('Round Trip Totals', ['Metric', ...freighterRoundTrip.tripOneTimes.map((turns) => `${turns}t out`)], [['Freighters', ...freighterRoundTrip.totals]]));

    return wrapDiscordExport(parts);
  }, [cargoPlan, defs.cargoShips, freighterRoundTrip, parsed.resourcesStored, totalOtherStored]);

  const fleetScoreDiscordExport = useMemo(() => {
    const rows = fleetScore.entries.map((entry) => [
      entry.name,
      entry.count,
      formatHumanNumber(entry.totalScoreValue),
      entry.totalDisplayedScore.toFixed(2),
      entry.scorePerWeightedK.toFixed(2),
    ]);
    const summaryRows = [
      ['Raw score points', formatHumanNumber(fleetScore.totalScoreValue)],
      ['Displayed score', fleetScore.totalDisplayedScore.toFixed(2)],
      ['Weighted cost', formatHumanNumber(fleetScore.weightedCost)],
      ['Score / weighted 1k', fleetScore.scorePerWeightedK.toFixed(2)],
    ];

    return wrapDiscordExport([
      formatDiscordTable('Fleet Score and Cost Ratios', ['Ship', 'Count', 'Score Pts', 'Display', 'Score/W1k'], rows),
      formatDiscordTable('Fleet Score Summary', ['Metric', 'Value'], summaryRows),
    ]);
  }, [fleetScore]);

  const fleetBalanceDiscordExport = useMemo(() => {
    const rows = Object.keys(fleetBalance.targetWeights).map((id) => [
      defs.shipsById[id]?.name || idLabel(id),
      fleetBalance.targetWeights[id],
      parsedFleet[id] || 0,
      fleetBalance.additions[id] || 0,
      fleetBalance.resulting[id] || 0,
    ]);

    return wrapDiscordExport([
      formatDiscordTable('Fleet Ratio Balancer', ['Ship', 'Ratio', 'Current', 'Add', 'Result'], rows),
    ]);
  }, [defs.shipsById, fleetBalance, parsedFleet]);

  const buildDiscordExport = useMemo(() => {
    const rows = buildFormula.groups.map((group) => [
      group.buildingName,
      group.count,
      group.spaceType,
      formatHumanNumber(group.scoreDelta),
      formatHumanNumber(group.outputDelta.metal),
      formatHumanNumber(group.outputDelta.mineral),
      formatHumanNumber(group.outputDelta.food),
      formatHumanNumber(group.outputDelta.energy),
    ]);
    const summaryRows = [
      ['Added score', formatHumanNumber(buildFormula.totalScoreDelta)],
      ['Ground used', buildFormula.groundSpaceUsed],
      ['Orbital used', buildFormula.orbitalSpaceUsed],
      ['Workers used', formatHumanNumber(buildFormula.workersUsed)],
      ['Ground remaining', buildFormula.groundSpaceRemaining],
      ['Orbital remaining', buildFormula.orbitalSpaceRemaining],
      ['Workers remaining', formatHumanNumber(buildFormula.workersRemaining)],
      ['Ground rule', buildFormula.groundReason],
      ['Orbital T3 rule', buildFormula.orbitalT3Reason],
      ['Orbital T2 rule', buildFormula.orbitalT2Reason],
    ];

    return wrapDiscordExport([
      formatDiscordTable('Build Optimizer - Resource Production', ['Build', 'Count', 'Space', 'Score', 'Metal', 'Mineral', 'Food', 'Energy'], rows),
      formatDiscordTable('Build Optimizer Summary', ['Metric', 'Value'], summaryRows),
    ]);
  }, [buildFormula]);

  const budgetFleetDiscordExport = useMemo(() => {
    const rows = Object.entries(budgetFleet.composition).map(([id, count]) => [
      defs.shipsById[id]?.name || idLabel(id),
      count,
    ]);
    const summaryRows = [
      ['Projection ticks', Math.max(0, Math.floor(projectionTicks))],
      ['Multiplier', budgetFleet.multiplier],
      ['Metal used', formatHumanNumber(budgetFleet.used.metal)],
      ['Mineral used', formatHumanNumber(budgetFleet.used.mineral)],
      ['Food used', formatHumanNumber(budgetFleet.used.food)],
      ['Energy used', formatHumanNumber(budgetFleet.used.energy)],
      ['Metal leftover', formatHumanNumber(budgetFleet.leftover.metal)],
      ['Mineral leftover', formatHumanNumber(budgetFleet.leftover.mineral)],
      ['Food leftover', formatHumanNumber(budgetFleet.leftover.food)],
      ['Energy leftover', formatHumanNumber(budgetFleet.leftover.energy)],
    ];

    return wrapDiscordExport([
      formatDiscordTable('Fleet from Budget / Outputs', ['Ship', 'Build Count'], rows),
      formatDiscordTable('Fleet Budget Summary', ['Metric', 'Value'], summaryRows),
    ]);
  }, [budgetFleet, defs.shipsById, projectionTicks]);

  const warshipDiscordExport = useMemo(() => {
    if (!warshipOptimizer) {
      return '';
    }

    const formatWarshipResult = (title: string, result: WarshipBudgetResult): string => {
      const rows = result.fleet.map((entry) => [
        entry.name,
        formatHumanNumber(entry.count),
        formatHumanNumber(entry.scoreContrib),
      ]);
      const summaryRows = [
        ['Total score', formatHumanNumber(result.totalScore)],
        ['Used metal', formatHumanNumber(result.usedMetal)],
        ['Used mineral', formatHumanNumber(result.usedMineral)],
        ['Leftover metal', formatHumanNumber(result.leftoverMetal)],
        ['Leftover mineral', formatHumanNumber(result.leftoverMineral)],
        ['Leftover weighted', formatHumanNumber(result.leftoverWeighted)],
      ];

      return [
        formatDiscordTable(title, ['Ship', 'Count', 'Score'], rows),
        formatDiscordTable(`${title} Summary`, ['Metric', 'Value'], summaryRows),
      ].join('\n\n');
    };

    return wrapDiscordExport([
      formatWarshipResult('Warship Budget - Highest Score', warshipOptimizer.highestScore),
      formatWarshipResult('Warship Budget - Least Leftover', warshipOptimizer.leastLeftover),
    ]);
  }, [warshipOptimizer]);

  const handleAddFleetOverviewBudget = (metal: number, mineral: number) => {
    const nextMetal = parseHumanNumber(warshipMetal) + metal;
    const nextMineral = parseHumanNumber(warshipMineral) + mineral;
    setWarshipMetal(formatHumanNumber(nextMetal));
    setWarshipMineral(formatHumanNumber(nextMineral));
  };

  // ── Scroll spy state ──────────────────────────────────────────────────────
  const [activeGroup, setActiveGroup] = useState<string>('planet');
  const [activeSection, setActiveSection] = useState<string>('snapshot');

  useEffect(() => {
    const allIds = TOOL_GROUPS.flatMap((g) => g.tools.map((t) => t.id));
    const els = allIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
          const grp = TOOL_GROUPS.find((g) => g.tools.some((t) => t.id === entry.target.id));
          if (grp) setActiveGroup(grp.id);
        }
      }
    }, { threshold: 0.15, rootMargin: '-100px 0px -60% 0px' });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: 'var(--bg)', color: 'var(--t1)', fontFamily: 'var(--font)' }}>
      {/* Background gradient */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(160deg, rgba(8,13,26,0.98), #070a12)' }} />
      <div style={{ position: 'relative', zIndex: 2 }}>

        {/* ── Sticky Header ──────────────────────────────────────────── */}
        <header style={{ position: 'sticky', top: 0, zIndex: 50, padding: '11px 28px', background: 'rgba(7,10,18,0.97)', borderBottom: '1px solid var(--br)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--cyan)', opacity: 0.72, marginBottom: 2 }}>Infinite Conflict</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15 }}>Calculator Companion</div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <StatChip label="Planet" value={parsed.planetName || '—'} dim={!parsed.planetName} />
            <StatChip label="Fleet scan" value={`${fleetScan.entries.length} fleets`} dim={fleetScan.entries.length === 0} />
            <StatChip label="Asset score" value={parsed.assetScore ? formatHumanNumber(parsed.assetScore) : 'n/a'} dim={!parsed.assetScore} />
          </div>
        </header>

        {/* ── Sticky Two-Layer Nav ────────────────────────────────────── */}
        <nav style={{ position: 'sticky', top: 54, zIndex: 40, background: 'rgba(7,10,18,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--br)' }}>
          {/* Group tabs */}
          <div style={{ display: 'flex', padding: '0 28px', borderBottom: '1px solid var(--br)' }}>
            {TOOL_GROUPS.map((grp) => (
              <button key={grp.id} onClick={() => { setActiveGroup(grp.id); scrollTo(grp.tools[0].id); }}
                style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: activeGroup === grp.id ? 'var(--cyan)' : 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `2px solid ${activeGroup === grp.id ? 'var(--cyan)' : 'transparent'}`, marginBottom: -1, whiteSpace: 'nowrap', transition: 'color 0.15s, border-color 0.15s' }}
              >{grp.label}</button>
            ))}
          </div>
          {/* Tool pills */}
          <div style={{ display: 'flex', gap: 5, padding: '5px 28px 6px', overflowX: 'auto' }}>
            {TOOL_GROUPS.find((g) => g.id === activeGroup)?.tools.map((tool) => (
              <button key={tool.id} onClick={() => scrollTo(tool.id)}
                style={{ padding: '2px 12px', fontSize: 12, fontWeight: 500, color: activeSection === tool.id ? 'var(--t1)' : 'var(--t3)', background: activeSection === tool.id ? 'var(--cyan-dim)' : 'rgba(0,0,0,0.2)', border: `1px solid ${activeSection === tool.id ? 'var(--cyan-border)' : 'var(--br)'}`, borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s' }}
              >{tool.label}</button>
            ))}
          </div>
        </nav>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 28px 80px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* PLANET GROUP */}
          <GroupDivider label="🌍 Planet Tools" />

          {/* 01 Snapshot */}
          <ToolCard id="snapshot" badge="01" icon="🪐" title="Snapshot">
            {!parsed.planetName && rawInput === DEFAULT_INPUT && (
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.14)', fontSize: 12, color: 'var(--cyan)' }}>
                ↑ Start here — paste a planet block to power all Planet tools
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: parsed.planetName ? '1fr 1.3fr' : '1fr', gap: 14 }}>
              <div>
                <SectionLabel text="Paste Input" />
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  className="c-paste"
                  style={{ height: parsed.planetName ? 130 : 200 }}
                  spellCheck={false}
                />
                <div className="mt-1 text-[11px]" style={{ color: 'var(--t3)' }}>Parser supports Discord ANSI blocks and Ctrl+A planet view paste.</div>
              </div>
              {parsed.planetName && (
                <div className="c-anim-in">
                  {/* Resource rows */}
                  {(['stored', 'output', 'abundance'] as const).map((section) => {
                    const valMap = section === 'stored' ? parsed.resourcesStored : section === 'output' ? parsed.resourcesOutput : parsed.abundance;
                    const labels: Record<string, string> = { stored: 'Stored', output: 'Output / Tick', abundance: 'Abundance %' };
                    return (
                      <div key={section} style={{ marginBottom: 8 }}>
                        <SectionLabel text={labels[section]} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
                          {(['metal','mineral','food','energy'] as const).map((r) => (
                            <div key={r} style={{ background: 'var(--bg-inner)', border: '1px solid var(--br)', borderRadius: 6, padding: '7px 9px' }}>
                              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t3)', marginBottom: 3 }}>{r}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', color: r === 'metal' ? 'var(--r-metal)' : r === 'mineral' ? 'var(--r-mineral)' : r === 'food' ? 'var(--r-food)' : 'var(--r-energy)' }}>
                                {formatHumanNumber(valMap[r])}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, background: 'var(--bg-inner)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 11px', fontSize: 12 }}>
                    {[
                      ['Planet', parsed.planetName || 'Unknown'],
                      ['Asset Score', parsed.assetScore ? formatHumanNumber(parsed.assetScore) : 'n/a'],
                      ['Workers Free', parsed.workersFree !== undefined ? formatHumanNumber(parsed.workersFree) : 'n/a'],
                      ['Ground Free', parsed.groundSpaceFree !== undefined ? String(parsed.groundSpaceFree) : 'n/a'],
                      ['Orbital Free', parsed.orbitalSpaceFree !== undefined ? String(parsed.orbitalSpaceFree) : 'n/a'],
                      ['Structures', Object.keys(parsed.structures).length],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <div style={{ color: 'var(--t3)', fontSize: 10, marginBottom: 2 }}>{k}</div>
                        <div style={{ fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {parsed.warnings.length > 0 && (
              <div className="mt-3 rounded-lg p-3 text-xs" style={{ border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>
                {parsed.warnings.map((w) => <div key={w}>• {w}</div>)}
              </div>
            )}
          </ToolCard>

          {/* 02 + 06 row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="c-grid-2">

            {/* 02 Cargo */}
            <ToolCard id="cargo" badge="02" icon="🚢" title="Cargo Planning" exportText={cargoDiscordExport} emptyExport="Paste a snapshot first">
              {!cargoPlan && freighterRoundTrip.rows.every((r) => r.perTick === 0)
                ? <EmptyState msg="Awaiting snapshot data" sub="Paste a planet block in Snapshot above" />
                : (
                  <div className="c-anim-in">
                    {cargoPlan && (
                      <>
                        <SectionLabel text="One-time haul" />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
                          {defs.cargoShips.map((ship) => (
                            <div key={ship.id} style={{ background: 'var(--bg-inner)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px' }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cyan)', marginBottom: 2 }}>{ship.name}</div>
                              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', lineHeight: 1.1 }}>{cargoPlan.shipCounts[ship.id] || 0}</div>
                              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{formatHumanNumber(ship.metalCap)} metal cap</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 11 }}>
                          {[
                            ['Ships', cargoPlan.totals.ships],
                            ['Metal overflow', formatHumanNumber(cargoPlan.overflow.metal)],
                            ['Mineral overflow', formatHumanNumber(cargoPlan.overflow.mineral)],
                          ].map(([l, v]) => (
                            <div key={l as string} style={{ background: 'var(--bg-inner)', border: '1px solid var(--br)', borderRadius: 6, padding: '5px 10px' }}>
                              <span style={{ color: 'var(--t3)' }}>{l}: </span><span style={{ fontWeight: 600 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {!freighterRoundTrip.rows.every((r) => r.perTick === 0) && (
                      <>
                        <SectionLabel text="Freighter round-trip" />
                        <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
                          <table className="c-table">
                            <thead><tr>
                              <th style={{ textAlign: 'left' }}>Resource</th>
                              <th>Per Tick</th>
                              {freighterRoundTrip.tripOneTimes.map((t) => <th key={t}>{t}t route</th>)}
                            </tr></thead>
                            <tbody>
                              {freighterRoundTrip.rows.map((row) => (
                                <tr key={row.resource}>
                                  <td>{row.label}</td>
                                  <td>{row.perTick > 0 ? formatHumanNumber(row.perTick) : '—'}</td>
                                  {row.freighters.map((n, i) => <td key={i}>{row.perTick > 0 ? n : '—'}</td>)}
                                </tr>
                              ))}
                            </tbody>
                            <tfoot><tr>
                              <td colSpan={2} style={{ color: 'var(--cyan)' }}>Min to clear all</td>
                              {freighterRoundTrip.totals.map((n, i) => <td key={i}>{n}</td>)}
                            </tr></tfoot>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )
              }
            </ToolCard>

            {/* 06 Fleet Score */}
            <ToolCard id="fleet-score" badge="06" icon="⭐" title="Fleet Score & Cost" exportText={fleetScoreDiscordExport} emptyExport="Enter fleet counts first">
              {(() => {
                const columns = [
                  ['fighter','bomber','frigate'],
                  ['destroyer','cruiser','battleship'],
                  ['freighter','merchant','trader','invasion_ship'],
                ];
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '3px 16px', marginBottom: 12 }}>
                    {columns.map((ids, ci) => (
                      <div key={ci} className="flex flex-col gap-1">
                        {ids.map((id) => {
                          const ship = defs.shipsById[id];
                          if (!ship) return null;
                          return (
                            <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{ship.name}</span>
                              <input type="number" min="0" className="c-num-input" value={fleetCounts[id] ?? ''} onChange={(e) => setFleetCounts((p) => ({ ...p, [id]: e.target.value }))} />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
              {fleetScore.entries.length > 0 && (
                <div className="c-anim-in">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 10 }}>
                    {[
                      ['Raw Score Pts', formatHumanNumber(fleetScore.totalScoreValue), 'var(--t1)'],
                      ['Displayed Score', fleetScore.totalDisplayedScore.toFixed(2), 'var(--cyan)'],
                      ['Weighted Cost', formatHumanNumber(fleetScore.weightedCost), 'var(--t2)'],
                      ['Score / W1k', fleetScore.scorePerWeightedK.toFixed(2), 'var(--amber)'],
                    ].map(([l, v, c]) => (
                      <div key={l as string} style={{ background: 'var(--bg-inner)', border: '1px solid var(--br)', borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: c as string }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
                    <table className="c-table">
                      <thead><tr><th style={{ textAlign: 'left' }}>Ship</th><th>Count</th><th>Score Pts</th><th>Score/W1k</th></tr></thead>
                      <tbody>
                        {fleetScore.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.name}</td>
                            <td>{entry.count}</td>
                            <td>{formatHumanNumber(entry.totalScoreValue)}</td>
                            <td>{entry.scorePerWeightedK.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ToolCard>
          </div>

          {/* 03 + 04 + 05 row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }} className="c-grid-3">

            {/* 03 Ratio Balancer */}
            <ToolCard id="ratio" badge="03" icon="⚖️" title="Fleet Ratio Balancer" exportText={fleetBalanceDiscordExport}>
              <SectionLabel text="Target Ratio" />
              <textarea className="c-paste" value={ratioInput} onChange={(e) => setRatioInput(e.target.value)} style={{ height: 72, marginBottom: 10 }} spellCheck={false} />
              <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
                <table className="c-table">
                  <thead><tr><th style={{ textAlign: 'left' }}>Ship</th><th>Ratio</th><th>Current</th><th>Add</th><th>Result</th></tr></thead>
                  <tbody>
                    {Object.keys(fleetBalance.targetWeights).map((id) => (
                      <tr key={id}>
                        <td>{defs.shipsById[id]?.name || idLabel(id)}</td>
                        <td>{fleetBalance.targetWeights[id]}</td>
                        <td>{parsedFleet[id] || 0}</td>
                        <td style={{ color: (fleetBalance.additions[id] || 0) > 0 ? 'var(--cyan)' : undefined }}>{fleetBalance.additions[id] || 0}</td>
                        <td>{fleetBalance.resulting[id] || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ToolCard>

            {/* 04 Build Optimizer */}
            <ToolCard id="builds" badge="04" icon="🏗️" title="Build Optimizer" exportText={buildDiscordExport} emptyExport="Paste a snapshot first">
              {buildFormula.groups.length === 0
                ? <EmptyState msg="Awaiting snapshot data" sub="Reads free space and workers from snapshot" />
                : (
                  <div className="c-anim-in">
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span className="c-tag cyan">{buildFormula.groundReason}</span>
                      {buildFormula.groups.some((g) => g.spaceType === 'orbital') && (
                        <span className="c-tag purple">Orbital: {buildFormula.orbitalT3Reason.split('→')[1]?.trim() || buildFormula.orbitalT3Reason}</span>
                      )}
                    </div>
                    <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
                      <table className="c-table">
                        <thead><tr><th style={{ textAlign: 'left' }}>Building</th><th>Count</th><th>Score Δ</th><th>Space</th></tr></thead>
                        <tbody>
                          {buildFormula.groups.map((g) => (
                            <tr key={g.buildingId}>
                              <td>{g.buildingName}</td>
                              <td>{g.count}</td>
                              <td style={{ color: 'var(--amber)' }}>+{formatHumanNumber(g.scoreDelta)}</td>
                              <td style={{ color: 'var(--t3)' }}>{g.spaceCost}{g.spaceType === 'ground' ? 'G' : 'O'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr>
                          <td>Total</td>
                          <td>{buildFormula.groups.reduce((s, g) => s + g.count, 0)}</td>
                          <td style={{ color: 'var(--amber)' }}>+{formatHumanNumber(buildFormula.totalScoreDelta)}</td>
                          <td style={{ color: 'var(--t3)' }}>{buildFormula.groundSpaceUsed}G {buildFormula.orbitalSpaceUsed}O</td>
                        </tr></tfoot>
                      </table>
                    </div>
                  </div>
                )
              }
            </ToolCard>

            {/* 05 Budget */}
            <ToolCard id="budget" badge="05" icon="💰" title="Fleet from Budget" exportText={budgetFleetDiscordExport} emptyExport="Paste a snapshot first">
              {!parsed.planetName
                ? <EmptyState msg="Awaiting snapshot data" sub="Projects resources over time to find max fleet" />
                : (
                  <div className="c-anim-in">
                    <SectionLabel text={`Projection: ${Math.max(0, Math.floor(projectionTicks))} ticks`} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <input type="range" min={0} max={5000} value={projectionTicks} onChange={(e) => setProjectionTicks(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--cyan)' }} />
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--cyan)', minWidth: 32 }}>{projectionTicks}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 5, marginBottom: 10 }}>
                      {[['Metal', availableNow.metal], ['Mineral', availableNow.mineral], ['Food', availableNow.food], ['Energy', availableNow.energy]].map(([l, v]) => (
                        <div key={l as string} style={{ background: 'var(--bg-inner)', border: '1px solid var(--br)', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}>
                          <span style={{ color: 'var(--t3)' }}>{l}: </span><span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{formatHumanNumber(v as number)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
                      <table className="c-table">
                        <thead><tr><th style={{ textAlign: 'left' }}>Ship</th><th>Build Count</th></tr></thead>
                        <tbody>
                          {Object.entries(budgetFleet.composition).map(([id, count]) => (
                            <tr key={id}><td>{defs.shipsById[id]?.name || idLabel(id)}</td><td>{count}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              }
            </ToolCard>
          </div>

          {/* WARSHIP GROUP */}
          <GroupDivider label="⚔️ Warship Budget" />

          {/* 07 Warship */}
          <ToolCard id="warships" badge="07" icon="⚔️" title="Warship Budget Optimizer" exportText={warshipDiscordExport} emptyExport="Enter a budget first">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {([['Metal', warshipMetal, setWarshipMetal], ['Mineral', warshipMineral, setWarshipMineral]] as const).map(([lbl, val, set]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 5 }}>{lbl} Budget</div>
                  <input type="text" value={val} onChange={(e) => set(e.target.value)} placeholder="e.g. 5M"
                    className="c-paste" style={{ height: 'auto', padding: '8px 12px', fontSize: 14, fontFamily: 'var(--mono)', resize: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>Available ships</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {WARSHIP_IDS.map((id) => {
                  const on = warshipAllowed[id] !== false;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setWarshipAllowed((prev) => ({ ...prev, [id]: !on }))}
                      style={{
                        padding: '3px 10px', fontSize: 12, borderRadius: 20, cursor: 'pointer', fontWeight: on ? 600 : 400,
                        color: on ? 'var(--t1)' : 'var(--t3)',
                        background: on ? 'var(--cyan-dim)' : 'rgba(0,0,0,0.2)',
                        border: `1px solid ${on ? 'var(--cyan-border)' : 'var(--br)'}`,
                        transition: 'all 0.12s',
                        opacity: on ? 1 : 0.5,
                      }}
                    >
                      {defs.shipsById[id]?.name ?? id}
                    </button>
                  );
                })}
              </div>
            </div>
            {!warshipOptimizer
              ? <EmptyState icon="⚔️" msg="Enter a metal and mineral budget" sub="Select ships above, then enter a budget" />
              : (
                <div className="c-anim-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <WarshipResultPanel label="🏆 Highest Score" result={warshipOptimizer.highestScore} accent="text-amber-300" border="border-amber-400/30" />
                  <WarshipResultPanel label="📦 Least Leftover" result={warshipOptimizer.leastLeftover} accent="text-cyan-300" border="border-cyan-400/30" />
                </div>
              )
            }
          </ToolCard>

          {/* INTELLIGENCE GROUP */}
          <GroupDivider label="⚡ Intelligence" />

          {/* 09 Fleet Scan + 10 Combat row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="c-grid-2">

            {/* 09 Fleet Scan */}
            <ToolCard id="fleet-scan" badge="09" icon="📡" title="Fleet Scan Summary" exportText={fleetScanDiscordExport} emptyExport="Paste fleet scan page first">
              <PasteInput value={fleetScanInput} onChange={(v) => setFleetScanInput(v)} placeholder="Paste Fleet Scan Result page" hint="Ctrl+A from the Fleet Scan page in game" height={120} />
              {fleetScan.warnings.length > 0 && (
                <div className="mt-3 p-3 rounded-lg text-xs" style={{ border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>
                  {fleetScan.warnings.map((w) => <div key={w}>• {w}</div>)}
                </div>
              )}
              {fleetScan.entries.length > 0 && (
                <div className="c-anim-in mt-3">
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[
                      [String(fleetScan.entries.length), 'fleets'],
                      [String(fleetScan.byPlayer.length), 'players'],
                      [String(fleetScan.byAlliance.length), 'alliances'],
                      [formatHumanNumber(fleetScan.byAlliance.reduce((s, r) => s + r.totalScoreValue, 0)), 'total score'],
                    ].map(([v, l]) => (
                      <div key={l} className="c-chip" style={{ borderColor: 'var(--cyan-border)', gap: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{v}</span>
                        <span style={{ color: 'var(--t3)', fontSize: 11 }}>{l}</span>
                      </div>
                    ))}
                  </div>
                  {fleetScan.etaTables.length > 0 && (
                    <>
                      {fleetScan.etaTables.map((table: FleetScanEtaTable) => (
                        <div key={table.alliance} style={{ marginBottom: 12 }}>
                          <SectionLabel text={`ETA — ${table.alliance}`} />
                          <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'auto' }}>
                            <table className="c-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>ETA</th>
                                  {table.shipIds.map((id) => (
                                    <th key={id}>{defs.shipsById[id]?.name ?? id}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {table.rows.map((row, i) => (
                                  <tr key={i}>
                                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)', fontWeight: 600 }}>
                                      {row.etaTurns !== null ? `${row.etaTurns}t` : 'Wait'}
                                    </td>
                                    {table.shipIds.map((id) => (
                                      <td key={id}>{row.units[id] ? formatHumanNumber(row.units[id]) : '—'}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td style={{ color: 'var(--cyan)', fontWeight: 700 }}>Total</td>
                                  {table.shipIds.map((id) => (
                                    <td key={id} style={{ fontWeight: 700 }}>{formatHumanNumber(table.totals[id] || 0)}</td>
                                  ))}
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  <SectionLabel text="By Alliance" />
                  <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden', marginBottom: 10 }}>
                    <table className="c-table">
                      <thead><tr>
                        <th style={{ textAlign: 'left' }}>Alliance</th>
                        <th>Fleets</th>
                        {fleetScanShipIds.map((id) => <th key={id}>{defs.shipsById[id]?.name || idLabel(id)}</th>)}
                        <th>Score</th>
                      </tr></thead>
                      <tbody>
                        {fleetScan.byAlliance.map((row) => (
                          <tr key={row.label}>
                            <td style={{ fontWeight: 600 }}>{row.label}</td>
                            <td>{row.fleets}</td>
                            {fleetScanShipIds.map((id) => <td key={id}>{row.units[id] ? formatHumanNumber(row.units[id]) : '—'}</td>)}
                            <td>{formatHumanNumber(row.totalScoreValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <SectionLabel text="By Player" />
                  <div style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
                    <table className="c-table">
                      <thead><tr>
                        <th style={{ textAlign: 'left' }}>Player</th>
                        <th style={{ textAlign: 'left' }}>Alliance</th>
                        <th>Fleets</th>
                        {fleetScanShipIds.map((id) => <th key={id}>{defs.shipsById[id]?.name || idLabel(id)}</th>)}
                        <th>Score</th>
                      </tr></thead>
                      <tbody>
                        {fleetScan.byPlayer.map((row) => (
                          <tr key={row.label}>
                            <td style={{ fontWeight: 500 }}>{row.label}</td>
                            <td style={{ color: 'var(--t3)', fontSize: 11 }}>{row.alliances?.join(', ') || '—'}</td>
                            <td>{row.fleets}</td>
                            {fleetScanShipIds.map((id) => <td key={id}>{row.units[id] ? formatHumanNumber(row.units[id]) : '—'}</td>)}
                            <td>{formatHumanNumber(row.totalScoreValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ToolCard>

            {/* 10 Combat */}
            <ToolCard id="combat-scan" badge="10" icon="💥" title="Combat Scan Analyzer" exportText={combatScanDiscordExport} emptyExport="Paste combat report first">
              <PasteInput value={combatScanInput} onChange={(v) => { setCombatScanInput(v); }} placeholder="Paste Combat Report page (Ctrl+A from the game)" hint="Handles native Fleet Details format and manual Attacker/Defender format" height={120} />
              {combatScan.warnings.length > 0 && (
                <div className="mt-3 p-3 rounded-lg text-xs" style={{ border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>
                  {combatScan.warnings.map((w) => <div key={w}>• {w}</div>)}
                </div>
              )}
              {combatScan.fleets.length > 0 && (
                <div className="c-anim-in mt-3">
                  <CombatOutput combatScan={combatScan} shipsById={defs.shipsById} />
                </div>
              )}
            </ToolCard>
          </div>

          {/* 08 Fleet ETA + 11 Radar row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="c-grid-2">

            {/* 08 Fleet ETA / Fleet Overview */}
            <ToolCard id="fleet-overview" badge="08" icon="🚀" title="Fleet Cargo ETA" exportText={fleetOverviewDiscordExport} emptyExport="Paste fleet page first">
              <div className="mb-2 text-xs" style={{ color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)', borderRadius: 6, padding: '6px 10px' }}>
                <strong>Tip:</strong> For accurate soldier/worker columns, select the fleet table in-browser then paste — don&apos;t use Ctrl+A.
              </div>
              <PasteInput value={fleetOverviewInput} onChange={(v) => { setFleetOverviewInput(v); }} placeholder="Paste the Fleets page table" hint="Use tab-copy for accurate soldier/worker columns" height={120} />
              {fleetOverview.warnings.length > 0 && (
                <div className="mt-3 p-3 rounded-lg text-xs" style={{ border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>
                  {fleetOverview.warnings.map((w) => <div key={w}>• {w}</div>)}
                </div>
              )}
              {fleetOverview.destinations.length > 0 && (
                <div className="c-anim-in mt-3 flex flex-col gap-3">
                  {fleetOverview.destinations.map((destination) => (
                    <div key={`${destination.destinationCoords}-${destination.destinationName}`} style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden', background: 'var(--bg-inner)' }}>
                      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>→ {destination.destinationName || 'Unknown'}</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>{destination.destinationCoords || ''}</span>
                        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>{destination.fleets} fleets · click row to add to Warship Budget</span>
                      </div>
                      <table className="c-table">
                        <thead><tr>
                          <th style={{ textAlign: 'left' }}>ETA</th>
                          <th>Arr.</th>
                          {FLEET_CARGO_ORDER.map((id) => <th key={id}>{cargoLabel(id)}</th>)}
                        </tr></thead>
                        <tbody>
                          {destination.rows.map((row) => (
                            <tr key={row.etaTurns} style={{ cursor: 'pointer' }} onClick={() => handleAddFleetOverviewBudget(row.cumulative.metal, row.cumulative.mineral)} title="Add cumulative metal/mineral to Warship Budget">
                              <td style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>{row.etaTurns}t</td>
                              <td>{row.arrivingFleets}</td>
                              {FLEET_CARGO_ORDER.map((id) => <td key={id}>{row.cumulative[id] > 0 ? formatHumanNumber(row.cumulative[id]) : '—'}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </ToolCard>

            {/* 11 Radar */}
            <ToolCard id="radar" badge="11" icon="🌐" title="Radar — Incoming Fleets by System">
              <PasteInput value={radarInput} onChange={(v) => { setRadarInput(v); }} placeholder="Paste Radar page" hint="Ctrl+A from the Radar page in game" height={120} />
              {radarResult.warnings.length > 0 && (
                <div className="mt-3 p-3 rounded-lg text-xs" style={{ border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>
                  {radarResult.warnings.map((w) => <div key={w}>• {w}</div>)}
                </div>
              )}
              {radarResult.systems.length > 0 && (
                <div className="c-anim-in mt-3 flex flex-col gap-3">
                  {radarResult.systems.map((sys) => {
                    const discord = formatRadarSystemAsDiscord(sys);
                    const sorted = [...sys.fleets].sort((a, b) => a.eta - b.eta || b.score - a.score);
                    return (
                      <div key={sys.destCoords || sys.systemId} style={{ borderRadius: 7, border: '1px solid var(--br)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: 'var(--bg-inner)', borderBottom: '1px solid var(--br)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{sys.destName || sys.systemId}</span>
                            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>{sys.destCoords}</span>
                            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{sys.fleets.length} fleet{sys.fleets.length !== 1 ? 's' : ''}</span>
                          </div>
                          <DiscordBtn exportText={discord} emptyText="No data" />
                        </div>
                        <table className="c-table">
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'right' }}>ETA</th>
                              <th style={{ textAlign: 'left' }}>Fleet</th>
                              <th style={{ textAlign: 'left' }}>Player</th>
                              <th style={{ textAlign: 'left' }}>Alliance</th>
                              <th style={{ textAlign: 'right' }}>Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((f, i) => (
                              <tr key={i}>
                                <td style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)', fontWeight: 600, textAlign: 'right' }}>{f.eta}t</td>
                                <td style={{ color: 'var(--t2)' }}>{f.fleetName || '—'}</td>
                                <td style={{ fontWeight: 500 }}>{f.player}</td>
                                <td style={{ color: 'var(--t3)', fontSize: 11 }}>{f.alliance}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatHumanNumber(f.score)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </ToolCard>
          </div>

        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{ textAlign: 'center', padding: '16px 28px', fontSize: 11, color: 'var(--t3)', borderTop: '1px solid var(--br)', letterSpacing: '0.05em' }}>
          Infinite Conflict Calculator Companion · v{pkg.version}
        </footer>
      </div>
    </main>
  );
}
