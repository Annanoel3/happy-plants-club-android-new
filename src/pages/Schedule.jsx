
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Droplets, Plus, Check, ChevronLeft, ChevronRight, FileDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateVacationPDF } from "@/functions/generateVacationPDF";

export default function Schedule() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('calendar');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  const [showVacationDialog, setShowVacationDialog] = useState(false);
  const [vacationStartDate, setVacationStartDate] = useState("");
  const [vacationEndDate, setVacationEndDate] = useState("");
  const [vacationNotes, setVacationNotes] = useState("");
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

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

  // Filter plants by current user
  const { data: plants = [] } = useQuery({
    queryKey: ['plants', user?.email],
    queryFn: async () => {
      try {
        return await base44.entities.Plant.filter({ created_by: user.email }, "-created_date");
      } catch (err) {
        return [];
      }
    },
    enabled: !!user && !!user.email, // Ensure user and user.email are available before fetching
  });

  // Filter reminders by current user
  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders', user?.email],
    queryFn: async () => {
      try {
        return await base44.entities.Reminder.filter({ created_by: user.email }, '-due_date');
      } catch (err) {
        return [];
      }
    },
    enabled: !!user && !!user.email, // Ensure user and user.email are available before fetching
  });

  const { data: vacations = [], refetch: refetchVacations } = useQuery({
    queryKey: ['vacations', user?.email],
    queryFn: async () => {
      const result = await base44.entities.VacationDay.filter({ created_by: user.email });
      return Array.isArray(result) ? result : [];
    },
    enabled: !!user,
    initialData: [],
  });

  const createVacationMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.VacationDay.create({ ...data, created_by: user.email }); // Added created_by
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vacations']);
      setShowVacationDialog(false);
      setVacationStartDate("");
      setVacationEndDate("");
      setVacationNotes("");
      toast.success("Vacation added!");
    },
  });

  const deleteVacationMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.VacationDay.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vacations']);
      toast.success("Vacation deleted");
    },
  });

  const handleCreateVacation = () => {
    if (!vacationStartDate || !vacationEndDate) {
      toast.error("Please select start and end dates");
      return;
    }

    if (new Date(vacationEndDate) < new Date(vacationStartDate)) {
      toast.error("End date must be after start date");
      return;
    }

    createVacationMutation.mutate({
      start_date: vacationStartDate,
      end_date: vacationEndDate,
      notes: vacationNotes
    });
  };

  const handleGeneratePDF = async (vacationId) => {
    setIsGeneratingPDF(true);
    try {
      const { data } = await generateVacationPDF({
        vacation_id: vacationId
      });

      const blob = new Blob([data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vacation-care-guide-${vacationId}.pdf`; // Dynamic filename
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("PDF downloaded!");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getThemedClasses = () => {
    // Dark container themes - adjusted opacity
    if (theme === 'botanical') return 'bg-black/40 backdrop-blur-md border border-green-700/40';
    if (theme === 'christmas') return 'bg-black/40 backdrop-blur-md border border-red-700/50';
    if (theme === 'valentines') return 'bg-black/40 backdrop-blur-md border border-pink-500/30';
    if (theme === 'newyears') return 'bg-black/40 backdrop-blur-md border border-purple-500/30';
    if (theme === 'stpatricks') return 'bg-black/40 backdrop-blur-md border border-green-500/30';
    if (theme === 'fall') return 'bg-black/40 backdrop-blur-md border border-orange-700/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    if (theme === 'halloween') return 'bg-black/40 backdrop-blur-md border border-orange-500/30';
    if (theme === 'fourthofjuly') return 'bg-black/45 backdrop-blur-md border border-red-500/30';
    
    // Light themes
    if (theme === 'kawaii') return 'bg-white/60 backdrop-blur-md border border-pink-200/50';
    if (theme === 'summer') return 'bg-white/60 backdrop-blur-md border border-orange-300/50';
    if (theme === 'spring') return 'bg-white/60 backdrop-blur-md border border-purple-300/50';
    if (theme === 'winter') return 'bg-white/60 backdrop-blur-md border border-blue-300/50';
    return 'bg-white/60 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    // Dark themes - white text
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white';
    // Light themes - dark text
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    // Dark themes - light secondary text
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white/80';
    // Light themes - dark secondary text
    return 'text-gray-600';
  };

  const getPrimaryButtonClasses = () => {
    if (theme === 'botanical') return 'bg-green-700 hover:bg-green-800 text-white';
    if (theme === 'kawaii') return 'bg-pink-500 hover:bg-pink-600 text-white';
    if (theme === 'halloween') return 'bg-orange-600 hover:bg-orange-700 text-white';
    if (theme === 'christmas') return 'bg-red-700 hover:bg-red-800 text-white';
    if (theme === 'valentines') return 'bg-pink-600 hover:bg-pink-700 text-white';
    if (theme === 'newyears') return 'bg-purple-600 hover:bg-purple-700 text-white';
    if (theme === 'stpatricks') return 'bg-green-600 hover:bg-green-700 text-white';
    if (theme === 'fourthofjuly') return 'bg-red-600 hover:bg-red-700 text-white';
    if (theme === 'summer') return 'bg-orange-500 hover:bg-orange-600 text-white';
    if (theme === 'spring') return 'bg-purple-500 hover:bg-purple-600 text-white';
    if (theme === 'fall') return 'bg-orange-600 hover:bg-orange-700 text-white';
    if (theme === 'winter') return 'bg-blue-600 hover:bg-blue-700 text-white';
    if (theme === 'dark') return 'bg-green-600 hover:bg-green-700 text-white';
    return 'bg-green-600 hover:bg-green-700 text-white';
  };

  const toggleReminderMutation = useMutation({
    mutationFn: async ({ id, completed }) => {
      await base44.entities.Reminder.update(id, { completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['reminders', user?.email]); // Invalidate with user email for specific cache
    },
  });

  const getTasksForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');

    const wateringTasks = plants.filter(plant => {
      if (!plant.next_watering_due) return false;
      // Assuming next_watering_due is already in 'yyyy-MM-dd' format or we compare only the date part
      return plant.next_watering_due === dateStr;
    });

    const reminderTasks = reminders.filter(reminder => {
      if (!reminder.due_date || reminder.completed) return false;
      // Assuming due_date is already in 'yyyy-MM-dd' format or we compare only the date part
      return reminder.due_date === dateStr;
    });

    return { wateringTasks, reminderTasks };
  };

  const selectedDateTasks = getTasksForDate(selectedDate);

  const hasTasksOnDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');

    const hasWatering = plants.some(plant =>
      plant.next_watering_due === dateStr
    );

    const hasReminder = reminders.some(reminder =>
      reminder.due_date === dateStr && !reminder.completed
    );

    return hasWatering || hasReminder;
  };

  // Generate calendar days including days from previous/next months to complete the week view
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-6">
      <div className="max-w-6xl mx-auto">
        <div className={`mb-8 rounded-2xl p-6 inline-block ${getThemedClasses()}`}>
          <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>My Schedule</h1>
          <p className={getSecondaryTextColor()}>Keep track of watering and tasks</p>
        </div>

        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setView('calendar')}
            variant={view === 'calendar' ? 'default' : 'outline'}
            className={cn(
              view === 'calendar' ? getPrimaryButtonClasses() : `${getThemedClasses()} ${getTextColor()}`
            )}
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            Calendar
          </Button>
          <Button
            onClick={() => setView('list')}
            variant={view === 'list' ? 'default' : 'outline'}
            className={cn(
              view === 'list' ? getPrimaryButtonClasses() : `${getThemedClasses()} ${getTextColor()}`
            )}
          >
            List View
          </Button>
        </div>

        {view === 'calendar' ? (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Card className={getThemedClasses()}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className={`text-2xl font-bold ${getTextColor()}`}>
                      {format(currentDate, 'MMMM yyyy')}
                    </h2>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                        className={`${getThemedClasses()} ${getTextColor()}`}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                        className={`${getThemedClasses()} ${getTextColor()}`}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className={`text-center font-semibold text-sm ${getSecondaryTextColor()}`}>
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {calendarDays.map((day, idx) => {
                      const isSelected = isSameDay(day, selectedDate);
                      const isToday = isSameDay(day, new Date());
                      const isCurrentMonth = isSameMonth(day, currentDate);

                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            'h-10 rounded-lg flex flex-col items-center justify-center transition-all',
                            'cursor-pointer text-sm',

                            // Background and border styling
                            isSelected
                              ? 'bg-green-600' // Selected background
                              : isToday
                              ? 'bg-blue-100 border-2 border-blue-500' // Today, not selected
                              : isCurrentMonth
                              ? getThemedClasses() + " hover:bg-opacity-70" // In-month, not selected, not today
                              : 'opacity-50', // Out-of-month, assumes themed background from parent or general styling

                            // Additional border if selected and today
                            isSelected && isToday && 'border-2 border-blue-500'
                          )}
                        >
                          <span
                            className={cn(
                              'text-xs font-semibold',
                              isSelected
                                ? 'text-white' // Selected text color
                                : isToday
                                ? 'text-gray-900' // Today text color
                                : isCurrentMonth
                                ? getTextColor() // In-month, not selected, not today
                                : 'text-gray-400' // Out-of-month text color
                            )}
                          >
                            {format(day, 'd')}
                          </span>
                          {hasTasksOnDate(day) && (
                            <div className="flex gap-0.5 mt-0.5">
                              {plants.some(p => p.next_watering_due === format(day, 'yyyy-MM-dd')) && (
                                <div className={cn(
                                  'w-1 h-1 rounded-full',
                                  isSelected ? 'bg-white' : 'bg-blue-500'
                                )}></div>
                              )}
                              {reminders.some(r => r.due_date === format(day, 'yyyy-MM-dd') && !r.completed) && (
                                <div className={cn(
                                  'w-1 h-1 rounded-full',
                                  isSelected ? 'bg-white' : 'bg-orange-500'
                                )}></div>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className={getThemedClasses()}>
                <CardContent className="p-6">
                  <h3 className={`text-xl font-bold mb-4 ${getTextColor()}`}>
                    {format(selectedDate, 'MMMM d, yyyy')}
                  </h3>

                  {selectedDateTasks.wateringTasks.length === 0 && selectedDateTasks.reminderTasks.length === 0 ? (
                    <p className={`text-sm ${getSecondaryTextColor()}`}>No tasks for this day</p>
                  ) : (
                    <div className="space-y-4">
                      {selectedDateTasks.wateringTasks.length > 0 && (
                        <div>
                          <p className={`text-sm font-semibold mb-2 flex items-center gap-2 ${getTextColor()}`}>
                            <Droplets className="w-4 h-4" />
                            Watering
                          </p>
                          <div className="space-y-2">
                            {selectedDateTasks.wateringTasks.map(plant => (
                              <button
                                key={plant.id}
                                onClick={() => navigate(`/PlantDetail?id=${plant.id}`)}
                                className={`w-full text-left p-3 rounded-lg border ${getThemedClasses()} hover:bg-opacity-70 transition-all`}
                              >
                                <p className={`font-medium ${getTextColor()}`}>
                                  {plant.nickname || plant.name}
                                </p>
                                {plant.location && (
                                  <p className={`text-xs ${getSecondaryTextColor()} mt-1`}>{plant.location}</p>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedDateTasks.reminderTasks.length > 0 && (
                        <div>
                          <p className={`text-sm font-semibold mb-2 ${getTextColor()}`}>📋 Reminders</p>
                          <div className="space-y-2">
                            {selectedDateTasks.reminderTasks.map(reminder => (
                              <div
                                key={reminder.id}
                                className={`p-3 rounded-lg border ${getThemedClasses()}`}
                              >
                                <div className="flex items-start gap-2">
                                  <button
                                    onClick={() => toggleReminderMutation.mutate({
                                      id: reminder.id,
                                      completed: true
                                    })}
                                    className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 flex items-center justify-center hover:border-green-500"
                                  >
                                  </button>
                                  <div className="flex-1">
                                    <p className={`font-medium ${getTextColor()}`}>{reminder.title}</p>
                                    {reminder.description && (
                                      <p className={`text-sm ${getSecondaryTextColor()}`}>{reminder.description}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Card className={getThemedClasses()}>
              <CardContent className="p-6">
                <h2 className={`text-2xl font-bold mb-4 ${getTextColor()}`}>Upcoming Watering</h2>
                {plants.filter(p => p.next_watering_due).length === 0 ? (
                  <p className={getSecondaryTextColor()}>No upcoming watering scheduled</p>
                ) : (
                  <div className="space-y-3">
                    {plants
                      .filter(p => p.next_watering_due)
                      .sort((a, b) => new Date(a.next_watering_due) - new Date(b.next_watering_due))
                      .map(plant => (
                        <button
                          key={plant.id}
                          onClick={() => navigate(`/PlantDetail?id=${plant.id}`)}
                          className={`w-full p-4 rounded-xl border ${getThemedClasses()} hover:bg-opacity-70 text-left`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`font-semibold ${getTextColor()}`}>
                                {plant.nickname || plant.name}
                              </p>
                              <p className={`text-sm ${getSecondaryTextColor()}`}>
                                {format(parseISO(plant.next_watering_due), 'MMMM d, yyyy')}
                              </p>
                            </div>
                            <Droplets className="w-5 h-5 text-blue-500" />
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={getThemedClasses()}>
              <CardContent className="p-6">
                <h2 className={`text-2xl font-bold mb-4 ${getTextColor()}`}>Upcoming Reminders</h2>
                {reminders.filter(r => !r.completed).length === 0 ? (
                  <p className={getSecondaryTextColor()}>No upcoming reminders</p>
                ) : (
                  <div className="space-y-3">
                    {reminders
                      .filter(r => !r.completed)
                      .map(reminder => (
                        <div
                          key={reminder.id}
                          className={`p-4 rounded-xl border ${getThemedClasses()}`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleReminderMutation.mutate({
                                id: reminder.id,
                                completed: true
                              })}
                              className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 flex items-center justify-center hover:border-green-500"
                            >
                            </button>
                            <div className="flex-1">
                              <p className={`font-semibold ${getTextColor()}`}>{reminder.title}</p>
                              {reminder.description && (
                                <p className={`text-sm ${getSecondaryTextColor()} mt-1`}>{reminder.description}</p>
                              )}
                              <p className={`text-sm ${getSecondaryTextColor()} mt-1`}>
                                {format(parseISO(reminder.due_date), 'MMMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Vacation Section */}
        <div className={`mt-8 rounded-3xl p-6 ${getThemedClasses()}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-3xl">🏖️</span>
            <h2 className={`text-2xl font-bold ${getTextColor()}`}>Vacations</h2>
          </div>

          {vacations.length === 0 ? (
            <p className={`text-center py-8 ${getSecondaryTextColor()}`}>
              No upcoming vacations. Add one to generate a care guide for your house sitter!
            </p>
          ) : (
            <div className="space-y-3 mb-4">
              {vacations.map((vacation) => (
                <div key={vacation.id} className={`p-4 rounded-xl border ${
                  theme === 'kawaii' ? 'border-pink-200 bg-pink-50/50' :
                  theme === 'halloween' ? 'border-orange-500/30 bg-black/30' :
                  'border-gray-200 bg-white/50'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className={`font-semibold ${getTextColor()}`}>
                        {new Date(vacation.start_date).toLocaleDateString()} - {new Date(vacation.end_date).toLocaleDateString()}
                      </p>
                      {vacation.notes && (
                        <p className={`text-sm mt-1 ${getSecondaryTextColor()}`}>{vacation.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGeneratePDF(vacation.id)}
                        disabled={isGeneratingPDF}
                      >
                        <FileDown className="w-4 h-4 mr-1" />
                        {isGeneratingPDF ? 'Generating...' : 'PDF'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteVacationMutation.mutate(vacation.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ADD VACATION BUTTON MOVED TO BOTTOM */}
          <Button
            onClick={() => setShowVacationDialog(true)}
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Vacation
          </Button>
        </div>
      </div>

      {/* Vacation Dialog */}
      <Dialog open={showVacationDialog} onOpenChange={setShowVacationDialog}>
        <DialogContent className={getThemedClasses()}>
          <DialogHeader>
            <DialogTitle className={getTextColor()}>Add Vacation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Start Date</label>
              <Input
                type="date"
                value={vacationStartDate}
                onChange={(e) => setVacationStartDate(e.target.value)}
                className="theme-input"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>End Date</label>
              <Input
                type="date"
                value={vacationEndDate}
                onChange={(e) => setVacationEndDate(e.target.value)}
                className="theme-input"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Notes for House Sitter (Optional)</label>
              <Textarea
                value={vacationNotes}
                onChange={(e) => setVacationNotes(e.target.value)}
                placeholder="Any special instructions..."
                className="theme-input"
              />
            </div>
            <Button
              onClick={handleCreateVacation}
              disabled={createVacationMutation.isPending}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-600"
            >
              {createVacationMutation.isPending ? 'Creating...' : 'Create Vacation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
