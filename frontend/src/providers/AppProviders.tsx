import React, { Suspense } from 'react';
import { InspectorProvider } from '../context/InspectorContext';
import { FocusProvider } from '../context/FocusContext';
import { LanguageProvider } from '../context/LanguageContext';
import { Loader2 } from 'lucide-react';

export const FallbackLoader = () => (
  <div className="flex h-full w-full items-center justify-center bg-[#030303]/80 backdrop-blur-sm">
    <Loader2 className="w-8 h-8 animate-spin text-white/50" />
  </div>
);

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <FocusProvider>
        <InspectorProvider>
          {children}
        </InspectorProvider>
      </FocusProvider>
    </LanguageProvider>
  );
}
