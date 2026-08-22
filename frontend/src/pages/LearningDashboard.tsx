import React, { useState, useEffect } from 'react';
import { SubjectList } from '../components/learning/SubjectList';
import { SubjectWorkspace } from '../components/learning/SubjectWorkspace';

export function LearningDashboard() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pka_active_subject');
    }
    return null;
  });

  useEffect(() => {
    if (selectedSubjectId) {
      localStorage.setItem('pka_active_subject', selectedSubjectId);
    } else {
      localStorage.removeItem('pka_active_subject');
    }
  }, [selectedSubjectId]);

  return (
    <div className="h-full bg-transparent text-slate-200">
      {selectedSubjectId ? (
        <SubjectWorkspace 
          subjectId={selectedSubjectId} 
          onBack={() => setSelectedSubjectId(null)} 
        />
      ) : (
        <SubjectList onSelect={setSelectedSubjectId} />
      )}
    </div>
  );
}

