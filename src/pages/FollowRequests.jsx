import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { community, communityToast, displayName, profilePath } from "@/lib/community";

// Follow requests for a private profile (the "New follow request" push opens this page).
// Approve/decline go through the community function, which also tells the person who asked
// when it's approved.
export default function FollowRequests() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['followRequests', 'page'],
    queryFn: async () => (await community('people', { list: 'requests' }))?.people || [],
  });

  const answer = async (request, approve) => {
    if (busyId) return;
    setBusyId(request.request_id);
    try {
      const res = await community(approve ? 'approve' : 'decline', { request_id: request.request_id });
      if (approve && res?.state === 'unavailable') toast("That person isn't available anymore.");
      else toast.success(approve ? `${displayName(request)} can follow you now` : 'Request declined');
      queryClient.invalidateQueries({ queryKey: ['followRequests'] });
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
    } catch (e) {
      communityToast(e, navigate);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen theme-bg p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} aria-label="Back" className="mb-6">
          <ArrowLeft className="w-6 h-6 theme-text" />
        </button>

        <h1 className="text-4xl font-bold theme-text mb-8">Follow Requests</h1>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin theme-text" /></div>
        ) : requests.length === 0 ? (
          <Card className="theme-card">
            <CardContent className="p-12 text-center">
              <User className="w-16 h-16 theme-text-secondary mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold theme-text mb-2">No requests waiting</h3>
              <p className="theme-text-secondary">When someone asks to follow you, they'll show up here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Card key={request.request_id} className="theme-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <button onClick={() => { const p = profilePath(request.id); if (p) navigate(p); }} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={request.photo} className="object-cover" />
                        <AvatarFallback><User className="w-6 h-6" /></AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold theme-text truncate">{displayName(request)}</p>
                        {request.handle && request.name !== request.handle && (
                          <p className="text-sm theme-text-secondary truncate">@{request.handle}</p>
                        )}
                      </div>
                    </button>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === request.request_id}
                        onClick={() => answer(request, true)}
                        aria-label="Approve"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {busyId === request.request_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === request.request_id}
                        onClick={() => answer(request, false)}
                        aria-label="Decline"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
