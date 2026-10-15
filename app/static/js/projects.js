/**
 * TestRunner Pro - Projects Module
 * Manages project registration, editing, environment variables, and execution launches.
 */

const Projects = {
    projects: [],
    filterType: 'all',
    searchQuery: '',

    /**
     * Load all projects from API.
     */
    async load() {
        const container = document.getElementById('page-projects');
        if (!container) return;

        if (!this.projects || this.projects.length === 0) {
            container.innerHTML = this.renderSkeleton();
        }

        try {
            const data = await App.apiCall('/api/projects');
            this.projects = Array.isArray(data) ? data : [];
            this.render();
        } catch (err) {
            console.error('[Projects] Error loading projects:', err);
            container.innerHTML = `
                <div class="p-8 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <i data-lucide="alert-triangle" class="w-12 h-12 text-amber-500 mx-auto mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-200">Não foi possível carregar os projetos</h3>
                    <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">${App.escapeHtml(err.message)}</p>
                    <button onclick="Projects.load()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 transition">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Tentar Novamente
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    },

    /**
     * Render projects list and controls.
     */
    render() {
        const container = document.getElementById('page-projects');
        if (!container) return;

        // Apply search & type filters
        const filtered = this.projects.filter(p => {
            const matchesType = this.filterType === 'all' || p.test_type === this.filterType;
            const matchesSearch = !this.searchQuery || 
                p.name.toLowerCase().includes(this.searchQuery.toLowerCase()) || 
                (p.description && p.description.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
                p.path.toLowerCase().includes(this.searchQuery.toLowerCase());
            return matchesType && matchesSearch;
        });

        container.innerHTML = `
            <!-- Header bar with search and actions -->
            <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-6">
                <!-- Filters & Search -->
                <div class="flex flex-1 items-center gap-3 max-w-xl">
                    <div class="relative flex-1">
                        <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                        <input type="text" id="project-search-input" value="${App.escapeHtml(this.searchQuery)}" 
                            placeholder="Buscar projetos por nome, caminho ou descrição..." 
                            class="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs sm:text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
                            oninput="Projects.searchQuery = this.value; Projects.render();">
                    </div>

                    <select id="project-type-filter" 
                        class="bg-gray-900 border border-gray-800 rounded-lg text-xs sm:text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-indigo-500 transition"
                        onchange="Projects.filterType = this.value; Projects.render();">
                        <option value="all" ${this.filterType === 'all' ? 'selected' : ''}>Todos os Tipos</option>
                        <option value="robot" ${this.filterType === 'robot' ? 'selected' : ''}>Robot Framework</option>
                        <option value="playwright" ${this.filterType === 'playwright' ? 'selected' : ''}>Playwright</option>
                    </select>
                </div>

                <!-- Add Button -->
                <div class="flex items-center gap-2">
                    <button onclick="Projects.load()" class="p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-300 hover:text-white transition" title="Recarregar">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    </button>
                    <button onclick="Projects.showAddForm()" 
                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium rounded-lg inline-flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition whitespace-nowrap">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                        <span>Novo Projeto</span>
                    </button>
                </div>
            </div>

            <!-- Projects Grid -->
            ${filtered.length === 0 ? `
                <div class="p-12 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <div class="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3 text-gray-500">
                        <i data-lucide="folder-kanban" class="w-6 h-6"></i>
                    </div>
                    <h4 class="text-base font-semibold text-gray-200">Nenhum projeto encontrado</h4>
                    <p class="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                        ${this.searchQuery || this.filterType !== 'all' 
                            ? 'Nenhum resultado corresponde aos filtros aplicados.' 
                            : 'Cadastre seu primeiro diretório de testes para começar a automação.'}
                    </p>
                    ${!this.searchQuery && this.filterType === 'all' ? `
                        <button onclick="Projects.showAddForm()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 transition">
                            <i data-lucide="plus" class="w-4 h-4"></i> Cadastrar Projeto
                        </button>
                    ` : `
                        <button onclick="Projects.searchQuery = ''; Projects.filterType = 'all'; Projects.render();" class="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg inline-flex items-center gap-2 transition">
                            Limpar Filtros
                        </button>
                    `}
                </div>
            ` : `
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    ${filtered.map(project => this.renderProjectCard(project)).join('')}
                </div>
            `}
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Render a single project card.
     * @param {object} project 
     */
    renderProjectCard(project) {
        const isRobot = (project.test_type || '').toLowerCase() === 'robot';
        const browser = project.browser || 'chromium';
        const envCount = project.env_vars ? Object.keys(project.env_vars).length : 0;
        const appCommands = Array.isArray(project.app_commands) ? project.app_commands : [];
        const hasAppCommands = appCommands.length > 0;
        const autoStart = !!project.auto_start_app;

        return `
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 hover-card flex flex-col justify-between">
                <div>
                    <!-- Card Header: Title & Badges -->
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-base font-bold text-gray-100 truncate" title="${App.escapeHtml(project.name)}">
                                ${App.escapeHtml(project.name)}
                            </h3>
                            <div class="flex items-center flex-wrap gap-2 mt-1">
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    isRobot ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }">
                                    <i data-lucide="${isRobot ? 'bot' : 'code-2'}" class="w-3 h-3"></i>
                                    ${isRobot ? 'Robot Framework' : 'Playwright'}
                                </span>
                                <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800 text-gray-300 border border-gray-700/60 uppercase">
                                    ${App.escapeHtml(browser)}
                                </span>
                                ${hasAppCommands ? `
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" title="${appCommands.length} comando(s) de inicialização configurado(s)">
                                        <i data-lucide="server" class="w-3 h-3"></i>
                                        App Config ✓
                                    </span>
                                ` : ''}
                                ${autoStart ? `
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20" title="Inicialização automática antes dos testes ativada">
                                        <i data-lucide="power" class="w-3 h-3"></i>
                                        Auto-start
                                    </span>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Dropdown or quick action -->
                        <div class="flex items-center gap-1">
                            <button onclick="Projects.showEditForm(${JSON.stringify(project).replace(/"/g, '&quot;')})" 
                                class="p-1.5 text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition" 
                                title="Editar Projeto">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="Projects.delete(${project.id}, '${App.escapeHtml(project.name)}')" 
                                class="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition" 
                                title="Excluir Projeto">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Description -->
                    <p class="text-xs text-gray-400 line-clamp-2 mb-4 leading-relaxed min-h-[32px]">
                        ${App.escapeHtml(project.description || 'Sem descrição cadastrada.')}
                    </p>

                    <!-- Path snippet -->
                    <div class="bg-gray-950/80 border border-gray-800/80 rounded-lg p-2.5 mb-4 flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                            <i data-lucide="folder" class="w-3.5 h-3.5 text-gray-500 shrink-0"></i>
                            <span class="font-mono text-[11px] text-gray-300 truncate" title="${App.escapeHtml(project.path)}">
                                ${App.escapeHtml(project.path)}
                            </span>
                        </div>
                        <button onclick="App.copyToClipboard('${App.escapeHtml(project.path)}', 'Caminho')" 
                            class="text-gray-500 hover:text-gray-300 p-1 shrink-0 transition" title="Copiar caminho">
                            <i data-lucide="copy" class="w-3 h-3"></i>
                        </button>
                    </div>

                    <!-- Meta info tags -->
                    <div class="flex items-center flex-wrap gap-3 text-[11px] text-gray-500 mb-5">
                        <span class="inline-flex items-center gap-1">
                            <i data-lucide="variable" class="w-3 h-3"></i>
                            ${envCount} ${envCount === 1 ? 'variável' : 'variáveis'} de ambiente
                        </span>
                        ${hasAppCommands ? `
                            <span>•</span>
                            <span class="inline-flex items-center gap-1 text-cyan-400">
                                <i data-lucide="terminal" class="w-3 h-3"></i>
                                ${appCommands.length} ${appCommands.length === 1 ? 'comando app' : 'comandos app'}
                            </span>
                        ` : ''}
                        <span>•</span>
                        <span>Atualizado em ${App.formatDate(project.updated_at || project.created_at)}</span>
                    </div>
                </div>

                <!-- Action Footer -->
                <div class="pt-3 border-t border-gray-800/80 flex items-center justify-between gap-2">
                    <button onclick="Execution.browseTests(${project.id})" 
                        class="text-xs text-gray-400 hover:text-gray-200 px-2.5 py-1.5 rounded hover:bg-gray-800 transition inline-flex items-center gap-1.5">
                        <i data-lucide="file-code" class="w-3.5 h-3.5"></i>
                        <span>Ver Arquivos</span>
                    </button>
                    <button onclick="App.navigateTo('execution', { projectId: ${project.id} })" 
                        class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition">
                        <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
                        <span>Executar</span>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Show modal to add a new project.
     */
    showAddForm() {
        this.renderFormModal('Cadastrar Novo Projeto', null);
    },

    /**
     * Show modal to edit an existing project.
     * @param {object} project 
     */
    showEditForm(project) {
        this.renderFormModal('Editar Projeto', project);
    },

    /**
     * Render the project create/edit form inside the modal.
     * @param {string} modalTitle 
     * @param {object|null} project 
     */
    renderFormModal(modalTitle, project = null) {
        const isEditing = !!project;
        const name = project?.name || '';
        const path = project?.path || '';
        const testType = project?.test_type || 'robot';
        const description = project?.description || '';
        const browser = project?.browser || 'chromium';
        const envVars = project?.env_vars || {};
        const appCommands = Array.isArray(project?.app_commands) ? project.app_commands : [];
        const autoStartApp = !!project?.auto_start_app;

        const contentHtml = `
            <form id="project-form" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                        Nome do Projeto <span class="text-red-400">*</span>
                    </label>
                    <input type="text" id="project-form-name" required value="${App.escapeHtml(name)}"
                        placeholder="Ex: E2E Playwright Portal Web" 
                        class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition">
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                            Tipo de Teste <span class="text-red-400">*</span>
                        </label>
                        <select id="project-form-type" required
                            class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                            <option value="robot" ${testType === 'robot' ? 'selected' : ''}>Robot Framework (.robot)</option>
                            <option value="playwright" ${testType === 'playwright' ? 'selected' : ''}>Playwright (.spec.js, .py)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                            Navegador Padrão
                        </label>
                        <select id="project-form-browser"
                            class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                            <option value="chromium" ${browser === 'chromium' ? 'selected' : ''}>Chromium (Google Chrome)</option>
                            <option value="firefox" ${browser === 'firefox' ? 'selected' : ''}>Mozilla Firefox</option>
                            <option value="webkit" ${browser === 'webkit' ? 'selected' : ''}>WebKit (Safari)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                        Caminho Absoluto dos Testes <span class="text-red-400">*</span>
                    </label>
                    <div class="relative">
                        <i data-lucide="folder" class="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"></i>
                        <input type="text" id="project-form-path" required value="${App.escapeHtml(path)}"
                            placeholder="/caminho/completo/para/os/testes" 
                            class="w-full pl-9 pr-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition">
                    </div>
                    <p class="text-[11px] text-gray-500 mt-1">Diretório onde os arquivos de teste estão salvos na máquina local.</p>
                </div>

                <div>
                    <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                        Descrição
                    </label>
                    <textarea id="project-form-desc" rows="2" 
                        placeholder="Objetivo da suíte, ambiente de homologação, regras..." 
                        class="w-full px-3.5 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition">${App.escapeHtml(description)}</textarea>
                </div>

                <!-- Environment Variables Section -->
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                            Variáveis de Ambiente (Opcional)
                        </label>
                        <button type="button" onclick="Projects.addEnvRow()" 
                            class="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1">
                            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Adicionar Variável
                        </button>
                    </div>

                    <div id="env-vars-container" class="space-y-2 max-h-36 overflow-y-auto pr-1">
                        <!-- Populated dynamically -->
                    </div>
                </div>

                <!-- Application Startup Commands Section -->
                <div class="pt-3 border-t border-gray-800/80">
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                            <i data-lucide="server" class="w-3.5 h-3.5 text-indigo-400"></i>
                            <span>Comandos de Inicialização da Aplicação</span>
                        </label>
                        <button type="button" onclick="Projects.addCommandRow()" 
                            class="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1">
                            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Adicionar Comando
                        </button>
                    </div>

                    <!-- Auto-start switch -->
                    <div class="flex items-center justify-between p-3 mb-3 bg-gray-950/70 border border-gray-800 rounded-lg">
                        <div>
                            <span class="text-xs font-semibold text-gray-200 block">Iniciar aplicação automaticamente antes dos testes</span>
                            <span class="text-[11px] text-gray-400">Liga os serviços configurados antes da execução se estiverem offline</span>
                        </div>
                        <label class="toggle-switch shrink-0 ml-3">
                            <input type="checkbox" id="project-form-auto-start" ${autoStartApp ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <!-- Dynamic Commands List -->
                    <div id="app-commands-container" class="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                        <!-- Populated dynamically -->
                    </div>
                </div>
            </form>
        `;

        const actions = [
            {
                label: 'Cancelar',
                class: 'px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-sm font-medium transition',
                closeOnClick: true
            },
            {
                label: isEditing ? 'Salvar Alterações' : 'Cadastrar Projeto',
                class: 'px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium shadow-md shadow-indigo-600/30 transition',
                closeOnClick: false,
                onClick: async () => {
                    const form = document.getElementById('project-form');
                    if (!form || !form.reportValidity()) return false;

                    const nameInput = document.getElementById('project-form-name').value.trim();
                    const pathInput = document.getElementById('project-form-path').value.trim();
                    const typeInput = document.getElementById('project-form-type').value;
                    const browserInput = document.getElementById('project-form-browser').value;
                    const descInput = document.getElementById('project-form-desc').value.trim();

                    // Parse Env Vars
                    const envObj = {};
                    document.querySelectorAll('.env-var-row').forEach(row => {
                        const key = row.querySelector('.env-key')?.value.trim();
                        const val = row.querySelector('.env-value')?.value.trim();
                        if (key) {
                            envObj[key] = val || '';
                        }
                    });

                    // Parse App Commands
                    const commandsList = [];
                    document.querySelectorAll('.app-command-card').forEach(card => {
                        const labelInput = card.querySelector('.cmd-label')?.value.trim() || '';
                        const cmdInput = card.querySelector('.cmd-command')?.value.trim() || '';
                        const cwdInput = card.querySelector('.cmd-cwd')?.value.trim() || '';
                        const typeInput = card.querySelector('.cmd-type')?.value || 'daemon';
                        const waitInput = parseInt(card.querySelector('.cmd-wait')?.value || '3', 10);

                        if (cmdInput) {
                            commandsList.push({
                                label: labelInput || cmdInput,
                                command: cmdInput,
                                cwd: cwdInput || null,
                                type: typeInput,
                                wait_seconds: isNaN(waitInput) ? 3 : waitInput
                            });
                        }
                    });

                    const autoStartValue = document.getElementById('project-form-auto-start')?.checked ?? false;

                    const payload = {
                        name: nameInput,
                        path: pathInput,
                        test_type: typeInput,
                        browser: browserInput,
                        description: descInput || null,
                        env_vars: envObj,
                        app_commands: commandsList,
                        auto_start_app: autoStartValue
                    };

                    try {
                        if (isEditing) {
                            await App.apiCall(`/api/projects/${project.id}`, 'PUT', payload);
                            App.showToast('Projeto atualizado com sucesso!', 'success');
                        } else {
                            await App.apiCall('/api/projects', 'POST', payload);
                            App.showToast('Projeto cadastrado com sucesso!', 'success');
                        }
                        App.hideModal();
                        await Projects.load();
                    } catch (err) {
                        console.error('[Projects] Save error:', err);
                    }
                }
            }
        ];

        App.showModal(modalTitle, contentHtml, actions);

        // Populate initial env vars
        const envContainer = document.getElementById('env-vars-container');
        if (envContainer) {
            const keys = Object.keys(envVars);
            if (keys.length > 0) {
                keys.forEach(k => this.addEnvRow(k, envVars[k]));
            } else {
                this.addEnvRow('', '');
            }
        }

        // Populate initial app startup commands
        const cmdContainer = document.getElementById('app-commands-container');
        if (cmdContainer) {
            if (appCommands.length > 0) {
                appCommands.forEach(cmd => this.addCommandRow(cmd));
            }
        }
    },

    /**
     * Add an application startup command card in the form modal.
     * @param {object} cmd - { label, command, cwd, type, wait_seconds }
     */
    addCommandRow(cmd = {}) {
        const container = document.getElementById('app-commands-container');
        if (!container) return;

        const label = cmd.label || '';
        const command = cmd.command || '';
        const cwd = cmd.cwd || '';
        const type = cmd.type || 'daemon';
        const waitSeconds = cmd.wait_seconds !== undefined ? cmd.wait_seconds : 3;

        const card = document.createElement('div');
        card.className = 'app-command-card bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2.5 relative transition hover:border-gray-700';
        card.innerHTML = `
            <div class="flex items-center justify-between gap-2 border-b border-gray-800/60 pb-1.5">
                <span class="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <i data-lucide="terminal" class="w-3.5 h-3.5 text-indigo-400"></i>
                    <span>Comando de Inicialização</span>
                </span>
                <button type="button" onclick="this.closest('.app-command-card').remove()" 
                    class="p-1 text-gray-500 hover:text-red-400 rounded transition" title="Remover comando">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                    <label class="block text-[10px] font-semibold uppercase text-gray-400 mb-1">
                        Rótulo / Nome
                    </label>
                    <input type="text" class="cmd-label w-full px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" 
                        placeholder="Ex: Web Server, API Backend" value="${App.escapeHtml(label)}">
                </div>
                <div>
                    <label class="block text-[10px] font-semibold uppercase text-gray-400 mb-1">
                        Tipo de Processo
                    </label>
                    <select class="cmd-type w-full px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 focus:outline-none focus:border-indigo-500">
                        <option value="daemon" ${type === 'daemon' ? 'selected' : ''}>daemon (processo contínuo: dev server)</option>
                        <option value="oneshot" ${type === 'oneshot' ? 'selected' : ''}>oneshot (executa e finaliza: docker compose)</option>
                    </select>
                </div>
            </div>

            <div>
                <label class="block text-[10px] font-semibold uppercase text-gray-400 mb-1">
                    Comando <span class="text-red-400">*</span>
                </label>
                <input type="text" required class="cmd-command w-full px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" 
                    placeholder="Ex: npm run dev, yarn start, docker compose up -d" value="${App.escapeHtml(command)}">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                    <label class="block text-[10px] font-semibold uppercase text-gray-400 mb-1">
                        Diretório de Trabalho (CWD)
                    </label>
                    <input type="text" class="cmd-cwd w-full px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" 
                        placeholder="Opcional (padrão: raiz do projeto)" value="${App.escapeHtml(cwd)}">
                </div>
                <div>
                    <label class="block text-[10px] font-semibold uppercase text-gray-400 mb-1">
                        Tempo de Espera (segundos)
                    </label>
                    <input type="number" min="0" max="120" class="cmd-wait w-full px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" 
                        value="${waitSeconds}">
                </div>
            </div>
        `;

        container.appendChild(card);
        if (window.lucide) lucide.createIcons();
    },

    /**
     * Add a key-value row for environment variables in the form modal.
     * @param {string} key 
     * @param {string} val 
     */
    addEnvRow(key = '', val = '') {
        const container = document.getElementById('env-vars-container');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'env-var-row flex items-center gap-2';
        row.innerHTML = `
            <input type="text" placeholder="CHAVE (ex: BASE_URL)" value="${App.escapeHtml(key)}" 
                class="env-key flex-1 px-3 py-1.5 bg-gray-950 border border-gray-800 rounded-md text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500">
            <span class="text-gray-600 text-xs">=</span>
            <input type="text" placeholder="VALOR (ex: https://app.dev)" value="${App.escapeHtml(val)}" 
                class="env-value flex-1 px-3 py-1.5 bg-gray-950 border border-gray-800 rounded-md text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500">
            <button type="button" onclick="this.closest('.env-var-row').remove()" 
                class="p-1.5 text-gray-500 hover:text-red-400 rounded transition" title="Remover">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
        `;
        container.appendChild(row);

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Prompt confirmation and delete project.
     * @param {number} projectId 
     * @param {string} projectName 
     */
    delete(projectId, projectName) {
        App.showModal(
            'Confirmar Exclusão',
            `
                <div class="space-y-3">
                    <p class="text-sm text-gray-300">
                        Tem certeza que deseja remover o projeto <strong class="text-white">${App.escapeHtml(projectName)}</strong>?
                    </p>
                    <p class="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/40 p-3 rounded-lg">
                        Atenção: Os arquivos de teste no disco NÃO serão apagados, mas o registro e configurações no TestRunner Pro serão excluídos.
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
                    label: 'Sim, Excluir',
                    class: 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium shadow-md shadow-red-600/30 transition',
                    closeOnClick: false,
                    onClick: async () => {
                        try {
                            await App.apiCall(`/api/projects/${projectId}`, 'DELETE');
                            App.showToast('Projeto removido com sucesso!', 'success');
                            App.hideModal();
                            await Projects.load();
                        } catch (err) {
                            console.error('[Projects] Delete error:', err);
                        }
                    }
                }
            ]
        );
    },

    /**
     * Skeleton loader for projects.
     */
    renderSkeleton() {
        return `
            <div class="animate-pulse">
                <div class="h-10 bg-gray-900 rounded-lg w-full mb-6"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    <div class="h-64 bg-gray-900 rounded-xl"></div>
                    <div class="h-64 bg-gray-900 rounded-xl"></div>
                    <div class="h-64 bg-gray-900 rounded-xl"></div>
                </div>
            </div>
        `;
    }
};

window.Projects = Projects;
