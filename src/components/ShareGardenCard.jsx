import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Share2, Copy, Eye, Link2Off, RefreshCw, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Capacitor, registerPlugin } from "@capacitor/core";

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// "Share my garden": a public link anyone can open (no account needed) that
// shows your plants' photos and names. Off until you turn it on.
export default function ShareGardenCard({ cardClass, textClass, subTextClass }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [confirm, setConfirm] = useState(null); // 'disable' | 'regenerate'
  const [copied, setCopied] = useState(false);

  const call = async (action, extra = {}) => {
    setBusy(action);
    try {
      const { data } = await base44.functions.invoke("generateShareToken", { action, ...extra });
      if (data?.error) throw new Error(data.error);
      setInfo(data);
      setName(data.public_name || "");
      setDesc(data.public_description || "");
      return data;
    } catch (e) {
      toast.error("Couldn't update your share link. Try again.");
      return null;
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  useEffect(() => { call("get"); }, []);

  const share = async () => {
    if (!info?.share_url) return;
    const text = `Check out my plants on Happy Plants 🌱 ${info.share_url}`;
    // New app builds: Android's own share sheet (Messages, WhatsApp, Instagram…)
    if (Capacitor.isNativePlatform()) {
      try { await registerPlugin('NotifyBridge').shareText({ text, title: info.public_name || 'My garden' }); return; } catch { /* older build: copy instead */ }
    }
    if (navigator.share) {
      try { await navigator.share({ title: info.public_name, text, url: info.share_url }); return; } catch { /* cancelled or unsupported */ }
    }
    const ok = await copyText(info.share_url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link copied — paste it in a text or post");
    } else toast.error("Couldn't copy. Press and hold the link to copy it.");
  };

  const saveDetails = () => {
    if ((name || "") === (info?.public_name || "") && (desc || "") === (info?.public_description || "")) return;
    call("update", { public_name: name, public_description: desc }).then((d) => d && toast.success("Saved"));
  };

  const inputClass = "w-full rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600";

  return (
    <div className={`rounded-xl mb-6 p-6 ${cardClass}`}>
      <h3 className={`text-lg font-bold mb-1 flex items-center gap-2 ${textClass}`}>
        <Share2 className="w-5 h-5 text-green-600" /> Share my garden
      </h3>
      <p className={`text-sm mb-4 ${subTextClass}`}>
        A link anyone can open, even without the app. It shows your plants' photos, names and spots — never your email, notes or chats.
      </p>

      {!info ? (
        <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-green-600" /></div>
      ) : !info.enabled ? (
        <button
          onClick={() => call("enable")}
          disabled={!!busy}
          className="w-full rounded-full bg-green-700 text-white font-semibold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          {info.share_token ? "Turn my link back on" : "Create my share link"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-900 break-all select-all">
            {info.share_url}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={share} className="rounded-full bg-green-700 text-white font-semibold py-2.5 flex items-center justify-center gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy link"}
            </button>
            <button
              onClick={() => navigate(`/SharedGardenView/${info.share_token}`)}
              className="rounded-full bg-white text-gray-900 border border-gray-300 font-semibold py-2.5 flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
          </div>

          <div className="space-y-2 pt-1">
            <label className={`block text-xs font-semibold ${subTextClass}`}>Garden name</label>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={saveDetails} className={inputClass} />
            <label className={`block text-xs font-semibold ${subTextClass}`}>Short description (optional)</label>
            <textarea value={desc} maxLength={280} rows={2} onChange={(e) => setDesc(e.target.value)} onBlur={saveDetails} className={inputClass} placeholder="e.g. My apartment jungle 🌿" />
          </div>

          {confirm ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-900 mb-2">
                {confirm === "disable"
                  ? "Turn off your link? Anyone who has it will see \"not shared\"."
                  : "Make a new link? The old link will stop working."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirm(null)} className="rounded-full bg-white border border-gray-300 text-gray-900 py-2 text-sm font-semibold">Cancel</button>
                <button onClick={() => call(confirm)} disabled={!!busy} className="rounded-full bg-red-600 text-white py-2 text-sm font-semibold disabled:opacity-60">
                  {busy ? "…" : confirm === "disable" ? "Turn off" : "New link"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirm("regenerate")} className={`rounded-full border border-gray-300 py-2 text-sm font-medium flex items-center justify-center gap-1.5 ${textClass}`}>
                <RefreshCw className="w-4 h-4" /> New link
              </button>
              <button onClick={() => setConfirm("disable")} className="rounded-full border border-red-300 text-red-600 py-2 text-sm font-medium flex items-center justify-center gap-1.5">
                <Link2Off className="w-4 h-4" /> Turn off
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
