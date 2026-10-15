/**
 * TestRunner Pro - Execution Module
 * Complete execution manager: test runner configuration, test file tree selection,
 * WebSocket live streaming, terminal emulator, and execution summary.
 */

const Execution = {
    projects: [],
    currentProject: null,
    testFiles: [],
    selectedTests: new Set(),
    currentWs: null,
    currentExecution: null,
    autoScroll: true,
    appAutoScroll: true,
    timerInterval: null,
    elapsedSeconds: 0,

    // App Management State
    appState: null,
    appWs: null,
    appStatusPollInterval: null,
    activeTab: 'test',
    isAppActionLoading: false,

    /**
     * Load projects and initialize the execution view.
     * @param {object} params - Optional navigation parameters { projectId, executionId }
     */
    async load(params = {}) {
        const container = document.getElementById('page-execution');
        if (!container) return;

        try {
            this.projects = await App.apiCall('/api/projects');
        } catch (err) {
            console.error('[Execution] Failed to load projects:', err);
            this.projects = [];
        }

        this.render();

        // If specific projectId requested
        if (params.projectId) {
            const proj = this.projects.find(p => String(p.id) === String(params.projectId));
            if (proj) {
                await this.selectProject(proj.id);
            }
        } else if (this.projects.length > 0 && !this.currentProject) {
            await this.selectProject(this.projects[0].id);
        } else if (this.currentProject) {
            await this.selectProject(this.currentProject.id);
        }

        // Start background polling for app status
        this.startAppStatusPolling();

        // If specific executionId requested, load execution directly into output panel
        if (params.executionId) {
            this.loadExecution(params.executionId);
        }
    },

    /**
     * Render the two-panel execution screen.
     */
    render() {
        const container = document.getElementById('page-execution');
        if (!container) return;

        if (this.projects.length === 0) {
            container.innerHTML = `
                <div class="p-12 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <div class="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3 text-gray-500">
                        <i data-lucide="play-circle" class="w-6 h-6"></i>
                    </div>
                    <h3 class="text-base font-bold text-gray-200">Nenhum projeto disponível</h3>
                    <p class="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                        Para executar testes, você precisa cadastrar pelo menos um projeto de automação.
                    </p>
                    <button onclick="App.navigateTo('projects'); setTimeout(() => Projects.showAddForm(), 100);" 
                        class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 transition">
                        <i data-lucide="plus" class="w-4 h-4"></i> Cadastrar Primeiro Projeto
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                <!-- ========================================== -->
                <!-- LEFT PANEL: Execution Configuration (5 Cols)-->
                <!-- ========================================== -->
                <div class="lg:col-span-5 bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg space-y-4">
                    <div class="flex items-center justify-between pb-3 border-b border-gray-800">
                        <div class="flex items-center gap-2">
                            <i data-lucide="sliders" class="w-4 h-4 text-indigo-400"></i>
                            <h3 class="text-sm font-bold text-gray-100 uppercase tracking-wider">Parâmetros de Execução</h3>
                        </div>
                        <span id="runner-ready-badge" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Pronto
                        </span>
                    </div>

                    <form id="execution-form" onsubmit="event.preventDefault(); Execution.startExecution();" class="space-y-4">
                        
                        <!-- Project Selector -->
                        <div>
                            <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                Selecionar Projeto
                            </label>
                            <div class="relative">
                                <select id="exec-project-select" onchange="Execution.onProjectChanged(this.value)" 
                                    class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                                    ${this.projects.map(p => `
                                        <option value="${p.id}" ${this.currentProject && this.currentProject.id === p.id ? 'selected' : ''}>
                                            ${App.escapeHtml(p.name)} [${(p.test_type || '').toUpperCase()}]
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div id="exec-project-meta" class="mt-2 text-[11px] text-gray-400 flex items-center justify-between">
                                <!-- Populated on select -->
                            </div>
                        </div>

                        <!-- Execution Mode -->
                        <div>
                            <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                                Modo de Execução
                            </label>
                            <div class="grid grid-cols-3 gap-2">
                                <label class="mode-card relative flex flex-col items-center justify-center p-3 rounded-lg border border-gray-800 bg-gray-950/60 cursor-pointer hover:border-gray-700 transition">
                                    <input type="radio" name="exec-mode" value="full_suite" checked onchange="Execution.onModeChanged(this.value)" class="sr-only">
                                    <i data-lucide="layers" class="w-4 h-4 text-gray-400 mb-1.5 mode-icon"></i>
                                    <span class="text-xs font-semibold text-gray-200 mode-title">Suíte Completa</span>
                                    <span class="text-[10px] text-gray-500 mt-0.5">Todos os testes</span>
                                </label>

                                <label class="mode-card relative flex flex-col items-center justify-center p-3 rounded-lg border border-gray-800 bg-gray-950/60 cursor-pointer hover:border-gray-700 transition">
                                    <input type="radio" name="exec-mode" value="specific_tests" onchange="Execution.onModeChanged(this.value)" class="sr-only">
                                    <i data-lucide="check-square" class="w-4 h-4 text-gray-400 mb-1.5 mode-icon"></i>
                                    <span class="text-xs font-semibold text-gray-200 mode-title">Específicos</span>
                                    <span class="text-[10px] text-gray-500 mt-0.5">Selecionar arquivos</span>
                                </label>

                                <label class="mode-card relative flex flex-col items-center justify-center p-3 rounded-lg border border-gray-800 bg-gray-950/60 cursor-pointer hover:border-gray-700 transition">
                                    <input type="radio" name="exec-mode" value="by_tag" onchange="Execution.onModeChanged(this.value)" class="sr-only">
                                    <i data-lucide="tag" class="w-4 h-4 text-gray-400 mb-1.5 mode-icon"></i>
                                    <span class="text-xs font-semibold text-gray-200 mode-title">Por Tags</span>
                                    <span class="text-[10px] text-gray-500 mt-0.5">Filtro de tags</span>
                                </label>
                            </div>
                        </div>

                        <!-- Specific Tests File Tree (Hidden if full_suite or by_tag) -->
                        <div id="section-specific-tests" class="hidden">
                            <div class="flex items-center justify-between mb-1.5">
                                <label class="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>Arquivos de Teste</span>
                                    <span id="selected-tests-count" class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">0</span>
                                </label>
                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="Execution.selectAllTests(true)" class="text-[11px] text-indigo-400 hover:text-indigo-300">Todos</button>
                                    <span class="text-gray-700">•</span>
                                    <button type="button" onclick="Execution.selectAllTests(false)" class="text-[11px] text-gray-400 hover:text-gray-300">Nenhum</button>
                                </div>
                            </div>

                            <div id="tests-tree-container" class="bg-gray-950 border border-gray-800 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                                <div class="text-xs text-gray-500 text-center py-4">Carregando arquivos de teste...</div>
                            </div>
                        </div>

                        <!-- By Tag Input (Hidden unless mode === by_tag) -->
                        <div id="section-tags" class="hidden">
                            <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                Tags / Marcadores
                            </label>
                            <input type="text" id="exec-tags-input" placeholder="ex: smoke, regressao, not wip" 
                                class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition">
                            <p class="text-[11px] text-gray-500 mt-1">Filtro por tag/grep (ex: Playwright --grep, Cypress grep, Robot -i, Pytest -k/-m).</p>
                        </div>

                        <!-- Browser Selection -->
                        <div>
                            <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                Navegador
                            </label>
                            <div class="grid grid-cols-3 gap-2">
                                <label class="browser-choice flex items-center justify-center gap-2 p-2.5 rounded-lg border border-gray-800 bg-gray-950/60 cursor-pointer hover:border-gray-700 transition">
                                    <input type="radio" name="exec-browser" value="chromium" checked class="sr-only">
                                    <i data-lucide="chrome" class="w-4 h-4 text-indigo-400"></i>
                                    <span class="text-xs font-semibold text-gray-200">Chromium</span>
                                </label>

                                <label class="browser-choice flex items-center justify-center gap-2 p-2.5 rounded-lg border border-gray-800 bg-gray-950/60 cursor-pointer hover:border-gray-700 transition">
                                    <input type="radio" name="exec-browser" value="firefox" class="sr-only">
                                    <i data-lucide="globe" class="w-4 h-4 text-orange-400"></i>
                                    <span class="text-xs font-semibold text-gray-200">Firefox</span>
                                </label>

                                <label class="browser-choice flex items-center justify-center gap-2 p-2.5 rounded-lg border border-gray-800 bg-gray-950/60 cursor-pointer hover:border-gray-700 transition">
                                    <input type="radio" name="exec-browser" value="webkit" class="sr-only">
                                    <i data-lucide="compass" class="w-4 h-4 text-blue-400"></i>
                                    <span class="text-xs font-semibold text-gray-200">WebKit</span>
                                </label>
                            </div>
                        </div>

                        <!-- Execution Toggles: Headless & Debug -->
                        <div class="pt-2 border-t border-gray-800/80 space-y-3">
                            <div class="flex items-center justify-between">
                                <div>
                                    <span class="text-xs font-semibold text-gray-200 block">Modo Headless</span>
                                    <span class="text-[11px] text-gray-400">Executar em segundo plano sem janela visual</span>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="exec-headless-toggle" checked>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>

                            <div class="flex items-center justify-between">
                                <div>
                                    <span class="text-xs font-semibold text-gray-200 block">Modo Debug / Verbose</span>
                                    <span class="text-[11px] text-gray-400">Exibir logs completos de depuração e traces</span>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="exec-debug-toggle">
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <!-- Extra Environment Variables Accordion -->
                        <div class="pt-2 border-t border-gray-800/80">
                            <button type="button" onclick="Execution.toggleEnvSection()" 
                                class="w-full flex items-center justify-between text-xs font-semibold text-gray-400 hover:text-gray-200 transition py-1">
                                <span class="flex items-center gap-1.5">
                                    <i data-lucide="variable" class="w-3.5 h-3.5"></i>
                                    Variáveis de Ambiente Adicionais
                                </span>
                                <i id="exec-env-chevron" data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200"></i>
                            </button>

                            <div id="exec-env-section" class="hidden mt-3 space-y-2">
                                <div id="exec-env-rows" class="space-y-2">
                                    <!-- Dynamic rows -->
                                </div>
                                <button type="button" onclick="Execution.addEnvRow()" 
                                    class="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 pt-1">
                                    <i data-lucide="plus" class="w-3 h-3"></i> Adicionar Variável
                                </button>
                            </div>
                        </div>

                        <!-- App Control Card (Application Management) -->
                        <div class="pt-2 border-t border-gray-800/80">
                            <div id="app-control-card" class="bg-gray-950/80 border border-gray-800 rounded-xl p-4 space-y-3">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <i data-lucide="server" class="w-4 h-4 text-indigo-400"></i>
                                        <span class="text-xs font-bold text-gray-200 uppercase tracking-wider">Controle da Aplicação</span>
                                    </div>
                                    <div class="flex items-center gap-2" id="app-card-badges">
                                        <!-- Populated dynamically -->
                                    </div>
                                </div>

                                <!-- Warning if offline and auto_start_app is false -->
                                <div id="app-offline-warning" class="hidden p-3 rounded-lg bg-amber-950/40 border border-amber-900/50 text-amber-300 text-xs flex items-center gap-2.5">
                                    <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400 shrink-0"></i>
                                    <span class="leading-relaxed">⚠️ Aplicação não está online. Ligue antes de executar os testes.</span>
                                </div>

                                <!-- Action Buttons -->
                                <div id="app-card-actions">
                                    <!-- Populated dynamically -->
                                </div>

                                <!-- Process List -->
                                <div>
                                    <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                        <span>Processos</span>
                                        <span id="app-processes-summary" class="text-gray-500 font-mono text-[11px]">0 processos</span>
                                    </div>
                                    <div id="app-processes-list" class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                        <!-- Populated dynamically -->
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- BIG Action Button: Executar Testes -->
                        <div class="pt-2">
                            <button type="submit" id="btn-start-execution" 
                                class="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition transform active:scale-[0.99]">
                                <i data-lucide="play" class="w-5 h-5 fill-current"></i>
                                <span>Executar Testes</span>
                            </button>
                        </div>
                    </form>
                </div>

                <!-- ========================================== -->
                <!-- RIGHT PANEL: Live Output & Monitor (7 Cols)-->
                <!-- ========================================== -->
                <div class="lg:col-span-7 space-y-4">
                    
                    <!-- App Status Bar -->
                    <div id="app-status-bar" class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-gray-950 border border-gray-800 flex items-center justify-center text-indigo-400 shrink-0">
                                <i data-lucide="power" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <span id="app-bar-dot" class="app-status-dot offline"></span>
                                    <span id="app-bar-status-text" class="text-sm font-bold text-gray-200">Aplicação Offline</span>
                                    <span id="app-bar-auto-badge" class="hidden px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
                                        Auto-start ✓
                                    </span>
                                </div>
                                <p id="app-bar-subtitle" class="text-xs text-gray-400 mt-0.5">
                                    Nenhum serviço em execução no momento
                                </p>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 self-end sm:self-auto" id="app-bar-actions">
                            <!-- Quick Button: Ligar / Desligar -->
                        </div>
                    </div>

                    <!-- Execution Header & Status -->
                    <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                        <div class="flex items-center gap-3">
                            <div id="exec-status-badge">
                                <span class="status-pill status-cancelled">
                                    <span class="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                                    <span>Aguardando Início</span>
                                </span>
                            </div>
                            <div class="border-l border-gray-800 pl-3">
                                <h4 id="exec-display-title" class="text-sm font-bold text-gray-200">Pronto para Execução</h4>
                                <p id="exec-display-subtitle" class="text-xs text-gray-400">Configure os parâmetros ao lado e clique em Iniciar</p>
                            </div>
                        </div>

                        <!-- Live Timer & Controls -->
                        <div class="flex items-center gap-2 self-end sm:self-auto">
                            <div id="exec-timer-box" class="hidden px-2.5 py-1 bg-gray-950 border border-gray-800 rounded font-mono text-xs text-gray-300 flex items-center gap-1.5">
                                <i data-lucide="timer" class="w-3.5 h-3.5 text-indigo-400"></i>
                                <span id="exec-timer-display">00:00</span>
                            </div>

                            <button type="button" id="btn-cancel-execution" onclick="Execution.cancelCurrentExecution()" 
                                class="hidden px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded text-xs font-medium transition inline-flex items-center gap-1">
                                <i data-lucide="square" class="w-3 h-3 fill-current"></i>
                                <span>Cancelar</span>
                            </button>
                        </div>
                    </div>

                    <!-- Summary Card (When Execution Finishes) -->
                    <div id="exec-summary-banner" class="hidden">
                        <!-- Populated when finished -->
                    </div>

                    <!-- Live Dual Terminal Container (Test Console Top & App Console Bottom) -->
                    <div class="terminal-container flex flex-col rounded-xl overflow-hidden border border-gray-800 shadow-xl bg-gray-950">
                        
                        <!-- ========================================== -->
                        <!-- TOP: Test Console                          -->
                        <!-- ========================================== -->
                        <div class="terminal-header flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gray-900 border-b border-gray-800">
                            <div class="flex items-center gap-2">
                                <div class="flex items-center gap-1.5 mr-2 hidden sm:flex">
                                    <span class="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
                                    <span class="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                                    <span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <i data-lucide="terminal" class="w-4 h-4 text-indigo-400"></i>
                                    <span class="text-xs font-bold text-gray-200 uppercase tracking-wider">Console dos Testes</span>
                                </div>
                            </div>

                            <!-- Terminal Tools (Test) -->
                            <div class="flex items-center gap-2">
                                <label class="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer mr-1 select-none">
                                    <input type="checkbox" id="exec-autoscroll-toggle" checked onchange="Execution.autoScroll = this.checked;" class="custom-checkbox">
                                    <span>Auto-scroll</span>
                                </label>

                                <button type="button" onclick="Execution.clearTerminal()" 
                                    class="p-1.5 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800 transition" title="Limpar console dos testes">
                                    <i data-lucide="eraser" class="w-3.5 h-3.5"></i>
                                </button>

                                <button type="button" onclick="Execution.copyTerminalLogs()" 
                                    class="p-1.5 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800 transition" title="Copiar logs dos testes">
                                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Test Console Body (Top Half) -->
                        <div id="terminal-screen-test" class="terminal-body font-mono text-xs bg-[#0d1117] overflow-y-auto" style="max-height: 300px; min-height: 180px; background-color: #0d1117;">
                            <span class="log-dim">// O console exibirá os logs de execução em tempo real via WebSocket...</span>
                        </div>

                        <!-- ========================================== -->
                        <!-- BOTTOM: App Console                        -->
                        <!-- ========================================== -->
                        <div class="terminal-header flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gray-900 border-t border-b border-gray-800">
                            <div class="flex items-center gap-2">
                                <div class="flex items-center gap-1.5 mr-2 hidden sm:flex">
                                    <span class="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
                                    <span class="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                                    <span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <i data-lucide="server" class="w-4 h-4 text-emerald-400"></i>
                                    <span class="text-xs font-bold text-gray-200 uppercase tracking-wider">Console da Aplicação</span>
                                    <span id="app-console-status-dot" class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shrink-0 transition-colors" title="Status da aplicação"></span>
                                    <span id="app-console-status-text" class="text-[11px] text-gray-400 font-medium">Offline</span>
                                </div>
                            </div>

                            <!-- Terminal Tools (App) -->
                            <div class="flex items-center gap-2">
                                <label class="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer mr-1 select-none">
                                    <input type="checkbox" id="app-autoscroll-toggle" checked onchange="Execution.appAutoScroll = this.checked;" class="custom-checkbox">
                                    <span>Auto-scroll</span>
                                </label>

                                <button type="button" onclick="Execution.clearAppTerminal()" 
                                    class="p-1.5 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800 transition" title="Limpar console da aplicação">
                                    <i data-lucide="eraser" class="w-3.5 h-3.5"></i>
                                </button>

                                <button type="button" onclick="Execution.copyAppLogs()" 
                                    class="p-1.5 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800 transition" title="Copiar logs da aplicação">
                                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>
                        </div>

                        <!-- App Console Body (Bottom Half) -->
                        <div id="terminal-screen-app" class="terminal-body font-mono text-xs bg-[#0d1117] overflow-y-auto" style="max-height: 200px; min-height: 120px; background-color: #0d1117;">
                            <span class="log-dim text-gray-500">Aplicação não está em execução.</span>
                        </div>

                    </div>

                </div>

            </div>
        `;

        this.setupRadioStyles();
        this.updateAppControlUI();

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Setup custom visuals for radio cards.
     */
    setupRadioStyles() {
        const updateRadios = () => {
            document.querySelectorAll('input[name="exec-mode"]').forEach(radio => {
                const card = radio.closest('.mode-card');
                if (radio.checked) {
                    card.classList.add('border-indigo-500', 'bg-indigo-600/10');
                    card.classList.remove('border-gray-800', 'bg-gray-950/60');
                    card.querySelector('.mode-icon')?.classList.add('text-indigo-400');
                    card.querySelector('.mode-title')?.classList.add('text-indigo-300');
                } else {
                    card.classList.remove('border-indigo-500', 'bg-indigo-600/10');
                    card.classList.add('border-gray-800', 'bg-gray-950/60');
                    card.querySelector('.mode-icon')?.classList.remove('text-indigo-400');
                    card.querySelector('.mode-title')?.classList.remove('text-indigo-300');
                }
            });

            document.querySelectorAll('input[name="exec-browser"]').forEach(radio => {
                const card = radio.closest('.browser-choice');
                if (radio.checked) {
                    card.classList.add('border-indigo-500', 'bg-indigo-600/10');
                    card.classList.remove('border-gray-800', 'bg-gray-950/60');
                } else {
                    card.classList.remove('border-indigo-500', 'bg-indigo-600/10');
                    card.classList.add('border-gray-800', 'bg-gray-950/60');
                }
            });
        };

        document.querySelectorAll('input[name="exec-mode"], input[name="exec-browser"]').forEach(el => {
            el.addEventListener('change', updateRadios);
        });

        updateRadios();
    },

    /**
     * Handler when selected project changes.
     * @param {string|number} projectId 
     */
    async onProjectChanged(projectId) {
        await this.selectProject(projectId);
    },

    /**
     * Select a project and load its metadata and test files.
     * @param {number|string} projectId 
     */
    async selectProject(projectId) {
        const proj = this.projects.find(p => String(p.id) === String(projectId));
        if (!proj) return;

        this.currentProject = proj;

        // Update select value if not matching
        const select = document.getElementById('exec-project-select');
        if (select && select.value !== String(proj.id)) {
            select.value = proj.id;
        }

        // Update project meta info under select
        const metaEl = document.getElementById('exec-project-meta');
        if (metaEl) {
            metaEl.innerHTML = `
                <span class="truncate max-w-[280px]" title="${App.escapeHtml(proj.path)}">
                    <i data-lucide="folder" class="w-3 h-3 inline mr-1 text-gray-500"></i>${App.escapeHtml(proj.path)}
                </span>
                <span class="uppercase font-semibold text-gray-400">${App.escapeHtml(proj.test_type)}</span>
            `;
            if (window.lucide) lucide.createIcons();
        }

        // Set default browser for project if defined
        if (proj.browser) {
            const browserRadio = document.querySelector(`input[name="exec-browser"][value="${proj.browser}"]`);
            if (browserRadio) {
                browserRadio.checked = true;
                this.setupRadioStyles();
            }
        }

        // Pre-fill environment variables if project has them
        this.populateEnvRows(proj.env_vars || {});

        // Fetch application status and setup app streaming
        const appState = await this.fetchAppStatus(proj.id);
        this.connectAppWebSocket(proj.id);

        const isOffline = (appState?.status || 'offline').toLowerCase() === 'offline';
        if (isOffline) {
            this.setAppOfflineMessage();
        } else {
            await this.fetchAppLogs(proj.id);
        }

        // Fetch test files for this project
        await this.loadTests(proj.id);
    },

    /**
     * Fetch test files for the project.
     * @param {number|string} projectId 
     */
    async loadTests(projectId) {
        const container = document.getElementById('tests-tree-container');
        if (!container) return;

        container.innerHTML = `<div class="text-xs text-gray-500 text-center py-4">Buscando testes no projeto...</div>`;
        this.selectedTests.clear();

        try {
            const tests = await App.apiCall(`/api/projects/${projectId}/tests`);
            this.testFiles = Array.isArray(tests) ? tests : [];
            this.renderTestsTree();
        } catch (err) {
            console.error('[Execution] Error loading tests:', err);
            container.innerHTML = `
                <div class="text-xs text-amber-400 p-3 bg-amber-950/20 border border-amber-900/30 rounded">
                    Não foi possível listar os arquivos: ${App.escapeHtml(err.message)}
                </div>
            `;
        }
    },

    /**
     * Render the checkable tree/list of test files.
     */
    renderTestsTree() {
        const container = document.getElementById('tests-tree-container');
        if (!container) return;

        if (this.testFiles.length === 0) {
            container.innerHTML = `<div class="text-xs text-gray-500 text-center py-4">Nenhum arquivo de teste encontrado na pasta.</div>`;
            this.updateSelectedCount();
            return;
        }

        container.innerHTML = this.testFiles.map((file, idx) => {
            const isSelected = this.selectedTests.has(file.path);
            return `
                <label class="tree-item flex items-center gap-2 p-1.5 rounded hover:bg-gray-900 cursor-pointer transition">
                    <input type="checkbox" value="${App.escapeHtml(file.path)}" 
                        ${isSelected ? 'checked' : ''}
                        onchange="Execution.onTestSelectionToggle('${App.escapeHtml(file.path)}', this.checked)"
                        class="custom-checkbox shrink-0">
                    <i data-lucide="${file.type === 'robot' ? 'bot' : 'file-code'}" class="w-3.5 h-3.5 text-gray-400 shrink-0"></i>
                    <span class="text-xs font-mono text-gray-300 truncate" title="${App.escapeHtml(file.path)}">
                        ${App.escapeHtml(file.name || file.path)}
                    </span>
                </label>
            `;
        }).join('');

        this.updateSelectedCount();

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Toggle selection of an individual test file.
     * @param {string} path 
     * @param {boolean} checked 
     */
    onTestSelectionToggle(path, checked) {
        if (checked) {
            this.selectedTests.add(path);
        } else {
            this.selectedTests.delete(path);
        }
        this.updateSelectedCount();
    },

    /**
     * Select all or deselect all test files.
     * @param {boolean} selectAll 
     */
    selectAllTests(selectAll) {
        this.selectedTests.clear();
        if (selectAll) {
            this.testFiles.forEach(f => this.selectedTests.add(f.path));
        }
        this.renderTestsTree();
    },

    /**
     * Update the badge showing count of selected files.
     */
    updateSelectedCount() {
        const badge = document.getElementById('selected-tests-count');
        if (badge) {
            badge.textContent = `${this.selectedTests.size}/${this.testFiles.length}`;
        }
    },

    /**
     * Handler when execution mode radio changes.
     * @param {string} mode 
     */
    onModeChanged(mode) {
        const specSection = document.getElementById('section-specific-tests');
        const tagSection = document.getElementById('section-tags');

        if (mode === 'specific_tests') {
            specSection?.classList.remove('hidden');
            tagSection?.classList.add('hidden');
        } else if (mode === 'by_tag') {
            specSection?.classList.add('hidden');
            tagSection?.classList.remove('hidden');
        } else {
            specSection?.classList.add('hidden');
            tagSection?.classList.add('hidden');
        }
    },

    /**
     * Toggle extra environment variables accordion.
     */
    toggleEnvSection() {
        const section = document.getElementById('exec-env-section');
        const chevron = document.getElementById('exec-env-chevron');
        if (section) {
            const isHidden = section.classList.contains('hidden');
            if (isHidden) {
                section.classList.remove('hidden');
                chevron?.classList.add('rotate-180');
            } else {
                section.classList.add('hidden');
                chevron?.classList.remove('rotate-180');
            }
        }
    },

    /**
     * Populate environment variables rows.
     * @param {object} envVars 
     */
    populateEnvRows(envVars = {}) {
        const container = document.getElementById('exec-env-rows');
        if (!container) return;

        container.innerHTML = '';
        const keys = Object.keys(envVars);
        if (keys.length > 0) {
            keys.forEach(k => this.addEnvRow(k, envVars[k]));
        }
    },

    /**
     * Add single environment variable row to execution panel.
     * @param {string} key 
     * @param {string} val 
     */
    addEnvRow(key = '', val = '') {
        const container = document.getElementById('exec-env-rows');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'exec-env-row flex items-center gap-2';
        row.innerHTML = `
            <input type="text" placeholder="CHAVE" value="${App.escapeHtml(key)}" 
                class="exec-env-key flex-1 px-3 py-1.5 bg-gray-950 border border-gray-800 rounded text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500">
            <span class="text-gray-600 text-xs">=</span>
            <input type="text" placeholder="VALOR" value="${App.escapeHtml(val)}" 
                class="exec-env-val flex-1 px-3 py-1.5 bg-gray-950 border border-gray-800 rounded text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500">
            <button type="button" onclick="this.closest('.exec-env-row').remove()" 
                class="p-1 text-gray-500 hover:text-red-400 rounded transition" title="Remover">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
        `;
        container.appendChild(row);

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Start test execution with verification of application status.
     */
    async startExecution() {
        if (!this.currentProject) {
            App.showToast('Selecione um projeto antes de iniciar a execução', 'warning');
            return;
        }

        const project = this.currentProject;
        const appState = this.appState || {};
        const isOffline = (appState.status || 'offline').toLowerCase() === 'offline';
        const autoStart = !!project.auto_start_app;
        const hasCommands = Array.isArray(project.app_commands) && project.app_commands.length > 0;

        // If app is offline, has commands configured, and auto_start_app is OFF: prompt user
        if (hasCommands && isOffline && !autoStart) {
            App.showModal(
                'Aplicação Não Está Online',
                `
                    <div class="space-y-3">
                        <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                            <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-400 shrink-0 mt-0.5"></i>
                            <div>
                                <h4 class="text-xs font-bold text-amber-200">A aplicação não está online.</h4>
                                <p class="text-xs text-amber-300/90 mt-0.5">
                                    Deseja iniciar automaticamente os serviços configurados antes dos testes?
                                </p>
                            </div>
                        </div>
                        <p class="text-xs text-gray-400 leading-relaxed">
                            A maioria dos testes pode falhar se os serviços da aplicação não estiverem respondendo na rede local.
                        </p>
                    </div>
                `,
                [
                    {
                        label: 'Cancelar',
                        class: 'px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition',
                        closeOnClick: true
                    },
                    {
                        label: 'Executar sem iniciar',
                        class: 'px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition',
                        closeOnClick: true,
                        onClick: async () => {
                            await this.runTestExecution();
                        }
                    },
                    {
                        label: 'Sim, iniciar e executar',
                        class: 'px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium shadow-md shadow-emerald-600/30 transition',
                        closeOnClick: true,
                        onClick: async () => {
                            await this.startApp();
                            await this.runTestExecution();
                        }
                    }
                ]
            );
            return;
        }

        // If autoStart is active and app is offline, show notice in app console
        if (hasCommands && isOffline && autoStart) {
            this.appendAppTerminalLine(`[AUTO-START] Inicialização automática ativada. Os serviços serão iniciados antes dos testes.`, 'log-info');
        }

        await this.runTestExecution();
    },

    /**
     * Dispatch test execution run to backend.
     */
    async runTestExecution() {
        if (!this.currentProject) return;

        const mode = document.querySelector('input[name="exec-mode"]:checked')?.value || 'full_suite';
        const browser = document.querySelector('input[name="exec-browser"]:checked')?.value || 'chromium';
        const headless = document.getElementById('exec-headless-toggle')?.checked ?? true;
        const debug = document.getElementById('exec-debug-toggle')?.checked ?? false;
        const tags = document.getElementById('exec-tags-input')?.value.trim() || null;

        // Selected tests validation if mode is specific_tests
        let selectedTestsList = [];
        if (mode === 'specific_tests') {
            selectedTestsList = Array.from(this.selectedTests);
            if (selectedTestsList.length === 0) {
                App.showToast('Selecione pelo menos um arquivo de teste para executar', 'warning');
                return;
            }
        }

        // Gather extra env vars
        const envVars = {};
        document.querySelectorAll('.exec-env-row').forEach(row => {
            const key = row.querySelector('.exec-env-key')?.value.trim();
            const val = row.querySelector('.exec-env-val')?.value.trim();
            if (key) {
                envVars[key] = val || '';
            }
        });

        const payload = {
            project_id: this.currentProject.id,
            test_type: this.currentProject.test_type,
            mode: mode,
            browser: browser,
            headless: headless,
            debug: debug,
            selected_tests: selectedTestsList,
            tags: mode === 'by_tag' ? tags : null,
            env_vars: envVars
        };

        const startBtn = document.getElementById('btn-start-execution');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = `
                <div class="spinner w-4 h-4 border-2 mr-2"></div>
                <span>Iniciando Runner...</span>
            `;
        }

        this.clearTerminal();
        this.hideSummary();
        this.updateStatusBadge('running', 'Executando testes...');
        this.startTimer();

        try {
            const execution = await App.apiCall('/api/executions', 'POST', payload);
            this.currentExecution = execution;
            App.activeExecutionId = execution.id;

            this.appendTerminalLine(`[SISTEMA] Execução #${execution.id} iniciada para o projeto "${this.currentProject.name}"`, 'log-info');
            this.appendTerminalLine(`[CONFIG] Modo: ${mode} | Navegador: ${browser} | Headless: ${headless} | Debug: ${debug}`, 'log-dim');
            this.appendTerminalLine(`--------------------------------------------------------------------------------`, 'log-dim');

            // Show cancel button
            const cancelBtn = document.getElementById('btn-cancel-execution');
            if (cancelBtn) cancelBtn.classList.remove('hidden');

            // Connect WebSocket for live streaming
            this.connectWebSocket(execution.id);

            App.showToast(`Execução #${execution.id} iniciada com sucesso!`, 'info');
        } catch (err) {
            console.error('[Execution] Start error:', err);
            this.updateStatusBadge('failed', 'Falha ao iniciar');
            this.stopTimer();
            this.appendTerminalLine(`[ERRO CRÍTICO] Falha ao despachar execução: ${err.message}`, 'log-error');
        } finally {
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerHTML = `
                    <i data-lucide="play" class="w-5 h-5 fill-current"></i>
                    <span>Executar Testes</span>
                `;
                if (window.lucide) lucide.createIcons();
            }
        }
    },

    /**
     * Connect WebSocket for execution live log stream.
     * @param {number|string} executionId 
     */
    connectWebSocket(executionId) {
        if (this.currentWs) {
            this.currentWs.disconnect();
        }

        this.currentWs = new WSClient(executionId);

        this.currentWs.onOpen = () => {
            this.appendTerminalLine(`[WEBSOCKET] Conexão em tempo real estabelecida com sucesso.`, 'log-dim');
        };

        this.currentWs.onMessage = (data) => {
            // Check if structured JSON or raw string
            if (data && typeof data === 'object') {
                if (data.type === 'log' || data.log || data.message) {
                    const line = data.log || data.message || JSON.stringify(data);
                    this.processLogLine(line);
                } else if (data.status) {
                    // Status update event
                    this.updateStatusBadge(data.status);
                    if (data.status !== 'running') {
                        this.onExecutionFinished(executionId);
                    }
                }
            } else if (typeof data === 'string') {
                this.processLogLine(data);
            }
        };

        this.currentWs.onError = (err) => {
            this.appendTerminalLine(`[WEBSOCKET ALERTA] Erro na conexão de streaming de logs.`, 'log-warn');
        };

        this.currentWs.onClose = () => {
            this.appendTerminalLine(`[WEBSOCKET] Conexão encerrada pelo servidor.`, 'log-dim');
            // Fetch final status
            this.onExecutionFinished(executionId);
        };

        this.currentWs.connect();
    },

    /**
     * Process and colorize a log line.
     * @param {string} rawLine 
     */
    processLogLine(rawLine) {
        if (!rawLine) return;

        // Split multiple lines if sent together
        const lines = rawLine.split(/\r?\n/);
        lines.forEach(line => {
            if (!line.trim()) return;

            let logClass = 'text-gray-200';
            const upper = line.toUpperCase();

            if (upper.includes('PASS') || upper.includes('PASSED') || upper.includes('SUCESSO') || line.includes('✓')) {
                logClass = 'log-pass';
            } else if (upper.includes('FAIL') || upper.includes('FAILED') || upper.includes('FALHA') || line.includes('✘') || line.includes('Error:')) {
                logClass = 'log-fail';
            } else if (upper.includes('WARN') || upper.includes('WARNING') || upper.includes('ATENÇÃO')) {
                logClass = 'log-warn';
            } else if (upper.includes('INFO') || upper.includes('RUNNING') || upper.includes('EXECUTANDO')) {
                logClass = 'log-info';
            } else if (upper.includes('DEBUG') || upper.includes('TRACE')) {
                logClass = 'log-debug';
            }

            this.appendTerminalLine(line, logClass);
        });
    },

    /**
     * Append line of text to test terminal screen.
     * @param {string} text 
     * @param {string} cssClass 
     */
    appendTerminalLine(text, cssClass = '') {
        const screen = document.getElementById('terminal-screen-test') || document.getElementById('terminal-screen');
        if (!screen) return;

        const lineEl = document.createElement('div');
        lineEl.className = `log-line ${cssClass}`;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        lineEl.innerHTML = `<span class="log-time">[${timeStr}]</span> ${App.escapeHtml(text)}`;
        screen.appendChild(lineEl);

        if (this.autoScroll !== false) {
            screen.scrollTop = screen.scrollHeight;
        }
    },

    /**
     * Clear test terminal contents.
     */
    clearTerminal() {
        const screen = document.getElementById('terminal-screen-test') || document.getElementById('terminal-screen');
        if (screen) {
            screen.innerHTML = '';
        }
    },

    /**
     * Copy all logs currently displayed in test terminal to clipboard.
     */
    copyTerminalLogs() {
        const screen = document.getElementById('terminal-screen-test') || document.getElementById('terminal-screen');
        if (!screen) return;
        const text = screen.innerText || screen.textContent;
        App.copyToClipboard(text, 'Logs da execução');
    },

    /**
     * Clear the currently active terminal (app or test).
     */
    clearActiveTerminal() {
        this.clearTerminal();
    },

    /**
     * Copy logs from the currently active terminal to clipboard.
     */
    copyActiveTerminalLogs() {
        this.copyTerminalLogs();
    },

    /**
     * Copy application logs to clipboard.
     */
    copyAppLogs() {
        const screen = document.getElementById('terminal-screen-app');
        if (!screen) return;
        const text = screen.innerText || screen.textContent;
        App.copyToClipboard(text, 'Logs da aplicação');
    },

    /**
     * Display offline placeholder message in application console.
     */
    setAppOfflineMessage() {
        const screen = document.getElementById('terminal-screen-app');
        if (!screen) return;
        screen.innerHTML = `<span class="log-dim text-gray-500">Aplicação não está em execução.</span>`;
    },

    /**
     * Switch active console tab (kept for compatibility, both consoles visible).
     * @param {'app'|'test'} tabName 
     */
    switchTab(tabName) {
        this.activeTab = tabName;
    },

    /**
     * Toggle unread activity dot on the app tab (kept for compatibility).
     * @param {boolean} unread 
     */
    setAppTabUnread(unread) {
        // Both consoles are always visible simultaneously
    },

    /**
     * Toggle unread activity dot on the test tab (kept for compatibility).
     * @param {boolean} unread 
     */
    setTestTabUnread(unread) {
        // Both consoles are always visible simultaneously
    },

    /**
     * Clear the application terminal body.
     */
    clearAppTerminal() {
        const screen = document.getElementById('terminal-screen-app');
        if (!screen) return;
        const isOffline = (this.appState?.status || 'offline').toLowerCase() === 'offline';
        if (isOffline) {
            this.setAppOfflineMessage();
        } else {
            screen.innerHTML = '';
        }
    },

    /**
     * Process multiline text for the application terminal.
     * @param {string} rawText 
     */
    processAppLogLine(rawText) {
        if (!rawText) return;
        const lines = String(rawText).split(/\r?\n/);
        lines.forEach(line => {
            if (!line.trim()) return;

            let logClass = 'text-gray-300';
            const upper = line.toUpperCase();

            if (upper.includes('ERROR') || upper.includes('ERRO') || upper.includes('FAIL') || upper.includes('EXCEPTION')) {
                logClass = 'log-fail';
            } else if (upper.includes('WARN') || upper.includes('WARNING') || upper.includes('AVISO')) {
                logClass = 'log-warn';
            } else if (upper.includes('READY') || upper.includes('LISTENING') || upper.includes('SUCCESS') || upper.includes('SUCESSO') || line.includes('http://') || line.includes('https://') || line.includes('✓')) {
                logClass = 'log-pass';
            } else if (upper.includes('INFO') || upper.includes('STARTING') || upper.includes('INICIANDO')) {
                logClass = 'log-info';
            }

            this.appendAppTerminalLine(line, logClass);
        });
    },

    /**
     * Append line of text to application terminal screen.
     * @param {string} text 
     * @param {string} cssClass 
     */
    appendAppTerminalLine(text, cssClass = '') {
        const screen = document.getElementById('terminal-screen-app');
        if (!screen) return;

        // Clear offline message placeholder if present
        if (screen.textContent.includes('Aplicação não está em execução.')) {
            screen.innerHTML = '';
        }

        const lineEl = document.createElement('div');
        lineEl.className = `log-line ${cssClass}`;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        lineEl.innerHTML = `<span class="log-time">[${timeStr}]</span> ${App.escapeHtml(text)}`;
        screen.appendChild(lineEl);

        if (this.appAutoScroll !== false) {
            screen.scrollTop = screen.scrollHeight;
        }
    },

    /**
     * Fetch application status from backend.
     * @param {number|string} projectId 
     * @param {boolean} silent 
     */
    async fetchAppStatus(projectId, silent = false) {
        if (!projectId) return null;
        try {
            const res = await App.apiCall(`/api/projects/${projectId}/app/status`, 'GET', null, silent);
            this.appState = res;
            this.updateAppControlUI(res);
            return res;
        } catch (err) {
            if (!silent) {
                console.warn('[Execution] Error fetching app status:', err);
            }
            return null;
        }
    },

    /**
     * Start the application processes for current project.
     * Checks for running app port conflicts across projects before starting.
     * @param {boolean} force 
     */
    async startApp(force = false) {
        if (!this.currentProject) return;
        const projectId = this.currentProject.id;

        // Check for running apps in other projects before sending request
        if (!force) {
            try {
                const runningApps = await App.apiCall('/api/projects/apps/running', 'GET', null, true);
                const conflicting = (Array.isArray(runningApps) ? runningApps : []).filter(
                    app => String(app.project_id) !== String(projectId)
                );

                if (conflicting.length > 0) {
                    const runningProjectName = conflicting.map(a => a.project_name || `Projeto #${a.project_id}`).join(', ');
                    App.showModal(
                        '⚠️ Conflito de Aplicação / Porta Detectado',
                        `
                            <div class="space-y-3">
                                <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                                    <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-400 shrink-0 mt-0.5"></i>
                                    <div>
                                        <h4 class="text-xs font-bold text-amber-200">Aplicação em execução detectada</h4>
                                        <p class="text-sm text-gray-200 mt-1 leading-relaxed">
                                            A aplicação do projeto <strong>"${App.escapeHtml(runningProjectName)}"</strong> já está em execução (possível conflito na mesma porta, ex: :3000).
                                        </p>
                                        <p class="text-xs text-amber-300/90 mt-2 font-medium">
                                            Deseja desligar a aplicação do projeto "${App.escapeHtml(runningProjectName)}" para poder rodar a deste projeto na mesma porta?
                                        </p>
                                    </div>
                                </div>
                            </div>
                        `,
                        [
                            {
                                label: 'Cancelar',
                                class: 'px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition',
                                closeOnClick: true
                            },
                            {
                                label: 'Sim, desligar e iniciar',
                                class: 'px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold shadow-md shadow-amber-600/30 transition',
                                closeOnClick: true,
                                onClick: async () => {
                                    App.hideModal();
                                    await this.startApp(true);
                                }
                            }
                        ]
                    );
                    return;
                }
            } catch (err) {
                console.warn('[Execution] Erro ao verificar aplicações em execução:', err);
            }
        }

        this.isAppActionLoading = true;
        this.updateAppControlUI({ status: 'starting' });
        this.clearAppTerminal();
        this.appendAppTerminalLine(`[SISTEMA] Solicitando inicialização dos serviços para "${this.currentProject.name}"...`, 'log-info');

        try {
            const endpoint = force ? `/api/projects/${projectId}/app/start?force=true` : `/api/projects/${projectId}/app/start`;
            const res = await App.apiCall(endpoint, 'POST');

            if (res && res.conflict) {
                this.isAppActionLoading = false;
                await this.fetchAppStatus(projectId, true);
                const conflictName = res.conflict_project_name || `Projeto #${res.conflict_project_id}`;
                App.showModal(
                    '⚠️ Conflito de Aplicação / Porta Detectado',
                    `
                        <div class="space-y-3">
                            <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                                <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-400 shrink-0 mt-0.5"></i>
                                <div>
                                    <h4 class="text-xs font-bold text-amber-200">Aplicação em execução detectada</h4>
                                    <p class="text-sm text-gray-200 mt-1 leading-relaxed">
                                        A aplicação do projeto <strong>"${App.escapeHtml(conflictName)}"</strong> já está em execução (possível conflito na mesma porta, ex: :3000).
                                    </p>
                                    <p class="text-xs text-amber-300/90 mt-2 font-medium">
                                        Deseja desligar a aplicação do projeto "${App.escapeHtml(conflictName)}" para poder rodar a deste projeto na mesma porta?
                                    </p>
                                </div>
                            </div>
                        </div>
                    `,
                    [
                        {
                            label: 'Cancelar',
                            class: 'px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition',
                            closeOnClick: true
                        },
                        {
                            label: 'Sim, desligar e iniciar',
                            class: 'px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold shadow-md shadow-amber-600/30 transition',
                            closeOnClick: true,
                            onClick: async () => {
                                App.hideModal();
                                await this.startApp(true);
                            }
                        }
                    ]
                );
                return;
            }

            this.appState = res;
            this.updateAppControlUI(res);
            App.showToast(res.message || 'Aplicação iniciada com sucesso!', 'success');
            this.appendAppTerminalLine(`[SISTEMA] ${res.message || 'Aplicação iniciada com sucesso.'}`, 'log-pass');
            this.connectAppWebSocket(projectId);
        } catch (err) {
            console.error('[Execution] Error starting app:', err);
            this.appendAppTerminalLine(`[ERRO] Falha ao iniciar aplicação: ${err.message}`, 'log-error');
            await this.fetchAppStatus(projectId, true);
        } finally {
            this.isAppActionLoading = false;
            this.updateAppControlUI();
        }
    },

    /**
     * Stop the application processes for current project.
     */
    async stopApp() {
        if (!this.currentProject) return;
        const projectId = this.currentProject.id;
        this.isAppActionLoading = true;
        this.appendAppTerminalLine(`[SISTEMA] Solicitando desligamento da aplicação...`, 'log-warn');

        try {
            const res = await App.apiCall(`/api/projects/${projectId}/app/stop`, 'POST');
            this.appState = res;
            this.updateAppControlUI(res);
            App.showToast(res.message || 'Aplicação desligada com sucesso.', 'info');
            this.appendAppTerminalLine(`[SISTEMA] ${res.message || 'Aplicação desligada com sucesso.'}`, 'log-dim');
            this.setAppOfflineMessage();
        } catch (err) {
            console.error('[Execution] Error stopping app:', err);
            this.appendAppTerminalLine(`[ERRO] Falha ao desligar aplicação: ${err.message}`, 'log-error');
            await this.fetchAppStatus(projectId, true);
        } finally {
            this.isAppActionLoading = false;
            this.updateAppControlUI();
        }
    },

    /**
     * Toggle app state: start if offline, stop if online/starting/partial.
     */
    async toggleApp() {
        const status = (this.appState?.status || 'offline').toLowerCase();
        if (status === 'offline') {
            await this.startApp();
        } else {
            await this.stopApp();
        }
    },

    /**
     * Fetch historical logs for the application.
     * @param {number|string} projectId 
     */
    async fetchAppLogs(projectId) {
        if (!projectId) return;
        const isOffline = (this.appState?.status || 'offline').toLowerCase() === 'offline';
        if (isOffline) {
            this.setAppOfflineMessage();
            return;
        }

        try {
            const res = await App.apiCall(`/api/projects/${projectId}/app/logs`, 'GET', null, true);
            if (res && res.logs && res.logs.trim()) {
                this.clearAppTerminal();
                this.processAppLogLine(res.logs);
            } else {
                this.setAppOfflineMessage();
            }
        } catch (err) {
            console.debug('[Execution] Could not load app logs:', err);
        }
    },

    /**
     * Connect live WebSocket for application console stream.
     * @param {number|string} projectId 
     */
    connectAppWebSocket(projectId) {
        if (!projectId) return;

        if (this.appWs) {
            try {
                this.appWs.close(1000, 'Reconnecting');
            } catch (e) {}
            this.appWs = null;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        const wsUrl = `${protocol}//${host}/ws/app/${projectId}`;

        try {
            console.log(`[AppWS] Conectando a ${wsUrl}`);
            const ws = new WebSocket(wsUrl);
            this.appWs = ws;

            ws.onopen = () => {
                console.log(`[AppWS] Conexão estabelecida para o projeto ${projectId}`);
            };

            ws.onmessage = (event) => {
                let data = event.data;
                try {
                    const parsed = JSON.parse(event.data);
                    data = parsed.log || parsed.message || parsed.data || event.data;
                } catch {
                    data = event.data;
                }
                this.processAppLogLine(data);
            };

            ws.onerror = (err) => {
                console.warn(`[AppWS] Erro no WebSocket do app:`, err);
            };

            ws.onclose = () => {
                console.log(`[AppWS] Conexão encerrada`);
            };
        } catch (err) {
            console.error('[AppWS] Falha ao conectar:', err);
        }
    },

    /**
     * Disconnect application WebSocket.
     */
    disconnectAppWebSocket() {
        if (this.appWs) {
            try {
                this.appWs.close(1000);
            } catch (e) {}
            this.appWs = null;
        }
    },

    /**
     * Start background polling for app status every 10 seconds.
     */
    startAppStatusPolling() {
        this.stopAppStatusPolling();
        this.appStatusPollInterval = setInterval(async () => {
            if (App.currentPage !== 'execution' || !this.currentProject) {
                this.stopAppStatusPolling();
                return;
            }
            await this.fetchAppStatus(this.currentProject.id, true);
        }, 10000);
    },

    /**
     * Stop background polling for app status.
     */
    stopAppStatusPolling() {
        if (this.appStatusPollInterval) {
            clearInterval(this.appStatusPollInterval);
            this.appStatusPollInterval = null;
        }
    },

    /**
     * Update the App Control Card and App Status Bar UI based on state.
     * @param {object|null} state 
     */
    updateAppControlUI(state = null) {
        if (state) {
            this.appState = { ...(this.appState || {}), ...state };
        }

        const project = this.currentProject;
        const appState = this.appState || {};
        const status = (appState.status || 'offline').toLowerCase();
        const rawProcesses = Array.isArray(appState.processes) ? appState.processes : [];
        const configuredCommands = Array.isArray(project?.app_commands) ? project.app_commands : [];
        const hasCommands = configuredCommands.length > 0;
        const autoStart = !!project?.auto_start_app;

        let displayProcesses = [];
        if (rawProcesses.length > 0) {
            displayProcesses = rawProcesses;
        } else if (hasCommands) {
            displayProcesses = configuredCommands.map(c => ({
                label: c.label || c.command,
                command: c.command,
                type: c.type || 'daemon',
                status: 'stopped',
                pid: null
            }));
        }

        const activeCount = displayProcesses.filter(p => (p.status || '').toLowerCase() === 'running').length;

        // 1. Update App Status Bar (Right Panel Top)
        const barDot = document.getElementById('app-bar-dot');
        const barText = document.getElementById('app-bar-status-text');
        const barSubtitle = document.getElementById('app-bar-subtitle');
        const barAutoBadge = document.getElementById('app-bar-auto-badge');
        const barActions = document.getElementById('app-bar-actions');

        if (barDot) {
            barDot.className = `app-status-dot ${status}`;
        }

        if (barAutoBadge) {
            if (autoStart) barAutoBadge.classList.remove('hidden');
            else barAutoBadge.classList.add('hidden');
        }

        let statusLabel = 'Aplicação Offline';
        let statusSub = 'Nenhum serviço em execução no momento';
        let statusBadgePill = '';

        switch (status) {
            case 'online':
                statusLabel = 'Aplicação Online';
                statusSub = `${activeCount}/${displayProcesses.length} processos ativos`;
                statusBadgePill = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Online</span>
                    </span>
                `;
                break;
            case 'starting':
                statusLabel = 'Aplicação Iniciando...';
                statusSub = 'Iniciando processos configurados...';
                statusBadgePill = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                        <span>Iniciando...</span>
                    </span>
                `;
                break;
            case 'partial':
                statusLabel = 'Aplicação Parcial';
                statusSub = `${activeCount}/${displayProcesses.length} processos ativos (alguns parados)`;
                statusBadgePill = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        <span class="w-2 h-2 rounded-full bg-orange-400"></span>
                        <span>Parcial</span>
                    </span>
                `;
                break;
            case 'offline':
            default:
                statusLabel = 'Aplicação Offline';
                statusSub = hasCommands ? `${displayProcesses.length} serviço(s) configurado(s) - pronto para iniciar` : 'Nenhum serviço configurado';
                statusBadgePill = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                        <span class="w-2 h-2 rounded-full bg-red-500"></span>
                        <span>Offline</span>
                    </span>
                `;
                break;
        }

        if (barText) barText.textContent = statusLabel;
        if (barSubtitle) barSubtitle.textContent = statusSub;

        if (barActions) {
            if (this.isAppActionLoading || status === 'starting') {
                barActions.innerHTML = `
                    <button type="button" disabled 
                        class="px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
                        <div class="spinner w-3 h-3 border-2"></div>
                        <span>Iniciando...</span>
                    </button>
                    <button type="button" onclick="Execution.stopApp()" 
                        class="px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold transition" title="Interromper">
                        <i data-lucide="square" class="w-3.5 h-3.5 fill-current"></i>
                    </button>
                `;
            } else if (status === 'online' || status === 'partial') {
                barActions.innerHTML = `
                    <button type="button" onclick="Execution.stopApp()" 
                        class="px-3.5 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition">
                        <i data-lucide="square" class="w-3.5 h-3.5 fill-current"></i>
                        <span>Desligar</span>
                    </button>
                `;
            } else {
                barActions.innerHTML = `
                    <button type="button" onclick="Execution.startApp()" 
                        class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition">
                        <i data-lucide="play-circle" class="w-3.5 h-3.5"></i>
                        <span>Ligar Aplicação</span>
                    </button>
                `;
            }
        }

        // 2. Update App Control Card (Left Panel)
        const cardBadges = document.getElementById('app-card-badges');
        const cardActions = document.getElementById('app-card-actions');
        const warningEl = document.getElementById('app-offline-warning');
        const processesSummaryEl = document.getElementById('app-processes-summary');
        const processesListEl = document.getElementById('app-processes-list');

        if (cardBadges) {
            cardBadges.innerHTML = `
                ${statusBadgePill}
                ${autoStart ? `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20" title="Auto-start ativo">
                        <i data-lucide="power" class="w-3 h-3"></i>
                        <span>Auto</span>
                    </span>
                ` : ''}
            `;
        }

        // Warning message: show only when offline and auto_start_app is false, AND project has app_commands
        if (warningEl) {
            if (hasCommands && status === 'offline' && !autoStart) {
                warningEl.classList.remove('hidden');
            } else {
                warningEl.classList.add('hidden');
            }
        }

        // Buttons in App Control Card
        if (cardActions) {
            if (this.isAppActionLoading || status === 'starting') {
                cardActions.innerHTML = `
                    <div class="flex items-center gap-2 w-full">
                        <button type="button" disabled 
                            class="flex-1 py-2.5 px-3 bg-amber-600/25 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2">
                            <div class="spinner w-3.5 h-3.5 border-2"></div>
                            <span>Iniciando Aplicação...</span>
                        </button>
                        <button type="button" onclick="Execution.stopApp()" 
                            class="py-2.5 px-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold transition" title="Parar">
                            <i data-lucide="square" class="w-3.5 h-3.5 fill-current"></i>
                        </button>
                    </div>
                `;
            } else if (status === 'online' || status === 'partial') {
                cardActions.innerHTML = `
                    <button type="button" onclick="Execution.stopApp()" 
                        class="w-full py-2.5 px-3 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 shadow-md shadow-red-600/20 transition">
                        <i data-lucide="square" class="w-3.5 h-3.5 fill-current"></i>
                        <span>⬛ Desligar Aplicação</span>
                    </button>
                `;
            } else {
                cardActions.innerHTML = `
                    <button type="button" onclick="Execution.startApp()" 
                        class="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition">
                        <i data-lucide="play-circle" class="w-4 h-4"></i>
                        <span>▶ Ligar Aplicação</span>
                    </button>
                `;
            }
        }

        // Process List
        if (processesSummaryEl) {
            processesSummaryEl.textContent = `${displayProcesses.length} ${displayProcesses.length === 1 ? 'processo' : 'processos'}`;
        }

        if (processesListEl) {
            if (displayProcesses.length === 0) {
                processesListEl.innerHTML = `
                    <div class="text-[11px] text-gray-500 p-2.5 bg-gray-900/60 border border-gray-800 rounded-lg text-center">
                        Nenhum comando de aplicação configurado neste projeto.
                    </div>
                `;
            } else {
                processesListEl.innerHTML = displayProcesses.map(proc => this.renderProcessItem(proc)).join('');
            }
        }

        // 3. Update App Console Header Status Dot & Text
        const appConsoleDot = document.getElementById('app-console-status-dot');
        const appConsoleStatusText = document.getElementById('app-console-status-text');
        if (appConsoleDot) {
            if (status === 'online') {
                appConsoleDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0 transition-colors';
                if (appConsoleStatusText) {
                    appConsoleStatusText.textContent = 'Online';
                    appConsoleStatusText.className = 'text-[11px] text-emerald-400 font-medium';
                }
            } else if (status === 'starting') {
                appConsoleDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse inline-block shrink-0 transition-colors';
                if (appConsoleStatusText) {
                    appConsoleStatusText.textContent = 'Iniciando...';
                    appConsoleStatusText.className = 'text-[11px] text-amber-400 font-medium';
                }
            } else if (status === 'partial') {
                appConsoleDot.className = 'w-2.5 h-2.5 rounded-full bg-orange-400 inline-block shrink-0 transition-colors';
                if (appConsoleStatusText) {
                    appConsoleStatusText.textContent = 'Parcial';
                    appConsoleStatusText.className = 'text-[11px] text-orange-400 font-medium';
                }
            } else {
                appConsoleDot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 inline-block shrink-0 transition-colors';
                if (appConsoleStatusText) {
                    appConsoleStatusText.textContent = 'Offline';
                    appConsoleStatusText.className = 'text-[11px] text-gray-400 font-medium';
                }
            }
        }

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Render a process list item.
     * @param {object} proc 
     */
    renderProcessItem(proc) {
        const status = (proc.status || 'stopped').toLowerCase();
        let dotClass = 'bg-gray-500';
        let statusText = 'Parado';
        let statusColor = 'text-gray-400';

        if (status === 'running' || status === 'online') {
            dotClass = 'bg-emerald-400';
            statusText = 'Em execução';
            statusColor = 'text-emerald-400 font-medium';
        } else if (status === 'starting') {
            dotClass = 'bg-amber-400 animate-pulse';
            statusText = 'Iniciando';
            statusColor = 'text-amber-400';
        } else if (status === 'failed' || status === 'error') {
            dotClass = 'bg-red-400';
            statusText = 'Falhou';
            statusColor = 'text-red-400 font-medium';
        }

        return `
            <div class="process-item p-2 bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-between gap-2 text-xs">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2 h-2 rounded-full ${dotClass} shrink-0"></span>
                    <span class="font-medium text-gray-200 truncate" title="${App.escapeHtml(proc.label || proc.command || 'Processo')}">
                        ${App.escapeHtml(proc.label || proc.command || 'Processo')}
                    </span>
                    ${proc.pid ? `<span class="font-mono text-[10px] text-gray-500 shrink-0">pid ${proc.pid}</span>` : ''}
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 uppercase font-mono">
                        ${App.escapeHtml(proc.type || 'daemon')}
                    </span>
                    <span class="text-[11px] ${statusColor}">
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
    },

    /**
     * Handle execution completion, fetch final data, and render summary banner.
     * @param {number|string} executionId 
     */
    async onExecutionFinished(executionId) {
        this.stopTimer();

        const cancelBtn = document.getElementById('btn-cancel-execution');
        if (cancelBtn) cancelBtn.classList.add('hidden');

        try {
            const data = await App.apiCall(`/api/executions/${executionId}`);
            this.currentExecution = data;
            this.updateStatusBadge(data.status);
            this.renderSummary(data);

            if (data.status === 'passed') {
                App.showToast(`Execução #${executionId} finalizada com sucesso!`, 'success');
            } else if (data.status === 'failed') {
                App.showToast(`Execução #${executionId} finalizada com falhas.`, 'error');
            }

            // Immediately refresh app status in UI
            if (this.currentProject) {
                await this.fetchAppStatus(this.currentProject.id, true);
            }
        } catch (err) {
            console.warn('[Execution] Error fetching final execution details:', err);
        }
    },

    /**
     * Render detailed summary card after execution finishes.
     * @param {object} exec 
     */
    renderSummary(exec) {
        const banner = document.getElementById('exec-summary-banner');
        if (!banner) return;

        const isPassed = exec.status === 'passed';
        const total = exec.total_tests || 0;
        const passed = exec.passed_tests || 0;
        const failed = exec.failed_tests || 0;
        const skipped = exec.skipped_tests || 0;
        const duration = App.formatDuration(exec.duration);

        banner.className = `p-4 rounded-xl border mb-3 ${
            isPassed 
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' 
                : 'bg-red-950/30 border-red-500/30 text-red-200'
        }`;

        banner.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isPassed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }">
                        <i data-lucide="${isPassed ? 'check-circle' : 'alert-circle'}" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold text-gray-100">
                            ${isPassed ? 'Execução Aprovada!' : 'Execução Concluída com Falhas'}
                        </h4>
                        <p class="text-xs text-gray-400 mt-0.5">
                            Duração total: <strong class="text-gray-200">${duration}</strong> | 
                            ${total} ${total === 1 ? 'teste' : 'testes'} executados
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2 self-end sm:self-auto">
                    <div class="flex items-center gap-2 text-xs mr-2">
                        <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                            ✓ ${passed}
                        </span>
                        <span class="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                            ✗ ${failed}
                        </span>
                        ${skipped > 0 ? `
                            <span class="px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-semibold">
                                ⊘ ${skipped}
                            </span>
                        ` : ''}
                    </div>

                    ${exec.report_path ? `
                        <a href="/reports/${App.escapeHtml(exec.report_path)}" target="_blank" 
                            class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 border border-gray-700 transition">
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                            <span>Ver Relatório</span>
                        </a>
                    ` : ''}

                    <button onclick="Execution.reRun(${exec.id})" 
                        class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition">
                        <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
                        <span>Repetir</span>
                    </button>
                </div>
            </div>
        `;

        banner.classList.remove('hidden');

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Hide summary banner.
     */
    hideSummary() {
        const banner = document.getElementById('exec-summary-banner');
        if (banner) {
            banner.classList.add('hidden');
            banner.innerHTML = '';
        }
    },

    /**
     * Cancel currently running execution.
     */
    async cancelCurrentExecution() {
        if (!this.currentExecution || this.currentExecution.status !== 'running') {
            App.showToast('Nenhuma execução ativa para cancelar', 'warning');
            return;
        }

        try {
            await App.apiCall(`/api/executions/${this.currentExecution.id}/cancel`, 'POST');
            App.showToast(`Solicitação de cancelamento enviada.`, 'info');
            this.appendTerminalLine(`[SISTEMA] Sinal de cancelamento enviado pelo usuário. Aguardando interrupção...`, 'log-warn');
        } catch (err) {
            console.error('[Execution] Cancel error:', err);
        }
    },

    /**
     * Load an existing execution by ID into the monitor panel.
     * @param {number|string} executionId 
     */
    async loadExecution(executionId) {
        try {
            const exec = await App.apiCall(`/api/executions/${executionId}`);
            this.currentExecution = exec;

            // Pre-select project
            if (exec.project_id) {
                await this.selectProject(exec.project_id);
            }

            this.updateStatusBadge(exec.status, `Execução #${exec.id}`);
            this.clearTerminal();

            if (exec.log_output) {
                this.processLogLine(exec.log_output);
            } else {
                this.appendTerminalLine(`[HISTÓRICO] Registros para a execução #${exec.id} carregados.`, 'log-dim');
            }

            if (exec.status === 'running') {
                const cancelBtn = document.getElementById('btn-cancel-execution');
                if (cancelBtn) cancelBtn.classList.remove('hidden');
                this.startTimer(exec.started_at);
                this.connectWebSocket(exec.id);
            } else {
                this.renderSummary(exec);
            }
        } catch (err) {
            console.error('[Execution] Failed to load execution detail:', err);
            App.showToast(`Não foi possível carregar a execução #${executionId}`, 'error');
        }
    },

    /**
     * Re-run an execution with the exact same parameters.
     * @param {number|string} executionId 
     */
    async reRun(executionId) {
        App.navigateTo('execution');
        try {
            const exec = await App.apiCall(`/api/executions/${executionId}`);
            if (exec.project_id) {
                await this.selectProject(exec.project_id);
            }

            // Set mode
            if (exec.mode) {
                const modeRadio = document.querySelector(`input[name="exec-mode"][value="${exec.mode}"]`);
                if (modeRadio) {
                    modeRadio.checked = true;
                    this.onModeChanged(exec.mode);
                }
            }

            // Set browser
            if (exec.browser) {
                const browserRadio = document.querySelector(`input[name="exec-browser"][value="${exec.browser}"]`);
                if (browserRadio) browserRadio.checked = true;
            }

            // Set headless & debug
            const headlessToggle = document.getElementById('exec-headless-toggle');
            if (headlessToggle) headlessToggle.checked = exec.headless ?? true;

            const debugToggle = document.getElementById('exec-debug-toggle');
            if (debugToggle) debugToggle.checked = exec.debug ?? false;

            // Set tags
            const tagsInput = document.getElementById('exec-tags-input');
            if (tagsInput && exec.tags) tagsInput.value = exec.tags;

            // Set specific tests
            if (exec.selected_tests && Array.isArray(exec.selected_tests)) {
                this.selectedTests = new Set(exec.selected_tests);
                this.renderTestsTree();
            }

            this.setupRadioStyles();
            App.showToast(`Parâmetros da execução #${executionId} carregados! Pronto para executar.`, 'info');
        } catch (err) {
            console.error('[Execution] Re-run setup error:', err);
        }
    },

    /**
     * Browse tests modal helper for Projects screen.
     * @param {number|string} projectId 
     */
    async browseTests(projectId) {
        App.showModal(
            'Arquivos de Teste do Projeto',
            `<div class="p-4 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-xs text-gray-400">Listando arquivos...</p></div>`,
            [
                { label: 'Fechar', closeOnClick: true },
                { 
                    label: 'Executar Neste Projeto', 
                    class: 'px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition',
                    onClick: () => {
                        App.navigateTo('execution', { projectId });
                    }
                }
            ]
        );

        try {
            const tests = await App.apiCall(`/api/projects/${projectId}/tests`);
            const content = document.getElementById('modal-content');
            if (!content) return;

            if (!tests || tests.length === 0) {
                content.innerHTML = `<p class="text-sm text-gray-400 text-center py-6">Nenhum arquivo de teste encontrado no diretório do projeto.</p>`;
                return;
            }

            content.innerHTML = `
                <div class="space-y-1.5 max-h-80 overflow-y-auto">
                    ${tests.map(t => `
                        <div class="p-2.5 bg-gray-950 border border-gray-800 rounded-lg flex items-center justify-between gap-3 text-xs">
                            <div class="flex items-center gap-2 min-w-0">
                                <i data-lucide="${t.type === 'robot' ? 'bot' : 'code-2'}" class="w-4 h-4 text-indigo-400 shrink-0"></i>
                                <span class="font-mono text-gray-200 truncate" title="${App.escapeHtml(t.path)}">
                                    ${App.escapeHtml(t.name || t.path)}
                                </span>
                            </div>
                            <span class="px-2 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 uppercase font-semibold shrink-0">
                                ${App.escapeHtml(t.type)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        } catch (err) {
            const content = document.getElementById('modal-content');
            if (content) {
                content.innerHTML = `<p class="text-sm text-red-400 p-3 bg-red-950/20 border border-red-900/30 rounded">Erro: ${App.escapeHtml(err.message)}</p>`;
            }
        }
    },

    /**
     * Update status badge in the execution panel header.
     * @param {string} status 
     * @param {string|null} customTitle 
     */
    updateStatusBadge(status, customTitle = null) {
        const badgeEl = document.getElementById('exec-status-badge');
        const titleEl = document.getElementById('exec-display-title');
        const subEl = document.getElementById('exec-display-subtitle');

        if (badgeEl) {
            badgeEl.innerHTML = App.renderBadge(status);
        }

        if (titleEl && customTitle) {
            titleEl.textContent = customTitle;
        }

        if (subEl) {
            if (status === 'running') {
                subEl.textContent = 'Streaming de logs em tempo real...';
            } else if (status === 'passed') {
                subEl.textContent = 'Todos os testes foram executados com sucesso.';
            } else if (status === 'failed') {
                subEl.textContent = 'Foram detectadas falhas durante a execução dos testes.';
            }
        }
    },

    /**
     * Start live elapsed timer ticker.
     * @param {string|Date|null} startTime 
     */
    startTimer(startTime = null) {
        this.stopTimer();

        const box = document.getElementById('exec-timer-box');
        const display = document.getElementById('exec-timer-display');
        if (box) box.classList.remove('hidden');

        const startTimestamp = startTime ? new Date(startTime).getTime() : Date.now();

        const updateTick = () => {
            const diffSeconds = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
            this.elapsedSeconds = diffSeconds;
            const min = String(Math.floor(diffSeconds / 60)).padStart(2, '0');
            const sec = String(diffSeconds % 60).padStart(2, '0');
            if (display) display.textContent = `${min}:${sec}`;
        };

        updateTick();
        this.timerInterval = setInterval(updateTick, 1000);
    },

    /**
     * Stop timer ticker.
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
};

window.Execution = Execution;
