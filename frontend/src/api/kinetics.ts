const API_BASE = '/api/v1/kinetics';


export interface NutritionMeal {
  id: string;
  user_id: string;
  meal_date: string;
  time_str: string;
  name: string;
  weight_g: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: any[];
  created_at: string;
}

export interface DailyNutritionSummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_fat: number;
  total_carbs: number;
  meals: NutritionMeal[];
}

export interface SegmentData {
  muscle_kg: number;
  muscle_pct: number;
  fat_kg: number;
  fat_pct: number;
}

export interface BiometricsCreate {
  weight_kg?: number;
  sleep_hours?: number;
  fatigue_score?: number;
  notes?: string;
}
export interface RecoveryDataPoint {
  date: string;
  tonnage_kg: number;
  calories: number;
  protein_g: number;
  sleep_hours: number;
  fatigue_score: number;
  recovery_score: number;
}
export interface RecoveryAnalyticsResponse {
  timeline: RecoveryDataPoint[];
  average_sleep: number;
  average_calories: number;
  total_tonnage: number;
  current_recovery_score: number;
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
  weight_g?: number;
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

export interface WorkoutPlanSettingsPayload {
  plan_id?: string;
  location?: string;
  target_split?: string;
  split_day?: string;
  restrictions?: string;
  goals?: string;
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


export interface OneRMDataPoint {
  date: string;
  one_rm_kg: number;
}
export interface ExerciseOneRM {
  exercise_name: string;
  history: OneRMDataPoint[];
}
export interface TonnageDataPoint {
  week_start: string;
  muscle_group: string;
  tonnage_kg: number;
}
export interface OverloadAnalyticsResponse {
  one_rm_top_exercises: ExerciseOneRM[];
  weekly_tonnage: TonnageDataPoint[];
}
export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_number: number;
  set_type: 'W' | 'N' | 'D' | 'F';
  weight_kg: number;
  reps: number;
  rpe?: number;
  is_completed: boolean;
  previous_weight_kg?: number;
  previous_reps?: number;
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
  workout_sets?: WorkoutSet[];
}

export interface MesocycleSettingsPayload {
  start_date: string; // YYYY-MM-DD
  days_of_week: number[];
  target_split: string;
  location: string;
  include_deload: boolean;
  weeks_count: number;
}

export interface WorkoutPlan {
  id: string;
  target_split: string;
  split_type?: string;
  location?: string;
  ai_rationale: string;
  status: 'planned' | 'in_progress' | 'completed';
  exercises: WorkoutExercise[];
  created_at: string;
  scheduled_date?: string;
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

  getChatHistory: async (module: 'coach' | 'nutrition'): Promise<any[]> => {
    const res = await fetch(`/api/v1/kinetics/chat/${module}`);
    if (!res.ok) throw new Error('Ошибка загрузки истории чата');
    return res.json();
  },

  summarizeChat: async (module: 'coach' | 'nutrition'): Promise<any> => {
    const res = await fetch(`/api/v1/kinetics/chat/${module}/summarize`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Ошибка суммаризации чата');
    return res.json();
  },

  
  getDailyNutrition: async (date: string): Promise<DailyNutritionSummary> => {
    return request<DailyNutritionSummary>(`${API_BASE}/nutrition/daily?date=${date}`);
  },

  addNutritionMeal: async (payload: Omit<NutritionMeal, 'id' | 'user_id' | 'created_at'>): Promise<NutritionMeal> => {
    return request<NutritionMeal>(`${API_BASE}/nutrition/meals`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteNutritionMeal: async (mealId: string): Promise<void> => {
    return request<void>(`${API_BASE}/nutrition/meals/${mealId}`, {
      method: 'DELETE'
    });
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

  getCalendarMonth: async (): Promise<WorkoutPlan[]> => {
    const res = await fetch(`${API_BASE}/calendar/month`);
    if (!res.ok) throw new Error('Ошибка загрузки календаря');
    return res.json();
  },

  updateWorkoutPlanSettings: async (payload: WorkoutPlanSettingsPayload): Promise<WorkoutPlan> => {
    const res = await fetch(`${API_BASE}/workouts/plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Ошибка обновления настроек плана');
    return res.json();
  },

  completeWorkout: async (planId: string): Promise<WorkoutPlan> => {
    const res = await fetch(`${API_BASE}/workouts/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId })
    });
    if (!res.ok) throw new Error('Ошибка завершения тренировки');
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
  },

  generateMesocycle: async (payload: MesocycleSettingsPayload): Promise<{status: string, message: string}> => {
    const res = await fetch(`${API_BASE}/workouts/generate-mesocycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Ошибка синтеза мезоцикла');
    return res.json();
  },
      getRecoveryAnalytics: async (): Promise<RecoveryAnalyticsResponse> => {
    const res = await fetch(`${API_BASE}/analytics/recovery`);
    if (!res.ok) throw new Error('Failed to fetch recovery analytics');
    return res.json();
  },
  saveBiometrics: async (data: BiometricsCreate): Promise<void> => {
    const res = await fetch(`${API_BASE}/biometrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to save biometrics');
  },
  getOverloadAnalytics: async (): Promise<OverloadAnalyticsResponse> => {
    const res = await fetch(`${API_BASE}/analytics/overload`);
    if (!res.ok) throw new Error('Failed to fetch overload analytics');
    return res.json();
  },
  duplicateWorkoutPlan: async (planId: string, targetDate: string, applyOverload: boolean = false, overloadIncrementKg: number = 1.25): Promise<WorkoutPlan> => {
    const res = await fetch(`${API_BASE}/workouts/${planId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_date: targetDate, apply_overload: applyOverload, overload_increment_kg: overloadIncrementKg })
    });
    if (!res.ok) throw new Error('Failed to duplicate workout plan');
    return res.json();
  },
  createWorkoutSet: async (exerciseId: string, data: Partial<WorkoutSet>): Promise<WorkoutSet> => {
    const response = await fetch(`${API_BASE}/exercises/${exerciseId}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create set');
    return response.json();
  },
  
  updateWorkoutSet: async (setId: string, data: Partial<WorkoutSet>): Promise<WorkoutSet> => {
    const response = await fetch(`${API_BASE}/workout-sets/${setId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update set');
    return response.json();
  },
  
  deleteWorkoutSet: async (setId: string): Promise<void> => {
    await fetch(`${API_BASE}/workout-sets/${setId}`, { method: 'DELETE' });
  }
};

