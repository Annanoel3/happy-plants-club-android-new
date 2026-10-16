import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Sparkles, ShieldCheck, Leaf, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  getPremiumStatus, billingAvailable, getPlans, buyPlan, restorePurchases, manageSubscriptionUrl,
} from "@/lib/premium";

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.mediocreatbest.happyplants";

function periodWords(iso) {
  return { P1M: "month", P1Y: "year", P1W: "week", P3M: "3 months", P6M: "6 months" }[iso] || iso || "period";
}
function trialWords(iso) {
  if (!iso) return null;
  const m = /^P(\d+)([DWMY])$/.exec(iso);
  if (!m) return null;
  const n = +m[1];
  const unit = { D: "day", W: "week", M: "month", Y: "year" }[m[2]];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export default function Premium() {
  const navigate = useNavigate();
  const [theme] = useState(() => { try { return localStorage.getItem("theme") || "light"; } catch { return "light"; } });
  const dark = !(theme === "light" || theme === "kawaii");
  const text = dark ? "text-white" : "text-gray-900";
  const sub = dark ? "text-gray-300" : "text-gray-600";
  const card = dark ? "bg-black/50 border border-white/10" : "bg-white border border-gray-200";

  const [status, setStatus] = useState(null);
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState(null);
  const [choice, setChoice] = useState("annual");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      const [s, b] = await Promise.all([
        getPremiumStatus().catch(() => null),
        billingAvailable(),
      ]);
      setStatus(s);
      setBilling(b);
      if (b.available) {
        try { setPlans(await getPlans()); } catch (e) { setPlans({ error: e?.message || "offerings" }); }
      }
    })();
  }, []);

  const savings = useMemo(() => {
    const m = plans?.monthly?.priceMicros, a = plans?.annual?.priceMicros;
    if (!m || !a) return null;
    const pct = Math.round((1 - a / (m * 12)) * 100);
    return pct > 0 ? pct : null;
  }, [plans]);

  const selected = choice === "annual" ? (plans?.annual || plans?.monthly) : (plans?.monthly || plans?.annual);

  const subscribe = async () => {
    if (!selected) return;
    setBusy("buy");
    try {
      const r = await buyPlan(selected.id);
      if (r.cancelled) return;
      if (r.plus) {
        setStatus(r.status);
        toast.success("Welcome to Happy Plants Plus! 🌿");
      } else {
        toast.message("Purchase received — it can take a minute to activate. Tap Restore if it doesn't.");
      }
    } catch (e) {
      toast.error("The purchase didn't go through. You haven't been charged.");
    } finally { setBusy(null); }
  };

  const restore = async () => {
    setBusy("restore");
    try {
      const r = await restorePurchases();
      if (r.plus) { setStatus(r.status); toast.success("Plus restored 🌿"); }
      else toast.message("No active Plus subscription found on this Google account.");
    } catch {
      toast.error("Couldn't restore right now. Try again in a moment.");
    } finally { setBusy(null); }
  };

  const limits = status?.limits;
  const rows = [
    { k: "identify", label: "Plant IDs per day" },
    { k: "health", label: "Health checks per day" },
    { k: "chat", label: "AI chat messages per day" },
  ];

  if (!status && !billing) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>;
  }

  const plus = !!status?.plus;
  const s = status?.subscription;

  return (
    <div className="min-h-screen theme-bg px-4 pt-4 pb-28">
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate(-1)} className={`mb-3 inline-flex items-center gap-1 text-sm font-medium ${text}`}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="rounded-3xl p-6 mb-4 text-white bg-gradient-to-br from-green-700 to-emerald-900 shadow-lg">
          <div className="flex items-center gap-2 text-green-100 text-sm font-semibold"><Sparkles className="w-4 h-4" /> Happy Plants Plus</div>
          <h1 className="text-2xl font-bold mt-2 leading-tight">{plus ? "You're Plus 🌿" : "No ads. Way more AI."}</h1>
          <p className="text-green-50 mt-2 text-[15px]">
            {plus ? "Thanks for supporting a one-person plant app." : "Keep every plant alive with fewer limits — and support a one-person plant app."}
          </p>
        </div>

        <div className={`rounded-2xl p-5 mb-4 ${card}`}>
          <ul className="space-y-3">
            <li className="flex gap-3"><Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /><span className={text}><b>No ads</b> — ever</span></li>
            <li className="flex gap-3"><Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /><span className={text}><b>Way more</b> plant IDs, health checks and AI chat</span></li>
            <li className="flex gap-3"><Leaf className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /><span className={text}>Everything else in Happy Plants stays free</span></li>
          </ul>
          {limits && (
            <table className="w-full mt-5 text-sm">
              <thead>
                <tr className={sub}><th className="text-left font-medium pb-2"></th><th className="font-medium pb-2">Free</th><th className="font-medium pb-2">Plus</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.k} className={`border-t ${dark ? "border-white/10" : "border-gray-100"}`}>
                    <td className={`py-2 ${text}`}>{r.label}</td>
                    <td className={`py-2 text-center ${sub}`}>{limits[r.k].free}</td>
                    <td className="py-2 text-center font-semibold text-green-600">{limits[r.k].plus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {plus ? (
          <div className={`rounded-2xl p-5 mb-4 ${card}`}>
            <div className="flex items-center gap-2 text-green-600 font-semibold"><ShieldCheck className="w-5 h-5" /> Active</div>
            {s?.expires_at && (
              <p className={`text-sm mt-2 ${sub}`}>
                {s.will_renew ? "Renews" : "Ends"} {new Date(s.expires_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                {s.sandbox ? " (test purchase)" : ""}
              </p>
            )}
            <a href={manageSubscriptionUrl(s?.product_id)} target="_blank" rel="noreferrer"
               className="mt-4 block text-center w-full rounded-full border border-green-600 text-green-700 font-semibold py-2.5 bg-white">
              Manage or cancel in Google Play
            </a>
          </div>
        ) : !billing?.available ? (
          <div className={`rounded-2xl p-5 mb-4 text-center ${card}`}>
            {billing?.reason === "update_needed" ? (
              <>
                <p className={`font-semibold ${text}`}>Update Happy Plants to subscribe</p>
                <p className={`text-sm mt-1 ${sub}`}>Your version of the app doesn't have subscriptions yet.</p>
                <a href={PLAY_URL} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-green-700 text-white font-semibold px-5 py-2.5">Open Google Play</a>
              </>
            ) : billing?.reason === "web" ? (
              <p className={`font-semibold ${text}`}>Subscribe from the Happy Plants Android app.</p>
            ) : (
              <p className={`font-semibold ${text}`}>Plus is almost ready — check back soon!</p>
            )}
          </div>
        ) : plans?.error || !(plans?.monthly || plans?.annual) ? (
          <div className={`rounded-2xl p-5 mb-4 text-center ${card}`}>
            {!plans ? <Loader2 className="w-6 h-6 animate-spin text-green-600 mx-auto" /> : (
              <p className={`font-semibold ${text}`}>Plans couldn't load. Check your connection and try again.</p>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-3 mb-4">
              {[["annual", plans.annual], ["monthly", plans.monthly]].filter(([, p]) => p).map(([key, p]) => {
                const on = (choice === key) || !(key === "annual" ? plans.monthly : plans.annual);
                const trial = trialWords(p.freeTrial);
                return (
                  <button key={key} onClick={() => setChoice(key)}
                    className={`text-left rounded-2xl p-4 border-2 transition ${on ? "border-green-600 bg-green-600/10" : dark ? "border-white/15 bg-black/40" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold ${text}`}>{key === "annual" ? "Yearly" : "Monthly"}</span>
                      {key === "annual" && savings && <span className="text-xs font-bold rounded-full bg-green-600 text-white px-2 py-0.5">Save {savings}%</span>}
                    </div>
                    <p className={`mt-1 ${text}`}><span className="text-xl font-bold">{p.price}</span><span className={sub}> / {periodWords(p.period)}</span></p>
                    {trial && <p className="text-sm text-green-600 font-medium mt-0.5">{trial} free</p>}
                  </button>
                );
              })}
            </div>

            {billing.testStore && (
              <p className="text-xs text-center mb-2 text-amber-500 font-medium">Test mode — no real money is charged.</p>
            )}

            <button onClick={subscribe} disabled={!!busy}
              className="w-full rounded-full bg-green-700 text-white font-bold py-3.5 text-lg flex items-center justify-center gap-2 disabled:opacity-60">
              {busy === "buy" && <Loader2 className="w-5 h-5 animate-spin" />}
              {trialWords(selected?.freeTrial) ? `Start ${trialWords(selected.freeTrial)} free` : "Subscribe"}
            </button>

            <p className={`text-xs leading-relaxed mt-3 ${sub}`}>
              {trialWords(selected?.freeTrial)
                ? `Free for ${trialWords(selected.freeTrial)}, then ${selected?.price} per ${periodWords(selected?.period)}. `
                : `${selected?.price} per ${periodWords(selected?.period)}. `}
              Your subscription renews automatically until you cancel. Cancel anytime in Google Play → Payments & subscriptions → Subscriptions
              {trialWords(selected?.freeTrial) ? "; cancel before the trial ends and you won't be charged" : ""}. Payment is charged to your Google Play account.
            </p>
          </>
        )}

        <div className="flex items-center justify-center gap-4 mt-5 text-sm">
          {billing?.available && (
            <button onClick={restore} disabled={!!busy} className={`font-semibold underline ${text}`}>
              {busy === "restore" ? "Restoring…" : "Restore purchases"}
            </button>
          )}
          <a href="/TermsAndConditions" className={`underline ${sub}`}>Terms</a>
          <a href="/PrivacyPolicy" className={`underline ${sub}`}>Privacy</a>
        </div>
      </div>
    </div>
  );
}
