import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { Camera, Image as ImageIcon, Loader2, Play, Pause, X, Trash2, Clapperboard, Share2, Download } from 'lucide-react';
import { canMakeVideo, makeTimelapseVideo, shareVideo, saveVideo } from '@/lib/timelapseVideo';
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
            {view === 'play' && <TimeLapse photos={asc} ui={ui} plantName={plant.nickname || plant.name || 'My plant'} />}
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
function TimeLapse({ photos, ui, plantName }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [making, setMaking] = useState(false);
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
      {canMakeVideo() && (
        <button onClick={() => { setPlaying(false); setMaking(true); }}
          className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold active:scale-95">
          <Clapperboard className="w-5 h-5" /> Make a video to share
        </button>
      )}
      {making && <VideoSheet photos={photos} plantName={plantName} onClose={() => setMaking(false)} />}
    </div>
  );
}

// Makes the video, then shows it with Share and Save buttons. One sheet at a time.
function VideoSheet({ photos, plantName, onClose }) {
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const url = useMemo(() => (video ? URL.createObjectURL(video.blob) : null), [video]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    let alive = true;
    makeTimelapseVideo(photos, { plantName, onProgress: (p) => alive && setProgress(p) })
      .then((v) => alive && setVideo(v))
      .catch((e) => { console.error('time-lapse video failed', e); if (alive) setError("Couldn't make the video. Check your connection and try again."); });
    return () => { alive = false; };
  }, []);

  const act = async (kind) => {
    setBusy(kind);
    try {
      const r = kind === 'share' ? await shareVideo(video, plantName) : await saveVideo(video, plantName);
      if (r === 'saved') toast.success('Saved to your phone in Movies › Happy Plants 🎬');
      else if (r === 'downloaded') toast.success('Video downloaded');
      else if (r === 'update_needed') toast("Update Happy Plants to use this.", { duration: 6000 });
      else if (r === 'unsupported') toast('Your phone can’t save it directly. Tap Share and pick a place to save it instead.', { duration: 6000 });
    } catch (e) {
      console.error('video share/save failed', e);
      toast.error("That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[350] bg-black/90 flex flex-col items-center justify-center p-5" role="dialog" aria-modal="true"
      style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}>
      <button onClick={onClose} disabled={!!busy} aria-label="Close" className="absolute top-3 right-3 p-2 text-white"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}><X className="w-6 h-6" /></button>
      {!video && !error && (
        <div className="w-full max-w-xs text-center text-white">
          <Clapperboard className="w-10 h-10 mx-auto mb-3" />
          <p className="font-bold text-lg">Making your video…</p>
          <p className="text-sm text-white/70 mt-1">Keep this screen open. It takes about as long as the video.</p>
          <div className="h-2 rounded-full bg-white/20 mt-4 overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}
      {error && <p className="text-white text-center max-w-xs">{error}</p>}
      {video && (
        <div className="w-full max-w-sm flex flex-col items-center">
          <video src={url} className="w-full max-h-[60vh] rounded-xl bg-black" style={{ aspectRatio: '4 / 5' }} controls autoPlay loop muted playsInline />
          <div className="flex gap-2 w-full mt-4">
            <button onClick={() => act('share')} disabled={!!busy}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold active:scale-95">
              {busy === 'share' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />} Share
            </button>
            <button onClick={() => act('save')} disabled={!!busy}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-gray-900 font-bold active:scale-95">
              {busy === 'save' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />} Save
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
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
