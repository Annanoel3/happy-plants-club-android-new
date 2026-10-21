import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, UserCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { COMMUNITY_OPEN } from "@/pages/Feed";
import { profilePath } from "@/lib/community";

// Pops up "Follow request approved" for the person who asked to follow. Only that kind of
// notice pops (likes and comments show as the Community badge instead). Notices are created
// only by the community function, and carry the other person's user id, never their email.
export default function NotificationPopup({ user: userProp }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(userProp || null);

  useEffect(() => {
    if (userProp) { setUser(userProp); return; }
    base44.auth.me().then(setUser).catch(() => {});
  }, [userProp]);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: async () => {
      const notifs = await base44.entities.Notification.filter({
        user_email: user.email,
        dismissed: false,
        type: 'follow_approved',
      }, '-created_date', 5);
      return (notifs || []).filter((n) => n.type === 'follow_approved');
    },
    enabled: !!user?.email && COMMUNITY_OPEN,
    refetchInterval: 90000, // follow-approval popups don't need near-realtime polling
  });

  const dismissMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, { 
        dismissed: true,
        read: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = (notification) => {
    dismissMutation.mutate(notification.id);
    const path = profilePath(notification.from_user_id);
    if (path) navigate(path);
  };

  if (!notifications.length) return null;

  return (
    // Below the phone's status bar (safe area), not under it
    <div
      className="fixed right-4 left-4 sm:left-auto z-50 space-y-3 sm:max-w-sm"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      <AnimatePresence>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: -20, x: 100 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="theme-card shadow-2xl border-2 border-green-500">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <UserCheck className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className="text-left w-full"
                    >
                      <p className="font-semibold theme-text text-sm mb-1">✅ Follow request approved</p>
                      <p className="theme-text-secondary text-sm">
                        {notification.message}
                      </p>
                      {notification.from_user_handle && (
                        <p className="text-xs theme-text-secondary mt-1">
                          @{notification.from_user_handle}
                        </p>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissMutation.mutate(notification.id);
                    }}
                    aria-label="Close"
                    className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}