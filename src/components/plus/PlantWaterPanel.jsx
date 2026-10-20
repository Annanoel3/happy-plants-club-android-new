import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import { waterAmount, POT_SIZES } from '@/lib/waterAmount';
import { todayHint, getsRain, weatherApplies, setGetsRain, RAIN_ENVS } from '@/lib/weather';
import LocationDialog from '@/components/plus/LocationDialog';
import WaterCompare from '@/components/WaterCompare';

// Plant page: "How to water" — how much (oz) and what today's weather changed. Plus.
export default function PlantWaterPanel({ plant, user, plus, plusReady, ui }) {
  const navigate = useNavigate();
  const [potOpen, setPotOpen] = useState(false);
  const [savingPot, setSavingPot] = useState(null);
  const [rainBusy, setRainBusy] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  if (!plus) {
    if (!plusReady) return null;
    return (
      <button onClick={() => navigate('/Premium')} className={`w-full text-left rounded-2xl p-4 border ${ui.card}`}>
        <p className={`font-semibold flex items-center gap-2 ${ui.text}`}><Lock className="w-4 h-4" /> How much to water</p>
        <p className={`text-sm mt-1 ${ui.sub}`}>Plus tells you how many ounces this plant needs and adjusts for rain and heat outside.</p>
      </button>
    );
  }

  const amount = waterAmount(plant);
  const pours = amount.kind === 'oz' || amount.kind === 'ground' || amount.kind === 'unknown';
  const hint = todayHint(plant);
  const showWeather = weatherApplies(plant) || plant.gets_rain === true;
  const rainOn = getsRain(plant);
  const today = localToday();
  const wt = user?.weather_day === today ? user?.weather_today : null;
  const hasPlace = typeof user?.location_lat === 'number';
  const potSet = plant.pot_diameter_in !== undefined && plant.pot_diameter_in !== null;

  const setPot = async (v) => {
    setSavingPot(v);
    try {
      await base44.entities.Plant.update(plant.id, { pot_diameter_in: v });
      setPotOpen(false);
    } catch {
      toast.error("Couldn't save the pot size. Try again.");
    } finally {
      setSavingPot(null);
    }
  };

  const toggleRain = async (v) => {
    setRainBusy(true);
    try {
      const r = await setGetsRain(plant.id, v);
      if (r?.undone) toast.success("Got it. Today's rain no longer counts for this plant.");
    } catch {
      toast.error("Couldn't change that. Try again.");
    } finally {
      setRainBusy(false);
    }
  };

  const chip = (active) => `px-3 py-1.5 rounded-full text-xs font-semibold border transition active:scale-95 ${
    active ? 'bg-blue-600 border-blue-600 text-white' : `${ui.light ? 'bg-white border-gray-300 text-gray-800' : 'bg-white/10 border-white/20 text-white'}`
  }`;

  let weatherLine = null;
  if (wt) {
    const bits = [];
    if (wt.high_f != null && wt.forecast_hours >= 10) bits.push(`high ${wt.high_f}°F`);
    bits.push(wt.rain_today_in >= 0.1 ? `about ${wt.rain_today_in} in of rain expected` : 'no real rain expected');
    weatherLine = `Today: ${bits.join(', ')}. Nothing changes for this plant.`;
  }

  return (
    <Card className={ui.card}>
      <CardContent className="p-5 space-y-4">
        <h2 className={`text-lg font-semibold ${ui.text}`}>How to water</h2>

        {/* Amount */}
        <div>
          {amount.kind === 'oz' && (
            <>
              <p className={`text-lg font-bold ${ui.text}`}>{amount.headline}</p>
              <p className={`text-sm ${ui.sub}`}>
                Pour slowly; stop when a little drains out the bottom. Estimate for your {plant.pot_diameter_in}-inch pot.
              </p>
              <WaterCompare oz={amount.oz} ui={ui} className="mt-2" />
            </>
          )}
          {amount.kind === 'ground' && (
            <p className={`text-sm font-medium ${ui.text}`}>{amount.text}</p>
          )}
          {!pours && (
            <>
              <p className={`text-lg font-bold ${ui.text}`}>{amount.headline}</p>
              <p className={`text-sm ${ui.sub}`}>{amount.text} You can change how it's watered with Edit.</p>
            </>
          )}
          {amount.kind === 'unknown' && (
            <p className={`text-sm ${ui.text}`}><b>How much?</b> Pick the pot width below and we'll tell you how many ounces to give. We don't guess, because a guess can be way off.</p>
          )}
        </div>

        {/* Pot width (only matters when you pour water into the soil) */}
        {pours && <div>
          {potSet && !potOpen ? (
            <button onClick={() => setPotOpen(true)} className={`text-sm underline ${ui.sub}`}>
              {plant.pot_diameter_in === 0 ? 'In the ground' : `${plant.pot_diameter_in}-inch pot`} · Change
            </button>
          ) : (
            <>
              <p className={`text-xs font-semibold mb-2 ${ui.sub}`}>Pot width across the top</p>
              <div className="flex flex-wrap gap-1.5">
                {POT_SIZES.map((s) => (
                  <button key={s} onClick={() => setPot(s)} className={chip(plant.pot_diameter_in === s)} disabled={savingPot !== null}>
                    {savingPot === s ? <Loader2 className="w-3 h-3 animate-spin" /> : `${s}″`}
                  </button>
                ))}
                <button onClick={() => setPot(0)} className={chip(plant.pot_diameter_in === 0)} disabled={savingPot !== null}>
                  {savingPot === 0 ? <Loader2 className="w-3 h-3 animate-spin" /> : 'In ground'}
                </button>
              </div>
            </>
          )}
        </div>}

        {/* Weather */}
        {showWeather && (
          <div className={`pt-4 border-t ${ui.light ? 'border-gray-200' : 'border-white/15'}`}>
            <p className={`font-semibold mb-1 ${ui.text}`}>🌦️ Weather-smart watering</p>
            {!hasPlace ? (
              <div>
                <p className={`text-sm ${ui.sub}`}>
                  {user?.location_status === 'not_found'
                    ? `We couldn't find “${user?.location}” on the map, so weather isn't on yet.`
                    : 'Add your city so rain counts as watering and hot days move watering up.'}
                </p>
                <button onClick={() => setLocOpen(true)} className="mt-2 text-sm font-semibold text-green-600 underline">
                  {user?.location ? 'Fix your city' : 'Add your city'}
                </button>
              </div>
            ) : hint && hint.text ? (
              <p className={`text-sm ${ui.text}`}>{hint.text}</p>
            ) : (
              <p className={`text-sm ${ui.sub}`}>{weatherLine || 'Checked every morning. Rain, heat and frost will show up here.'}</p>
            )}
            {hasPlace && hint?.frost_text && (
              <p className={`mt-2 text-sm font-semibold rounded-xl px-3 py-2 ${ui.light ? 'bg-sky-100 text-sky-900' : 'bg-sky-900/50 text-sky-100'}`}>🥶 {hint.frost_text}</p>
            )}
            {(RAIN_ENVS.includes(plant.environment) || plant.gets_rain != null) && (
              <div className="flex items-center justify-between gap-3 mt-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${ui.text}`}>Rain reaches this plant</p>
                  <p className={`text-xs ${ui.sub}`}>Turn off if it's under a roof or cover.</p>
                </div>
                {rainBusy ? <Loader2 className={`w-5 h-5 animate-spin ${ui.sub}`} /> : <Switch checked={rainOn} onCheckedChange={toggleRain} />}
              </div>
            )}
            {hasPlace && (
              <p className={`text-[10px] mt-3 opacity-70 ${ui.sub}`}>
                {user?.location_label ? `${user.location_label} · ` : ''}Weather data from MET Norway
              </p>
            )}
          </div>
        )}
      </CardContent>
      <LocationDialog open={locOpen} onOpenChange={setLocOpen} user={user} plus />
    </Card>
  );
}
