import React, { useState, useEffect } from 'react';
import { Book, Plus, Flame, MoreVertical, Trash2 } from 'lucide-react';
import { Subject, subjectsApi } from '../../api/subjects';
import { useLanguage } from '../../context/LanguageContext';

export const SubjectList: React.FC<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
  const { t } = useLanguage();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubjects = async () => {
    try {
      const data = await subjectsApi.getSubjects();
      setSubjects(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const createSubject = async () => {
    // Basic mock creation for now, we can add a proper modal later
    const newSubject = await subjectsApi.createSubject({
      title: `${t('learning.newSubject')} ${subjects.length + 1}`,
      description: '',
      icon: 'book',
      color_theme: 'indigo'
    });
    setSubjects([...subjects, newSubject]);
  };

  const deleteSubject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await subjectsApi.deleteSubject(id);
    setSubjects(subjects.filter(s => s.id !== id));
  };

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-white/5">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('learning.title')}</h1>
          <p className="text-zinc-400">{t('learning.subtitle')}</p>
        </div>
        <button 
          onClick={createSubject}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors font-medium"
        >
          <Plus size={20} />
          {t('learning.addSubject')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subjects.map(subject => {
          const stat = subject.stats?.[0] || { streak_days: 0 };
          return (
            <div 
              key={subject.id}
              onClick={() => onSelect(subject.id)}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 cursor-pointer hover:border-indigo-500/50 hover:bg-zinc-800/50 transition-all group relative overflow-hidden"
            >
              {/* Decorative gradient orb */}
              <div className={`absolute -top-12 -right-12 w-32 h-32 bg-${subject.color_theme}-500/10 rounded-full blur-3xl group-hover:bg-${subject.color_theme}-500/20 transition-all`} />
              
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 bg-${subject.color_theme}-500/20 rounded-lg text-${subject.color_theme}-400`}>
                  <Book size={24} />
                </div>
                <button onClick={(e) => deleteSubject(e, subject.id)} className="p-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 size={18} />
                </button>
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2">{subject.title}</h3>
              <p className="text-zinc-400 text-sm mb-6 line-clamp-2 min-h-[40px]">
                {subject.description || t('learning.noDescription')}
              </p>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 text-orange-400 bg-orange-400/10 px-2.5 py-1 rounded-full">
                  <Flame size={16} />
                  <span className="font-medium">{stat.streak_days} {t('learning.days')}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">{subject.mastery_score}%</span>
                  <div className="w-16 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full bg-${subject.color_theme}-500`} 
                      style={{ width: `${subject.mastery_score}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        
        <div 
          onClick={createSubject}
          className="border-2 border-dashed border-zinc-800 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-zinc-900/50 transition-all text-zinc-500 hover:text-indigo-400 min-h-[220px]"
        >
          <div className="p-4 bg-zinc-800/50 rounded-full mb-4">
            <Plus size={32} />
          </div>
          <p className="font-medium">{t('learning.newSubject')}</p>
        </div>
      </div>
    </div>
  );
};
