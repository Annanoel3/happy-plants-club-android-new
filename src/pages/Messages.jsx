import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, User, MoreVertical, Flag, ShieldX, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { community } from "@/lib/community";
import ReportSheet from "@/components/community/ReportSheet";

// One-to-one messages. Sending goes through the community function, which checks every
// message with moderateContent first (an inappropriate message is never sent) and refuses
// to deliver anything between people who have blocked each other.
export default function Messages() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [convo, setConvo] = useState(null); // { messages, person, iBlocked, theyBlocked, banned }
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const chatWithEmail = new URLSearchParams(window.location.search).get('chat');

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => toast.error('Failed to load your account.'));
  }, []);

  const load = useCallback(async () => {
    if (!chatWithEmail) return;
    try {
      setConvo(await community('conversation', { with: chatWithEmail }));
    } catch (e) {
      toast.error(e.message);
    }
  }, [chatWithEmail]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const handleSendMessage = async () => {
    const text = messageText.trim();
    if (!text || !user || !convo?.person || isSending) return;
    setIsSending(true);
    try {
      await community('message', { to_email: convo.person.email, content: text });
      setMessageText("");
      await load();
    } catch (e) {
      // Moderation says no: the message stays in the box so they can change it
      toast.error(e.message);
    } finally {
      setIsSending(false);
    }
  };

  const setBlocked = async (block) => {
    try {
      await community(block ? 'block' : 'unblock', { email: chatWithEmail });
      toast.success(block ? `${convo?.person?.full_name || 'They'} can't message you now.` : 'Unblocked.');
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!user || !convo) {
    return (
      <div className="min-h-screen theme-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin theme-text" />
      </div>
    );
  }

  const person = convo.person;
  if (!person) {
    return (
      <div className="min-h-screen theme-bg flex flex-col items-center justify-center p-6 text-center">
        <p className="theme-text font-semibold">This person isn’t available.</p>
        <Button onClick={() => navigate(-1)} variant="outline" className="mt-4">Go back</Button>
      </div>
    );
  }

  const canSend = !convo.iBlocked && !convo.theyBlocked && !convo.banned;

  return (
    <div className="min-h-screen theme-bg flex flex-col">
      {reportTarget && <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={() => load()} />}

      {/* Header */}
      <div className="theme-card border-b theme-border p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="w-6 h-6 theme-text" />
          </button>
          <Avatar className="w-10 h-10">
            <AvatarImage src={person.profile_picture} />
            <AvatarFallback><User /></AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="font-semibold theme-text">{person.full_name}</h2>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More options"><MoreVertical className="w-5 h-5 theme-text" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setReportTarget({ type: 'user', email: person.email, name: person.full_name })}>
                <Flag className="w-4 h-4 mr-2" /> Report {person.full_name}
              </DropdownMenuItem>
              {convo.iBlocked ? (
                <DropdownMenuItem onClick={() => setBlocked(false)}>
                  <Shield className="w-4 h-4 mr-2" /> Unblock
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setBlocked(true)} className="text-red-600">
                  <ShieldX className="w-4 h-4 mr-2" /> Block {person.full_name}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {convo.messages.map((msg) => {
            const isMe = msg.sender_email === user.email;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[70%] ${isMe ? 'bg-green-600 text-white' : 'theme-card'} rounded-2xl p-4`}>
                  <p className={`whitespace-pre-wrap ${isMe ? 'text-white' : 'theme-text'}`}>{msg.content}</p>
                  <p className={`text-xs mt-1 ${isMe ? 'text-green-100' : 'theme-text-secondary'}`}>
                    {msg.created_date ? format(new Date(msg.created_date), 'h:mm a') : ''}
                  </p>
                </div>
                {!isMe && (
                  <button onClick={() => setReportTarget({ type: 'message', id: msg.id, email: person.email, name: person.full_name })}
                    className="mt-1 text-xs theme-text-secondary inline-flex items-center gap-1 opacity-70">
                    <Flag className="w-3 h-3" /> Report
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="theme-card border-t theme-border p-4 sticky bottom-0 z-10" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-4xl mx-auto">
          {canSend ? (
            <div className="flex gap-2">
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={isSending || !messageText.trim()}
                className="bg-green-600 hover:bg-green-700"
                aria-label="Send"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-center theme-text-secondary">
              {convo.banned ? 'Your Community access has been turned off, so you can’t send messages.'
                : convo.iBlocked ? <>You blocked {person.full_name}. <button className="underline font-semibold" onClick={() => setBlocked(false)}>Unblock</button> to message them.</>
                : 'You can’t message this person.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
