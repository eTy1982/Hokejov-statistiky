import { PERIODS, type Player, type RosterEntry } from "../lib/types";
import {
  emptyPlayerStats,
  savePercentage,
  sumCounts,
  sumTimes,
  type StatsByPlayer,
} from "../lib/stats";
import { playerLabel, sortRoster } from "../lib/format";

interface Props {
  roster: RosterEntry[];
  players: Map<string, Player>;
  stats: StatsByPlayer;
  onSelectPlayer: (playerId: string) => void;
}

/** Statistiky po třetinách.
 *
 *  Brankáři mají vlastní sekci – míchat jejich obdržené góly do stejného sloupce
 *  jako střely hráčů (co dělala předchozí verze) dávalo nesmyslný součet. */
export function StatsTable({ roster, players, stats, onSelectPlayer }: Props) {
  const ordered = sortRoster(roster, players);
  const skaters = ordered.filter((r) => r.position !== "B");
  const goalies = ordered.filter((r) => r.position === "B");

  const statsOf = (id: string) => stats[id] ?? emptyPlayerStats();

  const totals = skaters.reduce(
    (acc, entry) => {
      const s = statsOf(entry.playerId);
      for (const p of PERIODS) acc.shots[p] = (acc.shots[p] ?? 0) + (s.shots[p] ?? 0);
      acc.goals += sumTimes(s.goals);
      acc.assists += sumCounts(s.assists);
      acc.plus += sumCounts(s.plus);
      acc.minus += sumCounts(s.minus);
      acc.penalties += sumTimes(s.penalties);
      return acc;
    },
    {
      shots: { "1": 0, "2": 0, "3": 0, P: 0 } as Record<string, number>,
      goals: 0,
      assists: 0,
      plus: 0,
      minus: 0,
      penalties: 0,
    },
  );

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <h3 className="border-b border-white/10 px-4 py-3 font-bold">Hráči</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-white/5 text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Hráč</th>
                <th className="px-2 py-2">Pětka</th>
                {PERIODS.map((p) => (
                  <th key={p} className="px-2 py-2" title="Střely včetně gólů">
                    {p === "P" ? "Prodl." : `${p}. tř.`}
                  </th>
                ))}
                <th className="px-2 py-2">Střely</th>
                <th className="px-2 py-2">G</th>
                <th className="px-2 py-2">A</th>
                <th className="px-2 py-2">B</th>
                <th className="px-2 py-2">+</th>
                <th className="px-2 py-2">−</th>
                <th className="px-2 py-2">TM</th>
              </tr>
            </thead>
            <tbody>
              {skaters.map((entry) => {
                const player = players.get(entry.playerId);
                const s = statsOf(entry.playerId);
                const goals = sumTimes(s.goals);
                const assists = sumCounts(s.assists);
                return (
                  <tr
                    key={entry.playerId}
                    className="cursor-pointer border-t border-white/5 hover:bg-white/5"
                    onClick={() => onSelectPlayer(entry.playerId)}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {playerLabel(player)}
                    </td>
                    <td className="px-2 py-2 text-center text-slate-400">{entry.line || "—"}</td>
                    {PERIODS.map((p) => (
                      <td key={p} className="px-2 py-2 text-center tabular-nums">
                        {s.shots[p] ?? 0}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-bold tabular-nums">
                      {sumCounts(s.shots)}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">{goals}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{assists}</td>
                    <td className="px-2 py-2 text-center font-semibold tabular-nums">
                      {goals + assists}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-emerald-300">
                      {sumCounts(s.plus) || ""}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-rose-300">
                      {sumCounts(s.minus) || ""}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {sumTimes(s.penalties) || ""}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                <td className="px-3 py-2">Celkem</td>
                <td />
                {PERIODS.map((p) => (
                  <td key={p} className="px-2 py-2 text-center tabular-nums">
                    {totals.shots[p]}
                  </td>
                ))}
                <td className="px-2 py-2 text-center tabular-nums">
                  {PERIODS.reduce((a, p) => a + (totals.shots[p] ?? 0), 0)}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{totals.goals}</td>
                <td className="px-2 py-2 text-center tabular-nums">{totals.assists}</td>
                <td className="px-2 py-2 text-center tabular-nums">
                  {totals.goals + totals.assists}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{totals.plus}</td>
                <td className="px-2 py-2 text-center tabular-nums">{totals.minus}</td>
                <td className="px-2 py-2 text-center tabular-nums">{totals.penalties}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {goalies.length > 0 && (
        <div className="card overflow-hidden">
          <h3 className="border-b border-white/10 px-4 py-3 font-bold">Brankáři</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="bg-white/5 text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Brankář</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="px-2 py-2" title="Zákroky / obdržené góly">
                      {p === "P" ? "Prodl." : `${p}. tř.`}
                    </th>
                  ))}
                  <th className="px-2 py-2">Zákroky</th>
                  <th className="px-2 py-2">Obdržené</th>
                  <th className="px-2 py-2">SV%</th>
                  <th className="px-2 py-2">SN</th>
                </tr>
              </thead>
              <tbody>
                {goalies.map((entry) => {
                  const player = players.get(entry.playerId);
                  const s = statsOf(entry.playerId);
                  const sv = savePercentage(s);
                  return (
                    <tr
                      key={entry.playerId}
                      className="cursor-pointer border-t border-white/5 hover:bg-white/5"
                      onClick={() => onSelectPlayer(entry.playerId)}
                    >
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {playerLabel(player)}
                      </td>
                      {PERIODS.map((p) => (
                        <td key={p} className="px-2 py-2 text-center tabular-nums">
                          <span>{s.saves[p] ?? 0}</span>
                          <span className="text-slate-500"> / </span>
                          <span className="text-rose-300">{s.goalsAgainst[p]?.length ?? 0}</span>
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center font-bold tabular-nums">
                        {sumCounts(s.saves)}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-rose-300">
                        {sumTimes(s.goalsAgainst)}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold tabular-nums">
                        {sv === null ? "—" : `${sv.toFixed(1)} %`}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-400">
                        {s.soSaves + s.soGoalsAgainst > 0
                          ? `${s.soSaves}/${s.soSaves + s.soGoalsAgainst}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
