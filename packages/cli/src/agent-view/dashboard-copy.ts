/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DashboardCopy {
  sessions: string;
  task: string;
  status: string;
  time: string;
  model: string;
  session: string;
  folder: string;
  branch: string;
  lastActivity: string;
  currentSession: string;
  summary: string;
  now: string;
  lastMessage: string;
  working: string;
  action: string;
  failed: string;
  idle: string;
  inactive: string;
  unknown: string;
  folders: string;
  conversations: string;
  workShort: string;
  actionShort: string;
  failShort: string;
  noSessions: string;
  unavailable: string;
  pressSearch: string;
  search: string;
  filter: string;
  shortcutsWide: string;
  shortcutsNarrow: string;
  shortcutsDetail: string;
  workProgress: string;
  waitingAction: string;
  sessionFailed: string;
  savedLater: string;
  waitingMessage: string;
  untitled: string;
}

const en: DashboardCopy = {
  sessions: 'SESSIONS',
  task: 'TASK',
  status: 'STATUS',
  time: 'TIME',
  model: 'MODEL',
  session: 'SESSION',
  folder: 'Folder',
  branch: 'Branch',
  lastActivity: 'Last activity',
  currentSession: 'current session',
  summary: 'SUMMARY',
  now: 'NOW',
  lastMessage: 'LAST MESSAGE',
  working: 'WORKING',
  action: 'NEEDS YOU',
  failed: 'FAILED',
  idle: 'IDLE',
  inactive: 'INACTIVE',
  unknown: 'UNKNOWN',
  folders: 'folders',
  conversations: 'conversations',
  workShort: 'work',
  actionShort: 'action',
  failShort: 'fail',
  noSessions: 'No sessions found.',
  unavailable: 'Session unavailable for switching.',
  pressSearch: 'Press / to search',
  search: 'Search:',
  filter: 'Filter:',
  shortcutsWide: '↑↓ move · PgUp/PgDn details · enter open · esc back',
  shortcutsNarrow: '↑↓ move · enter open · space details · esc',
  shortcutsDetail: 'PgUp/PgDn details · esc list · enter open',
  workProgress: 'Work in progress.',
  waitingAction: 'Waiting for your action.',
  sessionFailed: 'The session failed.',
  savedLater: 'Saved for later.',
  waitingMessage: 'Waiting for a new message.',
  untitled: 'Untitled task',
};

const pt: DashboardCopy = {
  sessions: 'SESSÕES',
  task: 'TAREFA',
  status: 'STATUS',
  time: 'TEMPO',
  model: 'MODELO',
  session: 'SESSÃO',
  folder: 'Pasta',
  branch: 'Branch',
  lastActivity: 'Última atividade',
  currentSession: 'sessão atual',
  summary: 'RESUMO',
  now: 'AGORA',
  lastMessage: 'ÚLTIMA MENSAGEM',
  working: 'TRABALHANDO',
  action: 'SUA AÇÃO',
  failed: 'FALHOU',
  idle: 'OCIOSA',
  inactive: 'INATIVA',
  unknown: 'INDEFINIDA',
  folders: 'pastas',
  conversations: 'conversas',
  workShort: 'trab.',
  actionShort: 'ação',
  failShort: 'falha',
  noSessions: 'Nenhuma sessão encontrada.',
  unavailable: 'Sessão indisponível para alternância.',
  pressSearch: 'Pressione / para buscar',
  search: 'Buscar:',
  filter: 'Filtro:',
  shortcutsWide: '↑↓ navegar · PgUp/PgDn detalhes · enter abrir · esc voltar',
  shortcutsNarrow: '↑↓ mover · enter abrir · espaço detalhes · esc',
  shortcutsDetail: 'PgUp/PgDn detalhes · esc lista · enter abrir',
  workProgress: 'Trabalho em andamento.',
  waitingAction: 'Aguardando sua ação.',
  sessionFailed: 'A sessão falhou.',
  savedLater: 'Sessão salva para continuar.',
  waitingMessage: 'Aguardando nova mensagem.',
  untitled: 'Tarefa sem título',
};

const de: DashboardCopy = {
  sessions: 'SITZUNGEN',
  task: 'AUFGABE',
  status: 'STATUS',
  time: 'ZEIT',
  model: 'MODELL',
  session: 'SITZUNG',
  folder: 'Ordner',
  branch: 'Branch',
  lastActivity: 'Letzte Aktivität',
  currentSession: 'aktuelle Sitzung',
  summary: 'ZUSAMMENFASSUNG',
  now: 'JETZT',
  lastMessage: 'LETZTE NACHRICHT',
  working: 'ARBEITET',
  action: 'AKTION NÖTIG',
  failed: 'FEHLER',
  idle: 'BEREIT',
  inactive: 'INAKTIV',
  unknown: 'UNBEKANNT',
  folders: 'Ordner',
  conversations: 'Gespräche',
  workShort: 'aktiv',
  actionShort: 'Aktion',
  failShort: 'Fehler',
  noSessions: 'Keine Sitzungen gefunden.',
  unavailable: 'Sitzung kann nicht gewechselt werden.',
  pressSearch: '/ zum Suchen',
  search: 'Suchen:',
  filter: 'Filter:',
  shortcutsWide: '↑↓ wählen · PgUp/PgDn Details · Enter öffnen · Esc zurück',
  shortcutsNarrow: '↑↓ wählen · Enter öffnen · Leertaste Details · Esc',
  shortcutsDetail: 'PgUp/PgDn Details · Esc Liste · Enter öffnen',
  workProgress: 'Arbeit läuft.',
  waitingAction: 'Wartet auf Ihre Aktion.',
  sessionFailed: 'Die Sitzung ist fehlgeschlagen.',
  savedLater: 'Für später gespeichert.',
  waitingMessage: 'Wartet auf eine neue Nachricht.',
  untitled: 'Unbenannte Aufgabe',
};

const fr: DashboardCopy = {
  sessions: 'SESSIONS',
  task: 'TÂCHE',
  status: 'STATUT',
  time: 'TEMPS',
  model: 'MODÈLE',
  session: 'SESSION',
  folder: 'Dossier',
  branch: 'Branche',
  lastActivity: 'Dernière activité',
  currentSession: 'session actuelle',
  summary: 'RÉSUMÉ',
  now: 'MAINTENANT',
  lastMessage: 'DERNIER MESSAGE',
  working: 'EN COURS',
  action: 'VOTRE ACTION',
  failed: 'ÉCHEC',
  idle: 'EN ATTENTE',
  inactive: 'INACTIVE',
  unknown: 'INCONNU',
  folders: 'dossiers',
  conversations: 'conversations',
  workShort: 'actif',
  actionShort: 'action',
  failShort: 'échec',
  noSessions: 'Aucune session trouvée.',
  unavailable: 'Session indisponible pour le changement.',
  pressSearch: 'Appuyez sur / pour chercher',
  search: 'Chercher :',
  filter: 'Filtre :',
  shortcutsWide:
    '↑↓ déplacer · PgUp/PgDn détails · Entrée ouvrir · Échap retour',
  shortcutsNarrow: '↑↓ déplacer · Entrée ouvrir · espace détails · Échap',
  shortcutsDetail: 'PgUp/PgDn détails · Échap liste · Entrée ouvrir',
  workProgress: 'Travail en cours.',
  waitingAction: 'En attente de votre action.',
  sessionFailed: 'La session a échoué.',
  savedLater: 'Enregistrée pour plus tard.',
  waitingMessage: 'En attente d’un nouveau message.',
  untitled: 'Tâche sans titre',
};

const ca: DashboardCopy = {
  sessions: 'SESSIONS',
  task: 'TASCA',
  status: 'ESTAT',
  time: 'TEMPS',
  model: 'MODEL',
  session: 'SESSIÓ',
  folder: 'Carpeta',
  branch: 'Branca',
  lastActivity: 'Darrera activitat',
  currentSession: 'sessió actual',
  summary: 'RESUM',
  now: 'ARA',
  lastMessage: 'DARRER MISSATGE',
  working: 'TREBALLANT',
  action: 'CAL ACCIÓ',
  failed: 'ERROR',
  idle: 'EN ESPERA',
  inactive: 'INACTIVA',
  unknown: 'DESCONEGUDA',
  folders: 'carpetes',
  conversations: 'converses',
  workShort: 'actiu',
  actionShort: 'acció',
  failShort: 'error',
  noSessions: 'No s’han trobat sessions.',
  unavailable: 'No es pot canviar a aquesta sessió.',
  pressSearch: 'Premeu / per cercar',
  search: 'Cercar:',
  filter: 'Filtre:',
  shortcutsWide: '↑↓ moure · PgUp/PgDn detalls · Retorn obrir · Esc tornar',
  shortcutsNarrow: '↑↓ moure · Retorn obrir · espai detalls · Esc',
  shortcutsDetail: 'PgUp/PgDn detalls · Esc llista · Retorn obrir',
  workProgress: 'Treball en curs.',
  waitingAction: 'S’espera la vostra acció.',
  sessionFailed: 'La sessió ha fallat.',
  savedLater: 'Desada per a més tard.',
  waitingMessage: 'S’espera un missatge nou.',
  untitled: 'Tasca sense títol',
};

const ru: DashboardCopy = {
  sessions: 'СЕССИИ',
  task: 'ЗАДАЧА',
  status: 'СТАТУС',
  time: 'ВРЕМЯ',
  model: 'МОДЕЛЬ',
  session: 'СЕССИЯ',
  folder: 'Папка',
  branch: 'Ветка',
  lastActivity: 'Последняя активность',
  currentSession: 'текущая сессия',
  summary: 'СВОДКА',
  now: 'СЕЙЧАС',
  lastMessage: 'ПОСЛЕДНЕЕ СООБЩЕНИЕ',
  working: 'РАБОТАЕТ',
  action: 'НУЖНО ДЕЙСТВИЕ',
  failed: 'ОШИБКА',
  idle: 'ОЖИДАЕТ',
  inactive: 'НЕАКТИВНА',
  unknown: 'НЕИЗВЕСТНО',
  folders: 'папок',
  conversations: 'бесед',
  workShort: 'работа',
  actionShort: 'действие',
  failShort: 'ошибка',
  noSessions: 'Сессии не найдены.',
  unavailable: 'Переключение на сессию недоступно.',
  pressSearch: 'Нажмите / для поиска',
  search: 'Поиск:',
  filter: 'Фильтр:',
  shortcutsWide: '↑↓ выбор · PgUp/PgDn детали · Enter открыть · Esc назад',
  shortcutsNarrow: '↑↓ выбор · Enter открыть · пробел детали · Esc',
  shortcutsDetail: 'PgUp/PgDn детали · Esc список · Enter открыть',
  workProgress: 'Работа выполняется.',
  waitingAction: 'Ожидается ваше действие.',
  sessionFailed: 'Сессия завершилась с ошибкой.',
  savedLater: 'Сохранено на потом.',
  waitingMessage: 'Ожидается новое сообщение.',
  untitled: 'Без названия',
};

const ja: DashboardCopy = {
  sessions: 'セッション',
  task: 'タスク',
  status: '状態',
  time: '時間',
  model: 'モデル',
  session: 'セッション',
  folder: 'フォルダー',
  branch: 'ブランチ',
  lastActivity: '最終更新',
  currentSession: '現在のセッション',
  summary: '概要',
  now: '現在',
  lastMessage: '最後のメッセージ',
  working: '作業中',
  action: '要対応',
  failed: '失敗',
  idle: '待機中',
  inactive: '非アクティブ',
  unknown: '不明',
  folders: 'フォルダー',
  conversations: '会話',
  workShort: '作業',
  actionShort: '対応',
  failShort: '失敗',
  noSessions: 'セッションが見つかりません。',
  unavailable: 'このセッションには切り替えられません。',
  pressSearch: '/ で検索',
  search: '検索:',
  filter: '絞り込み:',
  shortcutsWide: '↑↓ 移動 · PgUp/PgDn 詳細 · Enter 開く · Esc 戻る',
  shortcutsNarrow: '↑↓ 移動 · Enter 開く · Space 詳細 · Esc',
  shortcutsDetail: 'PgUp/PgDn 詳細 · Esc 一覧 · Enter 開く',
  workProgress: '作業を進めています。',
  waitingAction: '操作を待っています。',
  sessionFailed: 'セッションが失敗しました。',
  savedLater: '後で続けられるよう保存しました。',
  waitingMessage: '新しいメッセージを待っています。',
  untitled: '無題のタスク',
};

const zh: DashboardCopy = {
  sessions: '会话',
  task: '任务',
  status: '状态',
  time: '时间',
  model: '模型',
  session: '会话',
  folder: '文件夹',
  branch: '分支',
  lastActivity: '最近活动',
  currentSession: '当前会话',
  summary: '摘要',
  now: '当前',
  lastMessage: '最新消息',
  working: '工作中',
  action: '需要操作',
  failed: '失败',
  idle: '空闲',
  inactive: '未运行',
  unknown: '未知',
  folders: '个文件夹',
  conversations: '个会话',
  workShort: '工作',
  actionShort: '操作',
  failShort: '失败',
  noSessions: '未找到会话。',
  unavailable: '无法切换到此会话。',
  pressSearch: '按 / 搜索',
  search: '搜索：',
  filter: '筛选：',
  shortcutsWide: '↑↓ 移动 · PgUp/PgDn 详情 · Enter 打开 · Esc 返回',
  shortcutsNarrow: '↑↓ 移动 · Enter 打开 · 空格详情 · Esc',
  shortcutsDetail: 'PgUp/PgDn 详情 · Esc 列表 · Enter 打开',
  workProgress: '正在工作。',
  waitingAction: '等待您操作。',
  sessionFailed: '会话失败。',
  savedLater: '已保存，稍后继续。',
  waitingMessage: '等待新消息。',
  untitled: '未命名任务',
};

const zhTW: DashboardCopy = {
  sessions: '對話',
  task: '任務',
  status: '狀態',
  time: '時間',
  model: '模型',
  session: '對話',
  folder: '資料夾',
  branch: '分支',
  lastActivity: '最近活動',
  currentSession: '目前對話',
  summary: '摘要',
  now: '目前',
  lastMessage: '最新訊息',
  working: '工作中',
  action: '需要操作',
  failed: '失敗',
  idle: '閒置',
  inactive: '未執行',
  unknown: '未知',
  folders: '個資料夾',
  conversations: '個對話',
  workShort: '工作',
  actionShort: '操作',
  failShort: '失敗',
  noSessions: '找不到對話。',
  unavailable: '無法切換至此對話。',
  pressSearch: '按 / 搜尋',
  search: '搜尋：',
  filter: '篩選：',
  shortcutsWide: '↑↓ 移動 · PgUp/PgDn 詳情 · Enter 開啟 · Esc 返回',
  shortcutsNarrow: '↑↓ 移動 · Enter 開啟 · 空白鍵詳情 · Esc',
  shortcutsDetail: 'PgUp/PgDn 詳情 · Esc 清單 · Enter 開啟',
  workProgress: '正在工作。',
  waitingAction: '等待您的操作。',
  sessionFailed: '對話失敗。',
  savedLater: '已儲存，稍後繼續。',
  waitingMessage: '等待新訊息。',
  untitled: '未命名任務',
};

export function getDashboardCopy(language: string): DashboardCopy {
  switch (language.toLowerCase()) {
    case 'pt':
    case 'pt-br':
      return pt;
    case 'de':
    case 'de-de':
      return de;
    case 'fr':
    case 'fr-fr':
      return fr;
    case 'ca':
    case 'ca-es':
      return ca;
    case 'ru':
    case 'ru-ru':
      return ru;
    case 'ja':
    case 'ja-jp':
      return ja;
    case 'zh-tw':
      return zhTW;
    case 'zh':
    case 'zh-cn':
      return zh;
    default:
      return en;
  }
}
