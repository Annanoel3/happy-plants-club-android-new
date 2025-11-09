import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Calendar, FileText, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";

export default function VacationReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const vacationId = urlParams.get('id');

  const [user, setUser] = useState(null);
  const [plantNotes, setPlantNotes] = useState({});
  const [customInstructions, setCustomInstructions] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
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

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      navigate('/');
    }
  };

  const { data: vacation, isLoading: vacationLoading } = useQuery({
    queryKey: ['vacation', vacationId],
    queryFn: async () => {
      const result = await base44.entities.VacationDay.filter({ id: vacationId });
      if (result && result.length > 0) {
        const vac = result[0];
        setGeneralNotes(vac.notes || "");
        setCustomInstructions(vac.custom_instructions || "");
        setPlantNotes(vac.plant_notes || {});
        return vac;
      }
      return null;
    },
    enabled: !!vacationId && !!user,
  });

  const { data: plants = [] } = useQuery({
    queryKey: ['plants', user?.email],
    queryFn: async () => {
      const result = await base44.entities.Plant.filter({ created_by: user.email });
      return Array.isArray(result) ? result : [];
    },
    enabled: !!user,
  });

  const plantsNeedingCare = React.useMemo(() => {
    if (!vacation || !plants) return [];
    
    const startDate = new Date(vacation.start_date);
    const endDate = new Date(vacation.end_date);
    
    return plants.filter(plant => {
      if (!plant.next_watering_due) return false;
      const nextWatering = new Date(plant.next_watering_due);
      return nextWatering >= startDate && nextWatering <= endDate;
    }).sort((a, b) => new Date(a.next_watering_due) - new Date(b.next_watering_due));
  }, [vacation, plants]);

  const updateVacationMutation = useMutation({
    mutationFn: async (updates) => {
      await base44.entities.VacationDay.update(vacationId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vacation']);
      toast.success('Vacation details saved!');
    },
  });

  const handleSave = () => {
    updateVacationMutation.mutate({
      notes: generalNotes,
      custom_instructions: customInstructions,
      plant_notes: plantNotes,
    });
  };

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    try {
      // Save first
      await updateVacationMutation.mutateAsync({
        notes: generalNotes,
        custom_instructions: customInstructions,
        plant_notes: plantNotes,
      });

      const response = await fetch(`${window.location.origin}/api/functions/generateVacationPDF`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vacation_id: vacationId }),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plant-care-${vacation.start_date}-to-${vacation.end_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success('PDF downloaded! 📄');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-black/40 backdrop-blur-md border border-green-700/40';
    if (theme === 'christmas') return 'bg-black/40 backdrop-blur-md border border-red-700/50';
    if (theme === 'valentines') return 'bg-black/40 backdrop-blur-md border border-pink-500/30';
    if (theme === 'newyears') return 'bg-black/40 backdrop-blur-md border border-purple-500/30';
    if (theme === 'stpatricks') return 'bg-black/40 backdrop-blur-md border border-green-500/30';
    if (theme === 'fall') return 'bg-black/40 backdrop-blur-md border border-orange-700/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    if (theme === 'halloween') return 'bg-black/40 backdrop-blur-md border border-orange-500/30';
    if (theme === 'fourthofjuly') return 'bg-black/45 backdrop-blur-md border border-red-500/30';
    if (theme === 'kawaii') return 'bg-white/60 backdrop-blur-md border border-pink-200/50';
    if (theme === 'summer') return 'bg-white/60 backdrop-blur-md border border-orange-300/50';
    if (theme === 'spring') return 'bg-white/60 backdrop-blur-md border border-purple-300/50';
    if (theme === 'winter') return 'bg-white/60 backdrop-blur-md border border-blue-300/50';
    return 'bg-white/60 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white/80';
    return 'text-gray-600';
  };

  if (!user || vacationLoading || !vacation) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/Schedule')} className={`mb-6 flex items-center gap-2 ${getTextColor()} hover:opacity-70`}>
          <ArrowLeft className="w-5 h-5" />
          Back to Schedule
        </button>

        <div className={`mb-8 rounded-2xl p-6 ${getThemedClasses()}`}>
          <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>Vacation Care Guide</h1>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${getSecondaryTextColor()}`}>
              <Calendar className="w-5 h-5" />
              <span>{format(parseISO(vacation.start_date), 'MMM d, yyyy')} - {format(parseISO(vacation.end_date), 'MMM d, yyyy')}</span>
            </div>
            <span className={getSecondaryTextColor()}>
              ({differenceInDays(parseISO(vacation.end_date), parseISO(vacation.start_date))} days)
            </span>
          </div>
        </div>

        <Card className={`${getThemedClasses()} mb-6`}>
          <CardHeader>
            <CardTitle className={getTextColor()}>
              <FileText className="w-5 h-5 inline mr-2" />
              General Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                Plant Care Notes
              </label>
              <Textarea
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder="General notes for your plant sitter (e.g., water amount, specific times, etc.)"
                className="theme-input min-h-24"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                <Home className="w-4 h-4 inline mr-1" />
                Other Instructions (Pets, A/C, Trash, etc.)
              </label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Add instructions for pets, A/C settings, trash days, mail, alarm codes, etc."
                className="theme-input min-h-32"
              />
            </div>
          </CardContent>
        </Card>

        <Card className={`${getThemedClasses()} mb-6`}>
          <CardHeader>
            <CardTitle className={getTextColor()}>
              Plants Needing Water ({plantsNeedingCare.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {plantsNeedingCare.length === 0 ? (
              <p className={getSecondaryTextColor()}>No plants need watering during this period</p>
            ) : (
              <div className="space-y-4">
                {plantsNeedingCare.map(plant => (
                  <div key={plant.id} className={`p-4 rounded-xl border ${getThemedClasses()}`}>
                    <div className="flex items-start gap-4">
                      {plant.image_url && (
                        <img
                          src={plant.image_url}
                          alt={plant.nickname || plant.name}
                          className="w-20 h-20 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className={`font-semibold ${getTextColor()}`}>
                          {plant.nickname || plant.name}
                        </h3>
                        <p className={`text-sm ${getSecondaryTextColor()}`}>
                          Water on: {format(parseISO(plant.next_watering_due), 'MMM d, yyyy')}
                        </p>
                        {plant.location && (
                          <p className={`text-sm ${getSecondaryTextColor()}`}>
                            Location: {plant.location}
                          </p>
                        )}
                        
                        <Textarea
                          value={plantNotes[plant.id] || ''}
                          onChange={(e) => setPlantNotes({...plantNotes, [plant.id]: e.target.value})}
                          placeholder="Special notes for this plant..."
                          className="theme-input mt-2 text-sm"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={updateVacationMutation.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {updateVacationMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            onClick={handleGeneratePDF}
            disabled={isGenerating}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download PDF Guide
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}