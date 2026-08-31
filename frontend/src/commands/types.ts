import { ReactNode } from 'react';

export type CommandCategory = 'navigation' | 'action' | 'ai';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  shortcut?: string;
  category: CommandCategory;
  icon?: ReactNode;
  execute: () => void | Promise<void>;
}
