import sys

file_path = 'frontend/src/components/kinetics/KineticsCalendar.tsx'

with open(file_path, 'rb') as f:
    content = f.read()

try:
    decoded = content.decode('utf-8')
    if decoded.startswith('\ufeff'):
        decoded = decoded[1:]
    fixed = decoded.encode('cp1251').decode('utf-8')
    with open(file_path, 'w', encoding='utf-8') as f2:
        f2.write(fixed)
    print('Fixed successfully')
except Exception as e:
    print('Error:', e)
