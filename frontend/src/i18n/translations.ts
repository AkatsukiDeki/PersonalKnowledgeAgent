type TranslationKey = string;

export const translations: Record<string, Record<string, Record<string, string>>> = {
  ru: {
    nav: {
      dialogs: "Диалог",
      insights: "Инсайты",
      universe: "Вселенная памяти",
      contradictions: "Противоречия",
      timeline: "Таймлайн",
      learning: "Обучение",
      sources: "Источники памяти",
      addSource: "Добавить источник",
      agentMemory: "ПАМЯТЬ АГЕНТА"
    },
    insights: {
      title: "Доска инсайтов (L3)",
      subtitle: "Кандидатные паттерны и выводы, синтезированные на основе вашей базы знаний",
      generate: "Сгенерировать",
      noInsights: "Нет подтвержденных инсайтов.",
      needMoreData: "Продолжайте общаться с агентом, чтобы он смог выявить паттерны.",
      syncing: "Синхронизация..."
    },
    learning: {
      title: "Станция знаний",
      subtitle: "Ваше персональное пространство для структурированного обучения",
      roadmap: "Дорожная карта",
      materials: "Материалы",
      tutor: "Тьютор-чат",
      stats: "Статистика",
      addSubject: "Создать предмет",
      newSubject: "Новый предмет",
      noDescription: "Нет описания. Нажмите, чтобы добавить материалы и начать обучение.",
      days: "дней"
    },
    settings: {
      title: "Настройки",
      profile: "Профиль",
      models: "Модели LLM",
      system: "Система",
      save: "Сохранить настройки"
    },
    timeline: {
      title: "Хроника решений (Timeline 2.0)",
      subtitle: "Эволюция знаний, смена инструментов и архитектурные сдвиги во времени.",
      infoBox: "Хроника автоматически отслеживает эволюцию ваших инженерных решений, фиксируя противоречия и смену подходов между старыми и новыми материалами.",
      sync: "Синхронизировать",
      syncing: "Анализ..."
    },
    contradictions: {
      title: "Панель противоречий",
      subtitle: "Обнаруженные конфликты в базе знаний, требующие разрешения"
    },
    chatSidebar: {
      newDialog: "Новый диалог",
      pinned: "Закрепленные",
      folders: "Папки",
      today: "Сегодня",
      yesterday: "Вчера",
      last7days: "Предыдущие 7 дней",
      older: "Ранее",
      emptyFolder: "Пустая папка",
      noDialogs: "Нет диалогов",
      noFolders: "Нет папок",
      loading: "Загрузка…",
      createFolderTooltip: "Создать папку",
      rename: "Переименовать",
      pin: "Закрепить",
      unpin: "Открепить",
      delete: "Удалить",
      folder: "Папка",
      moveTo: "Переместить в:",
      removeFromFolder: "Убрать из папки",
      createNewFolder: "Создать новую...",
      promptNewFolder: "Введите название новой папки:",
      promptMergeFolder: "Объединить диалоги в папку. Введите название:",
      confirmDelete: "Удалить этот диалог?"
    }
  },
  en: {
    nav: {
      dialogs: "Chat",
      insights: "Insights",
      universe: "Memory Universe",
      contradictions: "Contradictions",
      timeline: "Timeline",
      learning: "Learning Hub",
      sources: "Memory Sources",
      addSource: "Add Source",
      agentMemory: "AGENT MEMORY"
    },
    insights: {
      title: "Insights Review Board",
      subtitle: "Candidate patterns and synthesized L3 insights derived from your knowledge base",
      generate: "Generate Insights",
      noInsights: "No confirmed insights yet.",
      needMoreData: "Continue chatting with the agent to help it discover patterns.",
      syncing: "Syncing..."
    },
    learning: {
      title: "Knowledge Station",
      subtitle: "Your personal space for structured learning",
      roadmap: "Roadmap",
      materials: "Materials",
      tutor: "Tutor Chat",
      stats: "Statistics",
      addSubject: "Create Subject",
      newSubject: "New Subject",
      noDescription: "No description. Click to add materials and start learning.",
      days: "days"
    },
    settings: {
      title: "Settings",
      profile: "Profile",
      models: "LLM Models",
      system: "System",
      save: "Save Settings"
    },
    timeline: {
      title: "Decision Timeline",
      subtitle: "Knowledge evolution, tool replacements, and architectural shifts over time.",
      infoBox: "The timeline automatically tracks the evolution of your engineering decisions, capturing contradictions and approach shifts between old and new materials.",
      sync: "Synchronize",
      syncing: "Analyzing..."
    },
    contradictions: {
      title: "Contradictions Board",
      subtitle: "Detected conflicts in your knowledge base that require resolution"
    },
    chatSidebar: {
      newDialog: "New Chat",
      pinned: "Pinned",
      folders: "Folders",
      today: "Today",
      yesterday: "Yesterday",
      last7days: "Previous 7 Days",
      older: "Older",
      emptyFolder: "Empty folder",
      noDialogs: "No chats",
      noFolders: "No folders",
      loading: "Loading…",
      createFolderTooltip: "Create folder",
      rename: "Rename",
      pin: "Pin",
      unpin: "Unpin",
      delete: "Delete",
      folder: "Folder",
      moveTo: "Move to:",
      removeFromFolder: "Remove from folder",
      createNewFolder: "Create new...",
      promptNewFolder: "Enter new folder name:",
      promptMergeFolder: "Merge into folder. Enter name:",
      confirmDelete: "Delete this chat?"
    }
  }
};
