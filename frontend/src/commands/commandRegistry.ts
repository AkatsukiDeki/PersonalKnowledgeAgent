import { CommandItem } from './types';

export function matchCommand(command: CommandItem, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase().replace(/^>\s*/, '');
  if (!query) return 1; // Пустой запрос = показать рекомендуемые

  const title = command.title.toLowerCase();
  const desc = (command.description || '').toLowerCase();
  const keywords = (command.keywords || []).map(k => k.toLowerCase());

  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (title.includes(query)) return 60;
  if (keywords.some(k => k.startsWith(query))) return 50;
  if (keywords.some(k => k.includes(query))) return 40;
  if (desc.includes(query)) return 20;

  return 0;
}

export function filterAndRankCommands(commands: CommandItem[], query: string): CommandItem[] {
  return commands
    .map(cmd => ({ cmd, score: matchCommand(cmd, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.cmd);
}
