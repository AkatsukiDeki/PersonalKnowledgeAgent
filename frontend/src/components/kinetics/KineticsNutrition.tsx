import React, { useState, useRef, useEffect } from 'react';
import { Utensils, Flame, Plus, Trash2, Camera, Edit3, Check, X, Loader2, ShieldCheck, Sparkles, Send, RefreshCw } from 'lucide-react';
import { kineticsApi, ScannedMealData } from '../../api/kinetics';

interface MealItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  time: string;
}

export const KineticsNutrition: React.FC<{ selectedDate?: Date }> = ({ selectedDate = new Date() }) => {
  const [targetCalories] = useState(2200);
  const [meals, setMeals] = useState<any[]>([]);
  const [isLoadingMeals, setIsLoadingMeals] = useState(true);

  const fetchMeals = async () => {
    setIsLoadingMeals(true);
    setMeals([]);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const data = await kineticsApi.getDailyNutrition(dateStr);
      setMeals(data.meals);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMeals(false);
    }
  };

  useEffect(() => {
    fetchMeals();
  }, [selectedDate]);

  // Inline edit state
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MealItem>>({});

  // Photo scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<ScannedMealData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Quick-add form state
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealCals, setNewMealCals] = useState('');
  const [newMealProt, setNewMealProt] = useState('');
  const [newMealTime, setNewMealTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  );

  // AI Nutritionist Chat State
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([
    { role: 'assistant', text: 'Анализ рациона активирован. Жду данные по приемам пищи или вопросы по балансу макросов.' }
  ]);

  useEffect(() => {
    kineticsApi.getChatHistory('nutrition').then((logs) => {
      if (logs && logs.length > 0) {
        const history: { role: 'user' | 'assistant', text: string }[] = logs.map((l: any) => ({
          role: l.role === 'user' ? 'user' : 'assistant',
          text: l.message
        }));
        if (history[0].text !== chatHistory[0].text) {
          setChatHistory([chatHistory[0], ...history]);
        } else {
          setChatHistory(history);
        }
      }
    }).catch(console.error);
  }, []);

  const totalCals = Math.round(meals.reduce((acc, m) => acc + m.calories, 0));
  const totalProt = parseFloat(meals.reduce((acc, m) => acc + m.protein, 0).toFixed(1));
  const totalFat = parseFloat(meals.reduce((acc, m) => acc + m.fat, 0).toFixed(1));
  const totalCarbs = parseFloat(meals.reduce((acc, m) => acc + m.carbs, 0).toFixed(1));

  useEffect(() => {
    kineticsApi.logBiometrics({
      calories_in: totalCals,
      protein_g: totalProt,
      notes: "Авто-синхронизация КБЖУ из нутрициолога"
    } as any).catch(err => console.error("Failed to sync biometrics", err));
  }, [totalCals, totalProt]);

  const handleStartEdit = (meal: MealItem) => {
    setEditingMealId(meal.id);
    setEditForm({ ...meal });
  };

  const handleSaveEdit = (id: string) => {
    setMeals(meals.map(m => m.id === id ? { ...m, ...editForm } as MealItem : m));
    setEditingMealId(null);
    setEditForm({});
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setIsScanning(true);
    setScannedResult(null);

    try {
      const data = await kineticsApi.scanMealPhoto(file);
      setScannedResult(data);
    } catch (err) {
      console.error(err);
      alert('Ошибка при анализе фото. Попробуйте ещё раз.');
      setPreviewUrl(null);
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApplyScannedMeal = async () => {
    if (!scannedResult) return;
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const payload = {
        meal_date: dateStr,
        time_str: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name: scannedResult.name,
        weight_g: scannedResult.weight_g ?? scannedResult.portion_weight_g ?? 200,
        calories: scannedResult.calories,
        protein: scannedResult.protein,
        fat: scannedResult.fat,
        carbs: scannedResult.carbs,
        ingredients: scannedResult.ingredients_detected?.map((i: any) => ({ name: i, weight_g: 0, protein: 0, fat: 0, carbs: 0 })) || []
      };
      await kineticsApi.addNutritionMeal(payload);
      await fetchMeals();
    } catch(e) { console.error(e); }
    setScannedResult(null);
    setPreviewUrl(null);
  };

  const handleDismissScan = () => {
    setScannedResult(null);
    setPreviewUrl(null);
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMealName.trim() || !newMealCals) return;
    setMeals(prev => [...prev, {
      id: Date.now().toString(),
      name: newMealName,
      calories: parseInt(newMealCals) || 0,
      protein: parseInt(newMealProt) || 0,
      fat: Math.round((parseInt(newMealCals) * 0.25) / 9),
      carbs: Math.round((parseInt(newMealCals) * 0.45) / 4),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setNewMealName('');
    setNewMealCals('');
    setNewMealProt('');
  };

  const handleSummarize = async () => {
    try {
      setIsSending(true);
      const insight = await kineticsApi.summarizeChat('nutrition');
      setChatHistory([
        {
          role: 'assistant',
          text: `Итоги подведены! История сброшена.\n\nИнсайт: ${insight.insight_text}`
        }
      ]);
    } catch (e) {
      console.error(e);
      setChatHistory(prev => [...prev, { role: 'assistant', text: 'Ошибка суммаризации' }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendNutritionMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsSending(true);

    try {
      const data = await kineticsApi.sendNutritionChatMessage({
        message: userMessage,
        meals,
        target_calories: targetCalories,
        current_weight: 100.7
      });
      
      let responseText = data.response;
      
      // Check for MEAL_ACTION mutation blocks
      const mutationRegex = /<<<MEAL_ACTION\s*([\s\S]*?)\s*MEAL_ACTION>>>/g;
      let match;
      while ((match = mutationRegex.exec(responseText)) !== null) {
        try {
          const mealData = JSON.parse(match[1]);
          const rawAction = (mealData.action || 'add').toLowerCase();
          const action = (rawAction === 'remove' || rawAction === 'delete' || rawAction === 'удалить') ? 'remove' : 
                         (rawAction === 'modify' || rawAction === 'update' || rawAction === 'изменить') ? 'modify' : 'add';
          
          if (action === 'remove') {
            if (mealData.id) {
              setMeals(prev => prev.filter(m => m.id !== mealData.id));
            } else if (mealData.name) {
              setMeals(prev => prev.filter(m => !m.name.toLowerCase().includes(mealData.name.toLowerCase()) && !mealData.name.toLowerCase().includes(m.name.toLowerCase())));
            }
          } else if (action === 'modify' && mealData.id) {
            setMeals(prev => prev.map(m => m.id === mealData.id ? { ...m, ...mealData } : m));
          } else if (action === 'add' || (!mealData.id && mealData.name && mealData.calories !== undefined)) {
            const newMeal: MealItem = {
              id: Date.now().toString() + Math.random().toString(36).substring(7),
              name: mealData.name || 'Новый прием пищи',
              calories: mealData.calories || 0,
              protein: mealData.protein || 0,
              fat: mealData.fat || 0,
              carbs: mealData.carbs || 0,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMeals(prev => [...prev, newMeal]);
          }
        } catch (e) {
          console.error("Failed to parse MEAL_ACTION JSON", e);
        }
      }
      responseText = responseText.replace(/<<<MEAL_ACTION\s*([\s\S]*?)\s*MEAL_ACTION>>>/g, '').trim();

      setChatHistory(prev => [...prev, { role: 'assistant', text: responseText }]);
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: 'assistant', text: 'Сбой соединения. Попробуйте еще раз.' }]);
    } finally {
      setIsSending(false);
    }
  };

  const caloriesPct = Math.min((totalCals / targetCalories) * 100, 100);

  return (
<div className="flex h-full gap-4 font-mono w-full">
  {/* ЛЕВАЯ КОЛОНКА: Дневник и КБЖУ */}
  <div className="flex-1 flex flex-col gap-4 min-w-0 bg-[#030712] border border-cyan-950/80 rounded-xl p-5 text-slate-200 overflow-y-auto custom-scrollbar">

      {/* ── Шапка ── */}
      <div className="flex justify-between items-center border-b border-cyan-950 pb-3 shrink-0">
        <div className="flex items-center gap-2 text-cyan-400 font-bold">
          <Utensils className="w-5 h-5" />
          <span>НУТРИТИВНЫЙ ПРОТОКОЛ // КБЖУ И РЕКОМПОЗИЦИЯ</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Скрытый input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          {/* Кнопка ручного добавления */}
          <button
            type="button"
            onClick={() => setIsAddFormOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-bold transition-all ${
              isAddFormOpen
                ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
            }`}
          >
            <Plus className="w-4 h-4" />
            ДОБАВИТЬ ВРУЧНУЮ
          </button>

          {/* Кнопка фото-сканера */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/50 text-cyan-300 rounded text-xs font-bold transition-all shadow-[0_0_12px_rgba(6,182,212,0.2)] disabled:opacity-50"
          >
            {isScanning ? (
              <><Loader2 className="w-4 h-4 animate-spin text-cyan-400" />СКАНИРОВАНИЕ...</>
            ) : (
              <><Camera className="w-4 h-4 text-cyan-400" />РАСПОЗНАТЬ ПО ФОТО</>
            )}
          </button>

          <div className="text-xs text-slate-400">
            ЦЕЛЕВОЙ ДЕФИЦИТ: <span className="text-cyan-400 font-bold">-400..-500 ККАЛ</span>
          </div>
        </div>
      </div>

      {/* ── Карточка результата сканирования ── */}
      {(isScanning || scannedResult) && (
        <div className="bg-[#090d16] border border-cyan-500/60 rounded-xl p-4 shadow-[0_0_24px_rgba(6,182,212,0.18)] shrink-0 animate-in fade-in duration-300">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-2">
              <Camera className="w-4 h-4 text-cyan-400" />
              AI-СКАНЕР БЛЮДА // GEMINI VISION
            </span>
            {!isScanning && (
              <button onClick={handleDismissScan} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {isScanning ? (
            <div className="flex items-center gap-4 py-2">
              {previewUrl && (
                <img src={previewUrl} alt="preview" className="w-20 h-20 object-cover rounded-lg border border-slate-700 shrink-0" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-cyan-400 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gemini Flash анализирует состав блюда...
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Определение ингредиентов, граммовок, расчёт КБЖУ...
                </div>
              </div>
            </div>
          ) : scannedResult && (
            <div className="flex gap-4">
              {/* Превью фото */}
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="meal"
                  className="w-24 h-24 object-cover rounded-lg border border-cyan-900/60 shrink-0"
                />
              )}

              {/* Данные распознавания */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-100 truncate">{scannedResult.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  {Array.isArray(scannedResult.ingredients_detected) ? scannedResult.ingredients_detected.join(' · ') : (scannedResult.ingredients_detected || '')}
                </div>

                {/* КБЖУ */}
                <div className="flex gap-3 mt-2">
                  <div className="text-center">
                    <div className="text-lg font-bold text-slate-100">{scannedResult.calories}</div>
                    <div className="text-[9px] text-slate-500">ккал</div>
                  </div>
                  <div className="w-px bg-slate-800" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-cyan-400">{scannedResult.protein}г</div>
                    <div className="text-[9px] text-slate-500">белок</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-amber-400">{scannedResult.fat}г</div>
                    <div className="text-[9px] text-slate-500">жиры</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-indigo-400">{scannedResult.carbs}г</div>
                    <div className="text-[9px] text-slate-500">углеводы</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-slate-400">{scannedResult.weight_g ?? scannedResult.portion_weight_g ?? 200}г</div>
                    <div className="text-[9px] text-slate-500">порция</div>
                  </div>
                </div>

                {/* Погрешность */}
                <div className="flex items-center gap-1 mt-2 text-[9px] text-slate-500">
                  <ShieldCheck className="w-3 h-3 text-slate-600" />
                  {scannedResult.confidence_note}
                </div>
              </div>

              {/* Кнопка применить */}
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={handleApplyScannedMeal}
                  className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-cyan-400 transition-all shadow-[0_0_12px_rgba(6,182,212,0.35)] whitespace-nowrap"
                >
                  ✓ В журнал
                </button>
                <button
                  onClick={handleDismissScan}
                  className="px-4 py-1.5 bg-transparent text-slate-500 hover:text-slate-300 rounded-lg text-xs border border-slate-800 transition-all"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Сводка КБЖУ ── */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            КАЛОРИИ <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {totalCals} <span className="text-xs text-slate-500">/ {targetCalories} ккал</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              style={{ width: `${caloriesPct}%` }}
              className={`h-full transition-all ${caloriesPct > 95 ? 'bg-rose-500' : 'bg-cyan-500'}`}
            />
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {totalCals < targetCalories
              ? `Дефицит: ${targetCalories - totalCals} ккал`
              : `Профицит: +${totalCals - targetCalories} ккал`}
          </div>
        </div>

        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">БЕЛКИ (2.0 г/кг сухой)</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{totalProt}г <span className="text-xs text-slate-500">/ 145г</span></div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
            <div style={{ width: `${Math.min((totalProt / 145) * 100, 100)}%` }} className="h-full bg-cyan-500" />
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">Защита от катаболизма</div>
        </div>

        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">ЖИРЫ (Гормональный фон)</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{totalFat}г <span className="text-xs text-slate-500">/ 65г</span></div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
            <div style={{ width: `${Math.min((totalFat / 65) * 100, 100)}%` }} className="h-full bg-amber-500" />
          </div>
          <div className="text-[10px] text-amber-500 mt-1">Омега-3 и МСТ</div>
        </div>

        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">УГЛЕВОДЫ (Гликоген)</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">{totalCarbs}г <span className="text-xs text-slate-500">/ 220г</span></div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
            <div style={{ width: `${Math.min((totalCarbs / 220) * 100, 100)}%` }} className="h-full bg-indigo-500" />
          </div>
          <div className="text-[10px] text-indigo-400 mt-1">Сложные углеводы</div>
        </div>
      </div>

      {/* ── Выпадающая форма ручного добавления ── */}
      {isAddFormOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newMealName.trim() || !newMealCals) return;
            const cals = parseInt(newMealCals) || 0;
            const prot = parseInt(newMealProt) || 0;
            setMeals(prev => [{
              id: Date.now().toString(),
              name: newMealName,
              calories: cals,
              protein: prot,
              fat: Math.round((cals * 0.25) / 9),
              carbs: Math.round((cals * 0.45) / 4),
              time: newMealTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }, ...prev]);
            setNewMealName('');
            setNewMealCals('');
            setNewMealProt('');
            setNewMealTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
            setIsAddFormOpen(false);
          }}
          className="bg-[#090d16] border border-cyan-500/40 rounded-xl p-3.5 flex flex-wrap items-end gap-3 shadow-[0_0_15px_rgba(6,182,212,0.15)] text-xs font-mono shrink-0"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] text-slate-400 mb-1">НАЗВАНИЕ БЛЮДА</label>
            <input
              type="text"
              placeholder="Например: Гречка с говядиной..."
              value={newMealName}
              onChange={(e) => setNewMealName(e.target.value)}
              autoFocus
              className="w-full bg-[#030712] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
            />
          </div>
          <div className="w-24">
            <label className="block text-[10px] text-slate-400 mb-1">КАЛОРИИ</label>
            <input
              type="number"
              placeholder="ккал"
              value={newMealCals}
              onChange={(e) => setNewMealCals(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
            />
          </div>
          <div className="w-24">
            <label className="block text-[10px] text-cyan-400 mb-1">БЕЛОК (Г)</label>
            <input
              type="number"
              placeholder="грамм"
              value={newMealProt}
              onChange={(e) => setNewMealProt(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
            />
          </div>
          <div className="w-24">
            <label className="block text-[10px] text-slate-500 mb-1">ВРЕМЯ</label>
            <input
              type="time"
              value={newMealTime}
              onChange={(e) => setNewMealTime(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500 [color-scheme:dark]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-cyan-500 text-slate-950 font-bold rounded hover:bg-cyan-400 transition-all shadow-[0_0_10px_rgba(6,182,212,0.3)]"
            >
              СОХРАНИТЬ
            </button>
            <button
              type="button"
              onClick={() => setIsAddFormOpen(false)}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-all"
            >
              ОТМЕНА
            </button>
          </div>
        </form>
      )}

      {/* ── Дневник приёмов пищи ── */}
      <div className="flex-1 bg-[#090d16] border border-slate-800 rounded-xl p-4 flex flex-col min-h-0">
        <div className="text-xs font-bold text-slate-300 border-b border-slate-800 pb-2 flex justify-between items-center shrink-0">
          <span>ДНЕВНИК ПРИЕМОВ ПИЩИ</span>
          <span className="text-[10px] text-cyan-400">{meals.length} ПРИЕМА</span>
        </div>

        
        <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 custom-scrollbar">
          {isLoadingMeals ? (
            <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center">
              <Loader2 className="w-5 h-5 animate-spin mb-2" />
              Загрузка рациона...
            </div>
          ) : meals.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">Нет приемов пищи за эту дату</div>
          ) : (
            meals.map((meal) => {

            const isEditing = editingMealId === meal.id;

            return (
              <div
                key={meal.id}
                className={`p-3 bg-[#030712] border rounded-lg transition-all text-xs ${
                  isEditing
                    ? 'border-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {isEditing ? (
                  /* ── Инлайн-режим редактирования ── */
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm.name ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      autoFocus
                      className="w-full bg-[#090d16] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
                      placeholder="Название блюда"
                    />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-500 mb-0.5">КАЛОРИИ</div>
                        <input
                          type="number"
                          value={editForm.calories ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, calories: parseInt(e.target.value) || 0 })}
                          className="w-full bg-[#090d16] border border-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-cyan-500 mb-0.5">БЕЛОК (г)</div>
                        <input
                          type="number"
                          value={editForm.protein ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, protein: parseInt(e.target.value) || 0 })}
                          className="w-full bg-[#090d16] border border-slate-700 rounded px-2 py-1 text-cyan-300 outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-amber-500 mb-0.5">ЖИРЫ (г)</div>
                        <input
                          type="number"
                          value={editForm.fat ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, fat: parseInt(e.target.value) || 0 })}
                          className="w-full bg-[#090d16] border border-slate-700 rounded px-2 py-1 text-amber-300 outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-indigo-400 mb-0.5">УГЛЕВОДЫ (г)</div>
                        <input
                          type="number"
                          value={editForm.carbs ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, carbs: parseInt(e.target.value) || 0 })}
                          className="w-full bg-[#090d16] border border-slate-700 rounded px-2 py-1 text-indigo-300 outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <button
                          onClick={() => handleSaveEdit(meal.id)}
                          className="p-2 bg-cyan-950 text-cyan-300 border border-cyan-800 rounded hover:bg-cyan-900 transition-all"
                          title="Сохранить"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingMealId(null); setEditForm({}); }}
                          className="p-2 text-slate-500 hover:text-slate-300 border border-slate-800 rounded transition-all"
                          title="Отмена"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Обычный режим ── */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-slate-500 shrink-0">{meal.time}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 truncate">{meal.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Б: <span className="text-cyan-400">{meal.protein}г</span>
                          {' '}|{' '}
                          Ж: <span className="text-amber-400">{meal.fat}г</span>
                          {' '}|{' '}
                          У: <span className="text-indigo-400">{meal.carbs}г</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="font-bold text-slate-100">{meal.calories} ккал</span>
                      <button
                        onClick={() => handleStartEdit(meal)}
                        className="p-1.5 text-slate-500 hover:text-cyan-400 transition-colors rounded hover:bg-cyan-950/30"
                        title="Редактировать"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => kineticsApi.deleteNutritionMeal(meal.id).then(fetchMeals).catch(console.error)}
                        className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors rounded hover:bg-rose-950/20"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  {/* ПРАВАЯ КОЛОНКА: AI NUTRITIONIST TERMINAL */}
  <div className="w-[380px] bg-[#090d16] border border-cyan-950/80 rounded-xl flex flex-col justify-between p-3.5 shadow-[0_0_25px_rgba(3,7,18,0.9)] shrink-0 h-full">
    <div className="border-b border-slate-800 pb-2 flex justify-between items-center text-xs shrink-0">
      <span className="text-cyan-400 font-bold flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" /> AI NUTRITIONIST
      </span>
      <div className="flex gap-2 items-center">
        <button
          onClick={handleSummarize}
          disabled={isSending}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800 text-purple-300 text-[10px] transition-colors disabled:opacity-50"
          title="Подвести итоги диалогов и сбросить чат"
        >
          <RefreshCw className={`w-3 h-3 text-purple-400 ${isSending ? 'animate-spin' : ''}`} />
          <span>ИТОГИ</span>
        </button>
        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
          ONLINE
        </span>
      </div>
    </div>

    {/* Лента сообщений диетолога */}
    <div className="flex-1 overflow-y-auto my-2 space-y-2.5 pr-1 text-xs custom-scrollbar min-h-0">
      {chatHistory.map((msg, i) => (
        <div key={i} className={`p-2.5 rounded-lg ${msg.role === 'user' ? 'bg-cyan-950/50 border border-cyan-800/60 text-cyan-200 ml-4' : 'bg-[#030712] border border-slate-800 text-slate-300 mr-2'}`}>
          <div className="text-[9px] text-slate-500 mb-1">{msg.role === 'user' ? 'АТЛЕТ' : 'ДИЕТОЛОГ // GEMINI 2.5'}</div>
          <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
        </div>
      ))}
      {isSending && (
        <div className="p-2.5 rounded-lg bg-[#030712] border border-slate-800 text-slate-300 mr-2">
          <div className="text-[9px] text-slate-500 mb-1">ДИЕТОЛОГ // GEMINI 2.5</div>
          <div className="flex items-center gap-2 text-cyan-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Анализ...
          </div>
        </div>
      )}
    </div>

    {/* Поле ввода вопроса / приема пищи */}
    <form onSubmit={handleSendNutritionMessage} className="pt-2 border-t border-slate-800 flex gap-2 shrink-0">
      <input
        type="text"
        placeholder="Спросить совет или написать: 'Съел 2 яйца'..."
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        className="flex-1 bg-[#030712] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={isSending || !chatInput.trim()}
        className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded text-xs transition-all disabled:opacity-50"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  </div>
</div>
  );
};
