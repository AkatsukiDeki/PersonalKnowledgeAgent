import React, { useState, useEffect } from 'react';
import { BookOpen, Bookmark, Link2, Plus, Brain, Calendar, Trash2 } from 'lucide-react';

export const KineticsJournal: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'debrief' | 'research'>('debrief');
  const [isSaving, setIsSaving] = useState(false);

  // Логи дня — загружаются из бэкенда
  const [logs, setLogs] = useState<{
    id: string;
    date: string;
    rpe: number;
    energy: number;
    notes: string;
    lessons: string;
  }[]>([]);

  // Загрузка из бэкенда при монтировании
  useEffect(() => {
    fetch('/api/v1/kinetics/journal/logs', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setLogs(data.map(item => ({
            id: String(item.id),
            date: new Date(item.log_date || item.created_at).toLocaleDateString('ru-RU'),
            rpe: item.rpe_overall ?? 7,
            energy: item.energy_level ?? 8,
            notes: item.notes || '',
            lessons: item.lessons_learned || ''
          })));
        }
      })
      .catch(err => console.error('Ошибка загрузки логов дневника:', err));
  }, []);

  // База исследований — загружаются из бэкенда
  const [researches, setResearches] = useState<{
    id: string;
    title: string;
    source: string;
    url: string;
    takeaway: string;
    tags: string[];
  }[]>([]);

  // Загрузка исследований из бэкенда при монтировании
  useEffect(() => {
    fetch('/api/v1/kinetics/journal/researches', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setResearches(data.map(r => ({
            id: String(r.id),
            title: r.title || 'Без названия',
            source: r.source_url || 'PubMed',
            url: r.source_url || '',
            takeaway: r.key_takeaways || '',
            tags: Array.isArray(r.tags) ? r.tags : ['Исследование']
          })));
        }
      })
      .catch(err => console.error('Ошибка загрузки исследований:', err));
  }, []);

  // Стейты форм
  const [newLogNotes, setNewLogNotes] = useState('');
  const [newLogLessons, setNewLogLessons] = useState('');
  const [newResTitle, setNewResTitle] = useState('');
  const [newResSource, setNewResSource] = useState('');
  const [newResTakeaway, setNewResTakeaway] = useState('');

  const handleSaveLog = async () => {
    if (!newLogNotes.trim()) return;
    setIsSaving(true);
    const payload = {
      rpe_overall: 7,
      energy_level: 8,
      notes: newLogNotes,
      lessons_learned: newLogLessons
    };
    try {
      const res = await fetch('/api/v1/kinetics/journal/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const saved = await res.json();
        const newEntry = {
          id: String(saved.id || Date.now()),
          date: new Date(saved.log_date || saved.created_at || Date.now()).toLocaleDateString('ru-RU'),
          rpe: saved.rpe_overall ?? 7,
          energy: saved.energy_level ?? 8,
          notes: saved.notes || newLogNotes,
          lessons: saved.lessons_learned || newLogLessons
        };
        setLogs(prev => [newEntry, ...prev]);
      } else {
        // Фолбэк: добавить локально с реальной датой
        setLogs(prev => [{
          id: Date.now().toString(),
          date: new Date().toLocaleDateString('ru-RU'),
          rpe: 7,
          energy: 8,
          notes: newLogNotes,
          lessons: newLogLessons
        }, ...prev]);
      }
    } catch {
      setLogs(prev => [{
        id: Date.now().toString(),
        date: new Date().toLocaleDateString('ru-RU'),
        rpe: 7,
        energy: 8,
        notes: newLogNotes,
        lessons: newLogLessons
      }, ...prev]);
    } finally {
      setNewLogNotes('');
      setNewLogLessons('');
      setIsSaving(false);
    }
  };

  const handleDeleteResearch = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/kinetics/journal/researches/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setResearches(prev => prev.filter(r => r.id !== id));
      }
    } catch (err) {
      console.error('Ошибка удаления исследования:', err);
    }
  };

  return (
    <div className="h-full w-full bg-[#030712] border border-cyan-950/80 rounded-xl p-5 flex flex-col gap-4 font-mono text-slate-200 overflow-y-auto custom-scrollbar">
      {/* Хедер раздела */}
      <div className="flex justify-between items-center border-b border-cyan-950 pb-3">
        <div className="flex items-center gap-2 text-cyan-400 font-bold">
          <BookOpen className="w-5 h-5" />
          <span>БАЗА ЗНАНИЙ И ДНЕВНИК ПРАКТИКИ // EVIDENCE & DEBRIEF</span>
        </div>

        {/* Переключатель вкладок */}
        <div className="flex bg-[#090d16] p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveSubTab('debrief')}
            className={`px-3 py-1 rounded transition-all ${
              activeSubTab === 'debrief'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ИТОГИ ДНЯ И ВЫВОДЫ
          </button>
          <button
            onClick={() => setActiveSubTab('research')}
            className={`px-3 py-1 rounded transition-all ${
              activeSubTab === 'research'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ИССЛЕДОВАНИЯ И ИСТОЧНИКИ
          </button>
        </div>
      </div>

      {/* 1. ВКЛАДКА: ИТОГИ ДНЯ */}
      {activeSubTab === 'debrief' && (
        <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
          {/* Форма фиксации дня */}
          <div className="bg-[#090d16] border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> ЗАФИКСИРОВАТЬ ИТОГИ СЕГОДНЯ
            </span>

            <div>
              <label className="text-[10px] text-slate-500">КАК ПРОШЛА СЕССИЯ / САМОЧУВСТВИЕ</label>
              <textarea
                rows={3}
                value={newLogNotes}
                onChange={(e) => setNewLogNotes(e.target.value)}
                placeholder="Ощущения в мышцах, суставах, соблюдение пауз..."
                className="w-full bg-[#030712] border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500 mt-1"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-500">КЛЮЧЕВОЙ ИНСАЙТ / ЧТО УЛУЧШИТЬ</label>
              <textarea
                rows={2}
                value={newLogLessons}
                onChange={(e) => setNewLogLessons(e.target.value)}
                placeholder="Что скорректировать на следующей неделе..."
                className="w-full bg-[#030712] border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500 mt-1"
              />
            </div>

            <button
              onClick={handleSaveLog}
              disabled={isSaving}
              className="mt-auto py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 rounded text-xs font-bold transition-all shadow-[0_0_12px_rgba(6,182,212,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Сохранение...' : 'Зафиксировать в журнал'}
            </button>
          </div>

          {/* Список прошлых отчетов */}
          <div className="col-span-2 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            {logs.map((log) => (
              <div key={log.id} className="bg-[#090d16] border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs border-b border-slate-800/80 pb-2">
                  <span className="font-bold text-cyan-400">{log.date}</span>
                  <div className="flex gap-2 text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      RPE: {log.rpe}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Энергия: {log.energy}/10
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mt-1">{log.notes}</p>

                {log.lessons && (
                  <div className="mt-1 p-2 rounded bg-[#030712] border border-slate-800/80 text-[11px] text-cyan-300 flex items-start gap-2">
                    <Brain className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>{log.lessons}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. ВКЛАДКА: ИССЛЕДОВАНИЯ И ИСТОЧНИКИ */}
      {activeSubTab === 'research' && (
        <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
          {/* КОМПАКТНАЯ ФОРМА ДОБАВЛЕНИЯ ИССЛЕДОВАНИЯ */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newResTitle.trim()) return;

              const payload = {
                title: newResTitle,
                source_url: newResSource || 'Личный конспект',
                key_takeaways: newResTakeaway,
                tags: ['Биомеханика', 'Гипертрофия']
              };

              try {
                // Отправка в бэкенд
                const res = await fetch('/api/v1/kinetics/journal/researches', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                if (res.ok) {
                  const saved = await res.json();
                  setResearches([saved, ...researches]);
                } else {
                  // Локальный фоллбек
                  setResearches([{ id: Date.now().toString(), ...payload, source: payload.source_url, url: payload.source_url, takeaway: payload.key_takeaways } as any, ...researches]);
                }
              } catch {
                setResearches([{ id: Date.now().toString(), ...payload, source: payload.source_url, url: payload.source_url, takeaway: payload.key_takeaways } as any, ...researches]);
              }

              setNewResTitle('');
              setNewResSource('');
              setNewResTakeaway('');
            }}
            className="bg-[#090d16] border border-cyan-950/80 rounded-xl p-3.5 flex flex-col gap-2.5 font-mono text-xs shadow-[0_0_20px_rgba(3,7,18,0.6)]"
          >
            <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Bookmark className="w-3.5 h-3.5" />
              <span>ДОБАВИТЬ ИССЛЕДОВАНИЕ / СТАТЬЮ</span>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase">ТЕМА ИЛИ НАЗВАНИЕ СТАТЬИ</label>
              <input
                type="text"
                required
                placeholder="Например: Влияние темпа на гипертрофию..."
                value={newResTitle}
                onChange={(e) => setNewResTitle(e.target.value)}
                className="w-full bg-[#030712] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500 mt-1"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase">ИСТОЧНИК / ССЫЛКА / PUBMED ID</label>
              <input
                type="text"
                placeholder="Schoenfeld 2024 / pubmed.ncbi.nlm.nih.gov/..."
                value={newResSource}
                onChange={(e) => setNewResSource(e.target.value)}
                className="w-full bg-[#030712] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500 mt-1"
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="text-[10px] text-slate-500 uppercase">ГЛАВНЫЙ ВЫВОД (ПРИМЕНИМО К ПРАКТИКЕ)</label>
              <textarea
                rows={3}
                required
                placeholder="Что доказано: пауза 2 сек в растяжении снижает травматизм на 30%..."
                value={newResTakeaway}
                onChange={(e) => setNewResTakeaway(e.target.value)}
                className="w-full flex-1 bg-[#030712] border border-slate-800 rounded p-2 text-slate-200 outline-none focus:border-cyan-500 mt-1 resize-none"
              />
            </div>

            {/* Кнопка сохранения — гарантированно видна */}
            <button
              type="submit"
              className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded text-xs transition-all shadow-[0_0_12px_rgba(6,182,212,0.35)] flex items-center justify-center gap-1.5 mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              СОХРАНИТЬ В БАЗУ ЗНАНИЙ
            </button>
          </form>

          {/* Карточки исследований */}
          <div className="col-span-2 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            {researches.map((res) => (
              <div key={res.id} className="bg-[#090d16] border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div className="text-xs font-bold text-slate-100 flex-1 pr-2">{res.title}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex gap-1.5 flex-wrap">
                      {res.tags.map((t, idx) => (
                        <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {t}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => handleDeleteResearch(res.id)}
                      className="p-1 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded transition-colors"
                      title="Удалить исследование"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-cyan-500 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  <span>{res.source}</span>
                </div>

                <div className="mt-1 p-2.5 rounded bg-[#030712] border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
                  <span className="text-cyan-400 font-bold block text-[10px] mb-0.5">ВЫВОД ДЛЯ ПРОТОКОЛА:</span>
                  {res.takeaway}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
