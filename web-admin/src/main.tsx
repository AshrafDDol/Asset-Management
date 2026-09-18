import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* Radix tooltips need a provider in scope; SidebarMenuButton renders one per item. */}
      <TooltipProvider>
        <App />
        {/* theme is pinned because the app has no next-themes provider, so the
            Toaster would otherwise follow the OS and go dark on a light-only UI.
            No richColors: it replaces the --normal-bg/text/border variables the
            shadcn wrapper sets, which is what gives toasts the popover surface. */}
        <Toaster theme="light" />
      </TooltipProvider>
    </BrowserRouter>
  </React.StrictMode>
);
