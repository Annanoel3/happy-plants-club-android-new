
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Heart, Loader2, X } from "lucide-react";
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
    const interval = setInterval(handleThemeChange, 100);
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      clearInterval(interval);
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
        plant_name: plant.name
      });

      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        throw new Error(data.error || "Failed to analyze plant health");
      }
    } catch (error) {
      console.error('Error analyzing plant:', error);
      toast.error(error.message || "Failed to analyze plant health");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedImage(null);
    setImagePreview("");
    setAnalysis("");
  };

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
              <div className="border-2 border-dashed theme-border rounded-xl p-8 text-center">
                <Camera className="w-12 h-12 theme-text-secondary mx-auto mb-4" />
                <p className="theme-text mb-4">Take or upload a photo of your plant</p>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="health-image-input"
                />
                <label htmlFor="health-image-input">
                  <Button asChild>
                    <span>Select Photo</span>
                  </Button>
                </label>
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
                      <h3 className="font-semibold theme-text mb-3 flex items-center gap-2">
                        <Heart className="w-5 h-5 text-red-500" />
                        Health Assessment
                      </h3>
                      <p className="theme-text text-sm whitespace-pre-wrap leading-relaxed">
                        {analysis}
                      </p>
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
