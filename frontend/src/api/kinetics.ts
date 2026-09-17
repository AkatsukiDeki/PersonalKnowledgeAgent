const API_BASE = '/api/v1/kinetics';

export interface SegmentData {
  muscle_kg: number;
  muscle_pct: number;
  fat_kg: number;
  fat_pct: number;
}

export interface BiometricsLog {
  id: string;
  weight?: number;
  weight_kg?: number;
  body_fat_percentage?: number;
  fat_mass_kg?: number;
  skeletal_muscle_kg?: number;
  muscle_kg?: number;
  water_l?: number;
  protein_kg?: number;
  minerals_kg?: number;
  visceral_fat_level?: number;
  bmr_kcal?: number;
  bmr?: number;
  tdee?: number;
  bmi?: number;
  
  calories_in?: number;
  protein_g?: number;
  sleep_hours?: number;
  fatigue_score?: number;
  segment_data?: Record<string, SegmentData>;
  
  timestamp: string;
}

export interface ScannedMealData {
  name: string;
  portion_weight_g: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients_detected: string[];
  confidence_note: string;
}

export interface WorkoutGenerateParams {
  location: 'Дом' | 'Зал';
  split_day: string;
  target_split?: string;
}

export interface AthleteProfileData {
  id?: string;
  age: number;
  gender: string;
  height_cm: number;
  target_fat_pct: number;
  target_weight_kg: number;
  goals: string[];
  lagging_muscles: string[];
  training_experience: string;
  last_break: string;
  workout_frequency: number;
  duration_min: number;
  preferred_time: string;
  schedule_days: string[];
  restrictions: string;
  strength_bench: number;
  strength_squat: number;
  strength_deadlift: number;
  pullups_reps: number;
  mobility_squat: number;
  mobility_shoulder: number;
  mobility_bend: number;
}

export interface WorkoutExercise {
  id: string;
  exercise_name: string;
  exercise_type: 'bodyweight' | 'isometric' | 'cardio' | 'intervals';
  sets: number;
  reps_or_duration: string;
  target_muscle_groups: string[];
  rpe_target: number;
  is_completed: boolean;
  order_index: number;
}

export interface WorkoutPlan {
  id: string;
  target_split: string;
  ai_rationale: string;
  status: 'planned' | 'in_progress' | 'completed';
  exercises: WorkoutExercise[];
  created_at: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ошибка запроса (${response.status}): ${errorText}`);
  }

  return response.json();
}

export interface ExerciseAlternativeItem {
  exercise_name: string;
  exercise_type: string;
  sets: number;
  reps_or_duration: string;
  rpe_target: number;
  target_muscle_groups: string[];
  biomechanical_rationale: string;
}

export const kineticsApi = {
  getProfile: async (): Promise<any> => {
    const res = await fetch('/api/v1/kinetics/profile');
    if (!res.ok) throw new Error('Ошибка загрузки профиля');
    return res.json();
  },

  updateProfile: async (data: Partial<AthleteProfileData>): Promise<AthleteProfileData> => {
    const res = await fetch(`${API_BASE}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getBiometrics: async (limit: number = 7): Promise<BiometricsLog[]> => {
    return request<BiometricsLog[]>(`${API_BASE}/biometrics?limit=${limit}`);
  },

  logBiometrics: async (payload: Omit<BiometricsLog, 'id' | 'timestamp'>): Promise<BiometricsLog> => {
    return request<BiometricsLog>(`${API_BASE}/biometrics`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getLatestWorkout: async (): Promise<WorkoutPlan | null> => {
    return request<WorkoutPlan | null>(`${API_BASE}/workouts/latest`);
  },

  generateWorkout: async (params: WorkoutGenerateParams): Promise<WorkoutPlan> => {
    return request<WorkoutPlan>(`${API_BASE}/workouts/generate`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  toggleExercise: async (exerciseId: string, isCompleted: boolean): Promise<void> => {
    await request<void>(`${API_BASE}/exercises/${exerciseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_completed: isCompleted }),
    });
  },

  patchExercise: async (id: string, data: Partial<WorkoutExercise>): Promise<WorkoutExercise> => {
    const res = await fetch(`${API_BASE}/exercises/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  deleteExercise: async (id: string): Promise<void> => {
    await fetch(`${API_BASE}/exercises/${id}`, { method: 'DELETE' });
  },

  addExercise: async (planId: string, name: string): Promise<WorkoutExercise> => {
    const res = await fetch(`${API_BASE}/exercises`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        exercise_name: name,
        exercise_type: 'hypertrophy',
        sets: 3,
        reps_or_duration: '10-12',
        rpe_target: 7,
        target_muscle_groups: ['дополнительно']
      })
    });
    return res.json();
  },

  askCoach: async (message: string, planId: string): Promise<WorkoutPlan> => {
    const res = await fetch(`${API_BASE}/workouts/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, plan_id: planId })
    });
    return res.json();
  },

  chatWithCoach: async (message: string, planContext?: any): Promise<any> => {
    const res = await fetch('/api/v1/kinetics/workouts/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, plan_context: planContext })
    });
    if (!res.ok) throw new Error('Ошибка генерации ответа тренера');
    return res.json();
  },

  getExerciseAlternatives: async (
    exerciseId: string,
    reason: 'joint_pain' | 'no_axial_load' | 'equipment_busy' | 'too_intense' = 'joint_pain'
  ): Promise<ExerciseAlternativeItem[]> => {
    const res = await fetch(`/api/v1/kinetics/exercises/${exerciseId}/alternatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error('Ошибка получения альтернатив');
    return res.json();
  },

  swapExercise: async (
    exerciseId: string,
    payload: {
      exercise_name: string;
      exercise_type: string;
      sets: number;
      reps_or_duration: string;
      rpe_target: number;
      target_muscle_groups: string[];
    }
  ): Promise<WorkoutExercise> => {
    const res = await fetch(`/api/v1/kinetics/exercises/${exerciseId}/swap`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Ошибка замены упражнения');
    return res.json();
  },

  scanMealPhoto: async (file: File): Promise<ScannedMealData> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/nutrition/scan-photo`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Ошибка сканирования фото');
    return res.json();
  },

  sendNutritionChatMessage: async (payload: { message: string, meals: any[], target_calories: number, current_weight: number }): Promise<{ response: string }> => {
    const res = await fetch(`${API_BASE}/nutrition/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Ошибка общения с AI-диетологом');
    return res.json();
  },

  getAnalyticsCorrelation: async (weeks: number = 8): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/analytics/correlation?weeks=${weeks}`);
    if (!res.ok) throw new Error('Ошибка загрузки корреляционной аналитики');
    return res.json();
  },

  getCalendarMonth: async (): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/calendar/month`);
    if (!res.ok) throw new Error('Ошибка загрузки календаря');
    return res.json();
  },

  rescheduleCalendar: async (days: any[]): Promise<any> => {
    const res = await fetch(`${API_BASE}/calendar/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days })
    });
    if (!res.ok) throw new Error('Ошибка перепланирования календаря');
    return res.json();
  }
};

