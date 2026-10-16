import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, Leaf, MapPin, Droplets, Sprout } from "lucide-react";

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.mediocreatbest.happyplants";

// Public page anyone can open from a shared link — no account needed.
// Data comes from the getSharedGarden backend function, which only returns
// display info (no emails, notes or care history).
export default function SharedGardenView() {
  const { shareToken } = useParams();
  const [state, setState] = useState({ loading: true, garden: null, plants: [] });
  const [spot, setSpot] = useState("All");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await base44.functions.invoke("getSharedGarden", { token: shareToken });
        if (cancelled) return;
        if (!data?.found) setState({ loading: false, garden: null, plants: [] });
        else {
          setState({ loading: false, garden: data.garden, plants: data.plants || [] });
          document.title = `${data.garden.name} · Happy Plants`;
        }
      } catch {
        if (!cancelled) setState({ loading: false, garden: null, plants: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [shareToken]);

  const spots = useMemo(() => {
    const s = [...new Set(state.plants.map((p) => p.spot).filter(Boolean))].sort();
    return s.length > 1 ? ["All", ...s] : [];
  }, [state.plants]);

  const shown = spot === "All" ? state.plants : state.plants.filter((p) => p.spot === spot);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f7f1]">
        <Loader2 className="w-8 h-8 animate-spin text-green-700" />
      </div>
    );
  }

  if (!state.garden) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f7f1] px-4">
        <div className="w-full max-w-sm text-center bg-white rounded-3xl p-8 shadow-sm border border-green-100">
          <Sprout className="w-12 h-12 mx-auto text-green-600 mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">This garden isn't shared right now</h1>
          <p className="text-gray-600 text-sm mb-6">The link may have been turned off or replaced by its owner.</p>
          <a href={PLAY_URL} className="inline-block w-full rounded-full bg-green-700 text-white font-semibold py-3">
            Get Happy Plants
          </a>
        </div>
      </div>
    );
  }

  const { garden, plants } = state;

  return (
    <div className="min-h-screen bg-[#f3f7f1] pb-28">
      <header className="bg-gradient-to-b from-green-800 to-green-700 text-white px-4 pt-10 pb-8 rounded-b-[2rem]">
        <div className="max-w-xl mx-auto text-center">
          {garden.avatar ? (
            <img src={garden.avatar} alt="" className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-4 border-white/80" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/15 mx-auto mb-3 flex items-center justify-center">
              <Leaf className="w-10 h-10" />
            </div>
          )}
          <h1 className="text-2xl font-bold leading-tight">{garden.name}</h1>
          {garden.handle && <p className="text-green-100 text-sm mt-1">@{garden.handle}</p>}
          {garden.description && <p className="text-green-50 mt-3 text-[15px] leading-relaxed">{garden.description}</p>}
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
            🌱 {plants.length} plant{plants.length === 1 ? "" : "s"}
            {garden.tier ? <span className="text-green-100">· {garden.tier}</span> : null}
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5">
        {spots.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 no-scrollbar">
            {spots.map((s) => (
              <button
                key={s}
                onClick={() => setSpot(s)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border ${
                  spot === s ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-800 border-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {plants.length === 0 ? (
          <p className="text-center text-gray-600 py-16">No plants in this garden yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {shown.map((p) => (
              <article key={p.id} className="bg-white rounded-2xl overflow-hidden border border-green-100 shadow-sm">
                <div className="aspect-square bg-green-50">
                  {p.photo ? (
                    <img src={p.photo} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🪴</div>
                  )}
                </div>
                <div className="p-3">
                  <h2 className="font-semibold text-gray-900 leading-snug truncate">{p.name}</h2>
                  {(p.species || p.scientific_name) && (
                    <p className="text-xs text-gray-600 italic truncate">{p.species || p.scientific_name}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.spot && (
                      <span className="inline-flex items-center gap-1 text-[11px] rounded-full bg-green-50 text-green-800 px-2 py-0.5">
                        <MapPin className="w-3 h-3" />{p.spot}
                      </span>
                    )}
                    {p.water_every_days && (
                      <span className="inline-flex items-center gap-1 text-[11px] rounded-full bg-blue-50 text-blue-800 px-2 py-0.5">
                        <Droplets className="w-3 h-3" />every {p.water_every_days}d
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-green-100 px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <p className="flex-1 text-sm text-gray-700 leading-tight">Keep your own plants alive with reminders and plant ID.</p>
          <a href={PLAY_URL} className="shrink-0 rounded-full bg-green-700 text-white text-sm font-semibold px-4 py-2.5">
            Get the app
          </a>
        </div>
      </div>
    </div>
  );
}
