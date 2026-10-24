import React, { createContext, useContext, useState } from "react";

interface DashboardDrawerContextType {
  isUserDrawerOpen: boolean;
  openUserDrawer: () => void;
  closeUserDrawer: () => void;
  isSettingsDrawerOpen: boolean;
  openSettingsDrawer: () => void;
  closeSettingsDrawer: () => void;
  openSettingsFromUserDrawer: () => void;
}

const DashboardDrawerContext = createContext<DashboardDrawerContextType | null>(null);

export function DashboardDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);

  const openUserDrawer = () => setIsUserDrawerOpen(true);
  const closeUserDrawer = () => setIsUserDrawerOpen(false);

  const openSettingsDrawer = () => setIsSettingsDrawerOpen(true);
  const closeSettingsDrawer = () => setIsSettingsDrawerOpen(false);

  // Requirement: đóng drawer cũ và mở drawer cài đặt trượt từ dưới lên
  const openSettingsFromUserDrawer = () => {
    setIsUserDrawerOpen(false);
    setTimeout(() => {
      setIsSettingsDrawerOpen(true);
    }, 250);
  };

  return (
    <DashboardDrawerContext.Provider
      value={{
        isUserDrawerOpen,
        openUserDrawer,
        closeUserDrawer,
        isSettingsDrawerOpen,
        openSettingsDrawer,
        closeSettingsDrawer,
        openSettingsFromUserDrawer,
      }}
    >
      {children}
    </DashboardDrawerContext.Provider>
  );
}

export function useDashboardDrawer() {
  const context = useContext(DashboardDrawerContext);
  if (!context) {
    throw new Error("useDashboardDrawer must be used within DashboardDrawerProvider");
  }
  return context;
}
