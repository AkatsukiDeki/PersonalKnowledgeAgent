import React, { useState, useEffect } from 'react';
import { SubjectList } from '../components/learning/SubjectList';
import { SubjectWorkspace } from '../components/learning/SubjectWorkspace';

interface LearningDashboardProps {
  initialSubjectId?: string | null;
  initialTab?: 'roadmap' | 'sources' | 'tutor' | 'stats';
}

export const LearningDashboard: React.FC<LearningDashboardProps> = ({ 
  initialSubjectId = null,
  initialTab = 'roadmap'
}) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(initialSubjectId);

  useEffect(() => {
    if (initialSubjectId) {
      setSelectedSubjectId(initialSubjectId);
    }
  }, [initialSubjectId]);

  if (selectedSubjectId) {
    return (
      <SubjectWorkspace 
        subjectId={selectedSubjectId} 
        initialTab={initialTab}
        onBack={() => setSelectedSubjectId(null)} 
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 bg-[#0a0a0c]">
      <SubjectList onSelectSubject={(id) => setSelectedSubjectId(id)} />
    </div>
  );
};
