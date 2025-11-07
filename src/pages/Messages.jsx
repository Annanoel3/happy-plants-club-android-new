
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query"; // useMutation and useQueryClient removed as they are no longer used for sending messages
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Messages() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null); // Renamed currentUser to user
  const [messages, setMessages] = useState([]); // Added state for messages
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false); // State to manage send button's disabled status

  const urlParams = new URLSearchParams(window.location.search);
  const chatWithEmail = urlParams.get('chat'); // Renamed otherUserEmail to chatWithEmail

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    // New useEffect from outline
    if (user && chatWithEmail) { // Added chatWithEmail as a dependency
      loadConversations();
    }
  }, [user, chatWithEmail]); // Ensure re-fetch if the chat target changes

  const loadUser = async () => {
    try {
      const fetchedUser = await base44.auth.me();
      setUser(fetchedUser);
    } catch (error) {
      console.error('Error loading user:', error);
      toast.error('Failed to load user information.');
    }
  };

  // Function to load messages, replacing the useQuery for messages
  const loadConversations = async () => {
    if (!user || !chatWithEmail) return;
    try {
      const sent = await base44.entities.DirectMessage.filter({
        sender_email: user.email,
        receiver_email: chatWithEmail
      });
      const received = await base44.entities.DirectMessage.filter({
        sender_email: chatWithEmail,
        receiver_email: user.email
      });
      
      const allMessages = [...sent, ...received].sort((a, b) => 
        new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
      );
      setMessages(allMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages.');
    }
  };

  const { data: otherUser } = useQuery({
    queryKey: ['user', chatWithEmail], // Changed otherUserEmail to chatWithEmail
    queryFn: async () => {
      const users = await base44.entities.User.filter({ email: chatWithEmail }); // Changed otherUserEmail to chatWithEmail
      return users[0];
    },
    enabled: !!chatWithEmail,
  });

  // sendMessageMutation has been removed as per the outline, replaced by handleSendMessage logic.

  const handleSendMessage = async () => {
    // Added checks for user and otherUser (formerly selectedUser)
    if (!messageText.trim() || !user || !otherUser) return;

    setIsSending(true); // Disable button while sending

    // Optimistic UI update: Add a temporary message
    const tempMessage = {
      id: `temp-${Date.now()}-${Math.random()}`, // Unique temporary ID for React key
      sender_email: user.email,
      sender_name: user.full_name,
      receiver_email: otherUser.email, // selectedUser is otherUser
      receiver_name: otherUser.full_name, // selectedUser is otherUser
      content: messageText,
      created_date: new Date().toISOString() // Use current time for optimistic display
    };

    setMessages(prev => [...prev, tempMessage]);
    setMessageText(""); // Clear input field

    try {
      // The moderation call was removed as per the provided outline.
      await base44.entities.DirectMessage.create({
        sender_email: user.email,
        sender_name: user.full_name,
        receiver_email: otherUser.email,
        receiver_name: otherUser.full_name,
        content: tempMessage.content // Use content from tempMessage
      });
      // After successful send, re-fetch all messages to get the server-assigned ID and accurate timestamp
      await loadConversations();
    } catch (error) {
      toast.error('Failed to send message: ' + (error.message || 'Unknown error'));
      // Rollback optimistic update if sending fails
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
    } finally {
      setIsSending(false); // Re-enable button
    }
  };

  // Changed currentUser to user for the loading check
  if (!user || !otherUser) {
    return (
      <div className="min-h-screen theme-bg flex items-center justify-center">
        <p className="theme-text">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg flex flex-col">
      {/* Header */}
      <div className="theme-card border-b theme-border p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)}>
            <ArrowLeft className="w-6 h-6 theme-text" />
          </button>
          <Avatar className="w-10 h-10">
            <AvatarImage src={otherUser.profile_picture} />
            <AvatarFallback><User /></AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="font-semibold theme-text">{otherUser.full_name}</h2>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg) => {
            const isMe = msg.sender_email === user.email; // Changed currentUser to user
            return (
              <div key={msg.id || msg.created_date + msg.content} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] ${isMe ? 'bg-green-600 text-white' : 'theme-card'} rounded-2xl p-4`}>
                  <p className={isMe ? 'text-white' : 'theme-text'}>{msg.content}</p>
                  <p className={`text-xs mt-1 ${isMe ? 'text-green-100' : 'theme-text-secondary'}`}>
                    {msg.created_date ? format(new Date(msg.created_date), 'h:mm a') : 'Sending...'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="theme-card border-t theme-border p-4">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={isSending || !messageText.trim()} // Changed from sendMessageMutation.isPending to isSending
            className="bg-green-600 hover:bg-green-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
