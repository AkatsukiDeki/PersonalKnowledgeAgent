import React, { useState } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronDown, Trash2, Home, FolderPlus } from "lucide-react";
import { FolderTreeNode, sourcesApi } from "../../api/sources";

/**
 * Merges backend tree (folders with real files) with locally-created
 * virtual empty folders so they persist even with no files in DB.
 */
function mergeLocalFolders(
  tree: Record<string, FolderTreeNode>,
  localFolders: string[]
): Record<string, FolderTreeNode> {
  const merged: Record<string, FolderTreeNode> = JSON.parse(JSON.stringify(tree));
  for (const fullPath of localFolders) {
    const segments = fullPath.split("/");
    let node = merged;
    for (const seg of segments) {
      if (!node[seg]) node[seg] = { count: 0, children: {} };
      node = node[seg].children;
    }
  }
  return merged;
}

interface FolderTreeProps {
  tree: Record<string, FolderTreeNode>;
  selectedFolder: string | null;
  onSelect: (folder: string | null) => void;
  onRefresh: () => void;
  localFolders: string[];
  onAddLocalFolder: (path: string) => void;
  onRemoveLocalFolder: (path: string) => void;
}

interface FolderNodeProps {
  name: string;
  node: FolderTreeNode;
  path: string;
  depth: number;
  selectedFolder: string | null;
  onSelect: (folder: string | null) => void;
  onRefresh: () => void;
  onAddLocalFolder: (path: string) => void;
  onRemoveLocalFolder: (path: string) => void;
  localFolders: string[];
}

const MAX_DEPTH = 4;

function FolderNodeView({
  name, node, path, depth, selectedFolder, onSelect, onRefresh,
  onAddLocalFolder, onRemoveLocalFolder, localFolders
}: FolderNodeProps) {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const hasChildren = Object.keys(node.children).length > 0;
  const isSelected = selectedFolder === path;
  const isVirtual = node.count === 0 && !hasChildren;

  const handleCreateSubfolder = () => {
    if (!newName.trim()) return;
    const subPath = `${path}/${newName.trim()}`;
    onAddLocalFolder(subPath);
    onSelect(subPath);
    setIsCreating(false);
    setNewName("");
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (isVirtual) {
        onRemoveLocalFolder(path);
        onSelect(null);
      } else {
        await sourcesApi.deleteFolder(path);
        onRefresh();
        onSelect(null);
      }
    } catch (err: any) {
      alert(err?.detail || err?.message || "Folder not empty");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="select-none">
      <div
        title={path}
        className={`group flex items-center gap-1 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
          isSelected
            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${6 + depth * 12}px`, paddingRight: "6px" }}
        onClick={() => { onSelect(path); setIsOpen(o => !o); }}
      >
        {/* Toggle */}
        <span
          className="w-4 h-4 flex items-center justify-center text-zinc-600 hover:text-zinc-400 shrink-0"
          onClick={e => { e.stopPropagation(); setIsOpen(o => !o); }}
        >
          {hasChildren
            ? (isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : <span className="w-3" />
          }
        </span>

        {/* Folder icon */}
        {isOpen && hasChildren
          ? <FolderOpen size={13} className="shrink-0 text-amber-400/70" />
          : <Folder size={13} className={`shrink-0 ${isVirtual ? "text-amber-400/25" : "text-amber-400/50"}`} />
        }

        {/* Name */}
        <span className="flex-1 text-xs font-medium min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {name}
        </span>

        {/* Count */}
        <span className="text-[10px] text-zinc-600 shrink-0 ml-0.5">
          {isVirtual ? <span className="italic text-zinc-700">∅</span> : node.count}
        </span>

        {/* Add subfolder button */}
        {depth < MAX_DEPTH - 1 && (
          <button
            title="Создать вложенную папку"
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-zinc-600 hover:text-zinc-300 transition shrink-0"
            onClick={e => { e.stopPropagation(); setIsCreating(true); setIsOpen(true); }}
          >
            <FolderPlus size={11} />
          </button>
        )}

        {/* Delete button */}
        <button
          title={isVirtual ? "Удалить пустую папку" : "Удалить папку (нужно перенести файлы)"}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-zinc-700 hover:text-red-400 transition shrink-0"
          onClick={e => { e.stopPropagation(); handleDelete(); }}
          disabled={isDeleting}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Inline creation input */}
      {isCreating && (
        <div
          className="flex items-center gap-1 py-1"
          style={{ paddingLeft: `${6 + (depth + 1) * 12 + 18}px` }}
        >
          <Folder size={11} className="text-amber-400/40 shrink-0" />
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleCreateSubfolder();
              if (e.key === "Escape") { setIsCreating(false); setNewName(""); }
            }}
            placeholder="Имя папки"
            className="flex-1 min-w-0 bg-transparent border-b border-indigo-500/50 text-xs text-zinc-200 outline-none px-1 py-0.5"
          />
        </div>
      )}

      {/* Children */}
      {isOpen && hasChildren && (
        <div>
          {Object.entries(node.children)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([childName, childNode]) => (
              <FolderNodeView
                key={childName}
                name={childName}
                node={childNode}
                path={`${path}/${childName}`}
                depth={depth + 1}
                selectedFolder={selectedFolder}
                onSelect={onSelect}
                onRefresh={onRefresh}
                onAddLocalFolder={onAddLocalFolder}
                onRemoveLocalFolder={onRemoveLocalFolder}
                localFolders={localFolders}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  tree, selectedFolder, onSelect, onRefresh,
  localFolders, onAddLocalFolder, onRemoveLocalFolder
}: FolderTreeProps) {
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState("");

  const handleCreateRoot = () => {
    if (!newRootName.trim()) return;
    onAddLocalFolder(newRootName.trim());
    onSelect(newRootName.trim());
    setIsCreatingRoot(false);
    setNewRootName("");
  };

  const mergedTree = mergeLocalFolders(tree, localFolders);

  return (
    <div className="flex flex-col gap-0.5">
      {/* Root item */}
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
          selectedFolder === null
            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        }`}
        onClick={() => onSelect(null)}
      >
        <Home size={13} className="shrink-0" />
        <span className="flex-1 text-xs font-medium">Все источники</span>
        <button
          title="Новая папка"
          className="p-0.5 rounded hover:bg-white/10 text-zinc-600 hover:text-zinc-300 transition shrink-0"
          onClick={e => { e.stopPropagation(); setIsCreatingRoot(true); }}
        >
          <FolderPlus size={11} />
        </button>
      </div>

      {/* Root creation input */}
      {isCreatingRoot && (
        <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: "22px" }}>
          <Folder size={11} className="text-amber-400/40 shrink-0" />
          <input
            autoFocus
            value={newRootName}
            onChange={e => setNewRootName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleCreateRoot();
              if (e.key === "Escape") { setIsCreatingRoot(false); setNewRootName(""); }
            }}
            placeholder="Имя папки"
            className="flex-1 min-w-0 bg-transparent border-b border-indigo-500/50 text-xs text-zinc-200 outline-none px-1 py-0.5"
          />
        </div>
      )}

      {/* Tree nodes */}
      {Object.entries(mergedTree)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, node]) => (
          <FolderNodeView
            key={name}
            name={name}
            node={node}
            path={name}
            depth={0}
            selectedFolder={selectedFolder}
            onSelect={onSelect}
            onRefresh={onRefresh}
            onAddLocalFolder={onAddLocalFolder}
            onRemoveLocalFolder={onRemoveLocalFolder}
            localFolders={localFolders}
          />
        ))}
    </div>
  );
}
