import re

path = r'c:\Users\Andrey\PycharmProjects\PKA\frontend\src\components\kinetics\OverloadCharts.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

patch = """
  // Normalize muscle groups (lowercase, map aliases to standard names)
  const normalizeMuscle = (m: string) => {
    const s = m.toLowerCase().trim();
    if (s.includes('бедро') || s.includes('бедра') || s.includes('ноги')) return 'Ноги';
    if (s.includes('грудь') || s.includes('грудные')) return 'Грудь';
    if (s.includes('спина') || s.includes('широчайшие') || s.includes('лопатки')) return 'Спина';
    if (s.includes('плечи') || s.includes('дельты')) return 'Плечи';
    if (s.includes('бицепс')) return 'Бицепс';
    if (s.includes('трицепс')) return 'Трицепс';
    if (s.includes('кор') || s.includes('пресс')) return 'Кор';
    if (s.includes('шея')) return 'Шея';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const normalizedTonnage = data.weekly_tonnage.reduce((acc, curr) => {
    const norm = normalizeMuscle(curr.muscle_group);
    const existing = acc.find(t => t.week_start === curr.week_start && t.muscle_group === norm);
    if (existing) {
      existing.tonnage_kg += curr.tonnage_kg;
    } else {
      acc.push({ ...curr, muscle_group: norm });
    }
    return acc;
  }, [] as typeof data.weekly_tonnage);

  // Weekly tonnage aggregation
  const weeks = Array.from(new Set(normalizedTonnage.map(t => t.week_start))).sort();
  const muscleGroups = Array.from(new Set(normalizedTonnage.map(t => t.muscle_group)));
"""

content = content.replace(
    "  // Weekly tonnage aggregation\n  const weeks = Array.from(new Set(data.weekly_tonnage.map(t => t.week_start))).sort();\n  const muscleGroups = Array.from(new Set(data.weekly_tonnage.map(t => t.muscle_group)));",
    patch.strip()
)

content = content.replace("data.weekly_tonnage.filter", "normalizedTonnage.filter")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched!")
