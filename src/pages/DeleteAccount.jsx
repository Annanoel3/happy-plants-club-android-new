import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trash2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const SUPPORT_EMAIL = "mediocreatbestdev@outlook.com";
// Google Play links here from the web, so this page has to work signed out too.
const DELETED_URL = "/DeleteAccount?deleted=1";

export default function DeleteAccount() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("checking");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const signedIn = await base44.auth.isAuthenticated().catch(() => false);
      if (cancelled) return;
      if (!signedIn) {
        // ?deleted=1 is where we land after deleting (signed out by then)
        let justDeleted = false;
        try { justDeleted = new URLSearchParams(window.location.search).get("deleted") === "1"; } catch { /* ignore */ }
        setStatus(justDeleted ? "deleted" : "signed_out");
        return;
      }
      const me = await base44.auth.me().catch(() => null);
      if (cancelled) return;
      setEmail(me?.email || "");
      setStatus("signed_in");
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDeleteAccount = async () => {
    setIsLoading(true);
    try {
      // Deletes the account and everything tied to it on the server
      // (plants, logs, photos, reminders, messages, follows, push link).
      const res = await base44.functions.invoke('deleteMyAccount', {});
      const data = res?.data ?? res;
      if (!data?.success) throw new Error('delete_failed');
      setStatus("deleted");
      // Sign this device out (also unlinks pushes), then land back on the "deleted" screen
      setTimeout(() => {
        base44.auth.logout(new URL(DELETED_URL, window.location.origin).toString());
      }, 1200);
    } catch (error) {
      console.error("Error deleting account:", error?.message || error);
      toast.error(`Couldn't delete your account. Please try again, or email ${SUPPORT_EMAIL}.`);
      setIsLoading(false);
    }
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const signIn = () => {
    base44.auth.redirectToLogin(new URL('/DeleteAccount', window.location.origin).toString());
  };

  const emailLink = (
    <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Please delete my Happy Plants account')}`} className="underline font-medium">
      {SUPPORT_EMAIL}
    </a>
  );

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "deleted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <h1 className="text-xl font-bold">Your account was deleted</h1>
            <p className="text-sm text-muted-foreground">
              Your plants and everything else in your account are gone. Thanks for growing with us.
            </p>
            <p className="text-sm text-muted-foreground">
              If you had Happy Plants Plus, remember to cancel it in Google Play &gt; Payments &amp; subscriptions &gt; Subscriptions.
            </p>
            <Button variant="outline" className="w-full" onClick={() => window.location.assign('/')}>
              Done
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "signed_out") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Delete your Happy Plants account</CardTitle>
            <CardDescription>Sign in to delete your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sign in with the account you use in the app. You'll come right back here to confirm.
            </p>
            <Button onClick={signIn} className="w-full bg-green-600 hover:bg-green-700 text-white">
              Sign in
            </Button>
            <p className="text-sm text-muted-foreground">
              Or email {emailLink} and we'll delete it for you.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Button variant="ghost" size="icon" onClick={goBack} className="w-fit" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <CardTitle className="mt-4">Delete Account</CardTitle>
          <CardDescription>This action cannot be undone</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {email && (
            <p className="text-sm">Signed in as <b>{email}</b></p>
          )}
          <p className="text-sm text-muted-foreground">
            Deleting your account will permanently remove all your plants and data from Happy Plants. This action cannot be reversed.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            If you have Happy Plants Plus, deleting your account does <b>not</b> cancel it. Cancel it first in Google Play → Payments &amp; subscriptions → Subscriptions.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full border-red-500 text-red-500 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete My Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account and all your plants. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
                  disabled={isLoading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isLoading ? "Deleting..." : "Yes, delete my account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-xs text-muted-foreground">
            Trouble? Email {emailLink} and we'll delete it for you.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
