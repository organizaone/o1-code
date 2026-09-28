/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

// Japanese translations for O1-Code CLI

export default {
  // ============================================================================
  // Help / UI Components
  // ============================================================================
  'Basics:': '基本操作:',
  'Add context': 'コンテキストを追加',
  'Use {{symbol}} to specify files for context (e.g., {{example}}) to target specific files or folders.':
    '{{symbol}} を使用してコンテキスト用のファイルを指定します(例: {{example}}) また、特定のファイルやフォルダを対象にできます',
  '@': '@',
  '@src/myFile.ts': '@src/myFile.ts',
  'Shell mode': 'シェルモード',
  'YOLO mode': 'YOLOモード',
  'Auto mode': '自動モード',
  'auto_mode.entry_notice':
    '自動モードが有効です。\n   LLM 分類器が各ツール呼び出しを評価します — 安全な操作は自動承認され、\n   危険な操作はブロックされます。終了: Shift+Tab または /approval-mode default。',
  'plan mode': 'プランモード',
  'auto-accept edits': '編集を自動承認',
  'Accepting edits': '編集を承認中',
  '(shift + tab to cycle)': '(Shift + Tab で切り替え)',
  'Execute shell commands via {{symbol}} (e.g., {{example1}}) or use natural language (e.g., {{example2}}).':
    '{{symbol}} でシェルコマンドを実行(例: {{example1}})、または自然言語で入力(例: {{example2}})',
  '!': '!',
  '!npm run start': '!npm run start',
  'start server': 'サーバーを起動',
  'Commands:': 'コマンド:',
  'shell command': 'シェルコマンド',
  'Model Context Protocol command (from external servers)':
    'Model Context Protocol コマンド(外部サーバーから)',
  'Keyboard Shortcuts:': 'キーボードショートカット:',
  'Jump through words in the input': '入力欄の単語間を移動',
  'Close dialogs, cancel requests, or quit application':
    'ダイアログを閉じる、リクエストをキャンセル、またはアプリを終了',
  'New line': '改行',
  'New line (Alt+Enter works for certain linux distros)':
    '改行(一部のLinuxディストリビューションではAlt+Enterが有効)',
  'Clear the screen': '画面をクリア',
  'Open input in external editor': '外部エディタで入力を開く',
  'Send message': 'メッセージを送信',
  'Initializing...': '初期化中...',
  'Connecting to MCP servers... ({{connected}}/{{total}})':
    'MCP servers に接続中... ({{connected}}/{{total}})',
  'Type your message or @path/to/file':
    'メッセージを入力、@パス/ファイルでファイルを添付(D&D対応)',
  "Press 'i' for INSERT mode and 'Esc' for NORMAL mode.":
    "'i' でINSERTモード、'Esc' でNORMALモード",
  'Cancel operation / Clear input (double press)':
    '操作をキャンセル / 入力をクリア(2回押し)',
  'Cycle approval modes': '承認モードを切り替え',
  'Cycle through your prompt history': 'プロンプト履歴を順に表示',
  'For a full list of shortcuts, see {{docPath}}':
    'ショートカットの完全なリストは {{docPath}} を参照',
  'for help on O1-Code': 'O1-Code のヘルプ',
  'show version info': 'バージョン情報を表示',
  'submit a bug report': 'バグレポートを送信',
  Model: 'モデル',
  'Fast Model': '高速モデル',
  Sandbox: 'サンドボックス',
  'Session ID': 'セッションID',
  'Base URL': 'Base URL',
  'Memory Usage': 'メモリ使用量',
  'IDE Client': 'IDEクライアント',

  // ============================================================================
  // Commands - General
  // ============================================================================
  'Analyzes the project and creates a tailored AGENTS.md file.':
    'プロジェクトを分析し、カスタマイズされた AGENTS.md ファイルを作成',
  'List available O1-Code tools. Usage: /tools [desc]':
    '利用可能な O1-Code ツールを一覧表示。使い方: /tools [desc]',
  'Open the skills panel (browse, search, toggle, pick).':
    'スキルパネルを開く（一覧・検索・有効化/無効化・選択）。',
  'Manage Skills': 'スキルを管理',
  'Skills configuration saved.': 'スキル設定を保存しました。',
  'Skills configuration saved, but refresh failed: {{error}}. Restart to ensure the new state is applied.':
    'スキル設定を保存しましたが、更新に失敗しました：{{error}}。再起動して新しい状態が反映されることを確認してください。',
  'Workspace is untrusted; workspace settings are ignored by the merged config. Run /trust first to persist skills changes here, or edit ~/.o1-code/settings.json directly to manage skills at user scope.':
    'ワークスペースが信頼されていないため、ワークスペース設定はマージ設定で無視されます。先に /trust を実行するか、~/.o1-code/settings.json を直接編集してユーザースコープでスキルを管理してください。',
  'SkillManager not available.': 'SkillManager は利用できません。',
  'Loading skills…': 'スキルを読み込み中…',
  'Failed to load skills: {{error}}': 'スキルの読み込みに失敗：{{error}}',
  'Failed to save skills configuration: {{error}}':
    'スキル設定の保存に失敗しました：{{error}}',
  'All available skills are disabled. Edit ~/.o1-code/settings.json or .o1-code/settings.json (skills.disabled) to re-enable.':
    'すべての利用可能なスキルが無効化されています。~/.o1-code/settings.json または .o1-code/settings.json (skills.disabled) を編集して再有効化してください。',
  'Press esc to close.': 'Esc で閉じる。',
  '{{count}} skills · ': '{{count}} スキル · ',
  '{{matched}} / {{total}} skills · ': '{{matched}} / {{total}} スキル · ',
  'Space toggle · Enter pick (fill input) · Esc save & exit · workspace scope':
    'スペース 切替 · Enter 選択（入力欄に挿入） · Esc 保存して終了 · ワークスペーススコープ',
  'Search:': '検索：',
  'type to filter…': 'フィルタを入力…',
  'No skills are currently available.': '利用可能なスキルはありません。',
  'No skills match the search.': '検索に一致するスキルはありません。',
  'Locked by settings entries you cannot toggle here:':
    '設定エントリによってロックされています（ここでは切替不可）：',
  '{{count}} locked not shown': 'ロック中の {{count}} 件を非表示',
  'higher scope': '上位スコープ',
  '  {{name}} {{description}}  [locked: {{scope}}]':
    '  {{name}} {{description}}  [ロック中：{{scope}}]',
  '↑/↓ navigate · backspace edits search': '↑/↓ 移動 · Backspace 検索編集',
  Bundled: '組み込み',
  'Available O1-Code CLI tools:': '利用可能な O1-Code CLI ツール:',
  'No tools available': '利用可能なツールはありません',
  'View or change the approval mode for tool usage':
    'ツール使用の承認モードを表示または変更',
  'View or change the language setting': '言語設定を表示または変更',
  'List background tasks (text dump — interactive dialog opens via the footer pill)':
    'バックグラウンドタスクを一覧表示する（テキスト出力。対話式ダイアログはフッターのタスク表示から開けます）',
  'Delete a previous session': '以前のセッションを削除する',
  'Run installation and environment diagnostics':
    'インストールと環境の診断を実行する',
  'Browse dynamic model catalogs and choose which models stay enabled locally':
    '動的なモデルカタログを参照し、ローカルで有効にしておくモデルを選択する',
  'Generate a one-line session recap now':
    'このセッションの1行要約を今すぐ生成する',
  'Rename the current conversation. --auto lets the fast model pick a title.':
    '現在の会話の名前を変更する。--auto を使うと高速モデルがタイトルを決めます。',
  'Rewind conversation to a previous turn': '会話を前のターンまで巻き戻す',
  'Rewind Conversation': '会話を巻き戻す',
  'No user turns to rewind to.': '巻き戻せるユーザーターンがありません。',
  'Rewind to: ': '巻き戻し先：',
  'Restore code and conversation': 'コードと会話を復元',
  'Restore conversation only': '会話のみ復元',
  'Restore code only': 'コードのみ復元',
  'Never mind': 'やめる',
  'Computing file changes...': 'ファイルの変更を計算中...',
  'Restoring...': '復元中...',
  'Restored {{count}} file(s).': '{{count}} 個のファイルを復元しました。',
  'Failed to restore files: {{error}}':
    'ファイルの復元に失敗しました：{{error}}',
  'Rewind failed: {{error}}': '巻き戻しに失敗しました：{{error}}',
  'Cannot rewind conversation: no active model client.':
    '会話を巻き戻せません：アクティブなモデルクライアントがありません。',
  'Code restored, but conversation could not be rewound (no active client).':
    'コードは復元されましたが、会話は巻き戻せませんでした（モデルクライアントがアクティブではありません）。',
  'Conversation rewound. Edit your prompt and press Enter to continue.':
    '会話を巻き戻しました。プロンプトを編集して Enter キーで続行してください。',
  'Rewinding does not affect files edited manually or via shell commands.':
    '巻き戻しは、手動で編集されたファイルや shell コマンドで変更されたファイルには影響しません。',
  'Cannot rewind to a turn that was compressed. Try a more recent turn.':
    '圧縮されたターンへは巻き戻せません。より最近のターンをお試しください。',
  'File restore is unavailable for this turn (no captured file changes, or this turn predates the current session).':
    'このターンではファイル復元できません（捕捉されたファイル変更がないか、現在のセッションより前のターンです）。',
  '(+{{insertions}} -{{deletions}} in {{count}} file)':
    '(+{{insertions}} -{{deletions}}、{{count}} 個のファイル)',
  '(+{{insertions}} -{{deletions}} in {{count}} files)':
    '(+{{insertions}} -{{deletions}}、{{count}} 個のファイル)',
  'Failed to restore {{count}} file(s): {{files}}':
    '{{count}} 個のファイルの復元に失敗しました：{{files}}',
  'Cannot restore files: this turn was created before file checkpointing was enabled.':
    'ファイルを復元できません：このターンはファイルチェックポイントが有効になる前に作成されました。',
  'No files needed to be restored.': '復元が必要なファイルはありません。',
  '↑↓ to navigate · Enter to select · Esc to go back':
    '↑↓ 移動 · Enter 選択 · Esc 戻る',
  '↑↓ to navigate · Enter to select · Esc to cancel':
    '↑↓ 移動 · Enter 選択 · Esc キャンセル',
  'Enter/Y to confirm · Esc/N to go back': 'Enter/Y 確認 · Esc/N 戻る',
  'change the theme': 'テーマを変更',
  'Select Theme': 'テーマを選択',
  Preview: 'プレビュー',
  '(Use Enter to select, Tab to configure scope)':
    '(Enter で選択、Tab でスコープを設定)',
  'Theme configuration unavailable due to NO_COLOR env variable.':
    'NO_COLOR 環境変数のためテーマ設定は利用できません',
  'Theme "{{themeName}}" not found.': 'テーマ "{{themeName}}" が見つかりません',
  'Theme "{{themeName}}" not found in selected scope.':
    '選択したスコープにテーマ "{{themeName}}" が見つかりません',
  'Clear conversation history and free up context':
    '会話履歴をクリアしてコンテキストを解放',
  'Compresses the context by replacing it with a summary.':
    'コンテキストを要約に置き換えて圧縮',
  'open full O1-Code documentation in your browser':
    'ブラウザで O1-Code のドキュメントを開く',
  'Configuration not available.': '設定が利用できません',
  'Connect an LLM provider': 'LLM プロバイダーに接続',
  'Copy the last AI response to clipboard (/copy N for Nth-latest)':
    '最新のAI応答をクリップボードにコピー（/copy N で新しい方からN番目）',

  // ============================================================================
  // Commands - Agents
  // ============================================================================
  'Manage subagents for specialized task delegation.':
    '専門タスクを委任するサブエージェントを管理',
  'Manage existing subagents (view, edit, delete).':
    '既存のサブエージェントを管理(表示、編集、削除)',
  'Create a new subagent with guided setup.':
    'ガイド付きセットアップで新しいサブエージェントを作成',

  // ============================================================================
  // Agents - Management Dialog
  // ============================================================================
  Agents: 'エージェント',
  'Choose Action': 'アクションを選択',
  'Edit {{name}}': '{{name}} を編集',
  'Edit Tools: {{name}}': 'ツールを編集: {{name}}',
  'Edit Color: {{name}}': '色を編集: {{name}}',
  'Delete {{name}}': '{{name}} を削除',
  'Unknown Step': '不明なステップ',
  'Esc to close': 'Esc で閉じる',
  Transcript: 'トランスクリプト',
  'Read {{count}} file': '{{count}} 件のファイルを読み込みました',
  'Read {{count}} files': '{{count}} 件のファイルを読み込みました',
  'Reading {{count}} file': '{{count}} 件のファイルを読み込み中',
  'Reading {{count}} files': '{{count}} 件のファイルを読み込み中',
  'Edited {{count}} file': '{{count}} 件のファイルを編集しました',
  'Edited {{count}} files': '{{count}} 件のファイルを編集しました',
  'Editing {{count}} file': '{{count}} 件のファイルを編集中',
  'Editing {{count}} files': '{{count}} 件のファイルを編集中',
  'Wrote {{count}} file': '{{count}} 件のファイルを書き込みました',
  'Wrote {{count}} files': '{{count}} 件のファイルを書き込みました',
  'Writing {{count}} file': '{{count}} 件のファイルを書き込み中',
  'Writing {{count}} files': '{{count}} 件のファイルを書き込み中',
  'Searched {{count}} pattern': '{{count}} 件のパターンを検索しました',
  'Searched {{count}} patterns': '{{count}} 件のパターンを検索しました',
  'Searching {{count}} pattern': '{{count}} 件のパターンを検索中',
  'Searching {{count}} patterns': '{{count}} 件のパターンを検索中',
  'Listed {{count}} directory': '{{count}} 件のディレクトリを一覧表示しました',
  'Listed {{count}} directories':
    '{{count}} 件のディレクトリを一覧表示しました',
  'Listing {{count}} directory': '{{count}} 件のディレクトリを一覧表示中',
  'Listing {{count}} directories': '{{count}} 件のディレクトリを一覧表示中',
  'Ran {{count}} command': '{{count}} 件のコマンドを実行しました',
  'Ran {{count}} commands': '{{count}} 件のコマンドを実行しました',
  'Running {{count}} command': '{{count}} 件のコマンドを実行中',
  'Running {{count}} commands': '{{count}} 件のコマンドを実行中',
  'Ran {{count}} agent': '{{count}} 件のエージェントを実行しました',
  'Ran {{count}} agents': '{{count}} 件のエージェントを実行しました',
  'Running {{count}} agent': '{{count}} 件のエージェントを実行中',
  'Running {{count}} agents': '{{count}} 件のエージェントを実行中',
  'Used {{count}} tool': '{{count}} 件のツールを使用しました',
  'Used {{count}} tools': '{{count}} 件のツールを使用しました',
  'Using {{count}} tool': '{{count}} 件のツールを使用中',
  'Using {{count}} tools': '{{count}} 件のツールを使用中',
  'Enter to select, ↑↓ to navigate, Esc to close':
    'Enter で選択、↑↓ で移動、Esc で閉じる',
  'Esc to go back': 'Esc で戻る',
  'Enter to confirm, Esc to cancel': 'Enter で確定、Esc でキャンセル',
  'Enter to select, ↑↓ to navigate, Esc to go back':
    'Enter で選択、↑↓ で移動、Esc で戻る',
  'Enter to submit, Esc to go back': 'Enter で送信、Esc で戻る',
  'Invalid step: {{step}}': '無効なステップ: {{step}}',
  'No subagents found.': 'サブエージェントが見つかりません',
  "Use '/agents create' to create your first subagent.":
    "'/agents create' で最初のサブエージェントを作成してください",
  '(built-in)': '(組み込み)',
  '(overridden by project level agent)':
    '(プロジェクトレベルのエージェントで上書き)',
  'Project Level ({{path}})': 'プロジェクトレベル ({{path}})',
  'User Level ({{path}})': 'ユーザーレベル ({{path}})',
  'Built-in Agents': '組み込みエージェント',
  'Using: {{count}} agents': '使用中: {{count}} エージェント',
  'View Agent': 'エージェントを表示',
  'Edit Agent': 'エージェントを編集',
  'Delete Agent': 'エージェントを削除',
  Back: '戻る',
  'No agent selected': 'エージェントが選択されていません',
  'File Path: ': 'ファイルパス: ',
  'Tools: ': 'ツール: ',
  'Color: ': '色: ',
  'Description:': '説明:',
  'System Prompt:': 'システムプロンプト:',
  'Open in editor': 'エディタで開く',
  'Edit tools': 'ツールを編集',
  'Edit color': '色を編集',
  '✗ Error:': '✗ エラー:',
  'Are you sure you want to delete agent "{{name}}"?':
    'エージェント "{{name}}" を削除してもよろしいですか?',
  'Project Level (.o1-code/agents/)': 'プロジェクトレベル (.o1-code/agents/)',
  'User Level (~/.o1-code/agents/)': 'ユーザーレベル (~/.o1-code/agents/)',
  '✓ Subagent Created Successfully!': '✓ サブエージェントの作成に成功しました!',
  'Subagent "{{name}}" has been saved to {{level}} level.':
    'サブエージェント "{{name}}" を {{level}} に保存しました',
  'Name: ': '名前: ',
  'Location: ': '場所: ',
  '✗ Error saving subagent:': '✗ サブエージェント保存エラー:',
  'Warnings:': '警告:',
  'Step {{n}}: Choose Location': 'ステップ {{n}}: 場所を選択',
  'Step {{n}}: Choose Generation Method': 'ステップ {{n}}: 作成方法を選択',
  'Generate with O1-Code (Recommended)': 'O1-Code で生成(推奨)',
  'Manual Creation': '手動作成',
  'Generating subagent configuration...': 'サブエージェント設定を生成中...',
  'Failed to generate subagent: {{error}}':
    'サブエージェントの生成に失敗: {{error}}',
  'Step {{n}}: Describe Your Subagent':
    'ステップ {{n}}: サブエージェントを説明',
  'Step {{n}}: Enter Subagent Name': 'ステップ {{n}}: サブエージェント名を入力',
  'Step {{n}}: Enter System Prompt': 'ステップ {{n}}: システムプロンプトを入力',
  'Step {{n}}: Enter Description': 'ステップ {{n}}: 説明を入力',
  'Step {{n}}: Select Tools': 'ステップ {{n}}: ツールを選択',
  'All Tools (Default)': '全ツール(デフォルト)',
  'All Tools': '全ツール',
  'Read-only Tools': '読み取り専用ツール',
  'Read & Edit Tools': '読み取り＆編集ツール',
  'Read & Edit & Execution Tools': '読み取り＆編集＆実行ツール',
  'Selected tools:': '選択されたツール:',
  'Step {{n}}: Choose Background Color': 'ステップ {{n}}: 背景色を選択',
  'Step {{n}}: Confirm and Save': 'ステップ {{n}}: 確認して保存',
  'Esc to cancel': 'Esc でキャンセル',
  cancel: 'キャンセル',
  'go back': '戻る',
  '↑↓ to navigate, ': '↑↓ で移動、',
  'Name cannot be empty.': '名前は空にできません',
  'System prompt cannot be empty.': 'システムプロンプトは空にできません',
  'Description cannot be empty.': '説明は空にできません',
  'Failed to launch editor: {{error}}': 'エディタの起動に失敗: {{error}}',
  'Failed to save and edit subagent: {{error}}':
    'サブエージェントの保存と編集に失敗: {{error}}',
  'Name "{{name}}" already exists at {{level}} level - will overwrite existing subagent':
    '"{{name}}" は {{level}} に既に存在します - 既存のサブエージェントを上書きします',
  'Name "{{name}}" exists at user level - project level will take precedence':
    '"{{name}}" はユーザーレベルに存在します - プロジェクトレベルが優先されます',
  'Name "{{name}}" exists at project level - existing subagent will take precedence':
    '"{{name}}" はプロジェクトレベルに存在します - 既存のサブエージェントが優先されます',
  'Description is over {{length}} characters':
    '説明が {{length}} 文字を超えています',
  'System prompt is over {{length}} characters':
    'システムプロンプトが {{length}} 文字を超えています',
  'Describe what this subagent should do and when it should be used. (Be comprehensive for best results)':
    'このサブエージェントの役割と使用タイミングを説明してください(詳細に記述するほど良い結果が得られます)',
  'e.g., Expert code reviewer that reviews code based on best practices...':
    '例: ベストプラクティスに基づいてコードをレビューするエキスパートレビュアー...',
  'All tools selected, including MCP tools':
    'MCP tools を含むすべてのツールを選択',
  'Read-only tools:': '読み取り専用ツール:',
  'Edit tools:': '編集ツール:',
  'Execution tools:': '実行ツール:',
  'Press Enter to save, e to save and edit, Esc to go back':
    'Enter で保存、e で保存して編集、Esc で戻る',
  'Press Enter to continue, {{navigation}}Esc to {{action}}':
    'Enter で続行、{{navigation}}Esc で{{action}}',
  'Enter a clear, unique name for this subagent.':
    'このサブエージェントの明確で一意な名前を入力してください',
  'e.g., Code Reviewer': '例: コードレビュアー',
  "Write the system prompt that defines this subagent's behavior. Be comprehensive for best results.":
    'このサブエージェントの動作を定義するシステムプロンプトを記述してください (詳細に書くほど良い結果が得られます)',
  'e.g., You are an expert code reviewer...':
    '例: あなたはエキスパートコードレビュアーです...',
  'Describe when and how this subagent should be used.':
    'このサブエージェントをいつどのように使用するかを説明してください',
  'e.g., Reviews code for best practices and potential bugs.':
    '例: ベストプラクティスと潜在的なバグについてコードをレビューします。',
  // Commands - General (continued)
  'To see changes, O1-Code must be restarted. Press r to exit and apply changes now.':
    '変更を確認するには O1-Code を再起動する必要があります。 r を押して終了し、変更を適用してください',
  'View and edit O1-Code settings': 'O1-Code の設定を表示・編集',
  Settings: '設定',
  'Vim Mode': 'Vim モード',
  'Output Format': '出力形式',
  'Hide Tips': 'ヒントを非表示',
  'Show Tool Call Arguments': 'ツール呼び出し引数を表示',
  Text: 'テキスト',
  JSON: 'JSON',
  Plan: 'プラン',
  'Ask permissions': '許可を確認',
  'Auto Edit': '自動編集',
  YOLO: 'YOLO',
  'toggle vim mode on/off': 'Vim モードのオン/オフを切り替え',
  'exit the cli': 'CLIを終了',
  Timeout: 'タイムアウト',
  'Max Retries': '最大リトライ回数',
  'Auto Accept': '自動承認',
  'Folder Trust': 'フォルダの信頼',
  'Debug Keystroke Logging': 'キーストロークのデバッグログ',
  'Hide Window Title': 'ウィンドウタイトルを非表示',
  'Show Status in Title': 'タイトルにステータスを表示',
  'Show Citations': '引用を表示',
  'Custom Witty Phrases': 'カスタムウィットフレーズ',
  'Screen Reader Mode': 'スクリーンリーダーモード',
  'Max Session Turns': '最大セッションターン数',
  'Skip Next Speaker Check': '次の発言者チェックをスキップ',
  'Skip Loop Detection': 'ループ検出をスキップ',
  'Skip Startup Context': '起動時コンテキストをスキップ',
  'Enable OpenAI Logging': 'OpenAI ログを有効化',
  'OpenAI Logging Directory': 'OpenAI ログディレクトリ',
  'Load Memory From Include Directories':
    'インクルードディレクトリからメモリを読み込み',
  'Respect .gitignore': '.gitignore を優先',
  'Respect .o1-codeignore': '.o1-codeignore を優先',
  'Enable Recursive File Search': '再帰的ファイル検索を有効化',
  'Show Color': '色を表示',
  'Use Ripgrep': 'Ripgrep を使用',
  'Use Builtin Ripgrep': '組み込み Ripgrep を使用',
  'Tool Output Truncation Threshold': 'ツール出力切り詰めのしきい値',
  'Tool Output Truncation Lines': 'ツール出力の切り詰め行数',
  'Tool Schema Compliance': 'Tool Schema 準拠',
  Unset: '未設定',
  'Auto (detect from system)': '自動(システムから検出)',
  'Auto (follow user input)': '自動(ユーザー入力に従う)',
  'Auto (detect terminal theme)': '自動（端末テーマを検出）',
  Auto: '自動',
  'Show model-specific usage statistics.': 'モデル別の使用統計を表示',
  'Show tool-specific usage statistics.': 'ツール別の使用統計を表示',
  'Show daily token usage statistics.': '日次 token 使用統計を表示',
  'Show monthly token usage statistics.': '月次 token 使用統計を表示',
  'Export token usage statistics to CSV or JSON.':
    'token 使用統計を CSV または JSON にエクスポート',
  'No usage data.': '使用データはありません。',
  '{{label}}: {{tokens}} tokens ({{requests}} requests)':
    '{{label}}: {{tokens}} tokens（{{requests}} リクエスト）',
  'Daily token usage for {{value}}': '{{value}} の日次 token 使用量',
  'Monthly token usage for {{value}}': '{{value}} の月次 token 使用量',
  'Total: {{tokens}} tokens': '合計: {{tokens}} tokens',
  'Requests: {{requests}}': 'リクエスト数: {{requests}}',
  'Breakdown:': '内訳:',
  'Input: {{tokens}}': '入力: {{tokens}}',
  'Output: {{tokens}}': '出力: {{tokens}}',
  'Cached (included in Input): {{tokens}}':
    'キャッシュ（入力に含まれる）: {{tokens}}',
  'Thoughts: {{tokens}}': '思考: {{tokens}}',
  'By model:': 'モデル別:',
  'By auth type:': '認証タイプ別:',
  'By model/auth type:': 'モデル/認証タイプ別:',
  'By source:': 'ソース別:',
  'Failed to load token usage stats: {{error}}':
    'token 使用統計の読み込みに失敗しました: {{error}}',
  'Expected --format csv or --format json.':
    '--format csv または --format json を指定してください。',
  'Expected a file path after --output.':
    '--output の後にファイルパスを指定してください。',
  'Unexpected argument: {{argument}}': '予期しない引数: {{argument}}',
  'Usage: /stats export <daily|monthly> [YYYY-MM-DD|YYYY-MM] [--format csv|json] [--output path]':
    '使い方: /stats export <daily|monthly> [YYYY-MM-DD|YYYY-MM] [--format csv|json] [--output path]',
  'Token usage export path must be within the project working directory.':
    'token 使用量のエクスポート先はプロジェクト作業ディレクトリ内である必要があります。',
  'Export target does not exist: {{path}}':
    'エクスポート先が存在しません: {{path}}',
  'Cannot resolve export path within the working directory.':
    '作業ディレクトリ内でエクスポートパスを解決できません。',
  'Could not create a temporary export file.':
    '一時エクスポートファイルを作成できませんでした。',
  'Token usage exported to {{format}}: {{path}}':
    'token 使用量を {{format}} にエクスポートしました: {{path}}',
  'Failed to export token usage stats: {{error}}':
    'token 使用統計のエクスポートに失敗しました: {{error}}',
  'Unclosed quote in arguments.': '引数の引用符が閉じられていません。',
  'Note: generation timing (TTFT/TPS) belongs to generation metrics.':
    '注: 生成時間（TTFT/TPS）は生成メトリクスに属します。',
  'Manage workspace directories': 'ワークスペースディレクトリを管理',
  'Add directories to the workspace. Use comma to separate multiple paths':
    'ワークスペースにディレクトリを追加。複数パスはカンマで区切ってください',
  'Show all directories in the workspace':
    'ワークスペース内のすべてのディレクトリを表示',
  'set external editor preference': '外部エディタの設定',
  'Manage extensions': '拡張機能を管理',
  'Manage installed extensions': 'インストール済みの拡張機能を管理する',
  'You are installing an extension from {{originSource}}. Some features may not work perfectly with O1-Code.':
    '{{originSource}} から拡張機能をインストールしています。一部の機能は O1-Code で完全に動作しない可能性があります。',
  'manage IDE integration': 'IDE連携を管理',
  'check status of IDE integration': 'IDE連携の状態を確認',
  'install required IDE companion for {{ideName}}':
    '{{ideName}} 用の必要なIDEコンパニオンをインストール',
  'enable IDE integration': 'IDE連携を有効化',
  'disable IDE integration': 'IDE連携を無効化',
  'IDE integration is not supported in your current environment. To use this feature, run O1-Code in one of these supported IDEs: VS Code or VS Code forks.':
    '現在の環境ではIDE連携はサポートされていません。この機能を使用するには、VS Code または VS Code 派生エディタで O1-Code を実行してください',
  'Configure terminal keybindings for multiline input (VS Code, Cursor, Windsurf, Trae)':
    '複数行入力用のターミナルキーバインドを設定(VS Code、Cursor、Windsurf、Trae)',
  'Please restart your terminal for the changes to take effect.':
    '変更を有効にするにはターミナルを再起動してください',
  'Failed to configure terminal: {{error}}':
    'ターミナルの設定に失敗: {{error}}',
  'Could not determine {{terminalName}} config path on Windows: APPDATA environment variable is not set.':
    'Windows で {{terminalName}} の設定パスを特定できません: APPDATA 環境変数が設定されていません',
  '{{terminalName}} keybindings.json exists but is not a valid JSON array. Please fix the file manually or delete it to allow automatic configuration.':
    '{{terminalName}} の keybindings.json は存在しますが、有効なJSON配列ではありません。ファイルを手動で修正するか、削除して自動設定を許可してください',
  'File: {{file}}': 'ファイル: {{file}}',
  'Failed to parse {{terminalName}} keybindings.json. The file contains invalid JSON. Please fix the file manually or delete it to allow automatic configuration.':
    '{{terminalName}} の keybindings.json の解析に失敗しました。ファイルに無効なJSONが含まれています。手動で修正するか、削除して自動設定を許可してください',
  'Error: {{error}}': 'エラー: {{error}}',
  'Shift+Enter binding already exists': 'Shift+Enter バインドは既に存在します',
  'Ctrl+Enter binding already exists': 'Ctrl+Enter バインドは既に存在します',
  'Existing keybindings detected. Will not modify to avoid conflicts.':
    '既存のキーバインドが検出されました。競合を避けるため変更をしません',
  'Please check and modify manually if needed: {{file}}':
    '必要に応じて手動で確認・変更してください: {{file}}',
  'Added Shift+Enter and Ctrl+Enter keybindings to {{terminalName}}.':
    '{{terminalName}} に Shift+Enter と Ctrl+Enter のキーバインドを追加しました',
  'Modified: {{file}}': '変更済み: {{file}}',
  '{{terminalName}} keybindings already configured.':
    '{{terminalName}} のキーバインドは既に設定されています',
  'Failed to configure {{terminalName}}.':
    '{{terminalName}} の設定に失敗しました',
  'Your terminal is already configured for an optimal experience with multiline input (Shift+Enter and Ctrl+Enter).':
    'ターミナルは複数行入力(Shift+Enter と Ctrl+Enter)に最適化されています',
  // ============================================================================
  // Commands - Hooks
  // ============================================================================
  'Manage O1-Code hooks': 'O1-Code のフックを管理する',
  'List all configured hooks': '設定済みのフックをすべて表示する',
  // Hooks - Dialog
  Hooks: 'フック',
  'Loading hooks...': 'フックを読み込んでいます...',
  'Error loading hooks:': 'フックの読み込みエラー：',
  'Press Escape to close': 'Escape キーで閉じる',
  'Press Escape, Ctrl+C, or Ctrl+D to cancel':
    'Escape、Ctrl+C、Ctrl+D でキャンセル',
  'Press Space, Enter, or Escape to dismiss': 'Space、Enter、Escape で閉じる',
  'No hook selected': 'フックが選択されていません',
  // Hooks - List Step
  'No hook events found.': 'フックイベントが見つかりません。',
  '{{count}} hook configured': '{{count}} 件のフックが設定されています',
  '{{count}} hooks configured': '{{count}} 件のフックが設定されています',
  'This menu is read-only. To add or modify hooks, edit settings.json directly or ask O1-Code.':
    'このメニューは読み取り専用です。フックを追加または変更するには、settings.json を直接編集するか、O1-Code に尋ねてください。',
  'Reopen this menu to reload hook definitions.':
    'このメニューを再度開くと、フック定義を再読み込みできます。',
  'Hook controls and HTTP security settings require a restart.':
    'フックの制御設定と HTTP セキュリティ設定の変更には再起動が必要です。',
  'Failed to reload hook definitions: {{error}}':
    'フック定義の再読み込みに失敗しました: {{error}}',
  'Enter to select · Esc to cancel': 'Enter で選択 · Esc でキャンセル',
  // Hooks - Detail Step
  'Exit codes:': '終了コード：',
  'Configured hooks:': '設定済みのフック：',
  'No hooks configured for this event.':
    'このイベントにはフックが設定されていません。',
  'To add hooks, edit settings.json directly or ask O1-Code.':
    'フックを追加するには、settings.json を直接編集するか、O1-Code に尋ねてください。',
  'Enter to select · Esc to go back': 'Enter で選択 · Esc で戻る',
  // Hooks - Config Detail Step
  'Hook details': 'フック詳細',
  'Event:': 'イベント：',
  'Extension:': '拡張機能：',
  'Desc:': '説明：',
  'No hook config selected': 'フック設定が選択されていません',
  'To modify or remove this hook, edit settings.json directly or ask O1-Code to help.':
    'このフックを変更または削除するには、settings.json を直接編集するか、O1-Code に尋ねてください。',
  // Hooks - Disabled Step
  'Hook Configuration - Disabled': 'フック設定 - 無効',
  'All hooks are currently disabled. You have {{count}} that are not running.':
    'すべてのフックは現在無効です。{{count}} が実行されていません。',
  '{{count}} configured hook': '{{count}} 個の設定されたフック',
  '{{count}} configured hooks': '{{count}} 個の設定されたフック',
  'When hooks are disabled:': 'フックが無効な場合：',
  'No hook commands will execute': 'フックコマンドは実行されません',
  'StatusLine will not be displayed': 'StatusLine は表示されません',
  'Tool operations will proceed without hook validation':
    'ツール操作はフック検証なしで続行されます',
  'To re-enable hooks, remove "disableAllHooks" from settings.json or ask O1-Code.':
    'フックを再有効化するには、settings.json から "disableAllHooks" を削除するか、O1-Code に尋ねてください。',
  // Hooks - Source
  Project: 'プロジェクト',
  User: 'ユーザー',
  Skill: 'スキル',
  System: 'システム',
  Extension: '拡張機能',
  'Local Settings': 'ローカル設定',
  'User Settings': 'ユーザー設定',
  'System Settings': 'システム設定',
  Extensions: '拡張機能',
  'Session (temporary)': 'セッション（一時）',
  // Hooks - Event Descriptions (short)
  'Before tool execution': 'ツール実行前',
  'After tool execution': 'ツール実行後',
  'After tool execution fails': 'ツール実行失敗時',
  'When notifications are sent': '通知送信時',
  'When the user submits a prompt': 'ユーザーがプロンプトを送信した時',
  'When a slash command expands into a prompt':
    'スラッシュコマンドがプロンプトに展開された時',
  'When a new session is started': '新しいセッションが開始された時',
  'Right before O1-Code concludes its response': 'O1-Code が応答を終了する直前',
  'When a subagent (Agent tool call) is started':
    'サブエージェント（Agent ツール呼び出し）が開始された時',
  'Right before a subagent concludes its response':
    'サブエージェントが応答を終了する直前',
  'Before conversation compaction': '会話圧縮前',
  'When a session is ending': 'セッション終了時',
  'When a permission dialog is displayed': '権限ダイアログ表示時',
  'When a new todo item is created': '新Todo項目作成時',
  'When a todo item is marked as completed': 'Todo項目完了時',
  // Hooks - Event Descriptions (detailed)
  'Input to command is JSON of tool call arguments.':
    'コマンドへの入力はツール呼び出し引数の JSON です。',
  'Input to command is JSON with fields "inputs" (tool call arguments) and "response" (tool call response).':
    'コマンドへの入力は "inputs"（ツール呼び出し引数）と "response"（ツール呼び出し応答）フィールドを持つ JSON です。',
  'Input to command is JSON with tool_name, tool_input, tool_use_id, error, error_type, is_interrupt, and is_timeout.':
    'コマンドへの入力は tool_name、tool_input、tool_use_id、error、error_type、is_interrupt、is_timeout を持つ JSON です。',
  'Input to command is JSON with notification message and type.':
    'コマンドへの入力は通知メッセージとタイプを持つ JSON です。',
  'Input to command is JSON with "prompt" (the current model-bound prompt) and optional "submitted_prompt" (the text projection captured at a supported submission boundary).':
    'コマンド入力は、"prompt"（現在のモデル向けプロンプト）と、オプションの "submitted_prompt"（サポート対象の送信境界でキャプチャされたテキスト投影）を含む JSON です。',
  'Input to command is JSON with command_name, command_args, and expanded prompt text.':
    'コマンドへの入力は command_name、command_args、展開後のプロンプトテキストを持つ JSON です。',
  'Input to command is JSON with session start source.':
    'コマンドへの入力はセッション開始ソースを持つ JSON です。',
  'Input to command is JSON with session end reason.':
    'コマンドへの入力はセッション終了理由を持つ JSON です。',
  'Input to command is JSON with agent_id and agent_type.':
    'コマンドへの入力は agent_id と agent_type を持つ JSON です。',
  'Input to command is JSON with agent_id, agent_type, and agent_transcript_path.':
    'コマンドへの入力は agent_id、agent_type、agent_transcript_path を持つ JSON です。',
  'Input to command is JSON with compaction details.':
    'コマンドへの入力は圧縮詳細を持つ JSON です。',
  'Input to command is JSON with tool_name, tool_input, and tool_use_id. Output JSON with hookSpecificOutput containing decision to allow or deny.':
    'コマンドへの入力は tool_name、tool_input、tool_use_id を持つ JSON です。許可または拒否の決定を含む hookSpecificOutput を持つ JSON を出力します。',
  'Input to command is JSON with todo_id, todo_content, todo_status, all_todos, and phase. In validation, output JSON with decision (allow/block/deny) and reason. In postWrite, block/deny is ignored.':
    'コマンドへの入力は todo_id、todo_content、todo_status、all_todos、phase を持つ JSON です。validation では decision（allow/block/deny）と reason を持つ JSON を出力します。postWrite では block/deny は無視されます。',
  'Input to command is JSON with todo_id, todo_content, previous_status, all_todos, and phase. In validation, output JSON with decision (allow/block/deny) and reason. In postWrite, block/deny is ignored.':
    'コマンドへの入力は todo_id、todo_content、previous_status、all_todos、phase を持つ JSON です。validation では decision（allow/block/deny）と reason を持つ JSON を出力します。postWrite では block/deny は無視されます。',
  // Hooks - Exit Code Descriptions
  'stdout/stderr not shown': 'stdout/stderr は表示されません',
  'show stderr to model and continue conversation':
    'stderr をモデルに表示し、会話を続ける',
  'show stderr to user only': 'stderr をユーザーのみに表示',
  'stdout shown in transcript mode (ctrl+o)':
    'stdout はトランスクリプトモードで表示 (ctrl+o)',
  'show stderr to model immediately': 'stderr をモデルに即座に表示',
  'show stderr to user only but continue with tool call':
    'stderr をユーザーのみに表示し、ツール呼び出しを続ける',
  'block processing, erase original prompt, and show stderr to user only':
    '処理をブロックし、元のプロンプトを消去し、stderr をユーザーのみに表示',
  'block expanded prompt submission and show stderr to user only':
    '展開後のプロンプト送信をブロックし、stderr をユーザーのみに表示',
  'stdout shown to O1-Code': 'stdout を O1-Code に表示',
  'show stderr to user only (blocking errors ignored)':
    'stderr をユーザーのみに表示（ブロッキングエラーは無視）',
  'command completes successfully': 'コマンドが正常に完了',
  'stdout shown to subagent': 'stdout をサブエージェントに表示',
  'show stderr to subagent and continue having it run':
    'stderr をサブエージェントに表示し、実行を続ける',
  'stdout appended as custom compact instructions':
    'stdout をカスタム圧縮指示として追加',
  'block compaction': '圧縮をブロック',
  'show stderr to user only but continue with compaction':
    'stderr をユーザーのみに表示し、圧縮を続ける',
  'use hook decision if provided': '提供されている場合はフックの決定を使用',
  'allow todo creation': 'Todo作成を許可',
  'block todo creation and show reason to model':
    'Todo作成をブロックし、理由をモデルに表示',
  'allow todo completion': 'Todo完了を許可',
  'block todo completion and show reason to model':
    'Todo完了をブロックし、理由をモデルに表示',
  // Hooks - Messages
  'Config not loaded.': '設定が読み込まれていません。',
  'Hooks are not enabled. Enable hooks in settings to use this feature.':
    'フックが有効になっていません。この機能を使用するには設定でフックを有効にしてください。',
  // ============================================================================
  // Commands - Session Export
  // ============================================================================
  'Export current session message history to a file':
    '現在のセッションのメッセージ履歴をファイルにエクスポートする',
  'Export session to HTML format': 'セッションを HTML 形式でエクスポートする',
  'Export session to JSON format': 'セッションを JSON 形式でエクスポートする',
  'Export session to JSONL format (one message per line)':
    'セッションを JSONL 形式でエクスポートする（1 行に 1 メッセージ）',
  'Export session to markdown format':
    'セッションを Markdown 形式でエクスポートする',

  // ============================================================================
  // Commands - Insights
  // ============================================================================
  'generate personalized programming insights from your chat history':
    'チャット履歴からパーソナライズされたプログラミングインサイトを生成する',

  // ============================================================================
  // Commands - Session History
  // ============================================================================
  'Resume a previous session': '前のセッションを再開する',
  'Fork the current conversation into a new session':
    '現在の会話を新しいセッションに分岐する',
  'Spawn a background agent that inherits the full conversation':
    '会話全体を引き継ぐバックグラウンドエージェントを起動する',
  'Please provide a directive. Usage: /fork <directive>':
    '指示を入力してください。使用法: /fork <指示>',
  'Cannot fork while a response or tool call is in progress. Wait for it to finish or resolve the pending tool call.':
    '応答またはツール呼び出しの処理中はフォークできません。完了するか、保留中のツール呼び出しを解決してください。',
  'Cannot fork before the first conversation turn.':
    '最初の会話ターンの前にはフォークできません。',
  'The agent tool is unavailable; cannot fork.':
    'エージェントツールを利用できないため、フォークできません。',
  'Failed to launch fork: {{error}}': 'フォークの起動に失敗しました: {{error}}',
  'User launched a background fork via /fork: {{directive}}':
    'ユーザーが /fork でバックグラウンドフォークを起動しました: {{directive}}',
  'Forked into a background agent. It inherits this conversation and runs without blocking — track it in the background tasks panel; it reports back when done.':
    'バックグラウンドエージェントにフォークしました。この会話を引き継ぎ、ブロックせずに実行されます — バックグラウンドタスクパネルで追跡でき、完了時に報告します。',
  'Cannot branch while a response or tool call is in progress. Wait for it to finish or resolve the pending tool call.':
    '応答またはツール呼び出しの処理中は分岐できません。完了するか、保留中のツール呼び出しを解決してください。',
  'No conversation to branch.': '分岐できる会話がありません。',
  'Restore a tool call. This will reset the conversation and file history to the state it was in when the tool call was suggested':
    'ツール呼び出しを復元します。これにより、会話とファイルの履歴はそのツール呼び出しが提案された時点の状態に戻ります',
  'Could not detect terminal type. Supported terminals: VS Code, Cursor, Windsurf, and Trae.':
    'ターミナルの種類を検出できませんでした。サポートされているターミナル: VS Code、Cursor、Windsurf、Trae',
  'Terminal "{{terminal}}" is not supported yet.':
    'ターミナル "{{terminal}}" はまだサポートされていません',
  // Commands - Language
  'Invalid language. Available: {{options}}':
    '無効な言語です。使用可能: {{options}}',
  'Language subcommands do not accept additional arguments.':
    '言語サブコマンドは追加の引数を受け付けません',
  'Current UI language: {{lang}}': '現在のUI言語: {{lang}}',
  'Current LLM output language: {{lang}}': '現在のLLM出力言語: {{lang}}',
  'Set UI language': 'UI言語を設定',
  'Set LLM output language': 'LLM出力言語を設定',
  'Usage: /language ui [{{options}}]': '使い方: /language ui [{{options}}]',
  'Usage: /language output <language>': '使い方: /language output <言語>',
  'Example: /language output 中文': '例: /language output 中文',
  'Example: /language output English': '例: /language output English',
  'Example: /language output 日本語': '例: /language output 日本語',
  'UI language changed to {{lang}}': 'UI言語を {{lang}} に変更しました',
  'Please restart the application for the changes to take effect.':
    '変更を有効にするにはアプリケーションを再起動してください',
  'Failed to generate LLM output language rule file: {{error}}':
    'LLM出力言語ルールファイルの生成に失敗: {{error}}',
  'Invalid command. Available subcommands:':
    '無効なコマンドです。使用可能なサブコマンド:',
  'Available subcommands:': '使用可能なサブコマンド:',
  'To request additional UI language packs, please open an issue on GitHub.':
    '追加のUI言語パックをリクエストするには、GitHub で Issue を作成してください',
  'Available options:': '使用可能なオプション:',
  'Set UI language to {{name}}': 'UI言語を {{name}} に設定',
  'Analyze only, do not modify files or execute commands':
    '分析のみ、ファイルの変更やコマンドの実行はしません',
  'Require approval for file edits or shell commands':
    'ファイル編集やシェルコマンドには承認が必要',
  'Automatically approve file edits': 'ファイル編集を自動承認',
  'Use classifier to automatically approve safe tool calls':
    '分類器を使用して安全なツール呼び出しを自動承認',
  'Automatically approve all tools': 'すべてのツールを自動承認',
  'Workspace approval mode exists and takes priority. User-level change will have no effect.':
    'ワークスペースの承認モードが存在し、優先されます。ユーザーレベルの変更は効果がありません',
  'Apply To': '適用先',
  'Workspace Settings': 'ワークスペース設定',
  'Open auto-memory folder': '自動メモリフォルダを開く',
  'Auto-memory: {{status}}': '自動メモリ: {{status}}',
  'Auto-dream: {{status}} · {{lastDream}} · /dream to run':
    '自動統合: {{status}} · {{lastDream}} · /dream で実行',
  'Auto-skill: {{status}}': '自動スキル: {{status}}',
  never: '未実行',
  on: 'オン',
  off: 'オフ',
  'Remove matching entries from managed auto-memory.':
    'マネージド自動メモリから一致するエントリを削除する。',
  'Usage: /forget <memory text to remove>':
    '使い方: /forget <削除するメモリテキスト>',
  'No managed auto-memory entries matched: {{query}}':
    '一致するマネージド自動メモリエントリなし: {{query}}',
  'Consolidate managed auto-memory topic files.':
    'マネージド自動メモリトピックファイルを統合する。',
  'No MCP servers configured.': 'MCP servers が設定されていません',
  'Could not retrieve tool registry.': 'ツールレジストリを取得できませんでした',
  "Successfully authenticated and refreshed tools for '{{name}}'.":
    "'{{name}}' の認証とツール更新に成功しました",
  "Re-discovering tools from '{{name}}'...":
    "'{{name}}' からツールを再検出中...",
  "Discovered {{count}} tool(s) from '{{name}}'.":
    "'{{name}}' から {{count}} 個のツールを検出しました。",
  'Authentication complete. Returning to server details...':
    '認証完了。サーバー詳細に戻ります...',
  'Authentication successful.': '認証成功。',
  'Configured MCP servers:': '設定済み MCP servers:',
  Ready: '準備完了',
  Disconnected: '切断',
  '{{count}} tool': '{{count}} ツール',
  '{{count}} tools': '{{count}} ツール',
  'Generate a project summary and save it to .o1-code/PROJECT_SUMMARY.md':
    'プロジェクトサマリーを生成し、.o1-code/PROJECT_SUMMARY.md に保存',
  'No chat client available to generate summary.':
    'サマリーを生成するためのチャットクライアントがありません',
  'Already generating summary, wait for previous request to complete':
    'サマリー生成中です。前のリクエストの完了をお待ちください',
  'No conversation found to summarize.': '要約する会話が見つかりません',
  'Summary path already exists and is not a generated summary: {{path}}':
    'サマリーパスは既に存在し、生成されたサマリーではありません: {{path}}',
  'Summary path must be within the project root.':
    'サマリーパスはプロジェクトルート内にある必要があります',
  'Summary path resolves to an existing directory: {{path}}':
    'サマリーパスは既存のディレクトリに解決されます: {{path}}',
  'Summary path ends with a separator but is an existing file: {{path}}':
    'サマリーパスは区切り文字で終わっていますが、既存のファイルです: {{path}}',
  'Failed to generate project context summary: {{error}}':
    'プロジェクトコンテキストサマリーの生成に失敗: {{error}}',
  'Saved project summary to {{filePathForDisplay}}.':
    'プロジェクトサマリーを {{filePathForDisplay}} に保存しました',
  'Saving project summary...': 'プロジェクトサマリーを保存中...',
  'Generating project summary...': 'プロジェクトサマリーを生成中...',
  'Processing summary...': 'サマリーを処理中...',
  'Project summary generated and saved successfully!':
    'プロジェクトサマリーを生成して保存しました！',
  'Saved to: {{filePath}}': '保存先: {{filePath}}',
  'Stopped because': '停止理由',
  'Failed to generate summary - no text content received from LLM response':
    'サマリーの生成に失敗 - LLMレスポンスからテキストコンテンツを受信できませんでした',
  // Model
  'Switch the model for this session (--fast for suggestion model, [model-id] to switch immediately).':
    'このセッションのモデルを切り替え（--fast で提案モデルを設定）',
  'Set a lighter model for prompt suggestions and speculative execution':
    'プロンプト提案と投機的実行用の軽量モデルを設定',
  'Content generator configuration not available.':
    'コンテンツジェネレーター設定が利用できません',
  'Authentication type not available.': '認証タイプが利用できません',
  'No models available for the current authentication type ({{authType}}).':
    '現在の認証タイプ({{authType}})で利用可能なモデルはありません',
  // Needs translation
  // Clear
  'Starting a new session, resetting chat, and clearing terminal.':
    '新しいセッションを開始し、チャットをリセットし、ターミナルをクリアしています',
  'Starting a new session and clearing.':
    '新しいセッションを開始してクリアしています',
  // Compress
  'Already compressing, wait for previous request to complete':
    '圧縮中です。前のリクエストの完了をお待ちください',
  'Failed to compress chat history.': 'チャット履歴の圧縮に失敗しました',
  'Failed to compress chat history: {{error}}':
    'チャット履歴の圧縮に失敗: {{error}}',
  'Compressing chat history': 'チャット履歴を圧縮中',
  'Chat history compressed from {{originalTokens}} to {{newTokens}} tokens.':
    'チャット履歴を {{originalTokens}} トークンから {{newTokens}} トークンに圧縮しました',
  'Compression was not beneficial for this history size.':
    'この履歴サイズには圧縮の効果がありませんでした',
  'Chat history compression did not reduce size. This may indicate issues with the compression prompt.':
    'チャット履歴の圧縮でサイズが減少しませんでした。圧縮プロンプトに問題がある可能性があります',
  'Could not compress chat history due to a token counting error.':
    'トークンカウントエラーのため、チャット履歴を圧縮できませんでした',
  'Could not compress chat history because the compression summary was empty.':
    '圧縮サマリーが空だったため、チャット履歴を圧縮できませんでした',
  'Could not compress chat history because the compression summary was truncated.':
    '圧縮サマリーが切り詰められたため、チャット履歴を圧縮できませんでした',
  'Could not compress chat history due to an API error.':
    'API エラーのため、チャット履歴を圧縮できませんでした',
  // Directory
  'Configuration is not available.': '設定が利用できません',
  'Please provide at least one path to add.':
    '追加するパスを少なくとも1つ指定してください',
  'The /directory add command is not supported in restrictive sandbox profiles. Please use --include-directories when starting the session instead.':
    '制限的なサンドボックスプロファイルでは /directory add コマンドはサポートされていません。代わりにセッション開始時に --include-directories を使用してください',
  "Error adding '{{path}}': {{error}}":
    "'{{path}}' の追加中にエラー: {{error}}",
  'Successfully added AGENTS.md files from the following directories if there are:\n- {{directories}}':
    '以下のディレクトリから AGENTS.md ファイルを追加しました(存在する場合):\n- {{directories}}',
  'Error refreshing memory: {{error}}': 'メモリの更新中にエラー: {{error}}',
  'Successfully added directories:\n- {{directories}}':
    'ディレクトリを正常に追加しました:\n- {{directories}}',
  'Current workspace directories:\n{{directories}}':
    '現在のワークスペースディレクトリ:\n{{directories}}',
  // Docs
  'Please open the following URL in your browser to view the documentation:\n{{url}}':
    'ドキュメントを表示するには、ブラウザで以下のURLを開いてください:\n{{url}}',
  'Opening documentation in your browser: {{url}}':
    '  ブラウザでドキュメントを開きました: {{url}}',
  // Dialogs - Tool Confirmation
  'Do you want to proceed?': '続行しますか?',
  'Yes, allow once': 'はい(今回のみ許可)',
  'Allow always': '常に許可する',
  Yes: 'はい',
  No: 'いいえ',
  'No (esc)': 'いいえ (Esc)',
  // MCP Management - Core translations
  'Manage MCP servers': 'MCP servers を管理',
  'Server Detail': 'サーバー詳細',
  Tools: 'ツール',
  'Tool Detail': 'ツール詳細',
  'Loading...': '読み込み中...',
  'Unknown step': '不明なステップ',
  'Esc to back': 'Esc 戻る',
  '↑↓ to navigate · Enter to select · Esc to close':
    '↑↓ ナビゲート · Enter 選択 · Esc 閉じる',
  '↑↓ to navigate · Enter to select · Esc to back':
    '↑↓ ナビゲート · Enter 選択 · Esc 戻る',
  '↑↓ to navigate · Enter to confirm · Esc to back':
    '↑↓ ナビゲート · Enter 確認 · Esc 戻る',
  'User Settings (global)': 'ユーザー設定（グローバル）',
  'Workspace Settings (project-specific)':
    'ワークスペース設定（プロジェクト固有）',
  'Disable server:': 'サーバーを無効化:',
  'Select where to add the server to the exclude list:':
    'サーバーを除外リストに追加する場所を選択してください:',
  'Press Enter to confirm, Esc to cancel': 'Enter で確認、Esc でキャンセル',
  Disable: '無効化',
  Enable: '有効化',
  Authenticate: '認証',
  'Re-authenticate': '再認証',
  'Clear Authentication': '認証をクリア',
  disabled: '無効',
  enabled: '有効',
  'disabled (bare mode)': '無効（ベアモード）',
  'disabled (safe mode)': '無効（セーフモード）',
  'disabled (disableAllHooks)': '無効（disableAllHooks）',
  'disabled (folder not trusted)': '無効（フォルダーが信頼されていません）',
  'disabled (turned off for this session)': '無効（このセッションでオフ）',
  'Server:': 'サーバー:',
  Reconnect: '再接続',
  'View tools': 'ツールを表示',
  'Status:': 'ステータス:',
  'Source:': 'ソース:',
  'Command:': 'コマンド:',
  'Working Directory:': '作業ディレクトリ:',
  'No server selected': 'サーバーが選択されていません',
  'Error:': 'エラー:',
  tool: 'ツール',
  tools: 'ツール',
  connected: '接続済み',
  connecting: '接続中',
  disconnected: '切断済み',
  error: 'エラー',

  // MCP Server List
  'User MCPs': 'ユーザーMCP',
  'Project MCPs': 'プロジェクトMCP',
  'Extension MCPs': '拡張機能MCP',
  server: 'サーバー',
  servers: 'サーバー',
  'Add MCP servers to your settings to get started.':
    '設定に MCP servers を追加して開始してください。',
  'Run o1-code --debug to see error logs':
    'o1-code --debug を実行してエラーログを確認してください',

  // MCP OAuth Authentication
  'OAuth Authentication': 'OAuth 認証',
  'Authenticating... Please complete the login in your browser.':
    '認証中... ブラウザでログインを完了してください。',
  // MCP Tool List
  'No tools available for this server.':
    'このサーバーには使用可能なツールがありません。',
  destructive: '破壊的',
  'read-only': '読み取り専用',
  'open-world': 'オープンワールド',
  idempotent: '冪等',
  'Tools for {{serverName}}': '{{serverName}} のツール',
  '{{current}}/{{total}}': '{{current}}/{{total}}',

  // MCP Tool Detail
  required: '必須',
  Parameters: 'パラメータ',
  'No tool selected': 'ツールが選択されていません',
  Server: 'サーバー',

  // Invalid tool related translations
  '{{count}} invalid tools': '{{count}} 個の無効なツール',
  invalid: '無効',
  'invalid: {{reason}}': '無効: {{reason}}',
  'missing name': '名前なし',
  'missing description': '説明なし',
  '(unnamed)': '(名前なし)',
  'Warning: This tool cannot be called by the LLM':
    '警告: このツールはLLMによって呼び出すことができません',
  Reason: '理由',
  'Tools must have both name and description to be used by the LLM.':
    'ツールはLLMによって使用されるには名前と説明の両方が必要です。',
  'Modify in progress:': '変更中:',
  'Save and close external editor to continue':
    '続行するには外部エディタを保存して閉じてください',
  'Apply this change?': 'この変更を適用しますか?',
  'Yes, allow always': 'はい、常に許可',
  'Modify with external editor': '外部エディタで編集',
  'No, suggest changes (esc)': 'いいえ、変更を提案 (Esc)',
  "Allow execution of: '{{command}}'?": "'{{command}}' の実行を許可しますか?",
  'Always allow in this project': 'このプロジェクトで常に許可',
  'Always allow {{action}} in this project':
    'このプロジェクトで{{action}}を常に許可',
  'Always allow for this user': 'このユーザーに常に許可',
  'Always allow {{action}} for this user': 'このユーザーに{{action}}を常に許可',
  'Yes, restore previous mode ({{mode}})':
    'はい、以前のモードに戻す ({{mode}})',
  'Yes, and auto-accept edits': 'はい、編集を自動承認',
  'Yes, and manually approve edits': 'はい、編集を手動承認',
  'Approve and run as a Goal': '承認してゴールとして実行',
  'No, keep planning (esc)': 'いいえ、計画を続ける (Esc)',
  'URLs to fetch:': '取得するURL:',
  'MCP Server: {{server}}': 'MCP Server: {{server}}',
  'Tool: {{tool}}': 'ツール: {{tool}}',
  'Allow execution of MCP tool "{{tool}}" from server "{{server}}"?':
    'MCP server "{{server}}" からの MCP tool "{{tool}}" の実行を許可しますか?',
  // Dialogs - Shell Confirmation
  'Shell Command Execution': 'シェルコマンド実行',
  'A custom command wants to run the following shell commands:':
    'カスタムコマンドが以下のシェルコマンドを実行しようとしています:',
  // Dialogs - Welcome Back
  'Current Plan:': '現在のプラン:',
  'Progress: {{done}}/{{total}} tasks completed':
    '進捗: {{done}}/{{total}} タスク完了',
  ', {{inProgress}} in progress': '、{{inProgress}} 進行中',
  'Pending Tasks:': '保留中のタスク:',
  'Current tasks': '現在のタスク',
  'Background tasks': 'バックグラウンドタスク',
  'No tasks currently running': '現在実行中のタスクはありません',
  'No entry to show.': '表示するエントリはありません。',
  'needs approval': '承認待ち',
  'Large workflow': '大規模なワークフロー',
  'Large workflow: {{agents}} agents scheduled (warning threshold {{cap}}).':
    '大規模なワークフロー：{{agents}} 個のエージェントを予定（警告しきい値 {{cap}}）。',
  'Large workflow: ~{{tokens}} output tokens projected (warning threshold {{cap}}).':
    '大規模なワークフロー：出力トークン ~{{tokens}} の見込み（警告しきい値 {{cap}}）。',
  'rejected — edit config to re-approve': '拒否済み — 設定を編集して再承認',
  'Background agent needs approval':
    'バックグラウンドエージェントが承認待ちです',
  'from nested agent': 'ネストされた agent から',
  'Approve or deny the request above':
    '上のリクエストを承認または拒否してください',
  Running: '実行中',
  Pausing: '一時停止に移行中',
  Paused: '一時停止中',
  'Pause is cooperative; in-flight work may finish before the workflow is paused. An agent call waiting on a tool approval keeps the run in this state and still counts against the active-time limit until the approval is answered.':
    '一時停止は協調的です。ワークフローが一時停止される前に、実行中の作業が完了する場合があります。ツール承認を待っているエージェント呼び出しは実行をこの状態に留め、承認に応答するまでアクティブ時間の上限に加算され続けます。',
  'Paused: no new agents will start; script code between agent calls keeps running. Press p to resume. /clear, /branch, and switching sessions cancel paused runs.':
    '一時停止中：新しいエージェントは開始されません。エージェント呼び出し間のスクリプトコードは実行を続けます。再開するには p を押してください。/clear、/branch、またはセッションを切り替えると、一時停止中の実行はキャンセルされます。',
  'Pause/resume was rejected; the workflow state changed. Try again.':
    '一時停止／再開は拒否されました。ワークフローの状態が変化しました。もう一度お試しください。',
  'Tip: use `/workflows p <runId>` or Background tasks + p to cooperatively pause/resume; use `/workflows <runId>` for details.':
    'ヒント：`/workflows p <runId>` またはバックグラウンドタスク + p で実行を協調的に一時停止／再開できます。詳細は `/workflows <runId>` で確認できます。',
  Completed: '完了',
  Failed: '失敗',
  Stopped: '停止済み',
  Shell: 'シェル',
  Monitor: 'モニター',
  Command: 'コマンド',
  Dream: 'Dream',
  '[dream] memory consolidation': '[dream] メモリ統合',
  '[dream] memory consolidation (reviewing {{count}} session)':
    '[dream] メモリ統合 ({{count}} セッションを確認中)',
  '[dream] memory consolidation (reviewing {{count}} sessions)':
    '[dream] メモリ統合 ({{count}} セッションを確認中)',
  '... and {{count}} more': '... 他 {{count}} 件',
  'What would you like to do?': '何をしますか?',
  'Choose how to proceed with your session:':
    'セッションの続行方法を選択してください:',
  'Start new chat session': '新しいチャットセッションを開始',
  'Continue previous conversation': '前回の会話を続行',
  'Welcome back! (Last updated: {{timeAgo}})':
    'おかえりなさい!(最終更新: {{timeAgo}})',
  'Overall Goal:': '全体目標:',
  'Connect a Provider': 'プロバイダーに接続',
  'You must connect a provider to proceed. Press Ctrl+C again to exit.':
    '続行するにはプロバイダーに接続してください。Ctrl+C をもう一度押すと終了します',
  'Terms of Services and Privacy Notice': '利用規約とプライバシー通知',
  'Paid \u00B7 Up to 6,000 requests/5 hrs \u00B7 All Alibaba Cloud Coding Plan Models':
    '有料 \u00B7 5時間最大6,000リクエスト \u00B7 すべての Alibaba Cloud Coding Plan モデル',
  'Alibaba Cloud Coding Plan': 'Alibaba Cloud Coding Plan',
  'Bring your own API key': '自分の API Key を使用',
  'Authentication is enforced to be {{enforcedType}}, but you are currently using {{currentType}}.':
    '認証は {{enforcedType}} に強制されていますが、現在 {{currentType}} を使用しています',
  'Authentication timed out. Please try again.':
    '認証がタイムアウトしました。再度お試しください',
  'Waiting for auth... (Press ESC or CTRL+C to cancel)':
    '認証を待っています... (ESC または CTRL+C でキャンセル)',
  'Failed to authenticate. Message: {{message}}':
    '認証に失敗しました。メッセージ: {{message}}',
  'Authenticated successfully with {{authType}} credentials.':
    '{{authType}} 認証情報で正常に認証されました',
  'Invalid O1CODE_DEFAULT_AUTH_TYPE value: "{{value}}". Valid values are: {{validValues}}':
    '無効な O1CODE_DEFAULT_AUTH_TYPE 値: "{{value}}"。有効な値: {{validValues}}',
  // Dialogs - Model
  'Select Model': 'モデルを選択',
  Modality: 'モダリティ',
  'Context Window': 'コンテキストウィンドウ',
  text: 'テキスト',
  'text-only': 'テキストのみ',
  image: '画像',
  pdf: 'PDF',
  audio: '音声',
  video: '動画',
  'not set': '未設定',
  none: 'なし',
  unknown: '不明',
  // Dialogs - Permissions
  'Manage folder trust settings': 'フォルダ信頼設定を管理',
  'Manage permission rules': 'permission rules を管理',
  Allow: '許可',
  Ask: '確認',
  Deny: '拒否',
  Workspace: 'ワークスペース',
  "O1-Code won't ask before using allowed tools.":
    'O1-Code は許可されたツールを使用する前に確認しません。',
  'O1-Code will ask before using these tools.':
    'O1-Code はこれらのツールを使用する前に確認します。',
  'O1-Code is not allowed to use denied tools.':
    'O1-Code は拒否されたツールを使用できません。',
  'Manage trusted directories for this workspace.':
    'このワークスペースの信頼済みディレクトリを管理します。',
  'Any use of the {{tool}} tool': '{{tool}} ツールのすべての使用',
  "{{tool}} commands matching '{{pattern}}'":
    "'{{pattern}}' に一致する {{tool}} コマンド",
  'From user settings': 'ユーザー設定から',
  'From project settings': 'プロジェクト設定から',
  'From session': 'セッションから',
  'Project settings': 'プロジェクト設定',
  'Checked in at .o1-code/settings.json':
    '.o1-code/settings.json にチェックイン',
  'User settings': 'ユーザー設定',
  'Saved in at ~/.o1-code/settings.json': '~/.o1-code/settings.json に保存',
  'Add a new rule…': '新しいルールを追加…',
  'Add {{type}} permission rule': '{{type}} permission rule を追加',
  'Permission rules are a tool name, optionally followed by a specifier in parentheses.':
    'permission rules はツール名で、オプションで括弧内に指定子を付けます。',
  'e.g.,': '例：',
  or: 'または',
  'Enter permission rule…': 'permission rule を入力…',
  'Enter to submit · Esc to cancel': 'Enter で送信 · Esc でキャンセル',
  'Where should this rule be saved?': 'このルールをどこに保存しますか？',
  'Enter to confirm · Esc to cancel': 'Enter で確認 · Esc でキャンセル',
  'Delete {{type}} rule?': '{{type}}ルールを削除しますか？',
  'Are you sure you want to delete this permission rule?':
    'この permission rule を削除してもよろしいですか？',
  'Permissions:': '権限：',
  '(←/→ or tab to cycle)': '（←/→ または Tab で切替）',
  'Press ↑↓ to navigate · Enter to select · Type to search · Esc to cancel':
    '↑↓ でナビゲート · Enter で選択 · 入力で検索 · Esc でキャンセル',
  'Search…': '検索…',
  // Workspace directory management
  'Add directory…': 'ディレクトリを追加…',
  'Add directory to workspace': 'ワークスペースにディレクトリを追加',
  'O1-Code can read files in the workspace, and make edits when auto-accept edits is on.':
    'O1-Code はワークスペース内のファイルを読み取り、自動編集承認が有効な場合は編集を行えます。',
  'O1-Code will be able to read files in this directory and make edits when auto-accept edits is on.':
    'O1-Code はこのディレクトリ内のファイルを読み取り、自動編集承認が有効な場合は編集を行えます。',
  'Enter the path to the directory:': 'ディレクトリのパスを入力してください:',
  'Enter directory path…': 'ディレクトリパスを入力…',
  'Tab to complete · Enter to add · Esc to cancel':
    'Tab で補完 · Enter で追加 · Esc でキャンセル',
  'Remove directory?': 'ディレクトリを削除しますか？',
  'Are you sure you want to remove this directory from the workspace?':
    'このディレクトリをワークスペースから削除してもよろしいですか？',
  '  (Original working directory)': '  （元の作業ディレクトリ）',
  '  (from settings)': '  （設定より）',
  'Directory does not exist.': 'ディレクトリが存在しません。',
  'Path is not a directory.': 'パスはディレクトリではありません。',
  'This directory is already in the workspace.':
    'このディレクトリはすでにワークスペースに含まれています。',
  'Already covered by existing directory: {{dir}}':
    '既存のディレクトリによって既にカバーされています: {{dir}}',
  // Status Bar
  'Using:': '使用中:',
  '{{count}} open file': '{{count}} 個のファイルを開いています',
  '{{count}} open files': '{{count}} 個のファイルを開いています',
  '(ctrl+g to view)': '(Ctrl+G で表示)',
  '{{count}} {{name}} file': '{{count}} {{name}} ファイル',
  '{{count}} {{name}} files': '{{count}} {{name}} ファイル',
  '{{count}} MCP server': '{{count}} MCP server',
  '{{count}} MCP servers': '{{count}} MCP servers',
  '{{count}} Blocked': '{{count}} ブロック',
  '(ctrl+t to view)': '(Ctrl+T で表示)',
  '(ctrl+t to toggle)': '(Ctrl+T で切り替え)',
  'Press Ctrl+C again to exit.': 'Ctrl+C をもう一度押すと終了します',
  'Press Ctrl+D again to exit.': 'Ctrl+D をもう一度押すと終了します',
  'Press Esc again to clear.': 'Esc をもう一度押すとクリアします',
  'Press ↑ to edit queued messages': '↑ を押してキュー内のメッセージを編集',
  // MCP Status
  '◌ MCP servers are starting up ({{count}} initializing)...':
    '◌ MCP servers を起動中({{count}} 初期化中)...',
  'Note: First startup may take longer. Tool availability will update automatically.':
    '注: 初回起動には時間がかかる場合があります。ツールの利用可能状況は自動的に更新されます',
  'Starting... (first startup may take longer)':
    '起動中...(初回起動には時間がかかる場合があります)',
  '{{count}} prompt': '{{count}} プロンプト',
  '{{count}} prompts': '{{count}} プロンプト',
  '(from {{extensionName}})': '({{extensionName}} から)',
  OAuth: 'OAuth',
  'OAuth expired': 'OAuth 期限切れ',
  'OAuth not authenticated': 'OAuth 未認証',
  'tools and prompts will appear when ready':
    'ツールとプロンプトは準備完了後に表示されます',
  '{{count}} tools cached': '{{count}} ツール(キャッシュ済み)',
  'Tools:': 'ツール:',
  'Parameters:': 'パラメータ:',
  'Prompts:': 'プロンプト:',
  'Resources:': 'リソース:',
  Blocked: 'ブロック',
  '★ Tips:': '★ ヒント:',
  Use: '使用',
  'to show server and tool descriptions': 'サーバーとツールの説明を表示',
  'to show tool parameter schemas': 'tool parameter schemas を表示',
  'to hide descriptions': '説明を非表示',
  'to authenticate with OAuth-enabled servers': 'OAuth対応サーバーで認証',
  Press: '押す',
  'to toggle tool descriptions on/off': 'ツール説明の表示/非表示を切り替え',
  "Starting OAuth authentication for MCP server '{{name}}'...":
    "MCP server '{{name}}' の OAuth 認証を開始中...",
  // Startup Tips
  'Tips:': 'ヒント：',
  'Use /compress when the conversation gets long to summarize history and free up context.':
    '会話が長くなったら /compress で履歴を要約し、コンテキストを解放できます。',
  'Start a fresh idea with /clear or /new; the previous session stays available in history.':
    '/clear または /new で新しいアイデアを始められます。前のセッションは履歴に残ります。',
  'Use /bug to submit issues to the maintainers when something goes off.':
    '問題が発生したら /bug でメンテナーに報告できます。',
  'Switch auth type quickly with /auth.':
    '/auth で認証タイプをすばやく切り替えられます。',
  'You can run any shell commands from O1-Code using ! (e.g. !ls).':
    'O1-Code から ! を使って任意のシェルコマンドを実行できます（例: !ls）。',
  'Type / to open the command popup; Tab autocompletes slash commands and saved prompts.':
    '/ を入力してコマンドポップアップを開きます。Tab でスラッシュコマンドと保存済みプロンプトを補完できます。',
  'You can resume a previous conversation by running o1-code --continue or o1-code --resume.':
    'o1-code --continue または o1-code --resume で前の会話を再開できます。',
  'You can switch permission mode quickly with Shift+Tab or /approval-mode.':
    'Shift+Tab または /approval-mode で権限モードをすばやく切り替えられます。',
  'You can switch permission mode quickly with Tab or /approval-mode.':
    'Tab または /approval-mode で権限モードをすばやく切り替えられます。',
  'Try /insight to generate personalized insights from your chat history.':
    '/insight でチャット履歴からパーソナライズされたインサイトを生成できます。',
  'Add an AGENTS.md file to give O1-Code persistent project context.':
    'AGENTS.md ファイルを追加すると、O1-Code に永続的なプロジェクトコンテキストを与えられます。',
  'Use /btw to ask a quick side question without disrupting the conversation.':
    '会話を中断せずに /btw でちょっとした横道の質問ができます。',
  'Context is almost full! Run /compress now or start /new to continue.':
    'コンテキストがもうすぐいっぱいです！今すぐ /compress を実行するか、/new を開始して続けてください。',
  'Context is getting full. Use /compress to free up space.':
    'コンテキストが埋まりつつあります。/compress を使って空きを増やしてください。',
  'Long conversation? /compress summarizes history to free context.':
    '会話が長くなりましたか？ /compress は履歴を要約してコンテキストを空けます。',
  // Exit Screen / Stats
  'Agent powering down. Goodbye!': 'エージェントを終了します。さようなら!',
  'To continue this session, run': 'このセッションを続行するには、次を実行:',
  'Interaction Summary': 'インタラクション概要',
  'Session ID:': 'セッションID:',
  'Tool Calls:': 'ツール呼び出し:',
  'Success Rate:': '成功率:',
  'User Agreement:': 'ユーザー同意:',
  reviewed: 'レビュー済み',
  'Code Changes:': 'コード変更:',
  Performance: 'パフォーマンス',
  'Generation Metrics': '生成メトリクス',
  'Latest Request': '最新のリクエスト',
  'Generation Time': '生成時間',
  'Average TTFT': '平均 TTFT',
  'Session TPS': 'セッション TPS',
  'Wall Time:': '経過時間:',
  'Agent Active:': 'エージェント稼働時間:',
  'API Time:': 'API時間:',
  'Tool Time:': 'ツール時間:',
  'Session Stats': 'セッション統計',
  'Model Usage': 'モデル使用量',
  Reqs: 'リクエスト',
  'Input Tokens': '入力トークン',
  'Output Tokens': '出力トークン',
  'Savings Highlight:': '節約ハイライト:',
  'of input tokens were served from the cache, reducing costs.':
    '入力トークンがキャッシュから提供され、コストを削減しました',
  'Tip: For a full token breakdown, run `/stats model`.':
    'ヒント: トークンの詳細な内訳は `/stats model` を実行してください',
  'Model Stats For Nerds': 'マニア向けモデル統計',
  'Tool Stats For Nerds': 'マニア向けツール統計',
  Metric: 'メトリック',
  API: 'API',
  Requests: 'リクエスト',
  Errors: 'エラー',
  'Avg Latency': '平均レイテンシ',
  Tokens: 'トークン',
  Total: '合計',
  Prompt: 'プロンプト',
  Cached: 'キャッシュ',
  Thoughts: '思考',
  Output: '出力',
  'No API calls have been made in this session.':
    'このセッションではAPI呼び出しが行われていません',
  'Tool Name': 'ツール名',
  Calls: '呼び出し',
  'Success Rate': '成功率',
  'Avg Duration': '平均時間',
  'User Decision Summary': 'ユーザー決定サマリー',
  'Total Reviewed Suggestions:': '総レビュー提案数:',
  ' » Accepted:': ' » 承認:',
  ' » Rejected:': ' » 却下:',
  ' » Modified:': ' » 変更:',
  ' Overall Agreement Rate:': ' 全体承認率:',
  'No tool calls have been made in this session.':
    'このセッションではツール呼び出しが行われていません',
  'Session start time is unavailable, cannot calculate stats.':
    'セッション開始時刻が利用できないため、統計を計算できません',
  Activity: 'アクティビティ',
  Efficiency: '効率',
  Today: '今日',
  'Token Trend': 'Token トレンド',
  'Cache Hit Rate': 'キャッシュヒット率',
  'Tool Success': 'ツール成功率',
  'Tool Leaderboard': 'ツールランキング',
  Time: '時間',
  Success: '成功率',
  Cache: 'キャッシュ',
  Latency: 'レイテンシ',
  'Code Impact': 'コード変更',
  net: '純増',
  streak: '連続',
  best: '最長',
  // Loading
  'Waiting for user confirmation...': 'ユーザーの確認を待っています...',
  // Witty Loading Phrases
  WITTY_LOADING_PHRASES: [
    '運任せで検索中...',
    '中の人がタイピング中...',
    'ロジックを最適化中...',
    '電子の数を確認中...',
    '宇宙のバグをチェック中...',
    '大量の0と1をコンパイル中...',
    'HDDと思い出をデフラグ中...',
    'ビットをこっそり入れ替え中...',
    'ニューロンの接続を再構築中...',
    'どこかに行ったセミコロンを捜索中...',
    'フラックスキャパシタを調整中...',
    'フォースと交感中...',
    'アルゴリズムをチューニング中...',
    '白いウサギを追跡中...',
    'カセットフーフー中...',
    'ローディングメッセージを考え中...',
    'ほぼ完了...多分...',
    '最新のミームについて調査中...',
    'この表示を改善するアイデアを思索中...',
    'この問題を考え中...',
    'それはバグでなく誰も知らない新機能だよ',
    'ダイヤルアップ接続音が終わるのを待機中...',
    'コードに油を追加中...',

    // かなり意訳が入ってるもの
    'イヤホンをほどき中...',
    'カフェインをコードに変換中...',
    '天動説を地動説に書き換え中...',
    'プールで時計の完成を待機中...',
    '笑撃的な回答を用意中...',
    '適切なミームを記述中...',
    'Aボタンを押して次へ...',
    'コードにリックロールを仕込み中...',
    'プログラマーが貧乏なのはキャッシュを使いすぎるから...',
    'プログラマーがダークモードなのはバグを見たくないから...',
    'コードが壊れた?叩けば治るさ',
    'USBの差し込みに挑戦中...',
  ],

  // ============================================================================
  // Custom API Key Configuration
  // ============================================================================
  'You can configure your API key and models in settings.json':
    'settings.json で API Key とモデルを設定できます',
  'Refer to the documentation for setup instructions':
    'セットアップ手順はドキュメントを参照してください',

  // ============================================================================
  // Coding Plan Authentication
  // ============================================================================
  'API key cannot be empty.': 'API Key は空にできません。',
  'You can get your Coding Plan API key here':
    'Coding Plan API Key はこちらで取得できます',
  'Failed to update Coding Plan configuration: {{message}}':
    'Coding Plan の設定更新に失敗しました: {{message}}',

  // ============================================================================
  // Auth Dialog - View Titles and Labels
  // ============================================================================
  'Coding Plan': 'Coding Plan',
  Custom: 'カスタム',
  'Select Region for Coding Plan': 'Coding Planのリージョンを選択',
  'Choose based on where your account is registered':
    'アカウントの登録先に応じて選択してください',
  'Enter Coding Plan API Key': 'Coding Plan API Key を入力',

  // ============================================================================
  // Coding Plan International Updates
  // ============================================================================
  'New model configurations are available for {{region}}. Update now?':
    '{{region}} の新しいモデル設定が利用可能です。今すぐ更新しますか？',
  '{{region}} configuration updated successfully. Model switched to "{{model}}".':
    '{{region}} の設定が正常に更新されました。モデルが "{{model}}" に切り替わりました。',
  // ============================================================================
  // Context Usage Component
  // ============================================================================
  'Context Usage': 'コンテキスト使用量',
  '% used': '% 使用',
  '% context used': '% コンテキスト使用',
  'Context exceeds limit! Use /compress or /clear to reduce.':
    'コンテキストが制限を超えています！/compress または /clear を使用して減らしてください。',
  'No API response yet. Send a message to see actual usage.':
    'API応答はありません。メッセージを送信して実際の使用量を確認してください。',
  'Estimated pre-conversation overhead': '推定事前会話オーバーヘッド',
  'Context window': 'コンテキストウィンドウ',
  tokens: 'トークン',
  Used: '使用済み',
  Free: '空き',
  'Autocompact buffer': '自動圧縮バッファ',
  'Usage by category': 'カテゴリ別の使用量',
  'System prompt': 'システムプロンプト',
  'Built-in tools': '組み込みツール',
  'MCP tools': 'MCP tools',
  'Memory files': 'メモリファイル',
  Skills: 'スキル',
  Messages: 'メッセージ',
  'Startup context': '起動時コンテキスト',
  Unattributed: '未分類',
  'Cached prefix': 'キャッシュ済みプレフィックス',
  'Run /context detail for per-item breakdown.':
    '/context detail を実行すると項目ごとの内訳を表示します。',
  active: '有効',
  'body loaded': '本文読み込み済み',
  memory: 'メモリ',
  '{{region}} configuration updated successfully.':
    '{{region}} の設定が正常に更新されました。',
  'Authenticated successfully with {{region}}. API key and model configs saved to settings.json.':
    '{{region}} での認証に成功しました。API Key とモデル設定が settings.json に保存されました。',
  'Tip: Use /model to switch between available Coding Plan models.':
    'ヒント: /model で利用可能な Coding Plan モデルを切り替えられます。',
  'Type something...': '何か入力...',
  Submit: '送信',
  'Submit answers': '回答を送信',
  Cancel: 'キャンセル',
  'Your answers:': 'あなたの回答：',
  '(not answered)': '(未回答)',
  'Ready to submit your answers?': '回答を送信しますか？',
  '↑/↓: Navigate | ←/→: Switch tabs | Enter: Select':
    '↑/↓: ナビゲート | ←/→: タブ切り替え | Enter: 選択',
  '↑/↓: Navigate | Enter: Select | Esc: Cancel':
    '↑/↓: ナビゲート | Enter: 選択 | Esc: キャンセル',
  'Authenticate using Alibaba Cloud Coding Plan':
    'Alibaba Cloud Coding Plan で認証する',
  'Region for Coding Plan (china/global)':
    'Coding Plan のリージョン (china/global)',
  'API key for Coding Plan': 'Coding Plan の API Key',
  'Show current authentication status': '現在の認証ステータスを表示',
  'Authentication completed successfully.': '認証が正常に完了しました。',
  'Processing Alibaba Cloud Coding Plan authentication...':
    'Alibaba Cloud Coding Plan 認証を処理しています...',
  'Successfully authenticated with Alibaba Cloud Coding Plan.':
    'Alibaba Cloud Coding Plan での認証に成功しました。',
  'Failed to authenticate with Coding Plan: {{error}}':
    'Coding Plan での認証に失敗しました: {{error}}',
  '阿里云百炼 (aliyun.com)': '阿里云百炼 (aliyun.com)',
  Global: 'グローバル',
  'Alibaba Cloud (alibabacloud.com)': 'Alibaba Cloud (alibabacloud.com)',
  'Select region for Coding Plan:': 'Coding Plan のリージョンを選択:',
  'Enter your Coding Plan API key: ':
    'Coding Plan の API Key を入力してください: ',
  'Select authentication method:': '認証方法を選択:',
  '\n=== Authentication Status ===\n': '\n=== 認証ステータス ===\n',
  '⚠  No authentication method configured.\n':
    '⚠  認証方法が設定されていません。\n',
  'Run one of the following commands to get started:\n':
    '以下のコマンドのいずれかを実行して開始してください:\n',
  'Or simply run:': 'または以下を実行:',
  '  o1-code auth             - Interactive authentication setup\n':
    '  o1-code auth             - インタラクティブ認証セットアップ\n',
  '  Limit: No longer available': '  制限: 利用不可',
  '✓ Authentication Method: Alibaba Cloud Coding Plan':
    '✓ 認証方法: Alibaba Cloud Coding Plan',
  'Global - Alibaba Cloud': 'グローバル - Alibaba Cloud',
  '  Region: {{region}}': '  リージョン: {{region}}',
  '  Current Model: {{model}}': '  現在のモデル: {{model}}',
  '  Config Version: {{version}}': '  設定バージョン: {{version}}',
  '  Status: API key configured\n': '  ステータス: API Key 設定済み\n',
  '⚠  Authentication Method: Alibaba Cloud Coding Plan (Incomplete)':
    '⚠  認証方法: Alibaba Cloud Coding Plan（不完全）',
  '  Issue: API key not found in environment or settings\n':
    '  問題: 環境変数または設定に API Key が見つかりません\n',
  '  Run `o1-code auth coding-plan` to re-configure.\n':
    '  `o1-code auth coding-plan` を実行して再設定してください。\n',
  '✓ Authentication Method: {{type}}': '✓ 認証方法: {{type}}',
  '  Status: Configured\n': '  ステータス: 設定済み\n',
  'Failed to check authentication status: {{error}}':
    '認証ステータスの確認に失敗しました: {{error}}',
  'Select an option:': 'オプションを選択:',
  'Raw mode not available. Please run in an interactive terminal.':
    'Rawモードが利用できません。インタラクティブターミナルで実行してください。',
  '(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)\n':
    '(↑ ↓ 矢印キーで移動、Enter で選択、Ctrl+C で終了)\n',
  'to expand details': '詳細を展開',
  'Switch to plan mode or exit plan mode':
    'プランモードに切り替えるか、プランモードを終了する',
  'Set how hard reasoning-capable models think ({{tiers}}); mapped and clamped per provider.':
    '推論対応モデルの思考の強さを設定します（{{tiers}}）。プロバイダーごとにマッピング・制限されます。',
  'Exited plan mode. Previous approval mode restored.':
    'プランモードを終了しました。以前の承認モードに戻りました。',
  'Enabled plan mode. The agent will analyze and plan without executing tools.':
    'プランモードを有効にしました。エージェントはツールを実行せずに分析と計画のみを行います。',
  'Already in plan mode. Use "/plan exit" to exit plan mode.':
    'すでにプランモードです。"/plan exit" でプランモードを終了します。',
  'Not in plan mode. Use "/plan" to enter plan mode first.':
    'プランモードではありません。"/plan" で先にプランモードに入ってください。',
  "Set up O1-Code's status line UI": 'O1-Code のステータスライン UI を設定',

  // === Core ===
  'Open the memory manager.': 'メモリマネージャーを開く。',
  'Save a durable memory to the memory system.':
    '永続メモリをメモリシステムに保存する。',
  prompts: 'プロンプト',
  '↑ to manage attachments': '↑ で添付を管理',
  '← → select, Delete to remove, ↓ to exit':
    '← → で選択、Delete で削除、↓ で終了',
  'Attachments: ': '添付: ',
  '(tab to cycle)': '(Tab で切り替え)',
  'Toggle this help display': 'このヘルプ表示を切り替え',
  'Toggle shell mode': 'シェルモードを切り替え',
  'Open command menu': 'コマンドメニューを開く',
  'Add file context': 'ファイルコンテキストを追加',
  'Accept suggestion / Autocomplete': '候補を受け入れる / 自動補完',
  'Reverse search history': '履歴を逆方向に検索',
  'Press ? again to close': '? をもう一度押して閉じる',
  'for shell mode': 'シェルモード用',
  'for commands': 'コマンド用',
  'for file paths': 'ファイルパス用',
  'to clear input': '入力をクリア',
  'to cycle approvals': '承認モードを切り替え',
  'to quit': '終了',
  'for newline': '改行',
  'to clear screen': '画面をクリア',
  'to search history': '履歴を検索',
  'to paste images': '画像を貼り付け',
  'for external editor': '外部エディタ用',
  '? for shortcuts': '? でショートカット表示',
  'Pasting…': '貼り付け中…',
  'Invalid approval mode "{{arg}}". Valid modes: {{modes}}':
    '無効な承認モード "{{arg}}" です。有効なモード: {{modes}}',
  'Approval mode set to "{{mode}}"': '承認モードを "{{mode}}" に設定しました',
  '(Use Enter to apply scope, Tab to go back)':
    '(Enter でスコープを適用、Tab で戻る)',
  'Extension Agents': '拡張エージェント',
  'Terminal Bell Notification': 'ターミナルベル通知',
  'Enable Usage Statistics': '使用統計を有効化',
  'Preferred Editor': '優先エディタ',
  'Auto-connect to IDE': 'IDE に自動接続',
  'Language: UI': '言語: UI',
  'Language: Model': '言語: モデル',
  'Show Line Numbers in Code': 'コードの行番号を表示',
  'Show Welcome Back Dialog': 'おかえりダイアログを表示',
  'Enable User Feedback': 'ユーザーフィードバックを有効化',
  'How is O1-Code doing this session? (optional)':
    'このセッションでの O1-Code の調子はどうですか？（任意）',
  'Interactive Shell (PTY)': '対話型シェル (PTY)',
  'Select Editor': 'エディタを選択',
  'Editor Preference': 'エディタ設定',
  'These editors are currently supported. Please note that some editors cannot be used in sandbox mode.':
    '現在サポートされているエディタです。サンドボックスモードでは一部のエディタが利用できない場合があります。',
  'Your preferred editor is:': '現在の優先エディタ:',
  'Open MCP management dialog': 'MCP 管理ダイアログを開く',
  'Install an extension from a git repo or local path':
    'git リポジトリまたはローカルパスから拡張機能をインストール',
  'Disable an extension': '拡張機能を無効化',
  'Enable an extension': '拡張機能を有効化',
  'Uninstall an extension': '拡張機能をアンインストール',
  'Manage extension settings': '拡張機能の設定を管理',
  'Lists installed extensions.': 'インストール済みの拡張機能を一覧表示します。',
  'Updates all extensions or a named extension to the latest version.':
    'すべての拡張機能、または指定した拡張機能を最新バージョンに更新します。',
  'Open extensions page in your browser': 'ブラウザで拡張機能ページを開く',
  'Manage Extensions': '拡張機能を管理',
  'Extension Details': '拡張機能の詳細',
  'View Extension': '拡張機能を表示',
  'Update Extension': '拡張機能を更新',
  'Disable Extension': '拡張機能を無効化',
  'Enable Extension': '拡張機能を有効化',
  'Uninstall Extension': '拡張機能をアンインストール',
  'Select Scope': 'スコープを選択',
  'User Scope': 'ユーザースコープ',
  'Workspace Scope': 'ワークスペーススコープ',
  'No extensions found.': '拡張機能が見つかりません。',
  'Are you sure you want to uninstall extension "{{name}}"?':
    '拡張機能 "{{name}}" をアンインストールしてもよろしいですか？',
  'This action cannot be undone.': 'この操作は元に戻せません。',
  'Extension "{{name}}" updated successfully.':
    '拡張機能 "{{name}}" を更新しました。',
  'Name:': '名前:',
  'MCP Servers:': 'MCP Servers:',
  'Settings:': '設定:',
  'View Details': '詳細を表示',
  'Update failed:': '更新に失敗しました:',
  'Updating {{name}}...': '{{name}} を更新中...',
  'Update complete!': '更新が完了しました！',
  'User (global)': 'ユーザー (グローバル)',
  'Workspace (project-specific)': 'ワークスペース (プロジェクト固有)',
  'Disable "{{name}}" - Select Scope': '"{{name}}" を無効化 - スコープを選択',
  'Enable "{{name}}" - Select Scope': '"{{name}}" を有効化 - スコープを選択',
  'No extension selected': '拡張機能が選択されていません',
  '{{count}} extensions installed': '{{count}} 個の拡張機能をインストール済み',
  'up to date': '最新',
  'update available': '更新あり',
  'checking...': '確認中...',
  'not updatable': '更新不可',
  'LLM output language set to {{lang}}':
    'LLM 出力言語を {{lang}} に設定しました',
  'Tool Approval Mode': 'ツール承認モード',
  'Ask a quick side question without affecting the main conversation':
    'メインの会話に影響を与えずに、ちょっとした質問をする',
  'Get a second opinion on the current conversation from a reviewer model':
    'レビューモデルに現在の会話についてのセカンドオピニオンを求める',
  'Consulting advisor...': 'アドバイザーに相談中...',
  'Advisor review failed: {{error}}':
    'アドバイザーレビューに失敗しました：{{error}}',
  'No conversation context available for /advisor':
    '/advisor に使用できる会話コンテキストがありません',
  'Focus too long (max {{max}} chars)':
    'フォーカスが長すぎます（最大 {{max}} 文字）',
  'Another operation is in progress, wait for it to complete before running /advisor':
    '別の操作が進行中です。完了するまで待ってから /advisor を実行してください',
  'No response received.': '応答がありませんでした。',
  'No model configured.': 'モデルが設定されていません。',
  'Manage Arena sessions': 'Arena セッションを管理',
  'Start an Arena session with multiple models competing on the same task':
    '同じタスクで複数モデルを競わせる Arena セッションを開始',
  'Stop the current Arena session': '現在の Arena セッションを停止',
  'Show the current Arena session status':
    '現在の Arena セッションの状態を表示',
  'Select a model result and merge its diff into the current workspace':
    'モデル結果を選択し、その差分を現在のワークスペースにマージ',
  'No running Arena session found.':
    '実行中の Arena セッションが見つかりません。',
  'No Arena session found. Start one with /arena start.':
    'Arena セッションが見つかりません。/arena start で開始してください。',
  'Arena session is still running. Wait for it to complete or use /arena stop first.':
    'Arena セッションはまだ実行中です。完了を待つか、最初に /arena stop を使用してください。',
  'No successful agent results to select from. All agents failed or were cancelled.':
    '選択可能な成功したエージェント結果がありません。すべてのエージェントが失敗したかキャンセルされました。',
  'Use /arena stop to end the session.':
    '/arena stop でセッションを終了してください。',
  'No idle agent found matching "{{name}}".':
    '"{{name}}" に一致するアイドルエージェントが見つかりません。',
  'Failed to apply changes from {{label}}: {{error}}':
    '{{label}} からの変更の適用に失敗しました: {{error}}',
  'Applied changes from {{label}} to workspace. Arena session complete.':
    '{{label}} からの変更をワークスペースに適用しました。Arena セッションが完了しました。',
  'Discard all Arena results and clean up worktrees?':
    'すべての Arena 結果を破棄してワークツリーをクリーンアップしますか？',
  'Arena results discarded. All worktrees cleaned up.':
    'Arena 結果が破棄されました。すべてのワークツリーがクリーンアップされました。',
  'Arena is not supported in non-interactive mode. Use interactive mode to start an Arena session.':
    'Arena は非対話モードではサポートされていません。対話モードで Arena セッションを開始してください。',
  'Arena is not supported in non-interactive mode. Use interactive mode to stop an Arena session.':
    'Arena は非対話モードではサポートされていません。対話モードで Arena セッションを停止してください。',
  'Arena is not supported in non-interactive mode.':
    'Arena は非対話モードではサポートされていません。',
  'An Arena session exists. Use /arena stop or /arena select to end it before starting a new one.':
    '既存の Arena セッションがあります。新しいセッションを開始する前に /arena stop または /arena select で終了してください。',
  'Usage: /arena start --models model1,model2 <task>':
    '使用法: /arena start --models model1,model2 <task>',
  'Models to compete (required, at least 2)':
    '競合させるモデル（必須、最低2つ）',
  'Format: authType:modelId or just modelId':
    '形式: authType:modelId または modelId のみ',
  'Arena requires at least 2 models. Use --models model1,model2 to specify.':
    'Arena には最低 2 つのモデルが必要です。--models model1,model2 で指定してください。',
  'Arena started with {{count}} agents on task: "{{task}}"\nModels:\n{{modelList}}':
    'Arena が {{count}} エージェントでタスク "{{task}}" を開始しました\nモデル:\n{{modelList}}',
  'Arena panes are running in tmux. Attach with: `{{command}}`':
    'Arena ペインが tmux で実行中です。次のコマンドで接続: `{{command}}`',
  '[{{label}}] failed: {{error}}': '[{{label}}] 失敗: {{error}}',
  'Loading suggestions...': '提案を読み込み中...',
  'Show context window usage breakdown. Use "/context detail" for per-item breakdown.':
    'コンテキストウィンドウ使用量の内訳を表示します。項目ごとの内訳は "/context detail" を使用してください。',
  'Show per-item context usage breakdown.':
    '項目ごとのコンテキスト使用量の内訳を表示します。',

  // === Missing key backfill ===
  Status: 'ステータス',
  'O1-Code': 'O1-Code',
  Runtime: 'ランタイム',
  OS: 'OS',
  Auth: '認証',
  Proxy: 'プロキシ',
  'Updating...': '更新中...',
  Unknown: '不明',
  Error: 'エラー',
  'Version:': 'バージョン:',
  "Use '/extensions install' to install your first extension.":
    "'/extensions install' を使って最初の拡張機能をインストールしてください。",
  Theme: 'テーマ',
  Bad: '悪い',
  Fine: '普通',
  Good: '良い',
  Dismiss: '閉じる',
  'No extensions installed.': 'インストールされた拡張機能はありません。',
  'Extension "{{name}}" not found.': '拡張機能 "{{name}}" が見つかりません。',
  'No extensions to update.': '更新する拡張機能はありません。',
  'Usage: /extensions install <source>': '使用法: /extensions install <source>',
  'Installing extension from "{{source}}"...':
    '"{{source}}" から拡張機能をインストールしています...',
  'Extension "{{name}}" installed successfully.':
    '拡張機能 "{{name}}" をインストールしました。',
  'Failed to install extension from "{{source}}": {{error}}':
    '"{{source}}" からの拡張機能インストールに失敗しました: {{error}}',
  'Do you want to continue? [Y/n]: ': '続行しますか？ [Y/n]: ',
  'Do you want to continue?': '続行しますか？',
  'Installing extension "{{name}}".':
    '拡張機能 "{{name}}" をインストールしています。',
  '**Extensions may introduce unexpected behavior. Ensure you have investigated the extension source and trust the author.**':
    '**拡張機能は予期しない動作を引き起こす可能性があります。ソースを確認し、作者を信頼できることを確認してください。**',
  'This extension will run the following MCP servers:':
    'この拡張機能は次の MCP servers を実行します:',
  local: 'ローカル',
  remote: 'リモート',
  'This extension will add the following commands: {{commands}}.':
    'この拡張機能は次のコマンドを追加します: {{commands}}。',
  'This extension will append info to your AGENTS.md context using {{fileName}}':
    'この拡張機能は {{fileName}} を使って AGENTS.md コンテキストに情報を追記します',
  'This extension will install the following skills:':
    'この拡張機能は次のスキルをインストールします:',
  'This extension will install the following subagents:':
    'この拡張機能は次のサブエージェントをインストールします:',
  'This extension will install the following workflows (JavaScript scripts that can start subagents):':
    'この拡張機能は次のワークフローをインストールします（サブエージェントを起動できる JavaScript スクリプト）:',
  'These workflow scripts changed since the installed version: {{names}}.':
    'インストール済みのバージョンから次のワークフロースクリプトが変更されています: {{names}}。',
  'Installation cancelled for "{{name}}".':
    '"{{name}}" のインストールをキャンセルしました。',
  '--ref and --auto-update are not applicable for marketplace extensions.':
    '--ref と --auto-update はマーケットプレイス拡張機能には適用できません。',
  'Extension "{{name}}" installed successfully and enabled.':
    '拡張機能 "{{name}}" をインストールし、有効化しました。',
  'The github URL, local path, or marketplace source (marketplace-url:plugin-name) of the extension to install.':
    'インストールする拡張機能の GitHub URL、ローカルパス、またはマーケットプレイスソース (marketplace-url:plugin-name)。',
  'The git ref to install from.': 'インストール元の git ref。',
  'Enable auto-update for this extension.':
    'この拡張機能の自動更新を有効にします。',
  'Enable pre-release versions for this extension.':
    'この拡張機能でプレリリース版を有効にします。',
  'Acknowledge the security risks of installing an extension and skip the confirmation prompt.':
    '拡張機能インストールのセキュリティリスクを了承し、確認プロンプトをスキップします。',
  'The source argument must be provided.':
    'source 引数を指定する必要があります。',
  'Extension "{{name}}" successfully uninstalled.':
    '拡張機能 "{{name}}" を正常にアンインストールしました。',
  'Uninstalls an extension.': '拡張機能をアンインストールします。',
  'The name or source path of the extension to uninstall.':
    'アンインストールする拡張機能の名前またはソースパス。',
  'Please include the name of the extension to uninstall as a positional argument.':
    'アンインストールする拡張機能名を位置引数として指定してください。',
  'Enables an extension.': '拡張機能を有効にします。',
  'The name of the extension to enable.': '有効化する拡張機能の名前。',
  'The scope to enable the extension in. If not set, will be enabled in all scopes.':
    '拡張機能を有効化するスコープ。未指定の場合はすべてのスコープで有効化されます。',
  'Extension "{{name}}" successfully enabled for scope "{{scope}}".':
    'スコープ "{{scope}}" で拡張機能 "{{name}}" を正常に有効化しました。',
  'Extension "{{name}}" successfully enabled in all scopes.':
    '拡張機能 "{{name}}" をすべてのスコープで正常に有効化しました。',
  'Invalid scope: {{scope}}. Please use one of {{scopes}}.':
    '無効なスコープです: {{scope}}。{{scopes}} のいずれかを指定してください。',
  'Disables an extension.': '拡張機能を無効にします。',
  'The name of the extension to disable.': '無効化する拡張機能の名前。',
  'The scope to disable the extension in.': '拡張機能を無効化するスコープ。',
  'Extension "{{name}}" successfully disabled for scope "{{scope}}".':
    'スコープ "{{scope}}" で拡張機能 "{{name}}" を正常に無効化しました。',
  'Extension "{{name}}" successfully updated: {{oldVersion}} → {{newVersion}}.':
    '拡張機能 "{{name}}" を更新しました: {{oldVersion}} → {{newVersion}}。',
  'Unable to install extension "{{name}}" due to missing install metadata':
    'インストールメタデータが不足しているため拡張機能 "{{name}}" をインストールできません',
  'Extension "{{name}}" is already up to date.':
    '拡張機能 "{{name}}" はすでに最新です。',
  'Update all extensions.': 'すべての拡張機能を更新します。',
  'The name of the extension to update.': '更新する拡張機能の名前。',
  'Either an extension name or --all must be provided':
    '拡張機能名または --all のいずれかを指定する必要があります',
  'Path:': 'パス:',
  'Type:': '種類:',
  'Ref:': '参照:',
  'Release tag:': 'リリースタグ:',
  'Enabled (User):': '有効 (ユーザー):',
  'Enabled (Workspace):': '有効 (ワークスペース):',
  'Context files:': 'コンテキストファイル:',
  'Skills:': 'スキル:',
  'Agents:': 'エージェント:',
  'Workflows:': 'ワークフロー:',
  'MCP servers:': 'MCP servers:',
  'Link extension failed to install.':
    'リンク拡張機能のインストールに失敗しました。',
  'Extension "{{name}}" linked successfully and enabled.':
    '拡張機能 "{{name}}" を正常にリンクし、有効化しました。',
  'Links an extension from a local path. Updates made to the local path will always be reflected.':
    'ローカルパスから拡張機能をリンクします。ローカルパスへの更新は常に反映されます。',
  'The name of the extension to link.': 'リンクする拡張機能の名前。',
  'Set a specific setting for an extension.':
    '拡張機能に特定の設定を行います。',
  'Name of the extension to configure.': '設定する拡張機能の名前。',
  'The setting to configure (name or env var).':
    '設定する項目 (名前または環境変数)。',
  'The scope to set the setting in.': '設定を適用するスコープ。',
  'List all settings for an extension.':
    '拡張機能のすべての設定を一覧表示します。',
  'Name of the extension.': '拡張機能の名前。',
  'Extension "{{name}}" has no settings to configure.':
    '拡張機能 "{{name}}" には設定可能な項目がありません。',
  'Settings for "{{name}}":': '"{{name}}" の設定:',
  '(workspace)': '(ワークスペース)',
  '(user)': '(ユーザー)',
  '[not set]': '[未設定]',
  '[value stored in keychain]': '[値はキーチェーンに保存されています]',
  'Value:': '値:',
  'Manage extension settings.': '拡張機能の設定を管理します。',
  'You need to specify a command (set or list).':
    'コマンド (set または list) を指定する必要があります。',
  'No plugins available in this marketplace.':
    'このマーケットプレイスで利用可能なプラグインはありません。',
  'Select a plugin to install from marketplace "{{name}}":':
    'マーケットプレイス "{{name}}" からインストールするプラグインを選択してください:',
  'Plugin selection cancelled.': 'プラグイン選択をキャンセルしました。',
  'Select a plugin from "{{name}}"': '"{{name}}" からプラグインを選択',
  'Use ↑↓ or j/k to navigate, Enter to select, Escape to cancel':
    '↑↓ または j/k で移動、Enter で選択、Escape でキャンセル',
  '{{count}} more above': '上にあと {{count}} 件',
  '{{count}} more below': '下にあと {{count}} 件',
  'Press c to copy the authorization URL to your clipboard.':
    'c キーで認証 URL をクリップボードにコピーします。',
  'Copy request sent to your terminal. If paste is empty, copy the URL above manually.':
    'コピー要求をターミナルに送信しました。貼り付け結果が空の場合は、上の URL を手動でコピーしてください。',
  'Cannot write to terminal — copy the URL above manually.':
    'ターミナルに書き込めないため、上の URL を手動でコピーしてください。',
  'Missing API key for OpenAI-compatible auth. Connect a provider with /auth, or set the {{envKeyHint}} environment variable.':
    'OpenAI 互換認証用の API Key がありません。/auth でプロバイダーを接続するか、環境変数 {{envKeyHint}} を設定してください。',
  '{{envKeyHint}} environment variable not found. Please set it in your .env file or environment variables.':
    '環境変数 {{envKeyHint}} が見つかりません。.env ファイルまたは環境変数に設定してください。',
  '{{envKeyHint}} environment variable not found. Connect a provider with /auth, or set it in your .env file or environment variables.':
    '環境変数 {{envKeyHint}} が見つかりません。/auth でプロバイダーを接続するか、.env ファイルまたは環境変数に設定してください。',
  'Forget the saved API key of a provider':
    'プロバイダーの保存済み API キーを削除する',
  'Provider id, as in ~/.o1-code/credentials/<id>.json':
    'プロバイダー ID（~/.o1-code/credentials/<id>.json と同じ）',
  'Invalid credential id "{{id}}": use lowercase letters, digits and dashes.':
    '無効な認証情報 ID "{{id}}": 小文字、数字、ハイフンを使用してください。',
  'Removed the saved key for {{id}} ({{file}}).':
    '{{id}} の保存済みキーを削除しました ({{file}})。',
  'No saved key for {{id}}.': '{{id}} の保存済みキーはありません。',
  'Removed the credential reference from {{count}} model entries in {{file}}.':
    '{{file}} の {{count}} 件のモデルエントリから認証情報の参照を削除しました。',
  'Missing API key for OpenAI-compatible auth. Set the {{envKeyHint}} environment variable.':
    'OpenAI 互換認証用の API Key がありません。環境変数 {{envKeyHint}} を設定してください。',
  'Anthropic provider missing required baseUrl in modelProviders[].baseUrl.':
    'Anthropic プロバイダーで必須の `modelProviders[].baseUrl` が設定されていません。',
  'ANTHROPIC_BASE_URL environment variable not found.':
    '環境変数 ANTHROPIC_BASE_URL が見つかりません。',
  'Invalid auth method selected.': '無効な認証方式が選択されました。',
  ' (this project)': ' (このプロジェクト)',
  ' (global)': ' (グローバル)',
  'Persist the model selection to the project settings (workspace scope)':
    'モデルの選択をプロジェクト設定に永続化（ワークスペーススコープ）',
  'Persist the model selection to the user settings (global scope)':
    'モデルの選択をユーザー設定に永続化（グローバルスコープ）',
  'API Key': 'API Key',
  '(default)': '(デフォルト)',
  '(not set)': '(未設定)',
  'Command Format Migration': 'コマンド形式の移行',
  'Found {{count}} TOML command file:':
    'TOML 形式のコマンドファイルが {{count}} 件見つかりました:',
  'Found {{count}} TOML command files:':
    'TOML 形式のコマンドファイルが {{count}} 件見つかりました:',
  'The TOML format is deprecated. Would you like to migrate them to Markdown format?':
    'TOML 形式は非推奨です。Markdown 形式へ移行しますか？',
  '(Backups will be created and original files will be preserved)':
    '(バックアップが作成され、元のファイルは保持されます)',
  'Enter value...': '値を入力...',
  'Enter sensitive value...': '機密な値を入力...',
  'Press Enter to submit, Escape to cancel':
    'Enter で送信、Escape でキャンセル',
  'Markdown file already exists: {{filename}}':
    'Markdown ファイルはすでに存在します: {{filename}}',
  'TOML Command Format Deprecation Notice':
    'TOML コマンド形式廃止予定のお知らせ',
  'Found {{count}} command file(s) in TOML format:':
    'TOML 形式のコマンドファイルが {{count}} 件見つかりました:',
  'The TOML format for commands is being deprecated in favor of Markdown format.':
    'コマンドの TOML 形式は廃止予定で、Markdown 形式に移行します。',
  'Markdown format is more readable and easier to edit.':
    'Markdown 形式はより読みやすく、編集しやすくなります。',
  'You can migrate these files automatically using:':
    '次の方法でこれらのファイルを自動移行できます:',
  'Or manually convert each file:': 'または各ファイルを手動で変換できます:',
  'TOML: prompt = "..." / description = "..."':
    'TOML: prompt = "..." / description = "..."',
  'Markdown: YAML frontmatter + content':
    'Markdown: YAML フロントマター + 本文',
  'The migration tool will:': '移行ツールは次を行います:',
  'Convert TOML files to Markdown': 'TOML ファイルを Markdown に変換',
  'Create backups of original files': '元のファイルのバックアップを作成',
  'Preserve all command functionality': 'すべてのコマンド機能を保持',
  'TOML format will continue to work for now, but migration is recommended.':
    'TOML 形式は当面引き続き使用できますが、移行を推奨します。',
  'Unknown extensions source: {{source}}.':
    '不明な拡張機能ソースです: {{source}}。',
  'Would open extensions page in your browser: {{url}} (skipped in test environment)':
    'ブラウザで拡張機能ページを開く予定でした: {{url}} (テスト環境のためスキップ)',
  'View available extensions at {{url}}': '{{url}} で利用可能な拡張機能を表示',
  'Opening extensions page in your browser: {{url}}':
    'ブラウザで拡張機能ページを開いています: {{url}}',
  'Failed to open browser. Check out the extensions gallery at {{url}}':
    'ブラウザを開けませんでした。拡張機能ギャラリーを {{url}} で確認してください',
  'Retrying in {{seconds}} seconds… (attempt {{attempt}}/{{maxRetries}})':
    '{{seconds}} 秒後に再試行します… ({{attempt}}/{{maxRetries}} 回目)',
  'Press Ctrl+Y to retry': 'Ctrl+Y で再試行',
  'No failed request to retry.': '再試行できる失敗したリクエストはありません。',
  'to retry last request': '最後のリクエストを再試行',
  'Invalid API key. Coding Plan API keys start with "sk-sp-". Please check.':
    '無効な API Key です。Coding Plan の API Key は "sk-sp-" で始まります。確認してください。',
  'Lock release warning': 'ロック解除の警告',
  'Metadata write warning': 'メタデータ書き込みの警告',
  "Subsequent dreams may be skipped as locked until the next session's staleness sweep cleans the file.":
    '次回のセッション期限切れクリーンアップでファイルが削除されるまで、以降の dream はロック中としてスキップされる可能性があります。',
  "The scheduler gate did not see this dream's timestamp; the next dream cycle may re-fire sooner than usual.":
    'スケジューラーゲートがこの dream のタイムスタンプを認識しませんでした。次の dream サイクルは通常より早く再実行される可能性があります。',
  // === History collapse/expand commands ===
  'Set history to collapse by default when resuming a session':
    'Set history to collapse by default when resuming a session',
  'Set history to expand by default when resuming a session':
    'Set history to expand by default when resuming a session',
  'Expand the currently collapsed history transcript':
    'Expand the currently collapsed history transcript',
  'Control history display preferences and visibility':
    'Control history display preferences and visibility',
  'History will be collapsed by default for future resumed sessions.':
    'History will be collapsed by default for future resumed sessions.',
  'History will be expanded by default for future resumed sessions.':
    'History will be expanded by default for future resumed sessions.',
  'History is already expanded in this session.':
    'History is already expanded in this session.',
  'Usage: /history collapse-on-resume|expand-on-resume|expand-now':
    'Usage: /history collapse-on-resume|expand-on-resume|expand-now',
  'History collapsed: {{n}} messages hidden. Use /history expand-now to show.':
    '履歴を折りたたみました：{{n}} 件のメッセージが非表示です。/history expand-now で表示します。',

  // === Same-as-English optimization ===
  ' (not in model registry)': '（モデルレジストリにありません）',
  'Attribution: commit': 'コミットの帰属表示',
  '中国 (China)': '中国',
  '中国 (China) - 阿里云百炼': '中国 - 阿里云百炼',

  // Stats Dashboard — Category 2 (missing from ja)
  'Activity Heatmap': 'アクティビティヒートマップ',
  Less: '少',
  More: '多',
  Sessions: 'セッション数',
  Duration: '所要時間',
  Projects: 'プロジェクト',
  'Loading stats...': '統計を読み込み中...',
  '(no data)': '(データなし)',
  d: '日',
  h: '時',
  m: '分',
  Input: '入力',
  Models: 'モデル',
  'All time': '全期間',
  'Last 7 days': '過去 7 日間',
  'Last 30 days': '過去 30 日間',
  'Show usage statistics dashboard.': '使用統計ダッシュボードを表示する。',

  // Stats Dashboard — keyboard hints (not translated)
  'tab \xB7 esc': 'tab \xB7 esc',
  'tab \xB7 r dates \xB7 \u2190\u2192 month \xB7 esc':
    'tab \xB7 r dates \xB7 \u2190\u2192 month \xB7 esc',
  'tab \xB7 r dates \xB7 esc': 'tab \xB7 r dates \xB7 esc',

  // Stats Dashboard — missing labels
  'API Requests': 'APIリクエスト',
  'Tool Calls': 'ツール呼び出し',
  'Success rate': '成功率',
  'Code Changes': 'コード変更',
  Tool: 'ツール',
  reqs: 'リクエスト',
  in: '入力',
  out: '出力',
  'In/Out': '入力/出力',
  // Update command
  'Check for O1-Code updates and install if available':
    'O1-Codeのアップデートを確認し、利用可能な場合はインストールします',
  'O1-Code update available! {{current}} → {{latest}}':
    'O1-Code のアップデートがあります！{{current}} → {{latest}}',
  'A new version of O1-Code is available! {{current}} → {{latest}}':
    'O1-Code の新しいバージョンがあります！{{current}} → {{latest}}',
  'O1-Code {{version}} is up to date!': 'O1-Code {{version}} は最新です！',
  'Failed to check for updates ({{reason}}). Please check your network or registry configuration.':
    'アップデートの確認に失敗しました（{{reason}}）。ネットワークまたはレジストリ設定を確認してください。',
  'Update check skipped ({{reason}}) — run /update to retry.':
    'アップデートの確認をスキップしました（{{reason}}）— /update で再試行できます。',
  'registry did not respond within {{seconds}}s':
    'レジストリが {{seconds}} 秒以内に応答しませんでした',
  'registry unreachable': 'レジストリに接続できません',
  'package not published on the registry':
    'パッケージがレジストリに公開されていません',
  'registry error': 'レジストリエラー',
  'Unable to check for updates: {{reason}}':
    'アップデートを確認できません: {{reason}}',
  'Update successful! The new version will be used on your next run.':
    'アップデート成功！新バージョンは次回起動時に使用されます。',
  'Update downloaded. It will be applied after you exit this session.':
    'アップデートをダウンロードしました。現在のセッション終了後に適用されます。',
  'Update failed: {{error}}': 'アップデート失敗：{{error}}',
  'Downloading update...': 'アップデートをダウンロードしています...',
  'Update successful! Please restart O1-Code to use the new version. Switching model providers before restarting may not work correctly.':
    'アップデートに成功しました！新しいバージョンを使用するには O1-Code を再起動してください。再起動前にモデルプロバイダーを切り替えると正しく動作しない場合があります。',
  'Automatic update failed. Please try updating manually.':
    '自動アップデートに失敗しました。手動で更新してください。',
  'Automatic update failed: {{error}}. Re-run the installer to update manually.':
    '自動更新に失敗しました: {{error}}。手動で更新するにはインストーラーを再実行してください。',
  'Running from a local git clone. Please update with "git pull".':
    'ローカル Git クローンから実行中です。"git pull" で更新してください。',
  'Running via npx, update not applicable.':
    'npx 経由で実行中のため、更新は適用されません。',
  'Running via pnpx, update not applicable.':
    'pnpx 経由で実行中のため、更新は適用されません。',
  'Running via bunx, update not applicable.':
    'bunx 経由で実行中のため、更新は適用されません。',
  'Installed via Homebrew. Please update with "brew upgrade".':
    'Homebrew 経由でインストールされています。"brew upgrade" で更新してください。',
  "Locally installed. Please update via your project's package.json.":
    'ローカルにインストールされています。プロジェクトの package.json 経由で更新してください。',
  'Update requires sudo. Please run:':
    '更新には sudo が必要です。次を実行してください:',
  'Standalone install detected. Attempting to automatically update now...':
    'スタンドアロンインストールを検出しました。自動更新を試行しています...',
  'Standalone install detected. Please rerun the standalone installer to update:':
    'スタンドアロンインストールを検出しました。更新するにはスタンドアロンインストーラーを再実行してください:',
  'Run the following to update:':
    '以下のコマンドを実行してアップデートしてください：',
  'Unable to auto-update this standalone installation. Please reinstall from:':
    'このスタンドアロンインストールを自動更新できません。以下から再インストールしてください：',
  'Manual update required. Please reinstall O1-Code.':
    '手動更新が必要です。O1-Codeを再インストールしてください。',
  'This session uses the custom sandbox image {{image}}. Update that image and restart O1-Code.':
    'このセッションではカスタムサンドボックスイメージ {{image}} を使用しています。イメージを更新して O1-Code を再起動してください。',
  'Update O1-Code on the host, then restart the sandbox.':
    'ホスト上の O1-Code を更新してから、サンドボックスを再起動してください。',
  'The update will be installed after you exit this session.':
    'このセッションを終了すると、更新が自動的にインストールされます。',
  'Run /update to install the update on the host.':
    '/update を実行してホストに更新をインストールしてください。',
  'Run /update to install the update.':
    '/update を実行して更新をインストールしてください。',

  // ============================================================================
  // reload-plugins command
  // ============================================================================
  '{{count}} extension': '{{count}} extension',
  '{{count}} extensions': '{{count}} extensions',
  '{{count}} command': '{{count}} command',
  '{{count}} commands': '{{count}} commands',
  '{{count}} skill': '{{count}} skill',
  '{{count}} skills': '{{count}} skills',
  '{{count}} agent': '{{count}} agent',
  '{{count}} agents': '{{count}} agents',
  '{{count}} workflow': '{{count}} workflow',
  '{{count}} workflows': '{{count}} workflows',
  '{{count}} hook': '{{count}} hook',
  '{{count}} hooks': '{{count}} hooks',
  '{{count}} extension MCP server': '{{count}} extension MCP server',
  '{{count}} extension MCP servers': '{{count}} extension MCP servers',
  '{{count}} extension LSP server': '{{count}} extension LSP server',
  '{{count}} extension LSP servers': '{{count}} extension LSP servers',
  'Reload extension changes from disk': 'Reload extension changes from disk',
  'Reloaded extensions: {{summary}}': 'Reloaded extensions: {{summary}}',
  'Reload failed: {{message}}': 'Reload failed: {{message}}',
  'Reload failed.': 'Reload failed.',
  'Extensions changed on disk. Run /reload-plugins to apply updates.':
    'Extensions changed on disk. Run /reload-plugins to apply updates.',
  'Failed to refresh extension content: {{message}}. Run /reload-plugins to apply updates.':
    'Failed to refresh extension content: {{message}}. Run /reload-plugins to apply updates.',
  'Failed to refresh extension content. Run /reload-plugins to apply updates.':
    'Failed to refresh extension content. Run /reload-plugins to apply updates.',
  'Extension reload did not complete. Run /reload-plugins to try again.':
    'Extension reload did not complete. Run /reload-plugins to try again.',
  'Session recording stopped after a write failure. New messages for the affected session will not be saved. Check disk space and permissions, then start a new session to resume recording. See the debug log for details.':
    '書き込みに失敗したため、セッションの記録を停止しました。影響を受けたセッションの新しいメッセージは保存されません。ディスク容量と権限を確認してから、新しいセッションを開始して記録を再開してください。詳細はデバッグログを確認してください。',
  'Session recording stopped after a write failure. New messages for the affected session will not be saved. Check disk space and permissions, then run `/clear` to start a new recorded session. See the debug log for details.':
    '書き込みに失敗したため、セッションの記録を停止しました。影響を受けたセッションの新しいメッセージは保存されません。ディスク容量と権限を確認してから、`/clear` を実行して記録可能な新しいセッションを開始してください。詳細はデバッグログを確認してください。',

  // ==========================================================================
  // Auto-skill curator (/curator command)
  // ==========================================================================
  'Maintain project auto-skills based on recent use.':
    '最近の使用状況に基づいてプロジェクトの自動スキルを管理します。',
  'Show project auto-skill lifecycle status.':
    'プロジェクトの自動スキルのライフサイクル状態を表示します。',
  'Run project auto-skill lifecycle maintenance.':
    'プロジェクトの自動スキルのライフサイクル保守を実行します。',
  'Restore an archived project auto-skill.':
    'アーカイブ済みのプロジェクト自動スキルを復元します。',
  'Auto-skill curator': '自動スキル管理',
  'Last run: {{time}}': '前回の実行：{{time}}',
  'Active: {{count}}': '有効：{{count}}',
  'Stale: {{count}}': '非アクティブ：{{count}}',
  'Archived: {{count}}': 'アーカイブ済み：{{count}}',
  'Stale skills:': '非アクティブなスキル：',
  'Pinned skills:': '固定済みのスキル：',
  'Archived skills:': 'アーカイブ済みのスキル：',
  'Dry run complete.': 'ドライランが完了しました。',
  'Curator run complete.': '自動スキル管理の実行が完了しました。',
  'Checked: {{count}}': '確認済み：{{count}}',
  'First observed: {{count}}': '初回検出：{{count}}',
  'Marked stale: {{count}}': '非アクティブ化：{{count}}',
  'Reactivated: {{count}}': '再有効化：{{count}}',
  'Skipped archive collisions: {{count}}':
    'スキップしたアーカイブ先の競合：{{count}}',
  'Archive candidates:': 'アーカイブ候補：',
  'Skipped archive collisions:': 'スキップしたアーカイブ先の競合：',
  'Skipped rename errors: {{count}}': 'スキップした名前変更エラー：{{count}}',
  'Skipped rename errors:': 'スキップした名前変更エラー：',
  '{{verb}}: {{count}}': '{{verb}}：{{count}}',
  'Would archive': 'アーカイブ予定',
  Archived: 'アーカイブ済み',
  'Failed to read auto-skill curator status: {{message}}':
    '自動スキル管理の状態を読み取れませんでした：{{message}}',
  'Usage: /curator run [--dry-run]': '使用方法：/curator run [--dry-run]',
  'Failed to run auto-skill curator: {{message}}':
    '自動スキル管理を実行できませんでした：{{message}}',
  'Usage: /curator restore <directory>':
    '使用方法：/curator restore <ディレクトリ>',
  'Restored auto-skill: {{name}}': '自動スキルを復元しました：{{name}}',
  'Failed to restore auto-skill: {{message}}':
    '自動スキルを復元できませんでした：{{message}}',
  'Exclude an auto-skill from automatic maintenance.':
    '自動スキルを自動保守の対象外にします。',
  'Return a pinned auto-skill to automatic maintenance.':
    '固定済みの自動スキルを自動保守の対象に戻します。',
  'Usage: /curator pin <directory>': '使用方法：/curator pin <ディレクトリ>',
  'Usage: /curator unpin <directory>':
    '使用方法：/curator unpin <ディレクトリ>',
  'Pinned auto-skill: {{name}}': '自動スキルを固定しました：{{name}}',
  'Unpinned auto-skill: {{name}}': '自動スキルの固定を解除しました：{{name}}',
  'Failed to update auto-skill pin: {{message}}':
    '自動スキルの固定状態を更新できませんでした：{{message}}',
  'Auto-skill curator changes are disabled in safe mode.':
    'セーフモードでは自動スキル管理による変更は無効です。',
  'Auto-skill curator changes are only available in trusted workspaces. Trust this folder via `/trust` and try again.':
    '自動スキル管理による変更は信頼済みのワークスペースでのみ利用できます。`/trust` でこのフォルダーを信頼してから、もう一度お試しください。',
  'Kept model as {{model}}': 'モデルは {{model}} のままです',
  'Cannot disable an extension-provided MCP server here.':
    '拡張機能が提供する MCP サーバーはここでは無効化できません。',
  'Cleared authentication for "{{name}}".':
    '"{{name}}" の認証情報をクリアしました。',
  'MCP "{{name}}" disabled for all projects.':
    'MCP "{{name}}" をすべてのプロジェクトで無効化しました。',
  'Enable extension "{{name}}" to manage this MCP server.':
    'この MCP サーバーを管理するには、拡張機能 "{{name}}" を有効にしてください。',
  'Extension-provided MCP servers cannot be favorited.':
    '拡張機能が提供する MCP サーバーはお気に入りに登録できません。',
  'User level': 'ユーザーレベル',
  'Project level': 'プロジェクトレベル',
  'Clipboard image paste is unavailable because the native clipboard module could not be loaded. Reinstall O1-Code or use the npm installation method.':
    'ネイティブのクリップボードモジュールを読み込めなかったため、クリップボード画像の貼り付けは利用できません。O1-Code を再インストールするか、npm によるインストール方法を使用してください。',
  ' · {{marketplace}} (Tab to clear)': ' · {{marketplace}} (Tab でクリア)',
  '"{{name}}" {{state}}.': '"{{name}}" {{state}}。',
  '(Tab / ←→ to switch)': '(Tab / ←→ で切り替え)',
  '+ Add new marketplace': '+ マーケットプレイスを追加',
  '+ Install a new extension': '+ 拡張機能をインストール',
  Actions: 'アクション',
  'Add Marketplace': 'マーケットプレイスを追加',
  'Add a marketplace in the Sources tab to discover extensions.':
    'ソースタブでマーケットプレイスを追加すると、拡張機能を検索できます。',
  'Add new': '新規追加',
  'Add to Favorites': 'お気に入りに追加',
  'Added "{{name}}" to favorites.': '"{{name}}" をお気に入りに追加しました。',
  'Added marketplace "{{name}}".':
    'マーケットプレイス "{{name}}" を追加しました。',
  'Adding...': '追加中...',
  'Back to extension list': '拡張機能一覧に戻る',
  'Browse extensions ({{count}})': '拡張機能を閲覧 ({{count}})',
  'By: {{a}}': '作者: {{a}}',
  'Change scope': 'スコープを変更',
  'Change scope for "{{name}}":': '"{{name}}" のスコープを変更:',
  'Changing scope...': 'スコープを変更中...',
  'Uninstalling "{{name}}"...': '"{{name}}" をアンインストール中...',
  'Update available for "{{name}}".': '"{{name}}" にアップデートがあります。',
  '"{{name}}" is already up to date.': '"{{name}}" は最新の状態です。',
  'Checking "{{name}}" for updates...': '"{{name}}" のアップデートを確認中...',
  '"{{name}}" does not support update checks.':
    '"{{name}}" はアップデート確認に対応していません。',
  '"{{name}}" cannot be update-checked (marketplace plugins update by reinstalling).':
    '"{{name}}" はアップデートを確認できません(マーケットプレイスのプラグインは再インストールで更新されます)。',
  'Failed to check "{{name}}" for updates.':
    '"{{name}}" のアップデート確認に失敗しました。',
  'Claude plugin marketplace': 'Claude プラグインマーケットプレイス',
  Commands: 'コマンド',
  'Components:': 'コンポーネント:',
  'Could not load this marketplace.':
    'このマーケットプレイスを読み込めませんでした。',
  'Current: {{scope}}': '現在: {{scope}}',
  Disabled: '無効',
  Discover: '発見',
  'Disabling "{{name}}"...': '"{{name}}" を無効化中...',
  'Disabling MCP "{{name}}"...': 'MCP "{{name}}" を無効化中...',
  'Discover extensions': '拡張機能を発見',
  'Discovering extensions...': '拡張機能を検索中...',
  'Enabling "{{name}}"...': '"{{name}}" を有効化中...',
  'Enabling MCP "{{name}}"...': 'MCP "{{name}}" を有効化中...',
  'Enter extension source:': '拡張機能のソースを入力:',
  'Enter marketplace source (Claude format):':
    'マーケットプレイスのソースを入力 (Claude 形式):',
  'Examples:': '例:',
  'Extension details': '拡張機能の詳細',
  'Extension v{{version}}': '拡張機能 v{{version}}',
  'Extensions are not available in this environment.':
    'この環境では拡張機能を利用できません。',
  'Failed to open {{url}}': '{{url}} を開けませんでした',
  Favorites: 'お気に入り',
  'Global (User Scope)': 'グローバル (ユーザースコープ)',
  'Install Extension': '拡張機能をインストール',
  'Install for the current workspace (project scope)':
    '現在のワークスペースにインストール (プロジェクトスコープ)',
  'Install for you (user scope)': '自分用にインストール (ユーザースコープ)',
  'Install {{count}} extension(s) to which scope?':
    '{{count}} 件の拡張機能をどのスコープにインストールしますか?',
  Installed: 'インストール済み',
  'Installed extension "{{name}}".':
    '拡張機能 "{{name}}" をインストールしました。',
  'Installed extensions ({{count}}):':
    'インストール済みの拡張機能 ({{count}}):',
  'Installed {{count}} extension(s).':
    '{{count}} 件の拡張機能をインストールしました。',
  '{{name}}: installed, but the scope rollback failed — it may be disabled at all scopes; re-enable it from the Installed tab.':
    '{{name}}: インストールしましたが、スコープのロールバックに失敗しました — すべてのスコープで無効化されている可能性があります。インストール済みタブから再度有効化してください。',
  'Could not change scope, and the rollback also failed — "{{name}}" may be disabled at all scopes. Re-enable it from the Installed tab. ({{error}})':
    'スコープを変更できず、ロールバックにも失敗しました — "{{name}}" はすべてのスコープで無効化されている可能性があります。インストール済みタブから再度有効化してください。({{error}})',
  'Installed {{ok}}, failed {{fail}}: {{detail}}':
    '{{ok}} 件インストール成功、{{fail}} 件失敗: {{detail}}',
  'Installing...': 'インストール中...',
  'Last updated: {{date}}': '最終更新: {{date}}',
  MCP: 'MCP',
  'MCP "{{name}}" {{state}}.': 'MCP "{{name}}" {{state}}。',
  'MCP servers': 'MCP servers',
  'Mark for Update': '更新対象にする',
  Marketplaces: 'マーケットプレイス',
  'No extensions discovered.': '拡張機能が見つかりませんでした。',
  'No extensions match your search.': '検索に一致する拡張機能はありません。',
  'No extensions or marketplaces added yet.':
    '拡張機能もマーケットプレイスもまだ追加されていません。',
  'No homepage available.': '利用可能なホームページがありません。',
  'No installable extensions selected.':
    'インストール可能な拡張機能が選択されていません。',
  'No plugins or MCP servers installed.':
    'プラグインも MCP サーバーもインストールされていません。',
  None: 'なし',
  'Note: Uninstall permanently removes this extension.':
    '注: アンインストールするとこの拡張機能は完全に削除されます。',
  'Open homepage': 'ホームページを開く',
  'Project (Workspace)': 'プロジェクト (ワークスペース)',
  'Refreshed {{count}} extension(s).': '{{count}} 件の拡張機能を更新しました。',
  'Remove from Favorites': 'お気に入りから削除',
  'Remove marketplace': 'マーケットプレイスを削除',
  'Remove marketplace "{{name}}"?':
    'マーケットプレイス "{{name}}" を削除しますか?',
  'Removed "{{name}}" from favorites.':
    '"{{name}}" をお気に入りから削除しました。',
  'Removed marketplace "{{name}}".':
    'マーケットプレイス "{{name}}" を削除しました。',
  'Scope:': 'スコープ:',
  'Set "{{name}}" scope to {{scope}}.':
    '"{{name}}" のスコープを {{scope}} に設定しました。',
  Sources: 'ソース',
  'Type to search · Space to toggle · Enter to view · Ctrl+R refresh · Esc to go back':
    '入力して検索 · Space 切替 · Enter 表示 · Ctrl+R 更新 · Esc 戻る',
  Uninstall: 'アンインストール',
  'Uninstalled "{{name}}".': '"{{name}}" をアンインストールしました。',
  'Update Now': '今すぐ更新',
  'Update marketplace': 'マーケットプレイスを更新',
  'Update marketplace (last updated {{date}})':
    'マーケットプレイスを更新 (最終更新 {{date}})',
  'Could not update marketplace "{{name}}".':
    'マーケットプレイス "{{name}}" を更新できませんでした。',
  'Updated "{{name}}".': '"{{name}}" を更新しました。',
  'Updated marketplace "{{name}}".':
    'マーケットプレイス "{{name}}" を更新しました。',
  'Use the Discover tab to find and install plugins.':
    '発見タブでプラグインを検索してインストールしてください。',
  'Version: {{v}}': 'バージョン: {{v}}',
  'Will install:': 'インストール予定:',
  'Would open: {{url}}': '開く予定: {{url}}',
  'Y/Enter to confirm · N/Esc to cancel': 'Y/Enter で確定 · N/Esc でキャンセル',
  'Press R to retry · Esc to go back': 'R で再試行 · Esc で戻る',
  'Enter to select · R refresh · Esc to go back':
    'Enter で選択 · R で更新 · Esc で戻る',
  'from {{marketplace}}': '{{marketplace}} から',
  installed: 'インストール済み',
  '{{count}} Agents': '{{count}} 件のエージェント',
  '{{count}} Workflows': '{{count}} 件のワークフロー',
  '{{count}} Commands': '{{count}} 件のコマンド',
  '{{count}} MCP': '{{count}} 件の MCP',
  '{{count}} Skills': '{{count}} 件のスキル',
  '{{count}} available extensions': '{{count}} 件の利用可能な拡張機能',
  '↑ more above': '↑ 上にさらに表示',
  '↑↓ navigate · Enter open · d remove marketplace · Esc close':
    '↑↓ 移動 · Enter 開く · d マーケットプレイスを削除 · Esc 閉じる',
  '↑↓ navigate · Enter select · Esc close': '↑↓ 移動 · Enter 選択 · Esc 閉じる',
  '↑↓ navigate · Enter select · d remove marketplace · Esc close':
    '↑↓ 移動 · Enter 選択 · d マーケットプレイスを削除 · Esc 閉じる',
  '↑↓ navigate · Space enable/disable · f favorite · Enter details · Esc close':
    '↑↓ 移動 · Space 有効/無効切替 · f お気に入り · Enter 詳細 · Esc 閉じる',
  '↓ more below': '↓ 下にさらに表示',
  '⚠ Make sure you trust an extension before installing, updating, or using it. We cannot verify what MCP servers, files, or other software an extension includes, or that it works as intended. See the extension homepage for more information.':
    '⚠ インストール、更新、使用する前に、その拡張機能を信頼できることを確認してください。拡張機能に含まれる MCP サーバーやファイル、その他のソフトウェア、また意図どおりに動作するかどうかを検証することはできません。詳細は拡張機能のホームページを参照してください。',
  'toolDisplayName.Exec': 'コード実行',
  'toolDisplayName.Edit': '編集',
  'toolDisplayName.WriteFile': 'ファイル書き込み',
  'toolDisplayName.ReadFile': 'ファイル読み込み',
  'toolDisplayName.ZoomImage': '画像を拡大',
  'toolDisplayName.Grep': 'Grep',
  'toolDisplayName.Glob': 'Glob',
  'toolDisplayName.Shell': 'コマンド実行',
  'toolDisplayName.Shell Command': 'シェルコマンド',
  'toolDisplayName.TodoList': 'Todoリスト',
  'toolDisplayName.Goal': 'ゴール',
  'toolDisplayName.UpdateGoal': 'ゴールを更新',
  'toolDisplayName.ProposeGoal': 'ゴールを提案',
  'toolDisplayName.SaveMemory': 'メモリに保存',
  'toolDisplayName.Agent': 'Agent',
  'toolDisplayName.Artifact': 'アーティファクト',
  'toolDisplayName.RecordArtifact': 'アーティファクトを記録',
  'toolDisplayName.RecordSource': 'ソースを記録',
  'toolDisplayName.ReportFindings': '調査結果を報告',
  'toolDisplayName.DisplayImage': '画像を表示',
  'toolDisplayName.Skill': 'スキル',
  'toolDisplayName.EnterPlanMode': 'プランモードに入る',
  'toolDisplayName.ExitPlanMode': 'プランモードを終了',
  'toolDisplayName.WebFetch': 'Web取得',
  'toolDisplayName.WebSearch': 'Web検索',
  'toolDisplayName.ListFiles': 'ファイル一覧',
  'toolDisplayName.Lsp': 'LSP',
  'toolDisplayName.AskUserQuestion': 'ユーザーに質問',
  'toolDisplayName.CronCreate': '定期タスクを作成',
  'toolDisplayName.CronList': '定期タスク一覧',
  'toolDisplayName.CronDelete': '定期タスクを削除',
  'toolDisplayName.LoopWakeup': 'ループを起動',
  'toolDisplayName.CreateSubSession': 'サブセッションを作成',
  'toolDisplayName.ListAgents': 'Agent一覧',
  'toolDisplayName.TaskCreate': 'タスクを作成',
  'toolDisplayName.TaskUpdate': 'タスクを更新',
  'toolDisplayName.TaskList': 'タスク一覧',
  'toolDisplayName.TaskStop': 'タスクを停止',
  'toolDisplayName.TeamCreate': 'チームを作成',
  'toolDisplayName.TeamDelete': 'チームを削除',
  'toolDisplayName.TeamPlanApproval': 'チーム計画の承認',
  'toolDisplayName.SendMessage': 'メッセージを送信',
  'toolDisplayName.RequestShutdown': '終了をリクエスト',
  'toolDisplayName.StructuredOutput': '構造化出力',
  'toolDisplayName.Monitor': 'モニター',
  'toolDisplayName.NotebookEdit': 'ノートブックを編集',
  'toolDisplayName.ToolSearch': 'ツール検索',
  'toolDisplayName.ToolCall': 'ツール呼び出し',
  'toolDisplayName.EnterWorktree': 'Worktreeに入る',
  'toolDisplayName.ExitWorktree': 'Worktreeを終了',
  'toolDisplayName.Workflow': 'ワークフロー',
  'toolDisplayName.ReadMcpResource': 'MCPリソースを読み込み',
  'toolDisplayName.ImageGen': '画像生成',
  'toolDisplayName.DownsampleImage': '画像を低解像度化',
  'toolDisplayName.DownscaleVideo': '動画を低解像度化',
  'toolDisplayName.DownsampleAudio': '音声をダウンサンプリング',
  'toolDisplayName.ExtractKeyframes': 'キーフレームを抽出',
  'toolDisplayName.ExtractAudio': '音声を抽出',
  'toolDisplayName.ClipVideo': '動画を切り出し',
  'toolDisplayName.ClipImage': '画像を切り出し',
  'toolDisplayName.ClipAudio': '音声を切り出し',
  'toolDisplayName.CaptionImage': '画像を説明',
  'toolDisplayName.CaptionAudio': '音声を説明',
  'toolDisplayName.OcrImage': '画像の文字を認識',
  'toolDisplayName.UnderstandVideoSegments': '動画セグメントを解析',
  'toolDisplayName.ConvertImage': '画像を変換',
  'toolDisplayName.TranscribeAudio': '音声を文字起こし',
  'toolDisplayName.RecallMediaMemory': 'メディア記憶を呼び出し',
  '[fixed-only: runs via media policies, not the model]':
    '[固定のみ: モデルではなくメディアポリシーで実行]',
  'show paths for current session files and logs':
    '現在のセッションのファイルとログのパスを表示',
  'Move this session to a new working directory':
    'このセッションを新しい作業ディレクトリに移動',
  'Fast context compression without AI. Strips old tool outputs and thinking parts.':
    'AI を使わない高速なコンテキスト圧縮。古いツール出力と思考部分を削除します。',
  'Copy to clipboard: reply, code (by lang), LaTeX, or Mermaid. N = Nth-latest message, index = block number':
    'クリップボードにコピー: 返信、コード(言語別)、LaTeX、または Mermaid。N = 新しい方からN番目のメッセージ、index = ブロック番号',
  'Show working-tree change stats versus HEAD':
    'HEAD に対する作業ツリーの変更統計を表示',
  'Could not determine current working directory.':
    '現在の作業ディレクトリを特定できませんでした。',
  'Failed to compute git diff stats': 'git diff の統計計算に失敗しました',
  'No diff available. Either this is not a git repository, HEAD is missing, or a merge/rebase/cherry-pick/revert is in progress.':
    'diff がありません。この場所が git リポジトリではないか、HEAD が存在しないか、merge/rebase/cherry-pick/revert が進行中である可能性があります。',
  'Clean working tree — no changes against HEAD.':
    '作業ツリーはクリーンです — HEAD に対する変更はありません。',
  '{{count}} file changed, +{{added}} / -{{removed}}':
    '{{count}} 個のファイルが変更されました、+{{added}} / -{{removed}}',
  '{{count}} files changed, +{{added}} / -{{removed}}':
    '{{count}} 個のファイルが変更されました、+{{added}} / -{{removed}}',
  '{{count}} file changed': '{{count}} 個のファイルが変更されました',
  '{{count}} files changed': '{{count}} 個のファイルが変更されました',
  '…and {{hidden}} more (showing first {{shown}})':
    '…他 {{hidden}} 件(最初の {{shown}} 件を表示)',
  '(binary)': '(バイナリ)',
  '(binary, new)': '(バイナリ、新規)',
  '(new)': '(新規)',
  '(new, partial)': '(新規、部分的)',
  '(deleted)': '(削除済み)',
  '(binary, deleted)': '(バイナリ、削除済み)',
  'Create a reusable skill from a knowledge source (file, URL, conversation, or text).':
    'ナレッジソース(ファイル、URL、会話、テキスト)から再利用可能なスキルを作成します。',
  'The current model or provider does not support native video input for /learn. Switch to a video-capable model on an OpenAI-compatible provider and try again.':
    '現在のモデルまたはプロバイダーは /learn 用のネイティブ動画入力に対応していません。OpenAI 互換プロバイダーの動画対応モデルに切り替えて再試行してください。',
  'YouTube page URLs cannot be sent as native video input. Download the video into your workspace and pass the local video file path to /learn.':
    'YouTube のページ URL はネイティブ動画入力として送信できません。動画をワークスペースにダウンロードし、ローカルの動画ファイルパスを /learn に渡してください。',
  'The local video could not be attached for /learn.':
    '/learn 用にローカル動画を添付できませんでした。',
  'Code Mode Only (Experimental)': 'コードモードのみ(実験的)',
  'Terminal Symbols': 'ターミナル記号',
  mode: 'モード',
  commands: 'コマンド',
  files: 'ファイル',
  quit: '終了',
  '{{version}} available': '{{version}} が利用可能',
  '{{count}} MCP offline': '{{count}} 件の MCP がオフライン',
  '{{count}} MCPs offline': '{{count}} 件の MCP がオフライン',
  'Show skill-specific usage statistics.': 'スキル別の使用統計を表示します。',
  'The scope to install the extension in: "user" (global, default) or "project" (current workspace only).':
    '拡張機能をインストールするスコープ: "user"(グローバル、デフォルト)または "project"(現在のワークスペースのみ)。',
  'Extension "{{name}}" installed successfully and enabled for the current workspace.':
    '拡張機能 "{{name}}" を正常にインストールし、現在のワークスペースで有効化しました。',
  'Marketplace "{{name}}" not found.':
    'マーケットプレイス "{{name}}" が見つかりません。',
  'No marketplace sources added yet.':
    'マーケットプレイスソースはまだ追加されていません。',
  'No marketplaces added yet.': 'マーケットプレイスはまだ追加されていません。',
  'Adds a marketplace source (Claude format).':
    'マーケットプレイスソースを追加します(Claude 形式)。',
  'The marketplace source to add: owner/repo (GitHub), a git or https URL, or a local path.':
    '追加するマーケットプレイスソース: owner/repo (GitHub)、git または https の URL、あるいはローカルパス。',
  'Removes a marketplace source.': 'マーケットプレイスソースを削除します。',
  'The name of the marketplace to remove.':
    '削除するマーケットプレイスの名前。',
  'Lists configured marketplace sources.':
    '設定済みのマーケットプレイスソースを一覧表示します。',
  'Re-fetches a marketplace source and its plugin listing.':
    'マーケットプレイスソースとそのプラグイン一覧を再取得します。',
  'The name of the marketplace to update.':
    '更新するマーケットプレイスの名前。',
  'Manage marketplace sources for discovering extensions.':
    '拡張機能を発見するためのマーケットプレイスソースを管理します。',
  'You need at least one command before continuing.':
    '続行するには少なくとも1つのコマンドが必要です。',
  '--registry is only applicable for npm extensions.':
    '--registry は npm 拡張機能にのみ適用されます。',
  'Custom npm registry URL (only for npm extensions).':
    'カスタム npm レジストリ URL(npm 拡張機能のみ)。',
  '--ref is not applicable for npm extensions. Use @version suffix instead (e.g. @scope/package@1.2.0).':
    '--ref は npm 拡張機能には適用されません。代わりに @version サフィックスを使用してください(例: @scope/package@1.2.0)。',
  'Installs an extension from a git repository URL, local path, scoped npm package (@scope/name), or claude marketplace (marketplace-url:plugin-name).':
    'git リポジトリ URL、ローカルパス、スコープ付き npm パッケージ (@scope/name)、または claude マーケットプレイス (marketplace-url:plugin-name) から拡張機能をインストールします。',
  Description: '説明',
  'Delete Session': 'セッションを削除',
  'List installed extensions': 'インストール済みの拡張機能を一覧表示',
  'Safe mode is on, so no hooks run in this session.':
    'セーフモードが有効なため、このセッションではフックが実行されません。',
  'Bare mode is on, so no hooks run in this session.':
    'ベアモードが有効なため、このセッションではフックが実行されません。',
  'All hooks are disabled by the disableAllHooks setting.':
    'disableAllHooks 設定によりすべてのフックが無効化されています。',
  'Timeout:': 'タイムアウト:',
  'Status message:': 'ステータスメッセージ:',
  'Condition:': '条件:',
  'Options:': 'オプション:',
  'Skill:': 'スキル:',
  'runs in background': 'バックグラウンドで実行',
  'runs once': '一度だけ実行',
  sequential: '順次実行',
  'the background agent could not be started.':
    'バックグラウンドエージェントを開始できませんでした。',
  'Import MCP servers from Claude configs':
    'Claude の設定から MCP servers をインポート',
  'View resources': 'リソースを表示',
  resource: 'リソース',
  resources: 'リソース',
  'needs authentication': '認証が必要',
  'No resources available for this server.':
    'このサーバーで利用可能なリソースはありません。',
  'Resources for {{serverName}}': '{{serverName}} のリソース',
  'No resource selected': 'リソースが選択されていません',
  'Resource Detail': 'リソースの詳細',
  'URI:': 'URI:',
  'MIME Type:': 'MIME タイプ:',
  'Size:': 'サイズ:',
  '{{count}} bytes': '{{count}} バイト',
  'Reference in chat': 'チャットで参照',
  'MCP server': 'MCP server',
  'MCP resource server': 'MCP リソースサーバー',
  'Switch the model for this session (--fast for suggestion model, --voice for voice transcription model, [model-id] to switch immediately).':
    'このセッションのモデルを切り替え(--fast で提案モデル、--voice で音声書き起こしモデル、[model-id] で即座に切り替え)。',
  'Switch the model for this session (--fast for suggestion model, --voice for voice transcription model, --vision for the vision bridge model, --project to persist to project settings, --global to persist to user settings, [model-id] to switch immediately, or [model-id] [prompt] to run a one-off prompt on another model; the inline prompt is sent verbatim without @file expansion).':
    'このセッションのモデルを切り替え(--fast で提案モデル、--voice で音声書き起こしモデル、--vision でビジョンブリッジモデル、--project でプロジェクト設定に永続化、--global でユーザー設定に永続化、[model-id] で即座に切り替え、または [model-id] [prompt] で別のモデルに1回限りのプロンプトを実行。インラインプロンプトは @file 展開なしでそのまま送信されます)。',
  'Switch the model for this session (--fast for suggestion model, --voice for voice transcription model, --vision for the vision bridge model, --compaction for chat compression model, --image for the image generation model, --project to persist to project settings, --global to persist to user settings, [model-id] to switch immediately, or [model-id] [prompt] to run a one-off prompt on another model; the inline prompt is sent verbatim without @file expansion).':
    'このセッションのモデルを切り替え(--fast で提案モデル、--voice で音声書き起こしモデル、--vision でビジョンブリッジモデル、--compaction でチャット圧縮モデル、--image で画像生成モデル、--project でプロジェクト設定に永続化、--global でユーザー設定に永続化、[model-id] で即座に切り替え、または [model-id] [prompt] で別のモデルに1回限りのプロンプトを実行。インラインプロンプトは @file 展開なしでそのまま送信されます)。',
  "Inline one-shot override isn't supported in this mode — run '/model {{model}}' first, then send your prompt.":
    "このモードではインラインの1回限りの上書きに対応していません — 先に '/model {{model}}' を実行してから、プロンプトを送信してください。",
  "Inline one-shot override can't switch providers. '{{model}}' belongs to a different provider — run '/model {{model}}' first, then send your prompt.":
    "インラインの1回限りの上書きではプロバイダーを切り替えられません。'{{model}}' は別のプロバイダーに属しています — 先に '/model {{model}}' を実行してから、プロンプトを送信してください。",
  "⚠ '{{model}}' is not a known image-capable model; the vision bridge may fail on images.":
    "⚠ '{{model}}' は既知の画像対応モデルではありません。ビジョンブリッジが画像処理に失敗する可能性があります。",
  'Toggle voice dictation input': '音声入力の切り替え',
  'Set the model for voice transcription': '音声書き起こし用のモデルを設定',
  'Set the image-capable model used to transcribe images for a text-only main model':
    'テキスト専用のメインモデル用に、画像を書き起こす画像対応モデルを設定',
  'Set the model used to generate images': '画像生成に使用するモデルを設定',
  'Set the model used for chat compression (auto-compaction)':
    'チャット圧縮(自動圧縮)に使用するモデルを設定',
  'Select Fast Model': '高速モデルを選択',
  'Select Vision Model': 'ビジョンモデルを選択',
  'Select Image Model': '画像モデルを選択',
  'Select Compaction Model': '圧縮モデルを選択',
  'Select Voice Model': '音声モデルを選択',
  'Vision Model': 'ビジョンモデル',
  'Image Model': '画像モデル',
  'Compaction Model': '圧縮モデル',
  'Compaction model override cleared': '圧縮モデルの上書きをクリアしました',
  'Current compaction model: {{compactionModel}}\nUse "/model --compaction <model-id>" to set compaction model, or "/model --compaction clear" to clear the override.':
    '現在の圧縮モデル: {{compactionModel}}\n圧縮モデルを設定するには "/model --compaction <model-id>" を、上書きをクリアするには "/model --compaction clear" を使用してください。',
  'not set (falls back to the main model)':
    '未設定(メインモデルにフォールバック)',
  'Configure models in settings.modelProviders and ensure the required environment variables are set. In interactive mode, run /auth to configure or switch providers, or run /model --compaction without a model to choose from configured models.':
    'settings.modelProviders でモデルを設定し、必要な環境変数が設定されていることを確認してください。対話モードでは /auth を実行してプロバイダーを設定・切り替えるか、モデルを指定せずに /model --compaction を実行して設定済みモデルから選択してください。',
  'Voice Model': '音声モデル',
  'Selected compaction model is unavailable.':
    '選択した圧縮モデルは利用できません。',
  'Selected voice model is unavailable.':
    '選択した音声モデルは利用できません。',
  'Selected image model is unavailable.':
    '選択した画像モデルは利用できません。',
  "Voice model '{{model}}' is configured more than once. Remove duplicate model ids before selecting it for voice transcription.":
    "音声モデル '{{model}}' が複数回設定されています。音声書き起こし用に選択する前に、重複するモデル ID を削除してください。",
  'Voice dictation: {{status}} (mode: {{mode}}, {{modelText}}).':
    '音声入力: {{status}} (モード: {{mode}}、{{modelText}})。',
  'model: {{voiceModel}}': 'モデル: {{voiceModel}}',
  'no voice model selected': '音声モデルが選択されていません',
  'Voice dictation disabled.': '音声入力を無効化しました。',
  'Usage: /voice [hold|tap|off|status]': '使い方: /voice [hold|tap|off|status]',
  'No voice model selected. Run /model --voice to choose one before enabling voice dictation.':
    '音声モデルが選択されていません。音声入力を有効にする前に /model --voice を実行して選択してください。',
  'Voice dictation enabled (tap mode). Tap Space at an empty prompt to start, tap again or pause to stop and submit, using {{voiceModel}}.':
    '音声入力を有効化しました(タップモード)。空のプロンプトで Space をタップすると開始し、再度タップするか一時停止すると停止して送信します({{voiceModel}} を使用)。',
  'Voice dictation enabled (hold mode). Hold Space at an empty prompt to dictate with {{voiceModel}}.':
    '音声入力を有効化しました(ホールドモード)。空のプロンプトで Space を押し続けると {{voiceModel}} で音声入力できます。',
  'No models are configured.': 'モデルが設定されていません。',
  'Configured models: {{models}}.': '設定済みモデル: {{models}}。',
  'Configure a unique model id in settings.modelProviders or run /model --voice to select an available model.':
    'settings.modelProviders で一意のモデル ID を設定するか、/model --voice を実行して利用可能なモデルを選択してください。',
  "Voice model '{{modelName}}' is not configured.":
    "音声モデル '{{modelName}}' は設定されていません。",
  "Voice model '{{modelName}}' cannot be used for transcription.":
    "音声モデル '{{modelName}}' は書き起こしに使用できません。",
  "Voice model '{{modelName}}' cannot be used for transcription. Configure an OpenAI-compatible model with baseUrl in settings.modelProviders.":
    "音声モデル '{{modelName}}' は書き起こしに使用できません。settings.modelProviders で baseUrl を持つ OpenAI 互換モデルを設定してください。",
  'Configure an OpenAI-compatible model with baseUrl in settings.modelProviders.':
    'settings.modelProviders で baseUrl を持つ OpenAI 互換モデルを設定してください。',
  'Microphone access is denied. Enable it for your terminal in System Settings → Privacy & Security → Microphone, then restart voice dictation.':
    'マイクへのアクセスが拒否されています。システム設定 → プライバシーとセキュリティ → マイク でターミナルに許可を与えてから、音声入力を再起動してください。',
  'Voice dictation is not supported on {{platform}}.':
    '音声入力は {{platform}} ではサポートされていません。',
  'Voice dictation needs microphone access, which is unavailable in this WSL session. Use WSLg/PulseAudio, or run O1-Code on a host with a microphone.':
    '音声入力にはマイクへのアクセスが必要ですが、この WSL セッションでは利用できません。WSLg/PulseAudio を使用するか、マイクを備えたホストで O1-Code を実行してください。',
  'Voice dictation needs microphone access. macOS will ask the first time you record — approve it, then start again. Your first recording may be empty while the dialog is open.':
    '音声入力にはマイクへのアクセスが必要です。初回の録音時に macOS から確認が表示されるので、許可してからもう一度開始してください。ダイアログが開いている間の最初の録音は空になることがあります。',
  'Voice: recording': '音声: 録音中',
  'Voice: transcribing': '音声: 書き起こし中',
  'Voice: refining': '音声: 調整中',
  'listening…': '聞き取り中…',
  'transcribing…': '書き起こし中…',
  'refining…': '調整中…',
  'For teams · Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models':
    'チーム向け · 有料 · 最大 6,000 リクエスト/5時間 · すべての Alibaba Cloud Coding Plan モデル',
  'For individual developers · Pay per model call · 5-hour/weekly quotas':
    '個人開発者向け · モデル呼び出しごとの従量課金 · 5時間/週単位のクォータ',
  Subscribe: '登録',
  'Paid subscription plans from Alibaba Cloud ModelStudio':
    'Alibaba Cloud ModelStudio の有料サブスクリプションプラン',
  'Select Subscription Plan': 'サブスクリプションプランを選択',
  'Alibaba Cloud Token Plan': 'Alibaba Cloud Token Plan',
  'Pay-as-you-go tokens · Configure ModelStudio standard API key':
    '従量課金トークン · ModelStudio の標準 API キーを設定',
  'For individuals · Pay-as-you-go tokens · Dedicated Token Plan endpoint':
    '個人向け · 従量課金トークン · 専用の Token Plan エンドポイント',
  'For teams/companies · Credits deducted by token usage · Dedicated API key and base URL':
    'チーム/企業向け · トークン使用量に応じてクレジットを消費 · 専用の API キーとベース URL',
  'Token Plan documentation': 'Token Plan のドキュメント',
  'Current voice model: {{voiceModel}}\nUse "/model --voice <model-id>" to set voice model.':
    '現在の音声モデル: {{voiceModel}}\n音声モデルを設定するには "/model --voice <model-id>" を使用してください。',
  'Current vision model: {{visionModel}}\nUse "/model --vision <model-id>" to set the vision bridge model.':
    '現在のビジョンモデル: {{visionModel}}\nビジョンブリッジモデルを設定するには "/model --vision <model-id>" を使用してください。',
  'Current image model: {{imageModel}}\nUse "/model --image <model-id>" to set the image generation model.':
    '現在の画像モデル: {{imageModel}}\n画像生成モデルを設定するには "/model --image <model-id>" を使用してください。',
  "Voice model '{{modelName}}' is ambiguous. Configure a unique model id before using /model --voice.":
    "音声モデル '{{modelName}}' が曖昧です。/model --voice を使用する前に一意のモデル ID を設定してください。",
  "Image model '{{modelName}}' matches multiple configured endpoints. Run /model --image without an argument and choose the exact endpoint.":
    "画像モデル '{{modelName}}' は複数の設定済みエンドポイントに一致します。引数なしで /model --image を実行し、正確なエンドポイントを選択してください。",
  "Image model '{{modelName}}' must declare a valid HTTPS baseUrl and credential environment variable.":
    "画像モデル '{{modelName}}' には有効な HTTPS の baseUrl と認証情報の環境変数を指定する必要があります。",
  "'{{model}}' must declare a valid HTTPS baseUrl and credential environment variable.":
    "'{{model}}' には有効な HTTPS の baseUrl と認証情報の環境変数を指定する必要があります。",
  'Ctrl+Q to queue · ↑ to edit queued messages':
    'Ctrl+Q でキューに追加 · ↑ でキュー内のメッセージを編集',
  'Enter to steer · Ctrl+Q to queue': 'Enter で操作 · Ctrl+Q でキューに追加',
  '{{count}} queued': '{{count}} 件がキュー中',
  '+{{count}} more': '他 {{count}} 件',
  edit: '編集',
  PLAN: 'PLAN',
  DEFAULT: 'DEFAULT',
  EDITS: 'EDITS',
  AUTO: 'AUTO',
  'reasoning off': '推論オフ',
  'reasoning default': '推論 既定',
  'reasoning {{effort}}': '推論 {{effort}}',
  low: '低',
  medium: '中',
  high: '高',
  online: 'オンライン',
  '↑↓ navigate · tab complete · enter select · esc close':
    '↑↓ 移動 · tab 補完 · enter 選択 · esc 閉じる',
  '↑↓ navigate · enter select · esc close': '↑↓ 移動 · enter 選択 · esc 閉じる',
  'the current one is marked': '現在のものにマークが付いています',
  'Connect a provider': 'プロバイダーに接続',
  'step {{step}}': 'ステップ {{step}}',
  'step {{step}} of {{total}}': 'ステップ {{step}} / {{total}}',
  '↑↓ navigate · enter select · esc back': '↑↓ 移動 · enter 選択 · esc 戻る',
  Provider: 'プロバイダー',
  'the key is saved in ~/.o1-code/credentials/, for your user only':
    'キーは ~/.o1-code/credentials/ に保存され、あなたのユーザーだけが読めます',
  Endpoint: 'エンドポイント',
  Key: 'キー',
  'Welcome to {{product}}.': '{{product}} へようこそ。',
  'Describe a task and the agent works in the open project: it reads, edits, runs commands and asks for approval.':
    'タスクを説明すると、エージェントが開いているプロジェクト内で作業します: 読み込み、編集、コマンドの実行を行い、承認を求めます。',
  'Getting started': 'はじめに',
  'Ask in plain language: "explain the structure of this project"':
    '自然な言葉で質問: 「このプロジェクトの構造を説明して」',
  'Mention files with {{at}} and use commands with {{slash}}':
    '{{at}} でファイルを指定し、{{slash}} でコマンドを使用',
  '{{file}} holds project instructions — run {{init}} to create it':
    '{{file}} にプロジェクトの指示を記述します — 作成するには {{init}} を実行',
  'Recent sessions': '最近のセッション',
  '{{resume}} to continue a session': '{{resume}} でセッションを再開',
  'just now': 'たった今',
  '{{count}} min ago': '{{count}} 分前',
  '{{count}} h ago': '{{count}} 時間前',
  yesterday: '昨日',
  '{{count}} days ago': '{{count}} 日前',
  '{{count}} weeks ago': '{{count}} 週間前',
  'Retrying in {{seconds}}s — esc to give up':
    '{{seconds}} 秒後に再試行 — esc で中止',
  'Retrying…': '再試行中…',
  'model switched to {{model}}': 'モデルを {{model}} に切り替えました',
  runtime: 'ランタイム',
  '1 week ago': '1 週間前',
  '… {{count}} more': '… 他 {{count}} 件',
  'Manually connect a local server, proxy, or unsupported provider':
    'ローカルサーバー、プロキシ、または未対応のプロバイダーに手動で接続',
  'key from platform.deepseek.com': 'platform.deepseek.com で取得したキー',
  'Grok · key from console.x.ai': 'Grok · console.x.ai で取得したキー',
  'key from platform.minimax.io': 'platform.minimax.io で取得したキー',
  'key from z.ai': 'z.ai で取得したキー',
  'key from platform.moonshot.ai': 'platform.moonshot.ai で取得したキー',
  'key from modelscope.cn': 'modelscope.cn で取得したキー',
  'Enter the API endpoint for this protocol.':
    'このプロトコルの API エンドポイントを入力してください。',
  Anthropic: 'Anthropic',
  OpenAI: 'OpenAI',
  'Google Gemini': 'Google Gemini',
  OrganizaOne: 'OrganizaOne',
  Ollama: 'Ollama',
  'LM Studio': 'LM Studio',
  xAI: 'xAI',
  DeepSeek: 'DeepSeek',
  'Kimi (Moonshot)': 'Kimi (Moonshot)',
  MiniMax: 'MiniMax',
  ModelScope: 'ModelScope',
  'Z.AI': 'Z.AI',
  'Other local server': 'その他のローカルサーバー',
  'Sign in with your account': 'アカウントでサインイン',
  'aipp device code': 'aipp デバイスコード',
  'Claude · key from console.anthropic.com':
    'Claude · console.anthropic.com で取得したキー',
  'GPT · key from platform.openai.com':
    'GPT · platform.openai.com で取得したキー',
  'Gemini · key from aistudio.google.com':
    'Gemini · aistudio.google.com で取得したキー',
  'Connect to OrganizaOne with your key': 'キーで OrganizaOne に接続',
  'Sign in to OrganizaOne in the browser':
    'ブラウザーで OrganizaOne にサインイン',
  'Paste an aipp connection code': 'aipp 接続コードを貼り付け',
  'Models from Ollama on this machine': 'このマシン上の Ollama のモデル',
  'Models from LM Studio on this machine': 'このマシン上の LM Studio のモデル',
  'Any OpenAI-compatible server on this machine':
    'このマシン上の任意の OpenAI 互換サーバー',
  'API key': 'API キー',
  'Anthropic, OpenAI, Google Gemini, xAI and others':
    'Anthropic、OpenAI、Google Gemini、xAI など',
  Local: 'ローカル',
  'Models running on this machine': 'このマシンで動いているモデル',
  'Any URL, OpenAI-compatible or Anthropic':
    '任意の URL、OpenAI 互換または Anthropic',
  '… looking': '… 検索中',
  '{{server}} detected': '{{server}} を検出',
  'coming soon': '近日公開',
  'Coming soon: this path depends on the OrganizaOne server.':
    '近日公開: この方法は OrganizaOne サーバーの対応を待っています。',
  'Paste your key; the models come from OrganizaOne':
    'キーを貼り付けてください。モデルは OrganizaOne から取得します',
  'Alibaba Cloud': 'Alibaba Cloud',
  'Coding Plan, Token Plan, or Standard API Key':
    'Coding Plan、Token Plan、または標準 API キー',
  'not running': '停止中',
  'detected · {{count}} models': '検出 · {{count}} モデル',
  'Still looking for the server on this machine.':
    'このマシンのサーバーを検索中です。',
  'Nothing answered on that port. Start the server and press ctrl+r.':
    'そのポートからの応答がありません。サーバーを起動して ctrl+r を押してください。',
  '↑↓ navigate · enter select · ctrl+r look again · esc back':
    '↑↓ 移動 · enter 選択 · ctrl+r 再検索 · esc 戻る',
  Port: 'ポート',
  'Port of the server on this machine, or its full URL.':
    'このマシンのサーバーのポート、または完全な URL。',
  'checking the key…': 'キーを確認中…',
  'key valid': 'キーは有効です',
  'The provider refused this key ({{status}}). Check it, or press enter again to use it anyway.':
    'プロバイダーがこのキーを拒否しました ({{status}})。確認するか、もう一度 Enter を押してそのまま使用してください。',
  'The provider list could not be read · ctrl+r fetches the models again':
    'プロバイダーの一覧を読み込めませんでした · ctrl+r でモデルを再取得',
  'ctrl+r fetches the models again': 'ctrl+r でモデルを再取得',
  'Enter model IDs directly. Use commas to configure multiple models.':
    'モデル ID を直接入力してください。複数のモデルを設定するにはカンマで区切ります。',
  'Checked models are applied on submit but not copied into the input.':
    'チェックしたモデルは送信時に適用されますが、入力欄にはコピーされません。',
  'Checked recommended models are applied on submit but not copied into the input.':
    'チェックしたおすすめモデルは送信時に適用されますが、入力欄にはコピーされません。',
  'Models · from the provider · {{count}} checked':
    'モデル · プロバイダーから取得 · {{count}} 件選択中',
  'Recommended models': 'おすすめモデル',
  ' · provider list unavailable, showing built-ins':
    ' · プロバイダーの一覧を利用できないため、組み込みモデルを表示中',
  Search: '検索',
  'No models match.': '一致するモデルはありません。',
  'No recommended models match.': '一致するおすすめモデルはありません。',
  'Enter to submit, ↑↓/Tab to switch input, search, and models, Space to toggle models, Esc to go back':
    'Enter で送信、↑↓/Tab で入力・検索・モデルを切り替え、Space でモデルを切替、Esc で戻る',
  'Enter to submit, ↑↓/Tab to switch input, search, and recommendations, Space to toggle recommendations, Esc to go back':
    'Enter で送信、↑↓/Tab で入力・検索・おすすめを切り替え、Space でおすすめを切替、Esc で戻る',
  'Enter model IDs separated by commas. Examples: {{modelIds}}':
    'モデル ID をカンマ区切りで入力してください。例: {{modelIds}}',
  'Enter model IDs separated by commas.':
    'モデル ID をカンマ区切りで入力してください。',
  'Model IDs': 'モデル ID',
  Protocol: 'プロトコル',
  Review: '確認',
  'Advanced Config': '詳細設定',
  'The key is saved in ~/.o1-code/credentials/ and the models in settings.json.':
    'キーは ~/.o1-code/credentials/ に、モデルは settings.json に保存されます。',
  'Enter to save, Esc to go back': 'Enter で保存、Esc で戻る',
  Documentation: 'ドキュメント',
  'awaiting approval': '承認待ち',
  canceled: 'キャンセル済み',
  failed: '失敗',
  'no provider': 'プロバイダーなし',
  info: '情報',
  reading: '読み込み中',
  writing: '書き込み中',
  running: '実行中',
  done: '完了',
  plan: 'プラン',
  'thinking…': '思考中…',
  'esc to cancel': 'esc でキャンセル',
  '{{count}} lines above': '上に {{count}} 行',
  '{{count}} lines · enter sends · shift+enter new line':
    '{{count}} 行 · enter で送信 · shift+enter で改行',
  'enter steers the turn · ctrl+q queues':
    'enter でターンを操作 · ctrl+q でキューに追加',
  'Queue message for the next turn': '次のターン用にメッセージをキューに追加',
  '{{count}} session': '{{count}} セッション',
  '{{count}} sessions': '{{count}} セッション',
  '{{count}} topic': '{{count}} トピック',
  '{{count}} topics': '{{count}} トピック',
  '{{count}} tokens': '{{count}} トークン',
  '{{count}} tool call': '{{count}} 件のツール呼び出し',
  '{{count}} tool calls': '{{count}} 件のツール呼び出し',
  '{{count}} event': '{{count}} 件のイベント',
  '{{count}} events': '{{count}} 件のイベント',
  '{{count}} dropped': '{{count}} 件破棄',
  'pid {{pid}}': 'pid {{pid}}',
  'exit {{exitCode}}': 'exit {{exitCode}}',
  'Sessions reviewing': 'レビュー中のセッション',
  Progress: '進捗',
  'Resume blocked': '再開がブロックされました',
  'Working dir': '作業ディレクトリ',
  'Output file': '出力ファイル',
  'Topics touched ({{count}})': '触れたトピック ({{count}})',
  '{{count}} more': '他 {{count}} 件',
  'to queue for the next turn': '次のターン用にキューに追加するには',
  'You can get your Token Plan API key here':
    'Token Plan の API キーはこちらから取得できます',
  'API key is stored in settings.env. You can migrate it to a .env file for better security.':
    'API キーは settings.env に保存されています。セキュリティ向上のため .env ファイルへ移行できます。',
  'New model configurations are available for Alibaba Cloud Coding Plan. Update now?':
    'Alibaba Cloud Coding Plan の新しいモデル設定が利用可能です。今すぐ更新しますか?',
  'Coding Plan configuration updated successfully. New models are now available.':
    'Coding Plan の設定を正常に更新しました。新しいモデルが利用可能になりました。',
  'Coding Plan API key not found. Please re-authenticate with Coding Plan.':
    'Coding Plan の API キーが見つかりません。Coding Plan で再認証してください。',
  'Enter Token Plan API Key': 'Token Plan の API キーを入力',
  'Get or set any setting by dot-path key':
    'ドットパスのキーで任意の設定を取得・設定',
  'Invalid boolean value: "{{value}}". Use "true" or "false".':
    '無効な真偽値: "{{value}}"。"true" または "false" を使用してください。',
  'Cannot toggle a number setting. Provide a value: key=<number>.':
    '数値設定は切り替えられません。値を指定してください: key=<number>。',
  'Invalid number value: "{{value}}".': '無効な数値: "{{value}}"。',
  'Cannot toggle a string setting. Provide a value: key=<value>.':
    '文字列設定は切り替えられません。値を指定してください: key=<value>。',
  'Cannot toggle an enum setting. Provide one of: {{options}}.':
    '列挙型設定は切り替えられません。次のいずれかを指定してください: {{options}}。',
  'Invalid enum value: "{{value}}". Valid values: {{options}}.':
    '無効な列挙値: "{{value}}"。有効な値: {{options}}。',
  'Setting "{{type}}" type cannot be set via /config. Edit settings.json directly.':
    '"{{type}}" 型の設定は /config では設定できません。settings.json を直接編集してください。',
  'Unsupported setting type: "{{type}}".':
    'サポートされていない設定型です: "{{type}}"。',
  'Available settings:': '利用可能な設定:',
  'Unknown setting key: "{{key}}". Did you mean "{{suggestion}}"?':
    '不明な設定キー: "{{key}}"。もしかして "{{suggestion}}" ですか?',
  'Unknown setting key: "{{key}}".': '不明な設定キー: "{{key}}"。',
  'Failed to set "{{key}}": {{error}}':
    '"{{key}}" の設定に失敗しました: {{error}}',
  'Set {{key}} = {{value}}': '{{key}} = {{value}} を設定しました',
  '(This setting requires a restart to take effect.)':
    '(この設定を反映するには再起動が必要です。)',
  '(Security-sensitive setting — verify you are not exposing credentials.)':
    '(セキュリティに関わる設定です — 認証情報を漏らしていないか確認してください。)',
  'Setting tools.approvalMode to "yolo" is blocked via /config for security reasons. Edit settings.json directly if you understand the risks.':
    'セキュリティ上の理由により、/config から tools.approvalMode を "yolo" に設定することはブロックされています。リスクを理解している場合は settings.json を直接編集してください。',
  '(empty)': '(空)',
  'Choose the output style that shapes how responses are written ({{styles}}, or a custom style name).':
    '応答の書き方を決める出力スタイルを選択します ({{styles}}、またはカスタムスタイル名)。',
  'It is saved but does not apply while this workspace is untrusted.':
    '保存されますが、このワークスペースが信頼されていない間は適用されません。',
  'Set or control a session goal': 'セッションのゴールを設定・制御',
  'Show current process memory diagnostics': '現在のプロセスのメモリ診断を表示',
  'Record a CPU profile for Chrome DevTools analysis':
    'Chrome DevTools 分析用に CPU プロファイルを記録',
  'Roll back a standalone update to the previous version':
    'スタンドアロン更新を以前のバージョンにロールバック',
  'Rollback is not available in ACP mode.':
    'ロールバックは ACP モードでは利用できません。',
  'Rollback is only available for standalone installations.':
    'ロールバックはスタンドアロンインストールでのみ利用できます。',
  'Rollback successful. Restart your terminal to use the previous version.':
    'ロールバックに成功しました。以前のバージョンを使用するにはターミナルを再起動してください。',
  'Rollback failed:': 'ロールバックに失敗しました:',
  'Rollback on Windows requires manual intervention. Rename o1-code.old to o1-code in your installation directory.':
    'Windows でのロールバックには手動での操作が必要です。インストールディレクトリ内の o1-code.old を o1-code にリネームしてください。',
  'No compression needed.': '圧縮の必要はありません。',
  'Session duration: {{duration}}': 'セッション時間: {{duration}}',
  'Prompts: {{count}}': 'プロンプト数: {{count}}',
  'API requests: {{count}}': 'API リクエスト数: {{count}}',
  'Tokens — prompt: {{prompt}}, output: {{output}}':
    'トークン — 入力: {{prompt}}、出力: {{output}}',
  'Tool calls: {{total}} ({{success}} ok, {{fail}} fail)':
    'ツール呼び出し: {{total}} 件({{success}} 成功、{{fail}} 失敗)',
  'Files: +{{added}} / -{{removed}} lines':
    'ファイル: +{{added}} / -{{removed}} 行',
  prompt: '入力',
  output: '出力',
  cached: 'キャッシュ',
  'Estimated cost: ${{cost}}': '推定コスト: ${{cost}}',
  'No model usage data yet.': 'モデルの使用データはまだありません。',
  'No tool usage data yet.': 'ツールの使用データはまだありません。',
  'N/A': 'N/A',
  days: '日',
  'Tool calls': 'ツール呼び出し',
  'Code changes': 'コード変更',
  Name: '名前',
  '↑ tabs · r to cycle dates · esc to close':
    '↑ タブ · r で日付切替 · esc で閉じる',
  Cost: 'コスト',
  Session: 'セッション',
  'Failed to load stats. Press r to retry.':
    '統計の読み込みに失敗しました。r で再試行してください。',
  '⚠️ History gap: earlier conversation was lost before this point (storage interruption) and could not be recovered.':
    '⚠️ 履歴の欠落: この時点より前の会話が失われ(ストレージの中断)、復元できませんでした。',
  'Precondition check': '前提条件の確認',
  'Precondition not met — this scheduled run was skipped.':
    '前提条件が満たされていません — この予約実行はスキップされました。',
  'The precondition check was cancelled — this scheduled run was skipped.':
    '前提条件の確認がキャンセルされました — この予約実行はスキップされました。',
  'The precondition check was interrupted — this scheduled run was skipped.':
    '前提条件の確認が中断されました — この予約実行はスキップされました。',
  'The precondition check failed — this scheduled run was skipped.':
    '前提条件の確認に失敗しました — この予約実行はスキップされました。',
  'Running this scheduled task in a new session: {{link}}':
    'この予約タスクを新しいセッションで実行中: {{link}}',
  'This scheduled run could not be started: {{error}}':
    'この予約実行を開始できませんでした: {{error}}',
  'Review messages held from other O1-Code sessions (accept | deny), and manage trusted controllers (controllers | revoke)':
    '他の O1-Code セッションから保留されているメッセージを確認(accept | deny)し、信頼済みコントローラーを管理(controllers | revoke)',
  'Cycle prompt history': 'プロンプト履歴を順に表示',
  'Scroll when the input is empty': '入力が空のときにスクロール',
};
