import React, { useState, useEffect } from 'react';
import { X, User, Cpu, Server, Loader2, Save, ChevronDown } from 'lucide-react';
import { profileApi, UserProfile } from '../../api/profile';
import { useLanguage } from '../../context/LanguageContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'profile' | 'llm' | 'system';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t, setLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  
  // Profile State
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    role: '',
    stack: [],
    projects: '',
    invariants: '',
    learning_style: ''
  });
  const [stackInput, setStackInput] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // LLM State
  const [llmSettings, setLlmSettings] = useState({
    model: 'gemini-3.5-flash-lite',
    temperature: 0.7,
    contextLimit: 8192,
    contentLanguage: '🇷🇺 Русский'
  });
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  const models = [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (Fast)' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Reasoning)' },
    { id: 'qwen2.5:7b', label: 'Qwen 2.5 7B (Local Ollama)' }
  ];

  useEffect(() => {
    if (isOpen) {
      loadProfile();
      loadLlmSettings();
    }
  }, [isOpen]);

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const data = await profileApi.getProfile();
      if (data) {
        setProfile(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadLlmSettings = () => {
    const saved = localStorage.getItem('pka_llm_settings');
    if (saved) {
      try {
        setLlmSettings(JSON.parse(saved));
      } catch (e) {}
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      await profileApi.seedProfile({
        role: profile.role || '',
        stack: profile.stack || [],
        projects: profile.projects || '',
        invariants: profile.invariants || '',
        learning_style: profile.learning_style || ''
      });
      alert('Профиль успешно обновлен. Граф знаний перестраивается.');
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении профиля');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveLlm = () => {
    localStorage.setItem('pka_llm_settings', JSON.stringify(llmSettings));
    const langCode = llmSettings.contentLanguage?.includes('Русский') ? 'ru' : 'en';
    setLanguage(langCode);
    alert('Настройки LLM сохранены локально.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl h-[650px] overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]">
          <h2 className="text-lg font-light text-slate-200">{t('settings.title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-white/5 bg-white/[0.01] p-2 flex flex-col gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'profile' ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
            >
              <User size={16} /> {t('settings.profile')}
            </button>
            <button
              onClick={() => setActiveTab('llm')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'llm' ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
            >
              <Cpu size={16} /> {t('settings.models')}
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'system' ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
            >
              <Server size={16} /> {t('settings.system')}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
            {activeTab === 'profile' && (
              <div className="space-y-6 text-sm text-white/80 font-light">
                {profileLoading ? (
                  <div className="flex items-center gap-2 text-white/40"><Loader2 size={16} className="animate-spin" /> Загрузка...</div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Роль / Специализация</label>
                        <input
                          type="text"
                          value={profile.role}
                          onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50"
                          placeholder="Например: Senior Frontend Developer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Стек технологий (через Enter)</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {profile.stack?.map((tech, i) => (
                            <span key={i} className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs border border-indigo-500/30 flex items-center gap-1">
                              {tech}
                              <X size={12} className="cursor-pointer hover:text-white" onClick={() => setProfile({ ...profile, stack: profile.stack?.filter((_, idx) => idx !== i) })} />
                            </span>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={stackInput}
                          onChange={(e) => setStackInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && stackInput.trim()) {
                              e.preventDefault();
                              setProfile({ ...profile, stack: [...(profile.stack || []), stackInput.trim()] });
                              setStackInput('');
                            }
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50"
                          placeholder="React, Python, AWS..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Инварианты (жесткие правила)</label>
                        <textarea
                          value={profile.invariants}
                          onChange={(e) => setProfile({ ...profile, invariants: e.target.value })}
                          rows={3}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 resize-none"
                          placeholder="Всегда использовать строгую типизацию, избегать any..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Текущие проекты</label>
                        <textarea
                          value={profile.projects}
                          onChange={(e) => setProfile({ ...profile, projects: e.target.value })}
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Предпочтения в обучении</label>
                        <textarea
                          value={profile.learning_style}
                          onChange={(e) => setProfile({ ...profile, learning_style: e.target.value })}
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-4">
                      <button
                        onClick={handleSaveProfile}
                        disabled={profileSaving}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                      >
                        {profileSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Сохранить профиль
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'llm' && (
              <div className="space-y-6 text-sm text-white/80 font-light">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">Основная модель (LLM)</label>
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                      className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 hover:border-white/20 transition-all"
                    >
                      <span>{models.find(m => m.id === llmSettings.model)?.label || llmSettings.model}</span>
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isModelDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-xl py-1 z-50 shadow-2xl overflow-hidden">
                        {models.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setLlmSettings({ ...llmSettings, model: m.id }); setIsModelDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                              llmSettings.model === m.id ? 'bg-fuchsia-500/20 text-fuchsia-300 font-medium' : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">Язык контента (Target Language)</label>
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                      className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 hover:border-white/20 transition-all"
                    >
                      <span>{llmSettings.contentLanguage || '🇷🇺 Русский'}</span>
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isLangDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-xl py-1 z-50 shadow-2xl overflow-hidden">
                        {['🇷🇺 Русский', '🇬🇧 English'].map((lang) => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => { setLlmSettings({ ...llmSettings, contentLanguage: lang }); setIsLangDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                              (llmSettings.contentLanguage || '🇷🇺 Русский') === lang ? 'bg-fuchsia-500/20 text-fuchsia-300 font-medium' : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-white/50">Температура</label>
                    <span className="text-xs font-mono text-fuchsia-400">{llmSettings.temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="1" step="0.05"
                    value={llmSettings.temperature}
                    onChange={(e) => setLlmSettings({ ...llmSettings, temperature: parseFloat(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                  <p className="text-[10px] text-white/30 mt-1">От 0.0 (детерминированно) до 1.0 (креативно)</p>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-white/50">Лимит контекстных токенов</label>
                    <span className="text-xs font-mono text-fuchsia-400">{llmSettings.contextLimit}</span>
                  </div>
                  <input
                    type="range"
                    min="2048" max="128000" step="2048"
                    value={llmSettings.contextLimit}
                    onChange={(e) => setLlmSettings({ ...llmSettings, contextLimit: parseInt(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                </div>

                <div className="flex justify-end pt-4 border-t border-white/5">
                  <button
                    onClick={handleSaveLlm}
                    className="flex items-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  >
                    <Save size={16} /> Сохранить настройки
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'system' && (
              <div className="space-y-6 text-sm text-white/80 font-light">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <h3 className="text-emerald-400 font-medium mb-1">Сброс кэша графа</h3>
                  <p className="text-xs text-white/50 mb-3">Очистка закэшированных путей графа и пересчет связей.</p>
                  <button className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    Очистить кэш
                  </button>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <h3 className="text-amber-400 font-medium mb-1">Очистка неактивных клеймов</h3>
                  <p className="text-xs text-white/50 mb-3">Удаление мягко удаленных и устаревших атомарных фактов (is_active = false).</p>
                  <button className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    Выполнить очистку
                  </button>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <h3 className="text-white/80 font-medium mb-1">Выгрузка базы знаний</h3>
                  <p className="text-xs text-white/50 mb-3">Экспорт всех графовых данных и инсайтов в JSON формат.</p>
                  <button className="bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    Экспорт
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
