import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Calendar, MessageCircle, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Garden", url: "/Dashboard", icon: Home },
  { title: "Schedule", url: "/Schedule", icon: Calendar },
  { title: "Community", url: "/Feed", icon: MessageCircle },
  { title: "Search", url: "/Search", icon: Search },
  { title: "Settings", url: "/Settings", icon: Settings },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t pointer-events-auto"
      style={{
        background: "var(--sidebar-bg, rgba(255,255,255,0.98))",
        borderColor: "var(--theme-card-border, rgba(0,0,0,0.1))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backdropFilter: "blur(10px)",
      }}
    >
      {navItems.map((item) => {
        const isActive = location.pathname === item.url;
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => navigate(item.url)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 flex-1 py-3 px-2 transition-all pointer-events-auto min-h-16",
              isActive ? "opacity-100" : "opacity-50"
            )}
            style={{ color: isActive ? "var(--sidebar-text, #2d3748)" : "var(--sidebar-text-secondary, #718096)" }}
          >
            <item.icon className="w-6 h-6 flex-shrink-0" />
            <span className="text-[10px] font-medium truncate">{item.title}</span>
          </button>
        );
      })}
    </nav>
  );
}