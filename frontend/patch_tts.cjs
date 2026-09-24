const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'chat', 'ChatWorkspace.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `        () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: streamBuffer, citations: currentCitations, isStreaming: false }
                : msg
            )
          );`;

const replacement = `        () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: streamBuffer, citations: currentCitations, isStreaming: false }
                : msg
            )
          );
          
          if (window.speechSynthesis && streamBuffer) {
            AudioQueueManager.getInstance().enqueue(async () => {
              return new Promise((resolve) => {
                const utterance = new SpeechSynthesisUtterance(streamBuffer);
                utterance.lang = 'ru-RU';
                utterance.rate = 1.1;
                const voices = window.speechSynthesis.getVoices();
                const ruVoice = voices.find(v => v.lang.includes('ru') && (v.name.includes('Google') || v.name.includes('Microsoft')));
                if (ruVoice) utterance.voice = ruVoice;
                
                utterance.onend = () => resolve();
                utterance.onerror = () => resolve();
                
                setTimeout(() => window.speechSynthesis.speak(utterance), 50);
              });
            });
          }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("TTS logic successfully injected.");
} else {
    console.log("Could not find the target string.");
}
