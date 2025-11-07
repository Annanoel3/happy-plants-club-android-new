import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, UserCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

export default function NotificationPopup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  // Only show notifications for private profiles (follow request approvals)
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: async () => {
      if (!user || !user.profile_private) return [];
      const notifs = await base44.entities.Notification.filter({ 
        user_email: user.email,
        dismissed: false
      }, '-created_date', 10);
      return notifs;
    },
    enabled: !!user && user.profile_private === true,
    refetchInterval: 10000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, { 
        dismissed: true,
        read: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    },
  });

  const handleNotificationClick = (notification) => {
    dismissMutation.mutate(notification.id);
    if (notification.from_user_email) {
      navigate(`/Profile?email=${notification.from_user_email}`);
    }
  };

  return (
    <div className="fixed top-6 right-6 z-50 space-y-3 max-w-sm">
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
                      <p className="font-semibold theme-text text-sm mb-1">
                        {notification.type === 'follow_approved' && '✅ Follow Request Approved'}
                      </p>
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