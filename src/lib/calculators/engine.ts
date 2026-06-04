export type ResourceId = 'metal' | 'mineral' | 'food' | 'energy';

export interface CargoShipDef {
  id: string;
  name: string;
  metalCap: number;
  mineralCap: number;
  otherCap: number;
  scoreValue: number;
  costs: Record<ResourceId, number>;
}

export interface ShipDef {
  id: string;
  name: string;
  scoreValue: number;
  costs: Record<ResourceId, number>;
}

export interface BuildingDef {
  id: string;
  name: string;
  scoreValue: number;
  workerCost: number;
  groundSpaceCost: number;
  orbitalSpaceCost: number;
  requirements: string[];
  production: Partial<Record<ResourceId, number>>;
  productionIsAbundanceScaled: Partial<Record<ResourceId, boolean>>;
  upkeep: Partial<Record<ResourceId, number>>;
}

export interface ParsedSnapshot {
  planetName?: string;
  assetScore?: number;
  resourcesStored: Record<ResourceId, number>;
  resourcesOutput: Record<ResourceId, number>;
  abundance: Record<ResourceId, number>;
  workersTotal?: number;
  workersBusy?: number;
  workersFree?: number;
  soldiers?: number;
  scientists?: number;
  groundSpaceFree?: number;
  orbitalSpaceFree?: number;
  structures: Record<string, number>;
  ships: Record<string, number>;
  warnings: string[];
}

export interface FleetScanEntry {
  fleetName: string;
  player: string;
  alliance: string;
  arrivalTurns: number | null;
  units: Record<string, number>;
}

export interface FleetScanSummary {
  label: string;
  fleets: number;
  units: Record<string, number>;
  totalUnits: number;
  totalScoreValue: number;
  totalCost: Record<ResourceId, number>;
  alliances?: string[];
}

export interface FleetScanParseResult {
  entries: FleetScanEntry[];
  byPlayer: FleetScanSummary[];
  byAlliance: FleetScanSummary[];
  warnings: string[];
}

export type FleetCargoId = ResourceId | 'workers' | 'soldiers';

export interface FleetCargoLoad {
  metal: number;
  mineral: number;
  food: number;
  energy: number;
  workers: number;
  soldiers: number;
}

export interface FleetOverviewEntry {
  fleetName: string;
  status: string;
  originName: string;
  originCoords: string;
  destinationName: string;
  destinationCoords: string;
  etaTurns: number | null;
  cargo: FleetCargoLoad;
  isNonEmpty: boolean;
}

export interface FleetOverviewCumulativeRow {
  etaTurns: number;
  arrivingFleets: number;
  cumulative: FleetCargoLoad;
}

export interface FleetOverviewDestinationSummary {
  destinationName: string;
  destinationCoords: string;
  fleets: number;
  rows: FleetOverviewCumulativeRow[];
}

export interface FleetOverviewParseResult {
  entries: FleetOverviewEntry[];
  destinations: FleetOverviewDestinationSummary[];
  warnings: string[];
}

export interface GameDefs {
  shipsById: Record<string, ShipDef>;
  shipsByName: Record<string, ShipDef>;
  cargoShips: CargoShipDef[];
  structuresById: Record<string, BuildingDef>;
  structureNameToId: Record<string, string>;
  shipNameToId: Record<string, string>;
}

export interface CargoPlan {
  shipCounts: Record<string, number>;
  totals: {
    metalCap: number;
    mineralCap: number;
    otherCap: number;
    ships: number;
  };
  overflow: {
    metal: number;
    mineral: number;
    other: number;
  };
}

export interface FleetEntryBreakdown {
  id: string;
  name: string;
  count: number;
  scoreValue: number;
  totalScoreValue: number;
  totalDisplayedScore: number;
  weightedCost: number;
  scorePerWeightedK: number;
}

export interface FleetScoreBreakdown {
  entries: FleetEntryBreakdown[];
  totalScoreValue: number;
  totalDisplayedScore: number;
  totalCost: Record<ResourceId, number>;
  weightedCost: number;
  scorePerWeightedK: number;
}

export interface FleetBalancePlan {
  targetWeights: Record<string, number>;
  additions: Record<string, number>;
  resulting: Record<string, number>;
  scale: number;
}

export interface BuildRecommendation {
  id: string;
  name: string;
  efficiency: number;
  scoreDelta: number;
  weightedOutputDelta: number;
  outputDelta: Record<ResourceId, number>;
}

export interface BuildOptimizationResult {
  steps: BuildRecommendation[];
  finalOutputs: Record<ResourceId, number>;
  totalScoreDelta: number;
  totalWeightedOutputDelta: number;
  remaining: {
    workersFree: number;
    groundSpaceFree: number;
    orbitalSpaceFree: number;
  };
}

export interface FleetFromBudgetResult {
  multiplier: number;
  composition: Record<string, number>;
  used: Record<ResourceId, number>;
  leftover: Record<ResourceId, number>;
  nextScaleNeeds: Record<ResourceId, number>;
}

const RESOURCE_SCORE_VALUES: Record<ResourceId, number> = {
  metal: 1,
  mineral: 1.5,
  food: 2,
  energy: 2,
};

const BASE_RESOURCES: Record<ResourceId, number> = {
  metal: 0,
  mineral: 0,
  food: 0,
  energy: 0,
};

const RESOURCE_ORDER: ResourceId[] = ['metal', 'mineral', 'food', 'energy'];
export const FLEET_CARGO_ORDER: FleetCargoId[] = ['metal', 'mineral', 'food', 'energy', 'workers', 'soldiers'];

const BASE_FLEET_CARGO: FleetCargoLoad = {
  metal: 0,
  mineral: 0,
  food: 0,
  energy: 0,
  workers: 0,
  soldiers: 0,
};

const ANSI_RE = /\u001b\[[0-9;]*m/g;

function safeLower(text: string): string {
  return text.trim().toLowerCase();
}

export function parseHumanNumber(token: string): number {
  const cleaned = token.replace(/,/g, '').trim();
  if (!cleaned) {
    return 0;
  }

  const match = cleaned.match(/^([+-]?\d*\.?\d+)([KMB])?$/i);
  if (!match) {
    const direct = Number(cleaned);
    return Number.isFinite(direct) ? direct : 0;
  }

  const value = Number(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') {
    return value * 1_000;
  }
  if (suffix === 'M') {
    return value * 1_000_000;
  }
  if (suffix === 'B') {
    return value * 1_000_000_000;
  }

  return value;
}

export function formatHumanNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toFixed(0);
}

function parseFleetSpecialCapacities(special: string): { metalCap: number; mineralCap: number; otherCap: number } | null {
  const normalized = special.replace(/,/g, '');
  const match = normalized.match(/Stores up to\s+(\d+)\s+metal\s+and\s+(\d+)\s+mineral;\s+capacity of\s+(\d+)\s+shared/i);
  if (!match) {
    return null;
  }

  return {
    metalCap: Number(match[1]),
    mineralCap: Number(match[2]),
    otherCap: Number(match[3]),
  };
}

function extractResourceBlockDiscord(text: string, snapshot: ParsedSnapshot): void {
  const lineRe = /(Metal|Mineral|Food|Energy)\s+([+-]?\d[\d,.]*\s*[KMB]?)\s+([+-]\d[\d,.]*\s*[KMB]?)\/?tick\s+(\d+)%/gi;

  let match = lineRe.exec(text);
  while (match) {
    const id = safeLower(match[1]) as ResourceId;
    snapshot.resourcesStored[id] = parseHumanNumber(match[2].replace(/\s+/g, ''));
    snapshot.resourcesOutput[id] = parseHumanNumber(match[3].replace(/\s+/g, ''));
    snapshot.abundance[id] = Number(match[4]);
    match = lineRe.exec(text);
  }
}

function extractResourceBlockCtrlA(lines: string[], snapshot: ParsedSnapshot): void {
  const storedIdx = lines.findIndex((line) => safeLower(line) === 'stored');
  const outputIdx = lines.findIndex((line) => safeLower(line) === 'output');
  const abundanceIdx = lines.findIndex((line) => safeLower(line) === 'abundance');

  if (storedIdx < 0 || outputIdx < 0 || abundanceIdx < 0) {
    return;
  }

  const resources: ResourceId[] = ['metal', 'mineral', 'food', 'energy'];
  for (let i = 0; i < resources.length; i += 1) {
    const storedToken = lines[storedIdx + 1 + i] || '0';
    const outputToken = lines[outputIdx + 1 + i] || '0';
    const abundanceToken = lines[abundanceIdx + 1 + i] || '100%';

    snapshot.resourcesStored[resources[i]] = parseHumanNumber(storedToken);
    snapshot.resourcesOutput[resources[i]] = parseHumanNumber(outputToken);
    snapshot.abundance[resources[i]] = Number(abundanceToken.replace('%', '').trim()) || 100;
  }
}

function maybeReadSingleMetric(text: string, key: string): number | undefined {
  const rx = new RegExp(`${key}\\s+([+-]?\\d[\\d,.]*\\s*[KMB]?)`, 'i');
  const match = text.match(rx);
  if (!match) {
    return undefined;
  }

  return parseHumanNumber(match[1].replace(/\s+/g, ''));
}

function parseCountLines(
  lines: string[],
  knownNameToId: Record<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};

  const patterns: RegExp[] = [
    /^(\d[\d,]*)\s*[x×]\s+(.+)$/i,
    /^(.+?)\s+[x×]\s*(\d[\d,]*)$/i,
  ];

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) {
        continue;
      }

      let countToken = '';
      let nameToken = '';

      if (pattern === patterns[0]) {
        countToken = match[1];
        nameToken = match[2];
      } else {
        countToken = match[2];
        nameToken = match[1];
      }

      const normalizedName = safeLower(nameToken.replace(/\(.*\)/g, '').trim());
      const id = knownNameToId[normalizedName];
      if (!id) {
        continue;
      }

      const count = Math.max(0, Math.floor(parseHumanNumber(countToken)));
      out[id] = (out[id] || 0) + count;
      break;
    }
  }

  return out;
}

function normalizeFleetScanText(rawInput: string): string {
  const withoutAnsi = rawInput.replace(ANSI_RE, '');
  let text = withoutAnsi.replace(/\u00a0/g, ' ').replace(/\r/g, '\n');

  // Some full-page copies collapse line breaks and glue words together.
  text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  text = text.replace(/(\d[\d,]*)\s*[x×]\s*/g, '\n$1 x ');
  text = text.replace(/[ \t]{2,}/g, ' ');

  return text;
}

function inferPlayerName(raw: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Unknown';
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const last = tokens[tokens.length - 1] || '';
  if (tokens.length > 1 && /^[a-z_]/.test(last)) {
    return last;
  }

  if (
    tokens.length >= 4
    && /^[a-z]/.test(tokens[tokens.length - 3] || '')
    && /^[A-Z_]/.test(tokens[tokens.length - 2] || '')
  ) {
    return tokens.slice(-2).join(' ');
  }

  if (tokens.length <= 3) {
    return normalized;
  }

  for (let take = Math.min(4, tokens.length); take >= 1; take -= 1) {
    const candidate = tokens.slice(tokens.length - take).join(' ');
    if (/^[A-Z_]/.test(candidate)) {
      return candidate;
    }
  }

  return tokens[tokens.length - 1];
}

function parseFleetScanUnits(block: string, shipNameToId: Record<string, string>): Record<string, number> {
  const blockLines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return parseCountLines(blockLines, shipNameToId);
}

function aggregateFleetScan(
  entries: FleetScanEntry[],
  shipsById: Record<string, ShipDef>,
): { byPlayer: FleetScanSummary[]; byAlliance: FleetScanSummary[] } {
  type Accumulator = {
    label: string;
    fleets: number;
    units: Record<string, number>;
    totalUnits: number;
    totalScoreValue: number;
    totalCost: Record<ResourceId, number>;
    alliances: Set<string>;
  };

  const byPlayer = new Map<string, Accumulator>();
  const byAlliance = new Map<string, Accumulator>();

  const addEntry = (map: Map<string, Accumulator>, key: string, alliance: string, units: Record<string, number>): void => {
    const existing = map.get(key) || {
      label: key,
      fleets: 0,
      units: {},
      totalUnits: 0,
      totalScoreValue: 0,
      totalCost: { ...BASE_RESOURCES },
      alliances: new Set<string>(),
    };

    existing.fleets += 1;
    existing.alliances.add(alliance);

    for (const [id, count] of Object.entries(units)) {
      const safeCount = Math.max(0, Math.floor(count));
      if (safeCount <= 0) {
        continue;
      }

      existing.units[id] = (existing.units[id] || 0) + safeCount;
      existing.totalUnits += safeCount;

      const ship = shipsById[id];
      if (!ship) {
        continue;
      }

      existing.totalScoreValue += ship.scoreValue * safeCount;
      existing.totalCost.metal += ship.costs.metal * safeCount;
      existing.totalCost.mineral += ship.costs.mineral * safeCount;
      existing.totalCost.food += ship.costs.food * safeCount;
      existing.totalCost.energy += ship.costs.energy * safeCount;
    }

    map.set(key, existing);
  };

  for (const entry of entries) {
    addEntry(byPlayer, entry.player, entry.alliance, entry.units);
    addEntry(byAlliance, entry.alliance, entry.alliance, entry.units);
  }

  const toSortedArray = (map: Map<string, Accumulator>, includeAlliances: boolean): FleetScanSummary[] =>
    Array.from(map.values())
      .map((entry) => ({
        label: entry.label,
        fleets: entry.fleets,
        units: entry.units,
        totalUnits: entry.totalUnits,
        totalScoreValue: entry.totalScoreValue,
        totalCost: entry.totalCost,
        alliances: includeAlliances ? Array.from(entry.alliances).sort((a, b) => a.localeCompare(b)) : undefined,
      }))
      .sort((a, b) => b.totalUnits - a.totalUnits || a.label.localeCompare(b.label));

  return {
    byPlayer: toSortedArray(byPlayer, true),
    byAlliance: toSortedArray(byAlliance, false),
  };
}

export function parseFleetScanInput(rawInput: string, defs: GameDefs): FleetScanParseResult {
  const warnings: string[] = [];
  const text = normalizeFleetScanText(rawInput);

  // Matches: [fleet-name/player text] (Alliance) [optional newline] Arriving in N turns [ships...]
  // \s* between ) and Arriving intentionally matches the newline in the new UI format where
  // "Player (Alliance)" and "Arriving in N turns" are on separate lines.
  const entryRx = /([^\n]{1,220}?)\s*\(([^)]+)\)\s*Arriving in(?:\s+(\d+))?\s*turns?([\s\S]*?)(?=(?:[^\n]{1,220}?\s*\([^)]+\)\s*Arriving in(?:\s+\d+)?\s*turns?)|Rules\s*Terms\s*Privacy|$)/gi;

  const entries: FleetScanEntry[] = [];
  let match = entryRx.exec(text);
  while (match) {
    const header = (match[1] || '').trim();
    const alliance = (match[2] || '').trim() || 'Unknown';
    const turns = match[3] ? Number(match[3]) : null;
    const units = parseFleetScanUnits(match[4] || '', defs.shipNameToId);

    const player = inferPlayerName(header);
    const fleetName = header;

    if (Object.keys(units).length > 0) {
      entries.push({
        fleetName,
        player,
        alliance,
        arrivalTurns: Number.isFinite(turns as number) ? turns : null,
        units,
      });
    }

    match = entryRx.exec(text);
  }

  if (entries.length === 0) {
    warnings.push('No fleet scan entries detected. Paste the Fleet Scan Result page — each fleet needs a "Player (Alliance)" line followed by "Arriving in N turns".');
  }

  const aggregates = aggregateFleetScan(entries, defs.shipsById);

  return {
    entries,
    byPlayer: aggregates.byPlayer,
    byAlliance: aggregates.byAlliance,
    warnings,
  };
}

function idLabelShort(id: string): string {
  const parts = id.split('_');
  if (parts.length > 1) {
    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  return `${id.charAt(0).toUpperCase()}${id.slice(1, 3)}`;
}

function fitTableCell(value: string, width: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= width) {
    return clean;
  }

  return `${clean.slice(0, Math.max(1, width - 1))}~`;
}

function leftTableCell(value: string, width: number): string {
  return fitTableCell(value, width).padEnd(width, ' ');
}

function rightTableCell(value: string, width: number): string {
  return fitTableCell(value, width).padStart(width, ' ');
}

function tableDivider(widths: number[]): string {
  return widths.map((width) => '-'.repeat(width)).join('  ');
}

function fleetScanTableRow(
  row: FleetScanSummary,
  shipIds: string[],
  widths: number[],
): string {
  const cells = [
    leftTableCell(row.label, widths[0]),
    rightTableCell(String(row.fleets), widths[1]),
    rightTableCell(formatHumanNumber(row.totalUnits), widths[2]),
    rightTableCell(formatHumanNumber(row.totalScoreValue), widths[3]),
  ];

  shipIds.forEach((id, index) => {
    cells.push(rightTableCell(formatHumanNumber(row.units[id] || 0), widths[4 + index]));
  });

  return cells.join('  ');
}

function fleetScanTable(
  title: string,
  nameHeader: string,
  rows: FleetScanSummary[],
  shipIds: string[],
  maxNameWidth: number,
): string[] {
  const labels = shipIds.map(idLabelShort);
  const widths = [
    Math.min(maxNameWidth, Math.max(nameHeader.length, ...rows.map((row) => row.label.length))),
    Math.max(3, ...rows.map((row) => String(row.fleets).length)),
    Math.max(5, ...rows.map((row) => formatHumanNumber(row.totalUnits).length)),
    Math.max(5, ...rows.map((row) => formatHumanNumber(row.totalScoreValue).length)),
    ...labels.map((label, index) => Math.max(label.length, ...rows.map((row) => formatHumanNumber(row.units[shipIds[index]] || 0).length))),
  ];
  const header = [
    leftTableCell(nameHeader, widths[0]),
    rightTableCell('Flt', widths[1]),
    rightTableCell('Units', widths[2]),
    rightTableCell('Score', widths[3]),
    ...labels.map((label, index) => rightTableCell(label, widths[4 + index])),
  ].join('  ');

  return [
    title,
    header,
    tableDivider(widths),
    ...rows.map((row) => fleetScanTableRow(row, shipIds, widths)),
  ];
}

export function formatFleetScanAsDiscord(result: FleetScanParseResult, shipIds: string[]): string {
  if (result.entries.length === 0) {
    return '';
  }

  const totalScore = result.byAlliance.reduce((sum, row) => sum + row.totalScoreValue, 0);
  const totalUnits = result.byAlliance.reduce((sum, row) => sum + row.totalUnits, 0);
  const bodyLines = [
    'Fleet Scan Summary',
    `Fleets ${result.entries.length} | Players ${result.byPlayer.length} | Alliances ${result.byAlliance.length} | Units ${formatHumanNumber(totalUnits)} | Score ${formatHumanNumber(totalScore)}`,
    '',
    ...fleetScanTable('By Alliance', 'Alliance', result.byAlliance, shipIds, 24),
    '',
    ...fleetScanTable('By Player', 'Player', result.byPlayer, shipIds, 22),
  ];

  return `\`\`\`\n${bodyLines.join('\n').trim()}\n\`\`\``;
}

function emptyFleetCargo(): FleetCargoLoad {
  return { ...BASE_FLEET_CARGO };
}

function parseEtaToken(token: string): number | null {
  const match = token.trim().match(/^(\d+)t$/i);
  return match ? Number(match[1]) : null;
}

function looksLikeCargoToken(token: string): boolean {
  return /^-?\d[\d,.]*(?:[KMB])?$/i.test(token.trim());
}

function parseCargoToken(token: string): number {
  return Math.max(0, Math.floor(parseHumanNumber(token.replace(/\s+/g, ''))));
}

function hasLoadedCargo(cargo: FleetCargoLoad): boolean {
  return cargo.metal > 0
    || cargo.mineral > 0
    || cargo.food > 0
    || cargo.energy > 0
    || cargo.soldiers > 0;
}

function addCargo(target: FleetCargoLoad, source: FleetCargoLoad): void {
  for (const id of FLEET_CARGO_ORDER) {
    target[id] += source[id];
  }
}

function cargoFromCells(cells: string[]): FleetCargoLoad {
  const cargo = emptyFleetCargo();
  FLEET_CARGO_ORDER.forEach((id, index) => {
    const cell = cells[index]?.trim() || '';
    cargo[id] = cell ? parseCargoToken(cell) : 0;
  });
  return cargo;
}

function cargoFromCompactTokens(tokens: string[]): FleetCargoLoad {
  const cargo = emptyFleetCargo();
  tokens.slice(0, FLEET_CARGO_ORDER.length).forEach((token, index) => {
    cargo[FLEET_CARGO_ORDER[index]] = parseCargoToken(token);
  });
  return cargo;
}

function splitPlaceAndCoords(raw: string): { name: string; coords: string } {
  const match = raw.match(/^(.*?)(\d+:\d+:\d+)$/);
  if (!match) {
    return { name: raw.trim(), coords: '' };
  }

  return {
    name: match[1].trim(),
    coords: match[2],
  };
}

function parseRouteCell(route: string): {
  originName: string;
  originCoords: string;
  destinationName: string;
  destinationCoords: string;
} {
  const [originRaw, destinationRaw = ''] = route.split('→').map((part) => part.trim());
  const origin = splitPlaceAndCoords(originRaw);
  const destination = splitPlaceAndCoords(destinationRaw);
  return {
    originName: origin.name,
    originCoords: origin.coords,
    destinationName: destination.name || origin.name,
    destinationCoords: destination.coords || origin.coords,
  };
}

function parseFleetOverviewTableRows(rawInput: string): FleetOverviewEntry[] {
  const rows = rawInput
    .replace(ANSI_RE, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.includes('\t'));
  const entries: FleetOverviewEntry[] = [];

  for (const row of rows) {
    const cells = row.split('\t').map((cell) => cell.trim());
    if (cells.length < 10 || safeLower(cells[0]) === 'name') {
      continue;
    }

    const route = parseRouteCell(cells[2] || '');
    const etaTurns = parseEtaToken(cells[9] || '');
    const cargo = cargoFromCells(cells.slice(3, 9));
    entries.push({
      fleetName: cells[0] || 'Unknown fleet',
      status: cells[1] || 'Unknown',
      ...route,
      etaTurns,
      cargo,
      isNonEmpty: hasLoadedCargo(cargo),
    });
  }

  return entries;
}

function readFleetOverviewPlace(lines: string[], startIndex: number): {
  name: string;
  coords: string;
  nextIndex: number;
} {
  const parts: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    const coordMatch = line.match(/(.*?)(\d+:\d+:\d+)$/);
    if (coordMatch) {
      const name = [...parts, coordMatch[1].trim()].filter(Boolean).join(' ').trim();
      return {
        name,
        coords: coordMatch[2],
        nextIndex: index + 1,
      };
    }

    parts.push(line);
    index += 1;
  }

  return {
    name: parts.join(' ').trim(),
    coords: '',
    nextIndex: index,
  };
}

function parseFleetOverviewLineRows(rawInput: string, warnings: string[]): FleetOverviewEntry[] {
  const lines = rawInput
    .replace(ANSI_RE, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: FleetOverviewEntry[] = [];
  const statuses = new Set(['Moving', 'Waiting']);
  const sparseFleets: string[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const status = lines[index];
    if (!statuses.has(status)) {
      continue;
    }

    const fleetName = lines[index - 1];
    let cursor = index + 1;
    const origin = readFleetOverviewPlace(lines, cursor);
    cursor = origin.nextIndex;

    let destination = origin;
    if (lines[cursor] === '→') {
      destination = readFleetOverviewPlace(lines, cursor + 1);
      cursor = destination.nextIndex;
    }

    const cargoTokens: string[] = [];
    let etaTurns: number | null = null;
    while (cursor < lines.length) {
      if (cursor + 1 < lines.length && statuses.has(lines[cursor + 1])) {
        break;
      }

      const eta = parseEtaToken(lines[cursor]);
      if (eta !== null) {
        etaTurns = eta;
        cursor += 1;
        break;
      }

      if (looksLikeCargoToken(lines[cursor])) {
        cargoTokens.push(lines[cursor]);
      }
      cursor += 1;
    }

    // Fewer than 4 values means empty cargo columns were dropped by the plain-text copy.
    // Workers and Soldiers are the last columns and most likely to be shifted left.
    if (cargoTokens.length > 0 && cargoTokens.length < 4) {
      sparseFleets.push(fleetName);
    }

    const cargo = cargoFromCompactTokens(cargoTokens);
    entries.push({
      fleetName,
      status,
      originName: origin.name,
      originCoords: origin.coords,
      destinationName: destination.name || origin.name,
      destinationCoords: destination.coords || origin.coords,
      etaTurns,
      cargo,
      isNonEmpty: hasLoadedCargo(cargo),
    });
  }

  if (sparseFleets.length > 0) {
    warnings.push(
      `Plain-text copy dropped empty cargo columns — soldiers/workers may be wrong for: ${sparseFleets.join(', ')}. `
      + 'Fix: select the fleet table in-browser and paste with tab columns preserved (not Ctrl+A whole page). '
      + 'Tab format keeps column positions so soldiers land in the Soldier column instead of Metal.',
    );
  }

  return entries;
}

function buildFleetOverviewDestinations(entries: FleetOverviewEntry[]): FleetOverviewDestinationSummary[] {
  const byDestination = new Map<string, FleetOverviewEntry[]>();
  for (const entry of entries) {
    if (entry.etaTurns === null || !entry.isNonEmpty) {
      continue;
    }

    const key = `${entry.destinationCoords || 'unknown'}|${entry.destinationName || 'Unknown'}`;
    const existing = byDestination.get(key) || [];
    existing.push(entry);
    byDestination.set(key, existing);
  }

  return Array.from(byDestination.values())
    .map((destinationEntries) => {
      const first = destinationEntries[0];
      const byEta = new Map<number, { fleets: number; cargo: FleetCargoLoad }>();
      for (const entry of destinationEntries) {
        const existing = byEta.get(entry.etaTurns as number) || { fleets: 0, cargo: emptyFleetCargo() };
        existing.fleets += 1;
        addCargo(existing.cargo, entry.cargo);
        byEta.set(entry.etaTurns as number, existing);
      }

      const cumulative = emptyFleetCargo();
      const rows = Array.from(byEta.entries())
        .sort(([a], [b]) => a - b)
        .map(([etaTurns, value]) => {
          addCargo(cumulative, value.cargo);
          return {
            etaTurns,
            arrivingFleets: value.fleets,
            cumulative: { ...cumulative },
          };
        });

      return {
        destinationName: first.destinationName || 'Unknown',
        destinationCoords: first.destinationCoords,
        fleets: destinationEntries.length,
        rows,
      };
    })
    .sort((a, b) => (a.rows[0]?.etaTurns || 0) - (b.rows[0]?.etaTurns || 0) || a.destinationName.localeCompare(b.destinationName));
}

export function parseFleetOverviewInput(rawInput: string): FleetOverviewParseResult {
  const warnings: string[] = [];
  let entries = parseFleetOverviewTableRows(rawInput);

  if (entries.length === 0) {
    entries = parseFleetOverviewLineRows(rawInput, warnings);
  }

  if (entries.length === 0) {
    warnings.push('No fleet overview rows were detected. Paste the Fleets page table including Status, Route, cargo, and ETA columns.');
  }

  return {
    entries,
    destinations: buildFleetOverviewDestinations(entries),
    warnings,
  };
}

function fleetCargoLabel(id: FleetCargoId): string {
  if (id === 'workers') {
    return 'Worker';
  }
  if (id === 'soldiers') {
    return 'Soldier';
  }
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function fleetOverviewDiscordRows(destination: FleetOverviewDestinationSummary): string[] {
  const widths = [
    4,
    Math.max(3, ...destination.rows.map((row) => String(row.arrivingFleets).length)),
    ...FLEET_CARGO_ORDER.map((id) => Math.max(
      fleetCargoLabel(id).length,
      ...destination.rows.map((row) => formatHumanNumber(row.cumulative[id]).length),
    )),
  ];
  const header = [
    leftTableCell('ETA', widths[0]),
    rightTableCell('Arr', widths[1]),
    ...FLEET_CARGO_ORDER.map((id, index) => rightTableCell(fleetCargoLabel(id), widths[index + 2])),
  ].join('  ');
  const rows = destination.rows.map((row) => [
    leftTableCell(`${row.etaTurns}t`, widths[0]),
    rightTableCell(String(row.arrivingFleets), widths[1]),
    ...FLEET_CARGO_ORDER.map((id, index) => rightTableCell(formatHumanNumber(row.cumulative[id]), widths[index + 2])),
  ].join('  '));

  return [
    `${destination.destinationName || 'Unknown destination'} ${destination.destinationCoords || ''}`.trim(),
    header,
    tableDivider(widths),
    ...rows,
  ];
}

export function formatFleetOverviewAsDiscord(result: FleetOverviewParseResult): string {
  if (result.destinations.length === 0) {
    return '';
  }

  const totalFleets = result.destinations.reduce((sum, row) => sum + row.fleets, 0);
  const bodyLines = [
    'Fleet Overview ETA Cargo',
    `Destinations ${result.destinations.length} | Loaded fleets ${totalFleets}`,
    '',
    ...result.destinations.flatMap((destination, index) => {
      const lines = fleetOverviewDiscordRows(destination);
      return index === 0 ? lines : ['', ...lines];
    }),
  ];

  return `\`\`\`\n${bodyLines.join('\n').trim()}\n\`\`\``;
}

export function buildGameDefs(gameData: any): GameDefs {
  const shipsById: Record<string, ShipDef> = {};
  const shipsByName: Record<string, ShipDef> = {};
  const shipNameToId: Record<string, string> = {};
  const cargoShips: CargoShipDef[] = [];
  const structuresById: Record<string, BuildingDef> = {};
  const structureNameToId: Record<string, string> = {};

  const units: any[] = Array.isArray(gameData?.units) ? gameData.units : [];
  for (const unit of units) {
    if (unit?.category !== 'ship') {
      continue;
    }

    const costs: Record<ResourceId, number> = { ...BASE_RESOURCES };
    for (const cost of unit.cost || []) {
      if (cost?.type === 'resource' && cost.id in costs) {
        costs[cost.id as ResourceId] = Number(cost.amount || 0);
      }
    }

    const ship: ShipDef = {
      id: String(unit.id),
      name: String(unit.name),
      scoreValue: Number(unit.score_value || 0),
      costs,
    };

    shipsById[ship.id] = ship;
    shipsByName[safeLower(ship.name)] = ship;
    shipNameToId[safeLower(ship.name)] = ship.id;

    const capacities = typeof unit.special === 'string' ? parseFleetSpecialCapacities(unit.special) : null;
    if (capacities) {
      cargoShips.push({
        id: ship.id,
        name: ship.name,
        metalCap: capacities.metalCap,
        mineralCap: capacities.mineralCap,
        otherCap: capacities.otherCap,
        scoreValue: ship.scoreValue,
        costs,
      });
    }
  }

  cargoShips.sort((a, b) => b.otherCap - a.otherCap);

  const structures: any[] = Array.isArray(gameData?.structures) ? gameData.structures : [];
  for (const structure of structures) {
    const id = String(structure.id);
    const name = String(structure.name);

    const production: Partial<Record<ResourceId, number>> = {};
    const productionIsAbundanceScaled: Partial<Record<ResourceId, boolean>> = {};
    for (const entry of structure?.operations?.production || []) {
      const resource = safeLower(String(entry.type)) as ResourceId;
      if (RESOURCE_ORDER.includes(resource)) {
        production[resource] = Number(entry.base_amount || 0);
        productionIsAbundanceScaled[resource] = Boolean(entry.is_abundance_scaled);
      }
    }

    const upkeep: Partial<Record<ResourceId, number>> = {};
    for (const entry of structure?.operations?.consumption || []) {
      if (entry?.type === 'resource') {
        const resource = safeLower(String(entry.id || '')) as ResourceId;
        if (RESOURCE_ORDER.includes(resource)) {
          upkeep[resource] = Number(entry.amount || 0);
        }
      }
    }

    let groundSpaceCost = 0;
    let orbitalSpaceCost = 0;
    for (const entry of structure?.build_requirements?.space_cost || []) {
      if (entry.type === 'ground_space') {
        groundSpaceCost += Number(entry.amount || 0);
      }
      if (entry.type === 'orbital_space') {
        orbitalSpaceCost += Number(entry.amount || 0);
      }
    }

    const requirements: string[] = (structure.requirements || [])
      .filter((req: any) => req?.type === 'structure' && req?.id)
      .map((req: any) => String(req.id));

    structuresById[id] = {
      id,
      name,
      scoreValue: Number(structure.score_value || 0),
      workerCost: Number(structure?.build_requirements?.workers_occupied || 0),
      groundSpaceCost,
      orbitalSpaceCost,
      requirements,
      production,
      productionIsAbundanceScaled,
      upkeep,
    };

    structureNameToId[safeLower(name)] = id;
  }

  return {
    shipsById,
    shipsByName,
    cargoShips,
    structuresById,
    structureNameToId,
    shipNameToId,
  };
}

export function parseSnapshotInput(rawInput: string, defs: GameDefs): ParsedSnapshot {
  const warnings: string[] = [];
  const withoutAnsi = rawInput.replace(ANSI_RE, '');
  const text = withoutAnsi.replace(/\r/g, '\n');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  const snapshot: ParsedSnapshot = {
    resourcesStored: { ...BASE_RESOURCES },
    resourcesOutput: { ...BASE_RESOURCES },
    abundance: { metal: 100, mineral: 100, food: 100, energy: 100 },
    structures: {},
    ships: {},
    warnings,
  };

  const planetMatch = text.match(/Command\s*\/\s*Planets\s*\/\s*([^\n]+)/i);
  if (planetMatch) {
    snapshot.planetName = planetMatch[1].trim();
  }

  const assetScoreMatch = text.match(/Asset Score\s+([\d.,]+\s*[KMB]?)/i);
  if (assetScoreMatch) {
    snapshot.assetScore = parseHumanNumber(assetScoreMatch[1].replace(/\s+/g, ''));
  }

  extractResourceBlockDiscord(text, snapshot);
  extractResourceBlockCtrlA(lines, snapshot);

  snapshot.workersTotal = maybeReadSingleMetric(text, 'Worker\\s+([0-9.,]+\\s*[KMB]?)\\s*\\/');
  if (!snapshot.workersTotal) {
    snapshot.workersTotal = maybeReadSingleMetric(text, 'Worker');
  }
  snapshot.workersBusy = maybeReadSingleMetric(text, 'busy\\)') || maybeReadSingleMetric(text, 'workers busy');

  const busyMatch = text.match(/\(([\d.,]+\s*[KMB]?)\s+busy\)/i);
  if (busyMatch) {
    snapshot.workersBusy = parseHumanNumber(busyMatch[1].replace(/\s+/g, ''));
  }

  if (snapshot.workersTotal !== undefined && snapshot.workersBusy !== undefined) {
    snapshot.workersFree = Math.max(0, snapshot.workersTotal - snapshot.workersBusy);
  }

  snapshot.soldiers = maybeReadSingleMetric(text, 'Soldier');
  snapshot.scientists = maybeReadSingleMetric(text, 'Scientist');
  snapshot.groundSpaceFree = maybeReadSingleMetric(text, 'Ground Space');
  snapshot.orbitalSpaceFree = maybeReadSingleMetric(text, 'Orbital Space');

  snapshot.structures = parseCountLines(lines, defs.structureNameToId);
  snapshot.ships = parseCountLines(lines, defs.shipNameToId);

  const parsedResourceCount = RESOURCE_ORDER.filter((resource) => snapshot.resourcesStored[resource] > 0 || snapshot.resourcesOutput[resource] !== 0).length;
  if (parsedResourceCount < 2) {
    warnings.push('Could not confidently parse full resource rows. You may need to paste a larger section.');
  }

  if (!Object.keys(snapshot.structures).length) {
    warnings.push('No structure counts found. Build optimizer will use empty current structures.');
  }

  if (!Object.keys(snapshot.ships).length) {
    warnings.push('No ship counts found in the paste. Fleet calculators can still use manual composition input.');
  }

  return snapshot;
}

function weightedResourceValue(resources: Record<ResourceId, number>): number {
  return (resources.metal * RESOURCE_SCORE_VALUES.metal)
    + (resources.mineral * RESOURCE_SCORE_VALUES.mineral)
    + (resources.food * RESOURCE_SCORE_VALUES.food)
    + (resources.energy * RESOURCE_SCORE_VALUES.energy);
}

function subtractResources(left: Record<ResourceId, number>, right: Record<ResourceId, number>): Record<ResourceId, number> {
  return {
    metal: left.metal - right.metal,
    mineral: left.mineral - right.mineral,
    food: left.food - right.food,
    energy: left.energy - right.energy,
  };
}

function addResources(left: Record<ResourceId, number>, right: Record<ResourceId, number>): Record<ResourceId, number> {
  return {
    metal: left.metal + right.metal,
    mineral: left.mineral + right.mineral,
    food: left.food + right.food,
    energy: left.energy + right.energy,
  };
}

export function calculateCargoPlan(snapshot: ParsedSnapshot, cargoShips: CargoShipDef[]): CargoPlan | null {
  if (!cargoShips.length) {
    return null;
  }

  const targetMetal = snapshot.resourcesStored.metal;
  const targetMineral = snapshot.resourcesStored.mineral;
  const targetOther = snapshot.resourcesStored.food + snapshot.resourcesStored.energy;

  if (targetMetal <= 0 && targetMineral <= 0 && targetOther <= 0) {
    return {
      shipCounts: {},
      totals: { metalCap: 0, mineralCap: 0, otherCap: 0, ships: 0 },
      overflow: { metal: 0, mineral: 0, other: 0 },
    };
  }

  const freighter = cargoShips[cargoShips.length - 1];
  const bestShip = cargoShips[0];
  const maxByBest = Math.ceil(
    Math.max(
      targetMetal / Math.max(1, bestShip.metalCap),
      targetMineral / Math.max(1, bestShip.mineralCap),
      targetOther / Math.max(1, bestShip.otherCap),
    ),
  ) + 8;

  let best: CargoPlan | null = null;

  const first = cargoShips[0];
  const second = cargoShips[1] || cargoShips[0];

  for (let i = 0; i <= maxByBest; i += 1) {
    for (let j = 0; j <= maxByBest; j += 1) {
      const capMetal = i * first.metalCap + j * second.metalCap;
      const capMineral = i * first.mineralCap + j * second.mineralCap;
      const capOther = i * first.otherCap + j * second.otherCap;

      const neededFreighters = Math.max(
        0,
        Math.ceil((targetMetal - capMetal) / Math.max(1, freighter.metalCap)),
        Math.ceil((targetMineral - capMineral) / Math.max(1, freighter.mineralCap)),
        Math.ceil((targetOther - capOther) / Math.max(1, freighter.otherCap)),
      );

      const totalMetal = capMetal + neededFreighters * freighter.metalCap;
      const totalMineral = capMineral + neededFreighters * freighter.mineralCap;
      const totalOther = capOther + neededFreighters * freighter.otherCap;

      const overflowMetal = Math.max(0, totalMetal - targetMetal);
      const overflowMineral = Math.max(0, totalMineral - targetMineral);
      const overflowOther = Math.max(0, totalOther - targetOther);

      const shipCounts: Record<string, number> = {};
      if (i > 0) {
        shipCounts[first.id] = i;
      }
      if (j > 0) {
        shipCounts[second.id] = (shipCounts[second.id] || 0) + j;
      }
      if (neededFreighters > 0) {
        shipCounts[freighter.id] = (shipCounts[freighter.id] || 0) + neededFreighters;
      }

      const ships = i + j + neededFreighters;
      const overflowPenalty = overflowMetal + overflowMineral + overflowOther;

      const candidate: CargoPlan = {
        shipCounts,
        totals: {
          metalCap: totalMetal,
          mineralCap: totalMineral,
          otherCap: totalOther,
          ships,
        },
        overflow: {
          metal: overflowMetal,
          mineral: overflowMineral,
          other: overflowOther,
        },
      };

      if (!best) {
        best = candidate;
        continue;
      }

      const bestPenalty = best.overflow.metal + best.overflow.mineral + best.overflow.other;
      if (overflowPenalty < bestPenalty || (overflowPenalty === bestPenalty && ships < best.totals.ships)) {
        best = candidate;
      }
    }
  }

  return best;
}

export interface FreighterRoundTripRow {
  resource: ResourceId;
  label: string;
  perTick: number;
  cap: number;
  freighters: number[];
}

export interface FreighterRoundTripResult {
  tripOneTimes: number[];
  rows: FreighterRoundTripRow[];
  totals: number[];
}

const FREIGHTER_CAPS: Record<ResourceId, number> = {
  metal: 120_000,
  mineral: 80_000,
  food: 40_000,
  energy: 40_000,
};

const RESOURCE_LABELS: Record<ResourceId, string> = {
  metal: 'Metal',
  mineral: 'Mineral',
  food: 'Food',
  energy: 'Energy',
};

export function calculateFreighterRoundTrip(
  output: Record<ResourceId, number>,
  tripOneTimes: number[],
): FreighterRoundTripResult {
  const rows: FreighterRoundTripRow[] = RESOURCE_ORDER.map((res) => {
    const perTick = Math.max(0, output[res] ?? 0);
    const cap = FREIGHTER_CAPS[res];
    const freighters = tripOneTimes.map((t) => (perTick > 0 ? Math.ceil((perTick * t * 2) / cap) : 0));
    return { resource: res, label: RESOURCE_LABELS[res], perTick, cap, freighters };
  });

  const totals = tripOneTimes.map((_, i) => Math.max(...rows.map((r) => r.freighters[i])));

  return { tripOneTimes, rows, totals };
}

export function parseRatioInput(ratioInput: string, nameToId: Record<string, string>): Record<string, number> {
  const normalized = ratioInput
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const out: Record<string, number> = {};

  for (const token of normalized) {
    const match = token.match(/^(.+?)\s*[:=]\s*(\d*\.?\d+)$/);
    if (!match) {
      continue;
    }

    const name = safeLower(match[1]);
    const id = nameToId[name] || name;
    const weight = Number(match[2]);
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }

    out[id] = weight;
  }

  return out;
}

export function parseCompositionInput(compositionInput: string, nameToId: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  const lines = compositionInput.split(/\n|,/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const matchA = line.match(/^(\d[\d,]*)\s*[x×]?\s+(.+)$/i);
    const matchB = line.match(/^(.+?)\s*[x×:]\s*(\d[\d,]*)$/i);

    let count = 0;
    let name = '';

    if (matchA) {
      count = Math.floor(parseHumanNumber(matchA[1]));
      name = safeLower(matchA[2]);
    } else if (matchB) {
      count = Math.floor(parseHumanNumber(matchB[2]));
      name = safeLower(matchB[1]);
    } else {
      continue;
    }

    const id = nameToId[name] || name;
    if (!count || count < 0) {
      continue;
    }

    out[id] = (out[id] || 0) + count;
  }

  return out;
}

export function calculateFleetScoreBreakdown(composition: Record<string, number>, shipsById: Record<string, ShipDef>): FleetScoreBreakdown {
  const entries: FleetEntryBreakdown[] = [];
  const totalCost: Record<ResourceId, number> = { ...BASE_RESOURCES };

  let totalScoreValue = 0;

  for (const [id, countRaw] of Object.entries(composition)) {
    const ship = shipsById[id];
    if (!ship) {
      continue;
    }

    const count = Math.max(0, Math.floor(countRaw));
    const shipCost: Record<ResourceId, number> = {
      metal: ship.costs.metal * count,
      mineral: ship.costs.mineral * count,
      food: ship.costs.food * count,
      energy: ship.costs.energy * count,
    };

    totalCost.metal += shipCost.metal;
    totalCost.mineral += shipCost.mineral;
    totalCost.food += shipCost.food;
    totalCost.energy += shipCost.energy;

    const totalShipScore = ship.scoreValue * count;
    totalScoreValue += totalShipScore;

    const weightedCost = weightedResourceValue(ship.costs);
    const scorePerWeightedK = weightedCost > 0 ? ship.scoreValue / (weightedCost / 1000) : 0;

    entries.push({
      id: ship.id,
      name: ship.name,
      count,
      scoreValue: ship.scoreValue,
      totalScoreValue: totalShipScore,
      totalDisplayedScore: totalShipScore / 1000,
      weightedCost,
      scorePerWeightedK,
    });
  }

  entries.sort((a, b) => b.totalScoreValue - a.totalScoreValue);

  const weightedCost = weightedResourceValue(totalCost);
  const totalDisplayedScore = totalScoreValue / 1000;

  return {
    entries,
    totalScoreValue,
    totalDisplayedScore,
    totalCost,
    weightedCost,
    scorePerWeightedK: weightedCost > 0 ? totalScoreValue / (weightedCost / 1000) : 0,
  };
}

export function calculateFleetBalancePlan(current: Record<string, number>, targetWeights: Record<string, number>): FleetBalancePlan {
  const filteredWeights = Object.entries(targetWeights)
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .reduce<Record<string, number>>((acc, [id, weight]) => {
      acc[id] = weight;
      return acc;
    }, {});

  if (!Object.keys(filteredWeights).length) {
    return {
      targetWeights: {},
      additions: {},
      resulting: { ...current },
      scale: 0,
    };
  }

  let minScale = 0;
  for (const [id, weight] of Object.entries(filteredWeights)) {
    const count = current[id] || 0;
    minScale = Math.max(minScale, count / weight);
  }

  const additions: Record<string, number> = {};
  const resulting: Record<string, number> = { ...current };

  for (const [id, weight] of Object.entries(filteredWeights)) {
    const target = Math.ceil(minScale * weight);
    const currentCount = current[id] || 0;
    const needed = Math.max(0, target - currentCount);
    additions[id] = needed;
    resulting[id] = currentCount + needed;
  }

  return {
    targetWeights: filteredWeights,
    additions,
    resulting,
    scale: minScale,
  };
}

function buildingIsAvailable(def: BuildingDef, built: Record<string, number>): boolean {
  for (const req of def.requirements) {
    if ((built[req] || 0) <= 0) {
      return false;
    }
  }

  return true;
}

function computeBuildingOutputDelta(def: BuildingDef, abundance: Record<ResourceId, number>): Record<ResourceId, number> {
  const out: Record<ResourceId, number> = { ...BASE_RESOURCES };

  for (const resource of RESOURCE_ORDER) {
    const baseProduction = def.production[resource] || 0;
    if (baseProduction > 0) {
      const scale = def.productionIsAbundanceScaled[resource] ? (abundance[resource] || 100) / 100 : 1;
      out[resource] += baseProduction * scale;
    }

    const upkeep = def.upkeep[resource] || 0;
    if (upkeep > 0) {
      out[resource] -= upkeep;
    }
  }

  return out;
}

// ─── Formula Build Recommendation ───────────────────────────────────────────
// Direct algebraic recommendation: no greedy iteration needed.
//
// Key equivalences at any tier (derived from net weighted output):
//   Metal Mine vs Mineral Extractor → compare metal% vs mineral% (same formula 3×abund − upkeep)
//   Hydroponics Dome vs Solar Station → food wins when food% > energy% + 2
//   Hydroponics Lab vs Solar Array   → food wins when food% > energy% + 6.67
//   T1 ground 4-way: rank by (base × abund × resource_score − energy_upkeep×2)

export interface FormulaBuildGroup {
  buildingId: string;
  buildingName: string;
  count: number;
  scoreDelta: number;
  outputDelta: Record<ResourceId, number>;
  workerCost: number;
  spaceCost: number;
  spaceType: 'ground' | 'orbital';
}

export interface FormulaBuildResult {
  groups: FormulaBuildGroup[];
  totalScoreDelta: number;
  totalOutputDelta: Record<ResourceId, number>;
  groundSpaceUsed: number;
  orbitalSpaceUsed: number;
  workersUsed: number;
  groundSpaceRemaining: number;
  orbitalSpaceRemaining: number;
  workersRemaining: number;
  groundReason: string;
  orbitalT2Reason: string;
  orbitalT3Reason: string;
}

function makeBuildGroup(
  def: BuildingDef,
  count: number,
  abundance: Record<ResourceId, number>,
  spaceType: 'ground' | 'orbital',
): FormulaBuildGroup {
  const perBuilding = computeBuildingOutputDelta(def, abundance);
  const outputDelta: Record<ResourceId, number> = { ...BASE_RESOURCES };
  for (const r of RESOURCE_ORDER) {
    outputDelta[r] = (perBuilding[r] || 0) * count;
  }
  return {
    buildingId: def.id,
    buildingName: def.name,
    count,
    scoreDelta: def.scoreValue * count,
    outputDelta,
    workerCost: def.workerCost * count,
    spaceCost: (spaceType === 'ground' ? def.groundSpaceCost : def.orbitalSpaceCost) * count,
    spaceType,
  };
}

export function formulaBuildRecommendation(
  snapshot: ParsedSnapshot,
  structuresById: Record<string, BuildingDef>,
): FormulaBuildResult {
  const built = snapshot.structures;
  const abund = snapshot.abundance;
  const m = abund.metal ?? 100;
  const n = abund.mineral ?? 100;
  const f = abund.food ?? 100;
  const e = abund.energy ?? 100;

  let groundFree = Math.max(0, snapshot.groundSpaceFree ?? 0);
  let orbitalFree = Math.max(0, snapshot.orbitalSpaceFree ?? 0);
  let workersFree = Math.max(0, snapshot.workersFree ?? 0);

  const hasOutpost = (built['outpost'] || 0) > 0;
  const hasColony = (built['colony'] || 0) > 0;
  const hasMetropolis = (built['metropolis'] || 0) > 0;
  const hasLaunchSite = (built['launch_site'] || 0) > 0;

  // Formula reasoning strings
  const groundReason = m >= n
    ? `Metal ${m.toFixed(0)}% ≥ Mineral ${n.toFixed(0)}% → Metal buildings`
    : `Mineral ${n.toFixed(0)}% > Metal ${m.toFixed(0)}% → Mineral buildings`;

  const orbT2Threshold = 40 / 6;
  const orbT2Reason = f >= e + orbT2Threshold
    ? `Food ${f.toFixed(0)}% > Energy ${e.toFixed(0)}%+${orbT2Threshold.toFixed(1)}% → Hydroponics Lab`
    : `Food ${f.toFixed(0)}% ≤ Energy ${e.toFixed(0)}%+${orbT2Threshold.toFixed(1)}% → Solar Array`;

  const orbT3Threshold = 120 / 60;
  const orbT3Reason = f >= e + orbT3Threshold
    ? `Food ${f.toFixed(0)}% > Energy ${e.toFixed(0)}%+${orbT3Threshold.toFixed(1)}% → Hydroponics Dome`
    : `Food ${f.toFixed(0)}% ≤ Energy ${e.toFixed(0)}%+${orbT3Threshold.toFixed(1)}% → Solar Station`;

  const groups: FormulaBuildGroup[] = [];

  function tryAdd(id: string, spaceCost: number, workerCost: number, spaceLeft: number, spaceType: 'ground' | 'orbital'): number {
    const def = structuresById[id];
    if (!def || spaceCost <= 0 || workerCost < 0) {
      return 0;
    }
    const bySpace = Math.floor(spaceLeft / spaceCost);
    const byWorker = workerCost > 0 ? Math.floor(workersFree / workerCost) : bySpace;
    const count = Math.min(bySpace, byWorker);
    if (count <= 0) {
      return 0;
    }
    groups.push(makeBuildGroup(def, count, abund, spaceType));
    workersFree -= workerCost * count;
    return count;
  }

  // ── Ground space: T3 → T2 → T1 ──────────────────────────────────────────
  if (hasMetropolis) {
    const id = m >= n ? 'strip_metal_mine' : 'strip_mineral_extractor';
    const built_ = tryAdd(id, 6, 200_000, groundFree, 'ground');
    groundFree -= built_ * 6;
  }

  if (hasColony) {
    const id = m >= n ? 'core_metal_mine' : 'core_mineral_extractor';
    const built_ = tryAdd(id, 2, 40_000, groundFree, 'ground');
    groundFree -= built_ * 2;
  }

  if (hasOutpost && groundFree > 0) {
    // Rank T1 options by net weighted output at current abundances
    // Metal mine: 300*m/100*1 − 10*2 = 3m − 20
    // Mineral extractor: 200*n/100*1.5 − 10*2 = 3n − 20
    // Solar generator: 100*e/100*2 − 0 = 2e
    // Farm: 100*f/100*2 − 10*2 = 2f − 20
    const t1Options: Array<{ id: string; net: number }> = [
      { id: 'metal_mine', net: 3 * m - 20 },
      { id: 'mineral_extractor', net: 3 * n - 20 },
      { id: 'solar_generator', net: 2 * e },
      { id: 'farm', net: 2 * f - 20 },
    ].sort((a, b) => b.net - a.net);

    // Fill all remaining ground with the top-ranked option
    const best = t1Options[0];
    if (best.net > 0) {
      const built_ = tryAdd(best.id, 1, 5_000, groundFree, 'ground');
      groundFree -= built_;
    }
  }

  // ── Orbital space: T3 → T2 ───────────────────────────────────────────────
  if (hasMetropolis) {
    const foodNet = 60 * f - 120;
    const id = foodNet >= 60 * e ? 'hydroponics_dome' : 'solar_station';
    const built_ = tryAdd(id, 6, 200_000, orbitalFree, 'orbital');
    orbitalFree -= built_ * 6;
  }

  if (hasColony && hasLaunchSite) {
    const foodNet = 6 * f - 40;
    const id = foodNet >= 6 * e ? 'hydroponics_lab' : 'solar_array';
    const built_ = tryAdd(id, 2, 40_000, orbitalFree, 'orbital');
    orbitalFree -= built_ * 2;
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalOutputDelta: Record<ResourceId, number> = { ...BASE_RESOURCES };
  let totalScoreDelta = 0;
  let groundSpaceUsed = 0;
  let orbitalSpaceUsed = 0;
  let workersUsed = 0;

  for (const g of groups) {
    totalScoreDelta += g.scoreDelta;
    workersUsed += g.workerCost;
    if (g.spaceType === 'ground') {
      groundSpaceUsed += g.spaceCost;
    } else {
      orbitalSpaceUsed += g.spaceCost;
    }
    for (const r of RESOURCE_ORDER) {
      totalOutputDelta[r] = (totalOutputDelta[r] || 0) + (g.outputDelta[r] || 0);
    }
  }

  return {
    groups,
    totalScoreDelta,
    totalOutputDelta,
    groundSpaceUsed,
    orbitalSpaceUsed,
    workersUsed,
    groundSpaceRemaining: groundFree,
    orbitalSpaceRemaining: orbitalFree,
    workersRemaining: workersFree,
    groundReason,
    orbitalT2Reason: orbT2Reason,
    orbitalT3Reason: orbT3Reason,
  };
}

export function optimizeBuildForScore(snapshot: ParsedSnapshot, structuresById: Record<string, BuildingDef>, maxSteps: number): BuildOptimizationResult {
  const built = { ...snapshot.structures };
  const currentOutputs = { ...snapshot.resourcesOutput };

  let workersFree = snapshot.workersFree ?? 0;
  let groundSpaceFree = snapshot.groundSpaceFree ?? 0;
  let orbitalSpaceFree = snapshot.orbitalSpaceFree ?? 0;

  const steps: BuildRecommendation[] = [];
  let totalScoreDelta = 0;
  let totalWeightedOutputDelta = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    let best: BuildRecommendation | null = null;

    for (const def of Object.values(structuresById)) {
      if (!def.scoreValue || def.scoreValue <= 0) {
        continue;
      }
      if (!buildingIsAvailable(def, built)) {
        continue;
      }
      if (def.workerCost > workersFree) {
        continue;
      }
      if (def.groundSpaceCost > groundSpaceFree) {
        continue;
      }
      if (def.orbitalSpaceCost > orbitalSpaceFree) {
        continue;
      }

      const outputDelta = computeBuildingOutputDelta(def, snapshot.abundance);
      const weightedOutputDelta = weightedResourceValue(outputDelta);
      if (weightedOutputDelta <= 0) {
        continue;
      }

      const efficiency = weightedOutputDelta / def.scoreValue;

      const candidate: BuildRecommendation = {
        id: def.id,
        name: def.name,
        efficiency,
        scoreDelta: def.scoreValue,
        weightedOutputDelta,
        outputDelta,
      };

      if (!best || candidate.efficiency > best.efficiency) {
        best = candidate;
      }
    }

    if (!best) {
      break;
    }

    steps.push(best);
    built[best.id] = (built[best.id] || 0) + 1;

    currentOutputs.metal += best.outputDelta.metal;
    currentOutputs.mineral += best.outputDelta.mineral;
    currentOutputs.food += best.outputDelta.food;
    currentOutputs.energy += best.outputDelta.energy;

    const def = structuresById[best.id];
    workersFree -= def.workerCost;
    groundSpaceFree -= def.groundSpaceCost;
    orbitalSpaceFree -= def.orbitalSpaceCost;

    totalScoreDelta += best.scoreDelta;
    totalWeightedOutputDelta += best.weightedOutputDelta;
  }

  return {
    steps,
    finalOutputs: currentOutputs,
    totalScoreDelta,
    totalWeightedOutputDelta,
    remaining: {
      workersFree,
      groundSpaceFree,
      orbitalSpaceFree,
    },
  };
}

function canAfford(resources: Record<ResourceId, number>, costs: Record<ResourceId, number>): boolean {
  return RESOURCE_ORDER.every((resource) => resources[resource] >= costs[resource]);
}

function multiplyResources(base: Record<ResourceId, number>, multiplier: number): Record<ResourceId, number> {
  return {
    metal: base.metal * multiplier,
    mineral: base.mineral * multiplier,
    food: base.food * multiplier,
    energy: base.energy * multiplier,
  };
}

export function fleetFromBudget(
  available: Record<ResourceId, number>,
  selectedRatio: Record<string, number>,
  shipsById: Record<string, ShipDef>,
): FleetFromBudgetResult {
  const ids = Object.keys(selectedRatio).filter((id) => selectedRatio[id] > 0 && shipsById[id]);

  if (!ids.length) {
    return {
      multiplier: 0,
      composition: {},
      used: { ...BASE_RESOURCES },
      leftover: { ...available },
      nextScaleNeeds: { ...BASE_RESOURCES },
    };
  }

  const bundleCosts: Record<ResourceId, number> = { ...BASE_RESOURCES };
  for (const id of ids) {
    const weight = selectedRatio[id];
    const ship = shipsById[id];
    bundleCosts.metal += ship.costs.metal * weight;
    bundleCosts.mineral += ship.costs.mineral * weight;
    bundleCosts.food += ship.costs.food * weight;
    bundleCosts.energy += ship.costs.energy * weight;
  }

  let low = 0;
  let high = 1;
  while (canAfford(available, multiplyResources(bundleCosts, high))) {
    high *= 2;
    if (high > 1_000_000) {
      break;
    }
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (canAfford(available, multiplyResources(bundleCosts, mid))) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const multiplier = low;
  const composition: Record<string, number> = {};
  for (const id of ids) {
    composition[id] = Math.floor(selectedRatio[id] * multiplier);
  }

  const used = multiplyResources(bundleCosts, multiplier);
  const leftover = subtractResources(available, used);
  const nextScaleNeeds = subtractResources(multiplyResources(bundleCosts, multiplier + 1), available);

  return {
    multiplier,
    composition,
    used,
    leftover,
    nextScaleNeeds: {
      metal: Math.max(0, nextScaleNeeds.metal),
      mineral: Math.max(0, nextScaleNeeds.mineral),
      food: Math.max(0, nextScaleNeeds.food),
      energy: Math.max(0, nextScaleNeeds.energy),
    },
  };
}

// ─── Warship Budget Optimizer ────────────────────────────────────────────────

export const WARSHIP_IDS = [
  'fighter', 'bomber', 'frigate', 'destroyer', 'cruiser', 'battleship', 'command_carrier',
] as const;

interface WarshipDef {
  id: string;
  name: string;
  metal: number;
  mineral: number;
  score: number;
}

export interface WarshipFleetEntry {
  id: string;
  name: string;
  count: number;
  scoreContrib: number;
}

export interface WarshipBudgetResult {
  fleet: WarshipFleetEntry[];
  totalScore: number;
  usedMetal: number;
  usedMineral: number;
  leftoverMetal: number;
  leftoverMineral: number;
  leftoverWeighted: number;
}

export interface WarshipOptimizerResult {
  highestScore: WarshipBudgetResult;
  leastLeftover: WarshipBudgetResult;
}

function greedyWarships(
  budgetMetal: number,
  budgetMineral: number,
  ordered: WarshipDef[],
  lookup: Record<string, WarshipDef>,
): WarshipBudgetResult {
  const counts: Record<string, number> = {};
  let metalLeft = budgetMetal;
  let mineralLeft = budgetMineral;

  for (const ship of ordered) {
    if (ship.metal <= 0 || ship.mineral <= 0) {
      continue;
    }
    const n = Math.floor(Math.min(metalLeft / ship.metal, mineralLeft / ship.mineral));
    if (n > 0) {
      counts[ship.id] = (counts[ship.id] || 0) + n;
      metalLeft -= n * ship.metal;
      mineralLeft -= n * ship.mineral;
    }
  }

  const fleet: WarshipFleetEntry[] = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([id, count]) => {
      const def = lookup[id];
      return { id, name: def?.name ?? id, count, scoreContrib: (def?.score ?? 0) * count };
    })
    .sort((a, b) => b.scoreContrib - a.scoreContrib);

  const totalScore = fleet.reduce((sum, e) => sum + e.scoreContrib, 0);
  const usedMetal = budgetMetal - metalLeft;
  const usedMineral = budgetMineral - mineralLeft;

  return {
    fleet,
    totalScore,
    usedMetal,
    usedMineral,
    leftoverMetal: metalLeft,
    leftoverMineral: mineralLeft,
    leftoverWeighted: metalLeft + mineralLeft * 1.5,
  };
}

export function optimizeWarships(
  budgetMetal: number,
  budgetMineral: number,
  shipsById: Record<string, ShipDef>,
): WarshipOptimizerResult {
  const warships: WarshipDef[] = (WARSHIP_IDS as readonly string[])
    .map((id) => {
      const s = shipsById[id];
      if (!s || s.costs.metal <= 0 || s.costs.mineral <= 0) {
        return null;
      }
      return { id: s.id, name: s.name, metal: s.costs.metal, mineral: s.costs.mineral, score: s.scoreValue };
    })
    .filter((s): s is WarshipDef => s !== null);

  const lookup: Record<string, WarshipDef> = warships.reduce<Record<string, WarshipDef>>((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {});

  const empty: WarshipBudgetResult = {
    fleet: [],
    totalScore: 0,
    usedMetal: 0,
    usedMineral: 0,
    leftoverMetal: budgetMetal,
    leftoverMineral: budgetMineral,
    leftoverWeighted: budgetMetal + budgetMineral * 1.5,
  };

  if (!warships.length || (budgetMetal <= 0 && budgetMineral <= 0)) {
    return { highestScore: empty, leastLeftover: empty };
  }

  // Highest score: greedy by score / weighted_cost descending
  const byScoreEff = [...warships].sort((a, b) => {
    const effA = a.score / (a.metal + a.mineral * 1.5);
    const effB = b.score / (b.metal + b.mineral * 1.5);
    return effB - effA;
  });
  const highestScore = greedyWarships(budgetMetal, budgetMineral, byScoreEff, lookup);

  // Least leftover: try all singles, all ordered pairs, + two fixed orders
  const candidates: WarshipBudgetResult[] = [highestScore];

  for (const ship of warships) {
    candidates.push(greedyWarships(budgetMetal, budgetMineral, [ship], lookup));
  }

  for (let i = 0; i < warships.length; i += 1) {
    for (let j = 0; j < warships.length; j += 1) {
      if (i === j) {
        continue;
      }
      candidates.push(greedyWarships(budgetMetal, budgetMineral, [warships[i], warships[j]], lookup));
    }
  }

  // Weighted cost descending (expensive first)
  const byCostDesc = [...warships].sort((a, b) => (b.metal + b.mineral * 1.5) - (a.metal + a.mineral * 1.5));
  candidates.push(greedyWarships(budgetMetal, budgetMineral, byCostDesc, lookup));

  // Weighted cost ascending (cheapest first)
  const byCostAsc = [...warships].sort((a, b) => (a.metal + a.mineral * 1.5) - (b.metal + b.mineral * 1.5));
  candidates.push(greedyWarships(budgetMetal, budgetMineral, byCostAsc, lookup));

  const leastLeftover = candidates.reduce((best, curr) =>
    curr.leftoverWeighted < best.leftoverWeighted ? curr : best,
  );

  return { highestScore, leastLeftover };
}

// ─── Combat Scan Parser ──────────────────────────────────────────────────────

// Returns true when a line is a doubled ship name from a full-page copy
// (e.g. "Fighter Fighter", "Invasion Ship Invasion Ship").
function isDoubledPhrase(line: string): boolean {
  const parts = safeLower(line).split(' ');
  if (parts.length < 2 || parts.length % 2 !== 0) return false;
  const half = parts.length / 2;
  return parts.slice(0, half).join(' ') === parts.slice(half).join(' ');
}

function detectDoubledShipId(line: string, shipNameToId: Record<string, string>): string | null {
  if (!isDoubledPhrase(line)) return null;
  const lower = safeLower(line);
  for (const [name, id] of Object.entries(shipNameToId)) {
    if (lower === name + ' ' + name) return id;
  }
  return null;
}

// Parse the top-level Owned / Hostile before-counts from a battle report summary block.
function parseBattleSummaryColumns(
  lines: string[],
  shipNameToId: Record<string, string>,
): { owned: Record<string, number>; hostile: Record<string, number> } {
  const owned: Record<string, number> = {};
  const hostile: Record<string, number> = {};
  const SKIP = new Set(['owned', 'allied', 'hostile', 'before', 'after']);

  let i = lines.findIndex((l) => safeLower(l) === 'owned');
  if (i < 0) return { owned, hostile };
  i++;

  while (i < lines.length) {
    const line = lines[i];
    const shipId = detectDoubledShipId(line, shipNameToId);
    if (shipId) {
      const vals = lines.slice(i + 1, i + 7).map((v) => parseHumanNumber(v));
      if (vals.length >= 6) {
        owned[shipId] = vals[0];  // owned before
        hostile[shipId] = vals[4]; // hostile before
      }
      i += 7;
    } else if (isDoubledPhrase(line)) {
      i += 7; // non-ship doubled row (Worker, Soldier) — skip 6 value lines
    } else if (SKIP.has(safeLower(line))) {
      i++;
    } else {
      i++;
    }
  }

  return { owned, hostile };
}

interface BattleFleet {
  fleetName: string;
  player: string;
  before: Record<string, number>;
  lost: Record<string, number>;
}

const BATTLE_FLEET_RE = /^(.+?)\(([^)]+)\)\s*$/;
const FOOTER_WORDS = new Set(['rules', 'terms', 'privacy']);

function parseBattleFleetSection(lines: string[], shipNameToId: Record<string, string>): BattleFleet[] {
  const fleets: BattleFleet[] = [];
  const SKIP = new Set(['before', 'after']);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (SKIP.has(safeLower(line)) || FOOTER_WORDS.has(safeLower(line))) { i++; continue; }

    const fm = line.match(BATTLE_FLEET_RE);
    if (!fm) { i++; continue; }

    const fleetName = fm[1].trim();
    const player = fm[2].trim();
    const before: Record<string, number> = {};
    const lost: Record<string, number> = {};
    i++;

    while (i < lines.length) {
      const inner = lines[i];
      if (SKIP.has(safeLower(inner))) { i++; continue; }
      if (FOOTER_WORDS.has(safeLower(inner)) || inner.match(BATTLE_FLEET_RE)) break;

      const shipId = detectDoubledShipId(inner, shipNameToId);
      if (shipId) {
        const b = parseHumanNumber(lines[i + 1] || '0');
        const a = parseHumanNumber(lines[i + 2] || '0');
        before[shipId] = b;
        const loss = Math.max(0, b - a);
        if (loss > 0) lost[shipId] = (lost[shipId] || 0) + loss;
        i += 3;
      } else if (isDoubledPhrase(inner)) {
        i += 3; // non-ship doubled row — skip 2 value lines
      } else {
        i++;
      }
    }

    fleets.push({ fleetName, player, before, lost });
  }

  return fleets;
}

// Assign each fleet to attacker or defender by comparing per-player ship totals
// against the owned (defender) and hostile (attacker) columns from the summary.
function assignBattleReportSides(
  fleets: BattleFleet[],
  ownedBefore: Record<string, number>,
  hostileBefore: Record<string, number>,
): CombatFleetEntry[] {
  const playerBefore = new Map<string, Record<string, number>>();
  for (const fleet of fleets) {
    const acc = playerBefore.get(fleet.player) || {};
    for (const [id, count] of Object.entries(fleet.before)) {
      acc[id] = (acc[id] || 0) + count;
    }
    playerBefore.set(fleet.player, acc);
  }

  const playerSide = new Map<string, 'attacker' | 'defender'>();
  for (const [player, counts] of playerBefore.entries()) {
    let ownedScore = 0;
    let hostileScore = 0;
    for (const [id, count] of Object.entries(counts)) {
      ownedScore += Math.min(count, ownedBefore[id] || 0);
      hostileScore += Math.min(count, hostileBefore[id] || 0);
    }
    playerSide.set(player, hostileScore >= ownedScore ? 'attacker' : 'defender');
  }

  return fleets.map((fleet) => ({
    fleetName: fleet.fleetName,
    player: fleet.player,
    alliance: 'Unknown',
    side: playerSide.get(fleet.player) ?? 'attacker',
    unitsLost: fleet.lost,
  }));
}

// Try to parse a game battle report (has a "Fleet Details" section with per-fleet
// Before/After ship counts). Returns null if the input is not this format.
function tryParseBattleReport(rawInput: string, defs: GameDefs): CombatFleetEntry[] | null {
  const text = normalizeFleetScanText(rawInput);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const detailsIdx = lines.findIndex((l) => safeLower(l) === 'fleet details');
  if (detailsIdx < 0) return null;

  const { owned, hostile } = parseBattleSummaryColumns(lines.slice(0, detailsIdx), defs.shipNameToId);
  const battleFleets = parseBattleFleetSection(lines.slice(detailsIdx + 1), defs.shipNameToId);

  if (battleFleets.length === 0) return null;
  return assignBattleReportSides(battleFleets, owned, hostile);
}

export interface CombatFleetEntry {
  fleetName: string;
  player: string;
  alliance: string;
  side: 'attacker' | 'defender';
  unitsLost: Record<string, number>;
}

export interface CombatSideSummary {
  side: 'attacker' | 'defender';
  fleets: number;
  players: string[];
  alliances: string[];
  unitsLost: Record<string, number>;
  totalUnitsLost: number;
  totalScoreLost: number;
  totalCostLost: Record<ResourceId, number>;
  weightedCostLost: number;
}

export interface CombatPlayerSummary {
  player: string;
  alliance: string;
  side: 'attacker' | 'defender';
  fleets: number;
  unitsLost: Record<string, number>;
  totalUnitsLost: number;
  totalScoreLost: number;
  totalCostLost: Record<ResourceId, number>;
  weightedCostLost: number;
}

export interface CombatScanParseResult {
  fleets: CombatFleetEntry[];
  attackers: CombatSideSummary;
  defenders: CombatSideSummary;
  byPlayer: CombatPlayerSummary[];
  tradeRatio: number;
  shipIds: string[];
  warnings: string[];
}

function parseCombatSideLabel(line: string): 'attacker' | 'defender' | null {
  const lower = line.toLowerCase().replace(/[^a-z]/g, '');
  if (/^attack/.test(lower)) return 'attacker';
  if (/^defend/.test(lower)) return 'defender';
  return null;
}

function parseCombatShipLine(line: string, shipNameToId: Record<string, string>): [string, number] | null {
  const match = line.match(/^(\d[\d,]*)\s*[x×]\s+(.+?)(?:\s*\((?:destroyed|lost|killed)\))?$/i);
  if (!match) return null;
  const count = Math.floor(parseHumanNumber(match[1]));
  const shipId = shipNameToId[safeLower(match[2].trim())];
  if (!shipId || count <= 0) return null;
  return [shipId, count];
}

const PLAYER_ALLIANCE_RE = /^(.{1,120}?)\s*\(([^)]+)\)\s*$/;
const SHIP_COUNT_RE = /^(\d[\d,]*)\s*[x×]\s+.+/i;

function parseCombatBlocks(lines: string[], defs: GameDefs): CombatFleetEntry[] {
  const fleets: CombatFleetEntry[] = [];
  let currentSide: 'attacker' | 'defender' = 'attacker';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const sideLabel = parseCombatSideLabel(line);
    if (sideLabel) {
      currentSide = sideLabel;
      i++;
      continue;
    }

    const playerMatch = line.match(PLAYER_ALLIANCE_RE);
    if (playerMatch && !line.match(SHIP_COUNT_RE)) {
      const alliance = playerMatch[2].trim();
      const player = inferPlayerName(playerMatch[1]);
      const unitsLost: Record<string, number> = {};
      i++;

      while (i < lines.length) {
        const inner = lines[i];
        if (parseCombatSideLabel(inner)) break;
        if (inner.match(PLAYER_ALLIANCE_RE) && !inner.match(SHIP_COUNT_RE)) break;
        const parsed = parseCombatShipLine(inner, defs.shipNameToId);
        if (parsed) {
          const [shipId, count] = parsed;
          unitsLost[shipId] = (unitsLost[shipId] || 0) + count;
        }
        i++;
      }

      if (Object.keys(unitsLost).length > 0) {
        fleets.push({ fleetName: line, player, alliance, side: currentSide, unitsLost });
      }
      continue;
    }
    i++;
  }

  return fleets;
}

function buildCombatSide(
  side: 'attacker' | 'defender',
  fleets: CombatFleetEntry[],
  shipsById: Record<string, ShipDef>,
): CombatSideSummary {
  const sideFleets = fleets.filter((f) => f.side === side);
  const unitsLost: Record<string, number> = {};
  let totalUnitsLost = 0;
  let totalScoreLost = 0;
  const totalCostLost: Record<ResourceId, number> = { metal: 0, mineral: 0, food: 0, energy: 0 };

  for (const fleet of sideFleets) {
    for (const [id, count] of Object.entries(fleet.unitsLost)) {
      unitsLost[id] = (unitsLost[id] || 0) + count;
      totalUnitsLost += count;
      const ship = shipsById[id];
      if (ship) {
        totalScoreLost += ship.scoreValue * count;
        totalCostLost.metal += ship.costs.metal * count;
        totalCostLost.mineral += ship.costs.mineral * count;
        totalCostLost.food += ship.costs.food * count;
        totalCostLost.energy += ship.costs.energy * count;
      }
    }
  }

  return {
    side,
    fleets: sideFleets.length,
    players: [...new Set(sideFleets.map((f) => f.player))],
    alliances: [...new Set(sideFleets.map((f) => f.alliance))],
    unitsLost,
    totalUnitsLost,
    totalScoreLost,
    totalCostLost,
    weightedCostLost: weightedResourceValue(totalCostLost),
  };
}

function buildCombatPlayers(fleets: CombatFleetEntry[], shipsById: Record<string, ShipDef>): CombatPlayerSummary[] {
  const map = new Map<string, CombatPlayerSummary>();

  for (const fleet of fleets) {
    const key = `${fleet.player}::${fleet.side}`;
    const entry = map.get(key) ?? {
      player: fleet.player,
      alliance: fleet.alliance,
      side: fleet.side,
      fleets: 0,
      unitsLost: {},
      totalUnitsLost: 0,
      totalScoreLost: 0,
      totalCostLost: { metal: 0, mineral: 0, food: 0, energy: 0 },
      weightedCostLost: 0,
    };

    entry.fleets++;
    for (const [id, count] of Object.entries(fleet.unitsLost)) {
      entry.unitsLost[id] = (entry.unitsLost[id] || 0) + count;
      entry.totalUnitsLost += count;
      const ship = shipsById[id];
      if (ship) {
        entry.totalScoreLost += ship.scoreValue * count;
        entry.totalCostLost.metal += ship.costs.metal * count;
        entry.totalCostLost.mineral += ship.costs.mineral * count;
        entry.totalCostLost.food += ship.costs.food * count;
        entry.totalCostLost.energy += ship.costs.energy * count;
      }
    }
    entry.weightedCostLost = weightedResourceValue(entry.totalCostLost);
    map.set(key, entry);
  }

  return Array.from(map.values()).sort((a, b) => b.weightedCostLost - a.weightedCostLost);
}

export function parseCombatScanInput(rawInput: string, defs: GameDefs): CombatScanParseResult {
  const warnings: string[] = [];
  const text = normalizeFleetScanText(rawInput);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Try the game's native battle report format (Fleet Details with Before/After)
  // before falling back to the manual Attacker/Defender format.
  const battleReportFleets = tryParseBattleReport(rawInput, defs);
  let fleets = battleReportFleets ?? parseCombatBlocks(lines, defs);

  if (fleets.length === 0) {
    warnings.push('No combat data found. Paste a Combat Report page (has a "Fleet Details" section), or use the manual format: "Attacker" / "Defender" labels, then "Player (Alliance)" lines with "N x Ship" losses.');
  }

  const attackers = buildCombatSide('attacker', fleets, defs.shipsById);
  const defenders = buildCombatSide('defender', fleets, defs.shipsById);
  const byPlayer = buildCombatPlayers(fleets, defs.shipsById);

  const tradeRatio = defenders.weightedCostLost > 0
    ? attackers.weightedCostLost / defenders.weightedCostLost
    : attackers.weightedCostLost > 0 ? 99 : 1;

  const shipIdSet = new Set<string>();
  for (const fleet of fleets) {
    for (const id of Object.keys(fleet.unitsLost)) shipIdSet.add(id);
  }
  const shipIds = Object.keys(defs.shipsById).filter((id) => shipIdSet.has(id));

  return { fleets, attackers, defenders, byPlayer, tradeRatio, shipIds, warnings };
}

export function formatCombatScanAsDiscord(result: CombatScanParseResult, shipsById: Record<string, ShipDef>): string {
  if (result.fleets.length === 0) return '';

  const { attackers, defenders, tradeRatio } = result;
  const winner = tradeRatio < 0.95 ? 'Attackers' : tradeRatio > 1.05 ? 'Defenders' : 'Draw';
  const ratio = Number.isFinite(tradeRatio) ? tradeRatio.toFixed(2) : '∞';

  const sideLines = (side: CombatSideSummary): string[] => {
    const rows: string[] = [
      `${side.side === 'attacker' ? 'ATTACKERS' : 'DEFENDERS'} (${side.alliances.join(', ')})`,
      `Players: ${side.players.join(', ')}`,
      `Fleets: ${side.fleets} | Units lost: ${formatHumanNumber(side.totalUnitsLost)}`,
      `Score lost: ${formatHumanNumber(side.totalScoreLost)} | Weighted cost: ${formatHumanNumber(side.weightedCostLost)}`,
      `Metal destroyed: ${formatHumanNumber(side.totalCostLost.metal)} | Mineral destroyed: ${formatHumanNumber(side.totalCostLost.mineral)}`,
    ];
    for (const [id, count] of Object.entries(side.unitsLost).sort(([, a], [, b]) => b - a)) {
      const name = shipsById[id]?.name ?? id;
      rows.push(`  ${formatHumanNumber(count)} x ${name}`);
    }
    return rows;
  };

  const lines = [
    'Combat Scan Analysis',
    `Winner: ${winner} | Trade ratio (atk/def): ${ratio}`,
    '',
    ...sideLines(attackers),
    '',
    ...sideLines(defenders),
  ];

  return `\`\`\`\n${lines.join('\n').trim()}\n\`\`\``;
}

export function projectAvailableResources(snapshot: ParsedSnapshot, ticks: number): Record<ResourceId, number> {
  const outputProjection: Record<ResourceId, number> = {
    metal: snapshot.resourcesOutput.metal * ticks,
    mineral: snapshot.resourcesOutput.mineral * ticks,
    food: snapshot.resourcesOutput.food * ticks,
    energy: snapshot.resourcesOutput.energy * ticks,
  };

  const projected = addResources(snapshot.resourcesStored, outputProjection);

  return {
    metal: Math.max(0, projected.metal),
    mineral: Math.max(0, projected.mineral),
    food: Math.max(0, projected.food),
    energy: Math.max(0, projected.energy),
  };
}

// ─── Radar Parser ─────────────────────────────────────────────────────────────

export interface RadarFleet {
  fleetName: string;
  player: string;
  alliance: string;
  originName: string;
  originCoords: string;
  destName: string;
  destCoords: string;
  eta: number;
  score: number;
}

export interface RadarAllianceSummary {
  alliance: string;
  count: number;
  players: string[];
}

export interface RadarSystemSummary {
  systemId: string;
  destName: string;
  destCoords: string;
  fleets: RadarFleet[];
  byAlliance: RadarAllianceSummary[];
}

export interface RadarParseResult {
  systems: RadarSystemSummary[];
  warnings: string[];
}

const RADAR_COMMS_RE = /^Comms\s*[—–-]\s*(\d+\/\d+)$/;
const RADAR_COORDS_RE = /^\d+:\d+:\d+$/;
const RADAR_ETA_RE = /^(\d+)t$/i;
const RADAR_PLAYER_RE = /^(.+?)\s*\(([^)]+)\)\s*$/;
const RADAR_COL_HEADERS = new Set(['fleet', 'ruler', 'route', 'eta', 'score']);

function parseRadarFleetRows(sysLines: string[]): RadarFleet[] {
  const fleets: RadarFleet[] = [];

  for (let i = 1; i < sysLines.length; i++) {
    const playerMatch = sysLines[i].match(RADAR_PLAYER_RE);
    if (!playerMatch) continue;

    const player = playerMatch[1].trim();
    const alliance = playerMatch[2].trim();

    let fleetName = '';
    for (let k = i - 1; k >= 0; k--) {
      if (!RADAR_COL_HEADERS.has(safeLower(sysLines[k])) && !RADAR_COMMS_RE.test(sysLines[k])) {
        fleetName = sysLines[k];
        break;
      }
    }

    let originName = '', originCoords = '', destName = '', destCoords = '';
    let eta = 0, score = 0, stage = 0, j = i + 1;

    while (j < sysLines.length && stage < 7) {
      const l = sysLines[j];
      if (RADAR_COMMS_RE.test(l)) break;
      if (l.match(RADAR_PLAYER_RE) && !RADAR_COORDS_RE.test(l)) break;

      if (stage === 0) { originName = l; stage++; }
      else if (stage === 1 && RADAR_COORDS_RE.test(l)) { originCoords = l; stage++; }
      else if (stage === 2 && l === '→') { stage++; }
      else if (stage === 3) { destName = l; stage++; }
      else if (stage === 4 && RADAR_COORDS_RE.test(l)) { destCoords = l; stage++; }
      else if (stage === 5) {
        const em = l.match(RADAR_ETA_RE);
        if (em) { eta = Number(em[1]); stage++; }
      } else if (stage === 6) {
        score = parseHumanNumber(l);
        stage++;
      }
      j++;
    }

    fleets.push({ fleetName, player, alliance, originName, originCoords, destName, destCoords, eta, score });
  }

  return fleets;
}

export function parseRadarInput(rawInput: string): RadarParseResult {
  const warnings: string[] = [];
  const text = rawInput.replace(ANSI_RE, '').replace(/ /g, ' ').replace(/\r/g, '\n');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const sysStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (RADAR_COMMS_RE.test(lines[i])) sysStarts.push(i);
  }

  if (sysStarts.length === 0) {
    warnings.push('No radar systems detected. Paste the full Radar page (Ctrl+A).');
    return { systems: [], warnings };
  }

  const systems: RadarSystemSummary[] = [];

  for (let si = 0; si < sysStarts.length; si++) {
    const start = sysStarts[si];
    const end = si + 1 < sysStarts.length ? sysStarts[si + 1] : lines.length;
    const sysLines = lines.slice(start, end);

    const sysMatch = sysLines[0].match(RADAR_COMMS_RE);
    const systemId = sysMatch ? sysMatch[1] : '';
    const fleets = parseRadarFleetRows(sysLines);
    if (fleets.length === 0) continue;

    const destName = fleets[0].destName;
    const destCoords = fleets[0].destCoords;

    const allianceMap = new Map<string, { count: number; players: Set<string> }>();
    for (const f of fleets) {
      const entry = allianceMap.get(f.alliance) ?? { count: 0, players: new Set<string>() };
      entry.count++;
      entry.players.add(f.player);
      allianceMap.set(f.alliance, entry);
    }

    const byAlliance: RadarAllianceSummary[] = Array.from(allianceMap.entries())
      .map(([alliance, data]) => ({ alliance, count: data.count, players: Array.from(data.players).sort() }))
      .sort((a, b) => b.count - a.count);

    systems.push({ systemId, destName, destCoords, fleets, byAlliance });
  }

  return { systems, warnings };
}

export function formatRadarSystemAsDiscord(system: RadarSystemSummary): string {
  const title = [system.destName, system.destCoords].filter(Boolean).join(' ');
  const header = `${title || system.systemId} — ${system.fleets.length} fleet${system.fleets.length !== 1 ? 's' : ''} inbound`;

  const rows = system.byAlliance.map((a) => [a.alliance, String(a.count), a.players.join(', ')]);
  const cols = ['Alliance', 'Flt', 'Players'];
  const widths = cols.map((c, ci) => Math.max(c.length, ...rows.map((r) => r[ci].length)));
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const renderRow = (row: string[]) => row.map((cell, i) => (i === 1 ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join('  ');

  const lines = [header, renderRow(cols), sep, ...rows.map(renderRow)];
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}
