/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

// Portuguese translations for O1-Code CLI (pt-BR)

export default {
  'Pasting text… {{size}} KB': 'Colando texto… {{size}} KB',
  'Reading image…': 'Lendo imagem…',
  'Preparing attachment…': 'Preparando anexo…',
  'Could not prepare the attachment. Paste it again to retry; Esc to dismiss.':
    'Não foi possível preparar o anexo. Cole novamente para tentar de novo; Esc para dispensar.',
  'Wait for the attachment to finish preparing before sending.':
    'Aguarde a preparação do anexo antes de enviar.',
  'Attachment preparation cancelled. Your prompt was preserved.':
    'Preparação do anexo cancelada. Seu texto foi preservado.',
  'Show Session Summary': 'Mostrar resumo da sessão',
  'Show session statistics when quitting and wait for a key before exiting.':
    'Mostrar as estatísticas da sessão ao encerrar e aguardar uma tecla para sair.',
  'Do not show again': 'Não mostrar novamente',
  'Press Space to toggle; any other key to exit.':
    'Espaço para marcar ou desmarcar; qualquer outra tecla para sair.',
  'Could not save your preference. Press any key to exit without saving.':
    'Não foi possível salvar sua preferência. Pressione qualquer tecla para sair sem salvar.',
  'O1-Code was updated': 'O1-Code atualizado',
  'The update failed': 'A atualização falhou',
  Update: 'Atualização',
  "What's new in {{version}}": 'Novidades da {{version}}',
  'Updated from {{from}} to {{to}}': 'Atualizado da {{from}} para a {{to}}',
  'and {{count}} more': 'e mais {{count}}',
  'full notes': 'notas completas',
  'O1-Code {{version}} installed': 'O1-Code {{version}} instalado',
  'The update to {{version}} failed': 'A atualização para a {{version}} falhou',
  'O1-Code {{version}} is available': 'O1-Code {{version}} disponível',
  'It takes effect the next time you open O1-Code.':
    'Vale na próxima vez que você abrir o O1-Code.',
  'Reasoning Effort': 'Intensidade de raciocínio',
  '(applied across all providers; clamped per model)':
    '(vale para todos os provedores; ajustada por modelo)',
  'The model/provider decides; no tier of its own.':
    'O modelo/provedor decide; nenhum nível próprio.',
  'Fastest and cheapest; least reasoning.':
    'Mais rápido e barato; menos raciocínio.',
  'Balanced speed, cost, and reasoning.':
    'Equilíbrio entre velocidade, custo e raciocínio.',
  'Strong reasoning for hard tasks.': 'Raciocínio forte para tarefas difíceis.',
  'Extended reasoning for agentic/coding work.':
    'Raciocínio estendido para trabalho de agente/código.',
  'Maximum reasoning; highest cost and latency.':
    'Raciocínio máximo; maior custo e latência.',
  '{{effort}} is not available for this model — using the model/provider default.':
    '{{effort}} não está disponível para este modelo — usando o padrão do modelo/provedor.',
  '(Use Enter to select, Esc to cancel)':
    '(Enter para selecionar, Esc para cancelar)',
  'Reasoning effort: default (the model/provider decides).':
    'Intensidade de raciocínio: padrão (o modelo/provedor decide).',
  'Reasoning effort: {{tier}} (requested; the effective tier depends on the active provider/model).':
    'Intensidade de raciocínio: {{tier}} (solicitada; o nível efetivo depende do provedor/modelo ativo).',
  Effort: 'Raciocínio',
  '↑↓ navigate · ←→ effort · enter select · esc close':
    '↑↓ navegar · ←→ raciocínio · enter selecionar · esc fechar',
  'Open the background tasks (monitors, shells, agents)':
    'Abrir as tarefas em segundo plano (monitores, shells, agentes)',
  'monitoring ({{count}})': 'monitorando ({{count}})',
  'enter open · ↑ history · esc back': 'enter abre · ↑ histórico · esc volta',
  // ============================================================================
  // Help / UI Components
  // ============================================================================
  'Basics:': 'Noções básicas:',
  'Add context': 'Adicionar contexto',
  'Use {{symbol}} to specify files for context (e.g., {{example}}) to target specific files or folders.':
    'Use {{symbol}} para especificar arquivos para o contexto (ex: {{example}}) para atingir arquivos ou pastas específicos.',
  '@': '@',
  '@src/myFile.ts': '@src/myFile.ts',
  'Shell mode': 'Modo shell',
  'YOLO mode': 'Modo YOLO',
  'Auto mode': 'Modo auto',
  'auto_mode.entry_notice':
    'Modo auto ativado.\n   Um classificador LLM avalia cada chamada de ferramenta — ações seguras são aprovadas automaticamente,\n   ações arriscadas são bloqueadas. Sair: Shift+Tab ou /approval-mode default.',
  'plan mode': 'modo planejamento',
  'auto-accept edits': 'aceitar edições automaticamente',
  'Accepting edits': 'Aceitando edições',
  '(shift + tab to cycle)': '(Shift + Tab para alternar)',
  'Execute shell commands via {{symbol}} (e.g., {{example1}}) or use natural language (e.g., {{example2}}).':
    'Execute comandos shell via {{symbol}} (ex: {{example1}}) ou use linguagem natural (ex: {{example2}}).',
  '!': '!',
  '!npm run start': '!npm run start',
  'start server': 'iniciar servidor',
  'Commands:': 'Comandos:',
  'shell command': 'comando shell',
  'Model Context Protocol command (from external servers)':
    'Comando Model Context Protocol (de servidores externos)',
  'Keyboard Shortcuts:': 'Atalhos de teclado:',
  'Toggle this help display': 'Alternar exibição desta ajuda',
  'Toggle shell mode': 'Alternar modo shell',
  'Open command menu': 'Abrir menu de comandos',
  'Add file context': 'Adicionar contexto de arquivo',
  'Accept suggestion / Autocomplete': 'Aceitar sugestão / Autocompletar',
  'Reverse search history': 'Pesquisa reversa no histórico',
  'Press ? again to close': 'Pressione ? novamente para fechar',
  // Keyboard shortcuts panel descriptions
  'for shell mode': 'para modo shell',
  'for commands': 'para comandos',
  'for file paths': 'para caminhos de arquivo',
  'to clear input': 'para limpar entrada',
  'to cycle approvals': 'para alternar aprovações',
  'to quit': 'para sair',
  'for newline': 'para nova linha',
  'to clear screen': 'para limpar a tela',
  'to search history': 'para pesquisar no histórico',
  'to paste images': 'para colar imagens',
  'for external editor': 'para editor externo',
  'to expand details': 'para expandir os detalhes',
  'Jump through words in the input': 'Pular palavras na entrada',
  'Close dialogs, cancel requests, or quit application':
    'Fechar diálogos, cancelar solicitações ou sair do aplicativo',
  'New line': 'Nova linha',
  'New line (Alt+Enter works for certain linux distros)':
    'Nova linha (Alt+Enter funciona em certas distros linux)',
  'Clear the screen': 'Limpar a tela',
  'Open input in external editor': 'Abrir entrada no editor externo',
  'Send message': 'Enviar mensagem',
  'Initializing...': 'Inicializando...',
  'Connecting to MCP servers... ({{connected}}/{{total}})':
    'Conectando aos MCP servers... ({{connected}}/{{total}})',
  'Type your message or @path/to/file':
    'Digite sua mensagem ou @caminho/do/arquivo',
  '? for shortcuts': '? para atalhos',
  'Pasting…': 'Colando…',
  "Press 'i' for INSERT mode and 'Esc' for NORMAL mode.":
    "Pressione 'i' para modo INSERÇÃO e 'Esc' para modo NORMAL.",
  'Cancel operation / Clear input (double press)':
    'Cancelar operação / Limpar entrada (pressionar duas vezes)',
  'Cycle approval modes': 'Alternar modos de aprovação',
  'Cycle through your prompt history': 'Alternar histórico de prompts',
  'For a full list of shortcuts, see {{docPath}}':
    'Para uma lista completa de atalhos, consulte {{docPath}}',
  'for help on O1-Code': 'para ajuda sobre o O1-Code',
  'show version info': 'mostrar informações de versão',
  'submit a bug report': 'enviar um relatório de erro',
  // ============================================================================
  // System Information Fields
  // ============================================================================
  'O1-Code': 'O1-Code',
  OS: 'SO',
  Auth: 'Autenticação',
  Model: 'Modelo',
  'Fast Model': 'Modelo Rápido',
  Sandbox: 'Sandbox',
  'Session ID': 'ID da Sessão',
  'Base URL': 'Base URL',
  Proxy: 'Proxy',
  'Memory Usage': 'Uso de Memória',
  'IDE Client': 'Cliente IDE',

  // ============================================================================
  // Commands - General
  // ============================================================================
  'Analyzes the project and creates a tailored AGENTS.md file.':
    'Analisa o projeto e cria um arquivo AGENTS.md personalizado.',
  'List available O1-Code tools. Usage: /tools [desc]':
    'Listar ferramentas O1-Code disponíveis. Uso: /tools [desc]',
  'Open the skills panel (browse, search, toggle, pick).':
    'Abrir o painel de habilidades (explorar, pesquisar, ativar, selecionar).',
  'Manage Skills': 'Gerenciar Habilidades',
  'Skills configuration saved.': 'Configuração de habilidades salva.',
  'Skills configuration saved, but refresh failed: {{error}}. Restart to ensure the new state is applied.':
    'Configuração de habilidades salva, mas a atualização falhou: {{error}}. Reinicie para garantir que o novo estado seja aplicado.',
  'Workspace is untrusted; workspace settings are ignored by the merged config. Run /trust first to persist skills changes here, or edit ~/.o1-code/settings.json directly to manage skills at user scope.':
    'O espaço de trabalho não é confiável; as configurações do espaço de trabalho são ignoradas pela configuração combinada. Execute /trust primeiro, ou edite ~/.o1-code/settings.json diretamente para gerenciar habilidades no escopo do usuário.',
  'SkillManager not available.': 'SkillManager indisponível.',
  'Loading skills…': 'Carregando habilidades…',
  'Failed to load skills: {{error}}':
    'Falha ao carregar habilidades: {{error}}',
  'Failed to save skills configuration: {{error}}':
    'Falha ao salvar a configuração de habilidades: {{error}}',
  'All available skills are disabled. Edit ~/.o1-code/settings.json or .o1-code/settings.json (skills.disabled) to re-enable.':
    'Todas as habilidades disponíveis estão desativadas. Edite ~/.o1-code/settings.json ou .o1-code/settings.json (skills.disabled) para reativá-las.',
  'Press esc to close.': 'Pressione Esc para fechar.',
  '{{count}} skills · ': '{{count}} habilidades · ',
  '{{matched}} / {{total}} skills · ': '{{matched}} / {{total}} habilidades · ',
  'Space toggle · Enter pick (fill input) · Esc save & exit · workspace scope':
    'Espaço alternar · Enter selecionar (preencher entrada) · Esc salvar & sair · escopo do espaço de trabalho',
  'Search:': 'Pesquisar:',
  'type to filter…': 'digite para filtrar…',
  'No skills are currently available.':
    'Nenhuma habilidade está disponível no momento.',
  'No skills match the search.': 'Nenhuma habilidade corresponde à pesquisa.',
  'Locked by settings entries you cannot toggle here:':
    'Bloqueado por entradas de configuração (não é possível alternar aqui):',
  '{{count}} locked not shown': '{{count}} habilidades bloqueadas não exibidas',
  'higher scope': 'escopo superior',
  '  {{name}} {{description}}  [locked: {{scope}}]':
    '  {{name}} {{description}}  [bloqueado: {{scope}}]',
  '↑/↓ navigate · backspace edits search':
    '↑/↓ navegar · Backspace edita a pesquisa',
  Bundled: 'Integrada',
  'Available O1-Code CLI tools:': 'Ferramentas CLI do O1-Code disponíveis:',
  'No tools available': 'Nenhuma ferramenta disponível',
  'View or change the approval mode for tool usage':
    'Ver ou alterar o modo de aprovação para uso de ferramentas',
  'Invalid approval mode "{{arg}}". Valid modes: {{modes}}':
    'Modo de aprovação inválido "{{arg}}". Modos válidos: {{modes}}',
  'Approval mode set to "{{mode}}"':
    'Modo de aprovação definido como "{{mode}}"',
  'View or change the language setting':
    'Ver ou alterar a configuração de idioma',
  'Delete a previous session': 'Excluir uma sessão anterior',
  'Run installation and environment diagnostics':
    'Executar diagnósticos de instalação e ambiente',
  'Browse dynamic model catalogs and choose which models stay enabled locally':
    'Navegar pelos catálogos dinâmicos de modelos e escolher quais modelos permanecem ativados localmente',
  'Generate a one-line session recap now':
    'Gerar agora um resumo da sessão em uma linha',
  'Rename the current conversation. --auto lets the fast model pick a title.':
    'Renomear a conversa atual. --auto permite que o modelo rápido escolha um título.',
  'Rewind conversation to a previous turn':
    'Voltar a conversa para um turno anterior',
  'Rewind Conversation': 'Rebobinar conversa',
  'No user turns to rewind to.': 'Nenhum turno de usuário para rebobinar.',
  'Rewind to: ': 'Rebobinar para: ',
  'Restore code and conversation': 'Restaurar código e conversa',
  'Restore conversation only': 'Restaurar apenas a conversa',
  'Restore code only': 'Restaurar apenas o código',
  'Never mind': 'Deixa pra lá',
  'Computing file changes...': 'Calculando alterações de arquivo...',
  'Restoring...': 'Restaurando...',
  'Restored {{count}} file(s).': '{{count}} arquivo(s) restaurado(s).',
  'Failed to restore files: {{error}}':
    'Falha ao restaurar arquivos: {{error}}',
  'Rewind failed: {{error}}': 'Falha ao retroceder: {{error}}',
  'Cannot rewind conversation: no active model client.':
    'Não é possível retroceder a conversa: nenhum cliente de modelo ativo.',
  'Code restored, but conversation could not be rewound (no active client).':
    'Código restaurado, mas a conversa não pôde ser retrocedida (sem cliente ativo).',
  'Conversation rewound. Edit your prompt and press Enter to continue.':
    'Conversa retrocedida. Edite seu prompt e pressione Enter para continuar.',
  'Rewinding does not affect files edited manually or via shell commands.':
    'O retrocesso não afeta arquivos editados manualmente ou por meio de comandos shell.',
  'Cannot rewind to a turn that was compressed. Try a more recent turn.':
    'Não é possível retroceder para um turno que foi compactado. Tente um turno mais recente.',
  'File restore is unavailable for this turn (no captured file changes, or this turn predates the current session).':
    'A restauração de arquivos não está disponível para este turno (sem alterações capturadas, ou o turno é anterior à sessão atual).',
  '(+{{insertions}} -{{deletions}} in {{count}} file)':
    '(+{{insertions}} -{{deletions}} em {{count}} arquivo)',
  '(+{{insertions}} -{{deletions}} in {{count}} files)':
    '(+{{insertions}} -{{deletions}} em {{count}} arquivos)',
  'Failed to restore {{count}} file(s): {{files}}':
    'Falha ao restaurar {{count}} arquivo(s): {{files}}',
  'Cannot restore files: this turn was created before file checkpointing was enabled.':
    'Não é possível restaurar arquivos: este turno foi criado antes do checkpoint de arquivos ser ativado.',
  'No files needed to be restored.': 'Nenhum arquivo precisou ser restaurado.',
  '↑↓ to navigate · Enter to select · Esc to go back':
    '↑↓ navegar · Enter selecionar · Esc voltar',
  '↑↓ to navigate · Enter to select · Esc to cancel':
    '↑↓ navegar · Enter selecionar · Esc cancelar',
  'Enter/Y to confirm · Esc/N to go back': 'Enter/Y confirmar · Esc/N voltar',
  'change the theme': 'alterar o tema',
  'Select Theme': 'Selecionar Tema',
  Preview: 'Visualizar',
  '(Use Enter to select, Tab to configure scope)':
    '(Use Enter para selecionar, Tab para configurar o escopo)',
  '(Use Enter to apply scope, Tab to go back)':
    '(Use Enter para aplicar o escopo, Tab para voltar)',
  'Theme configuration unavailable due to NO_COLOR env variable.':
    'Configuração de tema indisponível devido à variável de ambiente NO_COLOR.',
  'Theme "{{themeName}}" not found.': 'Tema "{{themeName}}" não encontrado.',
  'Theme "{{themeName}}" not found in selected scope.':
    'Tema "{{themeName}}" não encontrado no escopo selecionado.',
  'Clear conversation history and free up context':
    'Limpar histórico de conversa e liberar contexto',
  'Compresses the context by replacing it with a summary.':
    'Comprime o contexto substituindo-o por um resumo.',
  'open full O1-Code documentation in your browser':
    'abrir documentação completa do O1-Code no seu navegador',
  'Configuration not available.': 'Configuração não disponível.',
  'Connect an LLM provider': 'Conectar a um provedor LLM',
  'Copy the last AI response to clipboard (/copy N for Nth-latest)':
    'Copiar a última resposta da IA para a área de transferência (/copy N para a N-ésima)',

  // ============================================================================
  // Commands - Agents
  // ============================================================================
  'Manage subagents for specialized task delegation.':
    'Gerenciar subagentes para delegação de tarefas especializadas.',
  'Manage existing subagents (view, edit, delete).':
    'Gerenciar subagentes existentes (ver, editar, excluir).',
  'Create a new subagent with guided setup.':
    'Criar um novo subagente com configuração guiada.',

  // ============================================================================
  // Agents - Management Dialog
  // ============================================================================
  Agents: 'Agentes',
  'Choose Action': 'Escolher Ação',
  'Edit {{name}}': 'Editar {{name}}',
  'Edit Tools: {{name}}': 'Editar Ferramentas: {{name}}',
  'Edit Color: {{name}}': 'Editar Cor: {{name}}',
  'Delete {{name}}': 'Excluir {{name}}',
  'Unknown Step': 'Etapa Desconhecida',
  'Esc to close': 'Esc para fechar',
  Transcript: 'Transcrição',
  'Read {{count}} file': 'Leu {{count}} arquivo',
  'Read {{count}} files': 'Leu {{count}} arquivos',
  'Reading {{count}} file': 'Lendo {{count}} arquivo',
  'Reading {{count}} files': 'Lendo {{count}} arquivos',
  'Edited {{count}} file': 'Editou {{count}} arquivo',
  'Edited {{count}} files': 'Editou {{count}} arquivos',
  'Editing {{count}} file': 'Editando {{count}} arquivo',
  'Editing {{count}} files': 'Editando {{count}} arquivos',
  'Wrote {{count}} file': 'Escreveu {{count}} arquivo',
  'Wrote {{count}} files': 'Escreveu {{count}} arquivos',
  'Writing {{count}} file': 'Escrevendo {{count}} arquivo',
  'Writing {{count}} files': 'Escrevendo {{count}} arquivos',
  'Searched {{count}} pattern': 'Pesquisou {{count}} padrão',
  'Searched {{count}} patterns': 'Pesquisou {{count}} padrões',
  'Searching {{count}} pattern': 'Pesquisando {{count}} padrão',
  'Searching {{count}} patterns': 'Pesquisando {{count}} padrões',
  'Listed {{count}} directory': 'Listou {{count}} diretório',
  'Listed {{count}} directories': 'Listou {{count}} diretórios',
  'Listing {{count}} directory': 'Listando {{count}} diretório',
  'Listing {{count}} directories': 'Listando {{count}} diretórios',
  'Ran {{count}} command': 'Executou {{count}} comando',
  'Ran {{count}} commands': 'Executou {{count}} comandos',
  'Running {{count}} command': 'Executando {{count}} comando',
  'Running {{count}} commands': 'Executando {{count}} comandos',
  'Ran {{count}} agent': 'Executou {{count}} agente',
  'Ran {{count}} agents': 'Executou {{count}} agentes',
  'Running {{count}} agent': 'Executando {{count}} agente',
  'Running {{count}} agents': 'Executando {{count}} agentes',
  'Used {{count}} tool': 'Usou {{count}} ferramenta',
  'Used {{count}} tools': 'Usou {{count}} ferramentas',
  'Using {{count}} tool': 'Usando {{count}} ferramenta',
  'Using {{count}} tools': 'Usando {{count}} ferramentas',
  'Enter to select, ↑↓ to navigate, Esc to close':
    'Enter para selecionar, ↑↓ para navegar, Esc para fechar',
  'Esc to go back': 'Esc para voltar',
  'Enter to confirm, Esc to cancel': 'Enter para confirmar, Esc para cancelar',
  'Enter to select, ↑↓ to navigate, Esc to go back':
    'Enter para selecionar, ↑↓ para navegar, Esc para voltar',
  'Enter to submit, Esc to go back': 'Enter para enviar, Esc para voltar',
  'Invalid step: {{step}}': 'Etapa inválida: {{step}}',
  'No subagents found.': 'Nenhum subagente encontrado.',
  "Use '/agents create' to create your first subagent.":
    "Use '/agents create' para criar seu primeiro subagente.",
  '(built-in)': '(integrado)',
  '(overridden by project level agent)':
    '(substituído por agente de nível de projeto)',
  'Project Level ({{path}})': 'Nível de Projeto ({{path}})',
  'User Level ({{path}})': 'Nível de Usuário ({{path}})',
  'Built-in Agents': 'Agentes Integrados',
  'Extension Agents': 'Agentes de Extensão',
  'Using: {{count}} agents': 'Usando: {{count}} agentes',
  'View Agent': 'Ver Agente',
  'Edit Agent': 'Editar Agente',
  'Delete Agent': 'Excluir Agente',
  Back: 'Voltar',
  'No agent selected': 'Nenhum agente selecionado',
  'File Path: ': 'Caminho do Arquivo: ',
  'Tools: ': 'Ferramentas: ',
  'Color: ': 'Cor: ',
  'Description:': 'Descrição:',
  'System Prompt:': 'Prompt do Sistema:',
  'Open in editor': 'Abrir no editor',
  'Edit tools': 'Editar ferramentas',
  'Edit color': 'Editar cor',
  '✗ Error:': '✗ Erro:',
  'Are you sure you want to delete agent "{{name}}"?':
    'Tem certeza que deseja excluir o agente "{{name}}"?',

  // ============================================================================
  // Agents - Creation Wizard
  // ============================================================================
  'Project Level (.o1-code/agents/)': 'Nível de Projeto (.o1-code/agents/)',
  'User Level (~/.o1-code/agents/)': 'Nível de Usuário (~/.o1-code/agents/)',
  '✓ Subagent Created Successfully!': '✓ Subagente criado com sucesso!',
  'Subagent "{{name}}" has been saved to {{level}} level.':
    'O subagente "{{name}}" foi salvo no nível {{level}}.',
  'Name: ': 'Nome: ',
  'Location: ': 'Localização: ',
  '✗ Error saving subagent:': '✗ Erro ao salvar subagente:',
  'Warnings:': 'Avisos:',
  'Name "{{name}}" already exists at {{level}} level - will overwrite existing subagent':
    'O nome "{{name}}" já existe no nível {{level}} - o subagente existente será substituído',
  'Name "{{name}}" exists at user level - project level will take precedence':
    'O nome "{{name}}" existe no nível de usuário - o nível de projeto terá precedência',
  'Name "{{name}}" exists at project level - existing subagent will take precedence':
    'O nome "{{name}}" existe no nível de projeto - o subagente existente terá precedência',
  'Description is over {{length}} characters':
    'A descrição tem mais de {{length}} caracteres',
  'System prompt is over {{length}} characters':
    'O prompt do sistema tem mais de {{length}} caracteres',

  // ============================================================================
  // Agents - Creation Wizard Steps
  // ============================================================================
  'Step {{n}}: Choose Location': 'Etapa {{n}}: Escolher Localização',
  'Step {{n}}: Choose Generation Method':
    'Etapa {{n}}: Escolher Método de Geração',
  'Generate with O1-Code (Recommended)': 'Gerar com O1-Code (Recomendado)',
  'Manual Creation': 'Criação Manual',
  'Describe what this subagent should do and when it should be used. (Be comprehensive for best results)':
    'Descreva o que este subagente deve fazer e quando deve ser usado. (Seja abrangente para melhores resultados)',
  'e.g., Expert code reviewer that reviews code based on best practices...':
    'ex: Revisor de código especialista que revisa código com base em melhores práticas...',
  'Generating subagent configuration...':
    'Gerando configuração do subagente...',
  'Failed to generate subagent: {{error}}':
    'Falha ao gerar subagente: {{error}}',
  'Step {{n}}: Describe Your Subagent': 'Etapa {{n}}: Descreva Seu Subagente',
  'Step {{n}}: Enter Subagent Name': 'Etapa {{n}}: Digite o Nome do Subagente',
  'Step {{n}}: Enter System Prompt': 'Etapa {{n}}: Digite o Prompt do Sistema',
  'Step {{n}}: Enter Description': 'Etapa {{n}}: Digite a Descrição',

  // ============================================================================
  // Agents - Tool Selection
  // ============================================================================
  'Step {{n}}: Select Tools': 'Etapa {{n}}: Selecionar Ferramentas',
  'All Tools (Default)': 'Todas as Ferramentas (Padrão)',
  'All Tools': 'Todas as Ferramentas',
  'Read-only Tools': 'Ferramentas de Somente Leitura',
  'Read & Edit Tools': 'Ferramentas de Leitura e Edição',
  'Read & Edit & Execution Tools': 'Ferramentas de Leitura, Edição e Execução',
  'All tools selected, including MCP tools':
    'Todas as ferramentas selecionadas, incluindo MCP tools',
  'Selected tools:': 'Ferramentas selecionadas:',
  'Read-only tools:': 'Ferramentas de somente leitura:',
  'Edit tools:': 'Ferramentas de edição:',
  'Execution tools:': 'Ferramentas de execução:',
  'Step {{n}}: Choose Background Color': 'Etapa {{n}}: Escolher Cor de Fundo',
  'Step {{n}}: Confirm and Save': 'Etapa {{n}}: Confirmar e Salvar',

  // ============================================================================
  // Agents - Navigation & Instructions
  // ============================================================================
  'Esc to cancel': 'Esc para cancelar',
  'Press Enter to save, e to save and edit, Esc to go back':
    'Pressione Enter para salvar, e para salvar e editar, Esc para voltar',
  'Press Enter to continue, {{navigation}}Esc to {{action}}':
    'Pressione Enter para continuar, {{navigation}}Esc para {{action}}',
  cancel: 'cancelar',
  'go back': 'voltar',
  '↑↓ to navigate, ': '↑↓ para navegar, ',
  'Enter a clear, unique name for this subagent.':
    'Digite um nome claro e único para este subagente.',
  'e.g., Code Reviewer': 'ex: Revisor de Código',
  'Name cannot be empty.': 'O nome não pode estar vazio.',
  "Write the system prompt that defines this subagent's behavior. Be comprehensive for best results.":
    'Escreva o prompt do sistema que define o comportamento deste subagente. Seja abrangente para melhores resultados.',
  'e.g., You are an expert code reviewer...':
    'ex: Você é um revisor de código especialista...',
  'System prompt cannot be empty.': 'O prompt do sistema não pode estar vazio.',
  'Describe when and how this subagent should be used.':
    'Descreva quando e como este subagente deve ser usado.',
  'e.g., Reviews code for best practices and potential bugs.':
    'ex: Revisa o código em busca de melhores práticas e erros potenciais.',
  'Description cannot be empty.': 'A descrição não pode estar vazia.',
  'Failed to launch editor: {{error}}': 'Falha ao iniciar editor: {{error}}',
  'Failed to save and edit subagent: {{error}}':
    'Falha ao salvar e editar subagente: {{error}}',

  // ============================================================================
  // Commands - General (continued)
  // ============================================================================
  'View and edit O1-Code settings': 'Ver e editar configurações do O1-Code',
  Settings: 'Configurações',
  'To see changes, O1-Code must be restarted. Press r to exit and apply changes now.':
    'Para ver as alterações, o O1-Code deve ser reiniciado. Pressione r para sair e aplicar as alterações agora.',
  // ============================================================================
  // Settings Labels
  // ============================================================================
  'Vim Mode': 'Modo Vim',
  'Attribution: commit': 'Atribuição: commit',
  'Terminal Bell Notification': 'Notificação Sonora do Terminal',
  'Enable Usage Statistics': 'Ativar Estatísticas de Uso',
  Theme: 'Tema',
  'Preferred Editor': 'Editor Preferido',
  'Auto-connect to IDE': 'Conexão Automática com IDE',
  'Debug Keystroke Logging': 'Log de Depuração de Teclas',
  'Language: UI': 'Idioma: Interface',
  'Terminal Symbols': 'Símbolos do terminal',
  '{{count}} queued': '{{count}} na fila',
  '+{{count}} more': '+{{count}} a mais',
  edit: 'editar',
  PLAN: 'PLANO',
  DEFAULT: 'PADRÃO',
  EDITS: 'EDIÇÕES',
  AUTO: 'AUTO',
  'reasoning off': 'raciocínio desligado',
  'reasoning default': 'raciocínio padrão',
  'reasoning {{effort}}': 'raciocínio {{effort}}',
  low: 'baixo',
  medium: 'médio',
  high: 'alto',
  online: 'online',
  '↑↓ navigate · tab complete · enter select · esc close':
    '↑↓ navegar · tab completar · enter selecionar · esc fechar',
  '↑↓ navigate · enter select · esc close':
    '↑↓ navegar · enter selecionar · esc fechar',
  'the current one is marked': 'o atual está marcado',
  'Connect a provider': 'Conectar provedor',
  'step {{step}}': 'passo {{step}}',
  'step {{step}} of {{total}}': 'passo {{step}} de {{total}}',
  '↑↓ navigate · enter select · esc back':
    '↑↓ navegar · enter selecionar · esc voltar',
  Provider: 'Provedor',
  'the key is saved in ~/.o1-code/credentials/, for your user only':
    'a chave fica em ~/.o1-code/credentials/, só para o seu usuário',
  Endpoint: 'Endpoint',
  Key: 'Chave',
  'Welcome to {{product}}.': 'Bem-vindo ao {{product}}.',
  'Describe a task and the agent works in the open project: it reads, edits, runs commands and asks for approval.':
    'Descreva uma tarefa e o agente trabalha no projeto aberto: lê, edita, roda comandos e pede aprovação.',
  'Getting started': 'Para começar',
  'Ask in plain language: "explain the structure of this project"':
    'Peça em linguagem natural: "explique a estrutura deste projeto"',
  'Mention files with {{at}} and use commands with {{slash}}':
    'Cite arquivos com {{at}} e use comandos com {{slash}}',
  '{{file}} holds project instructions — run {{init}} to create it':
    '{{file}} guarda instruções do projeto — rode {{init}} para criar',
  'Recent sessions': 'Sessões recentes',
  '{{resume}} to continue a session': '{{resume}} para continuar uma sessão',
  'just now': 'agora',
  '{{count}} min ago': 'há {{count}} min',
  '{{count}} h ago': 'há {{count}} h',
  yesterday: 'ontem',
  '{{count}} days ago': 'há {{count}} dias',
  '{{count}} weeks ago': 'há {{count}} semanas',
  'Retrying in {{seconds}}s — esc to give up':
    'Nova tentativa em {{seconds}}s — esc para desistir',
  'Retrying…': 'Tentando de novo…',
  'model switched to {{model}}': 'modelo trocado para {{model}}',
  runtime: 'runtime',
  '1 week ago': 'há 1 semana',
  '… {{count}} more': '… mais {{count}}',
  'Manually connect a local server, proxy, or unsupported provider':
    'Conecte à mão um servidor local, proxy ou provedor não suportado',
  'key from platform.deepseek.com': 'chave em platform.deepseek.com',
  'Grok · key from console.x.ai': 'Grok · chave em console.x.ai',
  'key from platform.minimax.io': 'chave em platform.minimax.io',
  'key from z.ai': 'chave em z.ai',
  'key from platform.moonshot.ai': 'chave em platform.moonshot.ai',
  'key from modelscope.cn': 'chave em modelscope.cn',
  'Enter the API endpoint for this protocol.':
    'Informe o endpoint da API para este protocolo.',
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
  'Other local server': 'Outro servidor local',
  'Sign in with your account': 'Entrar com sua conta',
  'o1-gateway device code': 'Código de dispositivo o1-gateway',
  'Claude · key from console.anthropic.com':
    'Claude · chave em console.anthropic.com',
  'GPT · key from platform.openai.com': 'GPT · chave em platform.openai.com',
  'Gemini · key from aistudio.google.com':
    'Gemini · chave em aistudio.google.com',
  'Connect to OrganizaOne with your key':
    'Conecte-se à OrganizaOne com sua chave',
  'Sign in to OrganizaOne in the browser':
    'Entre na OrganizaOne pelo navegador',
  'Paste an o1-gateway connection code': 'Cole um código de conexão o1-gateway',
  'Models from Ollama on this machine': 'Modelos do Ollama nesta máquina',
  'Models from LM Studio on this machine': 'Modelos do LM Studio nesta máquina',
  'Any OpenAI-compatible server on this machine':
    'Qualquer servidor compatível com OpenAI nesta máquina',
  'API key': 'Chave de API',
  'Anthropic, OpenAI, Google Gemini, xAI and others':
    'Anthropic, OpenAI, Google Gemini, xAI e outros',
  Local: 'Local',
  'Models running on this machine': 'Modelos rodando nesta máquina',
  'Any URL, OpenAI-compatible or Anthropic':
    'Qualquer URL, OpenAI-compatible ou Anthropic',
  '… looking': '… procurando',
  '{{server}} detected': '{{server}} detectado',
  'coming soon': 'em breve',
  'Coming soon: this path depends on the OrganizaOne server.':
    'Em breve: este caminho depende do servidor da OrganizaOne.',
  'Paste your key; the models come from OrganizaOne':
    'Cole a chave; os modelos vêm da OrganizaOne',
  'Alibaba Cloud': 'Alibaba Cloud',
  'Coding Plan, Token Plan, or Standard API Key':
    'Coding Plan, Token Plan ou chave padrão',
  'not running': 'inativo',
  'detected · {{count}} models': 'detectado · {{count}} modelos',
  'Still looking for the server on this machine.':
    'Ainda procurando o servidor nesta máquina.',
  'Nothing answered on that port. Start the server and press ctrl+r.':
    'Nada respondeu nessa porta. Inicie o servidor e pressione ctrl+r.',
  '↑↓ navigate · enter select · ctrl+r look again · esc back':
    '↑↓ navegar · enter selecionar · ctrl+r procurar de novo · esc voltar',
  Port: 'Porta',
  'Port of the server on this machine, or its full URL.':
    'Porta do servidor nesta máquina, ou a URL completa.',
  'Approve this device in your browser; the models come from OrganizaOne':
    'Aprove este dispositivo no navegador; os modelos vêm da OrganizaOne',
  'Asking OrganizaOne for a sign-in code…':
    'Pedindo um código de acesso à OrganizaOne…',
  'Your code': 'Seu código',
  'The sign-in page is opening in your browser. Elsewhere, open:':
    'A página de acesso está abrindo no navegador. Em outro aparelho, abra:',
  'Open this address on any device, sign in and enter the code:':
    'Abra este endereço em qualquer aparelho, entre e digite o código:',
  'Waiting for your approval…': 'Aguardando sua aprovação…',
  'esc cancel': 'esc cancelar',
  'Approved. Listing your models…': 'Aprovado. Listando seus modelos…',
  'enter try again · esc back': 'enter tentar de novo · esc voltar',
  'Paste the connection code from the OrganizaOne console, or the path to a kit’s o1-connect.code:':
    'Cole o código de conexão do console da OrganizaOne, ou o caminho do o1-connect.code de um kit:',
  'enter continue · esc back': 'enter continuar · esc voltar',
  Device: 'Dispositivo',
  at: 'em',
  'Proxy key {{n}}': 'Chave do proxy {{n}}',
  'Compare every fingerprint with the console’s list, read on a device off this network. Type yes to save:':
    'Compare cada impressão digital com a lista do console, lida em um aparelho fora desta rede. Digite yes para salvar:',
  'Saved. Opening the tunnel and listing your models…':
    'Salvo. Abrindo o túnel e listando seus modelos…',
  'Nothing was saved: the fingerprints were not confirmed.':
    'Nada foi salvo: as impressões digitais não foram confirmadas.',
  'checking the key…': 'verificando a chave…',
  'key valid': 'chave válida',
  'The provider refused this key ({{status}}). Check it, or press enter again to use it anyway.':
    'O provedor recusou esta chave ({{status}}). Confira, ou tecle enter de novo para usá-la assim mesmo.',
  'The provider list could not be read · ctrl+r fetches the models again':
    'Não foi possível ler a lista do provedor · ctrl+r busca os modelos de novo',
  'ctrl+r fetches the models again': 'ctrl+r busca os modelos de novo',
  'Enter model IDs directly. Use commas to configure multiple models.':
    'Digite IDs de modelo diretamente. Use vírgulas para configurar vários modelos.',
  'Checked models are applied on submit but not copied into the input.':
    'Os modelos marcados entram ao confirmar, sem ser copiados para o campo.',
  'Checked recommended models are applied on submit but not copied into the input.':
    'Os modelos recomendados marcados entram ao confirmar, sem ser copiados para o campo.',
  'Models · from the provider · {{count}} checked':
    'Modelos · do provedor · {{count}} marcados',
  'Recommended models': 'Modelos recomendados',
  ' · provider list unavailable, showing built-ins':
    ' · lista do provedor indisponível, mostrando os embutidos',
  Search: 'Buscar',
  'No models match.': 'Nenhum modelo corresponde.',
  'No recommended models match.': 'Nenhum modelo recomendado corresponde.',
  'Enter to submit, ↑↓/Tab to switch input, search, and models, Space to toggle models, Esc to go back':
    'Enter confirma · ↑↓/Tab alterna entre campo, busca e modelos · espaço marca · Esc volta',
  'Enter to submit, ↑↓/Tab to switch input, search, and recommendations, Space to toggle recommendations, Esc to go back':
    'Enter confirma · ↑↓/Tab alterna entre campo, busca e recomendados · espaço marca · Esc volta',
  'Enter model IDs separated by commas. Examples: {{modelIds}}':
    'Digite IDs de modelo separados por vírgula. Exemplos: {{modelIds}}',
  'Enter model IDs separated by commas.':
    'Digite IDs de modelo separados por vírgula.',
  'Model IDs': 'IDs de modelo',
  Protocol: 'Protocolo',
  Review: 'Revisão',
  'Advanced Config': 'Configuração avançada',
  'The key is saved in ~/.o1-code/credentials/ and the models in settings.json.':
    'A chave fica em ~/.o1-code/credentials/ e os modelos no settings.json.',
  'Enter to save, Esc to go back': 'Enter grava, Esc volta',
  Documentation: 'Documentação',
  'awaiting approval': 'aguardando aprovação',
  canceled: 'cancelado',
  failed: 'falha',
  'no provider': 'sem provedor',
  info: 'info',
  reading: 'leitura',
  writing: 'escrita',
  running: 'executando',
  done: 'sucesso',
  plan: 'plano',
  'thinking…': 'pensando…',
  'esc to cancel': 'esc para cancelar',
  '{{count}} lines above': '{{count}} linhas acima',
  '{{count}} lines · enter sends · shift+enter new line':
    '{{count}} linhas · enter envia · shift+enter nova linha',
  'enter steers the turn · ctrl+q queues':
    'enter orienta o turno · ctrl+q põe na fila',
  mode: 'modo',
  commands: 'comandos',
  files: 'arquivos',
  quit: 'sair',
  '{{version}} available': '{{version}} disponível',
  '{{count}} MCP offline': '{{count}} MCP offline',
  '{{count}} MCPs offline': '{{count}} MCPs offline',
  'Language: Model': 'Idioma: Modelo',
  'Output Format': 'Formato de Saída',
  'Hide Window Title': 'Ocultar Título da Janela',
  'Show Status in Title': 'Mostrar Status no Título',
  'Hide Tips': 'Ocultar Dicas',
  'Show Tool Call Arguments': 'Mostrar Argumentos das Chamadas de Ferramenta',
  'Show Line Numbers in Code': 'Mostrar Números de Linhas no Código',
  'Show Citations': 'Mostrar Citações',
  'Custom Witty Phrases': 'Frases de Efeito Personalizadas',
  'Show Welcome Back Dialog': 'Mostrar Diálogo de Bem-vindo de Volta',
  'Enable User Feedback': 'Ativar Feedback do Usuário',
  'How is O1-Code doing this session? (optional)':
    'Como o O1-Code está se saindo nesta sessão? (opcional)',
  Bad: 'Ruim',
  Fine: 'Bom',
  Good: 'Ótimo',
  Dismiss: 'Ignorar',
  'Screen Reader Mode': 'Modo de Leitor de Tela',
  'Max Session Turns': 'Máximo de Turnos da Sessão',
  'Skip Next Speaker Check': 'Pular Verificação do Próximo Falante',
  'Skip Loop Detection': 'Pular Detecção de Loop',
  'Skip Startup Context': 'Pular Contexto de Inicialização',
  'Enable OpenAI Logging': 'Ativar Log do OpenAI',
  'OpenAI Logging Directory': 'Diretório de Log do OpenAI',
  Timeout: 'Tempo Limite',
  'Max Retries': 'Máximo de Tentativas',
  'Load Memory From Include Directories':
    'Carregar Memória de Diretórios Incluídos',
  'Respect .gitignore': 'Respeitar .gitignore',
  'Respect .o1-codeignore': 'Respeitar .o1-codeignore',
  'Enable Recursive File Search': 'Ativar Pesquisa Recursiva de Arquivos',
  'Interactive Shell (PTY)': 'Shell Interativo (PTY)',
  'Show Color': 'Mostrar Cores',
  'Auto Accept': 'Aceitar Automaticamente',
  'Use Ripgrep': 'Usar Ripgrep',
  'Use Builtin Ripgrep': 'Usar Ripgrep Integrado',
  'Tool Output Truncation Threshold':
    'Limite de Truncamento de Saída de Ferramenta',
  'Tool Output Truncation Lines':
    'Linhas de Truncamento de Saída de Ferramenta',
  'Folder Trust': 'Confiança de Pasta',
  'Tool Schema Compliance': 'Conformidade de Tool Schema',
  Unset: 'Não definido',

  // Settings enum options
  'Auto (detect from system)': 'Automático (detectar do sistema)',
  'Auto (follow user input)': 'Automático (seguir entrada do usuário)',
  'Auto (detect terminal theme)': 'Automático (detectar tema do terminal)',
  Auto: 'Automático',
  Text: 'Texto',
  JSON: 'JSON',
  Plan: 'Planejamento',
  'Ask permissions': 'Pedir permissão',
  'Auto Edit': 'Edição Automática',
  YOLO: 'YOLO',
  'toggle vim mode on/off': 'alternar modo vim ligado/desligado',
  'Show model-specific usage statistics.':
    'Mostrar estatísticas de uso específicas do modelo.',
  'Show tool-specific usage statistics.':
    'Mostrar estatísticas de uso específicas da ferramenta.',
  'Show daily token usage statistics.':
    'Mostrar estatísticas diárias de uso de tokens.',
  'Show monthly token usage statistics.':
    'Mostrar estatísticas mensais de uso de tokens.',
  'Export token usage statistics to CSV or JSON.':
    'Exportar estatísticas de uso de tokens para CSV ou JSON.',
  'No usage data.': 'Nenhum dado de uso.',
  '{{label}}: {{tokens}} tokens ({{requests}} requests)':
    '{{label}}: {{tokens}} tokens ({{requests}} requisições)',
  'Daily token usage for {{value}}': 'Uso diário de tokens para {{value}}',
  'Monthly token usage for {{value}}': 'Uso mensal de tokens para {{value}}',
  'Total: {{tokens}} tokens': 'Total: {{tokens}} tokens',
  'Requests: {{requests}}': 'Requisições: {{requests}}',
  'Breakdown:': 'Detalhamento:',
  'Input: {{tokens}}': 'Entrada: {{tokens}}',
  'Output: {{tokens}}': 'Saída: {{tokens}}',
  'Cached (included in Input): {{tokens}}':
    'Cache (incluído na entrada): {{tokens}}',
  'Thoughts: {{tokens}}': 'Raciocínio: {{tokens}}',
  'By model:': 'Por modelo:',
  'By auth type:': 'Por tipo de autenticação:',
  'By model/auth type:': 'Por modelo/tipo de autenticação:',
  'By source:': 'Por origem:',
  'Failed to load token usage stats: {{error}}':
    'Falha ao carregar estatísticas de uso de tokens: {{error}}',
  'Expected --format csv or --format json.':
    'Esperado --format csv ou --format json.',
  'Expected a file path after --output.':
    'Esperado um caminho de arquivo após --output.',
  'Unexpected argument: {{argument}}': 'Argumento inesperado: {{argument}}',
  'Usage: /stats export <daily|monthly> [YYYY-MM-DD|YYYY-MM] [--format csv|json] [--output path]':
    'Uso: /stats export <daily|monthly> [YYYY-MM-DD|YYYY-MM] [--format csv|json] [--output path]',
  'Token usage export path must be within the project working directory.':
    'O caminho de exportação do uso de tokens deve estar dentro do diretório de trabalho do projeto.',
  'Export target does not exist: {{path}}':
    'O destino da exportação não existe: {{path}}',
  'Cannot resolve export path within the working directory.':
    'Não foi possível resolver o caminho de exportação dentro do diretório de trabalho.',
  'Could not create a temporary export file.':
    'Não foi possível criar um arquivo temporário de exportação.',
  'Token usage exported to {{format}}: {{path}}':
    'Uso de tokens exportado para {{format}}: {{path}}',
  'Failed to export token usage stats: {{error}}':
    'Falha ao exportar estatísticas de uso de tokens: {{error}}',
  'Unclosed quote in arguments.': 'Aspas não fechadas nos argumentos.',
  'Note: generation timing (TTFT/TPS) belongs to generation metrics.':
    'Observação: o tempo de geração (TTFT/TPS) pertence às métricas de geração.',
  'exit the cli': 'sair da cli',
  'Manage workspace directories': 'Gerenciar diretórios do workspace',
  'Add directories to the workspace. Use comma to separate multiple paths':
    'Adicionar diretórios ao workspace. Use vírgula para separar vários caminhos',
  'Show all directories in the workspace':
    'Mostrar todos os diretórios no workspace',
  'set external editor preference': 'definir preferência de editor externo',
  'Select Editor': 'Selecionar Editor',
  'Editor Preference': 'Preferência de Editor',
  'These editors are currently supported. Please note that some editors cannot be used in sandbox mode.':
    'Estes editores são suportados atualmente. Note que alguns editores não podem ser usados no modo sandbox.',
  'Your preferred editor is:': 'Seu editor preferido é:',
  'Manage extensions': 'Gerenciar extensões',
  'Manage installed extensions': 'Gerenciar extensões instaladas',
  'Disable an extension': 'Desativar uma extensão',
  'Enable an extension': 'Ativar uma extensão',
  'Install an extension from a git repo or local path':
    'Instalar uma extensão de um repositório git ou caminho local',
  'Uninstall an extension': 'Desinstalar uma extensão',
  'No extensions installed.': 'Nenhuma extensão instalada.',
  'Extension "{{name}}" not found.': 'Extensão "{{name}}" não encontrada.',
  'No extensions to update.': 'Nenhuma extensão para atualizar.',
  'Usage: /extensions install <source>': 'Uso: /extensions install <fonte>',
  'Installing extension from "{{source}}"...':
    'Instalando extensão de "{{source}}"...',
  'Extension "{{name}}" installed successfully.':
    'Extensão "{{name}}" instalada com sucesso.',
  'Failed to install extension from "{{source}}": {{error}}':
    'Falha ao instalar extensão de "{{source}}": {{error}}',
  'Do you want to continue? [Y/n]: ': 'Você deseja continuar? [Y/n]: ',
  'Do you want to continue?': 'Você deseja continuar?',
  'Installing extension "{{name}}".': 'Instalando extensão "{{name}}".',
  '**Extensions may introduce unexpected behavior. Ensure you have investigated the extension source and trust the author.**':
    '**As extensões podem introduzir comportamentos inesperados. Certifique-se de ter investigado a fonte da extensão e confie no autor.**',
  'This extension will run the following MCP servers:':
    'Esta extensão executará os seguintes MCP servers:',
  local: 'local',
  remote: 'remoto',
  'This extension will add the following commands: {{commands}}.':
    'Esta extensão adicionará os seguintes comandos: {{commands}}.',
  'This extension will append info to your AGENTS.md context using {{fileName}}':
    'Esta extensão anexará informações ao seu contexto AGENTS.md usando {{fileName}}',
  'This extension will install the following skills:':
    'Esta extensão instalará as seguintes habilidades:',
  'This extension will install the following subagents:':
    'Esta extensão instalará os seguintes subagentes:',
  'This extension will install the following workflows (JavaScript scripts that can start subagents):':
    'Esta extensão instalará os seguintes fluxos de trabalho (scripts JavaScript que podem iniciar subagentes):',
  'These workflow scripts changed since the installed version: {{names}}.':
    'Estes scripts de fluxo de trabalho mudaram desde a versão instalada: {{names}}.',
  'Installation cancelled for "{{name}}".':
    'Instalação cancelada para "{{name}}".',
  'You are installing an extension from {{originSource}}. Some features may not work perfectly with O1-Code.':
    'Você está instalando uma extensão de {{originSource}}. Alguns recursos podem não funcionar perfeitamente com o O1-Code.',
  '--ref and --auto-update are not applicable for marketplace extensions.':
    '--ref e --auto-update não são aplicáveis para extensões de marketplace.',
  'Extension "{{name}}" installed successfully and enabled.':
    'Extensão "{{name}}" instalada com sucesso e ativada.',
  'The github URL, local path, or marketplace source (marketplace-url:plugin-name) of the extension to install.':
    'A URL do github, caminho local ou fonte do marketplace (marketplace-url:plugin-name) da extensão para instalar.',
  'The git ref to install from.': 'A referência git para instalar.',
  'Enable auto-update for this extension.':
    'Ativar atualização automática para esta extensão.',
  'Enable pre-release versions for this extension.':
    'Ativar versões de pré-lançamento para esta extensão.',
  'Acknowledge the security risks of installing an extension and skip the confirmation prompt.':
    'Reconhecer os riscos de segurança de instalar uma extensão e pular o prompt de confirmação.',
  'The source argument must be provided.':
    'O argumento fonte deve ser fornecido.',
  'Extension "{{name}}" successfully uninstalled.':
    'Extensão "{{name}}" desinstalada com sucesso.',
  'Uninstalls an extension.': 'Desinstala uma extensão.',
  'The name or source path of the extension to uninstall.':
    'O nome ou caminho da fonte da extensão para desinstalar.',
  'Please include the name of the extension to uninstall as a positional argument.':
    'Inclua o nome da extensão para desinstalar como um argumento posicional.',
  'Enables an extension.': 'Ativa uma extensão.',
  'The name of the extension to enable.': 'O nome da extensão para ativar.',
  'The scope to enable the extension in. If not set, will be enabled in all scopes.':
    'O escopo para ativar a extensão. Se não definido, será ativada em todos os escopos.',
  'Extension "{{name}}" successfully enabled for scope "{{scope}}".':
    'Extensão "{{name}}" ativada com sucesso para o escopo "{{scope}}".',
  'Extension "{{name}}" successfully enabled in all scopes.':
    'Extensão "{{name}}" ativada com sucesso em todos os escopos.',
  'Invalid scope: {{scope}}. Please use one of {{scopes}}.':
    'Escopo inválido: {{scope}}. Use um de {{scopes}}.',
  'Disables an extension.': 'Desativa uma extensão.',
  'The name of the extension to disable.': 'O nome da extensão para desativar.',
  'The scope to disable the extension in.':
    'O escopo para desativar a extensão.',
  'Extension "{{name}}" successfully disabled for scope "{{scope}}".':
    'Extensão "{{name}}" desativada com sucesso para o escopo "{{scope}}".',
  'Extension "{{name}}" successfully updated: {{oldVersion}} → {{newVersion}}.':
    'Extensão "{{name}}" atualizada com sucesso: {{oldVersion}} → {{newVersion}}.',
  'Unable to install extension "{{name}}" due to missing install metadata':
    'Não foi possível instalar a extensão "{{name}}" devido à falta de metadados de instalação',
  'Extension "{{name}}" is already up to date.':
    'A extensão "{{name}}" já está atualizada.',
  'Updates all extensions or a named extension to the latest version.':
    'Atualiza todas as extensões ou uma extensão nomeada para a última versão.',
  'Update all extensions.': 'Atualizar todas as extensões.',
  'Either an extension name or --all must be provided':
    'Um nome de extensão ou --all deve ser fornecido',
  'Lists installed extensions.': 'Lista as extensões instaladas.',
  'Link extension failed to install.': 'Falha ao instalar link da extensão.',
  'Extension "{{name}}" linked successfully and enabled.':
    'Extensão "{{name}}" vinculada com sucesso e ativada.',
  'Links an extension from a local path. Updates made to the local path will always be reflected.':
    'Vincula uma extensão de um caminho local. Atualizações feitas no caminho local sempre serão refletidas.',
  'The name of the extension to link.': 'O nome da extensão para vincular.',
  'Set a specific setting for an extension.':
    'Define uma configuração específica para uma extensão.',
  'Name of the extension to configure.': 'Nome da extensão para configurar.',
  'The setting to configure (name or env var).':
    'A configuração para configurar (nome ou var env).',
  'The scope to set the setting in.': 'O escopo para definir a configuração.',
  'List all settings for an extension.':
    'Listar todas as configurações de uma extensão.',
  'Name of the extension.': 'Nome da extensão.',
  'Extension "{{name}}" has no settings to configure.':
    'A extensão "{{name}}" não tem configurações para configurar.',
  'Settings for "{{name}}":': 'Configurações para "{{name}}":',
  '(user)': '(usuário)',
  '[not set]': '[não definido]',
  '[value stored in keychain]': '[valor armazenado no chaveiro]',
  'Value:': 'Valor:',
  'Manage extension settings.': 'Gerenciar configurações de extensão.',
  'You need to specify a command (set or list).':
    'Você precisa especificar um comando (set ou list).',

  // ============================================================================
  // Plugin Choice / Marketplace
  // ============================================================================
  'No plugins available in this marketplace.':
    'Nenhum plugin disponível neste marketplace.',
  'Select a plugin to install from marketplace "{{name}}":':
    'Selecione um plugin para instalar do marketplace "{{name}}":',
  'Plugin selection cancelled.': 'Seleção de plugin cancelada.',
  'Select a plugin from "{{name}}"': 'Selecione um plugin de "{{name}}"',
  'Use ↑↓ or j/k to navigate, Enter to select, Escape to cancel':
    'Use ↑↓ ou j/k para navegar, Enter para selecionar, Escape para cancelar',
  '{{count}} more above': '{{count}} mais acima',
  '{{count}} more below': '{{count}} mais abaixo',
  'manage IDE integration': 'gerenciar integração com IDE',
  'check status of IDE integration': 'verificar status da integração com IDE',
  'install required IDE companion for {{ideName}}':
    'instalar companion IDE necessário para {{ideName}}',
  'enable IDE integration': 'ativar integração com IDE',
  'disable IDE integration': 'desativar integração com IDE',
  'IDE integration is not supported in your current environment. To use this feature, run O1-Code in one of these supported IDEs: VS Code or VS Code forks.':
    'A integração com IDE não é suportada no seu ambiente atual. Para usar este recurso, execute o O1-Code em um destes IDEs suportados: VS Code ou forks do VS Code.',
  'Configure terminal keybindings for multiline input (VS Code, Cursor, Windsurf, Trae)':
    'Configurar atalhos de terminal para entrada multilinhas (VS Code, Cursor, Windsurf, Trae)',
  'Please restart your terminal for the changes to take effect.':
    'Reinicie seu terminal para que as alterações tenham efeito.',
  'Failed to configure terminal: {{error}}':
    'Falha ao configurar terminal: {{error}}',
  'Could not determine {{terminalName}} config path on Windows: APPDATA environment variable is not set.':
    'Não foi possível determinar o caminho de configuração de {{terminalName}} no Windows: variável de ambiente APPDATA não está definida.',
  '{{terminalName}} keybindings.json exists but is not a valid JSON array. Please fix the file manually or delete it to allow automatic configuration.':
    '{{terminalName}} keybindings.json existe mas não é um array JSON válido. Corrija o arquivo manualmente ou exclua-o para permitir a configuração automática.',
  'File: {{file}}': 'Arquivo: {{file}}',
  'Failed to parse {{terminalName}} keybindings.json. The file contains invalid JSON. Please fix the file manually or delete it to allow automatic configuration.':
    'Falha ao analisar {{terminalName}} keybindings.json. O arquivo contém JSON inválido. Corrija o arquivo manualmente ou exclua-o para permitir a configuração automática.',
  'Error: {{error}}': 'Erro: {{error}}',
  'Shift+Enter binding already exists': 'Atalho Shift+Enter já existe',
  'Ctrl+Enter binding already exists': 'Atalho Ctrl+Enter já existe',
  'Existing keybindings detected. Will not modify to avoid conflicts.':
    'Atalhos existentes detectados. Não serão modificados para evitar conflitos.',
  'Please check and modify manually if needed: {{file}}':
    'Verifique e modifique manualmente se necessário: {{file}}',
  'Added Shift+Enter and Ctrl+Enter keybindings to {{terminalName}}.':
    'Adicionados atalhos Shift+Enter e Ctrl+Enter para {{terminalName}}.',
  'Modified: {{file}}': 'Modificado: {{file}}',
  '{{terminalName}} keybindings already configured.':
    'Atalhos de {{terminalName}} já configurados.',
  'Failed to configure {{terminalName}}.':
    'Falha ao configurar {{terminalName}}.',
  'Your terminal is already configured for an optimal experience with multiline input (Shift+Enter and Ctrl+Enter).':
    'Seu terminal já está configurado para uma experiência ideal com entrada multilinhas (Shift+Enter e Ctrl+Enter).',
  // ============================================================================
  // Commands - Hooks
  // ============================================================================
  'Manage O1-Code hooks': 'Gerenciar hooks do O1-Code',
  'List all configured hooks': 'Listar todos os hooks configurados',
  // Hooks - Dialog
  Hooks: 'Hooks',
  'Loading hooks...': 'Carregando hooks...',
  'Error loading hooks:': 'Erro ao carregar hooks:',
  'Press Escape to close': 'Pressione Escape para fechar',
  'Press Escape, Ctrl+C, or Ctrl+D to cancel':
    'Pressione Escape, Ctrl+C ou Ctrl+D para cancelar',
  'Press Space, Enter, or Escape to dismiss':
    'Pressione Space, Enter ou Escape para dispensar',
  'No hook selected': 'Nenhum hook selecionado',
  // Hooks - List Step
  'No hook events found.': 'Nenhum evento de hook encontrado.',
  '{{count}} hook configured': '{{count}} hook configurado',
  '{{count}} hooks configured': '{{count}} hooks configurados',
  'This menu is read-only. To add or modify hooks, edit settings.json directly or ask O1-Code.':
    'Este menu é somente leitura. Para adicionar ou modificar hooks, edite settings.json diretamente ou pergunte ao O1-Code.',
  'Reopen this menu to reload hook definitions.':
    'Reabra este menu para recarregar as definições dos hooks.',
  'Hook controls and HTTP security settings require a restart.':
    'Os controles dos hooks e as configurações de segurança HTTP exigem uma reinicialização.',
  'Failed to reload hook definitions: {{error}}':
    'Falha ao recarregar as definições dos hooks: {{error}}',
  'Enter to select · Esc to cancel':
    'Enter para selecionar · Esc para cancelar',
  // Hooks - Detail Step
  'Exit codes:': 'Códigos de saída:',
  'Configured hooks:': 'Hooks configurados:',
  'No hooks configured for this event.':
    'Nenhum hook configurado para este evento.',
  'To add hooks, edit settings.json directly or ask O1-Code.':
    'Para adicionar hooks, edite settings.json diretamente ou pergunte ao O1-Code.',
  'Enter to select · Esc to go back': 'Enter para selecionar · Esc para voltar',
  // Hooks - Config Detail Step
  'Hook details': 'Detalhes do Hook',
  'Event:': 'Evento:',
  'Extension:': 'Extensão:',
  'Desc:': 'Descrição:',
  'No hook config selected': 'Nenhuma configuração de hook selecionada',
  'To modify or remove this hook, edit settings.json directly or ask O1-Code to help.':
    'Para modificar ou remover este hook, edite settings.json diretamente ou pergunte ao O1-Code.',
  // Hooks - Disabled Step
  'Hook Configuration - Disabled': 'Configuração de Hook - Desativado',
  'All hooks are currently disabled. You have {{count}} that are not running.':
    'Todos os hooks estão desativados. Você tem {{count}} que não estão em execução.',
  '{{count}} configured hook': '{{count}} hook configurado',
  '{{count}} configured hooks': '{{count}} hooks configurados',
  'When hooks are disabled:': 'Quando os hooks estão desativados:',
  'No hook commands will execute': 'Nenhum comando de hook será executado',
  'StatusLine will not be displayed': 'StatusLine não será exibido',
  'Tool operations will proceed without hook validation':
    'As operações de ferramentas prosseguirão sem validação de hook',
  'To re-enable hooks, remove "disableAllHooks" from settings.json or ask O1-Code.':
    'Para reativar os hooks, remova "disableAllHooks" do settings.json ou pergunte ao O1-Code.',
  // Hooks - Source
  Project: 'Projeto',
  User: 'Usuário',
  Skill: 'Habilidade',
  System: 'Sistema',
  Extension: 'Extensão',
  'Local Settings': 'Configurações Locais',
  'User Settings': 'Configurações do Usuário',
  'System Settings': 'Configurações do Sistema',
  Extensions: 'Extensões',
  'Session (temporary)': 'Sessão (temporário)',
  // Hooks - Event Descriptions (short)
  'Before tool execution': 'Antes da execução da ferramenta',
  'After tool execution': 'Após a execução da ferramenta',
  'After tool execution fails': 'Após a falha da execução da ferramenta',
  'When notifications are sent': 'Quando notificações são enviadas',
  'When the user submits a prompt': 'Quando o usuário envia um prompt',
  'When a slash command expands into a prompt':
    'Quando um comando slash se expande em um prompt',
  'When a new session is started': 'Quando uma nova sessão é iniciada',
  'Right before O1-Code concludes its response':
    'Logo antes do O1-Code concluir sua resposta',
  'When a subagent (Agent tool call) is started':
    'Quando um subagente (chamada de ferramenta Agent) é iniciado',
  'Right before a subagent concludes its response':
    'Logo antes de um subagente concluir sua resposta',
  'Before conversation compaction': 'Antes da compactação da conversa',
  'When a session is ending': 'Quando uma sessão está terminando',
  'When a permission dialog is displayed':
    'Quando um diálogo de permissão é exibido',
  'When a new todo item is created': 'Quando um novo item todo é criado',
  'When a todo item is marked as completed':
    'Quando um item todo é marcado como concluído',
  // Hooks - Event Descriptions (detailed)
  'Input to command is JSON of tool call arguments.':
    'A entrada para o comando é JSON dos argumentos da chamada da ferramenta.',
  'Input to command is JSON with fields "inputs" (tool call arguments) and "response" (tool call response).':
    'A entrada para o comando é JSON com campos "inputs" (argumentos da chamada da ferramenta) e "response" (resposta da chamada da ferramenta).',
  'Input to command is JSON with tool_name, tool_input, tool_use_id, error, error_type, is_interrupt, and is_timeout.':
    'A entrada para o comando é JSON com tool_name, tool_input, tool_use_id, error, error_type, is_interrupt e is_timeout.',
  'Input to command is JSON with notification message and type.':
    'A entrada para o comando é JSON com mensagem e tipo de notificação.',
  'Input to command is JSON with "prompt" (the current model-bound prompt) and optional "submitted_prompt" (the text projection captured at a supported submission boundary).':
    'A entrada para o comando é JSON com "prompt" (o prompt atual vinculado ao modelo) e o campo opcional "submitted_prompt" (a projeção de texto capturada em um ponto de envio compatível).',
  'Input to command is JSON with command_name, command_args, and expanded prompt text.':
    'A entrada para o comando é JSON com command_name, command_args e o texto do prompt expandido.',
  'Input to command is JSON with session start source.':
    'A entrada para o comando é JSON com a fonte de início da sessão.',
  'Input to command is JSON with session end reason.':
    'A entrada para o comando é JSON com o motivo do fim da sessão.',
  'Input to command is JSON with agent_id and agent_type.':
    'A entrada para o comando é JSON com agent_id e agent_type.',
  'Input to command is JSON with agent_id, agent_type, and agent_transcript_path.':
    'A entrada para o comando é JSON com agent_id, agent_type e agent_transcript_path.',
  'Input to command is JSON with compaction details.':
    'A entrada para o comando é JSON com detalhes da compactação.',
  'Input to command is JSON with tool_name, tool_input, and tool_use_id. Output JSON with hookSpecificOutput containing decision to allow or deny.':
    'A entrada para o comando é JSON com tool_name, tool_input e tool_use_id. Saída é JSON com hookSpecificOutput contendo decisão de permitir ou negar.',
  'Input to command is JSON with todo_id, todo_content, todo_status, all_todos, and phase. In validation, output JSON with decision (allow/block/deny) and reason. In postWrite, block/deny is ignored.':
    'A entrada para o comando é JSON com todo_id, todo_content, todo_status, all_todos e phase. Em validation, saída é JSON com decision (allow/block/deny) e reason. Em postWrite, block/deny é ignorado.',
  'Input to command is JSON with todo_id, todo_content, previous_status, all_todos, and phase. In validation, output JSON with decision (allow/block/deny) and reason. In postWrite, block/deny is ignored.':
    'A entrada para o comando é JSON com todo_id, todo_content, previous_status, all_todos e phase. Em validation, saída é JSON com decision (allow/block/deny) e reason. Em postWrite, block/deny é ignorado.',
  // Hooks - Exit Code Descriptions
  'stdout/stderr not shown': 'stdout/stderr não exibido',
  'show stderr to model and continue conversation':
    'mostrar stderr ao modelo e continuar conversa',
  'show stderr to user only': 'mostrar stderr apenas ao usuário',
  'stdout shown in transcript mode (ctrl+o)':
    'stdout exibido no modo transcrição (ctrl+o)',
  'show stderr to model immediately': 'mostrar stderr ao modelo imediatamente',
  'show stderr to user only but continue with tool call':
    'mostrar stderr apenas ao usuário mas continuar com chamada de ferramenta',
  'block processing, erase original prompt, and show stderr to user only':
    'bloquear processamento, apagar prompt original e mostrar stderr apenas ao usuário',
  'block expanded prompt submission and show stderr to user only':
    'bloquear envio do prompt expandido e mostrar stderr apenas ao usuário',
  'stdout shown to O1-Code': 'stdout mostrado ao O1-Code',
  'show stderr to user only (blocking errors ignored)':
    'mostrar stderr apenas ao usuário (erros de bloqueio ignorados)',
  'command completes successfully': 'comando concluído com sucesso',
  'stdout shown to subagent': 'stdout mostrado ao subagente',
  'show stderr to subagent and continue having it run':
    'mostrar stderr ao subagente e continuar executando',
  'stdout appended as custom compact instructions':
    'stdout anexado como instruções de compactação personalizadas',
  'block compaction': 'bloquear compactação',
  'show stderr to user only but continue with compaction':
    'mostrar stderr apenas ao usuário mas continuar com compactação',
  'use hook decision if provided': 'usar decisão do hook se fornecida',
  'allow todo creation': 'permitir criação de todo',
  'block todo creation and show reason to model':
    'bloquear criação de todo e mostrar motivo ao modelo',
  'allow todo completion': 'permitir conclusão de todo',
  'block todo completion and show reason to model':
    'bloquear conclusão de todo e mostrar motivo ao modelo',
  // Hooks - Messages
  'Config not loaded.': 'Configuração não carregada.',
  'Hooks are not enabled. Enable hooks in settings to use this feature.':
    'Hooks não estão ativados. Ative hooks nas configurações para usar este recurso.',
  // ============================================================================
  // Commands - Session Export
  // ============================================================================
  'Export current session message history to a file':
    'Exportar o histórico de mensagens da sessão atual para um arquivo',
  'Export session to HTML format': 'Exportar a sessão para o formato HTML',
  'Export session to JSON format': 'Exportar a sessão para o formato JSON',
  'Export session to JSONL format (one message per line)':
    'Exportar a sessão para o formato JSONL (uma mensagem por linha)',
  'Export session to markdown format':
    'Exportar a sessão para o formato Markdown',

  // ============================================================================
  // Commands - Insights
  // ============================================================================
  'generate personalized programming insights from your chat history':
    'Gerar insights personalizados de programação a partir do seu histórico de chat',

  // ============================================================================
  // Commands - Session History
  // ============================================================================
  'Resume a previous session': 'Retomar uma sessão anterior',
  'Fork the current conversation into a new session':
    'Ramificar a conversa atual em uma nova sessão',
  'Spawn a background agent that inherits the full conversation':
    'Iniciar um agente em segundo plano que herda toda a conversa',
  'Please provide a directive. Usage: /fork <directive>':
    'Forneça uma diretiva. Uso: /fork <diretiva>',
  'Cannot fork while a response or tool call is in progress. Wait for it to finish or resolve the pending tool call.':
    'Não é possível criar um fork enquanto uma resposta ou chamada de ferramenta está em andamento. Aguarde a conclusão ou resolva a chamada de ferramenta pendente.',
  'Cannot fork before the first conversation turn.':
    'Não é possível criar um fork antes da primeira rodada da conversa.',
  'The agent tool is unavailable; cannot fork.':
    'A ferramenta de agente está indisponível; não é possível criar um fork.',
  'Failed to launch fork: {{error}}': 'Falha ao iniciar o fork: {{error}}',
  'User launched a background fork via /fork: {{directive}}':
    'O usuário iniciou um fork em segundo plano via /fork: {{directive}}',
  'Forked into a background agent. It inherits this conversation and runs without blocking — track it in the background tasks panel; it reports back when done.':
    'Fork criado em um agente em segundo plano. Ele herda esta conversa e roda sem bloquear — acompanhe no painel de tarefas em segundo plano; ele informará quando terminar.',
  'Cannot branch while a response or tool call is in progress. Wait for it to finish or resolve the pending tool call.':
    'Não é possível ramificar enquanto uma resposta ou chamada de ferramenta está em andamento. Aguarde a conclusão ou resolva a chamada de ferramenta pendente.',
  'No conversation to branch.': 'Não há conversa para ramificar.',
  'Restore a tool call. This will reset the conversation and file history to the state it was in when the tool call was suggested':
    'Restaurar uma chamada de ferramenta. Isso redefinirá o histórico da conversa e dos arquivos para o estado em que a chamada da ferramenta foi sugerida',
  'Could not detect terminal type. Supported terminals: VS Code, Cursor, Windsurf, and Trae.':
    'Não foi possível detectar o tipo de terminal. Terminais suportados: VS Code, Cursor, Windsurf e Trae.',
  'Terminal "{{terminal}}" is not supported yet.':
    'O terminal "{{terminal}}" ainda não é suportado.',

  // ============================================================================
  // Commands - Language
  // ============================================================================
  'Invalid language. Available: {{options}}':
    'Idioma inválido. Disponíveis: {{options}}',
  'Language subcommands do not accept additional arguments.':
    'Subcomandos de idioma não aceitam argumentos adicionais.',
  'Current UI language: {{lang}}': 'Idioma atual da interface: {{lang}}',
  'Current LLM output language: {{lang}}':
    'Idioma atual da saída do LLM: {{lang}}',
  'Set UI language': 'Definir idioma da interface',
  'Set LLM output language': 'Definir idioma de saída do LLM',
  'Usage: /language ui [{{options}}]': 'Uso: /language ui [{{options}}]',
  'Usage: /language output <language>': 'Uso: /language output <idioma>',
  'Example: /language output 中文': 'Exemplo: /language output Português',
  'Example: /language output English': 'Exemplo: /language output Inglês',
  'Example: /language output 日本語': 'Exemplo: /language output Japonês',
  'UI language changed to {{lang}}':
    'Idioma da interface alterado para {{lang}}',
  'LLM output language set to {{lang}}':
    'Idioma de saída do LLM definido para {{lang}}',
  'Please restart the application for the changes to take effect.':
    'Reinicie o aplicativo para que as alterações tenham efeito.',
  'Failed to generate LLM output language rule file: {{error}}':
    'Falha ao gerar arquivo de regra de idioma de saída do LLM: {{error}}',
  'Invalid command. Available subcommands:':
    'Comando inválido. Subcomandos disponíveis:',
  'Available subcommands:': 'Subcomandos disponíveis:',
  'To request additional UI language packs, please open an issue on GitHub.':
    'Para solicitar pacotes de idiomas de interface adicionais, abra um problema no GitHub.',
  'Available options:': 'Opções disponíveis:',
  'Set UI language to {{name}}': 'Definir idioma da interface para {{name}}',

  // ============================================================================
  // Commands - Approval Mode
  // ============================================================================
  'Tool Approval Mode': 'Modo de Aprovação de Ferramenta',
  'Analyze only, do not modify files or execute commands':
    'Apenas analisar, não modificar arquivos nem executar comandos',
  'Require approval for file edits or shell commands':
    'Exigir aprovação para edições de arquivos ou comandos shell',
  'Automatically approve file edits':
    'Aprovar automaticamente edições de arquivos',
  'Use classifier to automatically approve safe tool calls':
    'Usar o classificador para aprovar automaticamente chamadas seguras de ferramentas',
  'Automatically approve all tools':
    'Aprovar automaticamente todas as ferramentas',
  'Workspace approval mode exists and takes priority. User-level change will have no effect.':
    'O modo de aprovação do workspace existe e tem prioridade. A alteração no nível do usuário não terá efeito.',
  'Apply To': 'Aplicar A',
  'Workspace Settings': 'Configurações do Workspace',
  'Open auto-memory folder': 'Abrir pasta de memória automática',
  'Auto-memory: {{status}}': 'Memória automática: {{status}}',
  'Auto-dream: {{status}} · {{lastDream}} · /dream to run':
    'Consolidação automática: {{status}} · {{lastDream}} · /dream para executar',
  'Auto-skill: {{status}}': 'Habilidade automática: {{status}}',
  never: 'nunca',
  on: 'ativado',
  off: 'desativado',
  'Remove matching entries from managed auto-memory.':
    'Remover entradas correspondentes da memória automática gerenciada.',
  'Usage: /forget <memory text to remove>':
    'Uso: /forget <texto de memória a remover>',
  'No managed auto-memory entries matched: {{query}}':
    'Nenhuma entrada de memória automática gerenciada correspondeu: {{query}}',
  'Consolidate managed auto-memory topic files.':
    'Consolidar arquivos de tópicos de memória automática gerenciada.',
  'Could not retrieve tool registry.':
    'Não foi possível recuperar o registro de ferramentas.',
  "Successfully authenticated and refreshed tools for '{{name}}'.":
    "Autenticado com sucesso e ferramentas atualizadas para '{{name}}'.",
  "Re-discovering tools from '{{name}}'...":
    "Redescobrindo ferramentas de '{{name}}'...",
  "Discovered {{count}} tool(s) from '{{name}}'.":
    "{{count}} ferramenta(s) descoberta(s) de '{{name}}'.",
  'Authentication complete. Returning to server details...':
    'Autenticação concluída. Retornando aos detalhes do servidor...',
  'Authentication successful.': 'Autenticação bem-sucedida.',
  // =========================================================
  // Commands - Summary
  // ============================================================================
  'Generate a project summary and save it to .o1-code/PROJECT_SUMMARY.md':
    'Gerar um resumo do projeto e salvá-lo em .o1-code/PROJECT_SUMMARY.md',
  'No chat client available to generate summary.':
    'Nenhum cliente de chat disponível para gerar o resumo.',
  'Already generating summary, wait for previous request to complete':
    'Já gerando resumo, aguarde a conclusão da solicitação anterior',
  'No conversation found to summarize.':
    'Nenhuma conversa encontrada para resumir.',
  'Summary path already exists and is not a generated summary: {{path}}':
    'O caminho do resumo já existe e não é um resumo gerado: {{path}}',
  'Summary path must be within the project root.':
    'O caminho do resumo deve estar dentro da raiz do projeto.',
  'Summary path resolves to an existing directory: {{path}}':
    'O caminho do resumo resolve para um diretório existente: {{path}}',
  'Summary path ends with a separator but is an existing file: {{path}}':
    'O caminho do resumo termina com um separador, mas é um arquivo existente: {{path}}',
  'Failed to generate project context summary: {{error}}':
    'Falha ao gerar resumo do contexto do projeto: {{error}}',
  'Saved project summary to {{filePathForDisplay}}.':
    'Resumo do projeto salvo em {{filePathForDisplay}}.',
  'Saving project summary...': 'Salvando resumo do projeto...',
  'Generating project summary...': 'Gerando resumo do projeto...',
  'Processing summary...': 'Processando resumo...',
  'Project summary generated and saved successfully!':
    'Resumo do projeto gerado e salvo com sucesso!',
  'Saved to: {{filePath}}': 'Salvo em: {{filePath}}',
  'Stopped because': 'Parado porque',
  'Failed to generate summary - no text content received from LLM response':
    'Falha ao gerar resumo - nenhum conteúdo de texto recebido da resposta do LLM',

  // ============================================================================
  // Commands - Model
  // ============================================================================
  'Switch the model for this session (--fast for suggestion model, [model-id] to switch immediately).':
    'Trocar o modelo para esta sessão (--fast para modelo de sugestões)',
  'Set a lighter model for prompt suggestions and speculative execution':
    'Definir modelo mais leve para sugestões de prompt e execução especulativa',
  'Content generator configuration not available.':
    'Configuração do gerador de conteúdo não disponível.',
  'Authentication type not available.': 'Tipo de autenticação não disponível.',
  'No models available for the current authentication type ({{authType}}).':
    'Nenhum modelo disponível para o tipo de autenticação atual ({{authType}}).',
  // Needs translation
  ' (not in model registry)': ' (not in model registry)',

  // ============================================================================
  // Commands - Clear
  // ============================================================================
  'Starting a new session, resetting chat, and clearing terminal.':
    'Iniciando uma nova sessão, resetando o chat e limpando o terminal.',
  'Starting a new session and clearing.':
    'Iniciando uma nova sessão e limpando.',

  // ============================================================================
  // Commands - Compress
  // ============================================================================
  'Already compressing, wait for previous request to complete':
    'Já comprimindo, aguarde a conclusão da solicitação anterior',
  'Failed to compress chat history.': 'Falha ao comprimir histórico do chat.',
  'Failed to compress chat history: {{error}}':
    'Falha ao comprimir histórico do chat: {{error}}',
  'Compressing chat history': 'Comprimindo histórico do chat',
  'Chat history compressed from {{originalTokens}} to {{newTokens}} tokens.':
    'Histórico do chat comprimido de {{originalTokens}} para {{newTokens}} tokens.',
  'Compression was not beneficial for this history size.':
    'A compressão não foi benéfica para este tamanho de histórico.',
  'Chat history compression did not reduce size. This may indicate issues with the compression prompt.':
    'A compressão do histórico do chat não reduziu o tamanho. Isso pode indicar problemas com o prompt de compressão.',
  'Could not compress chat history due to a token counting error.':
    'Não foi possível comprimir o histórico do chat devido a um erro de contagem de tokens.',
  'Could not compress chat history because the compression summary was empty.':
    'Não foi possível comprimir o histórico do chat porque o resumo da compressão estava vazio.',
  'Could not compress chat history because the compression summary was truncated.':
    'Não foi possível comprimir o histórico do chat porque o resumo da compressão foi truncado.',
  'Could not compress chat history due to an API error.':
    'Não foi possível comprimir o histórico do chat devido a um erro da API.',
  // ============================================================================
  // Commands - Directory
  // ============================================================================
  'Configuration is not available.': 'A configuração não está disponível.',
  'Please provide at least one path to add.':
    'Forneça pelo menos um caminho para adicionar.',
  'The /directory add command is not supported in restrictive sandbox profiles. Please use --include-directories when starting the session instead.':
    'O comando /directory add não é suportado em perfis de sandbox restritivos. Use --include-directories ao iniciar a sessão.',
  "Error adding '{{path}}': {{error}}":
    "Erro ao adicionar '{{path}}': {{error}}",
  'Successfully added AGENTS.md files from the following directories if there are:\n- {{directories}}':
    'Arquivos AGENTS.md adicionados com sucesso dos seguintes diretórios, se houverem:\n- {{directories}}',
  'Error refreshing memory: {{error}}': 'Erro ao atualizar memória: {{error}}',
  'Successfully added directories:\n- {{directories}}':
    'Diretórios adicionados com sucesso:\n- {{directories}}',
  'Current workspace directories:\n{{directories}}':
    'Diretórios atuais do workspace:\n{{directories}}',

  // ============================================================================
  // Commands - Docs
  // ============================================================================
  'Please open the following URL in your browser to view the documentation:\n{{url}}':
    'Abra a seguinte URL no seu navegador para ver a documentação:\n{{url}}',
  'Opening documentation in your browser: {{url}}':
    'Abrindo documentação no seu navegador: {{url}}',

  // ============================================================================
  // Dialogs - Tool Confirmation
  // ============================================================================
  'Do you want to proceed?': 'Você deseja prosseguir?',
  'Yes, allow once': 'Sim, permitir uma vez',
  'Allow always': 'Permitir sempre',
  Yes: 'Sim',
  No: 'Não',
  'No (esc)': 'Não (esc)',
  // MCP Management - Core translations
  'Manage MCP servers': 'Gerenciar MCP servers',
  'Server Detail': 'Detalhes do servidor',
  Tools: 'Ferramentas',
  'Tool Detail': 'Detalhes da ferramenta',
  'Loading...': 'Carregando...',
  'Unknown step': 'Etapa desconhecida',
  'Esc to back': 'Esc para voltar',
  '↑↓ to navigate · Enter to select · Esc to close':
    '↑↓ navegar · Enter selecionar · Esc fechar',
  '↑↓ to navigate · Enter to select · Esc to back':
    '↑↓ navegar · Enter selecionar · Esc voltar',
  '↑↓ to navigate · Enter to confirm · Esc to back':
    '↑↓ navegar · Enter confirmar · Esc voltar',
  'User Settings (global)': 'Configurações do usuário (global)',
  'Workspace Settings (project-specific)':
    'Configurações do workspace (específico do projeto)',
  'Disable server:': 'Desativar servidor:',
  'Select where to add the server to the exclude list:':
    'Selecione onde adicionar o servidor à lista de exclusão:',
  'Press Enter to confirm, Esc to cancel':
    'Enter para confirmar, Esc para cancelar',
  Disable: 'Desativar',
  Enable: 'Ativar',
  Authenticate: 'Autenticar',
  'Re-authenticate': 'Reautenticar',
  'Clear Authentication': 'Limpar autenticação',
  disabled: 'desativado',
  enabled: 'ativado',
  'disabled (bare mode)': 'desativado (modo mínimo)',
  'disabled (safe mode)': 'desativado (modo seguro)',
  'disabled (disableAllHooks)': 'desativado (disableAllHooks)',
  'disabled (folder not trusted)': 'desativado (pasta não confiável)',
  'disabled (turned off for this session)':
    'desativado (desligado nesta sessão)',
  'Server:': 'Servidor:',
  Reconnect: 'Reconectar',
  'View tools': 'Ver ferramentas',
  'Source:': 'Fonte:',
  'Command:': 'Comando:',
  'Working Directory:': 'Diretório de trabalho:',
  'No server selected': 'Nenhum servidor selecionado',
  'Error:': 'Erro:',
  tool: 'ferramenta',
  tools: 'ferramentas',
  connected: 'conectado',
  connecting: 'conectando',
  disconnected: 'desconectado',
  error: 'erro',

  // MCP Server List
  'User MCPs': 'MCPs do usuário',
  'Project MCPs': 'MCPs do projeto',
  'Extension MCPs': 'MCPs de extensão',
  server: 'servidor',
  servers: 'servidores',
  'Add MCP servers to your settings to get started.':
    'Adicione MCP servers às suas configurações para começar.',
  'Run o1-code --debug to see error logs':
    'Execute o1-code --debug para ver os logs de erro',

  // MCP OAuth Authentication
  'OAuth Authentication': 'Autenticação OAuth',
  'Authenticating... Please complete the login in your browser.':
    'Autenticando... Por favor, conclua o login no seu navegador.',
  // MCP Tool List
  'No tools available for this server.':
    'Nenhuma ferramenta disponível para este servidor.',
  destructive: 'destrutivo',
  'read-only': 'somente leitura',
  'open-world': 'mundo aberto',
  idempotent: 'idempotente',
  'Tools for {{serverName}}': 'Ferramentas para {{serverName}}',
  '{{current}}/{{total}}': '{{current}}/{{total}}',

  // MCP Tool Detail
  required: 'obrigatório',
  Parameters: 'Parâmetros',
  'No tool selected': 'Nenhuma ferramenta selecionada',
  Server: 'Servidor',

  // Invalid tool related translations
  '{{count}} invalid tools': '{{count}} ferramentas inválidas',
  invalid: 'inválido',
  'invalid: {{reason}}': 'inválido: {{reason}}',
  'missing name': 'nome ausente',
  'missing description': 'descrição ausente',
  '(unnamed)': '(sem nome)',
  'Warning: This tool cannot be called by the LLM':
    'Aviso: Esta ferramenta não pode ser chamada pelo LLM',
  Reason: 'Motivo',
  'Tools must have both name and description to be used by the LLM.':
    'As ferramentas devem ter tanto nome quanto descrição para serem usadas pelo LLM.',
  'Modify in progress:': 'Modificação em progresso:',
  'Save and close external editor to continue':
    'Salve e feche o editor externo para continuar',
  'Apply this change?': 'Aplicar esta alteração?',
  'Yes, allow always': 'Sim, permitir sempre',
  'Modify with external editor': 'Modificar com editor externo',
  'No, suggest changes (esc)': 'Não, sugerir alterações (esc)',
  "Allow execution of: '{{command}}'?":
    "Permitir a execução de: '{{command}}'?",
  'Always allow in this project': 'Sempre permitir neste projeto',
  'Always allow {{action}} in this project':
    'Sempre permitir {{action}} neste projeto',
  'Always allow for this user': 'Sempre permitir para este usuário',
  'Always allow {{action}} for this user':
    'Sempre permitir {{action}} para este usuário',
  'Yes, restore previous mode ({{mode}})':
    'Sim, restaurar modo anterior ({{mode}})',
  'Yes, and auto-accept edits': 'Sim, e aceitar edições automaticamente',
  'Yes, and manually approve edits': 'Sim, e aprovar edições manualmente',
  'Approve and run as a Goal': 'Aprovar e executar como objetivo',
  'No, keep planning (esc)': 'Não, continuar planejando (esc)',
  'URLs to fetch:': 'URLs para buscar:',
  'MCP Server: {{server}}': 'MCP Server: {{server}}',
  'Tool: {{tool}}': 'Ferramenta: {{tool}}',
  'Allow execution of MCP tool "{{tool}}" from server "{{server}}"?':
    'Permitir a execução de MCP tool "{{tool}}" de MCP server "{{server}}"?',
  // ============================================================================
  // Dialogs - Shell Confirmation
  // ============================================================================
  'Shell Command Execution': 'Execução de Comando Shell',
  'A custom command wants to run the following shell commands:':
    'Um comando personalizado deseja executar os seguintes comandos shell:',
  // ============================================================================
  // Dialogs - Welcome Back
  // ============================================================================
  'Current Plan:': 'Plano Atual:',
  'Progress: {{done}}/{{total}} tasks completed':
    'Progresso: {{done}}/{{total}} tarefas concluídas',
  ', {{inProgress}} in progress': ', {{inProgress}} em progresso',
  'Pending Tasks:': 'Tarefas Pendentes:',
  'What would you like to do?': 'O que você gostaria de fazer?',
  'Choose how to proceed with your session:':
    'Escolha como proceder com sua sessão:',
  'Start new chat session': 'Iniciar nova sessão de chat',
  'Continue previous conversation': 'Continuar conversa anterior',
  'Welcome back! (Last updated: {{timeAgo}})':
    'Bem-vindo de volta! (Última atualização: {{timeAgo}})',
  'Overall Goal:': 'Objetivo Geral:',
  'Connect a Provider': 'Conectar um provedor',
  'You must connect a provider to proceed. Press Ctrl+C again to exit.':
    'Você deve conectar um provedor para prosseguir. Pressione Ctrl+C novamente para sair.',
  'Terms of Services and Privacy Notice':
    'Termos de Serviço e Aviso de Privacidade',
  'Paid \u00B7 Up to 6,000 requests/5 hrs \u00B7 All Alibaba Cloud Coding Plan Models':
    'Pago \u00B7 Até 6.000 solicitações/5 hrs \u00B7 Todos os modelos Alibaba Cloud Coding Plan',
  'Alibaba Cloud Coding Plan': 'Alibaba Cloud Coding Plan',
  'Bring your own API key': 'Traga sua própria API Key',
  'Authentication is enforced to be {{enforcedType}}, but you are currently using {{currentType}}.':
    'A autenticação é forçada para {{enforcedType}}, mas você está usando {{currentType}} no momento.',
  'Authentication timed out. Please try again.':
    'A autenticação expirou. Tente novamente.',
  'Waiting for auth... (Press ESC or CTRL+C to cancel)':
    'Aguardando autenticação... (Pressione ESC ou CTRL+C para cancelar)',
  'Missing API key for OpenAI-compatible auth. Connect a provider with /auth, or set the {{envKeyHint}} environment variable.':
    'API Key ausente para autenticação compatível com OpenAI. Conecte um provedor com /auth ou defina a variável de ambiente {{envKeyHint}}.',
  '{{envKeyHint}} environment variable not found. Please set it in your .env file or environment variables.':
    'Variável de ambiente {{envKeyHint}} não encontrada. Defina-a no seu arquivo .env ou variáveis de ambiente.',
  '{{envKeyHint}} environment variable not found. Connect a provider with /auth, or set it in your .env file or environment variables.':
    'Variável de ambiente {{envKeyHint}} não encontrada. Conecte um provedor com /auth ou defina-a no seu arquivo .env ou nas variáveis de ambiente.',
  'Forget the saved API key of a provider':
    'Esquecer a chave de API salva de um provedor',
  'Provider id, as in ~/.o1-code/credentials/<id>.json':
    'Id do provedor, como em ~/.o1-code/credentials/<id>.json',
  'Invalid credential id "{{id}}": use lowercase letters, digits and dashes.':
    'Id de credencial "{{id}}" inválido: use letras minúsculas, dígitos e hifens.',
  'Removed the saved key for {{id}} ({{file}}).':
    'Chave salva de {{id}} removida ({{file}}).',
  'No saved key for {{id}}.': 'Nenhuma chave salva para {{id}}.',
  'Removed the credential reference from {{count}} model entries in {{file}}.':
    'Referência à credencial removida de {{count}} entradas de modelo em {{file}}.',
  'Missing API key for OpenAI-compatible auth. Set the {{envKeyHint}} environment variable.':
    'API Key ausente para autenticação compatível com OpenAI. Defina a variável de ambiente {{envKeyHint}}.',
  'Anthropic provider missing required baseUrl in modelProviders[].baseUrl.':
    'Provedor Anthropic sem a baseUrl necessária em modelProviders[].baseUrl.',
  'ANTHROPIC_BASE_URL environment variable not found.':
    'Variável de ambiente ANTHROPIC_BASE_URL não encontrada.',
  'Invalid auth method selected.':
    'Método de autenticação inválido selecionado.',
  'Failed to authenticate. Message: {{message}}':
    'Falha ao autenticar. Mensagem: {{message}}',
  'Authenticated successfully with {{authType}} credentials.':
    'Autenticado com sucesso com credenciais {{authType}}.',
  'Invalid O1CODE_DEFAULT_AUTH_TYPE value: "{{value}}". Valid values are: {{validValues}}':
    'Valor O1CODE_DEFAULT_AUTH_TYPE inválido: "{{value}}". Valores válidos são: {{validValues}}',
  // ============================================================================
  // Dialogs - Model
  // ============================================================================
  'Select Model': 'Selecionar Modelo',
  'API Key': 'API Key',
  '(default)': '(padrão)',
  '(not set)': '(não definido)',
  Modality: 'Modalidade',
  'Context Window': 'Janela de Contexto',
  text: 'texto',
  'text-only': 'somente texto',
  image: 'imagem',
  pdf: 'PDF',
  audio: 'áudio',
  video: 'vídeo',
  'not set': 'não definido',
  none: 'nenhum',
  unknown: 'desconhecido',
  // ============================================================================
  // Dialogs - Permissions
  // ============================================================================
  'Manage folder trust settings':
    'Gerenciar configurações de confiança de pasta',
  'Manage permission rules': 'Gerenciar permission rules',
  Allow: 'Permitir',
  Ask: 'Perguntar',
  Deny: 'Negar',
  Workspace: 'Área de trabalho',
  "O1-Code won't ask before using allowed tools.":
    'O O1-Code não perguntará antes de usar ferramentas permitidas.',
  'O1-Code will ask before using these tools.':
    'O O1-Code perguntará antes de usar essas ferramentas.',
  'O1-Code is not allowed to use denied tools.':
    'O O1-Code não tem permissão para usar ferramentas negadas.',
  'Manage trusted directories for this workspace.':
    'Gerenciar diretórios confiáveis para esta área de trabalho.',
  'Any use of the {{tool}} tool': 'Qualquer uso da ferramenta {{tool}}',
  "{{tool}} commands matching '{{pattern}}'":
    "Comandos {{tool}} correspondentes a '{{pattern}}'",
  'From user settings': 'Das configurações do usuário',
  'From project settings': 'Das configurações do projeto',
  'From session': 'Da sessão',
  'Project settings': 'Configurações do projeto',
  'Checked in at .o1-code/settings.json':
    'Registrado em .o1-code/settings.json',
  'User settings': 'Configurações do usuário',
  'Saved in at ~/.o1-code/settings.json': 'Salvo em ~/.o1-code/settings.json',
  'Add a new rule…': 'Adicionar nova regra…',
  'Add {{type}} permission rule': 'Adicionar {{type}} permission rule',
  'Permission rules are a tool name, optionally followed by a specifier in parentheses.':
    'permission rules são um nome de ferramenta, opcionalmente seguido por um especificador entre parênteses.',
  'e.g.,': 'ex.',
  or: 'ou',
  'Enter permission rule…': 'Insira permission rule…',
  'Enter to submit · Esc to cancel': 'Enter para enviar · Esc para cancelar',
  'Where should this rule be saved?': 'Onde esta regra deve ser salva?',
  'Enter to confirm · Esc to cancel':
    'Enter para confirmar · Esc para cancelar',
  'Delete {{type}} rule?': 'Excluir regra {{type}}?',
  'Are you sure you want to delete this permission rule?':
    'Tem certeza de que deseja excluir esta permission rule?',
  'Permissions:': 'Permissões:',
  '(←/→ or tab to cycle)': '(←/→ ou Tab para alternar)',
  'Press ↑↓ to navigate · Enter to select · Type to search · Esc to cancel':
    '↑↓ para navegar · Enter para selecionar · Digite para pesquisar · Esc para cancelar',
  'Search…': 'Pesquisar…',
  // Workspace directory management
  'Add directory…': 'Adicionar diretório…',
  'Add directory to workspace': 'Adicionar diretório à área de trabalho',
  'O1-Code can read files in the workspace, and make edits when auto-accept edits is on.':
    'O O1-Code pode ler arquivos na área de trabalho e fazer edições quando a aceitação automática está ativada.',
  'O1-Code will be able to read files in this directory and make edits when auto-accept edits is on.':
    'O O1-Code poderá ler arquivos neste diretório e fazer edições quando a aceitação automática está ativada.',
  'Enter the path to the directory:': 'Insira o caminho do diretório:',
  'Enter directory path…': 'Insira o caminho do diretório…',
  'Tab to complete · Enter to add · Esc to cancel':
    'Tab para completar · Enter para adicionar · Esc para cancelar',
  'Remove directory?': 'Remover diretório?',
  'Are you sure you want to remove this directory from the workspace?':
    'Tem certeza de que deseja remover este diretório da área de trabalho?',
  '  (Original working directory)': '  (Diretório de trabalho original)',
  '  (from settings)': '  (das configurações)',
  'Directory does not exist.': 'O diretório não existe.',
  'Path is not a directory.': 'O caminho não é um diretório.',
  'This directory is already in the workspace.':
    'Este diretório já está na área de trabalho.',
  'Already covered by existing directory: {{dir}}':
    'Já coberto pelo diretório existente: {{dir}}',

  // ============================================================================
  // Status Bar
  // ============================================================================
  'Using:': 'Usando:',
  '{{count}} open file': '{{count}} arquivo aberto',
  '{{count}} open files': '{{count}} arquivos abertos',
  '(ctrl+g to view)': '(ctrl+g para ver)',
  '{{count}} {{name}} file': '{{count}} arquivo {{name}}',
  '{{count}} {{name}} files': '{{count}} arquivos {{name}}',
  '{{count}} MCP server': '{{count}} MCP server',
  '{{count}} MCP servers': '{{count}} MCP servers',
  '{{count}} Blocked': '{{count}} Bloqueados',
  '(ctrl+t to view)': '(ctrl+t para ver)',
  '(ctrl+t to toggle)': '(ctrl+t para alternar)',
  'Press Ctrl+C again to exit.': 'Pressione Ctrl+C novamente para sair.',
  'Press Ctrl+D again to exit.': 'Pressione Ctrl+D novamente para sair.',
  'Press Esc again to clear.': 'Pressione Esc novamente para limpar.',
  'Press ↑ to edit queued messages':
    'Pressione ↑ para editar mensagens na fila',

  // ============================================================================
  // MCP Status
  // ============================================================================
  'No MCP servers configured.': 'Nenhum MCP servers configurado.',
  '◌ MCP servers are starting up ({{count}} initializing)...':
    '◌ MCP servers estão iniciando ({{count}} inicializando)...',
  'Note: First startup may take longer. Tool availability will update automatically.':
    'Nota: A primeira inicialização pode demorar mais. A disponibilidade da ferramenta será atualizada automaticamente.',
  'Configured MCP servers:': 'MCP servers configurados:',
  Ready: 'Pronto',
  'Starting... (first startup may take longer)':
    'Iniciando... (a primeira inicialização pode demorar mais)',
  Disconnected: 'Desconectado',
  '{{count}} tool': '{{count}} ferramenta',
  '{{count}} tools': '{{count}} ferramentas',
  '{{count}} prompt': '{{count}} prompt',
  '{{count}} prompts': '{{count}} prompts',
  '(from {{extensionName}})': '(de {{extensionName}})',
  OAuth: 'OAuth',
  'OAuth expired': 'OAuth expirado',
  'OAuth not authenticated': 'OAuth não autenticado',
  'tools and prompts will appear when ready':
    'ferramentas e prompts aparecerão quando estiverem prontos',
  '{{count}} tools cached': '{{count}} ferramentas em cache',
  'Tools:': 'Ferramentas:',
  'Parameters:': 'Parâmetros:',
  'Prompts:': 'Prompts:',
  'Resources:': 'Recursos:',
  Blocked: 'Bloqueado',
  '★ Tips:': '★ Dicas:',
  'to show server and tool descriptions':
    'para mostrar descrições de servidores e ferramentas',
  'to show tool parameter schemas': 'para mostrar tool parameter schemas',
  'to hide descriptions': 'para ocultar descrições',
  'to authenticate with OAuth-enabled servers':
    'para autenticar com servidores habilitados para OAuth',
  Press: 'Pressione',
  'to toggle tool descriptions on/off':
    'para alternar descrições de ferramentas ligadas/desligadas',
  "Starting OAuth authentication for MCP server '{{name}}'...":
    "Iniciando autenticação OAuth para MCP server '{{name}}'...",
  // ============================================================================
  // Startup Tips
  // ============================================================================
  'Tips:': 'Dicas:',
  'Use /compress when the conversation gets long to summarize history and free up context.':
    'Use /compress quando a conversa ficar longa para resumir o histórico e liberar contexto.',
  'Start a fresh idea with /clear or /new; the previous session stays available in history.':
    'Comece uma nova ideia com /clear ou /new; a sessão anterior permanece disponível no histórico.',
  'Use /bug to submit issues to the maintainers when something goes off.':
    'Use /bug para enviar problemas aos mantenedores quando algo der errado.',
  'Switch auth type quickly with /auth.':
    'Troque o tipo de autenticação rapidamente com /auth.',
  'You can run any shell commands from O1-Code using ! (e.g. !ls).':
    'Você pode executar quaisquer comandos shell do O1-Code usando ! (ex: !ls).',
  'Type / to open the command popup; Tab autocompletes slash commands and saved prompts.':
    'Digite / para abrir o popup de comandos; Tab autocompleta comandos de barra e prompts salvos.',
  'You can resume a previous conversation by running o1-code --continue or o1-code --resume.':
    'Você pode retomar uma conversa anterior executando o1-code --continue ou o1-code --resume.',
  'You can switch permission mode quickly with Shift+Tab or /approval-mode.':
    'Você pode alternar o modo de permissão rapidamente com Shift+Tab ou /approval-mode.',
  'Try /insight to generate personalized insights from your chat history.':
    'Experimente /insight para gerar insights personalizados do seu histórico de conversas.',
  'Add an AGENTS.md file to give O1-Code persistent project context.':
    'Adicione um arquivo AGENTS.md para dar ao O1-Code um contexto persistente do projeto.',
  'Use /btw to ask a quick side question without disrupting the conversation.':
    'Use /btw para fazer uma pergunta lateral rápida sem interromper a conversa.',
  'Context is almost full! Run /compress now or start /new to continue.':
    'O contexto está quase cheio! Execute /compress agora ou inicie /new para continuar.',
  'Context is getting full. Use /compress to free up space.':
    'O contexto está ficando cheio. Use /compress para liberar espaço.',
  'Long conversation? /compress summarizes history to free context.':
    'Conversa longa? /compress resume o histórico para liberar contexto.',

  // ============================================================================
  // Exit Screen / Stats
  // ============================================================================
  'Agent powering down. Goodbye!': 'Agente desligando. Adeus!',
  'To continue this session, run': 'Para continuar esta sessão, execute',
  'Interaction Summary': 'Resumo da Interação',
  'Session ID:': 'ID da Sessão:',
  'Tool Calls:': 'Chamadas de Ferramenta:',
  'Success Rate:': 'Taxa de Sucesso:',
  'User Agreement:': 'Acordo do Usuário:',
  reviewed: 'revisado',
  'Code Changes:': 'Alterações de Código:',
  Performance: 'Desempenho',
  'Generation Metrics': 'Métricas de geração',
  'Latest Request': 'Última solicitação',
  'Generation Time': 'Tempo de geração',
  'Average TTFT': 'TTFT médio',
  'Session TPS': 'TPS da sessão',
  'Wall Time:': 'Tempo Total:',
  'Agent Active:': 'Agente Ativo:',
  'API Time:': 'Tempo de API:',
  'Tool Time:': 'Tempo de Ferramenta:',
  'Session Stats': 'Estatísticas da Sessão',
  'Model Usage': 'Uso do Modelo',
  Reqs: 'Reqs',
  'Input Tokens': 'Tokens de Entrada',
  'Output Tokens': 'Tokens de Saída',
  'Savings Highlight:': 'Destaque de Economia:',
  'of input tokens were served from the cache, reducing costs.':
    'de tokens de entrada foram servidos do cache, reduzindo custos.',
  'Tip: For a full token breakdown, run `/stats model`.':
    'Dica: Para um detalhamento completo de tokens, execute `/stats model`.',
  'Model Stats For Nerds': 'Estatísticas de Modelo Para Nerds',
  'Tool Stats For Nerds': 'Estatísticas de Ferramenta Para Nerds',
  Metric: 'Métrica',
  API: 'API',
  Requests: 'Solicitações',
  Errors: 'Erros',
  'Avg Latency': 'Latência Média',
  Tokens: 'Tokens',
  Total: 'Total',
  Prompt: 'Prompt',
  Cached: 'Cacheado',
  Thoughts: 'Pensamentos',
  Output: 'Saída',
  'No API calls have been made in this session.':
    'Nenhuma chamada de API foi feita nesta sessão.',
  'Tool Name': 'Nome da Ferramenta',
  Calls: 'Chamadas',
  'Success Rate': 'Taxa de Sucesso',
  'Avg Duration': 'Duração Média',
  'User Decision Summary': 'Resumo de Decisão do Usuário',
  'Total Reviewed Suggestions:': 'Total de Sugestões Revisadas:',
  ' » Accepted:': ' » Aceitas:',
  ' » Rejected:': ' » Rejeitadas:',
  ' » Modified:': ' » Modificadas:',
  ' Overall Agreement Rate:': ' Taxa Geral de Acordo:',
  'No tool calls have been made in this session.':
    'Nenhuma chamada de ferramenta foi feita nesta sessão.',
  'Session start time is unavailable, cannot calculate stats.':
    'Hora de início da sessão indisponível, não é possível calcular estatísticas.',
  Activity: 'Atividade',
  Efficiency: 'Eficiência',
  Today: 'Hoje',
  'Token Trend': 'Tendência de Tokens',
  'Cache Hit Rate': 'Taxa de cache',
  'Tool Success': 'Sucesso de ferramentas',
  'Tool Leaderboard': 'Ranking de ferramentas',
  Time: 'Tempo',
  Success: 'Sucesso',
  Cache: 'Cache',
  Latency: 'Latência',
  'Code Impact': 'Impacto no código',
  net: 'líquido',
  streak: 'sequência',
  best: 'recorde',

  // ============================================================================
  // Command Format Migration
  // ============================================================================
  'Command Format Migration': 'Migração de Formato de Comando',
  'Found {{count}} TOML command file:':
    'Encontrado {{count}} arquivo de comando TOML:',
  'Found {{count}} TOML command files:':
    'Encontrados {{count}} arquivos de comando TOML:',
  'Current tasks': 'Tarefas atuais',
  'Background tasks': 'Tarefas em segundo plano',
  'No tasks currently running': 'Nenhuma tarefa em execução',
  'No entry to show.': 'Nenhuma entrada para mostrar.',
  'needs approval': 'precisa de aprovação',
  'Large workflow': 'Workflow grande',
  'Large workflow: {{agents}} agents scheduled (warning threshold {{cap}}).':
    'Workflow grande: {{agents}} agentes agendados (limite de aviso {{cap}}).',
  'Large workflow: ~{{tokens}} output tokens projected (warning threshold {{cap}}).':
    'Workflow grande: ~{{tokens}} tokens de saída previstos (limite de aviso {{cap}}).',
  'rejected — edit config to re-approve':
    'rejeitado — edite a configuração para reaprovar',
  'Background agent needs approval':
    'Agente em segundo plano precisa de aprovação',
  'from nested agent': 'do agent aninhado',
  'Approve or deny the request above': 'Aprove ou negue a solicitação acima',
  Running: 'Em execução',
  Pausing: 'Pausando',
  Paused: 'Pausado',
  'Pause is cooperative; in-flight work may finish before the workflow is paused. An agent call waiting on a tool approval keeps the run in this state and still counts against the active-time limit until the approval is answered.':
    'A pausa é cooperativa; o trabalho em andamento pode terminar antes que o fluxo de trabalho seja pausado. Uma chamada de agente aguardando aprovação de ferramenta mantém a execução neste estado e continua contando para o limite de tempo ativo até que a aprovação seja respondida.',
  'Paused: no new agents will start; script code between agent calls keeps running. Press p to resume. /clear, /branch, and switching sessions cancel paused runs.':
    'Pausado: nenhum novo agente será iniciado; o código do script entre chamadas de agente continua em execução. Pressione p para retomar. /clear, /branch e a troca de sessão cancelam execuções pausadas.',
  'Pause/resume was rejected; the workflow state changed. Try again.':
    'A pausa/retomada foi rejeitada; o estado do fluxo de trabalho mudou. Tente novamente.',
  'Tip: use `/workflows p <runId>` or Background tasks + p to cooperatively pause/resume; use `/workflows <runId>` for details.':
    'Dica: use `/workflows p <runId>` ou Tarefas em segundo plano + p para pausar/retomar cooperativamente; use `/workflows <runId>` para ver detalhes.',
  Completed: 'Concluído',
  Failed: 'Falhou',
  Stopped: 'Parado',
  Shell: 'Shell',
  Monitor: 'Monitor',
  Command: 'Comando',
  Dream: 'Dream',
  '[dream] memory consolidation': '[dream] consolidação de memória',
  '[dream] memory consolidation (reviewing {{count}} session)':
    '[dream] consolidação de memória (revisando {{count}} sessão)',
  '[dream] memory consolidation (reviewing {{count}} sessions)':
    '[dream] consolidação de memória (revisando {{count}} sessões)',
  '... and {{count}} more': '... e mais {{count}}',
  'The TOML format is deprecated. Would you like to migrate them to Markdown format?':
    'O formato TOML está obsoleto. Você gostaria de migrá-los para o formato Markdown?',
  '(Backups will be created and original files will be preserved)':
    '(Backups serão criados e arquivos originais serão preservados)',

  // ============================================================================
  // Loading Phrases
  // ============================================================================
  'Waiting for user confirmation...': 'Aguardando confirmação do usuário...',
  WITTY_LOADING_PHRASES: [
    'Estou com sorte',
    'Enviando maravilhas...',
    'Pintando os serifos de volta...',
    'Navegando pelo mofo limoso...',
    'Consultando os espíritos digitais...',
    'Reticulando splines...',
    'Aquecendo os hamsters da IA...',
    'Perguntando à concha mágica...',
    'Gerando réplica espirituosa...',
    'Polindo os algoritmos...',
    'Não apresse a perfeição (ou meu código)...',
    'Preparando bytes frescos...',
    'Contando elétrons...',
    'Engajando processadores cognitivos...',
    'Verificando erros de sintaxe no universo...',
    'Um momento, otimizando o humor...',
    'Embaralhando piadas...',
    'Desembaraçando redes neurais...',
    'Compilando brilhantismo...',
    'Carregando humor.exe...',
    'Invocando a nuvem da sabedoria...',
    'Preparando uma resposta espirituosa...',
    'Só um segundo, estou depurando a realidade...',
    'Confundindo as opções...',
    'Sintonizando as frequências cósmicas...',
    'Criando uma resposta digna da sua paciência...',
    'Compilando os 1s e 0s...',
    'Resolvendo dependências... e crises existenciais...',
    'Desfragmentando memórias... tanto RAM quanto pessoais...',
    'Reiniciando o módulo de humor...',
    'Fazendo cache do essencial (principalmente memes de gatos)...',
    'Otimizando para velocidade absurda',
    'Trocando bits... não conte para os bytes...',
    'Coletando lixo... volto já...',
    'Montando a internet...',
    'Convertendo café em código...',
    'Atualizando a sintaxe da realidade...',
    'Reconectando as sinapses...',
    'Procurando um ponto e vírgula perdido...',
    'Lubrificando as engrenagens da máquina...',
    'Pré-aquecendo os servidores...',
    'Calibrando o capacitor de fluxo...',
    'Engajando o motor de improbabilidade...',
    'Canalizando a Força...',
    'Alinhando as estrelas para uma resposta ideal...',
    'Assim dizemos todos...',
    'Carregando a próxima grande ideia...',
    'Só um momento, estou na zona...',
    'Preparando para deslumbrá-lo com brilhantismo...',
    'Só um tique, estou polindo minha inteligência...',
    'Segure firme, estou criando uma obra-prima...',
    'Só um instante, estou depurando o universo...',
    'Só um momento, estou alinhando os pixels...',
    'Só um segundo, estou otimizando o humor...',
    'Só um momento, estou ajustando os algoritmos...',
    'Velocidade de dobra engajada...',
    'Minerando mais cristais de Dilithium...',
    'Não entre em pânico...',
    'Seguindo o coelho branco...',
    'A verdade está lá fora... em algum lugar...',
    'Soprando o cartucho...',
    'Carregando... Faça um barrel roll!',
    'Aguardando o respawn...',
    'Terminando a Kessel Run em menos de 12 parsecs...',
    'O bolo não é uma mentira, só ainda está carregando...',
    'Mexendo na tela de criação de personagem...',
    'Só um momento, estou encontrando o meme certo...',
    "Pressionando 'A' para continuar...",
    'Pastoreando gatos digitais...',
    'Polindo os pixels...',
    'Encontrando um trocadilho adequado para a tela de carregamento...',
    'Distraindo você com esta frase espirituosa...',
    'Quase lá... provavelmente...',
    'Nossos hamsters estão trabalhando o mais rápido que podem...',
    'Dando um tapinha na cabeça do Cloudy...',
    'Acariciando o gato...',
    'Dando um Rickroll no meu chefe...',
    'Never gonna give you up, never gonna let you down...',
    'Tocando o baixo...',
    'Provando as amoras...',
    'Estou indo longe, estou indo pela velocidade...',
    'Isso é vida real? Ou é apenas fantasia?...',
    'Tenho um bom pressentimento sobre isso...',
    'Cutucando o urso...',
    'Fazendo pesquisa sobre os últimos memes...',
    'Descobrindo como tornar isso mais espirituoso...',
    'Hmmm... deixe-me pensar...',
    'O que você chama de um peixe sem olhos? Um pxe...',
    'Por que o computador foi à terapia? Porque tinha muitos bytes...',
    'Por que programadores não gostam da natureza? Porque tem muitos bugs...',
    'Por que programadores preferem o modo escuro? Porque a luz atrai bugs...',
    'Por que o desenvolvedor faliu? Porque usou todo o seu cache...',
    'O que você pode fazer com um lápis quebrado? Nada, ele não tem ponta...',
    'Aplicando manutenção percussiva...',
    'Procurando a orientação correta do USB...',
    'Garantindo que a fumaça mágica permaneça dentro dos fios...',
    'Tentando sair do Vim...',
    'Girando a roda do hamster...',
    'Isso não é um bug, é um recurso não documentado...',
    'Engajar.',
    'Eu voltarei... com uma resposta.',
    'Meu outro processo é uma TARDIS...',
    'Comungando com o espírito da máquina...',
    'Deixando os pensamentos marinarem...',
    'Lembrei agora onde coloquei minhas chaves...',
    'Ponderando a orbe...',
    'Eu vi coisas que vocês não acreditariam... como um usuário que lê mensagens de carregamento.',
    'Iniciando olhar pensativo...',
    'Qual é o lanche favorito de um computador? Microchips.',
    'Por que desenvolvedores Java usam óculos? Porque eles não C#.',
    'Carregando o laser... pew pew!',
    'Dividindo por zero... só brincando!',
    'Procurando por um supervisor adulto... digo, processando.',
    'Fazendo bip boop.',
    'Buffering... porque até as IAs precisam de um momento.',
    'Entrelaçando partículas quânticas para uma resposta mais rápida...',
    'Polindo o cromo... nos algoritmos.',
    'Você não está entretido? (Trabalhando nisso!)',
    'Invocando os gremlins do código... para ajudar, é claro.',
    'Só esperando o som da conexão discada terminar...',
    'Recalibrando o humorômetro.',
    'Minha outra tela de carregamento é ainda mais engraçada.',
    'Tenho quase certeza que tem um gato andando no teclado em algum lugar...',
    'Aumentando... Aumentando... Ainda carregando.',
    'Não é um bug, é um recurso... desta tela de carregamento.',
    'Você já tentou desligar e ligar de novo? (A tela de carregamento, não eu.)',
    'Construindo pilares adicionais...',
  ],

  // ============================================================================
  // Extension Settings Input
  // ============================================================================
  'Enter value...': 'Digite o valor...',
  'Enter sensitive value...': 'Digite o valor sensível...',
  'Press Enter to submit, Escape to cancel':
    'Pressione Enter para enviar, Escape para cancelar',

  // ============================================================================
  // Command Migration Tool
  // ============================================================================
  'Markdown file already exists: {{filename}}':
    'Arquivo Markdown já existe: {{filename}}',
  'TOML Command Format Deprecation Notice':
    'Aviso de Obsolescência do Formato de Comando TOML',
  'Found {{count}} command file(s) in TOML format:':
    'Encontrado(s) {{count}} arquivo(s) de comando no formato TOML:',
  'The TOML format for commands is being deprecated in favor of Markdown format.':
    'O formato TOML para comandos está sendo descontinuado em favor do formato Markdown.',
  'Markdown format is more readable and easier to edit.':
    'O formato Markdown é mais legível e fácil de editar.',
  'You can migrate these files automatically using:':
    'Você pode migrar esses arquivos automaticamente usando:',
  'Or manually convert each file:': 'Ou converter manualmente cada arquivo:',
  'TOML: prompt = "..." / description = "..."':
    'TOML: prompt = "..." / description = "..."',
  'Markdown: YAML frontmatter + content':
    'Markdown: YAML frontmatter + conteúdo',
  'The migration tool will:': 'A ferramenta de migração irá:',
  'Convert TOML files to Markdown': 'Converter arquivos TOML para Markdown',
  'Create backups of original files': 'Criar backups dos arquivos originais',
  'Preserve all command functionality':
    'Preservar toda a funcionalidade do comando',
  'TOML format will continue to work for now, but migration is recommended.':
    'O formato TOML continuará a funcionar por enquanto, mas a migração é recomendada.',

  // ============================================================================
  // Extensions - Explore Command
  // ============================================================================
  'Open extensions page in your browser':
    'Abrir página de extensões no seu navegador',
  'Unknown extensions source: {{source}}.':
    'Fonte de extensões desconhecida: {{source}}.',
  'Would open extensions page in your browser: {{url}} (skipped in test environment)':
    'Abriria a página de extensões no seu navegador: {{url}} (pulado no ambiente de teste)',
  'View available extensions at {{url}}':
    'Ver extensões disponíveis em {{url}}',
  'Opening extensions page in your browser: {{url}}':
    'Abrindo página de extensões no seu navegador: {{url}}',
  'Failed to open browser. Check out the extensions gallery at {{url}}':
    'Falha ao abrir o navegador. Confira a galeria de extensões em {{url}}',

  // ============================================================================
  // Custom API Key Configuration
  // ============================================================================
  'You can configure your API key and models in settings.json':
    'Você pode configurar sua API Key e modelos em settings.json',
  'Refer to the documentation for setup instructions':
    'Consulte a documentação para instruções de configuração',

  // ============================================================================
  // Coding Plan Authentication
  // ============================================================================
  'API key cannot be empty.': 'A API Key não pode estar vazia.',
  'You can get your Coding Plan API key here':
    'Você pode obter sua API Key do Coding Plan aqui',
  'Failed to update Coding Plan configuration: {{message}}':
    'Falha ao atualizar a configuração do Coding Plan: {{message}}',

  // ============================================================================
  // Auth Dialog - View Titles and Labels
  // ============================================================================
  'Coding Plan': 'Coding Plan',
  Custom: 'Personalizado',
  'Select Region for Coding Plan': 'Selecionar região do Coding Plan',
  'Choose based on where your account is registered':
    'Escolha com base em onde sua conta está registrada',
  'Enter Coding Plan API Key': 'Inserir API Key do Coding Plan',

  // ============================================================================
  // Coding Plan International Updates
  // ============================================================================
  'New model configurations are available for {{region}}. Update now?':
    'Novas configurações de modelo estão disponíveis para o {{region}}. Atualizar agora?',
  '{{region}} configuration updated successfully. Model switched to "{{model}}".':
    'Configuração do {{region}} atualizada com sucesso. Modelo alterado para "{{model}}".',
  // ============================================================================
  // Context Usage Component
  // ============================================================================
  'Context Usage': 'Uso do Contexto',
  '% used': '% usado',
  '% context used': '% contexto usado',
  'Context exceeds limit! Use /compress or /clear to reduce.':
    'Contexto excede o limite! Use /compress ou /clear para reduzir.',
  'No API response yet. Send a message to see actual usage.':
    'Ainda não há resposta da API. Envie uma mensagem para ver o uso real.',
  'Estimated pre-conversation overhead': 'Sobrecarga estimada pré-conversa',
  'Context window': 'Janela de Contexto',
  tokens: 'tokens',
  Used: 'Usado',
  Free: 'Livre',
  'Autocompact buffer': 'Buffer de autocompactação',
  'Usage by category': 'Uso por categoria',
  'System prompt': 'Prompt do sistema',
  'Built-in tools': 'Ferramentas integradas',
  'MCP tools': 'MCP tools',
  'Memory files': 'Arquivos de memória',
  Skills: 'Habilidades',
  Messages: 'Mensagens',
  'Startup context': 'Contexto inicial',
  Unattributed: 'Não atribuído',
  'Cached prefix': 'Prefixo em cache',
  'Run /context detail for per-item breakdown.':
    'Execute /context detail para detalhamento por item.',
  active: 'ativo',
  'body loaded': 'conteúdo carregado',
  memory: 'memória',
  '{{region}} configuration updated successfully.':
    'Configuração do {{region}} atualizada com sucesso.',
  'Authenticated successfully with {{region}}. API key and model configs saved to settings.json.':
    'Autenticado com sucesso com {{region}}. API Key e configurações de modelo salvas em settings.json.',
  'Tip: Use /model to switch between available Coding Plan models.':
    'Dica: Use /model para alternar entre os modelos disponíveis do Coding Plan.',
  'Type something...': 'Digite algo...',
  Submit: 'Enviar',
  'Submit answers': 'Enviar respostas',
  Cancel: 'Cancelar',
  'Your answers:': 'Suas respostas:',
  '(not answered)': '(não respondido)',
  'Ready to submit your answers?': 'Pronto para enviar suas respostas?',
  '↑/↓: Navigate | ←/→: Switch tabs | Enter: Select':
    '↑/↓: Navegar | ←/→: Alternar abas | Enter: Selecionar',
  '↑/↓: Navigate | Enter: Select | Esc: Cancel':
    '↑/↓: Navegar | Enter: Selecionar | Esc: Cancelar',
  'Authenticate using Alibaba Cloud Coding Plan':
    'Autenticar usando Alibaba Cloud Coding Plan',
  'Region for Coding Plan (china/global)':
    'Região para Coding Plan (china/global)',
  'API key for Coding Plan': 'API Key para Coding Plan',
  'Show current authentication status': 'Mostrar status atual de autenticação',
  'Authentication completed successfully.':
    'Autenticação concluída com sucesso.',
  'Processing Alibaba Cloud Coding Plan authentication...':
    'Processando autenticação Alibaba Cloud Coding Plan...',
  'Successfully authenticated with Alibaba Cloud Coding Plan.':
    'Autenticado com sucesso via Alibaba Cloud Coding Plan.',
  'Failed to authenticate with Coding Plan: {{error}}':
    'Falha ao autenticar com Coding Plan: {{error}}',
  '阿里云百炼 (aliyun.com)': '阿里云百炼 (aliyun.com)',
  Global: 'Global',
  'Alibaba Cloud (alibabacloud.com)': 'Alibaba Cloud (alibabacloud.com)',
  'Select region for Coding Plan:': 'Selecione a região para Coding Plan:',
  'Enter your Coding Plan API key: ': 'Insira sua API Key do Coding Plan: ',
  'Select authentication method:': 'Selecione o método de autenticação:',
  '\n=== Authentication Status ===\n': '\n=== Status de Autenticação ===\n',
  '⚠  No authentication method configured.\n':
    '⚠  Nenhum método de autenticação configurado.\n',
  'Run one of the following commands to get started:\n':
    'Execute um dos seguintes comandos para começar:\n',
  'Or simply run:': 'Ou simplesmente execute:',
  '  o1-code auth             - Interactive authentication setup\n':
    '  o1-code auth             - Configuração interativa de autenticação\n',
  '  Limit: No longer available': '  Limite: Não mais disponível',
  '✓ Authentication Method: Alibaba Cloud Coding Plan':
    '✓ Método de autenticação: Alibaba Cloud Coding Plan',
  'Global - Alibaba Cloud': 'Global - Alibaba Cloud',
  '  Region: {{region}}': '  Região: {{region}}',
  '  Current Model: {{model}}': '  Modelo atual: {{model}}',
  '  Config Version: {{version}}': '  Versão da configuração: {{version}}',
  '  Status: API key configured\n': '  Status: API Key configurada\n',
  '⚠  Authentication Method: Alibaba Cloud Coding Plan (Incomplete)':
    '⚠  Método de autenticação: Alibaba Cloud Coding Plan (Incompleto)',
  '  Issue: API key not found in environment or settings\n':
    '  Problema: API Key não encontrada no ambiente ou configurações\n',
  '  Run `o1-code auth coding-plan` to re-configure.\n':
    '  Execute `o1-code auth coding-plan` para reconfigurar.\n',
  '✓ Authentication Method: {{type}}': '✓ Método de autenticação: {{type}}',
  '  Status: Configured\n': '  Status: Configurado\n',
  'Failed to check authentication status: {{error}}':
    'Falha ao verificar status de autenticação: {{error}}',
  'Select an option:': 'Selecione uma opção:',
  'Raw mode not available. Please run in an interactive terminal.':
    'Modo raw não disponível. Execute em um terminal interativo.',
  '(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)\n':
    '(Use ↑ ↓ para navegar, Enter para selecionar, Ctrl+C para sair)\n',
  'Switch to plan mode or exit plan mode':
    'Alternar para o modo de planejamento ou sair do modo de planejamento',
  'Set how hard reasoning-capable models think ({{tiers}}); mapped and clamped per provider.':
    'Define a intensidade de raciocínio dos modelos compatíveis ({{tiers}}); mapeada e limitada por provedor.',
  'Exited plan mode. Previous approval mode restored.':
    'Modo de planejamento encerrado. Modo de aprovação anterior restaurado.',
  'Enabled plan mode. The agent will analyze and plan without executing tools.':
    'Modo de planejamento ativado. O agente analisará e planejará sem executar ferramentas.',
  'Already in plan mode. Use "/plan exit" to exit plan mode.':
    'Já está no modo de planejamento. Use "/plan exit" para sair do modo de planejamento.',
  'Not in plan mode. Use "/plan" to enter plan mode first.':
    'Não está no modo de planejamento. Use "/plan" para entrar primeiro no modo de planejamento.',
  "Set up O1-Code's status line UI":
    'Configurar a interface da barra de status do O1-Code',

  // === Core ===
  'Open the memory manager.': 'Abrir o gerenciador de memória.',
  'Save a durable memory to the memory system.':
    'Salvar uma memória durável no sistema de memória.',
  prompts: 'Prompts (sugestões)',
  'Open MCP management dialog': 'Abrir diálogo de gerenciamento MCP',
  'Manage extension settings': 'Gerenciar configurações da extensão',
  'Manage Extensions': 'Gerenciar extensões',
  'Extension Details': 'Detalhes da extensão',
  'View Extension': 'Ver extensão',
  'Update Extension': 'Atualizar extensão',
  'Disable Extension': 'Desativar extensão',
  'Enable Extension': 'Ativar extensão',
  'Uninstall Extension': 'Desinstalar extensão',
  'Select Scope': 'Selecionar escopo',
  'User Scope': 'Escopo do usuário',
  'Workspace Scope': 'Escopo do workspace',
  'No extensions found.': 'Nenhuma extensão encontrada.',
  'Are you sure you want to uninstall extension "{{name}}"?':
    'Tem certeza de que deseja desinstalar a extensão "{{name}}"?',
  'This action cannot be undone.': 'Esta ação não pode ser desfeita.',
  'Extension "{{name}}" updated successfully.':
    'Extensão "{{name}}" atualizada com sucesso.',
  'Name:': 'Nome:',
  'MCP Servers:': 'MCP Servers:',
  'Settings:': 'Configurações:',
  'View Details': 'Ver detalhes',
  'Update failed:': 'Falha na atualização:',
  'Updating {{name}}...': 'Atualizando {{name}}...',
  'Update complete!': 'Atualização concluída!',
  'User (global)': 'Usuário (global)',
  'Workspace (project-specific)': 'Workspace (específico do projeto)',
  'Disable "{{name}}" - Select Scope':
    'Desativar "{{name}}" - selecionar escopo',
  'Enable "{{name}}" - Select Scope': 'Ativar "{{name}}" - selecionar escopo',
  'No extension selected': 'Nenhuma extensão selecionada',
  '{{count}} extensions installed': '{{count}} extensões instaladas',
  'up to date': 'atualizada',
  'update available': 'atualização disponível',
  'checking...': 'verificando...',
  'not updatable': 'não atualizável',
  'Ask a quick side question without affecting the main conversation':
    'Fazer uma pergunta rápida paralela sem afetar a conversa principal',
  'Get a second opinion on the current conversation from a reviewer model':
    'Obter uma segunda opinião sobre a conversa atual de um modelo revisor',
  'Consulting advisor...': 'Consultando o assessor...',
  'Advisor review failed: {{error}}': 'Falha na revisão do assessor: {{error}}',
  'No conversation context available for /advisor':
    'Nenhum contexto de conversa disponível para /advisor',
  'Focus too long (max {{max}} chars)':
    'Foco muito longo (máx. {{max}} caracteres)',
  'Another operation is in progress, wait for it to complete before running /advisor':
    'Outra operação está em andamento, aguarde a conclusão antes de executar /advisor',
  'No response received.': 'Nenhuma resposta recebida.',
  'No model configured.': 'Nenhum modelo configurado.',
  'Manage Arena sessions': 'Gerenciar sessões da Arena',
  'Start an Arena session with multiple models competing on the same task':
    'Iniciar uma sessão da Arena com vários modelos competindo na mesma tarefa',
  'Stop the current Arena session': 'Parar a sessão atual da Arena',
  'Show the current Arena session status':
    'Mostrar o status da sessão atual da Arena',
  'Select a model result and merge its diff into the current workspace':
    'Selecionar o resultado de um modelo e mesclar seu diff ao workspace atual',
  'No running Arena session found.':
    'Nenhuma sessão Arena em execução encontrada.',
  'No Arena session found. Start one with /arena start.':
    'Nenhuma sessão Arena encontrada. Inicie uma com /arena start.',
  'Arena session is still running. Wait for it to complete or use /arena stop first.':
    'A sessão Arena ainda está em execução. Aguarde a conclusão ou use /arena stop primeiro.',
  'No successful agent results to select from. All agents failed or were cancelled.':
    'Nenhum resultado de agente bem-sucedido para selecionar. Todos os agentes falharam ou foram cancelados.',
  'Use /arena stop to end the session.':
    'Use /arena stop para encerrar a sessão.',
  'No idle agent found matching "{{name}}".':
    'Nenhum agente ocioso encontrado correspondendo a "{{name}}".',
  'Failed to apply changes from {{label}}: {{error}}':
    'Falha ao aplicar alterações de {{label}}: {{error}}',
  'Applied changes from {{label}} to workspace. Arena session complete.':
    'Alterações de {{label}} aplicadas ao workspace. Sessão Arena concluída.',
  'Discard all Arena results and clean up worktrees?':
    'Descartar todos os resultados da Arena e limpar as árvores de trabalho?',
  'Arena results discarded. All worktrees cleaned up.':
    'Resultados da Arena descartados. Todas as árvores de trabalho foram limpas.',
  'Arena is not supported in non-interactive mode. Use interactive mode to start an Arena session.':
    'Arena não é suportado no modo não interativo. Use o modo interativo para iniciar uma sessão Arena.',
  'Arena is not supported in non-interactive mode. Use interactive mode to stop an Arena session.':
    'Arena não é suportado no modo não interativo. Use o modo interativo para parar uma sessão Arena.',
  'Arena is not supported in non-interactive mode.':
    'Arena não é suportado no modo não interativo.',
  'An Arena session exists. Use /arena stop or /arena select to end it before starting a new one.':
    'Já existe uma sessão Arena. Use /arena stop ou /arena select para encerrá-la antes de iniciar uma nova.',
  'Usage: /arena start --models model1,model2 <task>':
    'Uso: /arena start --models model1,model2 <tarefa>',
  'Models to compete (required, at least 2)':
    'Modelos para competir (obrigatório, pelo menos 2)',
  'Format: authType:modelId or just modelId':
    'Formato: authType:modelId ou apenas modelId',
  'Arena requires at least 2 models. Use --models model1,model2 to specify.':
    'Arena requer pelo menos 2 modelos. Use --models model1,model2 para especificar.',
  'Arena started with {{count}} agents on task: "{{task}}"\nModels:\n{{modelList}}':
    'Arena iniciada com {{count}} agentes na tarefa: "{{task}}"\nModelos:\n{{modelList}}',
  'Arena panes are running in tmux. Attach with: `{{command}}`':
    'Os painéis Arena estão em execução no tmux. Anexar com: `{{command}}`',
  '[{{label}}] failed: {{error}}': '[{{label}}] falhou: {{error}}',
  'Loading suggestions...': 'Carregando sugestões...',
  'Show context window usage breakdown. Use "/context detail" for per-item breakdown.':
    'Mostrar o detalhamento do uso da janela de contexto. Use "/context detail" para ver o detalhamento por item.',
  'Show per-item context usage breakdown.':
    'Mostrar o detalhamento do uso de contexto por item.',

  // === Missing key backfill ===
  '↑ to manage attachments': '↑ para gerenciar anexos',
  '← → select, Delete to remove, ↓ to exit':
    '← → selecionar, Delete para remover, ↓ para sair',
  'Attachments: ': 'Anexos: ',
  'screenshot {{time}}': 'captura {{time}}',
  '(tab to cycle)': '(Tab para alternar)',
  'Updating...': 'Atualizando...',
  Unknown: 'Desconhecido',
  Error: 'Erro',
  'Version:': 'Versão:',
  "Use '/extensions install' to install your first extension.":
    "Use '/extensions install' para instalar sua primeira extensão.",
  'The name of the extension to update.':
    'O nome da extensão a ser atualizada.',
  'Path:': 'Caminho:',
  'Type:': 'Tipo:',
  'Release tag:': 'Tag de lançamento:',
  'Enabled (User):': 'Ativado (usuário):',
  'Enabled (Workspace):': 'Ativado (workspace):',
  'Context files:': 'Arquivos de contexto:',
  'Skills:': 'Habilidades:',
  'Agents:': 'Agentes:',
  'Workflows:': 'Fluxos de trabalho:',
  'MCP servers:': 'MCP servers:',
  'Press c to copy the authorization URL to your clipboard.':
    'Pressione c para copiar a URL de autorização para a área de transferência.',
  'Copy request sent to your terminal. If paste is empty, copy the URL above manually.':
    'Solicitação de cópia enviada ao terminal. Se a colagem estiver vazia, copie manualmente a URL acima.',
  'Cannot write to terminal — copy the URL above manually.':
    'Não foi possível escrever no terminal — copie manualmente a URL acima.',
  'You can switch permission mode quickly with Tab or /approval-mode.':
    'Você pode alternar rapidamente o modo de permissão com Tab ou /approval-mode.',
  'Retrying in {{seconds}} seconds… (attempt {{attempt}}/{{maxRetries}})':
    'Tentando novamente em {{seconds}} segundos… (tentativa {{attempt}}/{{maxRetries}})',
  'Press Ctrl+Y to retry': 'Pressione Ctrl+Y para tentar novamente',
  'No failed request to retry.': 'Nenhuma solicitação com falha para repetir.',
  'to retry last request': 'para repetir a última solicitação',
  'Invalid API key. Coding Plan API keys start with "sk-sp-". Please check.':
    'API Key inválida. As API Keys do Coding Plan começam com "sk-sp-". Verifique.',
  'Lock release warning': 'Aviso de liberação de bloqueio',
  'Metadata write warning': 'Aviso de gravação de metadados',
  "Subsequent dreams may be skipped as locked until the next session's staleness sweep cleans the file.":
    'Dreams posteriores podem ser ignorados como bloqueados até que a próxima varredura de sessões obsoletas limpe o arquivo.',
  "The scheduler gate did not see this dream's timestamp; the next dream cycle may re-fire sooner than usual.":
    'O gate do agendador não viu o timestamp deste dream; o próximo ciclo de dream pode disparar novamente antes do normal.',
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
    'Histórico recolhido: {{n}} mensagens ocultas. Use /history expand-now para mostrar.',

  // === Same-as-English optimization ===
  '(workspace)': '(espaço de trabalho)',
  'Ref:': 'Referência:',
  Runtime: 'Tempo de execução',
  Status: 'Estado',
  'Status:': 'Estado:',
  Use: 'Uso',
  '中国 (China)': 'China',
  '中国 (China) - 阿里云百炼': 'China - 阿里云百炼',

  // Stats Dashboard — Category 2
  'Activity Heatmap': 'Mapa de Atividade',
  Less: 'Menos',
  More: 'Mais',
  Sessions: 'Sessões',
  Duration: 'Duração',
  Projects: 'Projetos',
  'Loading stats...': 'Carregando estatísticas...',
  '(no data)': '(sem dados)',
  d: 'd',
  h: 'h',
  m: 'm',
  Input: 'Entrada',
  Models: 'Modelos',
  'All time': 'Todo o período',
  'Last 7 days': 'Últimos 7 dias',
  'Last 30 days': 'Últimos 30 dias',
  'Show usage statistics dashboard.': 'Exibir painel de estatísticas de uso.',

  // Stats Dashboard — keyboard hints (not translated)
  'tab \xB7 esc': 'tab \xB7 esc',
  'tab \xB7 r dates \xB7 \u2190\u2192 month \xB7 esc':
    'tab \xB7 r dates \xB7 \u2190\u2192 month \xB7 esc',
  'tab \xB7 r dates \xB7 esc': 'tab \xB7 r dates \xB7 esc',

  // Stats Dashboard — missing labels
  'API Requests': 'Requisições API',
  'Tool Calls': 'Chamadas de Ferramenta',
  'Success rate': 'Taxa de sucesso',
  'Code Changes': 'Alterações de Código',
  Tool: 'Ferramenta',
  reqs: 'reqs',
  in: 'ent.',
  out: 'saída',
  'In/Out': 'Ent/Saída',
  // Update command
  'Check for O1-Code updates and install if available':
    'Verificar atualizações do O1-Code e instalar se disponível',
  'O1-Code update available! {{current}} → {{latest}}':
    'Atualização do O1-Code disponível! {{current}} → {{latest}}',
  'A new version of O1-Code is available! {{current}} → {{latest}}':
    'Uma nova versão do O1-Code está disponível! {{current}} → {{latest}}',
  'O1-Code {{version}} is up to date!': 'O1-Code {{version}} está atualizado!',
  'Failed to check for updates ({{reason}}). Please check your network or registry configuration.':
    'Falha ao verificar atualizações ({{reason}}). Verifique sua rede ou configuração do registro.',
  'Update check skipped ({{reason}}) — run /update to retry.':
    'Verificação de atualização ignorada ({{reason}}) — execute /update para tentar novamente.',
  'registry did not respond within {{seconds}}s':
    'o registro não respondeu em {{seconds}}s',
  'registry unreachable': 'registro inacessível',
  'package not published on the registry': 'pacote não publicado no registro',
  'registry error': 'erro no registro',
  'Unable to check for updates: {{reason}}':
    'Não foi possível verificar atualizações: {{reason}}',
  'Update successful! The new version will be used on your next run.':
    'Atualização bem-sucedida! A nova versão será usada na próxima execução.',
  'Update downloaded. It will be applied after you exit this session.':
    'Atualização baixada. Será aplicada após você sair desta sessão.',
  'Update failed: {{error}}': 'Falha na atualização: {{error}}',
  'Downloading update...': 'Baixando atualização...',
  'Update successful! Please restart O1-Code to use the new version. Switching model providers before restarting may not work correctly.':
    'Atualização bem-sucedida! Reinicie o O1-Code para usar a nova versão. Alternar provedores de modelo antes de reiniciar pode não funcionar corretamente.',
  'Automatic update failed. Please try updating manually.':
    'Falha na atualização automática. Tente atualizar manualmente.',
  'Automatic update failed: {{error}}. Re-run the installer to update manually.':
    'Falha na atualização automática: {{error}}. Execute novamente o instalador para atualizar manualmente.',
  'Running from a local git clone. Please update with "git pull".':
    'Executando a partir de um clone Git local. Atualize com "git pull".',
  'Running via npx, update not applicable.':
    'Executando via npx, atualização não aplicável.',
  'Running via pnpx, update not applicable.':
    'Executando via pnpx, atualização não aplicável.',
  'Running via bunx, update not applicable.':
    'Executando via bunx, atualização não aplicável.',
  'Installed via Homebrew. Please update with "brew upgrade".':
    'Instalado via Homebrew. Atualize com "brew upgrade".',
  "Locally installed. Please update via your project's package.json.":
    'Instalado localmente. Atualize via package.json do seu projeto.',
  'Update requires sudo. Please run:': 'A atualização requer sudo. Execute:',
  'Standalone install detected. Attempting to automatically update now...':
    'Instalação standalone detectada. Tentando atualizar automaticamente agora...',
  'Standalone install detected. Please rerun the standalone installer to update:':
    'Instalação standalone detectada. Execute novamente o instalador standalone para atualizar:',
  'Run the following to update:': 'Execute o seguinte para atualizar:',
  'Unable to auto-update this standalone installation. Please reinstall from:':
    'Não foi possível atualizar automaticamente esta instalação independente. Reinstale de:',
  'Manual update required. Please reinstall O1-Code.':
    'Atualização manual necessária. Reinstale o O1-Code.',
  'This session uses the custom sandbox image {{image}}. Update that image and restart O1-Code.':
    'Esta sessão usa a imagem de sandbox personalizada {{image}}. Atualize a imagem e reinicie o O1-Code.',
  'Update O1-Code on the host, then restart the sandbox.':
    'Atualize o O1-Code no host e reinicie o sandbox.',
  'The update will be installed after you exit this session.':
    'A atualização será instalada após você sair desta sessão.',
  'Run /update to install the update on the host.':
    'Execute /update para instalar a atualização no host.',
  'Run /update to install the update.':
    'Execute /update para instalar a atualização.',

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
    'A gravação da sessão foi interrompida após uma falha de escrita. As novas mensagens da sessão afetada não serão salvas. Verifique o espaço em disco e as permissões e inicie uma nova sessão para retomar a gravação. Consulte o log de depuração para obter detalhes.',
  'Session recording stopped after a write failure. New messages for the affected session will not be saved. Check disk space and permissions, then run `/clear` to start a new recorded session. See the debug log for details.':
    'A gravação da sessão foi interrompida após uma falha de escrita. As novas mensagens da sessão afetada não serão salvas. Verifique o espaço em disco e as permissões e execute `/clear` para iniciar uma nova sessão gravada. Consulte o log de depuração para obter detalhes.',

  // ==========================================================================
  // Auto-skill curator (/curator command)
  // ==========================================================================
  'Maintain project auto-skills based on recent use.':
    'Gerenciar as habilidades automáticas do projeto com base no uso recente.',
  'Show project auto-skill lifecycle status.':
    'Mostrar o status do ciclo de vida das habilidades automáticas do projeto.',
  'Run project auto-skill lifecycle maintenance.':
    'Executar a manutenção do ciclo de vida das habilidades automáticas do projeto.',
  'Restore an archived project auto-skill.':
    'Restaurar uma habilidade automática arquivada do projeto.',
  'Auto-skill curator': 'Gerenciador de habilidades automáticas',
  'Last run: {{time}}': 'Última execução: {{time}}',
  'Active: {{count}}': 'Ativas: {{count}}',
  'Stale: {{count}}': 'Inativas: {{count}}',
  'Archived: {{count}}': 'Arquivadas: {{count}}',
  'Stale skills:': 'Habilidades inativas:',
  'Pinned skills:': 'Habilidades fixadas:',
  'Archived skills:': 'Habilidades arquivadas:',
  'Dry run complete.': 'Simulação concluída.',
  'Curator run complete.': 'Execução do gerenciador concluída.',
  'Checked: {{count}}': 'Verificadas: {{count}}',
  'First observed: {{count}}': 'Observadas pela primeira vez: {{count}}',
  'Marked stale: {{count}}': 'Marcadas como inativas: {{count}}',
  'Reactivated: {{count}}': 'Reativadas: {{count}}',
  'Skipped archive collisions: {{count}}':
    'Colisões de arquivamento ignoradas: {{count}}',
  'Archive candidates:': 'Candidatas ao arquivamento:',
  'Skipped archive collisions:': 'Colisões de arquivamento ignoradas:',
  'Skipped rename errors: {{count}}':
    'Erros de renomeação ignorados: {{count}}',
  'Skipped rename errors:': 'Erros de renomeação ignorados:',
  '{{verb}}: {{count}}': '{{verb}}: {{count}}',
  'Would archive': 'Seriam arquivadas',
  Archived: 'Arquivadas',
  'Failed to read auto-skill curator status: {{message}}':
    'Falha ao ler o status do gerenciador de habilidades automáticas: {{message}}',
  'Usage: /curator run [--dry-run]': 'Uso: /curator run [--dry-run]',
  'Failed to run auto-skill curator: {{message}}':
    'Falha ao executar o gerenciador de habilidades automáticas: {{message}}',
  'Usage: /curator restore <directory>': 'Uso: /curator restore <diretório>',
  'Restored auto-skill: {{name}}': 'Habilidade automática restaurada: {{name}}',
  'Failed to restore auto-skill: {{message}}':
    'Falha ao restaurar a habilidade automática: {{message}}',
  'Exclude an auto-skill from automatic maintenance.':
    'Excluir uma habilidade automática da manutenção automática.',
  'Return a pinned auto-skill to automatic maintenance.':
    'Retornar uma habilidade automática fixada à manutenção automática.',
  'Usage: /curator pin <directory>': 'Uso: /curator pin <diretório>',
  'Usage: /curator unpin <directory>': 'Uso: /curator unpin <diretório>',
  'Pinned auto-skill: {{name}}': 'Habilidade automática fixada: {{name}}',
  'Unpinned auto-skill: {{name}}': 'Habilidade automática desafixada: {{name}}',
  'Failed to update auto-skill pin: {{message}}':
    'Falha ao atualizar a fixação da habilidade automática: {{message}}',
  'Auto-skill curator changes are disabled in safe mode.':
    'As alterações do gerenciador de habilidades automáticas estão desativadas no modo seguro.',
  'Auto-skill curator changes are only available in trusted workspaces. Trust this folder via `/trust` and try again.':
    'As alterações do gerenciador de habilidades automáticas estão disponíveis apenas em espaços de trabalho confiáveis. Marque esta pasta como confiável usando `/trust` e tente novamente.',
  'Kept model as {{model}}': 'Modelo mantido como {{model}}',
  'Cannot disable an extension-provided MCP server here.':
    'Não é possível desativar aqui um servidor MCP fornecido por uma extensão.',
  'Cleared authentication for "{{name}}".':
    'Autenticação de "{{name}}" removida.',
  'MCP "{{name}}" disabled for all projects.':
    'MCP "{{name}}" desativado para todos os projetos.',
  'Enable extension "{{name}}" to manage this MCP server.':
    'Habilite a extensão "{{name}}" para gerenciar este servidor MCP.',
  'Extension-provided MCP servers cannot be favorited.':
    'Servidores MCP fornecidos por extensões não podem ser adicionados aos favoritos.',
  'User level': 'Nível de usuário',
  'Project level': 'Nível de projeto',
  'Clipboard image paste is unavailable because the native clipboard module could not be loaded. Reinstall O1-Code or use the npm installation method.':
    'Colar imagem da área de transferência não está disponível porque o módulo nativo de área de transferência não pôde ser carregado. Reinstale o O1-Code ou use o método de instalação via npm.',
  ' · {{marketplace}} (Tab to clear)': ' · {{marketplace}} (Tab para limpar)',
  '"{{name}}" {{state}}.': '"{{name}}" {{state}}.',
  '(Tab / ←→ to switch)': '(Tab / ←→ para alternar)',
  '+ Add new marketplace': '+ Adicionar novo marketplace',
  '+ Install a new extension': '+ Instalar uma nova extensão',
  Actions: 'Ações',
  'Add Marketplace': 'Adicionar Marketplace',
  'Add a marketplace in the Sources tab to discover extensions.':
    'Adicione um marketplace na aba Fontes para descobrir extensões.',
  'Add new': 'Adicionar novo',
  'Add to Favorites': 'Adicionar aos Favoritos',
  'Added "{{name}}" to favorites.': '"{{name}}" adicionado aos favoritos.',
  'Added marketplace "{{name}}".': 'Marketplace "{{name}}" adicionado.',
  'Adding...': 'Adicionando...',
  'Back to extension list': 'Voltar para a lista de extensões',
  'Browse extensions ({{count}})': 'Explorar extensões ({{count}})',
  'By: {{a}}': 'Por: {{a}}',
  'Change scope': 'Alterar escopo',
  'Change scope for "{{name}}":': 'Alterar escopo de "{{name}}":',
  'Changing scope...': 'Alterando escopo...',
  'Uninstalling "{{name}}"...': 'Desinstalando "{{name}}"...',
  'Update available for "{{name}}".': 'Atualização disponível para "{{name}}".',
  '"{{name}}" is already up to date.': '"{{name}}" já está atualizado.',
  'Checking "{{name}}" for updates...':
    'Verificando atualizações de "{{name}}"...',
  '"{{name}}" does not support update checks.':
    '"{{name}}" não oferece suporte à verificação de atualizações.',
  '"{{name}}" cannot be update-checked (marketplace plugins update by reinstalling).':
    'Não é possível verificar atualizações de "{{name}}" (plugins de marketplace são atualizados por reinstalação).',
  'Failed to check "{{name}}" for updates.':
    'Falha ao verificar atualizações de "{{name}}".',
  'Claude plugin marketplace': 'Marketplace de plugins da Claude',
  Commands: 'Comandos',
  'Components:': 'Componentes:',
  'Could not load this marketplace.':
    'Não foi possível carregar este marketplace.',
  'Current: {{scope}}': 'Atual: {{scope}}',
  Disabled: 'Desativado',
  Discover: 'Descobrir',
  'Disabling "{{name}}"...': 'Desativando "{{name}}"...',
  'Disabling MCP "{{name}}"...': 'Desativando MCP "{{name}}"...',
  'Discover extensions': 'Descobrir extensões',
  'Discovering extensions...': 'Descobrindo extensões...',
  'Enabling "{{name}}"...': 'Habilitando "{{name}}"...',
  'Enabling MCP "{{name}}"...': 'Habilitando MCP "{{name}}"...',
  'Enter extension source:': 'Informe a origem da extensão:',
  'Enter marketplace source (Claude format):':
    'Informe a origem do marketplace (formato Claude):',
  'Examples:': 'Exemplos:',
  'Extension details': 'Detalhes da extensão',
  'Extension v{{version}}': 'Extensão v{{version}}',
  'Extensions are not available in this environment.':
    'Extensões não estão disponíveis neste ambiente.',
  'Failed to open {{url}}': 'Falha ao abrir {{url}}',
  Favorites: 'Favoritos',
  'Global (User Scope)': 'Global (Escopo de Usuário)',
  'Install Extension': 'Instalar Extensão',
  'Install for the current workspace (project scope)':
    'Instalar para o workspace atual (escopo de projeto)',
  'Install for you (user scope)': 'Instalar para você (escopo de usuário)',
  'Install {{count}} extension(s) to which scope?':
    'Instalar {{count}} extensão(ões) em qual escopo?',
  Installed: 'Instalados',
  'Installed extension "{{name}}".': 'Extensão "{{name}}" instalada.',
  'Installed extensions ({{count}}):': 'Extensões instaladas ({{count}}):',
  'Installed {{count}} extension(s).': '{{count}} extensão(ões) instalada(s).',
  '{{name}}: installed, but the scope rollback failed — it may be disabled at all scopes; re-enable it from the Installed tab.':
    '{{name}}: instalada, mas a reversão de escopo falhou — ela pode estar desativada em todos os escopos; reative-a na aba Instalados.',
  'Could not change scope, and the rollback also failed — "{{name}}" may be disabled at all scopes. Re-enable it from the Installed tab. ({{error}})':
    'Não foi possível alterar o escopo, e a reversão também falhou — "{{name}}" pode estar desativada em todos os escopos. Reative-a na aba Instalados. ({{error}})',
  'Installed {{ok}}, failed {{fail}}: {{detail}}':
    '{{ok}} instalada(s), {{fail}} com falha: {{detail}}',
  'Installing...': 'Instalando...',
  'Last updated: {{date}}': 'Última atualização: {{date}}',
  MCP: 'MCP',
  'MCP "{{name}}" {{state}}.': 'MCP "{{name}}" {{state}}.',
  'MCP servers': 'MCP servers',
  'Mark for Update': 'Marcar para atualização',
  Marketplaces: 'Marketplaces',
  'No extensions discovered.': 'Nenhuma extensão descoberta.',
  'No extensions match your search.':
    'Nenhuma extensão corresponde à sua busca.',
  'No extensions or marketplaces added yet.':
    'Nenhuma extensão ou marketplace adicionado ainda.',
  'No homepage available.': 'Nenhuma página inicial disponível.',
  'No installable extensions selected.':
    'Nenhuma extensão instalável selecionada.',
  'No plugins or MCP servers installed.':
    'Nenhum plugin ou servidor MCP instalado.',
  None: 'Nenhum',
  'Note: Uninstall permanently removes this extension.':
    'Nota: desinstalar remove esta extensão permanentemente.',
  'Open homepage': 'Abrir página inicial',
  'Project (Workspace)': 'Projeto (Workspace)',
  'Refreshed {{count}} extension(s).': '{{count}} extensão(ões) atualizada(s).',
  'Remove from Favorites': 'Remover dos Favoritos',
  'Remove marketplace': 'Remover marketplace',
  'Remove marketplace "{{name}}"?': 'Remover o marketplace "{{name}}"?',
  'Removed "{{name}}" from favorites.': '"{{name}}" removido dos favoritos.',
  'Removed marketplace "{{name}}".': 'Marketplace "{{name}}" removido.',
  'Scope:': 'Escopo:',
  'Set "{{name}}" scope to {{scope}}.':
    'Escopo de "{{name}}" definido como {{scope}}.',
  Sources: 'Fontes',
  'Type to search · Space to toggle · Enter to view · Ctrl+R refresh · Esc to go back':
    'Digite para pesquisar · Espaço para alternar · Enter para visualizar · Ctrl+R atualizar · Esc para voltar',
  Uninstall: 'Desinstalar',
  'Uninstalled "{{name}}".': '"{{name}}" desinstalada.',
  'Update Now': 'Atualizar Agora',
  'Update marketplace': 'Atualizar marketplace',
  'Update marketplace (last updated {{date}})':
    'Atualizar marketplace (última atualização {{date}})',
  'Could not update marketplace "{{name}}".':
    'Não foi possível atualizar o marketplace "{{name}}".',
  'Updated "{{name}}".': '"{{name}}" atualizado.',
  'Updated marketplace "{{name}}".': 'Marketplace "{{name}}" atualizado.',
  'Use the Discover tab to find and install plugins.':
    'Use a aba Descobrir para encontrar e instalar plugins.',
  'Version: {{v}}': 'Versão: {{v}}',
  'Will install:': 'Será instalado:',
  'Would open: {{url}}': 'Abriria: {{url}}',
  'Y/Enter to confirm · N/Esc to cancel':
    'Y/Enter para confirmar · N/Esc para cancelar',
  'Press R to retry · Esc to go back':
    'Pressione R para tentar novamente · Esc para voltar',
  'Enter to select · R refresh · Esc to go back':
    'Enter para selecionar · R atualizar · Esc para voltar',
  'from {{marketplace}}': 'de {{marketplace}}',
  installed: 'instalado',
  '{{count}} Agents': '{{count}} Agentes',
  '{{count}} Workflows': '{{count}} Fluxos de trabalho',
  '{{count}} Commands': '{{count}} Comandos',
  '{{count}} MCP': '{{count}} MCP',
  '{{count}} Skills': '{{count}} habilidades',
  '{{count}} available extensions': '{{count}} extensões disponíveis',
  '↑ more above': '↑ mais acima',
  '↑↓ navigate · Enter open · d remove marketplace · Esc close':
    '↑↓ navegar · Enter abrir · d remover marketplace · Esc fechar',
  '↑↓ navigate · Enter select · Esc close':
    '↑↓ navegar · Enter selecionar · Esc fechar',
  '↑↓ navigate · Enter select · d remove marketplace · Esc close':
    '↑↓ navegar · Enter selecionar · d remover marketplace · Esc fechar',
  '↑↓ navigate · Space enable/disable · f favorite · Enter details · Esc close':
    '↑↓ navegar · Espaço ativar/desativar · f favoritar · Enter detalhes · Esc fechar',
  '↓ more below': '↓ mais abaixo',
  '⚠ Make sure you trust an extension before installing, updating, or using it. We cannot verify what MCP servers, files, or other software an extension includes, or that it works as intended. See the extension homepage for more information.':
    '⚠ Certifique-se de confiar em uma extensão antes de instalá-la, atualizá-la ou usá-la. Não é possível verificar quais servidores MCP, arquivos ou outros softwares uma extensão inclui, nem que ela funcione como esperado. Veja a página inicial da extensão para mais informações.',
  'toolDisplayName.Exec': 'Executar código',
  'toolDisplayName.Edit': 'Editar',
  'toolDisplayName.WriteFile': 'Escrever arquivo',
  'toolDisplayName.ReadFile': 'Ler arquivo',
  'toolDisplayName.ZoomImage': 'Ampliar imagem',
  'toolDisplayName.Grep': 'Grep',
  'toolDisplayName.Glob': 'Glob',
  'toolDisplayName.Shell': 'Executar comando',
  'toolDisplayName.Shell Command': 'Comando do shell',
  'toolDisplayName.TodoList': 'Lista de tarefas',
  'toolDisplayName.Goal': 'Objetivo',
  'toolDisplayName.UpdateGoal': 'Atualizar objetivo',
  'toolDisplayName.ProposeGoal': 'Propor objetivo',
  'toolDisplayName.SaveMemory': 'Salvar na memória',
  'toolDisplayName.Agent': 'Agent',
  'toolDisplayName.Artifact': 'Artefato',
  'toolDisplayName.RecordArtifact': 'Registrar artefato',
  'toolDisplayName.RecordSource': 'Registrar fonte',
  'toolDisplayName.ReportFindings': 'Relatar descobertas',
  'toolDisplayName.DisplayImage': 'Exibir imagem',
  'toolDisplayName.Skill': 'Habilidade',
  'toolDisplayName.EnterPlanMode': 'Entrar no modo de planejamento',
  'toolDisplayName.ExitPlanMode': 'Sair do modo de planejamento',
  'toolDisplayName.WebFetch': 'Buscar na web',
  'toolDisplayName.WebSearch': 'Pesquisar na web',
  'toolDisplayName.ListFiles': 'Listar arquivos',
  'toolDisplayName.Lsp': 'LSP',
  'toolDisplayName.AskUserQuestion': 'Perguntar ao usuário',
  'toolDisplayName.CronCreate': 'Criar tarefa agendada',
  'toolDisplayName.CronList': 'Listar tarefas agendadas',
  'toolDisplayName.CronDelete': 'Excluir tarefa agendada',
  'toolDisplayName.LoopWakeup': 'Despertar loop',
  'toolDisplayName.CreateSubSession': 'Criar subsessão',
  'toolDisplayName.ListAgents': 'Listar agentes',
  'toolDisplayName.TaskCreate': 'Criar tarefa',
  'toolDisplayName.TaskUpdate': 'Atualizar tarefa',
  'toolDisplayName.TaskList': 'Listar tarefas',
  'toolDisplayName.TaskStop': 'Parar tarefa',
  'toolDisplayName.TeamCreate': 'Criar equipe',
  'toolDisplayName.TeamDelete': 'Excluir equipe',
  'toolDisplayName.TeamPlanApproval': 'Aprovação do plano da equipe',
  'toolDisplayName.SendMessage': 'Enviar mensagem',
  'toolDisplayName.RequestShutdown': 'Solicitar encerramento',
  'toolDisplayName.StructuredOutput': 'Saída estruturada',
  'toolDisplayName.Monitor': 'Monitor',
  'toolDisplayName.NotebookEdit': 'Editar notebook',
  'toolDisplayName.ToolSearch': 'Buscar ferramentas',
  'toolDisplayName.ToolCall': 'Chamar ferramenta',
  'toolDisplayName.EnterWorktree': 'Entrar na worktree',
  'toolDisplayName.ExitWorktree': 'Sair da worktree',
  'toolDisplayName.Workflow': 'Fluxo de trabalho',
  'toolDisplayName.ReadMcpResource': 'Ler recurso MCP',
  'toolDisplayName.ImageGen': 'Gerar imagem',
  'toolDisplayName.DownsampleImage': 'Reduzir resolução da imagem',
  'toolDisplayName.DownscaleVideo': 'Reduzir resolução do vídeo',
  'toolDisplayName.DownsampleAudio': 'Reduzir amostragem do áudio',
  'toolDisplayName.ExtractKeyframes': 'Extrair quadros-chave',
  'toolDisplayName.ExtractAudio': 'Extrair áudio',
  'toolDisplayName.ClipVideo': 'Cortar vídeo',
  'toolDisplayName.ClipImage': 'Recortar imagem',
  'toolDisplayName.ClipAudio': 'Cortar áudio',
  'toolDisplayName.CaptionImage': 'Descrever imagem',
  'toolDisplayName.CaptionAudio': 'Descrever áudio',
  'toolDisplayName.OcrImage': 'Reconhecer texto na imagem',
  'toolDisplayName.UnderstandVideoSegments': 'Entender segmentos de vídeo',
  'toolDisplayName.ConvertImage': 'Converter imagem',
  'toolDisplayName.TranscribeAudio': 'Transcrever áudio',
  'toolDisplayName.RecallMediaMemory': 'Recuperar memória de mídia',
  '[fixed-only: runs via media policies, not the model]':
    '[somente fixo: executa via políticas de mídia, não pelo modelo]',
  'show paths for current session files and logs':
    'Mostrar os caminhos dos arquivos e logs da sessão atual',
  'Move this session to a new working directory':
    'Mover esta sessão para um novo diretório de trabalho',
  'Fast context compression without AI. Strips old tool outputs and thinking parts.':
    'Compressão de contexto rápida, sem IA. Remove saídas antigas de ferramentas e trechos de raciocínio.',
  'Copy to clipboard: reply, code (by lang), LaTeX, or Mermaid. N = Nth-latest message, index = block number':
    'Copiar para a área de transferência: resposta, código (por linguagem), LaTeX ou Mermaid. N = enésima mensagem mais recente, index = número do bloco',
  'Show working-tree change stats versus HEAD':
    'Mostrar estatísticas de alterações da working tree em relação ao HEAD',
  'Could not determine current working directory.':
    'Não foi possível determinar o diretório de trabalho atual.',
  'Failed to compute git diff stats':
    'Falha ao calcular as estatísticas do diff do git',
  'No diff available. Either this is not a git repository, HEAD is missing, or a merge/rebase/cherry-pick/revert is in progress.':
    'Nenhum diff disponível. Isso pode significar que este não é um repositório git, que o HEAD está ausente, ou que há um merge/rebase/cherry-pick/revert em andamento.',
  'Clean working tree — no changes against HEAD.':
    'Working tree limpo — nenhuma alteração em relação ao HEAD.',
  '{{count}} file changed, +{{added}} / -{{removed}}':
    '{{count}} arquivo alterado, +{{added}} / -{{removed}}',
  '{{count}} files changed, +{{added}} / -{{removed}}':
    '{{count}} arquivos alterados, +{{added}} / -{{removed}}',
  '{{count}} file changed': '{{count}} arquivo alterado',
  '{{count}} files changed': '{{count}} arquivos alterados',
  '…and {{hidden}} more (showing first {{shown}})':
    '…e mais {{hidden}} (mostrando os primeiros {{shown}})',
  '(binary)': '(binário)',
  '(binary, new)': '(binário, novo)',
  '(new)': '(novo)',
  '(new, partial)': '(novo, parcial)',
  '(deleted)': '(excluído)',
  '(binary, deleted)': '(binário, excluído)',
  'Create a reusable skill from a knowledge source (file, URL, conversation, or text).':
    'Criar uma habilidade reutilizável a partir de uma fonte de conhecimento (arquivo, URL, conversa ou texto).',
  'The current model or provider does not support native video input for /learn. Switch to a video-capable model on an OpenAI-compatible provider and try again.':
    'O modelo ou provedor atual não é compatível com entrada nativa de vídeo para /learn. Troque para um modelo compatível com vídeo em um provedor compatível com OpenAI e tente novamente.',
  'YouTube page URLs cannot be sent as native video input. Download the video into your workspace and pass the local video file path to /learn.':
    'URLs de páginas do YouTube não podem ser enviadas como entrada de vídeo nativa. Baixe o vídeo para o workspace e informe o caminho do arquivo de vídeo local para /learn.',
  'The local video could not be attached for /learn.':
    'Não foi possível anexar o vídeo local para /learn.',
  'Code Mode Only (Experimental)': 'Somente Modo Código (Experimental)',
  'Show skill-specific usage statistics.':
    'Mostrar estatísticas de uso específicas de uma habilidade.',
  'The scope to install the extension in: "user" (global, default) or "project" (current workspace only).':
    'O escopo para instalar a extensão: "user" (global, padrão) ou "project" (somente o workspace atual).',
  'Extension "{{name}}" installed successfully and enabled for the current workspace.':
    'Extensão "{{name}}" instalada com sucesso e ativada para o workspace atual.',
  'Marketplace "{{name}}" not found.': 'Marketplace "{{name}}" não encontrado.',
  'No marketplace sources added yet.':
    'Nenhuma fonte de marketplace adicionada ainda.',
  'No marketplaces added yet.': 'Nenhum marketplace adicionado ainda.',
  'Adds a marketplace source (Claude format).':
    'Adiciona uma fonte de marketplace (formato Claude).',
  'The marketplace source to add: owner/repo (GitHub), a git or https URL, or a local path.':
    'A fonte do marketplace para adicionar: owner/repo (GitHub), uma URL git ou https, ou um caminho local.',
  'Removes a marketplace source.': 'Remove uma fonte de marketplace.',
  'The name of the marketplace to remove.':
    'O nome do marketplace para remover.',
  'Lists configured marketplace sources.':
    'Lista as fontes de marketplace configuradas.',
  'Re-fetches a marketplace source and its plugin listing.':
    'Busca novamente uma fonte de marketplace e sua lista de plugins.',
  'The name of the marketplace to update.':
    'O nome do marketplace para atualizar.',
  'Manage marketplace sources for discovering extensions.':
    'Gerenciar fontes de marketplace para descobrir extensões.',
  'You need at least one command before continuing.':
    'Você precisa de pelo menos um comando antes de continuar.',
  '--registry is only applicable for npm extensions.':
    '--registry só se aplica a extensões npm.',
  'Custom npm registry URL (only for npm extensions).':
    'URL personalizada do registro npm (somente para extensões npm).',
  '--ref is not applicable for npm extensions. Use @version suffix instead (e.g. @scope/package@1.2.0).':
    '--ref não se aplica a extensões npm. Use o sufixo @version (ex.: @scope/package@1.2.0).',
  'Installs an extension from a git repository URL, local path, scoped npm package (@scope/name), or claude marketplace (marketplace-url:plugin-name).':
    'Instala uma extensão a partir de uma URL de repositório git, caminho local, pacote npm com escopo (@scope/name), ou marketplace claude (marketplace-url:plugin-name).',
  Description: 'Descrição',
  'Delete Session': 'Excluir sessão',
  'List installed extensions': 'Listar extensões instaladas',
  'Safe mode is on, so no hooks run in this session.':
    'O modo seguro está ativado, então nenhum hook é executado nesta sessão.',
  'Bare mode is on, so no hooks run in this session.':
    'O modo mínimo está ativado, então nenhum hook é executado nesta sessão.',
  'All hooks are disabled by the disableAllHooks setting.':
    'Todos os hooks estão desativados pela configuração disableAllHooks.',
  'Timeout:': 'Tempo limite:',
  'Status message:': 'Mensagem de status:',
  'Condition:': 'Condição:',
  'Options:': 'Opções:',
  'Skill:': 'Habilidade:',
  'runs in background': 'executa em segundo plano',
  'runs once': 'executa uma vez',
  sequential: 'sequencial',
  'the background agent could not be started.':
    'não foi possível iniciar o agente em segundo plano.',
  'Import MCP servers from Claude configs':
    'Importar servidores MCP das configurações do Claude',
  'View resources': 'Ver recursos',
  resource: 'recurso',
  resources: 'recursos',
  'needs authentication': 'precisa de autenticação',
  'No resources available for this server.':
    'Nenhum recurso disponível para este servidor.',
  'Resources for {{serverName}}': 'Recursos de {{serverName}}',
  'No resource selected': 'Nenhum recurso selecionado',
  'Resource Detail': 'Detalhe do recurso',
  'URI:': 'URI:',
  'MIME Type:': 'Tipo MIME:',
  'Size:': 'Tamanho:',
  '{{count}} bytes': '{{count}} bytes',
  'Reference in chat': 'Referenciar no chat',
  'MCP server': 'Servidor MCP',
  'MCP resource server': 'Servidor de recursos MCP',
  'Switch the model for this session (--fast for suggestion model, --voice for voice transcription model, [model-id] to switch immediately).':
    'Trocar o modelo para esta sessão (--fast para o modelo de sugestão, --voice para o modelo de transcrição de voz, [model-id] para trocar imediatamente).',
  'Switch the model for this session (--fast for suggestion model, --voice for voice transcription model, --vision for the vision bridge model, --project to persist to project settings, --global to persist to user settings, [model-id] to switch immediately, or [model-id] [prompt] to run a one-off prompt on another model; the inline prompt is sent verbatim without @file expansion).':
    'Trocar o modelo para esta sessão (--fast para o modelo de sugestão, --voice para o modelo de transcrição de voz, --vision para o modelo de ponte de visão, --project para persistir nas configurações do projeto, --global para persistir nas configurações do usuário, [model-id] para trocar imediatamente, ou [model-id] [prompt] para executar um prompt avulso em outro modelo; o prompt embutido é enviado literalmente, sem expansão de @arquivo).',
  'Switch the model for this session (--fast for suggestion model, --voice for voice transcription model, --vision for the vision bridge model, --compaction for chat compression model, --image for the image generation model, --project to persist to project settings, --global to persist to user settings, [model-id] to switch immediately, or [model-id] [prompt] to run a one-off prompt on another model; the inline prompt is sent verbatim without @file expansion).':
    'Trocar o modelo para esta sessão (--fast para o modelo de sugestão, --voice para o modelo de transcrição de voz, --vision para o modelo de ponte de visão, --compaction para o modelo de compactação do chat, --image para o modelo de geração de imagens, --project para persistir nas configurações do projeto, --global para persistir nas configurações do usuário, [model-id] para trocar imediatamente, ou [model-id] [prompt] para executar um prompt avulso em outro modelo; o prompt embutido é enviado literalmente, sem expansão de @arquivo).',
  "Inline one-shot override isn't supported in this mode — run '/model {{model}}' first, then send your prompt.":
    "A substituição avulsa embutida não é compatível com este modo — execute '/model {{model}}' primeiro e depois envie seu prompt.",
  "Inline one-shot override can't switch providers. '{{model}}' belongs to a different provider — run '/model {{model}}' first, then send your prompt.":
    "A substituição avulsa embutida não pode trocar de provedor. '{{model}}' pertence a um provedor diferente — execute '/model {{model}}' primeiro e depois envie seu prompt.",
  "⚠ '{{model}}' is not a known image-capable model; the vision bridge may fail on images.":
    "⚠ '{{model}}' não é um modelo conhecido com capacidade de imagem; a ponte de visão pode falhar em imagens.",
  'Toggle voice dictation input': 'Alternar a entrada de ditado por voz',
  'Set the model for voice transcription':
    'Definir o modelo para transcrição de voz',
  'Set the image-capable model used to transcribe images for a text-only main model':
    'Definir o modelo com capacidade de imagem usado para transcrever imagens para um modelo principal somente texto',
  'Set the model used to generate images':
    'Definir o modelo usado para gerar imagens',
  'Set the model used for chat compression (auto-compaction)':
    'Definir o modelo usado para compactação do chat (auto-compactação)',
  'Persist the model selection to the project settings (workspace scope)':
    'Persistir a seleção do modelo nas configurações do projeto (escopo do workspace)',
  'Persist the model selection to the user settings (global scope)':
    'Persistir a seleção do modelo nas configurações do usuário (escopo global)',
  'Select Fast Model': 'Selecionar modelo rápido',
  'Select Vision Model': 'Selecionar modelo de visão',
  'Select Image Model': 'Selecionar modelo de imagem',
  'Select Compaction Model': 'Selecionar modelo de compactação',
  'Select Voice Model': 'Selecionar modelo de voz',
  'Vision Model': 'Modelo de visão',
  'Image Model': 'Modelo de imagem',
  'Compaction Model': 'Modelo de compactação',
  'Compaction model override cleared':
    'Substituição do modelo de compactação removida',
  'Current compaction model: {{compactionModel}}\nUse "/model --compaction <model-id>" to set compaction model, or "/model --compaction clear" to clear the override.':
    'Modelo de compactação atual: {{compactionModel}}\nUse "/model --compaction <model-id>" para definir o modelo de compactação, ou "/model --compaction clear" para remover a substituição.',
  'not set (falls back to the main model)':
    'não definido (usa o modelo principal como padrão)',
  'Configure models in settings.modelProviders and ensure the required environment variables are set. In interactive mode, run /auth to configure or switch providers, or run /model --compaction without a model to choose from configured models.':
    'Configure os modelos em settings.modelProviders e garanta que as variáveis de ambiente necessárias estejam definidas. No modo interativo, execute /auth para configurar ou trocar de provedor, ou execute /model --compaction sem um modelo para escolher entre os modelos configurados.',
  'Voice Model': 'Modelo de voz',
  'Selected compaction model is unavailable.':
    'O modelo de compactação selecionado está indisponível.',
  'Selected voice model is unavailable.':
    'O modelo de voz selecionado está indisponível.',
  'Selected image model is unavailable.':
    'O modelo de imagem selecionado está indisponível.',
  "Voice model '{{model}}' is configured more than once. Remove duplicate model ids before selecting it for voice transcription.":
    "O modelo de voz '{{model}}' está configurado mais de uma vez. Remova os IDs de modelo duplicados antes de selecioná-lo para transcrição de voz.",
  'Voice dictation: {{status}} (mode: {{mode}}, {{modelText}}).':
    'Ditado por voz: {{status}} (modo: {{mode}}, {{modelText}}).',
  'model: {{voiceModel}}': 'modelo: {{voiceModel}}',
  'no voice model selected': 'nenhum modelo de voz selecionado',
  'Voice dictation disabled.': 'Ditado por voz desativado.',
  'Usage: /voice [hold|tap|off|status]': 'Uso: /voice [hold|tap|off|status]',
  'No voice model selected. Run /model --voice to choose one before enabling voice dictation.':
    'Nenhum modelo de voz selecionado. Execute /model --voice para escolher um antes de ativar o ditado por voz.',
  'Voice dictation enabled (tap mode). Tap Space at an empty prompt to start, tap again or pause to stop and submit, using {{voiceModel}}.':
    'Ditado por voz ativado (modo tap). Toque em Espaço em um prompt vazio para iniciar, toque novamente ou pause para parar e enviar, usando {{voiceModel}}.',
  'Voice dictation enabled (hold mode). Hold Space at an empty prompt to dictate with {{voiceModel}}.':
    'Ditado por voz ativado (modo hold). Mantenha Espaço pressionado em um prompt vazio para ditar com {{voiceModel}}.',
  'No models are configured.': 'Nenhum modelo está configurado.',
  'Configured models: {{models}}.': 'Modelos configurados: {{models}}.',
  'Configure a unique model id in settings.modelProviders or run /model --voice to select an available model.':
    'Configure um ID de modelo exclusivo em settings.modelProviders ou execute /model --voice para selecionar um modelo disponível.',
  "Voice model '{{modelName}}' is not configured.":
    "O modelo de voz '{{modelName}}' não está configurado.",
  "Voice model '{{modelName}}' cannot be used for transcription.":
    "O modelo de voz '{{modelName}}' não pode ser usado para transcrição.",
  "Voice model '{{modelName}}' cannot be used for transcription. Configure an OpenAI-compatible model with baseUrl in settings.modelProviders.":
    "O modelo de voz '{{modelName}}' não pode ser usado para transcrição. Configure um modelo compatível com OpenAI com baseUrl em settings.modelProviders.",
  'Configure an OpenAI-compatible model with baseUrl in settings.modelProviders.':
    'Configure um modelo compatível com OpenAI com baseUrl em settings.modelProviders.',
  'Microphone access is denied. Enable it for your terminal in System Settings → Privacy & Security → Microphone, then restart voice dictation.':
    'O acesso ao microfone foi negado. Ative-o para o seu terminal em Configurações do Sistema → Privacidade e Segurança → Microfone, depois reinicie o ditado por voz.',
  'Voice dictation is not supported on {{platform}}.':
    'O ditado por voz não é compatível com {{platform}}.',
  'Voice dictation needs microphone access, which is unavailable in this WSL session. Use WSLg/PulseAudio, or run O1-Code on a host with a microphone.':
    'O ditado por voz precisa de acesso ao microfone, que não está disponível nesta sessão WSL. Use o WSLg/PulseAudio ou execute o O1-Code em um host com microfone.',
  'Voice dictation needs microphone access. macOS will ask the first time you record — approve it, then start again. Your first recording may be empty while the dialog is open.':
    'O ditado por voz precisa de acesso ao microfone. O macOS vai pedir permissão na primeira gravação — aprove e comece novamente. Sua primeira gravação pode ficar vazia enquanto a caixa de diálogo estiver aberta.',
  'Voice: recording': 'Voz: gravando',
  'Voice: transcribing': 'Voz: transcrevendo',
  'Voice: refining': 'Voz: refinando',
  'listening…': 'ouvindo…',
  'transcribing…': 'transcrevendo…',
  'refining…': 'refinando…',
  'For teams · Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models':
    'Para equipes · Pago · Até 6.000 requisições/5 h · Todos os modelos do Alibaba Cloud Coding Plan',
  'For individual developers · Pay per model call · 5-hour/weekly quotas':
    'Para desenvolvedores individuais · Pagamento por chamada de modelo · Cotas de 5 horas/semanais',
  Subscribe: 'Assinar',
  'Paid subscription plans from Alibaba Cloud ModelStudio':
    'Planos de assinatura pagos do Alibaba Cloud ModelStudio',
  'Select Subscription Plan': 'Selecionar plano de assinatura',
  'Alibaba Cloud Token Plan': 'Alibaba Cloud Token Plan',
  'Pay-as-you-go tokens · Configure ModelStudio standard API key':
    'Tokens pagos por uso · Configure a chave de API padrão do ModelStudio',
  'For individuals · Pay-as-you-go tokens · Dedicated Token Plan endpoint':
    'Para indivíduos · Tokens pagos por uso · Endpoint dedicado do Token Plan',
  'For teams/companies · Credits deducted by token usage · Dedicated API key and base URL':
    'Para equipes/empresas · Créditos deduzidos pelo uso de tokens · Chave de API e URL base dedicadas',
  'Token Plan documentation': 'Documentação do Token Plan',
  ' (this project)': ' (este projeto)',
  ' (global)': ' (global)',
  'Current voice model: {{voiceModel}}\nUse "/model --voice <model-id>" to set voice model.':
    'Modelo de voz atual: {{voiceModel}}\nUse "/model --voice <model-id>" para definir o modelo de voz.',
  'Current vision model: {{visionModel}}\nUse "/model --vision <model-id>" to set the vision bridge model.':
    'Modelo de visão atual: {{visionModel}}\nUse "/model --vision <model-id>" para definir o modelo de ponte de visão.',
  'Current image model: {{imageModel}}\nUse "/model --image <model-id>" to set the image generation model.':
    'Modelo de imagem atual: {{imageModel}}\nUse "/model --image <model-id>" para definir o modelo de geração de imagens.',
  "Voice model '{{modelName}}' is ambiguous. Configure a unique model id before using /model --voice.":
    "O modelo de voz '{{modelName}}' é ambíguo. Configure um ID de modelo exclusivo antes de usar /model --voice.",
  "Image model '{{modelName}}' matches multiple configured endpoints. Run /model --image without an argument and choose the exact endpoint.":
    "O modelo de imagem '{{modelName}}' corresponde a vários endpoints configurados. Execute /model --image sem argumento e escolha o endpoint exato.",
  "Image model '{{modelName}}' must declare a valid HTTPS baseUrl and credential environment variable.":
    "O modelo de imagem '{{modelName}}' precisa declarar um baseUrl HTTPS válido e uma variável de ambiente de credencial.",
  "'{{model}}' must declare a valid HTTPS baseUrl and credential environment variable.":
    "'{{model}}' precisa declarar um baseUrl HTTPS válido e uma variável de ambiente de credencial.",
  'Ctrl+Q to queue · ↑ to edit queued messages':
    'Ctrl+Q para colocar na fila · ↑ para editar mensagens na fila',
  'Enter to steer · Ctrl+Q to queue':
    'Enter para orientar · Ctrl+Q para colocar na fila',
  'Queue message for the next turn':
    'Colocar mensagem na fila do próximo turno',
  '{{count}} session': '{{count}} sessão',
  '{{count}} sessions': '{{count}} sessões',
  '{{count}} topic': '{{count}} tópico',
  '{{count}} topics': '{{count}} tópicos',
  '{{count}} tokens': '{{count}} tokens',
  '{{count}} tool call': '{{count}} chamada de ferramenta',
  '{{count}} tool calls': '{{count}} chamadas de ferramenta',
  '{{count}} event': '{{count}} evento',
  '{{count}} events': '{{count}} eventos',
  '{{count}} dropped': '{{count}} descartados',
  'pid {{pid}}': 'pid {{pid}}',
  'exit {{exitCode}}': 'exit {{exitCode}}',
  'Sessions reviewing': 'Sessões em revisão',
  Progress: 'Progresso',
  'Resume blocked': 'Retomada bloqueada',
  'Working dir': 'Diretório de trabalho',
  'Output file': 'Arquivo de saída',
  'Topics touched ({{count}})': 'Tópicos abordados ({{count}})',
  '{{count}} more': 'mais {{count}}',
  'to queue for the next turn': 'para colocar na fila do próximo turno',
  'You can get your Token Plan API key here':
    'Você pode obter sua chave de API do Token Plan aqui',
  'API key is stored in settings.env. You can migrate it to a .env file for better security.':
    'A chave de API está armazenada em settings.env. Você pode migrá-la para um arquivo .env para mais segurança.',
  'New model configurations are available for Alibaba Cloud Coding Plan. Update now?':
    'Novas configurações de modelo estão disponíveis para o Alibaba Cloud Coding Plan. Atualizar agora?',
  'Coding Plan configuration updated successfully. New models are now available.':
    'Configuração do Coding Plan atualizada com sucesso. Novos modelos já estão disponíveis.',
  'Coding Plan API key not found. Please re-authenticate with Coding Plan.':
    'Chave de API do Coding Plan não encontrada. Autentique-se novamente com o Coding Plan.',
  'Enter Token Plan API Key': 'Inserir chave de API do Token Plan',
  'Get or set any setting by dot-path key':
    'Obter ou definir qualquer configuração por chave de caminho com pontos',
  'Invalid boolean value: "{{value}}". Use "true" or "false".':
    'Valor booleano inválido: "{{value}}". Use "true" ou "false".',
  'Cannot toggle a number setting. Provide a value: key=<number>.':
    'Não é possível alternar uma configuração numérica. Informe um valor: key=<number>.',
  'Invalid number value: "{{value}}".': 'Valor numérico inválido: "{{value}}".',
  'Cannot toggle a string setting. Provide a value: key=<value>.':
    'Não é possível alternar uma configuração de texto. Informe um valor: key=<value>.',
  'Cannot toggle an enum setting. Provide one of: {{options}}.':
    'Não é possível alternar uma configuração enum. Informe um dos seguintes: {{options}}.',
  'Invalid enum value: "{{value}}". Valid values: {{options}}.':
    'Valor de enum inválido: "{{value}}". Valores válidos: {{options}}.',
  'Setting "{{type}}" type cannot be set via /config. Edit settings.json directly.':
    'Configurações do tipo "{{type}}" não podem ser definidas via /config. Edite settings.json diretamente.',
  'Unsupported setting type: "{{type}}".':
    'Tipo de configuração não suportado: "{{type}}".',
  'Available settings:': 'Configurações disponíveis:',
  'Unknown setting key: "{{key}}". Did you mean "{{suggestion}}"?':
    'Chave de configuração desconhecida: "{{key}}". Você quis dizer "{{suggestion}}"?',
  'Unknown setting key: "{{key}}".':
    'Chave de configuração desconhecida: "{{key}}".',
  'Failed to set "{{key}}": {{error}}': 'Falha ao definir "{{key}}": {{error}}',
  'Set {{key}} = {{value}}': 'Definido {{key}} = {{value}}',
  '(This setting requires a restart to take effect.)':
    '(Esta configuração requer reinicialização para ter efeito.)',
  '(Security-sensitive setting — verify you are not exposing credentials.)':
    '(Configuração sensível à segurança — verifique se você não está expondo credenciais.)',
  'Setting tools.approvalMode to "yolo" is blocked via /config for security reasons. Edit settings.json directly if you understand the risks.':
    'Definir tools.approvalMode como "yolo" é bloqueado via /config por motivos de segurança. Edite settings.json diretamente se você entender os riscos.',
  '(empty)': '(vazio)',
  'Choose the output style that shapes how responses are written ({{styles}}, or a custom style name).':
    'Escolha o estilo de saída que define como as respostas são escritas ({{styles}}, ou um nome de estilo personalizado).',
  'It is saved but does not apply while this workspace is untrusted.':
    'Isso é salvo, mas não é aplicado enquanto este workspace não for confiável.',
  'Set or control a session goal': 'Definir ou controlar uma meta de sessão',
  'Show current process memory diagnostics':
    'Mostrar diagnósticos de memória do processo atual',
  'Record a CPU profile for Chrome DevTools analysis':
    'Registrar um perfil de CPU para análise no Chrome DevTools',
  'Roll back a standalone update to the previous version':
    'Reverter uma atualização standalone para a versão anterior',
  'Rollback is not available in ACP mode.':
    'A reversão não está disponível no modo ACP.',
  'Rollback is only available for standalone installations.':
    'A reversão só está disponível para instalações standalone.',
  'Rollback successful. Restart your terminal to use the previous version.':
    'Reversão concluída com sucesso. Reinicie o terminal para usar a versão anterior.',
  'Rollback failed:': 'Falha na reversão:',
  'Rollback on Windows requires manual intervention. Rename o1-code.old to o1-code in your installation directory.':
    'A reversão no Windows exige intervenção manual. Renomeie o1-code.old para o1-code no seu diretório de instalação.',
  'No compression needed.': 'Nenhuma compactação necessária.',
  'Session duration: {{duration}}': 'Duração da sessão: {{duration}}',
  'Prompts: {{count}}': 'Prompts: {{count}}',
  'API requests: {{count}}': 'Requisições de API: {{count}}',
  'Tokens — prompt: {{prompt}}, output: {{output}}':
    'Tokens — entrada: {{prompt}}, saída: {{output}}',
  'Tool calls: {{total}} ({{success}} ok, {{fail}} fail)':
    'Chamadas de ferramenta: {{total}} ({{success}} ok, {{fail}} falha)',
  'Files: +{{added}} / -{{removed}} lines':
    'Arquivos: +{{added}} / -{{removed}} linhas',
  prompt: 'entrada',
  output: 'saída',
  cached: 'cache',
  'Estimated cost: ${{cost}}': 'Custo estimado: ${{cost}}',
  'No model usage data yet.': 'Ainda não há dados de uso de modelo.',
  'No tool usage data yet.': 'Ainda não há dados de uso de ferramentas.',
  'N/A': 'N/A',
  days: 'dias',
  'Tool calls': 'Chamadas de ferramenta',
  'Code changes': 'Alterações de código',
  Name: 'Nome',
  '↑ tabs · r to cycle dates · esc to close':
    '↑ abas · r para alternar datas · esc para fechar',
  Cost: 'Custo',
  Session: 'Sessão',
  'Failed to load stats. Press r to retry.':
    'Falha ao carregar estatísticas. Pressione r para tentar novamente.',
  '⚠️ History gap: earlier conversation was lost before this point (storage interruption) and could not be recovered.':
    '⚠️ Lacuna no histórico: a conversa anterior a este ponto foi perdida (interrupção de armazenamento) e não pôde ser recuperada.',
  'Precondition check': 'Verificação de pré-condição',
  'Precondition not met — this scheduled run was skipped.':
    'Pré-condição não atendida — esta execução agendada foi ignorada.',
  'The precondition check was cancelled — this scheduled run was skipped.':
    'A verificação de pré-condição foi cancelada — esta execução agendada foi ignorada.',
  'The precondition check was interrupted — this scheduled run was skipped.':
    'A verificação de pré-condição foi interrompida — esta execução agendada foi ignorada.',
  'The precondition check failed — this scheduled run was skipped.':
    'A verificação de pré-condição falhou — esta execução agendada foi ignorada.',
  'Running this scheduled task in a new session: {{link}}':
    'Executando esta tarefa agendada em uma nova sessão: {{link}}',
  'This scheduled run could not be started: {{error}}':
    'Não foi possível iniciar esta execução agendada: {{error}}',
  'Review messages held from other O1-Code sessions (accept | deny), and manage trusted controllers (controllers | revoke)':
    'Revisar mensagens retidas de outras sessões do O1-Code (accept | deny) e gerenciar controladores confiáveis (controllers | revoke)',
  'Cycle prompt history': 'Percorrer o histórico de prompts',
  'history {{position}}/{{total}}': 'histórico {{position}}/{{total}}',
  'Scroll when the input is empty': 'Rolar com o campo vazio',
};
