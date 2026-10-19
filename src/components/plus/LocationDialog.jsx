import React, { useEffect, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { saveLocation } from '@/lib/weather';

// Asks for the user's city (or ZIP). Used by the one-time location ask on the
// garden page and by the plant page's "Add your city" link.
export default function LocationDialog({ open, onOpenChange, user, plus, onSaved }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    if (open) {
      setText(user?.location || '');
      setProblem(null);
    }
  }, [open]);

  const status = user?.location ? (user.location_status || null) : 'missing';
  const intro = status === 'not_found'
    ? `We couldn't find “${user?.location}” on the map.`
    : status === 'too_broad'
      ? `Right now we're using the middle of ${user?.location_label || user?.location}.`
      : null;
  const why = plus
    ? 'Add your city so outdoor plants get weather-smart watering: rain counts as watering, hot days move watering up, and you get frost warnings.'
    : 'Add your city so your daily plant weather is for where you actually live.';

  const save = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await saveLocation(value);
      if (r?.status === 'ok') {
        toast.success(`📍 ${r.label || value}`);
        onSaved?.(r);
        onOpenChange(false);
      } else if (r?.status === 'too_broad') {
        setProblem(`Found ${r.label || value}, but that's a big area. Add your city for local weather, or keep this.`);
        onSaved?.(r);
      } else if (r?.status === 'not_found') {
        setProblem("Couldn't find that place. Try “City, State” or a ZIP code.");
      } else {
        setProblem("Couldn't check that right now. Try again in a minute.");
      }
    } catch (e) {
      setProblem(e?.response?.data?.error || "Couldn't check that right now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="theme-card max-w-sm w-[calc(100vw-2rem)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="theme-text flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" /> Where are your plants?
          </DialogTitle>
          <DialogDescription className="theme-text-secondary text-sm text-left">
            {intro ? <>{intro} </> : null}{why}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder="City, State or ZIP (e.g. Austin, TX)"
            className="theme-input"
            autoComplete="address-level2"
            enterKeyHint="done"
          />
          {problem && <p className="text-sm text-amber-600">{problem}</p>}
          <Button onClick={save} disabled={!text.trim() || busy} className="w-full bg-green-600 hover:bg-green-700 text-white">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
          <button onClick={() => onOpenChange(false)} className="w-full text-sm theme-text-secondary py-1">
            {status === 'too_broad' && problem ? 'Keep this' : 'Not now'}
          </button>
          <p className="text-[10px] theme-text-secondary text-center opacity-70">Place search © OpenStreetMap contributors</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
