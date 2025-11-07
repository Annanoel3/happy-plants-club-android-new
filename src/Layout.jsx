
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Calendar, MessageCircle, Settings, Sun, Moon, Leaf, User, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import NotificationPopup from "@/components/NotificationPopup";

import OneSignalSetup from "@/components/OneSignalSetup";
import ThemeMode from "@/components/ThemeMode";

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpen } = useSidebar();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const checkAuth = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const cycleTheme = () => {
    const themes = ['light', 'dark', 'botanical', 'kawaii', 'halloween', 'christmas', 'valentines', 'newyears', 'stpatricks', 'fourthofjuly', 'summer', 'spring', 'fall', 'winter'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getActiveButtonClass = () => {
    if (theme === 'botanical') return 'bg-green-600 hover:bg-green-700';
    if (theme === 'kawaii') return 'bg-pink-400 hover:bg-pink-500';
    if (theme === 'halloween') return 'bg-orange-500 hover:bg-orange-600';
    if (theme === 'christmas') return 'bg-red-600 hover:bg-red-700';
    if (theme === 'valentines') return 'bg-rose-500 hover:bg-rose-600';
    if (theme === 'newyears') return 'bg-purple-500 hover:bg-purple-600';
    if (theme === 'stpatricks') return 'bg-emerald-600 hover:bg-emerald-700';
    if (theme === 'fourthofjuly') return 'bg-blue-600 hover:bg-blue-700';
    if (theme === 'summer') return 'bg-amber-500 hover:bg-amber-600';
    if (theme === 'spring') return 'bg-violet-500 hover:bg-violet-600';
    if (theme === 'fall') return 'bg-orange-600 hover:bg-orange-700';
    if (theme === 'winter') return 'bg-cyan-600 hover:bg-cyan-700';
    if (theme === 'dark') return 'bg-slate-600 hover:bg-slate-700';
    return 'bg-green-600 hover:bg-green-700';
  };

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['pendingRequests', user?.email],
    queryFn: async () => {
      if (!user || !user.profile_private) return [];
      const requests = await base44.entities.FollowRequest.filter({
        target_email: user.email,
        status: 'pending'
      });
      return requests;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: feedNotifications = [] } = useQuery({
    queryKey: ['feedNotifications', user?.email],
    queryFn: async () => {
      if (!user) return [];
      const notifs = await base44.entities.Notification.filter({
        user_email: user.email,
        type: ['like', 'comment'],
        dismissed: false
      });
      return notifs;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const navigationItems = [
    { title: "My Garden", url: "/Dashboard", icon: Home },
    { title: "Schedule", url: "/Schedule", icon: Calendar },
    { title: "Community", url: "/Feed", icon: MessageCircle, badge: feedNotifications.length },
    { title: "Find Friends", url: "/Search", icon: Search, badge: pendingRequests.length },
    { title: "Plant Expert", url: "/PlantChat", icon: MessageCircle },
    { title: "Settings", url: "/Settings", icon: Settings },
  ];

  const handleNavClick = (url) => {
    navigate(url);
    setOpen(false); // Close sidebar after navigation
  };

  return (
    <div className="min-h-screen flex w-full theme-bg relative">
      {(theme === 'dark' || theme === 'botanical' || theme === 'christmas' || theme === 'newyears' || theme === 'fall' || theme === 'fourthofjuly' || theme === 'halloween') && (
        <div className="fixed inset-0 bg-black/75 -z-10"></div>
      )}
      
      {(theme === 'spring' || theme === 'summer' || theme === 'kawaii' || theme === 'winter' || theme === 'stpatricks' || theme === 'valentines' || theme === 'light') && (
        <div className="fixed inset-0 bg-white/60 -z-10"></div>
      )}
      
      <Sidebar className="sidebar-container">
        <SidebarHeader className="sidebar-header">
          <div className="flex items-center gap-3">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/9fd059159_HP1.png"
              alt="Happy Plants"
              className="w-12 h-12 rounded-2xl object-cover shadow-lg"
            />
            <div>
              <h2 className="font-bold sidebar-text text-xl happy-plants-title">Happy Plants</h2>
              <p className="text-xs sidebar-text-secondary">AI Plant Care</p>
            </div>
          </div>
        </SidebarHeader>
        
        <SidebarContent className="p-3 sidebar-content">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        onClick={() => handleNavClick(item.url)}
                        className={cn(
                          "rounded-2xl transition-all duration-300 mb-2 h-12 cursor-pointer",
                          isActive 
                            ? `${getActiveButtonClass()} text-white` 
                            : "sidebar-nav-inactive"
                        )}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="relative">
                            <item.icon className="w-5 h-5" />
                            {item.badge > 0 && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>
                            )}
                          </div>
                          <span className="font-semibold">{item.title}</span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-3 sidebar-footer">
          <Button
            variant="outline"
            onClick={cycleTheme}
            className="w-full justify-start gap-3 mb-3 h-12 sidebar-button rounded-2xl font-semibold"
          >
            {theme === 'light' && <><Sun className="w-5 h-5" /> Light Mode</>}
            {theme === 'dark' && <><Moon className="w-5 h-5" /> Dark Mode</>}
            {theme === 'botanical' && <><Leaf className="w-5 h-5" /> Botanical</>}
            {theme === 'kawaii' && <span className="text-2xl">🌸</span>}
            {theme === 'halloween' && <span className="text-2xl">🎃</span>}
            {theme === 'christmas' && <span className="text-2xl">🎄</span>}
            {theme === 'valentines' && <span className="text-2xl">💖</span>}
            {theme === 'newyears' && <span className="text-2xl">🎉</span>}
            {theme === 'stpatricks' && <span className="text-2xl">🍀</span>}
            {theme === 'fourthofjuly' && <span className="text-2xl">🎆</span>}
            {theme === 'summer' && <span className="text-2xl">☀️</span>}
            {theme === 'spring' && <span className="text-2xl">🌷</span>}
            {theme === 'fall' && <span className="text-2xl">🍂</span>}
            {theme === 'winter' && <span className="text-2xl">❄️</span>}
            
            <span className="ml-2 capitalize">{theme}</span>
          </Button>
          {!isLoading && user && (
            <>
              <button
                onClick={() => {
                  navigate('/MyProfile');
                  setOpen(false);
                }}
                className="w-full px-3 py-3 text-sm sidebar-user-info rounded-2xl hover:opacity-80 transition-opacity text-left mb-2"
              >
                <p className="font-semibold sidebar-text truncate">{user.full_name}</p>
                <p className="text-xs sidebar-text-secondary truncate">{user.email}</p>
              </button>
            </>
          )}
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 flex flex-col overflow-x-hidden">
        <header className="border-b theme-border px-6 py-3 pt-6 md:hidden sticky top-0 z-10 mobile-header flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <SidebarTrigger className="hover:bg-opacity-10 p-2 rounded-lg mobile-header-text flex-shrink-0" />
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 min-w-0">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/9fd059159_HP1.png"
                  alt="Happy Plants"
                  className="w-8 h-8 rounded-xl object-cover flex-shrink-0"
                />
                <h1 className="text-xl font-bold mobile-header-text truncate">Happy Plants</h1>
              </div>
            </div>
            {user && (
              <button 
                onClick={() => {
                  navigate('/MyProfile');
                  setOpen(false);
                }} 
                className="flex-shrink-0"
              >
                <Avatar className="w-9 h-9 ring-2 ring-white/20">
                  <AvatarImage src={user.profile_picture} className="object-cover" />
                  <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                </Avatar>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <SidebarProvider>
      <ThemeMode />
      <OneSignalSetup user={null} />
      <NotificationPopup user={null} />
      <LayoutContent children={children} currentPageName={currentPageName} />
      
      <style>{`
        /* Light Theme */
        [data-theme="light"] {
          --theme-bg: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          --theme-text: #2d3748;
          --theme-text-secondary: #718096;
          --theme-card-bg: rgba(255, 255, 255, 0.95);
          --theme-card-border: rgba(0, 0, 0, 0.1);
          --theme-input-bg: white;
          --theme-input-border: #e2e8f0;
          --theme-input-text: #2d3748;
          --sidebar-bg: rgba(255, 255, 255, 0.98);
          --sidebar-text: #2d3748;
          --sidebar-text-secondary: #718096;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #374151;
          --sidebar-user-info-bg: rgba(0, 0, 0, 0.03);
          --sidebar-button-border: rgba(0, 0, 0, 0.1);
          --mobile-header-bg: rgba(255, 255, 255, 0.95);
          --mobile-header-text: #2d3748;
        }

        /* Dark Theme */
        [data-theme="dark"] {
          --theme-bg: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
          --theme-text: #f7fafc;
          --theme-text-secondary: #cbd5e0;
          --theme-card-bg: rgba(45, 55, 72, 0.95);
          --theme-card-border: rgba(255, 255, 255, 0.1);
          --theme-input-bg: rgba(255, 255, 255, 0.1);
          --theme-input-border: rgba(255, 255, 255, 0.2);
          --theme-input-text: #f7fafc;
          --sidebar-bg: rgba(26, 32, 44, 0.98);
          --sidebar-text: #f7fafc;
          --sidebar-text-secondary: #cbd5e0;
          --sidebar-nav-inactive: rgba(255, 255, 255, 0.05);
          --sidebar-nav-inactive-text: #f7fafc;
          --sidebar-user-info-bg: rgba(255, 255, 255, 0.05);
          --sidebar-button-border: rgba(255, 255, 255, 0.2);
          --mobile-header-bg: rgba(26, 32, 44, 0.95);
          --mobile-header-text: #f7fafc;
        }

        /* Botanical Theme */
        [data-theme="botanical"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/50723a169_ChatGPTImageOct10202510_52_39PM.png');
          --theme-text: #e8f5e9;
          --theme-text-secondary: #c8e6c9;
          --theme-card-bg: rgba(13, 33, 13, 0.85);
          --theme-card-border: rgba(76, 175, 80, 0.3);
          --theme-input-bg: rgba(0, 0, 0, 0.3);
          --theme-input-border: rgba(129, 199, 132, 0.3);
          --theme-input-text: #e8f5e9;
          --sidebar-bg: rgba(5, 15, 5, 0.98);
          --sidebar-text: #e8f5e9;
          --sidebar-text-secondary: #c8e6c9;
          --sidebar-nav-inactive: rgba(30, 80, 30, 0.8);
          --sidebar-nav-inactive-text: #e8f5e9;
          --sidebar-user-info-bg: rgba(20, 60, 20, 0.9);
          --sidebar-button-border: rgba(76, 175, 80, 0.5);
          --mobile-header-bg: rgba(5, 15, 5, 0.95);
          --mobile-header-text: #e8f5e9;
        }

        /* Kawaii Theme */
        [data-theme="kawaii"] {
          --theme-bg: linear-gradient(135deg, #ffe4f5 0%, #ffd4eb 25%, #ffc4e1 50%, #ffb4d7 75%, #ffa4cd 100%),
                      repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255, 255, 255, 0.3) 10px, rgba(255, 255, 255, 0.3) 20px);
          --theme-text: #d81b60;
          --theme-text-secondary: #ec407a;
          --theme-card-bg: rgba(255, 255, 255, 0.95);
          --theme-card-border: rgba(255, 182, 193, 0.5);
          --theme-input-bg: white;
          --theme-input-border: #f8bbd0;
          --theme-input-text: #d81b60;
          --sidebar-bg: rgba(255, 240, 245, 0.98);
          --sidebar-text: #d81b60;
          --sidebar-text-secondary: #ec407a;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #d81b60;
          --sidebar-user-info-bg: rgba(255, 182, 193, 0.15);
          --sidebar-button-border: rgba(255, 182, 193, 0.4);
          --mobile-header-bg: rgba(255, 240, 245, 0.95);
          --mobile-header-text: #d81b60;
        }

        /* Halloween Theme */
        [data-theme="halloween"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/6d2911385_c9c617da-1d0c-4fed-9830-7f692c5bac3d.png');
          --theme-text: #ff9800;
          --theme-text-secondary: #ffb74d;
          --theme-card-bg: rgba(51, 13, 0, 0.9);
          --theme-card-border: rgba(255, 152, 0, 0.3);
          --theme-input-bg: rgba(255, 255, 255, 0.05);
          --theme-input-border: rgba(255, 152, 0, 0.3);
          --theme-input-text: #ffb74d;
          --sidebar-bg: rgba(26, 13, 0, 0.98);
          --sidebar-text: #ff9800;
          --sidebar-text-secondary: #ffb74d;
          --sidebar-nav-inactive: rgba(255, 152, 0, 0.1);
          --sidebar-nav-inactive-text: #ff9800;
          --sidebar-user-info-bg: rgba(255, 152, 0, 0.15);
          --sidebar-button-border: rgba(255, 152, 0, 0.3);
          --mobile-header-bg: rgba(26, 13, 0, 0.95);
          --mobile-header-text: #ff9800;
        }

        /* Christmas Theme */
        [data-theme="christmas"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/1020f2ea4_1ChatGPTImageOct15202504_16_05PM.png');
          --theme-text: #e8f5e9;
          --theme-text-secondary: #c8e6c9;
          --theme-card-bg: rgba(10, 30, 10, 0.9);
          --theme-card-border: rgba(139, 69, 69, 0.5);
          --theme-input-bg: rgba(0, 0, 0, 0.3);
          --theme-input-border: rgba(139, 69, 69, 0.3);
          --theme-input-text: #e8f5e9;
          --sidebar-bg: rgba(10, 10, 10, 0.98);
          --sidebar-text: #e8f5e9;
          --sidebar-text-secondary: #c8e6c9;
          --sidebar-nav-inactive: rgba(30, 80, 30, 0.8);
          --sidebar-nav-inactive-text: #e8f5e9;
          --sidebar-user-info-bg: rgba(20, 60, 20, 0.9);
          --sidebar-button-border: rgba(76, 175, 80, 0.5);
          --mobile-header-bg: rgba(10, 10, 10, 0.95);
          --mobile-header-text: #e8f5e9;
        }

        /* Valentine's Theme */
        [data-theme="valentines"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/0d07f459d_2ChatGPTImageOct15202504_16_09PM.png') center center / cover no-repeat fixed;
          --theme-text: #d81b60;
          --theme-text-secondary: #ec407a;
          --theme-card-bg: rgba(255, 255, 255, 0.95);
          --theme-card-border: rgba(255, 182, 193, 0.4);
          --theme-input-bg: white;
          --theme-input-border: #f8bbd0;
          --theme-input-text: #d81b60;
          --sidebar-bg: rgba(255, 240, 245, 0.98);
          --sidebar-text: #d81b60;
          --sidebar-text-secondary: #ec407a;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #d81b60;
          --sidebar-user-info-bg: rgba(255, 182, 193, 0.15);
          --sidebar-button-border: rgba(255, 182, 193, 0.4);
          --mobile-header-bg: rgba(255, 240, 245, 0.95);
          --mobile-header-text: #d81b60;
        }

        /* New Year's Theme */
        [data-theme="newyears"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/55fd12b31_3ChatGPTImageOct15202504_11_12PM.png');
          --theme-text: #ffffff;
          --theme-text-secondary: #f0f0f0;
          --theme-card-bg: rgba(10, 10, 30, 0.9);
          --theme-card-border: rgba(255, 215, 0, 0.3);
          --theme-input-bg: rgba(0, 0, 0, 0.3);
          --theme-input-border: rgba(255, 215, 0, 0.3);
          --theme-input-text: #ffffff;
          --sidebar-bg: rgba(10, 10, 30, 0.98);
          --sidebar-text: #ffffff;
          --sidebar-text-secondary: #f0f0f0;
          --sidebar-nav-inactive: rgba(255, 215, 0, 0.1);
          --sidebar-nav-inactive-text: #ffffff;
          --sidebar-user-info-bg: rgba(255, 215, 0, 0.15);
          --sidebar-button-border: rgba(255, 215, 0, 0.3);
          --mobile-header-bg: rgba(10, 10, 30, 0.95);
          --mobile-header-text: #ffffff;
        }

        /* St. Patrick's Theme */
        [data-theme="stpatricks"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/0c04ebe92_4ChatGPTImageOct15202504_14_19PM.png');
          --theme-text: #1b5e20;
          --theme-text-secondary: #388e3c;
          --theme-card-bg: rgba(255, 255, 255, 0.95);
          --theme-card-border: rgba(139, 195, 74, 0.3);
          --theme-input-bg: white;
          --theme-input-border: #c5e1a5;
          --theme-input-text: #1b5e20;
          --sidebar-bg: rgba(240, 255, 230, 0.98);
          --sidebar-text: #1b5e20;
          --sidebar-text-secondary: #388e3c;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #1b5e20;
          --sidebar-user-info-bg: rgba(139, 195, 74, 0.1);
          --sidebar-button-border: rgba(139, 195, 74, 0.3);
          --mobile-header-bg: rgba(240, 255, 230, 0.95);
          --mobile-header-text: #1b5e20;
        }

        /* Fourth of July Theme */
        [data-theme="fourthofjuly"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/5963e3b3e_5ChatGPTImageOct15202504_16_16PM.png');
          --theme-text: #ffffff;
          --theme-text-secondary: #f0f0f0;
          --theme-card-bg: rgba(10, 20, 40, 0.85);
          --theme-card-border: rgba(178, 34, 52, 0.5);
          --theme-input-bg: rgba(0, 0, 0, 0.3);
          --theme-input-border: rgba(178, 34, 52, 0.3);
          --theme-input-text: #ffffff;
          --sidebar-bg: rgba(10, 20, 40, 0.98);
          --sidebar-text: #ffffff;
          --sidebar-text-secondary: #f0f0f0;
          --sidebar-nav-inactive: rgba(178, 34, 52, 0.15);
          --sidebar-nav-inactive-text: #ffffff;
          --sidebar-user-info-bg: rgba(178, 34, 52, 0.15);
          --sidebar-button-border: rgba(178, 34, 52, 0.3);
          --mobile-header-bg: rgba(10, 20, 40, 0.95);
          --mobile-header-text: #ffffff;
        }

        /* Summer Theme */
        [data-theme="summer"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/fd5f271d9_ChatGPTImageOct15202504_16_19PM.png');
          --theme-text: #e65100;
          --theme-text-secondary: #f57c00;
          --theme-card-bg: rgba(255, 255, 255, 0.95);
          --theme-card-border: rgba(255, 167, 38, 0.3);
          --theme-input-bg: white;
          --theme-input-border: #ffcc80;
          --theme-input-text: #e65100;
          --sidebar-bg: rgba(255, 248, 225, 0.98);
          --sidebar-text: #e65100;
          --sidebar-text-secondary: #f57c00;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #e65100;
          --sidebar-user-info-bg: rgba(255, 167, 38, 0.1);
          --sidebar-button-border: rgba(255, 167, 38, 0.3);
          --mobile-header-bg: rgba(255, 248, 225, 0.95);
          --mobile-header-text: #e65100;
        }

        /* Spring Theme */
        [data-theme="spring"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/a1b4989c3_ChatGPTImageOct15202504_16_23PM.png');
          --theme-text: #4a148c;
          --theme-text-secondary: #6a1b9a;
          --theme-card-bg: rgba(255, 255, 255, 0.95);
          --theme-card-border: rgba(186, 104, 200, 0.3);
          --theme-input-bg: white;
          --theme-input-border: #e1bee7;
          --theme-input-text: #4a148c;
          --sidebar-bg: rgba(248, 237, 252, 0.98);
          --sidebar-text: #4a148c;
          --sidebar-text-secondary: #6a1b9a;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #4a148c;
          --sidebar-user-info-bg: rgba(186, 104, 200, 0.1);
          --sidebar-button-border: rgba(186, 104, 200, 0.3);
          --mobile-header-bg: rgba(248, 237, 252, 0.95);
          --mobile-header-text: #4a148c;
        }

        /* Fall Theme */
        [data-theme="fall"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/d1b15523e_ChatGPTImageOct15202504_16_28PM.png');
          --theme-text: #ffffff;
          --theme-text-secondary: #f0f0f0;
          --theme-card-bg: rgba(40, 30, 20, 0.85);
          --theme-card-border: rgba(210, 105, 30, 0.5);
          --theme-input-bg: rgba(0, 0, 0, 0.3);
          --theme-input-border: #D2691E;
          --theme-input-text: #ffffff;
          --sidebar-bg: rgba(255, 248, 240, 0.98);
          --sidebar-text: #8B4513;
          --sidebar-text-secondary: #A0522D;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #8B4513;
          --sidebar-user-info-bg: rgba(210, 105, 30, 0.1);
          --sidebar-button-border: rgba(210, 105, 30, 0.3);
          --mobile-header-bg: rgba(40, 30, 20, 0.95);
          --mobile-header-text: #ffffff;
        }

        /* Winter Theme */
        [data-theme="winter"] {
          --theme-bg: url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68e7e07bd0e33d2da3f22dbf/dbebfcc9b_ChatGPTImageOct15202504_16_31PM.png');
          --theme-text: #0d47a1;
          --theme-text-secondary: #1565c0;
          --theme-card-bg: rgba(255, 255, 255, 0.95);
          --theme-card-border: rgba(100, 181, 246, 0.3);
          --theme-input-bg: white;
          --theme-input-border: #bbdefb;
          --theme-input-text: #0d47a1;
          --sidebar-bg: rgba(237, 247, 255, 0.98);
          --sidebar-text: #0d47a1;
          --sidebar-text-secondary: #1565c0;
          --sidebar-nav-inactive: rgba(243, 244, 246, 1);
          --sidebar-nav-inactive-text: #0d47a1;
          --sidebar-user-info-bg: rgba(100, 181, 246, 0.1);
          --sidebar-button-border: rgba(100, 181, 246, 0.3);
          --mobile-header-bg: rgba(237, 247, 255, 0.95);
          --mobile-header-text: #0d47a1;
        }

        /* Apply theme variables */
        .theme-bg {
          background: var(--theme-bg);
          background-size: cover;
          background-attachment: fixed;
        }

        .theme-text {
          color: var(--theme-text);
        }

        .theme-text-secondary {
          color: var(--theme-text-secondary);
        }

        .theme-card {
          background: var(--theme-card-bg);
          border-color: var(--theme-card-border);
          backdrop-filter: blur(10px);
        }

        .theme-input {
          background: var(--theme-input-bg);
          border-color: var(--theme-input-border);
          color: var(--theme-input-text);
        }

        .theme-input::placeholder {
          color: var(--theme-text-secondary);
          opacity: 0.6;
        }

        .theme-border {
          border-color: var(--theme-card-border);
        }

        .sidebar-container {
          background: var(--sidebar-bg) !important;
          backdrop-filter: blur(10px);
        }

        .sidebar-header {
          background: var(--sidebar-bg) !important;
        }

        .sidebar-content {
          background: var(--sidebar-bg) !important;
        }

        .sidebar-footer {
          background: var(--sidebar-bg) !important;
          border-top: 1px solid var(--theme-card-border);
        }

        .sidebar-text {
          color: var(--sidebar-text) !important;
        }

        .sidebar-text-secondary {
          color: var(--sidebar-text-secondary) !important;
        }

        .sidebar-nav-inactive {
          background: var(--sidebar-nav-inactive) !important;
          color: var(--sidebar-nav-inactive-text) !important;
        }

        .sidebar-nav-inactive:hover {
          opacity: 0.8;
        }

        .sidebar-user-info {
          background: var(--sidebar-user-info-bg) !important;
          color: var(--sidebar-text) !important;
        }

        .sidebar-button {
          border-color: var(--sidebar-button-border) !important;
          color: var(--sidebar-text) !important;
          background: var(--sidebar-nav-inactive) !important;
        }

        .sidebar-button:hover {
          opacity: 0.8;
        }

        .mobile-header {
          background: var(--mobile-header-bg) !important;
          backdrop-filter: blur(10px);
        }

        .mobile-header-text {
          color: var(--mobile-header-text) !important;
        }

        .happy-plants-title {
          background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
    </SidebarProvider>
  );
}
