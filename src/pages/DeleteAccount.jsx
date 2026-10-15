import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function DeleteAccount() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteAccount = async () => {
    setIsLoading(true);
    try {
      // Deletes the account and everything tied to it on the server
      // (plants, logs, photos, reminders, messages, follows, push link).
      const res = await base44.functions.invoke('deleteMyAccount', {});
      const data = res?.data ?? res;
      if (!data?.success) throw new Error(data?.error || 'Delete failed');
      base44.auth.logout();
      window.location.reload();
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Couldn't delete your account. Please try again, or email support@happyplants.club.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-fit">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <CardTitle className="mt-4">Delete Account</CardTitle>
          <CardDescription>This action cannot be undone</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Deleting your account will permanently remove all your plants and data from Happy Plants. This action cannot be reversed.
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
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={isLoading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isLoading ? "Deleting..." : "Yes, delete my account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}