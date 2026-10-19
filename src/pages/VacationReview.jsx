import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Calendar, FileText, Home, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { localToday } from "@/lib/dates";
import { niceDay } from "@/lib/vacation";

// How often the sitter comes. Fewer visits = easier for the sitter; the plan waters each
// plant at the visit closest to its due day, and warns about plants that can't wait.
const VISIT_OPTIONS = [
  { id: 0, label: 'Only when plants need water' },
  { id: 2, label: 'Every 2 days' },
  { id: 3, label: 'Every 3 days' },
  { id: 3.5, label: 'Twice a week' },
  { id: 7, label: 'Once a week' },
];

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };
const isNative = () => { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } };
function daysBetween(a, b) {
  return Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000);
}

export default function VacationReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const vacationId = urlParams.get('id');

  const [user, setUser] = useState(null);
  const [plantNotes, setPlantNotes] = useState({});
  const [openNotes, setOpenNotes] = useState(() => new Set());
  const [customInstructions, setCustomInstructions] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [visitEvery, setVisitEvery] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfLink, setPdfLink] = useState(null); // { url, at }
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => navigate('/'));
  }, []);

  useEffect(() => {
    const handleThemeChange = () => setTheme(localStorage.getItem('theme') || 'light');
    handleThemeChange();
    window.addEventListener('storage', handleThemeChange);
    window.addEventListener('hp-theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
    };
  }, []);

  const { data: vacation, isLoading: vacationLoading, isError: vacationError, refetch: refetchVacation } = useQuery({
    queryKey: ['vacation', vacationId],
    queryFn: async () => {
      const result = await base44.entities.VacationDay.filter({ id: vacationId });
      return result?.[0] || null;
    },
    enabled: !!vacationId && !!user,
    retry: 1,
  });

  // Fill the form once, from the saved trip
  useEffect(() => {
    if (!vacation || visitEvery !== null) return;
    setGeneralNotes(vacation.notes || "");
    setCustomInstructions(vacation.custom_instructions || "");
    setPlantNotes(vacation.plant_notes || {});
    setVisitEvery([0, 2, 3, 3.5, 7].includes(Number(vacation.visit_every)) ? Number(vacation.visit_every) : 0);
  }, [vacation]);

  // The plan, worked out on the server exactly as the PDF will be
  const { data: plan, isFetching: planLoading, isError: planError, refetch: refetchPlan } = useQuery({
    queryKey: ['vacationPlan', vacationId, visitEvery],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('generateVacationPDF', { action: 'plan', vacation_id: vacationId, visit_every: visitEvery, tz: tz() });
      if (!data?.success) throw new Error(data?.error || 'No plan');
      return data.plan;
    },
    enabled: !!vacation && visitEvery !== null,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const updateVacationMutation = useMutation({
    mutationFn: async (updates) => {
      await base44.entities.VacationDay.update(vacationId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation'] });
      queryClient.invalidateQueries({ queryKey: ['vacations'] });
    },
  });

  const formData = () => ({
    notes: generalNotes,
    custom_instructions: customInstructions,
    plant_notes: plantNotes,
    visit_every: visitEvery ?? 0,
  });

  const handleSave = async () => {
    try {
      await updateVacationMutation.mutateAsync(formData());
      toast.success('Saved');
    } catch {
      toast.error("Couldn't save. Check your connection and try again.");
    }
  };

  const openPdf = (url, win) => {
    if (isNative()) {
      // The app can't show PDFs itself: hand the link to the phone (browser / PDF viewer)
      window.location.href = url;
    } else if (win && !win.closed) {
      win.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  };

  const handleGeneratePDF = async () => {
    // On the web, open the tab right away (browsers block tabs opened after a wait)
    let win = null;
    if (!isNative()) { try { win = window.open('', '_blank'); } catch { win = null; } }
    setIsGenerating(true);
    try {
      await updateVacationMutation.mutateAsync(formData());
      const { data } = await base44.functions.invoke('generateVacationPDF', { action: 'pdf', vacation_id: vacationId, visit_every: visitEvery ?? 0, tz: tz() });
      if (!data?.url) throw new Error(data?.error || 'No link came back');
      setPdfLink({ url: data.url, at: Date.now() });
      queryClient.invalidateQueries({ queryKey: ['vacations'] });
      openPdf(data.url, win);
      toast.success('Your sitter plan is ready');
    } catch (error) {
      try { win?.close(); } catch { /* ignore */ }
      toast.error("Couldn't make the PDF. Check your connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const light = !['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'valentines', 'stpatricks', 'fall'].includes(theme);
  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-black/40 backdrop-blur-md border border-green-700/40';
    if (theme === 'christmas') return 'bg-black/40 backdrop-blur-md border border-red-700/50';
    if (theme === 'valentines') return 'bg-black/40 backdrop-blur-md border border-pink-500/30';
    if (theme === 'newyears') return 'bg-black/40 backdrop-blur-md border border-purple-500/30';
    if (theme === 'stpatricks') return 'bg-black/40 backdrop-blur-md border border-green-500/30';
    if (theme === 'fall') return 'bg-black/40 backdrop-blur-md border border-orange-700/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    if (theme === 'halloween') return 'bg-black/40 backdrop-blur-md border border-orange-500/30';
    if (theme === 'fourthofjuly') return 'bg-black/45 backdrop-blur-md border border-red-500/30';
    if (theme === 'kawaii') return 'bg-white/60 backdrop-blur-md border border-pink-200/50';
    if (theme === 'summer') return 'bg-white/60 backdrop-blur-md border border-orange-300/50';
    if (theme === 'spring') return 'bg-white/60 backdrop-blur-md border border-purple-300/50';
    if (theme === 'winter') return 'bg-white/60 backdrop-blur-md border border-blue-300/50';
    return 'bg-white/60 backdrop-blur-md border border-gray-300/50';
  };
  const text = light ? 'text-gray-900' : 'text-white';
  const sub = light ? 'text-gray-600' : 'text-white/80';
  const chip = (active) => `px-3 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95 ${
    active ? 'bg-green-600 border-green-600 text-white' : light ? 'bg-white border-gray-300 text-gray-800' : 'bg-white/10 border-white/20 text-white'}`;

  if (!user || (vacationLoading && !vacation)) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!vacation) {
    return (
      <div className="min-h-screen theme-bg p-6 flex items-center justify-center">
        <div className={`rounded-2xl p-6 max-w-sm text-center ${getThemedClasses()}`}>
          <p className={`font-semibold ${text}`}>{vacationError ? "Can't reach Happy Plants" : 'This vacation was not found'}</p>
          <div className="mt-4 flex gap-2 justify-center">
            {vacationError && <Button onClick={() => refetchVacation()}>Try again</Button>}
            <Button variant="outline" onClick={() => navigate('/Schedule')}>Back to Schedule</Button>
          </div>
        </div>
      </div>
    );
  }

  const today = localToday();
  const start = String(vacation.start_date).slice(0, 10);
  const end = String(vacation.end_date).slice(0, 10);
  const tripDays = daysBetween(start, end) + 1;
  const daysUntil = daysBetween(today, start);
  const waterings = (plan?.visits || []).reduce((n, v) => n + v.count, 0);
  const plantsInPlan = (() => {
    const seen = new Map();
    for (const v of plan?.visits || []) for (const a of v.areas) for (const p of a.plants) if (!seen.has(p.id)) seen.set(p.id, { ...p, area: a.area });
    return [...seen.values()].sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  })();
  const linkFresh = pdfLink && Date.now() - pdfLink.at < 14 * 60 * 1000;

  return (
    <div className="min-h-screen theme-bg px-4 pt-6 pb-28">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/Schedule')} className={`mb-4 flex items-center gap-2 ${text} hover:opacity-70`}>
          <ArrowLeft className="w-5 h-5" />
          Back to Schedule
        </button>

        <div className={`mb-5 rounded-2xl p-5 ${getThemedClasses()}`}>
          <h1 className={`text-3xl font-bold mb-2 ${text}`}>Sitter plan</h1>
          <div className={`flex items-center flex-wrap gap-x-3 gap-y-1 ${sub}`}>
            <span className="flex items-center gap-2"><Calendar className="w-5 h-5" />{niceDay(start)} to {niceDay(end)}</span>
            <span>({tripDays} day{tripDays === 1 ? '' : 's'})</span>
          </div>
          {daysUntil > 0 && <p className={`text-sm mt-2 ${sub}`}>{daysUntil} day{daysUntil === 1 ? '' : 's'} until you leave</p>}
        </div>

        {/* How often the sitter comes */}
        <Card className={`${getThemedClasses()} mb-5`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-lg ${text}`}>How often will your sitter come?</CardTitle>
            <p className={`text-sm ${sub}`}>Fewer visits are easier for your sitter. Each plant is watered at the visit closest to its watering day.</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How often will your sitter come?">
              {VISIT_OPTIONS.map((o) => (
                <button key={o.id} role="radio" aria-checked={visitEvery === o.id} onClick={() => setVisitEvery(o.id)} className={chip(visitEvery === o.id)}>
                  {o.label}
                </button>
              ))}
            </div>

            <div className={`mt-4 text-sm ${sub}`} aria-live="polite">
              {planError && !plan ? (
                <span>Couldn't load the plan. <button className="underline" onClick={() => refetchPlan()}>Try again</button></span>
              ) : !plan ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Working out the visits…</span>
              ) : plan.visits.length === 0 ? (
                <span>No plant needs water during this trip.</span>
              ) : (
                <span className={planLoading ? 'opacity-60' : ''}>
                  <b className={text}>{plan.visits.length} visit{plan.visits.length === 1 ? '' : 's'}</b>, {waterings} watering{waterings === 1 ? '' : 's'}: {plan.visits.map((v) => niceDay(v.date)).join(' · ')}
                </span>
              )}
            </div>

            {plan?.warnings?.length > 0 && (
              <div className={`mt-3 rounded-xl p-3 text-sm ${light ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-amber-500/15 text-amber-100 border border-amber-400/30'}`}>
                <p className="font-semibold">These may get too dry between visits:</p>
                <ul className="mt-1 list-disc pl-5">
                  {plan.warnings.map((w) => (
                    <li key={w.id}>{w.name} (needs water every {w.every} day{w.every === 1 ? '' : 's'}; could wait {w.late} extra day{w.late === 1 ? '' : 's'})</li>
                  ))}
                </ul>
                <p className="mt-1">The PDF asks your sitter to check them at every visit. More visits would fix it.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* The plan: by day, then by area */}
        {plan?.visits?.length > 0 && (
          <Card className={`${getThemedClasses()} mb-5`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-lg ${text}`}>What your sitter will see</CardTitle>
            </CardHeader>
            <CardContent className={`space-y-4 ${planLoading ? 'opacity-60' : ''}`}>
              {plan.visits.map((v) => (
                <div key={v.date}>
                  <div className="flex items-center justify-between rounded-lg bg-green-700 text-white px-3 py-1.5">
                    <span className="font-bold text-sm">{niceDay(v.date)}</span>
                    <span className="text-xs">{v.count} plant{v.count === 1 ? '' : 's'}</span>
                  </div>
                  {v.areas.map((a) => (
                    <div key={a.area} className="mt-2 pl-1">
                      <p className={`text-sm font-bold ${light ? 'text-green-800' : 'text-green-300'}`}>{a.area} ({a.plants.length})</p>
                      <ul className="mt-1 space-y-1.5">
                        {a.plants.map((p) => (
                          <li key={p.id} className="flex gap-2">
                            <span className={`mt-1 w-3.5 h-3.5 rounded-sm border shrink-0 ${light ? 'border-gray-400' : 'border-white/50'}`} aria-hidden />
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold ${text}`}>
                                {p.name}{p.sci && p.sci.toLowerCase() !== p.name.toLowerCase() && <i className={`ml-1.5 text-xs font-normal ${sub}`}>{p.sci}</i>}
                              </p>
                              <p className={`text-xs ${sub}`}>{p.how}</p>
                              {plantNotes[p.id] && <p className={`text-xs ${light ? 'text-green-800' : 'text-green-300'}`}>Note: {plantNotes[p.id]}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
              {plan.not_needed?.length > 0 && (
                <p className={`text-xs ${sub}`}>
                  No water needed during the trip: {plan.not_needed.map((p) => p.name).join(', ')}.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={`${getThemedClasses()} mb-5`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-lg ${text}`}>
              <FileText className="w-5 h-5 inline mr-2" />
              Notes for your sitter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="vac-notes" className={`block text-sm font-medium mb-2 ${text}`}>Plant care notes</label>
              <Textarea
                id="vac-notes"
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder="Anything about the plants in general (where the watering can is, which tap to use…)"
                className="theme-input min-h-20"
              />
            </div>
            <div>
              <label htmlFor="vac-other" className={`block text-sm font-medium mb-2 ${text}`}>
                <Home className="w-4 h-4 inline mr-1" />
                Other instructions (pets, A/C, trash, mail…)
              </label>
              <Textarea
                id="vac-other"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Pets, A/C settings, trash days, mail…"
                className="theme-input min-h-24"
              />
            </div>
          </CardContent>
        </Card>

        {plantsInPlan.length > 0 && (
          <Card className={`${getThemedClasses()} mb-5`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-lg ${text}`}>Notes for one plant</CardTitle>
              <p className={`text-sm ${sub}`}>Optional. They print under that plant on every day it's watered.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {plantsInPlan.map((p) => {
                const open = openNotes.has(p.id) || !!plantNotes[p.id];
                return (
                  <div key={p.id} className={`rounded-xl px-3 py-2 ${light ? 'bg-white/70' : 'bg-white/5'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-semibold min-w-0 truncate ${text}`}>{p.name} <span className={`font-normal text-xs ${sub}`}>{p.area}</span></p>
                      {!open && (
                        <button onClick={() => setOpenNotes((s) => new Set(s).add(p.id))} className={`text-xs font-semibold shrink-0 ${light ? 'text-green-700' : 'text-green-300'}`}>
                          + Add note
                        </button>
                      )}
                    </div>
                    {open && (
                      <Textarea
                        aria-label={`Note for ${p.name}`}
                        value={plantNotes[p.id] || ''}
                        onChange={(e) => setPlantNotes({ ...plantNotes, [p.id]: e.target.value })}
                        placeholder="e.g. Use the rain water in the blue bucket"
                        className="theme-input mt-2 text-sm"
                        rows={2}
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className={`mb-5 rounded-2xl p-4 flex items-start gap-3 ${getThemedClasses()}`}>
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className={`text-sm ${sub}`}>
            The plan assumes you keep watering on schedule until you leave. Make the PDF a day or two before you go so it matches your latest waterings.
            While you're away, watering reminders pause for your whole garden.
          </p>
        </div>

        {linkFresh && (
          <a href={pdfLink.url} target="_blank" rel="noopener noreferrer"
            className={`mb-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${light ? 'text-green-800 bg-green-100' : 'text-green-200 bg-green-500/15'}`}>
            <ExternalLink className="w-4 h-4" /> Open the PDF again (link works for 15 minutes)
          </a>
        )}

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={updateVacationMutation.isPending || isGenerating} className="flex-1 bg-blue-600 hover:bg-blue-700">
            {updateVacationMutation.isPending && !isGenerating ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={handleGeneratePDF} disabled={isGenerating || visitEvery === null} className="flex-[2] bg-green-600 hover:bg-green-700">
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Making the PDF…</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> PDF for your sitter</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
