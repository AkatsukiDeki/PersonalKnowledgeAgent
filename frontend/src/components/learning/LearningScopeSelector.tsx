import React, { useState, useEffect } from 'react';
import { Folder, Globe, Target, Briefcase, ChevronDown, Check } from 'lucide-react';
import { sourcesApi, FolderTreeNode } from '../../api/sources';
import { GenerateRoadmapRequest } from '../../api/learning';

interface LearningScopeSelectorProps {
  onGenerate: (req: GenerateRoadmapRequest) => void;
  isGenerating: boolean;
}

const DOMAINS = ['STUDY', 'SECURITY', 'DEV', 'MUSIC', 'ENGINEERING', 'ARCHITECTURE'];

export function LearningScopeSelector({ onGenerate, isGenerating }: LearningScopeSelectorProps) {
  const [folderTree, setFolderTree] = useState<Record<string, FolderTreeNode>>({});
  const [localFolders, setLocalFolders] = useState<string[]>([]);
  const [allPaths, setAllPaths] = useState<string[]>([]);
  const [sources, setSources] = useState<{id: string, title: string}[]>([]);
  
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [targetRole, setTargetRole] = useState('');
  const [targetGoal, setTargetGoal] = useState('');
  
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const res = await sourcesApi.getFolderTree();
        setFolderTree(res.children);
      } catch (err) {
        console.error("Failed to fetch folder tree", err);
      }
      try {
        const srcRes = await sourcesApi.getSources();
        setSources(srcRes.map(s => ({id: s.id, title: s.title})));
      } catch (err) {
        console.error("Failed to fetch sources", err);
      }
    };
    fetchFolders();
    
    try {
      const stored = localStorage.getItem("pka_custom_folders");
      if (stored) {
        setLocalFolders(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const paths = new Set<string>();
    
    const extractPaths = (node: Record<string, FolderTreeNode>, prefix: string = "") => {
      for (const [name, child] of Object.entries(node)) {
        const fullPath = prefix ? `${prefix}/${name}` : name;
        paths.add(fullPath);
        extractPaths(child.children, fullPath);
      }
    };
    extractPaths(folderTree);
    
    localFolders.forEach(f => {
      const parts = f.split('/');
      let current = "";
      parts.forEach(p => {
        current = current ? `${current}/${p}` : p;
        paths.add(current);
      });
    });
    
    setAllPaths(Array.from(paths).sort());
  }, [folderTree, localFolders]);

  const toggleDomain = (domain: string) => {
    setSelectedDomains(prev => 
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    );
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSourceIds(prev => 
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  };

  const handleGenerate = () => {
    onGenerate({
      scope: {
        source_ids: selectedSourceIds,
        domains: selectedDomains,
        folder: selectedFolder,
        recursive: true
      },
      target_role: targetRole.trim() || undefined,
      target_goal: targetGoal.trim() || undefined,
      preferred_depth: 3
    });
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-zinc-200">Параметры обучения</h3>
      
      {/* Folder Selection */}
      <div className="relative">
        <label className="text-xs text-zinc-400 mb-1 block flex items-center gap-1"><Folder size={12}/> Контекст (Папка)</label>
        <button
          onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
          className="w-full flex items-center justify-between bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:border-indigo-500/50 transition"
        >
          <span className="truncate">{selectedFolder || 'Все папки'}</span>
          <ChevronDown size={14} className="text-zinc-500" />
        </button>
        
        {isFolderDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-white/10 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
            <button
              onClick={() => { setSelectedFolder(null); setIsFolderDropdownOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 text-zinc-300 flex items-center gap-2"
            >
              {selectedFolder === null && <Check size={12} className="text-indigo-400" />}
              <span className={selectedFolder === null ? 'font-medium text-indigo-300' : ''}>Все папки</span>
            </button>
            {allPaths.map(path => (
              <button
                key={path}
                onClick={() => { setSelectedFolder(path); setIsFolderDropdownOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 text-zinc-300 flex items-center gap-2"
              >
                {selectedFolder === path && <Check size={12} className="text-indigo-400" />}
                <span className={selectedFolder === path ? 'font-medium text-indigo-300' : ''}>{path}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Domain Selection */}
      <div>
        <label className="text-xs text-zinc-400 mb-2 block flex items-center gap-1"><Globe size={12}/> Домены</label>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map(domain => {
            const isActive = selectedDomains.includes(domain);
            return (
              <button
                key={domain}
                onClick={() => toggleDomain(domain)}
                className={`text-xs px-2 py-1 rounded-full border transition ${
                  isActive 
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
                    : 'bg-transparent border-white/10 text-zinc-400 hover:bg-white/5 hover:border-white/20'
                }`}
              >
                {domain}
              </button>
            );
          })}
        </div>
      </div>

      {/* Explicit Sources Selection */}
      {sources.length > 0 && (
        <div>
          <label className="text-xs text-zinc-400 mb-2 block flex items-center gap-1">Файлы (опционально)</label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
            {sources.map(src => {
              const isActive = selectedSourceIds.includes(src.id);
              return (
                <button
                  key={src.id}
                  onClick={() => toggleSource(src.id)}
                  className={`text-[10px] px-2 py-1 rounded border transition truncate max-w-[150px] ${
                    isActive 
                      ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
                      : 'bg-transparent border-white/10 text-zinc-400 hover:bg-white/5 hover:border-white/20'
                  }`}
                  title={src.title}
                >
                  {src.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Target Role & Goal */}
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block flex items-center gap-1"><Briefcase size={12}/> Целевая роль (Role)</label>
          <input
            value={targetRole}
            onChange={e => setTargetRole(e.target.value)}
            placeholder="Например: Senior DevOps Engineer"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block flex items-center gap-1"><Target size={12}/> Цель (Goal)</label>
          <input
            value={targetGoal}
            onChange={e => setTargetGoal(e.target.value)}
            placeholder="Например: Понять как работает Git Rebase"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isGenerating ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Генерация...</>
        ) : 'Сгенерировать План'}
      </button>
    </div>
  );
}
