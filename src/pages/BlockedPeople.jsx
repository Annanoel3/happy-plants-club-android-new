import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ShieldX, User } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { community, displayName } from '@/lib/community';
import { useGameTheme } from '@/lib/games/common';

// People you blocked, with Unblock. Blocked people disappear from the feed, search and
// profiles, so this is the one place to undo a block.
export default function BlockedPeople() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dark, ui } = useGameTheme();
  const [people, setPeople] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await community('blocks');
      setPeople(r?.people || []);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const unblock = async (person) => {
    if (busy) return;
    setBusy(person.id);
    try {
      await community('unblock', { user_id: person.id });
      setPeople((list) => (list || []).filter((p) => p.id !== person.id));
      queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
      toast.success(`${displayName(person)} is unblocked`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const card = `rounded-2xl border p-4 ${ui.card}`;

  return (
    <div className="min-h-screen theme-bg p-4 pb-28">
      <div className="max-w-xl mx-auto">
        <button onClick={() => navigate(-1)} className={`flex items-center gap-2 mb-3 ${ui.text}`}><ArrowLeft className="w-5 h-5" /> Back</button>
        <h1 className={`text-3xl font-bold flex items-center gap-2 ${ui.text}`}><ShieldX className="w-7 h-7 text-red-500" /> Blocked people</h1>
        <p className={`text-sm mb-4 ${ui.sub}`}>You and the people you block can’t see each other’s posts, comments or profiles. Unblocking doesn’t bring back follows.</p>

        {failed ? (
          <div className={card}>
            <p className={ui.text}>This list didn’t load.</p>
            <button onClick={load} className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white">Try again</button>
          </div>
        ) : !people ? (
          <div className="flex justify-center py-12"><Loader2 className={`w-6 h-6 animate-spin ${ui.text}`} /></div>
        ) : people.length === 0 ? (
          <div className={card}><p className={ui.sub}>You haven’t blocked anyone.</p></div>
        ) : (
          <div className="space-y-3">
            {people.map((person) => (
              <div key={person.id} className={`${card} flex items-center gap-3`}>
                <Avatar className="w-11 h-11 shrink-0">
                  <AvatarImage src={person.photo} className="object-cover" />
                  <AvatarFallback className={dark ? 'bg-white/10' : 'bg-green-100'}><User className="w-5 h-5" /></AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold truncate ${ui.text}`}>{displayName(person)}</p>
                  {person.handle && person.name !== person.handle && <p className={`text-xs truncate ${ui.sub}`}>@{person.handle}</p>}
                </div>
                <button
                  onClick={() => unblock(person)}
                  disabled={busy === person.id}
                  className={`shrink-0 px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1 ${ui.chip}`}
                >
                  {busy === person.id && <Loader2 className="w-4 h-4 animate-spin" />} Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
