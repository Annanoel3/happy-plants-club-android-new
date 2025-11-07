import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

export default function FollowRequests() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const currentUser = await base44.auth.me();
    setUser(currentUser);
  };

  const { data: requests = [] } = useQuery({
    queryKey: ['followRequests'],
    queryFn: () => base44.entities.FollowRequest.filter({ 
      target_email: user?.email,
      status: 'pending'
    }),
    enabled: !!user,
  });

  const handleRequestMutation = useMutation({
    mutationFn: async ({ requestId, approved }) => {
      const request = requests.find(r => r.id === requestId);
      
      if (approved) {
        await base44.entities.Follow.create({
          follower_email: request.requester_email,
          following_email: user.email
        });
      }
      
      await base44.entities.FollowRequest.update(requestId, {
        status: approved ? 'approved' : 'denied'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followRequests'] });
      toast.success('Request handled!');
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen theme-bg flex items-center justify-center">
        <p className="theme-text">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="mb-6">
          <ArrowLeft className="w-6 h-6 theme-text" />
        </button>

        <h1 className="text-4xl font-bold theme-text mb-8">Follow Requests</h1>

        {requests.length === 0 ? (
          <Card className="theme-card">
            <CardContent className="p-12 text-center">
              <User className="w-16 h-16 theme-text-secondary mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold theme-text mb-2">No pending requests</h3>
              <p className="theme-text-secondary">When someone requests to follow you, they'll appear here</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Card key={request.id} className="theme-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback><User className="w-6 h-6" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold theme-text">{request.requester_name}</p>
                      <p className="text-sm theme-text-secondary">@{request.requester_handle}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleRequestMutation.mutate({ requestId: request.id, approved: true })}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRequestMutation.mutate({ requestId: request.id, approved: false })}
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