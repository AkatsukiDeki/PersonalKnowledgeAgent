const fs = require('fs');
let content = fs.readFileSync('frontend/src/styles/globals.css');
let text = content.toString('utf8');
let validLines = [];
let lines = text.split('\n');
for (let line of lines) {
    if (line.includes('\x00') || line.includes('4 8 = K 9') || line.includes('48=K9')) break;
    validLines.push(line);
}
let newText = validLines.join('\n');
if (!newText.endsWith('}')) newText += '\n}';

newText += `
/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
`;

fs.writeFileSync('frontend/src/styles/globals.css', newText);
console.log('Fixed CSS encoding using node');
