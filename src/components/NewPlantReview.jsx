import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Pencil, RotateCcw, Camera } from 'lucide-react';
import { usePhotoSource } from '@/components/PhotoSourceSheet';
import { prepareImageForUpload } from '@/lib/imageResize';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { refreshPlantData } from '@/lib/query-client';
import { aiLimitInfo, handleAiLimit } from '@/lib/premium';
import { AREA_OPTIONS, ENVIRONMENTS, myAreas } from '@/lib/areas';
import { WATER_METHODS, POT_SIZES, waterMethod } from '@/lib/waterAmount';

// "Check your new plant": after a plant is added (photo, typed or spoken), ask where it
// lives, how it's watered, the pot width (for plants you water normally), and show the
// scientific name with a way to correct it. A corrected name redoes the plant's care.
// The plant is already saved; this only fills in the rest, so closing the app loses nothing.
// inline: the same questions as a card at the top of the plant's own page (plants added in
// bulk, or put off with "Later"). Saving it, with a place picked, takes the plant out of
// "Newly added".

const name = (p) => p?.nickname || p?.name || 'New plant';

export default function NewPlantReview({ plant, allPlants, ui, onDone, onLater, navigate, inline = false }) {
  const [local, setLocal] = useState(plant);
  const [area, setArea] = useState(null); // { value, environment }
  const [otherArea, setOtherArea] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [env, setEnv] = useState(null);
  const [method, setMethod] = useState(null);
  const [methodTouched, setMethodTouched] = useState(false);
  const [pot, setPot] = useState(null); // number of inches, 0 = in the ground, 'unsure'
  const [sciEdit, setSciEdit] = useState(false);
  const [sciText, setSciText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);

  // New plant shown: start from what we know
  useEffect(() => {
    setLocal(plant);
    const loc = String(plant?.location || '').trim();
    setArea(loc ? { value: loc, environment: plant?.environment || null } : null);
    setEnv(plant?.environment || null);
    setOtherArea('');
    setShowOther(false);
    setMethod(plant?.care_profile ? waterMethod(plant) : null);
    setMethodTouched(false);
    setPot(plant?.pot_diameter_in === 0 || plant?.pot_diameter_in ? plant.pot_diameter_in : null);
    setSciEdit(false);
    setSciText(plant?.scientific_name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant?.id]);

  // The watering profile can arrive a few seconds after the name: pick it up unless
  // they've already chosen
  useEffect(() => {
    if (!plant) return;
    setLocal((l) => ({ ...l, ...plant }));
    if (!methodTouched && plant.care_profile) setMethod(waterMethod(plant));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant?.care_profile?.at, plant?.water_method, plant?.add_status, plant?.scientific_name]);

  const areas = useMemo(() => {
    const mine = myAreas(allPlants, plant?.id);
    const seen = new Set(mine.map((a) => a.value.toLowerCase()));
    return [...mine, ...AREA_OPTIONS.filter((a) => !seen.has(a.value.toLowerCase()))].slice(0, 14);
  }, [allPlants, plant?.id]);

  if (!plant) return null;

  const failed = local?.add_status === 'failed';
  const info = local?.add_info || {};
  const waitingForId = failed && info.error === 'limit_reached';
  const alts = (Array.isArray(info.alternatives) ? info.alternatives : [])
    .filter((a) => a?.scientific_name && a.scientific_name !== local?.scientific_name).slice(0, 3);
  const showAlts = !failed && info.confidence && info.confidence !== 'high' && alts.length > 0;
  // "Is it one of these?": the best guess and the others, each with a reference photo
  const choices = (Array.isArray(info.choices) ? info.choices : []).filter((c) => c?.scientific_name);
  const showPicker = !failed && info.confidence && info.confidence !== 'high' && choices.length >= 2 && choices.some((c) => c.photo?.url);
  const canAddPhoto = !failed && !!local?.image_url && info.confidence !== 'high' && (Number(info.extra_tries) || 0) < 3;
  const isCurrent = (c) => String(c.scientific_name).toLowerCase() === String(local?.scientific_name || '').toLowerCase();
  const pours = (method || 'pour') === 'pour';

  const chip = (active) => `px-3 py-2 rounded-xl text-sm font-medium border active:scale-95 transition ${
    active ? 'bg-green-600 border-green-600 text-white' : ui.light ? 'bg-white border-gray-300 text-gray-800' : 'bg-white/10 border-white/20 text-white'}`;

  const pickArea = (a) => {
    setShowOther(false);
    setArea(a);
    if (a.environment) setEnv(a.environment);
  };

  const rename = async (sci) => {
    const value = String(sci || '').trim();
    if (!value || renaming) return;
    setRenaming(true);
    try {
      const { data } = await base44.functions.invoke('identifyPlantWithExpert', { plant_id: plant.id, scientific_name: value });
      if (!data?.success || !data.plant) throw new Error(data?.error || 'failed');
      setLocal(data.plant);
      setSciText(data.plant.scientific_name || value);
      setSciEdit(false);
      if (!methodTouched && data.plant.care_profile) setMethod(waterMethod(data.plant));
      refreshPlantData();
      toast.success(`Updated care for ${data.plant.scientific_name || value}`);
    } catch (e) {
      if (aiLimitInfo(e)) { await handleAiLimit(e, navigate); return; }
      toast.error("Couldn't update that. Check the spelling and try again.");
    } finally {
      setRenaming(false);
    }
  };

  // A close-up, a flower or the nursery tag: name it again from both photos. Sent inline
  // (no upload), so it costs no Base44 credit and no photo ID.
  const [extraBusy, setExtraBusy] = useState(false);
  const addPhoto = useCallback(async (files) => {
    const file = files?.[0];
    if (!file || extraBusy) return;
    setExtraBusy(true);
    try {
      const { main } = await prepareImageForUpload(file, { mainSide: 1280 });
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(main);
      });
      const before = local?.scientific_name;
      const { data } = await base44.functions.invoke('identifyPlantWithExpert', { plant_id: plant.id, extra_photo: b64, mime: main.type || 'image/jpeg' });
      if (!data?.success || !data.plant) throw new Error(data?.error || 'failed');
      setLocal(data.plant);
      setSciText(data.plant.scientific_name || '');
      if (!methodTouched && data.plant.care_profile) setMethod(waterMethod(data.plant));
      refreshPlantData();
      toast.success(data.changed ? `With the second photo, it looks like ${data.plant.name}` : `Still looks like ${data.plant.name || before}`);
    } catch (e) {
      if (aiLimitInfo(e)) { await handleAiLimit(e, navigate); return; }
      toast.error("Couldn't check that photo. Try again in a moment.");
    } finally {
      setExtraBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant?.id, local?.scientific_name, extraBusy, methodTouched]);
  const extraPhoto = usePhotoSource(addPhoto, { title: 'A close-up, a flower, or its plant tag' });

  const retry = async () => {
    setRetrying(true);
    try {
      const { data } = await base44.functions.invoke('identifyPlantWithExpert', { plant_id: plant.id });
      if (!data?.success || !data.plant) throw new Error('failed');
      setLocal(data.plant);
      setSciText(data.plant.scientific_name || '');
      refreshPlantData();
    } catch (e) {
      if (aiLimitInfo(e)) { await handleAiLimit(e, navigate); return; }
      toast.error("Still couldn't name it. You can type its name instead.");
    } finally {
      setRetrying(false);
    }
  };

  const save = async () => {
    const loc = showOther ? otherArea.trim() : (area?.value || '');
    if (!loc) { toast.error('Pick where it lives first'); return; }
    setSaving(true);
    try {
      const patch = { location: loc, add_status: 'done' };
      if (env) patch.environment = env;
      const chosen = method || waterMethod(local);
      if (chosen !== waterMethod(local)) {
        patch.water_method = chosen;
        // The care sheet can land while this screen is open: build on the saved profile, not
        // the copy this screen started with, so its watering numbers aren't overwritten
        let cur = local?.care_profile || {};
        try { const [fresh] = await base44.entities.Plant.filter({ id: plant.id }); if (fresh?.care_profile) cur = fresh.care_profile; } catch { /* use what we have */ }
        patch.care_profile = { ...cur, user_method: true };
      }
      if (chosen === 'pour' && pot !== null && pot !== 'unsure') patch.pot_diameter_in = Number(pot);
      await base44.entities.Plant.update(plant.id, patch);
      // Now we know if it lives indoors or outdoors: use that spot's watering numbers
      if (env && env !== local?.environment) {
        base44.functions.invoke('plus', { action: 'retune', plant_ids: [plant.id] })
          .then(() => refreshPlantData()).catch(() => { /* the hourly sweep does it */ });
      }
      refreshPlantData();
      onDone({ ...local, ...patch });
    } catch {
      toast.error("Couldn't save. Check your signal and try again.");
    } finally {
      setSaving(false);
    }
  };

  const border = ui.light ? 'border-gray-200' : 'border-white/15';
  const pageBg = ui.light ? 'bg-gray-50' : 'bg-neutral-950';
  const sectionTitle = `text-sm font-bold mb-2 ${ui.text}`;

  const body = (
      <div className={inline ? 'px-4 pb-4 space-y-5' : 'flex-1 overflow-y-auto px-4 py-4 space-y-5'}>
        {/* What it is */}
        <div className={inline ? 'flex gap-3' : `rounded-2xl border p-3 flex gap-3 ${ui.card}`}>
          {inline ? null : local?.thumbnail_url || local?.image_url ? (
            <img src={local.thumbnail_url || local.image_url} alt="" className="w-24 h-24 rounded-xl object-cover shrink-0" />
          ) : (
            <span className={`w-24 h-24 rounded-xl shrink-0 flex items-center justify-center text-4xl ${ui.light ? 'bg-green-100' : 'bg-white/10'}`} aria-hidden>🪴</span>
          )}
          <div className="min-w-0 flex-1">
            {failed ? (
              <>
                <p className={`font-bold ${ui.text}`}>{waitingForId ? 'Waiting for a photo ID' : "We couldn't name this one"}</p>
                <p className={`text-xs ${ui.sub}`}>
                  {waitingForId
                    ? "You were out of photo IDs for the day. It gets named on its own when they're back, or type its name below (always free)."
                    : 'Try again, or type its name below.'}
                </p>
                <button onClick={retry} disabled={retrying} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-green-600">
                  {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} {waitingForId ? 'Name it now' : 'Try again'}
                </button>
              </>
            ) : (
              <>
                {/* On the plant's own page the name is already at the top */}
                {!inline && <p className={`text-lg font-bold leading-tight ${ui.text}`}>{name(local)}</p>}
                {local?.scientific_name && !sciEdit && !inline && (
                  <p className={`text-sm italic ${ui.sub}`}>{local.scientific_name}</p>
                )}
                {!sciEdit && (
                  <button onClick={() => { setSciEdit(true); setSciText(local?.scientific_name || ''); }}
                    className="mt-1 flex items-center gap-1 text-xs font-semibold text-green-600 underline">
                    <Pencil className="w-3 h-3" /> Not right? Change the name
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {(sciEdit || failed) && (
          <div>
            <p className={sectionTitle}>{failed ? 'What is it?' : 'Scientific name'}</p>
            <div className="flex gap-2">
              <input
                value={sciText}
                onChange={(e) => setSciText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') rename(sciText); }}
                placeholder={failed ? 'e.g. African violet or Saintpaulia ionantha' : 'e.g. Saintpaulia ionantha'}
                className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-base ${ui.light ? 'bg-white border-gray-300 text-gray-900' : 'bg-white/10 border-white/20 text-white'}`}
                autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
              />
              <button onClick={() => rename(sciText)} disabled={renaming || !sciText.trim()} aria-label="Use this name"
                className="w-12 shrink-0 rounded-xl bg-green-600 text-white flex items-center justify-center disabled:opacity-50 active:scale-95">
                {renaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              </button>
            </div>
            <p className={`text-xs mt-1 ${ui.sub}`}>We'll redo its care, watering schedule and how it's watered for this name.</p>
          </div>
        )}

        {showPicker && !sciEdit && (
          <div>
            <p className={sectionTitle}>Is it one of these?</p>
            <p className={`text-xs -mt-1 mb-2 ${ui.sub}`}>We're not sure. Tap the one that looks like your plant.</p>
            <div className="grid grid-cols-2 gap-2">
              {choices.map((c) => {
                const current = isCurrent(c);
                return (
                  <button key={c.scientific_name} onClick={() => (current ? toast.success(`Keeping ${c.name || c.scientific_name}`) : rename(c.scientific_name))}
                    disabled={renaming}
                    className={`text-left rounded-xl overflow-hidden border active:scale-[0.98] transition disabled:opacity-60 ${current ? 'border-green-600 ring-2 ring-green-600' : ui.light ? 'border-gray-200 bg-white' : 'border-white/15 bg-white/5'}`}>
                    <div className={`relative aspect-square ${ui.light ? 'bg-gray-100' : 'bg-white/10'}`}>
                      {c.photo?.url
                        ? <img src={c.photo.url} alt={c.name || c.scientific_name} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                        : <span className="w-full h-full flex items-center justify-center text-4xl" aria-hidden>🪴</span>}
                      {current && <span className="absolute top-1.5 left-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold px-2 py-0.5">Our best guess</span>}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className={`text-sm font-semibold leading-tight ${ui.text}`}>{c.name || c.scientific_name}</p>
                      <p className={`text-xs italic truncate ${ui.sub}`}>{c.scientific_name}</p>
                      {c.photo?.credit && <p className={`text-[9px] leading-tight mt-0.5 line-clamp-2 ${ui.sub}`}>Photo: {c.photo.credit}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            {renaming && <p className={`text-xs mt-2 flex items-center gap-1.5 ${ui.sub}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating its care for that plant…</p>}
          </div>
        )}

        {canAddPhoto && !sciEdit && (
          <div>
            {extraPhoto.sheet}
            <button onClick={extraPhoto.openPicker} disabled={extraBusy}
              className={`w-full flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold active:scale-[0.98] disabled:opacity-60 ${ui.light ? 'bg-white border-gray-300 text-gray-800' : 'bg-white/10 border-white/20 text-white'}`}>
              {extraBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {extraBusy ? 'Checking the new photo…' : 'Add a close-up or the plant tag'}
            </button>
            <p className={`text-xs mt-1 ${ui.sub}`}>A close-up of the leaves, spines or flower, or a photo of the tag it came with, helps us name it.</p>
          </div>
        )}

        {showAlts && !showPicker && !sciEdit && (
          <div>
            <p className={`text-xs mb-1.5 ${ui.sub}`}>Could also be:</p>
            <div className="flex flex-wrap gap-1.5">
              {alts.map((a) => (
                <button key={a.scientific_name} onClick={() => rename(a.scientific_name)} disabled={renaming} className={chip(false)}>
                  <span className="italic">{a.scientific_name}</span>{a.name ? ` · ${a.name}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Where it lives */}
        <div>
          <p className={sectionTitle}>Where does it live?</p>
          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => (
              <button key={a.value} onClick={() => pickArea(a)} className={chip(!showOther && area?.value?.toLowerCase() === a.value.toLowerCase())}>
                {a.label}
              </button>
            ))}
            <button onClick={() => { setShowOther(true); setArea(null); }} className={chip(showOther)}>Other…</button>
          </div>
          {showOther && (
            <input value={otherArea} onChange={(e) => setOtherArea(e.target.value)} placeholder="e.g. Front porch"
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-base ${ui.light ? 'bg-white border-gray-300 text-gray-900' : 'bg-white/10 border-white/20 text-white'}`} />
          )}
          {(area || showOther) && (
            <div className="mt-3">
              <p className={`text-xs mb-1.5 ${ui.sub}`}>Is that inside or outside?</p>
              <div className="flex flex-wrap gap-1.5">
                {ENVIRONMENTS.map((e) => (
                  <button key={e} onClick={() => setEnv(e)} className={chip(env === e)}>{e}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* How it's watered */}
        <div>
          <p className={sectionTitle}>How is it watered?</p>
          {method === null && !failed && (
            <p className={`text-xs mb-1.5 flex items-center gap-1.5 ${ui.sub}`}><Loader2 className="w-3 h-3 animate-spin" /> Checking what this plant usually needs…</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {WATER_METHODS.map((m) => (
              <button key={m.id} onClick={() => { setMethod(m.id); setMethodTouched(true); }} className={chip((method || '') === m.id)}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pot width (only when you pour water into the soil) */}
        {pours && (
          <div>
            <p className={sectionTitle}>How wide is the pot across the top?</p>
            <div className="flex flex-wrap gap-1.5">
              {POT_SIZES.map((s) => (
                <button key={s} onClick={() => setPot(s)} className={chip(pot === s)}>{s}″</button>
              ))}
              <button onClick={() => setPot(0)} className={chip(pot === 0)}>In the ground</button>
              <button onClick={() => setPot('unsure')} className={chip(pot === 'unsure')}>Not sure</button>
            </div>
            <p className={`text-xs mt-1 ${ui.sub}`}>Used to work out how many ounces to give. You can change it later.</p>
          </div>
        )}
      </div>
  );

  const saveButton = (
    <button onClick={save} disabled={saving || renaming} className="flex-[2] flex items-center justify-center gap-2 rounded-2xl py-3.5 bg-green-600 text-white font-bold active:scale-95 disabled:opacity-60">
      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Save
    </button>
  );

  if (inline) {
    return (
      <section className={`rounded-2xl border-2 border-green-500/60 overflow-hidden ${ui.card}`} aria-label="Finish setting up this plant">
        <div className="px-4 pt-4 pb-3">
          <p className={`text-lg font-bold ${ui.text}`}>🌱 New plant: finish setting it up</p>
          <p className={`text-sm ${ui.sub}`}>Pick where it lives and check how it's watered. It stays under Newly added until you save.</p>
        </div>
        {body}
        <div className="px-4 pb-4 flex">{saveButton}</div>
      </section>
    );
  }

  return createPortal(
    <div className={`fixed inset-0 z-[300] flex flex-col ${pageBg}`} role="dialog" aria-modal="true" aria-label="Check your new plant"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className={`px-4 py-3 border-b flex items-center justify-between ${border}`}>
        <p className={`text-lg font-bold ${ui.text}`}>🌱 Check your new plant</p>
        <button onClick={onLater} aria-label="Later" className={`p-2 -mr-2 rounded-full ${ui.text}`}><X className="w-6 h-6" /></button>
      </div>
      {body}
      <div className={`px-4 pt-3 pb-4 border-t flex gap-3 ${border}`}>
        <button onClick={onLater} className={`flex-1 rounded-2xl py-3.5 font-semibold border ${ui.card} ${ui.text}`}>Later</button>
        {saveButton}
      </div>
    </div>,
    document.body,
  );
}
