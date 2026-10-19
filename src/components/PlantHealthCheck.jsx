import React, { useState } from "react";
import { usePhotoSource } from "@/components/PhotoSourceSheet";
import { asChangeEvent, pickPhotos } from "@/lib/photoPicker";
import { base44 } from "@/api/base44Client";
import { handleAiLimit } from "@/lib/premium";
import { queryClientInstance } from "@/lib/query-client";
import { usePlusReady } from "@/lib/plus";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Camera, Image, Heart, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function PlantHealthCheck({ plant }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [check, setCheck] = useState(null);
  const [plusResult, setPlusResult] = useState(false);
  const plusReady = usePlusReady();
  const navigate = useNavigate();

  const [theme, setTheme] = React.useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  React.useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = localStorage.getItem('theme') || 'light';
      setTheme(currentTheme);
    };
    
    handleThemeChange();
    window.addEventListener('storage', handleThemeChange);
    window.addEventListener('hp-theme-change', handleThemeChange); // was a 100ms poll
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
    };
  }, []);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedImage) {
      toast.error("Please select an image first");
      return;
    }

    setIsAnalyzing(true);
    setAnalysis("");
    setCheck(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedImage);
      
      const uploadResponse = await base44.integrations.Core.UploadFile({ 
        file: selectedImage 
      });

      if (!uploadResponse.file_url) {
        throw new Error("Failed to upload image");
      }

      const { data } = await base44.functions.invoke('analyzePlantHealth', {
        image_url: uploadResponse.file_url,
        plant_name: plant.name,
        plant_id: plant.id,
      });

      if (data.success) {
        setAnalysis(data.analysis);
        setCheck(data.check || null);
        setPlusResult(!!data.plus);
        // Saved to the plant's health history (and maybe a re-check reminder) on the server
        queryClientInstance.invalidateQueries({ queryKey: ['healthChecks'] });
        queryClientInstance.invalidateQueries({ queryKey: ['reminders'] });
      } else {
        throw new Error(data.error || "Failed to analyze plant health");
      }
    } catch (error) {
      console.error('Error analyzing plant:', error);
      if (!(await handleAiLimit(error))) toast.error(error.message || "Failed to analyze plant health");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedImage(null);
    setImagePreview("");
    setAnalysis("");
    setCheck(null);
  };

  const STATUS = {
    healthy: { label: 'Healthy', cls: 'bg-green-100 text-green-800' },
    needs_attention: { label: 'Needs attention', cls: 'bg-amber-100 text-amber-800' },
    concerning: { label: 'Concerning', cls: 'bg-red-100 text-red-800' },
  };
  const PROGRESS = { improving: '📈 Getting better', same: '➖ About the same', worse: '📉 Getting worse' };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        className={`w-full gap-2 ${(() => {
          switch (theme) {
            case 'halloween':
              return 'bg-orange-600 text-black hover:bg-orange-700 border-orange-500 animate-pulse';
            case 'christmas':
              return 'bg-red-600 text-white hover:bg-red-700 border-red-500 animate-bounce';
            case 'newyears':
              return 'bg-yellow-400 text-black hover:bg-yellow-500 border-yellow-300 animate-ping';
            case 'fourthofjuly':
              return 'bg-blue-600 text-white hover:bg-blue-700 border-blue-500 animate-pulse';
            default:
              return '';
          }
        })()}`}
      >
        <Heart className="w-4 h-4" />
        Health Checkup
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="theme-card max-w-2xl">
          <DialogHeader>
            <DialogTitle className="theme-text flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              Plant Health Checkup
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!imagePreview ? (
              <div className="border-2 border-dashed theme-border rounded-xl p-6 text-center">
                <Camera className="w-12 h-12 theme-text-secondary mx-auto mb-3" />
                <p className="theme-text mb-4">Take or upload a photo of your plant</p>
                {/* Camera */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="health-camera-input"
                />
                {/* Gallery */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="health-gallery-input"
                />
                <div className="flex gap-3 justify-center">
                  <Button
                    type="button"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={async () => {
                      try {
                        const files = await pickPhotos('camera');
                        if (files.length) handleImageSelect(asChangeEvent(files));
                      } catch (err) { toast.error(err?.message || 'Could not open the camera'); }
                    }}
                  >
                    <Camera className="w-4 h-4 mr-2" strokeWidth={2.25} /> Camera
                  </Button>
                  <Button
                    type="button"
                    className="bg-gray-900 hover:bg-black text-white"
                    onClick={async () => {
                      const files = await pickPhotos('gallery');
                      if (files.length) handleImageSelect(asChangeEvent(files));
                    }}
                  >
                    <Image className="w-4 h-4 mr-2" strokeWidth={2.25} /> Gallery
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Plant"
                    className="w-full h-64 object-cover rounded-xl"
                  />
                  <button
                    onClick={() => {
                      setImagePreview("");
                      setSelectedImage(null);
                      setAnalysis("");
                    }}
                    className="absolute top-2 right-2 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {!analysis && !isAnalyzing && (
                  <Button
                    onClick={handleAnalyze}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Analyze Health
                  </Button>
                )}

                {isAnalyzing && (
                  <div className="flex items-center justify-center gap-3 p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-green-600" />
                    <p className="theme-text">Analyzing your plant's health...</p>
                  </div>
                )}

                {analysis && (
                  <Card className="theme-card">
                    <CardContent className="p-4">
                      <h3 className="font-semibold theme-text mb-3 flex items-center gap-2 flex-wrap">
                        <Heart className="w-5 h-5 text-red-500" />
                        {check?.headline || 'Health Assessment'}
                        {check?.status && STATUS[check.status] && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS[check.status].cls}`}>{STATUS[check.status].label}</span>
                        )}
                      </h3>
                      {check?.progress && PROGRESS[check.progress] && (
                        <p className="text-sm font-semibold theme-text mb-2">
                          {PROGRESS[check.progress]}{check.progress_note ? ` — ${check.progress_note}` : ''}
                        </p>
                      )}
                      <p className="theme-text text-sm whitespace-pre-wrap leading-relaxed">
                        {analysis}
                      </p>
                      {plusResult && check?.plan?.length > 0 && (
                        <div className="mt-4">
                          <p className="font-semibold theme-text text-sm mb-2">Treatment plan</p>
                          <ol className="list-decimal pl-5 space-y-1 text-sm theme-text">
                            {check.plan.map((s, i) => <li key={i}>{s.text}</li>)}
                          </ol>
                          <p className="text-xs theme-text-secondary mt-2">
                            Saved to this plant's page so you can tick off steps.
                            {check.recheck_date && check.reminder_id ? ` We'll remind you to re-check on ${format(parseISO(check.recheck_date), 'EEE, MMM d')}.` : ''}
                          </p>
                        </div>
                      )}
                      {!plusResult && plusReady && check?.status && check.status !== 'healthy' && (
                        <button onClick={() => navigate('/Premium')} className="mt-4 w-full text-left text-sm rounded-xl p-3 bg-green-50 text-green-900 border border-green-200">
                          🌿 Plus turns this into a step-by-step plan, reminds you to re-check, and shows if it's getting better.
                        </button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}