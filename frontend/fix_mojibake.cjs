const fs = require('fs');
const iconv = require('iconv-lite');
const filePath = 'src/components/kinetics/KineticsCalendar.tsx';
let text = fs.readFileSync(filePath, 'utf8');

text = text.replace(/^\uFEFF/, '');

const charsToBytes = {};
for(let i=0; i<256; i++) {
  const char = iconv.decode(Buffer.from([i]), 'cp1251');
  charsToBytes[char] = i;
}

// Add Latin-1 control characters mapping to their byte values directly
for(let i=0x80; i<=0x9f; i++) {
  charsToBytes[String.fromCharCode(i)] = i;
}

const cp1252_extras = {
  '\u02DC': 0x98, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, '\u009D': 0x9D, 'ž': 0x9E, 'Ÿ': 0x9F,
  'Ђ': 0x80, 'Ѓ': 0x81, '‚': 0x82, 'ѓ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '€': 0x88, '‰': 0x89,
  'Љ': 0x8A, '‹': 0x8B, 'Њ': 0x8C, 'Ќ': 0x8D, 'Ћ': 0x8E, 'Џ': 0x8F, 'ђ': 0x90, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97
};

for (const [char, byteVal] of Object.entries(cp1252_extras)) {
  charsToBytes[char] = byteVal;
}

const regex = /[^\x00-\x7F]+/g;
let errorCount = 0;
let fixedText = text.replace(regex, (match) => {
  let bytes = [];
  let hasError = false;
  for(let i=0; i<match.length; i++) {
    const b = charsToBytes[match[i]];
    if (b === undefined) {
      hasError = true;
      break;
    }
    bytes.push(b);
  }
  
  if (hasError) {
    errorCount++;
    return match;
  }
  
  const clean = iconv.decode(Buffer.from(bytes), 'utf8');
  if (clean.includes('\uFFFD') || clean.includes('?')) {
    errorCount++;
    return match;
  }
  return clean;
});

console.log('Errors:', errorCount);
fs.writeFileSync(filePath, fixedText, 'utf8');
console.log('File written successfully.');
