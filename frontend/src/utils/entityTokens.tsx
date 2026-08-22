import React from 'react';
import { Sparkles, GitBranch, CircleDot, FileText, Zap } from 'lucide-react';
import { GraphNode } from '../types/graph';

export interface EntityStyleConfig {
  label: string;
  color: string;
  hex: string;
  glowRgb: string;
  radius: number;
  pulseFreq: number;
  icon: React.ReactNode;
}

export const ENTITY_TOKENS: Record<string, EntityStyleConfig> = {
  insight:  { label: 'Insight',  color: 'text-indigo-400',  hex: '#f59e0b', glowRgb: '245, 158, 11',  radius: 9, pulseFreq: 1.8,  icon: <Sparkles size={13} /> },
  decision: { label: 'Decision', color: 'text-sky-400',     hex: '#8b5cf6', glowRgb: '139, 92, 246',  radius: 7, pulseFreq: 1.2,  icon: <GitBranch size={13} /> },
  entity:   { label: 'Entity',   color: 'text-zinc-400',    hex: '#a855f7', glowRgb: '168, 85, 247',  radius: 5.5, pulseFreq: 1.0, icon: <CircleDot size={13} /> },
  claim:    { label: 'Claim',    color: 'text-zinc-400',    hex: '#38bdf8', glowRgb: '56, 189, 248',  radius: 3.5, pulseFreq: 0.9, icon: <CircleDot size={13} /> },
  source:   { label: 'Source',   color: 'text-emerald-400', hex: '#64748B', glowRgb: '100, 116, 139', radius: 3, pulseFreq: 0.5, icon: <FileText size={13} /> },
  conflict: { label: 'Conflict', color: 'text-rose-400',    hex: '#EF4444', glowRgb: '239, 68, 68',   radius: 5, pulseFreq: 2.5, icon: <Zap size={13} /> },
};

export function resolveEntityGroup(node: Partial<GraphNode> & { group?: string, kind?: string, is_active?: boolean }): string {
  if (node.is_active === false) return 'conflict';
  if (node.group === 'insight' || node.kind === 'insight') return 'insight';
  if (node.group === 'decision' || node.kind === 'decision') return 'decision';
  if (node.group === 'source' || node.kind === 'source') return 'source';
  if (node.group === 'entity' || node.kind === 'entity') return 'entity';
  return 'claim';
}
