import React, { useState } from "react";
import { refreshPlantData } from '@/lib/query-client';
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Edit2, Check } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

export default function ReminderNotificationManager({ reminder, theme, onRefresh }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTime, setEditedTime] = useState(reminder.original_time_phrase || "");

  // All scheduling/cancelling goes through the reminder engine (sendCustomReminders),
  // which checks you own the reminder and cancels any queued push.
  const completeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('sendCustomReminders', {
        action: reminder.completed ? 'uncomplete' : 'complete',
        reminder_id: reminder.id,
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      refreshPlantData();
      queryClient.invalidateQueries(['reminders']);
      if (data?.result === 'advanced') toast.success(`Done! Next one: ${format(parseISO(data.next_due), 'MMM d')}`);
      else toast.success(reminder.completed ? 'Reminder reopened' : 'Reminder completed!');
      onRefresh?.();
    },
    onError: (err) => {
      toast.error('Failed to complete reminder: ' + err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('sendCustomReminders', { action: 'delete', reminder_id: reminder.id });
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      refreshPlantData();
      queryClient.invalidateQueries(['reminders']);
      toast.success('Reminder deleted');
      onRefresh?.();
    },
    onError: (err) => {
      toast.error('Failed to delete: ' + err.message);
    }
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      // Make the new one first; only remove the old one once the new one exists.
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const repeat = reminder.recurrence_type && !/every|daily|weekly|monthly/i.test(editedTime)
        ? (reminder.recurrence_type === 'every_two_hours' ? ' every 2 hours' : ` ${reminder.recurrence_type}`)
        : '';
      const result = await base44.functions.invoke('processPlantCareLog', {
        transcript: `Remind me to ${reminder.title} ${editedTime}${repeat}`,
        userTimezone
      });
      if (result.data?.needs_clarification) {
        throw new Error('Time not clear, please be more specific');
      }
      if (!result.data?.success || !result.data?.reminder_count) {
        throw new Error("Couldn't understand that time");
      }
      await base44.functions.invoke('sendCustomReminders', { action: 'delete', reminder_id: reminder.id });
    },
    onSuccess: () => {
      refreshPlantData();
      queryClient.invalidateQueries(['reminders']);
      setIsEditing(false);
      toast.success('Reminder updated!');
      onRefresh?.();
    },
    onError: (err) => {
      toast.error('Failed to update: ' + err.message);
    }
  });

  const getThemedClasses = () => {
    if (theme === "botanical") return "bg-black/40 backdrop-blur-md border border-green-700/40";
    if (theme === "dark") return "bg-black/40 backdrop-blur-md border border-gray-700/50";
    if (theme === "kawaii") return "bg-white/60 backdrop-blur-md border border-pink-200/50";
    return "bg-white/60 backdrop-blur-md border border-gray-300/50";
  };

  const getTextColor = () => {
    if (theme === "dark" || theme === "botanical") return "text-white";
    return "text-gray-900";
  };

  const getSecondaryTextColor = () => {
    if (theme === "dark" || theme === "botanical") return "text-white/80";
    return "text-gray-600";
  };

  return (
    <div className={`p-4 rounded-xl border ${getThemedClasses()}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          className="mt-1 w-5 h-5 rounded border-2 border-gray-300 flex items-center justify-center hover:border-green-500 transition-colors flex-shrink-0"
        >
          {reminder.completed && <Check className="w-3 h-3 text-green-500" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${getTextColor()}`}>{reminder.title}</p>
          {reminder.description && (
            <p className={`text-sm ${getSecondaryTextColor()} mt-1`}>{reminder.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <p className={`text-sm ${getSecondaryTextColor()}`}>
              📅 {format(parseISO(reminder.due_date), 'MMM d')}
            </p>
            {reminder.schedule_time && (
              <p className={`text-sm ${getSecondaryTextColor()}`}>
                🕐 {format(parseISO(reminder.schedule_time), 'h:mm a')}
              </p>
            )}
            {reminder.recurrence_type && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-600">
                {reminder.recurrence_type === 'every_two_hours' ? 'Every 2h' : reminder.recurrence_type}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1.5 rounded hover:bg-blue-500/20 transition-colors"
            disabled={editMutation.isPending}
          >
            <Edit2 className="w-4 h-4 text-blue-500" />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Edit mode */}
      {isEditing && (
        <div className="mt-4 pt-4 border-t border-gray-300/30 space-y-2">
          <input
            type="text"
            value={editedTime}
            onChange={(e) => setEditedTime(e.target.value)}
            placeholder="e.g., 5 PM, tomorrow at 9am, every 2 hours"
            className={`w-full px-3 py-2 rounded text-sm border ${
              theme === "dark" || theme === "botanical"
                ? "bg-white/10 text-white border-white/20"
                : "bg-white text-gray-900 border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending || !editedTime.trim()}
              className="flex-1 px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {editMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedTime(reminder.original_time_phrase || "");
              }}
              className="px-3 py-1.5 rounded bg-gray-300 hover:bg-gray-400 text-gray-900 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}