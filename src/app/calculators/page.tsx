"use client";

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Calculator,
  CheckCircle2,
  Clipboard,
  Crosshair,
  Database,
  Factory,
  FileText,
  Radar,
  Route,
  Ship,
  Swords,
  Target,
  Wallet,
} from 'lucide-react';
import gameDataRaw from '../../lib/game/game_data.json';
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
  formulaBuildRecommendation,
  formatHumanNumber,
  optimizeWarships,
  parseCombatScanInput,
  parseFleetScanInput,
  parseFleetOverviewInput,
  parseHumanNumber,
  parseRatioInput,
  parseSnapshotInput,
  projectAvailableResources,
  type CombatScanParseResult,
  type CombatSideSummary,
  type CombatPlayerSummary,
  type FleetScanParseResult,
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

const TOOL_NAV = [
  { href: '#snapshot', label: 'Snapshot', icon: Database },
  { href: '#cargo', label: 'Cargo', icon: Ship },
  { href: '#fleet-score', label: 'Fleet Score', icon: Activity },
  { href: '#ratio', label: 'Ratios', icon: Target },
  { href: '#builds', label: 'Builds', icon: Factory },
  { href: '#budget', label: 'Budget', icon: Wallet },
  { href: '#warships', label: 'Warships', icon: Crosshair },
  { href: '#fleet-overview', label: 'Fleet Cargo', icon: Route },
  { href: '#fleet-scan', label: 'Fleet Scan', icon: Radar },
  { href: '#combat-scan', label: 'Combat', icon: Swords },
];

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

const DEFAULT_FLEET_SCAN_INPUT = `Paste a full Fleet Scan block here.

Expected shape:
Fleet Name
Player Name (Alliance Name)
Arriving in 22 turns
235 x Fighter
98 x Bomber
18 x Frigate`;

const DEFAULT_FLEET_OVERVIEW_INPUT = `Paste the Fleets page table here.

IMPORTANT — use tab copy for accurate soldiers/workers:
Select just the fleet table rows (not Ctrl+A the whole page), then paste.
Tab-preserved copy keeps column positions so soldiers land in the right column.

Tab format (10 columns):
Name\tStatus\tRoute\tMetal\tMineral\tFood\tEnergy\tWorker\tSoldier\tETA`;

const DEFAULT_COMBAT_SCAN_INPUT = `Paste a combat/battle report here.

Expected format:
Attacker
PlayerA (AllianceA)
250 x Fighter
50 x Bomber
10 x Destroyer

Defender
PlayerB (AllianceB)
180 x Fighter
30 x Cruiser
5 x Battleship`;


function idLabel(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ResourceRow({ title, values }: { title: string; values: Record<ResourceId, number> }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0d1422]/80 p-3 shadow-sm shadow-black/20">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {RESOURCE_ORDER.map((resource) => (
          <div key={resource} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{resource}</div>
            <div className="text-sm font-semibold text-slate-100">{formatHumanNumber(values[resource])}</div>
          </div>
        ))}
      </div>
    </div>
  );
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

function TableCard({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-white/10 bg-[#0b1020]/90 p-4 shadow-xl shadow-black/25 backdrop-blur">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">{title}</h3>
      {children}
    </section>
  );
}

function ToolNav({ parsed, fleetScan }: { parsed: ParsedSnapshot; fleetScan: FleetScanParseResult }) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-5 rounded-lg border border-white/10 bg-[#0b1020]/90 p-3 shadow-xl shadow-black/25 backdrop-blur">
        <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
          <Calculator className="h-4 w-4 text-cyan-200" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">Tools</div>
            <div className="text-[11px] text-slate-500">{parsed.planetName || 'No planet parsed'}</div>
          </div>
        </div>

        <nav className="space-y-1">
          {TOOL_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="mt-4 grid gap-2 border-t border-white/10 pt-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Structures</span>
            <span className="font-semibold text-slate-100">{Object.keys(parsed.structures).length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Scan fleets</span>
            <span className="font-semibold text-slate-100">{fleetScan.entries.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Scan players</span>
            <span className="font-semibold text-slate-100">{fleetScan.byPlayer.length}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DiscordExportPanel({
  exportText,
  title,
  emptyText,
  status,
  onCopy,
}: {
  exportText: string;
  title: string;
  emptyText: string;
  status: string;
  onCopy: () => void;
}) {
  const hasExport = exportText.length > 0;
  const copied = status === 'Discord export copied.';
  const Icon = copied ? CheckCircle2 : Clipboard;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-cyan-300/20 bg-slate-950/55">
      <div className="flex flex-col gap-3 border-b border-white/10 bg-black/20 p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">{title}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {hasExport ? `${exportText.length} characters` : 'No parsed scan yet'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <div role="status" aria-live="polite" className="text-xs text-slate-400">
              {status}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-400/15 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasExport}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            Copy
          </button>
        </div>
      </div>

      <pre className="max-h-44 min-h-24 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-slate-100">
        {hasExport ? exportText : emptyText}
      </pre>
    </div>
  );
}

export default function CalculatorsPage() {
  const defs = useMemo(() => buildGameDefs(gameDataRaw), []);

  const [rawInput, setRawInput] = useState(DEFAULT_INPUT);
  const [fleetCounts, setFleetCounts] = useState<Record<string, string>>({ destroyer: '120', cruiser: '50', battleship: '20' });
  const [ratioInput, setRatioInput] = useState(DEFAULT_RATIO);
  const [projectionTicks, setProjectionTicks] = useState(0);
  const [warshipMetal, setWarshipMetal] = useState('');
  const [warshipMineral, setWarshipMineral] = useState('');
  const [fleetOverviewInput, setFleetOverviewInput] = useState(DEFAULT_FLEET_OVERVIEW_INPUT);
  const [fleetScanInput, setFleetScanInput] = useState(DEFAULT_FLEET_SCAN_INPUT);
  const [fleetOverviewCopyStatus, setFleetOverviewCopyStatus] = useState('');
  const [fleetOverviewBudgetStatus, setFleetOverviewBudgetStatus] = useState('');
  const [fleetScanCopyStatus, setFleetScanCopyStatus] = useState('');
  const [combatScanInput, setCombatScanInput] = useState(DEFAULT_COMBAT_SCAN_INPUT);
  const [combatScanCopyStatus, setCombatScanCopyStatus] = useState('');
  const [calculatorCopyStatus, setCalculatorCopyStatus] = useState<Record<string, string>>({});

  const parsed = useMemo<ParsedSnapshot>(() => parseSnapshotInput(rawInput, defs), [rawInput, defs]);

  const fleetScan = useMemo<FleetScanParseResult>(() => parseFleetScanInput(fleetScanInput, defs), [fleetScanInput, defs]);

  const fleetOverview = useMemo<FleetOverviewParseResult>(() => parseFleetOverviewInput(fleetOverviewInput), [fleetOverviewInput]);

  const combatScan = useMemo<CombatScanParseResult>(
    () => parseCombatScanInput(combatScanInput, defs),
    [combatScanInput, defs],
  );

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
    if (m <= 0 && n <= 0) {
      return null;
    }
    return optimizeWarships(m, n, defs.shipsById);
  }, [warshipMetal, warshipMineral, defs.shipsById]);

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

  const handleCopyCalculatorDiscord = async (key: string, exportText: string) => {
    if (!exportText) {
      setCalculatorCopyStatus((current) => ({ ...current, [key]: 'No export available yet.' }));
      return;
    }

    const copied = await copyToClipboard(exportText);
    setCalculatorCopyStatus((current) => ({
      ...current,
      [key]: copied ? 'Discord export copied.' : 'Clipboard blocked the export.',
    }));
  };

  const handleCopyFleetScanDiscord = async () => {
    if (!fleetScanDiscordExport) {
      setFleetScanCopyStatus('No fleet scan summary to export.');
      return;
    }

    const copied = await copyToClipboard(fleetScanDiscordExport);
    setFleetScanCopyStatus(copied ? 'Discord export copied.' : 'Clipboard blocked the export.');
  };

  const handleCopyFleetOverviewDiscord = async () => {
    if (!fleetOverviewDiscordExport) {
      setFleetOverviewCopyStatus('No fleet overview summary to export.');
      return;
    }

    const copied = await copyToClipboard(fleetOverviewDiscordExport);
    setFleetOverviewCopyStatus(copied ? 'Discord export copied.' : 'Clipboard blocked the export.');
  };

  const handleCopyCombatScanDiscord = async () => {
    if (!combatScanDiscordExport) {
      setCombatScanCopyStatus('No combat scan to export.');
      return;
    }
    const copied = await copyToClipboard(combatScanDiscordExport);
    setCombatScanCopyStatus(copied ? 'Discord export copied.' : 'Clipboard blocked the export.');
  };

  const handleAddFleetOverviewBudget = (metal: number, mineral: number) => {
    const nextMetal = parseHumanNumber(warshipMetal) + metal;
    const nextMineral = parseHumanNumber(warshipMineral) + mineral;
    setWarshipMetal(formatHumanNumber(nextMetal));
    setWarshipMineral(formatHumanNumber(nextMineral));
    setFleetOverviewBudgetStatus(`Added ${formatHumanNumber(metal)} metal and ${formatHumanNumber(mineral)} mineral to the warship budget.`);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070a12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(8,13,26,0.95),rgba(7,10,18,1)),linear-gradient(90deg,rgba(34,211,238,0.08),transparent_35%,rgba(244,114,182,0.06))]" />
      <div className="pointer-events-none fixed inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_44px)]" />

      <div className="relative mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
        <header className="rounded-lg border border-white/10 bg-[#0b1020]/95 p-4 shadow-xl shadow-black/25 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Infinite Conflict</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">Calculator Companion</h1>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs md:min-w-[420px]">
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <div className="text-slate-500">Planet</div>
                <div className="truncate font-semibold text-slate-100">{parsed.planetName || 'Unknown'}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <div className="text-slate-500">Fleet scan</div>
                <div className="font-semibold text-slate-100">{fleetScan.entries.length} fleets</div>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <div className="text-slate-500">Asset score</div>
                <div className="font-semibold text-slate-100">{parsed.assetScore ? formatHumanNumber(parsed.assetScore) : 'n/a'}</div>
              </div>
            </div>
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-[#0b1020]/90 p-2 xl:hidden">
          {TOOL_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-slate-300"
              >
                <Icon className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)]">
          <ToolNav parsed={parsed} fleetScan={fleetScan} />
          <div className="flex min-w-0 flex-col gap-5">

        <section id="snapshot" className="scroll-mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-4 shadow-xl shadow-black/25 backdrop-blur">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Paste Input</div>
            <textarea
              value={rawInput}
              onChange={(event) => setRawInput(event.target.value)}
              className="h-[350px] w-full rounded-md border border-white/10 bg-[#070a12] p-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
              spellCheck={false}
            />
            <div className="mt-2 text-xs text-slate-500">Parser supports Discord ANSI blocks and Ctrl+A planet view paste.</div>
          </div>

          <div className="space-y-3">
            <ResourceRow title="Stored" values={parsed.resourcesStored} />
            <ResourceRow title="Output per Tick" values={parsed.resourcesOutput} />
            <ResourceRow title="Abundance %" values={parsed.abundance} />
            <div className="rounded-lg border border-white/10 bg-[#0d1422]/80 p-3 text-sm">
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Parsed Snapshot</div>
              <div className="grid grid-cols-2 gap-2">
                <div>Planet: <span className="font-semibold">{parsed.planetName || 'Unknown'}</span></div>
                <div>Asset Score: <span className="font-semibold">{parsed.assetScore ? formatHumanNumber(parsed.assetScore) : 'n/a'}</span></div>
                <div>Workers Free: <span className="font-semibold">{parsed.workersFree !== undefined ? formatHumanNumber(parsed.workersFree) : 'n/a'}</span></div>
                <div>Ground Space Free: <span className="font-semibold">{parsed.groundSpaceFree !== undefined ? formatHumanNumber(parsed.groundSpaceFree) : 'n/a'}</span></div>
                <div>Orbital Space Free: <span className="font-semibold">{parsed.orbitalSpaceFree !== undefined ? formatHumanNumber(parsed.orbitalSpaceFree) : 'n/a'}</span></div>
                <div>Structures Parsed: <span className="font-semibold">{Object.keys(parsed.structures).length}</span></div>
              </div>
            </div>
            {parsed.warnings.length > 0 ? (
              <div className="rounded-lg border border-amber-400/40 bg-amber-900/20 p-3 text-xs text-amber-200">
                {parsed.warnings.map((warning) => (
                  <div key={warning}>• {warning}</div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <TableCard id="cargo" title="1) Cargo Planning">
            {!cargoPlan && freighterRoundTrip.rows.every((r) => r.perTick === 0) ? (
              <div className="text-sm text-slate-400">Paste a planet snapshot to see cargo planning.</div>
            ) : (
              <>
                {cargoPlan && (
                  <>
                    <div className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">One-time haul — clear stored resources now</div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {defs.cargoShips.map((ship) => (
                        <div key={ship.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                          <div className="font-semibold text-cyan-100">{ship.name}</div>
                          <div className="mt-1 text-slate-400">count: {cargoPlan.shipCounts[ship.id] || 0}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">Ships: <span className="font-semibold">{cargoPlan.totals.ships}</span></div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">Metal overflow: <span className="font-semibold">{formatHumanNumber(cargoPlan.overflow.metal)}</span></div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">Mineral overflow: <span className="font-semibold">{formatHumanNumber(cargoPlan.overflow.mineral)}</span></div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">Food+Energy overflow: <span className="font-semibold">{formatHumanNumber(cargoPlan.overflow.other)}</span></div>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      Target load: Metal {formatHumanNumber(parsed.resourcesStored.metal)}, Mineral {formatHumanNumber(parsed.resourcesStored.mineral)}, Food+Energy {formatHumanNumber(totalOtherStored)}
                    </div>
                  </>
                )}
                {!freighterRoundTrip.rows.every((r) => r.perTick === 0) && (
                  <>
                    <div className="mb-1 mt-4 text-xs uppercase tracking-[0.12em] text-slate-400">Freighters to clear round-trip production</div>
                    <div className="overflow-x-auto rounded-lg border border-white/10">
                      <table className="min-w-full text-xs">
                        <thead className="bg-black/30 text-slate-400">
                          <tr>
                            <th className="px-2 py-1 text-left">Resource</th>
                            <th className="px-2 py-1 text-right">Cap/ship</th>
                            <th className="px-2 py-1 text-right">Output/tick</th>
                            {freighterRoundTrip.tripOneTimes.map((t) => (
                              <th key={t} className="px-2 py-1 text-right">{t}-turn RT ({t * 2})</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {freighterRoundTrip.rows.map((row) => (
                            <tr key={row.resource} className="border-t border-white/10">
                              <td className="px-2 py-1 font-medium">{row.label}</td>
                              <td className="px-2 py-1 text-right text-slate-400">{formatHumanNumber(row.cap)}</td>
                              <td className="px-2 py-1 text-right">{row.perTick > 0 ? formatHumanNumber(row.perTick) : '—'}</td>
                              {row.freighters.map((n, i) => (
                                <td key={i} className="px-2 py-1 text-right">{row.perTick > 0 ? n : '—'}</td>
                              ))}
                            </tr>
                          ))}
                          <tr className="border-t-2 border-cyan-300/30 font-semibold text-cyan-100">
                            <td className="px-2 py-1" colSpan={3}>Min to clear all</td>
                            {freighterRoundTrip.totals.map((n, i) => (
                              <td key={i} className="px-2 py-1 text-right">{n}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      Round-trip = one-way × 2. Each freighter carries 120k metal / 80k mineral / 40k food / 40k energy simultaneously. Min to clear = max across resources.
                    </div>
                  </>
                )}
                <DiscordExportPanel
                  exportText={cargoDiscordExport}
                  title="Discord Export"
                  emptyText="Paste a planet snapshot to generate a cargo export."
                  status={calculatorCopyStatus.cargo || ''}
                  onCopy={() => handleCopyCalculatorDiscord('cargo', cargoDiscordExport)}
                />
              </>
            )}
          </TableCard>

          <TableCard id="fleet-score" title="2) Fleet Score and Cost Ratios">
            {(() => {
              const columns = [
                ['fighter', 'bomber', 'frigate'],
                ['destroyer', 'cruiser', 'battleship'],
                ['freighter', 'merchant', 'trader', 'invasion_ship'],
              ];
              return (
                <div className="grid grid-cols-3 gap-x-4 gap-y-0">
                  {columns.map((ids, ci) => (
                    <div key={ci} className="flex flex-col gap-1">
                      {ids.map((id) => {
                        const ship = defs.shipsById[id];
                        if (!ship) return null;
                        return (
                          <div key={id} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-xs text-slate-400">{ship.name}</span>
                            <input
                              type="number"
                              min="0"
                              value={fleetCounts[id] ?? ''}
                              onChange={(e) => setFleetCounts((prev) => ({ ...prev, [id]: e.target.value }))}
                              className="w-16 rounded border border-cyan-300/20 bg-black/35 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-300/60"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-sm">Raw score points: <span className="font-semibold">{formatHumanNumber(fleetScore.totalScoreValue)}</span></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-sm">Displayed score: <span className="font-semibold">{fleetScore.totalDisplayedScore.toFixed(2)}</span></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-sm">Weighted cost: <span className="font-semibold">{formatHumanNumber(fleetScore.weightedCost)}</span></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-sm">Score / weighted 1k: <span className="font-semibold">{fleetScore.scorePerWeightedK.toFixed(2)}</span></div>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="bg-black/30 text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Ship</th>
                    <th className="px-2 py-1 text-right">Count</th>
                    <th className="px-2 py-1 text-right">Total Score Pts</th>
                    <th className="px-2 py-1 text-right">Score / Weighted 1k</th>
                  </tr>
                </thead>
                <tbody>
                  {fleetScore.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-white/10">
                      <td className="px-2 py-1">{entry.name}</td>
                      <td className="px-2 py-1 text-right">{entry.count}</td>
                      <td className="px-2 py-1 text-right">{formatHumanNumber(entry.totalScoreValue)}</td>
                      <td className="px-2 py-1 text-right">{entry.scorePerWeightedK.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DiscordExportPanel
              exportText={fleetScoreDiscordExport}
              title="Discord Export"
              emptyText="Enter fleet counts to generate a fleet score export."
              status={calculatorCopyStatus.fleetScore || ''}
              onCopy={() => handleCopyCalculatorDiscord('fleetScore', fleetScoreDiscordExport)}
            />
          </TableCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <TableCard id="ratio" title="3) Fleet Ratio Balancer">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Target Ratio</div>
                <textarea
                  value={ratioInput}
                  onChange={(event) => setRatioInput(event.target.value)}
                  className="h-24 w-full rounded-lg border border-cyan-300/20 bg-black/35 p-2 text-xs text-slate-100 outline-none"
                  spellCheck={false}
                />
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Current Fleet (editable)</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-0">
                  {[['fighter','bomber','frigate'],['destroyer','cruiser','battleship'],['freighter','merchant','trader','invasion_ship']].map((ids, ci) => (
                    <div key={ci} className="flex flex-col gap-1">
                      {ids.map((id) => {
                        const ship = defs.shipsById[id];
                        if (!ship) return null;
                        return (
                          <div key={id} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-xs text-slate-400">{ship.name}</span>
                            <input
                              type="number"
                              min="0"
                              value={fleetCounts[id] ?? ''}
                              onChange={(e) => setFleetCounts((prev) => ({ ...prev, [id]: e.target.value }))}
                              className="w-16 rounded border border-cyan-300/20 bg-black/35 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-300/60"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="bg-black/30 text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Ship</th>
                    <th className="px-2 py-1 text-right">Current</th>
                    <th className="px-2 py-1 text-right">Add</th>
                    <th className="px-2 py-1 text-right">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(fleetBalance.targetWeights).map((id) => (
                    <tr key={id} className="border-t border-white/10">
                      <td className="px-2 py-1">{defs.shipsById[id]?.name || idLabel(id)}</td>
                      <td className="px-2 py-1 text-right">{parsedFleet[id] || 0}</td>
                      <td className="px-2 py-1 text-right">{fleetBalance.additions[id] || 0}</td>
                      <td className="px-2 py-1 text-right">{fleetBalance.resulting[id] || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DiscordExportPanel
              exportText={fleetBalanceDiscordExport}
              title="Discord Export"
              emptyText="Enter a target ratio to generate a ratio export."
              status={calculatorCopyStatus.fleetBalance || ''}
              onCopy={() => handleCopyCalculatorDiscord('fleetBalance', fleetBalanceDiscordExport)}
            />
          </TableCard>

          <TableCard id="builds" title="4) Build Optimizer: Resource Production">
            {buildFormula.groups.length === 0 ? (
              <div className="text-sm text-slate-400">
                No free space or workers detected — paste a planet snapshot to get recommendations.
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-cyan-300/20 bg-black/30 px-2 py-0.5 text-[11px] text-cyan-200/80">Ground: {buildFormula.groundReason}</span>
                  {buildFormula.groups.some((g) => g.spaceType === 'orbital') && (
                    <>
                      <span className="rounded-full border border-purple-400/20 bg-black/30 px-2 py-0.5 text-[11px] text-purple-200/80">Orbital T3: {buildFormula.orbitalT3Reason}</span>
                      <span className="rounded-full border border-purple-400/20 bg-black/30 px-2 py-0.5 text-[11px] text-purple-200/80">Orbital T2: {buildFormula.orbitalT2Reason}</span>
                    </>
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="min-w-full text-xs">
                    <thead className="bg-black/30 text-slate-400">
                      <tr>
                        <th className="px-2 py-1 text-left">Building</th>
                        <th className="px-2 py-1 text-right">Count</th>
                        <th className="px-2 py-1 text-right">Score</th>
                        <th className="px-2 py-1 text-right">Metal/tick</th>
                        <th className="px-2 py-1 text-right">Mineral/tick</th>
                        <th className="px-2 py-1 text-right">Food/tick</th>
                        <th className="px-2 py-1 text-right">Energy/tick</th>
                        <th className="px-2 py-1 text-right">Workers</th>
                        <th className="px-2 py-1 text-right">Space</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildFormula.groups.map((g) => (
                        <tr key={g.buildingId} className="border-t border-white/10">
                          <td className="px-2 py-1 font-medium">{g.buildingName}</td>
                          <td className="px-2 py-1 text-right">{g.count}</td>
                          <td className="px-2 py-1 text-right text-amber-300/90">+{formatHumanNumber(g.scoreDelta)}</td>
                          <td className="px-2 py-1 text-right">{g.outputDelta.metal !== 0 ? formatHumanNumber(g.outputDelta.metal) : '—'}</td>
                          <td className="px-2 py-1 text-right">{g.outputDelta.mineral !== 0 ? formatHumanNumber(g.outputDelta.mineral) : '—'}</td>
                          <td className="px-2 py-1 text-right">{g.outputDelta.food !== 0 ? formatHumanNumber(g.outputDelta.food) : '—'}</td>
                          <td className="px-2 py-1 text-right">{g.outputDelta.energy !== 0 ? formatHumanNumber(g.outputDelta.energy) : '—'}</td>
                          <td className="px-2 py-1 text-right text-slate-400">{formatHumanNumber(g.workerCost)}</td>
                          <td className="px-2 py-1 text-right text-slate-400">{g.spaceCost} {g.spaceType === 'ground' ? 'G' : 'O'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-white/20 bg-black/20 font-semibold">
                      <tr>
                        <td className="px-2 py-1">Total</td>
                        <td className="px-2 py-1 text-right">{buildFormula.groups.reduce((s, g) => s + g.count, 0)}</td>
                        <td className="px-2 py-1 text-right text-amber-300">+{formatHumanNumber(buildFormula.totalScoreDelta)}</td>
                        <td className="px-2 py-1 text-right">{buildFormula.totalOutputDelta.metal !== 0 ? formatHumanNumber(buildFormula.totalOutputDelta.metal) : '—'}</td>
                        <td className="px-2 py-1 text-right">{buildFormula.totalOutputDelta.mineral !== 0 ? formatHumanNumber(buildFormula.totalOutputDelta.mineral) : '—'}</td>
                        <td className="px-2 py-1 text-right">{buildFormula.totalOutputDelta.food !== 0 ? formatHumanNumber(buildFormula.totalOutputDelta.food) : '—'}</td>
                        <td className="px-2 py-1 text-right">{buildFormula.totalOutputDelta.energy !== 0 ? formatHumanNumber(buildFormula.totalOutputDelta.energy) : '—'}</td>
                        <td className="px-2 py-1 text-right text-slate-400">{formatHumanNumber(buildFormula.workersUsed)}</td>
                        <td className="px-2 py-1 text-right text-slate-400">{buildFormula.groundSpaceUsed}G {buildFormula.orbitalSpaceUsed}O</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="text-slate-400">Ground remaining</div>
                    <div className="font-semibold">{buildFormula.groundSpaceRemaining}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="text-slate-400">Orbital remaining</div>
                    <div className="font-semibold">{buildFormula.orbitalSpaceRemaining}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="text-slate-400">Workers remaining</div>
                    <div className="font-semibold">{formatHumanNumber(buildFormula.workersRemaining)}</div>
                  </div>
                </div>
              </>
            )}
            <DiscordExportPanel
              exportText={buildDiscordExport}
              title="Discord Export"
              emptyText="Paste a planet snapshot with free space and workers to generate a build export."
              status={calculatorCopyStatus.builds || ''}
              onCopy={() => handleCopyCalculatorDiscord('builds', buildDiscordExport)}
            />
          </TableCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <TableCard id="budget" title="5) Fleet from Budget / Outputs">
            <div className="mb-3 flex items-center gap-2 text-xs">
              <label className="uppercase tracking-[0.12em] text-slate-400">Projection Ticks</label>
              <input
                type="number"
                min={0}
                max={5000}
                value={projectionTicks}
                onChange={(event) => setProjectionTicks(Number(event.target.value || 0))}
                className="w-28 rounded-md border border-cyan-300/20 bg-black/35 px-2 py-1 text-sm text-slate-100 outline-none"
              />
            </div>

            <ResourceRow title="Available Budget" values={availableNow} />

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">Multiplier: <span className="font-semibold">{budgetFleet.multiplier}</span></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">Metal Used: <span className="font-semibold">{formatHumanNumber(budgetFleet.used.metal)}</span></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">Mineral Used: <span className="font-semibold">{formatHumanNumber(budgetFleet.used.mineral)}</span></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">Food/Energy Used: <span className="font-semibold">{formatHumanNumber(budgetFleet.used.food + budgetFleet.used.energy)}</span></div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="bg-black/30 text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Ship</th>
                    <th className="px-2 py-1 text-right">Build Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(budgetFleet.composition).map(([id, count]) => (
                    <tr key={id} className="border-t border-white/10">
                      <td className="px-2 py-1">{defs.shipsById[id]?.name || idLabel(id)}</td>
                      <td className="px-2 py-1 text-right">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ResourceRow title="Leftover After Build" values={budgetFleet.leftover} />
            <DiscordExportPanel
              exportText={budgetFleetDiscordExport}
              title="Discord Export"
              emptyText="Enter ratio and budget data to generate a fleet budget export."
              status={calculatorCopyStatus.budget || ''}
              onCopy={() => handleCopyCalculatorDiscord('budget', budgetFleetDiscordExport)}
            />
          </TableCard>

          <TableCard title="Method Notes">
            <ul className="space-y-2 text-sm text-slate-400">
              <li>• Mechanics are read from game_data definitions already used by the planner.</li>
              <li>• Cargo calculator minimizes overflow and ship count for one-trip extraction.</li>
              <li>• Score calculator uses ship score values and weighted resource cost ratios.</li>
              <li>• Ratio balancer computes minimal additions for scaled target ratios.</li>
              <li>• Build optimizer runs a greedy output-per-score recommendation loop.</li>
              <li>• Budget fleet solver uses exact ratio bundles and maximizes multiplier under budget.</li>
            </ul>
          </TableCard>
        </section>

        <TableCard id="warships" title="6) Warship Budget Optimizer">
          <p className="mb-4 text-xs text-slate-400">
            Enter a metal and mineral budget. Supports human numbers (e.g. 5M, 500K). Ships considered: Fighter, Bomber, Frigate, Destroyer, Cruiser, Battleship, Command Carrier.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Metal</div>
              <input
                type="text"
                value={warshipMetal}
                onChange={(e) => setWarshipMetal(e.target.value)}
                placeholder="e.g. 5M"
                className="w-full rounded-lg border border-cyan-300/20 bg-black/35 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/20"
              />
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Mineral</div>
              <input
                type="text"
                value={warshipMineral}
                onChange={(e) => setWarshipMineral(e.target.value)}
                placeholder="e.g. 2M"
                className="w-full rounded-lg border border-cyan-300/20 bg-black/35 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/20"
              />
            </div>
          </div>

          {warshipOptimizer ? (
            <div className="grid gap-4 md:grid-cols-2">
              <WarshipResultPanel label="Highest Score" result={warshipOptimizer.highestScore} accent="text-amber-300" border="border-amber-400/30" />
              <WarshipResultPanel label="Least Leftover" result={warshipOptimizer.leastLeftover} accent="text-emerald-300" border="border-emerald-400/30" />
            </div>
          ) : (
            <div className="text-sm text-slate-400">Enter a budget above to see recommendations.</div>
          )}
          <DiscordExportPanel
            exportText={warshipDiscordExport}
            title="Discord Export"
            emptyText="Enter a metal and mineral budget to generate a warship export."
            status={calculatorCopyStatus.warships || ''}
            onCopy={() => handleCopyCalculatorDiscord('warships', warshipDiscordExport)}
          />
        </TableCard>

        <TableCard id="fleet-overview" title="7) Fleet Overview ETA Cargo">
          <p className="mb-2 text-xs text-amber-200/80">
            <span className="font-semibold">Soldiers/workers accuracy:</span> Ctrl+A plain-text copies drop empty cargo cells and shift columns — soldiers land in the Metal column. For correct results, select just the fleet table rows in-browser so the paste preserves tab column alignment.
          </p>
          <textarea
            value={fleetOverviewInput}
            onChange={(event) => {
              setFleetOverviewInput(event.target.value);
              setFleetOverviewCopyStatus('');
              setFleetOverviewBudgetStatus('');
            }}
            className="h-44 w-full rounded-md border border-white/10 bg-[#070a12] p-3 text-xs text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
            spellCheck={false}
          />

          {fleetOverview.warnings.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-900/20 p-3 text-xs text-amber-200">
              {fleetOverview.warnings.map((warning) => (
                <div key={warning}>• {warning}</div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">Rows parsed: <span className="font-semibold">{fleetOverview.entries.length}</span></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">Destinations: <span className="font-semibold">{fleetOverview.destinations.length}</span></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">Included fleets: <span className="font-semibold">{fleetOverview.destinations.reduce((sum, row) => sum + row.fleets, 0)}</span></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">ETA rows: <span className="font-semibold">{fleetOverview.destinations.reduce((sum, row) => sum + row.rows.length, 0)}</span></div>
          </div>

          <DiscordExportPanel
            exportText={fleetOverviewDiscordExport}
            title="Discord Export"
            emptyText="Paste a fleet overview to generate an export."
            status={fleetOverviewCopyStatus}
            onCopy={handleCopyFleetOverviewDiscord}
          />

          {fleetOverviewBudgetStatus ? (
            <div role="status" aria-live="polite" className="mt-3 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
              {fleetOverviewBudgetStatus}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4">
            {fleetOverview.destinations.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-slate-400">No loaded moving fleets with ETA were found.</div>
            ) : (
              fleetOverview.destinations.map((destination) => (
                <div key={`${destination.destinationCoords}-${destination.destinationName}`} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
                  <div className="flex flex-col gap-1 border-b border-white/10 bg-white/[0.03] px-3 py-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{destination.destinationName || 'Unknown destination'}</div>
                      <div className="font-mono text-xs text-cyan-200">{destination.destinationCoords || 'no coords'}</div>
                    </div>
                    <div className="text-xs text-slate-400">{destination.fleets} loaded fleets</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-black/30 text-slate-400">
                        <tr>
                          <th className="px-2 py-1 text-left">ETA</th>
                          <th className="px-2 py-1 text-right">Arriving</th>
                          {FLEET_CARGO_ORDER.map((id) => (
                            <th key={id} className="px-2 py-1 text-right">{cargoLabel(id)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {destination.rows.map((row) => (
                          <tr
                            key={row.etaTurns}
                            className="cursor-pointer border-t border-white/10 transition hover:bg-cyan-300/10 focus:bg-cyan-300/10 focus:outline-none"
                            role="button"
                            tabIndex={0}
                            title="Add this cumulative metal and mineral to the warship budget optimizer"
                            onClick={() => handleAddFleetOverviewBudget(row.cumulative.metal, row.cumulative.mineral)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleAddFleetOverviewBudget(row.cumulative.metal, row.cumulative.mineral);
                              }
                            }}
                          >
                            <td className="px-2 py-1 font-mono text-cyan-100">{row.etaTurns}t</td>
                            <td className="px-2 py-1 text-right">{row.arrivingFleets}</td>
                            {FLEET_CARGO_ORDER.map((id) => (
                              <td key={id} className="px-2 py-1 text-right">
                                {row.cumulative[id] > 0 ? formatHumanNumber(row.cumulative[id]) : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </TableCard>

        <TableCard id="fleet-scan" title="8) Fleet Scan Summary (By Player and Alliance)">
          <p className="mb-3 text-xs text-slate-400">
            Paste a full Fleet Scan copy. The parser aggregates ship counts, score, and resource value by player and by alliance.
          </p>
          <textarea
            value={fleetScanInput}
            onChange={(event) => {
              setFleetScanInput(event.target.value);
              setFleetScanCopyStatus('');
            }}
            className="h-48 w-full rounded-lg border border-cyan-300/20 bg-black/35 p-2 text-xs text-slate-100 outline-none"
            spellCheck={false}
          />

          {fleetScan.warnings.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-900/20 p-3 text-xs text-amber-200">
              {fleetScan.warnings.map((warning) => (
                <div key={warning}>• {warning}</div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">Fleets parsed: <span className="font-semibold">{fleetScan.entries.length}</span></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">Players: <span className="font-semibold">{fleetScan.byPlayer.length}</span></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">Alliances: <span className="font-semibold">{fleetScan.byAlliance.length}</span></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">Total score: <span className="font-semibold">{formatHumanNumber(fleetScan.byAlliance.reduce((sum, row) => sum + row.totalScoreValue, 0))}</span></div>
          </div>

          <DiscordExportPanel
            exportText={fleetScanDiscordExport}
            title="Discord Export"
            emptyText="Paste a fleet scan to generate an export."
            status={fleetScanCopyStatus}
            onCopy={handleCopyFleetScanDiscord}
          />

          <div className="mt-3 text-xs uppercase tracking-[0.14em] text-cyan-100/85">By Player</div>
          <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-full text-xs">
              <thead className="bg-black/30 text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left">Player</th>
                  <th className="px-2 py-1 text-left">Alliance(s)</th>
                  <th className="px-2 py-1 text-right">Fleets</th>
                  {fleetScanShipIds.map((id) => (
                    <th key={id} className="px-2 py-1 text-right">{defs.shipsById[id]?.name || idLabel(id)}</th>
                  ))}
                  <th className="px-2 py-1 text-right">Score Pts</th>
                </tr>
              </thead>
              <tbody>
                {fleetScan.byPlayer.map((row) => (
                  <tr key={row.label} className="border-t border-white/10">
                    <td className="px-2 py-1">{row.label}</td>
                    <td className="px-2 py-1 text-slate-400">{row.alliances?.join(', ') || '—'}</td>
                    <td className="px-2 py-1 text-right">{row.fleets}</td>
                    {fleetScanShipIds.map((id) => (
                      <td key={`${row.label}-${id}`} className="px-2 py-1 text-right">{row.units[id] ? formatHumanNumber(row.units[id]) : '—'}</td>
                    ))}
                    <td className="px-2 py-1 text-right">{formatHumanNumber(row.totalScoreValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs uppercase tracking-[0.14em] text-cyan-100/85">By Alliance</div>
          <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-full text-xs">
              <thead className="bg-black/30 text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left">Alliance</th>
                  <th className="px-2 py-1 text-right">Fleets</th>
                  {fleetScanShipIds.map((id) => (
                    <th key={id} className="px-2 py-1 text-right">{defs.shipsById[id]?.name || idLabel(id)}</th>
                  ))}
                  <th className="px-2 py-1 text-right">Score Pts</th>
                  <th className="px-2 py-1 text-right">Metal</th>
                  <th className="px-2 py-1 text-right">Mineral</th>
                </tr>
              </thead>
              <tbody>
                {fleetScan.byAlliance.map((row) => (
                  <tr key={row.label} className="border-t border-white/10">
                    <td className="px-2 py-1">{row.label}</td>
                    <td className="px-2 py-1 text-right">{row.fleets}</td>
                    {fleetScanShipIds.map((id) => (
                      <td key={`${row.label}-${id}`} className="px-2 py-1 text-right">{row.units[id] ? formatHumanNumber(row.units[id]) : '—'}</td>
                    ))}
                    <td className="px-2 py-1 text-right">{formatHumanNumber(row.totalScoreValue)}</td>
                    <td className="px-2 py-1 text-right">{formatHumanNumber(row.totalCost.metal)}</td>
                    <td className="px-2 py-1 text-right">{formatHumanNumber(row.totalCost.mineral)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableCard>

        <CombatScanSection
          combatScanInput={combatScanInput}
          setCombatScanInput={setCombatScanInput}
          setCombatScanCopyStatus={setCombatScanCopyStatus}
          combatScan={combatScan}
          combatScanDiscordExport={combatScanDiscordExport}
          combatScanCopyStatus={combatScanCopyStatus}
          onCopy={handleCopyCombatScanDiscord}
          shipsById={defs.shipsById}
        />
          </div>
        </div>
      </div>
    </main>
  );
}

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
  const accent = isAttacker ? 'text-blue-300' : 'text-orange-300';
  const border = isAttacker ? 'border-blue-400/30' : 'border-orange-400/30';
  const bg = isAttacker ? 'bg-blue-950/30' : 'bg-orange-950/30';

  return (
    <div className={`rounded-lg border ${border} ${bg} p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <div className={`text-xs font-bold uppercase tracking-[0.18em] ${accent}`}>
          {isAttacker ? '⚔️ Attackers' : '🛡️ Defenders'}
        </div>
        <div className="text-sm">{emoji} <span className="text-xs text-slate-400">{label}</span></div>
      </div>

      <div className="mb-2 text-xs text-slate-400">{summary.alliances.join(', ') || '—'}</div>
      <div className="mb-3 text-xs text-slate-300">{summary.players.join(', ') || '—'}</div>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
          <div className="text-slate-500">Units lost</div>
          <div className="font-semibold text-slate-100">{formatHumanNumber(summary.totalUnitsLost)}</div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
          <div className="text-slate-500">Score lost</div>
          <div className="font-semibold text-slate-100">{formatHumanNumber(summary.totalScoreLost)}</div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
          <div className="text-slate-500">Metal destroyed</div>
          <div className="font-semibold text-red-300">{formatHumanNumber(summary.totalCostLost.metal)}</div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
          <div className="text-slate-500">Mineral destroyed</div>
          <div className="font-semibold text-red-300">{formatHumanNumber(summary.totalCostLost.mineral)}</div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 px-2 py-1 col-span-2">
          <div className="text-slate-500">Weighted cost destroyed</div>
          <div className="font-semibold text-slate-100">{formatHumanNumber(summary.weightedCostLost)}</div>
        </div>
      </div>

      {shipIds.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded border border-white/10">
          <table className="min-w-full text-xs">
            <thead className="bg-black/30 text-slate-400">
              <tr>
                <th className="px-2 py-1 text-left">Ship</th>
                <th className="px-2 py-1 text-right">Lost</th>
                <th className="px-2 py-1 text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {shipIds.filter((id) => summary.unitsLost[id] > 0).map((id) => {
                const count = summary.unitsLost[id] || 0;
                const pct = summary.totalUnitsLost > 0 ? ((count / summary.totalUnitsLost) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={id} className="border-t border-white/10">
                    <td className="px-2 py-1">{shipsById[id]?.name ?? id}</td>
                    <td className="px-2 py-1 text-right">{formatHumanNumber(count)}</td>
                    <td className="px-2 py-1 text-right text-slate-400">{pct}%</td>
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

function CombatScanSection({
  combatScanInput,
  setCombatScanInput,
  setCombatScanCopyStatus,
  combatScan,
  combatScanDiscordExport,
  combatScanCopyStatus,
  onCopy,
  shipsById,
}: {
  combatScanInput: string;
  setCombatScanInput: (v: string) => void;
  setCombatScanCopyStatus: (v: string) => void;
  combatScan: CombatScanParseResult;
  combatScanDiscordExport: string;
  combatScanCopyStatus: string;
  onCopy: () => void;
  shipsById: Record<string, ShipDef>;
}) {
  const { attackers, defenders, tradeRatio, byPlayer, shipIds } = combatScan;
  const hasData = combatScan.fleets.length > 0;

  const atkWon = tradeRatio < 0.95;
  const defWon = tradeRatio > 1.05;
  const ratioDisplay = Number.isFinite(tradeRatio) && tradeRatio < 99 ? tradeRatio.toFixed(2) : '∞';

  return (
    <TableCard id="combat-scan" title="9) Combat Scan Analyzer">
      <p className="mb-3 text-xs text-slate-400">
        Paste a battle report. Label sections with <span className="font-mono text-cyan-200">Attacker</span> / <span className="font-mono text-cyan-200">Defender</span>, then list fleets as <span className="font-mono text-cyan-200">Player (Alliance)</span> followed by <span className="font-mono text-cyan-200">N x Ship</span> lines. Supports <span className="font-mono text-cyan-200">(destroyed)</span> suffix.
      </p>

      <textarea
        value={combatScanInput}
        onChange={(e) => { setCombatScanInput(e.target.value); setCombatScanCopyStatus(''); }}
        className="h-48 w-full rounded-lg border border-cyan-300/20 bg-black/35 p-2 text-xs text-slate-100 outline-none"
        spellCheck={false}
      />

      {combatScan.warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-900/20 p-3 text-xs text-amber-200">
          {combatScan.warnings.map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {hasData && (
        <>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">Battle Summary</div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`font-bold ${atkWon ? 'text-green-300' : defWon ? 'text-red-300' : 'text-yellow-300'}`}>
                {atkWon ? '🟢 Attackers won the trade' : defWon ? '🟢 Defenders won the trade' : '🟡 Roughly even trade'}
              </span>
              <span className="text-slate-400 text-xs">Atk/Def cost ratio: <span className="font-mono text-slate-100">{ratioDisplay}</span></span>
              <span className="text-slate-400 text-xs">Fleets: {combatScan.fleets.length}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
                <div className="text-slate-500">Attacker score lost</div>
                <div className="font-semibold text-blue-300">{formatHumanNumber(attackers.totalScoreLost)}</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
                <div className="text-slate-500">Defender score lost</div>
                <div className="font-semibold text-orange-300">{formatHumanNumber(defenders.totalScoreLost)}</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
                <div className="text-slate-500">Attacker cost destroyed</div>
                <div className="font-semibold text-blue-300">{formatHumanNumber(attackers.weightedCostLost)}</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 px-2 py-1">
                <div className="text-slate-500">Defender cost destroyed</div>
                <div className="font-semibold text-orange-300">{formatHumanNumber(defenders.weightedCostLost)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <CombatSideCard summary={attackers} enemyCost={defenders.weightedCostLost} shipIds={shipIds} shipsById={shipsById} />
            <CombatSideCard summary={defenders} enemyCost={attackers.weightedCostLost} shipIds={shipIds} shipsById={shipsById} />
          </div>

          {byPlayer.length > 0 && (
            <>
              <div className="mt-4 text-xs uppercase tracking-[0.14em] text-cyan-100/85">By Player</div>
              <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
                <table className="min-w-full text-xs">
                  <thead className="bg-black/30 text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-left">Trade</th>
                      <th className="px-2 py-1 text-left">Player</th>
                      <th className="px-2 py-1 text-left">Alliance</th>
                      <th className="px-2 py-1 text-left">Side</th>
                      <th className="px-2 py-1 text-right">Units lost</th>
                      <th className="px-2 py-1 text-right">Score lost</th>
                      <th className="px-2 py-1 text-right">Metal destr.</th>
                      <th className="px-2 py-1 text-right">Mineral destr.</th>
                      <th className="px-2 py-1 text-right">Wtd cost</th>
                      {shipIds.map((id) => (
                        <th key={id} className="px-2 py-1 text-right">{shipsById[id]?.name ?? id}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byPlayer.map((p) => {
                      const enemySide = p.side === 'attacker' ? defenders : attackers;
                      const playerEmoji = tradeEmoji(p.weightedCostLost, enemySide.weightedCostLost);
                      const isAtk = p.side === 'attacker';
                      return (
                        <tr key={`${p.player}-${p.side}`} className={`border-t border-white/10 ${isAtk ? 'bg-blue-950/10' : 'bg-orange-950/10'}`}>
                          <td className="px-2 py-1 text-center text-base">{playerEmoji}</td>
                          <td className="px-2 py-1 font-medium">{p.player}</td>
                          <td className="px-2 py-1 text-slate-400">{p.alliance}</td>
                          <td className={`px-2 py-1 font-semibold ${isAtk ? 'text-blue-300' : 'text-orange-300'}`}>
                            {isAtk ? '⚔️ Atk' : '🛡️ Def'}
                          </td>
                          <td className="px-2 py-1 text-right">{formatHumanNumber(p.totalUnitsLost)}</td>
                          <td className="px-2 py-1 text-right">{formatHumanNumber(p.totalScoreLost)}</td>
                          <td className="px-2 py-1 text-right text-red-300/80">{formatHumanNumber(p.totalCostLost.metal)}</td>
                          <td className="px-2 py-1 text-right text-red-300/80">{formatHumanNumber(p.totalCostLost.mineral)}</td>
                          <td className="px-2 py-1 text-right font-semibold">{formatHumanNumber(p.weightedCostLost)}</td>
                          {shipIds.map((id) => (
                            <td key={id} className="px-2 py-1 text-right">
                              {p.unitsLost[id] ? formatHumanNumber(p.unitsLost[id]) : '—'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <DiscordExportPanel
        exportText={combatScanDiscordExport}
        title="Discord Export"
        emptyText="Paste a combat report to generate an export."
        status={combatScanCopyStatus}
        onCopy={onCopy}
      />
    </TableCard>
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
            <table className="min-w-full text-xs">
              <thead className="bg-black/30 text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left">Ship</th>
                  <th className="px-2 py-1 text-right">Count</th>
                  <th className="px-2 py-1 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {result.fleet.map((entry) => (
                  <tr key={entry.id} className="border-t border-white/10">
                    <td className="px-2 py-1">{entry.name}</td>
                    <td className="px-2 py-1 text-right">{formatHumanNumber(entry.count)}</td>
                    <td className="px-2 py-1 text-right">{formatHumanNumber(entry.scoreContrib)}</td>
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

