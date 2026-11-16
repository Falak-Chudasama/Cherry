import React from "react";
import { MessageSquare, Calendar, Target, Layers, FileText, Settings } from "lucide-react";
import { sound } from "../lib/audio";

export type NavTab = "chat" | "day" | "quarter" | "season" | "notes" | "settings";

interface NavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  isFocusActive: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, isFocusActive }) => {
  const tabs: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: "chat", label: "Assistant", icon: <MessageSquare size={17} /> },
    { id: "day", label: "Day", icon: <Calendar size={17} /> },
    { id: "quarter", label: "Quarter", icon: <Target size={17} /> },
    { id: "season", label: "Verses", icon: <Layers size={17} /> },
    { id: "notes", label: "Context", icon: <FileText size={17} /> },
    { id: "settings", label: "System", icon: <Settings size={17} /> },
  ];

  const handleSelect = (id: NavTab) => {
    sound.play("scroll");
    onTabChange(id);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <nav className="glass-capsule rounded-capsule px-3 py-2 flex items-center gap-1.5 shadow-2xl">
        {/* Cherry Icon Brand Badge */}
        <div className="flex items-center pl-1 pr-2.5 mr-1 border-r border-white/10">
          <img src="/cherry-icon.svg" alt="Cherry" className="w-5 h-5 object-contain" />
          <span className="font-display text-xs font-bold tracking-tight text-white/90 ml-1.5 hidden sm:inline">
            CHERRY
          </span>
        </div>

        {/* Navigation Tabs */}
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleSelect(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-capsule text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-cherry text-white shadow-lg shadow-cherry/25 font-semibold"
                  : "text-ink-secondaryDark hover:text-ink-primaryDark hover:bg-white/5"
              }`}
            >
              {tab.icon}
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          );
        })}

        {/* Focus Mode Indicator */}
        {isFocusActive && (
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-white/10 text-xs font-semibold text-cherry">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cherry opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cherry"></span>
            </span>
            <span className="text-[11px] font-mono tracking-wider hidden lg:inline">FOCUS ON</span>
          </div>
        )}
      </nav>
    </div>
  );
};
