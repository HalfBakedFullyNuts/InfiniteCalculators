import { describe, expect, test } from 'vitest';
import gameDataRaw from '../game/game_data.json';
import { buildGameDefs, formatFleetOverviewAsDiscord, formatFleetScanAsDiscord, parseFleetOverviewInput, parseFleetScanInput, parseCombatScanInput } from './engine';

describe('parseFleetScanInput', () => {
  const defs = buildGameDefs(gameDataRaw);

  test('aggregates fleet scan units by player and alliance', () => {
    const input = `Waiting and incoming fleets
Picking up
Mr. Bear (Operation Epic Furry)
Arriving in turns
235 x Fighter
98 x Bomber
18 x Frigate
2 x Freighter
1 x Invasion Ship

The Dildo Of Consequence
Llama Del Rey (Operation Epic Furry)
Arriving in 22 turns
2,004 x Fighter
1,205 x Bomber
157 x Frigate
14 x Freighter
5 x Invasion Ship

Dildo Technicians
Llama Del Rey (Operation Epic Furry)
Arriving in 22 turns
69 x Fighter
4 x Freighter`;

    const parsed = parseFleetScanInput(input, defs);

    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.entries).toHaveLength(3);

    const llama = parsed.byPlayer.find((entry) => entry.label === 'Llama Del Rey');
    expect(llama).toBeDefined();
    expect(llama?.fleets).toBe(2);
    expect(llama?.units.fighter).toBe(2073);
    expect(llama?.units.bomber).toBe(1205);
    expect(llama?.units.frigate).toBe(157);
    expect(llama?.units.freighter).toBe(18);
    expect(llama?.units.invasion_ship).toBe(5);

    const alliance = parsed.byAlliance.find((entry) => entry.label === 'Operation Epic Furry');
    expect(alliance).toBeDefined();
    expect(alliance?.fleets).toBe(3);
    expect(alliance?.units.fighter).toBe(2308);
    expect(alliance?.units.bomber).toBe(1303);
    expect(alliance?.units.frigate).toBe(175);
    expect(alliance?.units.freighter).toBe(20);
    expect(alliance?.units.invasion_ship).toBe(6);
    expect(alliance?.totalUnits).toBe(3812);
  });

  test('handles compact single-line copy with merged words', () => {
    const input = 'Picking upMr. Bear (Operation Epic Furry) Arriving in turns235 x Fighter98 x Bomber18 x Frigate2 x Freighter1 x Invasion Ship';
    const parsed = parseFleetScanInput(input, defs);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.byPlayer[0]?.label).toBe('Mr. Bear');
    expect(parsed.byPlayer[0]?.units.fighter).toBe(235);
    expect(parsed.byAlliance[0]?.label).toBe('Operation Epic Furry');
  });

  test('formats fleet scan summaries for Discord copy', () => {
    const input = `Scout Wing
Bear Paw (North Star)
Arriving in 4 turns
10 x Fighter
2 x Bomber

Defense Wing
Moon Fox (South Star)
Arriving in 7 turns
3 x Fighter
1 x Frigate`;
    const parsed = parseFleetScanInput(input, defs);
    const discord = formatFleetScanAsDiscord(parsed, ['fighter', 'bomber', 'frigate']);

    expect(discord.startsWith('```\nFleet Scan Summary')).toBe(true);
    expect(discord.endsWith('\n```')).toBe(true);
    expect(discord).toContain('Fleets 2 | Players 2 | Alliances 2');
    expect(discord).toContain('By Alliance');
    expect(discord).toContain('Alliance    Flt  Units  Score  Fig  Bom  Fri');
    expect(discord).toContain('North Star    1     12');
    expect(discord).toContain('By Player');
    expect(discord).toContain('Player    Flt  Units  Score  Fig  Bom  Fri');
    expect(discord).toContain('Bear Paw    1     12');
    expect(discord).not.toContain('**Fleet Scan Summary**');
  });

  test('returns empty Discord export for empty scan results', () => {
    const parsed = parseFleetScanInput('', defs);

    expect(formatFleetScanAsDiscord(parsed, ['fighter'])).toBe('');
  });
});

describe('parseFleetOverviewInput', () => {
  test('builds cumulative cargo per ETA for each destination from table copy', () => {
    const input = [
      'Name\tStatus\tRoute\tMetal\tMineral\tFood\tEnergy\tWorker\tSoldier\tETA',
      'Metal Fleet\tMoving\tAlpha 1:1:1 → Beta 2:2:2\t1\t\t\t\t\t\t1t',
      'Mineral Fleet\tMoving\tGamma 3:3:3 → Beta 2:2:2\t\t2\t\t\t5\t\t2t',
      'Worker Only\tMoving\tDelta 4:4:4 → Beta 2:2:2\t\t\t\t\t9\t\t3t',
      'Soldier Fleet\tMoving\tEpsilon 5:5:5 → Beta 2:2:2\t\t\t\t\t4\t6\t4t',
      'Other Destination\tMoving\tZeta 6:6:6 → Theta 7:7:7\t3\t4\t\t\t\t\t2t',
    ].join('\n');

    const parsed = parseFleetOverviewInput(input);
    const beta = parsed.destinations.find((row) => row.destinationCoords === '2:2:2');
    const theta = parsed.destinations.find((row) => row.destinationCoords === '7:7:7');

    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.entries).toHaveLength(5);
    expect(beta?.fleets).toBe(3);
    expect(beta?.rows).toHaveLength(3);
    expect(beta?.rows[0]).toMatchObject({
      etaTurns: 1,
      arrivingFleets: 1,
      cumulative: { metal: 1, mineral: 0, food: 0, energy: 0, workers: 0, soldiers: 0 },
    });
    expect(beta?.rows[1]).toMatchObject({
      etaTurns: 2,
      arrivingFleets: 1,
      cumulative: { metal: 1, mineral: 2, food: 0, energy: 0, workers: 5, soldiers: 0 },
    });
    expect(beta?.rows[2]).toMatchObject({
      etaTurns: 4,
      arrivingFleets: 1,
      cumulative: { metal: 1, mineral: 2, food: 0, energy: 0, workers: 9, soldiers: 6 },
    });
    expect(theta?.rows[0]?.cumulative).toMatchObject({ metal: 3, mineral: 4 });
  });

  test('parses plain fleet overview line copies with an ambiguity warning', () => {
    const input = `Fleet Registry
Name
Status
Route
Metal
Mineral
Food
Energy
Worker
Soldier
ETA
Supply One
Moving
Alpha
1:1:1
→
Beta
2:2:2
10k
2t
Worker Shuttle
Moving
Alpha
1:1:1
→
Beta
2:2:2
5k
3t`;

    const parsed = parseFleetOverviewInput(input);

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.warnings[0]).toContain('Plain-text copy dropped empty cargo columns');
    expect(parsed.destinations[0]?.rows[0]?.etaTurns).toBe(2);
    expect(parsed.destinations[0]?.rows[0]?.cumulative.metal).toBe(10000);
  });

  test('formats fleet overview cumulative cargo as a Discord table', () => {
    const input = [
      'Name\tStatus\tRoute\tMetal\tMineral\tFood\tEnergy\tWorker\tSoldier\tETA',
      'Metal Fleet\tMoving\tAlpha 1:1:1 → Beta 2:2:2\t1\t\t\t\t\t\t1t',
      'Mineral Fleet\tMoving\tGamma 3:3:3 → Beta 2:2:2\t\t2\t\t\t5\t\t2t',
    ].join('\n');

    const parsed = parseFleetOverviewInput(input);
    const discord = formatFleetOverviewAsDiscord(parsed);

    expect(discord.startsWith('```\nFleet Overview ETA Cargo')).toBe(true);
    expect(discord).toContain('Destinations 1 | Loaded fleets 2');
    expect(discord).toContain('Beta 2:2:2');
    expect(discord).toContain('ETA   Arr  Metal  Mineral  Food  Energy  Worker  Soldier');
    expect(discord).toContain('1t      1      1        0');
    expect(discord).toContain('2t      1      1        2');
    expect(discord.endsWith('\n```')).toBe(true);
  });
});

describe('parseFleetScanInput — full-page copy format', () => {
  const defs = buildGameDefs(gameDataRaw);

  test('parses full-page copy with page header, Picking up entries, and fleet names above player line', () => {
    const input = `INFINITE · CONFLICT
Command
Planets
Fleet Scan Result
2:374:2868
FighterFighter
0
21,954
0
Waiting and incoming fleets
Picking up
Mr. Bear (Operation Epic Furry)
Arriving in 1 turns
1,335 x Fighter
597 x Bomber
80 x Frigate
2 x Freighter
1 x Invasion Ship
Nasenbär
Azz (Operation Epic Furry)
Arriving in 1 turns
300 x Fighter
50 x Bomber
29 x Frigate
10 x Freighter
2 x Invasion Ship
abholung
Azz (Operation Epic Furry)
Arriving in 7 turns
752 x Fighter
Rules
Terms
Privacy`;

    const parsed = parseFleetScanInput(input, defs);

    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.entries).toHaveLength(3);

    const bear = parsed.byPlayer.find((p) => p.label === 'Mr. Bear');
    expect(bear).toBeDefined();
    expect(bear?.units.fighter).toBe(1335);
    expect(bear?.units.bomber).toBe(597);
    expect(bear?.units.invasion_ship).toBe(1);

    const azz = parsed.byPlayer.find((p) => p.label === 'Azz');
    expect(azz).toBeDefined();
    expect(azz?.fleets).toBe(2);
    expect(azz?.units.fighter).toBe(1052); // 300 + 752
  });

  test('captures "Waiting at planet" fleets and skips the planet owner header line', () => {
    // New UI: a "Player (Alliance)\nOwned" planet owner line precedes the fleets,
    // and some fleets show "Waiting at planet" instead of "Arriving in N turns".
    const input = `Fleet Scan Result
White Mustang
2:395:2971
Turn 585
Llama Del Rey (Operation Epic Furry)
Owned
Allied
Hostile
FighterFighter
0
16,685
0
Waiting and incoming fleets
[HMS] Happy Entrance
Don Marco (Operation Epic Furry)
Waiting at planet
1,783 x Fighter
426 x Bomber
234 x Frigate
Resource Evac #23
Llama Del Rey (Operation Epic Furry)
Waiting at planet
1 x Freighter
Blurb
Llama Del Rey (Operation Epic Furry)
Arriving in 6 turns
1 x Freighter
Rules
Terms
Privacy`;

    const parsed = parseFleetScanInput(input, defs);

    expect(parsed.warnings).toHaveLength(0);
    // 3 real fleets — the planet owner ("Owned") line must NOT become an entry.
    expect(parsed.entries).toHaveLength(3);

    const waiting = parsed.entries.find((e) => e.fleetName === 'Don Marco');
    expect(waiting).toBeDefined();
    expect(waiting?.arrivalTurns).toBeNull();
    expect(waiting?.units.fighter).toBe(1783);
    expect(waiting?.units.bomber).toBe(426);
    expect(waiting?.units.frigate).toBe(234);

    const don = parsed.byPlayer.find((p) => p.label === 'Don Marco');
    expect(don?.fleets).toBe(1);

    const llama = parsed.byPlayer.find((p) => p.label === 'Llama Del Rey');
    expect(llama?.fleets).toBe(2); // Resource Evac (waiting) + Blurb (arriving)
    expect(llama?.units.freighter).toBe(2);
  });

  test('parses an unknown status keyword (not Arriving/Waiting)', () => {
    // The status wording can vary ("Returning", "Stationed", …). Any non-empty
    // status line that is not the Owned/Allied/Hostile owner header counts.
    const input = `Fleet Scan Result
2:395:2971
Llama Del Rey (Operation Epic Furry)
Owned
Allied
Hostile
FighterFighter
0
16,685
0
Waiting and incoming fleets
Returners
Don Marco (Operation Epic Furry)
Returning to base
Fighter
500 x Fighter
Frigate
20 x Frigate
Rules
Terms
Privacy`;

    const parsed = parseFleetScanInput(input, defs);
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].player).toBe('Don Marco');
    expect(parsed.entries[0].arrivalTurns).toBeNull();
    expect(parsed.entries[0].units.fighter).toBe(500);
    expect(parsed.entries[0].units.frigate).toBe(20);
  });

  test('recovers ship counts from a glued copy where the next label bleeds in', () => {
    // A plain-text clipboard copy can join a count line with the next row's
    // label: "1,783 x FighterBomber" → normalized "1,783 x Fighter Bomber".
    // The leading known ship name ("fighter") must still resolve.
    const input = `Fleet Scan Result
2:395:2971
Llama Del Rey (Operation Epic Furry)
Owned
Allied
Hostile
FighterFighter
0
16,685
0
Waiting and incoming fleets
Strike Group
Don Marco (Operation Epic Furry)
Waiting at planet
1,783 x Fighter Bomber
426 x Bomber Frigate
234 x Invasion Ship Outpost Ship
Rules
Terms
Privacy`;

    const parsed = parseFleetScanInput(input, defs);
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].units.fighter).toBe(1783);
    expect(parsed.entries[0].units.bomber).toBe(426);
    // Multi-word ship name as the leading prefix must win over a shorter one.
    expect(parsed.entries[0].units.invasion_ship).toBe(234);
  });
});

describe('parseCombatScanInput', () => {
  const defs = buildGameDefs(gameDataRaw);

  test('parses game battle report with Fleet Details Before/After section', () => {
    const input = `INFINITE · CONFLICT
Llama Del Rey
← Back to News
Combat Report
Combat at Mulgore [2892] on turn 532.
Owned
Allied
Hostile
Before
After
Before
After
Before
After
FighterFighter
8
0
0
0
0
0
FrigateFrigate
0
0
0
0
55
55
FreighterFreighter
1
0
0
0
4
4
Invasion ShipInvasion Ship
0
0
0
0
1
1
Fleet Details
AM34D(Malganis)
Before
After
FrigateFrigate
40
40
FreighterFreighter
3
3
Invasion ShipInvasion Ship
1
1
Global Domination(Llama Del Rey)
Before
After
FighterFighter
8
0
FreighterFreighter
1
0
AM96Z(Malganis)
Before
After
FrigateFrigate
15
15
FreighterFreighter
1
1
Rules
Terms
Privacy`;

    const parsed = parseCombatScanInput(input, defs);

    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.fleets).toHaveLength(3);

    const llamaFleet = parsed.fleets.find((f) => f.player === 'Llama Del Rey');
    expect(llamaFleet?.side).toBe('defender');
    expect(llamaFleet?.unitsLost.fighter).toBe(8);
    expect(llamaFleet?.unitsLost.freighter).toBe(1);

    const malganisFleets = parsed.fleets.filter((f) => f.player === 'Malganis');
    expect(malganisFleets).toHaveLength(2);
    expect(malganisFleets.every((f) => f.side === 'attacker')).toBe(true);
    expect(malganisFleets.every((f) => Object.keys(f.unitsLost).length === 0)).toBe(true);

    expect(parsed.defenders.totalUnitsLost).toBe(9); // 8 fighters + 1 freighter
    expect(parsed.attackers.totalUnitsLost).toBe(0);
    // attackers had 0 losses → ratio = 0 / defenders_cost = 0 (attackers won the trade)
    expect(parsed.tradeRatio).toBe(0);
  });

  test('still parses manual Attacker/Defender format', () => {
    const input = `Attacker
PlayerA (AllianceA)
250 x Fighter
50 x Bomber

Defender
PlayerB (AllianceB)
180 x Fighter
30 x Frigate`;

    const parsed = parseCombatScanInput(input, defs);

    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.fleets).toHaveLength(2);
    expect(parsed.attackers.fleets).toBe(1);
    expect(parsed.defenders.fleets).toBe(1);
    expect(parsed.attackers.unitsLost.fighter).toBe(250);
    expect(parsed.defenders.unitsLost.fighter).toBe(180);
  });

  test('returns warning when input is unrecognized', () => {
    const parsed = parseCombatScanInput('', defs);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('No combat data found');
  });
});
