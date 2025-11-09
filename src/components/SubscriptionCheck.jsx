import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Crown } from "lucide-react";

export default function SubscriptionCheck({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // Check if user has access (trial or subscription)
      const now = new Date();
      
      // Has active subscription
      if (currentUser.subscription_active) {
        setHasAccess(true);
        setLoading(false);
        return;
      }
      
      // Check trial period
      if (currentUser.trial_end_date) {
        const trialEnd = new Date(currentUser.trial_end_date);
        if (now < trialEnd) {
          setHasAccess(true);
          setLoading(false);
          return;
        }
      }
      
      // No access
      setHasAccess(false);
      setLoading(false);
    } catch (error) {
      console.error('Subscription check error:', error);
      setHasAccess(false);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg p-6">
        <Card className="max-w-md w-full theme-card shadow-2xl">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Crown className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-3xl font-bold theme-text mb-3">
              Trial Ended
            </h2>
            
            <p className="theme-text-secondary mb-6">
              Your 7-day free trial has ended. Subscribe to continue using Happy Plants!
            </p>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 mb-6">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                $5.99/month
              </p>
              <p className="text-sm theme-text-secondary">
                Cancel anytime
              </p>
            </div>
            
            <div className="space-y-3 text-left mb-6">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 dark:text-green-400 text-xs">✓</span>
                </div>
                <p className="text-sm theme-text">Unlimited plants in your garden</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 dark:text-green-400 text-xs">✓</span>
                </div>
                <p className="text-sm theme-text">AI-powered plant identification</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 dark:text-green-400 text-xs">✓</span>
                </div>
                <p className="text-sm theme-text">Personalized care reminders</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 dark:text-green-400 text-xs">✓</span>
                </div>
                <p className="text-sm theme-text">Plant health expert chat</p>
              </div>
            </div>
            
            <Button
              onClick={() => {
                // TODO: Implement Play Store billing flow
                alert('Play Store billing will be integrated here. For now, this is a placeholder.');
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-6 mb-3"
            >
              Subscribe Now
            </Button>
            
            <p className="text-xs theme-text-secondary">
              Note: Play Store billing integration coming soon
            </p>
            
            <Button
              variant="ghost"
              onClick={() => navigate('/Settings')}
              className="mt-4 theme-text-secondary"
            >
              View Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}