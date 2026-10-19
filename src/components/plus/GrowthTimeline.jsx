import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { Camera, Image as ImageIcon, Loader2, Play, Pause, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import { pickPhotos } from '@/lib/photoPicker';
import { prepareImageForUpload } from '@/lib/imageResize';
import OnionSkinCamera from '@/components/plus/OnionSkinCamera';

// Progress tab for Plus: month-by-month timeline, side-by-side compare, a time-lapse
// player, and the onion-skin camera for lining up each new photo with the last one.
function spanText(a, b) {
  const days = Math.abs(differenceInCalendarDays(parseISO(b), parseISO(a)));
  if (days < 1) return 'same day';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} apart`;
  if (days < 60) return `${Math.round(days / 7)} weeks apart`;
  if (days < 730) return `${Math.round(days / 30.4)} months apart`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')} years apart`;
}

export default function GrowthTimeline({ plant, photos, ui }) {
  const [view, setView] = useState('timeline');
  const [camOpen, setCamOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState(null);
  const asc = useMemo(() => [...photos].sort((a, b) => String(a.photo_date).localeCompare(String(b.photo_date)) || String(a.created_date).localeCompare(String(b.created_date))), [photos]);
  const latest = asc[asc.length - 1] || null;

  const save = async (file) => {
    setUploading(true);
    try {
      const { main } = await prepareImageForUpload(file, { mainSide: 1600 });
      const { file_url } = await base44.integrations.Core.UploadFile({ file: main });
      await base44.entities.PlantProgressPhoto.create({
        plant_id: plant.id,
        plant_name: plant.nickname || plant.name,
        image_url: file_url,
        photo_date: localToday(),
      });
      toast.success('Progress photo added! 📸');
    } catch (e) {
      console.error('progress photo upload failed', e);
      toast.error("Couldn't save the photo. Try again.");
      throw e;
    } finally {
      setUploading(false);
    }
  };

  const fromPicker = async (source) => {
    try {
      const files = await pickPhotos(source);
      if (files[0]) await save(files[0]);
    } catch (e) {
      if (e?.message) toast.error(e.message);
    }
  };

  const remove = async (photo) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await base44.entities.PlantProgressPhoto.delete(photo.id);
      setViewer(null);
      toast.success('Photo deleted');
    } catch {
      toast.error("Couldn't delete it. Try again.");
    }
  };

  const tab = (key, label) => (
    <button key={key} onClick={() => setView(key)}
      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${view === key ? 'bg-green-600 text-white' : ui.light ? 'text-gray-700' : 'text-white/80'}`}>
      {label}
    </button>
  );

  return (
    <Card className={ui.card}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-xl font-semibold ${ui.text}`}>📸 Growth</h2>
          <div className="flex gap-2">
            <button onClick={() => fromPicker('gallery')} disabled={uploading} aria-label="Add from gallery"
              className={`p-2.5 rounded-xl ${ui.light ? 'bg-gray-100 text-gray-800' : 'bg-white/10 text-white'}`}>
              <ImageIcon className="w-5 h-5" />
            </button>
            <button onClick={() => setCamOpen(true)} disabled={uploading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold active:scale-95">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Take photo
            </button>
          </div>
        </div>

        {asc.length === 0 ? (
          <div className="text-center py-8">
            <p className={`font-medium ${ui.text}`}>No progress photos yet</p>
            <p className={`text-sm mt-1 ${ui.sub}`}>Take one now. Next time, the camera shows a faint copy of it so you can line the pot up the same way.</p>
          </div>
        ) : (
          <>
            <div className={`flex gap-1 p-1 rounded-xl ${ui.light ? 'bg-gray-100' : 'bg-white/10'}`}>
              {tab('timeline', 'Timeline')}
              {tab('compare', 'Compare')}
              {tab('play', 'Time-lapse')}
            </div>
            {view === 'timeline' && <TimelineGrid photos={asc} ui={ui} onOpen={setViewer} />}
            {view === 'compare' && <Compare photos={asc} ui={ui} />}
            {view === 'play' && <TimeLapse photos={asc} ui={ui} />}
          </>
        )}
      </CardContent>

      <OnionSkinCamera
        open={camOpen}
        ghostUrl={latest?.image_url || null}
        onClose={() => setCamOpen(false)}
        onCapture={save}
        onFallback={() => {
          setCamOpen(false);
          toast("Couldn't open the in-app camera, so your phone's camera will open instead (no guide).", { duration: 5000 });
          fromPicker('camera');
        }}
      />
      {viewer && <Viewer photo={viewer} onClose={() => setViewer(null)} onDelete={() => remove(viewer)} />}
    </Card>
  );
}

function TimelineGrid({ photos, ui, onOpen }) {
  const months = useMemo(() => {
    const m = new Map();
    for (const p of [...photos].reverse()) {
      const key = String(p.photo_date).slice(0, 7);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
    }
    return [...m.entries()];
  }, [photos]);
  return (
    <div className="space-y-4">
      {months.map(([month, list]) => (
        <div key={month}>
          <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${ui.sub}`}>{format(parseISO(month + '-01'), 'MMMM yyyy')}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {list.map((p) => (
              <button key={p.id} onClick={() => onOpen(p)} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-black/10">
                <img src={p.image_url} alt={`Progress ${p.photo_date}`} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 text-[10px] font-semibold text-white bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1 text-left">
                  {format(parseISO(p.photo_date), 'MMM d')}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Compare({ photos, ui }) {
  const [leftId, setLeftId] = useState(photos[0]?.id);
  const [rightId, setRightId] = useState(photos[photos.length - 1]?.id);
  const [picking, setPicking] = useState(null); // 'left' | 'right'
  useEffect(() => {
    if (!photos.find((p) => p.id === leftId)) setLeftId(photos[0]?.id);
    if (!photos.find((p) => p.id === rightId)) setRightId(photos[photos.length - 1]?.id);
  }, [photos]);
  const left = photos.find((p) => p.id === leftId) || photos[0];
  const right = photos.find((p) => p.id === rightId) || photos[photos.length - 1];
  if (photos.length < 2) {
    return <p className={`text-sm ${ui.sub}`}>Add a second photo to compare before and after.</p>;
  }
  const side = (p, which) => (
    <button onClick={() => setPicking(picking === which ? null : which)} className="flex-1 min-w-0 text-left">
      <div className={`relative aspect-[3/4] rounded-xl overflow-hidden bg-black/10 ${picking === which ? 'ring-4 ring-green-500' : ''}`}>
        <img src={p.image_url} alt={p.photo_date} className="absolute inset-0 w-full h-full object-cover" />
      </div>
      <p className={`text-xs font-semibold mt-1 ${ui.text}`}>{which === 'left' ? 'Before' : 'After'} · {format(parseISO(p.photo_date), 'MMM d, yyyy')}</p>
    </button>
  );
  return (
    <div>
      <div className="flex gap-2">
        {side(left, 'left')}
        {side(right, 'right')}
      </div>
      <p className={`text-center text-sm font-semibold mt-2 ${ui.text}`}>{spanText(left.photo_date, right.photo_date)}</p>
      <p className={`text-center text-xs ${ui.sub}`}>{picking ? `Pick the ${picking === 'left' ? 'before' : 'after'} photo below` : 'Tap a photo to swap it'}</p>
      {picking && (
        <div className="flex gap-1.5 overflow-x-auto mt-2 pb-1">
          {photos.map((p) => (
            <button key={p.id} onClick={() => { (picking === 'left' ? setLeftId : setRightId)(p.id); setPicking(null); }}
              className="relative w-14 shrink-0 aspect-[3/4] rounded-md overflow-hidden">
              <img src={p.image_url} alt={p.photo_date} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SPEEDS = [{ ms: 1500, label: 'Slow' }, { ms: 800, label: 'Normal' }, { ms: 400, label: 'Fast' }];
function TimeLapse({ photos, ui }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const timer = useRef(null);
  useEffect(() => {
    // Warm the cache so frames don't flash in
    photos.forEach((p) => { const im = new window.Image(); im.src = p.image_url; });
  }, [photos]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing || photos.length < 2) return undefined;
    const last = i === photos.length - 1;
    timer.current = setTimeout(() => setI((n) => (n + 1) % photos.length), last ? SPEEDS[speed].ms * 2.5 : SPEEDS[speed].ms);
    return () => clearTimeout(timer.current);
  }, [i, playing, speed, photos.length]);
  if (photos.length < 2) return <p className={`text-sm ${ui.sub}`}>Add a few more photos over time to play them as a time-lapse.</p>;
  const p = photos[Math.min(i, photos.length - 1)];
  return (
    <div>
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-black">
        {photos.map((ph, n) => (
          <img key={ph.id} src={ph.image_url} alt="" className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
            style={{ opacity: n === i ? 1 : 0 }} />
        ))}
        <span className="absolute top-2 left-2 text-xs font-bold text-white bg-black/50 rounded-full px-2.5 py-1">
          {format(parseISO(p.photo_date), 'MMM d, yyyy')}
        </span>
        <span className="absolute top-2 right-2 text-xs font-bold text-white bg-black/50 rounded-full px-2.5 py-1">{i + 1}/{photos.length}</span>
      </div>
      <input type="range" min="0" max={photos.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
        className="w-full mt-3 accent-green-600" aria-label="Scrub through photos" />
      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause' : 'Play'}
          className="w-11 h-11 rounded-full bg-green-600 text-white flex items-center justify-center active:scale-95">
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        <div className={`flex-1 flex gap-1 p-1 rounded-xl ${ui.light ? 'bg-gray-100' : 'bg-white/10'}`}>
          {SPEEDS.map((s, n) => (
            <button key={s.label} onClick={() => setSpeed(n)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${speed === n ? 'bg-white text-gray-900 shadow' : ui.light ? 'text-gray-600' : 'text-white/80'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Viewer({ photo, onClose, onDelete }) {
  return createPortal(
    <div className="fixed inset-0 z-[350] bg-black/95 flex flex-col" role="dialog" aria-modal="true"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} aria-label="Close" className="p-2 -ml-2"><X className="w-6 h-6" /></button>
        <p className="text-sm font-semibold">{format(parseISO(photo.photo_date), 'MMMM d, yyyy')}</p>
        <button onClick={onDelete} aria-label="Delete photo" className="p-2 -mr-2 text-red-400"><Trash2 className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-2" onClick={onClose}>
        <img src={photo.image_url} alt={photo.photo_date} className="max-w-full max-h-full object-contain rounded-lg" />
      </div>
      {photo.notes && <p className="text-white/90 text-sm px-5 py-4">{photo.notes}</p>}
    </div>,
    document.body
  );
}
