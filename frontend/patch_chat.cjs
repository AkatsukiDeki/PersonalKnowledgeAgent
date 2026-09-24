const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'chat', 'ChatWorkspace.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Imports
if (!content.includes("import { AudioQueueManager }")) {
    content = content.replace(
        "import { CopilotTextarea } from './CopilotTextarea';",
        "import { CopilotTextarea } from './CopilotTextarea';\nimport { AudioQueueManager } from '../../utils/AudioQueue';\nimport { VoiceVisualizer } from './VoiceVisualizer';"
    );
}

// 3. Add wakeUpAudio function and isAudioActive
if (!content.includes("const wakeUpAudio")) {
    content = content.replace(
        "const [showHelpPopover, setShowHelpPopover] = useState(false);",
        `const [showHelpPopover, setShowHelpPopover] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  
  const wakeUpAudio = async () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      await ctx.resume();
      AudioQueueManager.getInstance().setAudioContext(ctx);
      setIsAudioActive(true);
      AudioQueueManager.getInstance().playSystemAlert([600, 800]); // Startup sound
    } catch (e) {
      console.error("Audio unlock failed", e);
    }
  };`
    );
}

// 4. Add UI for Activate Terminal
if (!content.includes("<VoiceVisualizer")) {
    content = content.replace(
        `<div className="flex-1 flex flex-col min-w-0 bg-transparent">`,
        `<div className="flex-1 flex flex-col min-w-0 bg-transparent">
        {/* Phase 3: Audio Toolbar */}
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4">
            {!isAudioActive ? (
              <button 
                onClick={wakeUpAudio}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 text-sm font-medium"
              >
                <AudioLines className="w-4 h-4" />
                Активировать терминал
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Voice Active
                </span>
                <VoiceVisualizer width={120} height={30} color="#34d399" />
              </div>
            )}
          </div>
        </div>`
    );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('ChatWorkspace.tsx patched via Node');
