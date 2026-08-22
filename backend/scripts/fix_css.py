with open('frontend/src/styles/globals.css', 'rb') as f:
    content = f.read()

# We know the valid content ends at line 144 which ends before the UTF-16LE block.
# Let's search for the last valid brace '}' (line 144).
# We can decode the file ignoring errors, find the index of line 144, and slice.

text = content.decode('utf-8', errors='replace')
lines = text.split('\n')

valid_lines = []
for line in lines:
    if '\x00' in line or '4 8 = K 9' in line or 'w e b k i t' in line or '48=K9' in line:
        break
    valid_lines.append(line)

new_text = '\n'.join(valid_lines)
if not new_text.endswith('}'):
    new_text += '\n}'

# Add proper css
new_text += '''
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
'''

with open('frontend/src/styles/globals.css', 'wb') as f:
    f.write(new_text.encode('utf-8'))
print('Fixed CSS encoding')
