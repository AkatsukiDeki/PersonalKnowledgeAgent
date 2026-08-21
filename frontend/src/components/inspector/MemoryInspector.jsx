import React from 'react';
import { motion } from 'framer-motion';
import { Activity, GitMerge, Link as LinkIcon, ExternalLink } from 'lucide-react';

export default function MemoryInspector({ data, onClose }) {
  // Варианты анимации для оркестрации появления элементов
  const containerVariants = {
    hidden: { opacity: 0, scale: 0.98, y: 10 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1], staggerChildren: 0.05 }
    },
    exit: { opacity: 0, scale: 0.98, y: 10, transition: { duration: 0.2 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }
  };

  return (
    <motion.div
      className="w-full max-w-md bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl text-slate-200 font-sans isolate relative overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Слабый градиентный шум на фоне инспектора */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-50 -z-10" />

      {/* HEADER */}
      <motion.div variants={itemVariants} className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase">
            Decision • {data?.id?.slice(0, 8) || 'SYS-892'}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <h2 className="text-2xl font-light tracking-tight leading-snug text-white/95">
          {data?.title || 'GitFlow for feature isolation'}
        </h2>
      </motion.div>

      {/* RATIONALE */}
      <motion.div variants={itemVariants} className="mb-6">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Why</h3>
        <p className="text-sm leading-relaxed text-white/70">
          {data?.rationale || 'Isolate risky changes from main branch to maintain stable deployment pipeline and prevent CI/CD bottlenecks.'}
        </p>
      </motion.div>

      {/* BENTO METRICS */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 flex flex-col justify-between h-24 hover:bg-white/[0.05] transition-colors">
          <Activity className="w-4 h-4 text-emerald-400/70 mb-2" />
          <div>
            <div className="text-lg font-mono font-medium text-white/90">0.91</div>
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-wide">Memory Score</div>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 flex flex-col justify-between h-24 hover:bg-white/[0.05] transition-colors">
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] mb-2 mt-1" />
          <div>
            <div className="text-sm font-medium text-white/90">ACTIVE</div>
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-wide">Lifecycle State</div>
          </div>
        </div>
      </motion.div>

      {/* EVOLUTION TIMELINE */}
      <motion.div variants={itemVariants} className="mb-6">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Evolution</h3>
        <div className="flex items-center text-sm font-mono text-white/60 bg-white/[0.02] border border-white/5 rounded-lg p-3">
          <span className="opacity-50 line-through">v1 (Trunk)</span>
          <GitMerge className="w-4 h-4 mx-3 text-white/20" />
          <span className="text-indigo-300">v2 (GitFlow)</span>
        </div>
      </motion.div>

      {/* CONNECTED ENTITIES */}
      <motion.div variants={itemVariants} className="mb-8">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Connected</h3>
        <ul className="space-y-2">
          {['7 Claims', '3 Sources', '2 Conversations'].map((item, i) => (
            <li key={i} className="flex items-center text-sm">
              <LinkIcon className="w-3 h-3 text-white/30 mr-3" />
              <span className="text-white/60 font-mono text-xs">{item}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* ACTIONS */}
      <motion.div variants={itemVariants} className="flex flex-col gap-2">
        <button className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-sm font-medium text-white transition-all flex items-center justify-center group">
          Open conversation
        </button>
        <button className="w-full py-2.5 px-4 bg-transparent hover:bg-white/5 border border-transparent rounded-lg text-sm font-medium text-white/50 hover:text-white/80 transition-all flex items-center justify-center">
          <ExternalLink className="w-3.5 h-3.5 mr-2 opacity-70" />
          Explore in universe
        </button>
      </motion.div>
    </motion.div>
  );
}