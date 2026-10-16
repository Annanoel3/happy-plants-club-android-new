import React, { useEffect, useMemo, useState } from "react";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { syncStats, getLatestStats } from "@/lib/stats";

export function useStats() {
  const [data, setData] = useState(() => getLatestStats());
  useEffect(() => {
    const onStats = (e) => setData(e.detail);
    window.addEventListener("hp-stats", onStats);
    syncStats(); // refresh from real history every time the profile opens
    return () => window.removeEventListener("hp-stats", onStats);
  }, []);
  return data;
}

export default function AchievementsCard({ data, cardClass, textClass, subTextClass, dark }) {
  const [showAll, setShowAll] = useState(false);
  const list = data?.achievements || [];

  const { earned, next } = useMemo(() => {
    const earned = list.filter((a) => a.unlocked_at)
      .sort((a, b) => String(b.unlocked_at).localeCompare(String(a.unlocked_at)));
    const next = list.filter((a) => !a.unlocked_at)
      .sort((a, b) => (b.progress / b.goal) - (a.progress / a.goal));
    return { earned, next };
  }, [list]);

  if (!data) {
    return (
      <div className={`rounded-xl mb-6 p-6 ${cardClass}`}>
        <h3 className={`text-lg font-bold flex items-center gap-2 ${textClass}`}>
          <Trophy className="w-5 h-5 text-yellow-500" /> Achievements
        </h3>
        <div className="h-20 animate-pulse rounded-lg bg-black/5 mt-4" />
      </div>
    );
  }

  const groups = ["Watering", "Collection", "Variety", "Growth", "Memories", "Dedication"];
  const track = dark ? "bg-white/15" : "bg-gray-200";

  const Badge = ({ a }) => {
    const done = !!a.unlocked_at;
    const pct = Math.round((a.progress / a.goal) * 100);
    return (
      <div className={`rounded-xl p-3 border ${done ? "border-yellow-400/60 bg-yellow-400/10" : dark ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"}`}>
        <div className="flex items-start gap-2.5">
          <div className={`text-2xl leading-none ${done ? "" : "grayscale opacity-40"}`}>{a.icon}</div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold leading-tight ${textClass}`}>{a.name}</p>
            <p className={`text-xs leading-snug mt-0.5 ${subTextClass}`}>{a.desc}</p>
            {!done && (
              <div className="mt-2">
                <div className={`h-1.5 rounded-full ${track}`}>
                  <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${pct}%` }} />
                </div>
                <p className={`text-[11px] mt-1 ${subTextClass}`}>{a.progress.toLocaleString()} / {a.goal.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`rounded-xl mb-6 p-6 ${cardClass}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className={`text-lg font-bold flex items-center gap-2 ${textClass}`}>
          <Trophy className="w-5 h-5 text-yellow-500" /> Achievements
        </h3>
        <span className={`text-sm font-semibold ${subTextClass}`}>{earned.length} / {list.length}</span>
      </div>

      {!showAll ? (
        <>
          {earned.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {earned.slice(0, 12).map((a) => (
                <span key={a.id} title={a.name} className="w-11 h-11 rounded-full bg-yellow-400/15 border border-yellow-400/50 flex items-center justify-center text-xl">
                  {a.icon}
                </span>
              ))}
            </div>
          )}
          {next.length > 0 && (
            <>
              <p className={`text-xs font-bold uppercase tracking-wide mt-5 mb-2 ${subTextClass}`}>Up next</p>
              <div className="grid gap-2">
                {next.slice(0, 3).map((a) => <Badge key={a.id} a={a} />)}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="mt-3 space-y-5">
          {groups.map((g) => {
            const items = list.filter((a) => a.group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${subTextClass}`}>{g}</p>
                <div className="grid gap-2">
                  {items.map((a) => <Badge key={a.id} a={a} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setShowAll((v) => !v)}
        className={`w-full mt-4 rounded-full border py-2 text-sm font-semibold flex items-center justify-center gap-1 ${dark ? "border-white/20" : "border-gray-300"} ${textClass}`}
      >
        {showAll ? <>Show less <ChevronUp className="w-4 h-4" /></> : <>See all achievements <ChevronDown className="w-4 h-4" /></>}
      </button>
    </div>
  );
}
