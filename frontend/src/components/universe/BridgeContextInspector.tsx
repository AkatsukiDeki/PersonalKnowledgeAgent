import React, { useEffect, useState } from 'react';
import { graphApi, BridgeContextResponse } from '../../api/graph';
import { X, ExternalLink, Activity, ArrowRight, Loader2, GitMerge, Download, Copy, Check, FileText } from 'lucide-react';
import {
  buildConstellationMarkdown,
  copyToClipboard,
  downloadMarkdownFile,
  ExportSynthesisData,
} from '../../utils/exportMarkdown';

interface Props {
  domainA: string;
  domainB: string;
  onClose: () => void;
  onExplainConnection?: (bridgeId: string, relationType: string) => void;
}

export const BridgeContextInspector: React.FC<Props> = ({ domainA, domainB, onClose, onExplainConnection }) => {
  const [data, setData] = useState<BridgeContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBridge, setExpandedBridge] = useState<string | null>(null);

  useEffect(() => {
    const fetchContext = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await graphApi.getBridgeContext(domainA, domainB, 5);
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Error fetching bridge context');
      } finally {
        setLoading(false);
      }
    };
    fetchContext();
  }, [domainA, domainB]);

  return (
    <div className="absolute right-6 top-24 w-[400px] max-h-[calc(100vh-120px)] flex flex-col bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <GitMerge size={16} className="text-indigo-400" />
          <h3 className="text-sm font-bold text-white tracking-wide">Bridge Context</h3>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
        <div className="flex items-center justify-center gap-3 text-xs font-mono">
          <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 truncate max-w-[140px]">{domainA}</span>
          <ArrowRight size={14} className="text-zinc-500 shrink-0" />
          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 truncate max-w-[140px]">{domainB}</span>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500 gap-2">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
            <span className="text-xs">Analyzing structural bridges...</span>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-950/50 border border-red-900/50 rounded-lg p-3">
            {error}
          </div>
        )}

        {!loading && data && (
          <>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-zinc-400">Total discovered bridges:</span>
              <span className="font-bold text-zinc-200">{data.total_bridges}</span>
            </div>

            {data.total_bridges === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                No direct connections found between these domains.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.top_bridges.map((bridge) => {
                  const isExpanded = expandedBridge === bridge.bridge_id;
                  return (
                    <div key={bridge.bridge_id} className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30">
                      <div 
                        className="p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors flex flex-col gap-2"
                        onClick={() => setExpandedBridge(isExpanded ? null : bridge.bridge_id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500 border border-amber-900/50 bg-amber-950/30 px-1.5 py-0.5 rounded">
                            {bridge.relation_type}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            Score: {bridge.evidence_score.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-300 line-clamp-2">
                          <span className="text-indigo-300 font-medium">A:</span> {bridge.source_claim.content}
                        </div>
                        <div className="text-xs text-zinc-300 line-clamp-2">
                          <span className="text-emerald-300 font-medium">B:</span> {bridge.target_claim.content}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="p-3 border-t border-zinc-800 bg-black/40 flex flex-col gap-3">
                          {bridge.supporting_snippet && (
                            <div className="text-xs text-zinc-400 italic border-l-2 border-zinc-700 pl-2">
                              "{bridge.supporting_snippet}"
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <ExternalLink size={10} />
                              <span className="truncate">Source A: {bridge.source_claim.source_title}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <ExternalLink size={10} />
                              <span className="truncate">Source B: {bridge.target_claim.source_title}</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onExplainConnection) onExplainConnection(bridge.bridge_id, bridge.relation_type);
                            }}
                            className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded text-xs transition-colors"
                          >
                            <Activity size={12} />
                            Explain Connection (Copilot)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {data && !loading && (
        <div className="px-4 pb-4">
          <BridgeExportActions context={data} />
        </div>
      )}
    </div>
  );
};

interface BridgeExportActionsProps {
  context: BridgeContextResponse;
  synthesisData?: ExportSynthesisData;
}

export const BridgeExportActions: React.FC<BridgeExportActionsProps> = ({
  context,
  synthesisData,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const md = buildConstellationMarkdown(context, synthesisData);
    const success = await copyToClipboard(md);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const md = buildConstellationMarkdown(context, synthesisData);
    const filename = `Analysis_${context.domain_a}_${context.domain_b}_${new Date().toISOString().split('T')[0]}.md`;
    downloadMarkdownFile(filename, md);
  };

  return (
    <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
        <FileText className="w-3.5 h-3.5 text-zinc-600" />
        <span>Obsidian Markdown</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-all shadow-sm"
          title="Скопировать Markdown с метаданными"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 transition-all shadow-sm"
          title="Скачать .md файл"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export .md</span>
        </button>
      </div>
    </div>
  );
};
