/**
 * TestRunner Pro - History Module
 * Audit log of all test runs with filtering by project/status, pagination, and log viewer.
 */

const History = {
    executions: [],
    projects: [],
    selectedProjectId: '',
    selectedStatus: '',
    limit: 15,
    offset: 0,
    totalCount: 0,

    /**
     * Load history view with data from API.
     * @param {object} params 
     */
    async load(params = {}) {
        const container = document.getElementById('page-history');
        if (!container) return;

        if (params.projectId) {
            this.selectedProjectId = String(params.projectId);
        }
        if (params.status) {
            this.selectedStatus = String(params.status);
        }

        // Fetch projects for filter dropdown if not yet fetched
        try {
            this.projects = await App.apiCall('/api/projects');
        } catch (err) {
            console.warn('[History] Could not load projects list for filter:', err);
        }

        await this.fetchExecutions();
    },

    /**
     * Query API for executions with active filters.
     */
    async fetchExecutions() {
        const container = document.getElementById('page-history');
        if (!container) return;

        container.innerHTML = this.renderSkeleton();

        const queryParams = new URLSearchParams({
            limit: this.limit,
            offset: this.offset
        });

        if (this.selectedProjectId) queryParams.set('project_id', this.selectedProjectId);
        if (this.selectedStatus) queryParams.set('status', this.selectedStatus);

        try {
            const data = await App.apiCall(`/api/executions?${queryParams.toString()}`);
            this.executions = Array.isArray(data) ? data : (data.items || []);
            this.totalCount = data.total !== undefined ? data.total : this.executions.length;
            this.render();
        } catch (err) {
            console.error('[History] Error fetching executions:', err);
            container.innerHTML = `
                <div class="p-8 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <i data-lucide="alert-triangle" class="w-12 h-12 text-amber-500 mx-auto mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-200">Não foi possível carregar o histórico</h3>
                    <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">${App.escapeHtml(err.message)}</p>
                    <button onclick="History.fetchExecutions()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 transition">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Tentar Novamente
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    },

    /**
     * Render the History UI.
     */
    render() {
        const container = document.getElementById('page-history');
        if (!container) return;

        const projectNameMap = {};
        this.projects.forEach(p => { projectNameMap[p.id] = p.name; });

        container.innerHTML = `
            <!-- Filters & Controls Bar -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div class="flex flex-wrap items-center gap-3 flex-1">
                    <!-- Project Filter -->
                    <div class="min-w-[180px]">
                        <label class="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Filtrar por Projeto</label>
                        <select id="history-filter-project" onchange="History.selectedProjectId = this.value; History.offset = 0; History.fetchExecutions();" 
                            class="w-full bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-200 px-3 py-2 focus:outline-none focus:border-indigo-500">
                            <option value="">Todos os Projetos</option>
                            ${this.projects.map(p => `
                                <option value="${p.id}" ${String(this.selectedProjectId) === String(p.id) ? 'selected' : ''}>
                                    ${App.escapeHtml(p.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Status Filter -->
                    <div class="min-w-[160px]">
                        <label class="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Filtrar por Status</label>
                        <select id="history-filter-status" onchange="History.selectedStatus = this.value; History.offset = 0; History.fetchExecutions();" 
                            class="w-full bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-200 px-3 py-2 focus:outline-none focus:border-indigo-500">
                            <option value="">Todos os Status</option>
                            <option value="running" ${this.selectedStatus === 'running' ? 'selected' : ''}>Em Execução</option>
                            <option value="passed" ${this.selectedStatus === 'passed' ? 'selected' : ''}>Aprovado</option>
                            <option value="failed" ${this.selectedStatus === 'failed' ? 'selected' : ''}>Falhou</option>
                            <option value="error" ${this.selectedStatus === 'error' ? 'selected' : ''}>Erro</option>
                            <option value="cancelled" ${this.selectedStatus === 'cancelled' ? 'selected' : ''}>Cancelado</option>
                        </select>
                    </div>
                </div>

                <div class="flex items-center gap-2 self-end md:self-auto">
                    <button onclick="History.fetchExecutions()" class="p-2 bg-gray-950 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-400 hover:text-white transition" title="Recarregar">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    </button>
                    <button onclick="App.navigateTo('execution')" 
                        class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition">
                        <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
                        <span>Nova Execução</span>
                    </button>
                </div>
            </div>

            <!-- Executions Table -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-md">
                ${this.executions.length === 0 ? `
                    <div class="p-12 text-center">
                        <div class="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3 text-gray-500">
                            <i data-lucide="history" class="w-6 h-6"></i>
                        </div>
                        <h4 class="text-sm font-semibold text-gray-200">Nenhuma execução encontrada</h4>
                        <p class="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                            ${this.selectedProjectId || this.selectedStatus ? 'Tente alterar os filtros acima.' : 'Nenhum teste foi executado ainda.'}
                        </p>
                    </div>
                ` : `
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-gray-950/60 text-gray-400 font-semibold border-b border-gray-800 uppercase tracking-wider">
                                <tr>
                                    <th class="px-5 py-3.5">ID</th>
                                    <th class="px-5 py-3.5">Projeto</th>
                                    <th class="px-5 py-3.5">Configuração</th>
                                    <th class="px-5 py-3.5">Status</th>
                                    <th class="px-5 py-3.5">Métricas</th>
                                    <th class="px-5 py-3.5">Duração</th>
                                    <th class="px-5 py-3.5">Data / Hora</th>
                                    <th class="px-5 py-3.5 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-800">
                                ${this.executions.map(exec => {
                                    const projectName = projectNameMap[exec.project_id] || `Projeto #${exec.project_id}`;
                                    const total = exec.total_tests || 0;
                                    const passed = exec.passed_tests || 0;
                                    const failed = exec.failed_tests || 0;

                                    return `
                                        <tr class="hover:bg-gray-800/40 transition">
                                            <td class="px-5 py-3.5 font-mono text-gray-300 font-semibold">
                                                #${exec.id}
                                            </td>
                                            <td class="px-5 py-3.5">
                                                <div class="font-medium text-gray-200">${App.escapeHtml(projectName)}</div>
                                                <span class="text-[10px] text-gray-400 font-mono uppercase">${App.escapeHtml(exec.test_type || '')}</span>
                                            </td>
                                            <td class="px-5 py-3.5">
                                                <div class="flex items-center gap-1.5 text-gray-300">
                                                    <span class="capitalize text-gray-300">${exec.mode === 'full_suite' ? 'Completa' : (exec.mode === 'specific_tests' ? 'Específico' : (exec.mode === 'by_tag' ? 'Tags' : exec.mode))}</span>
                                                    <span class="text-gray-600">•</span>
                                                    <span class="uppercase text-[11px] font-mono text-gray-400">${App.escapeHtml(exec.browser || 'chromium')}</span>
                                                    ${exec.headless ? `<span class="text-[10px] text-gray-500 font-mono">[H]</span>` : ''}
                                                </div>
                                            </td>
                                            <td class="px-5 py-3.5">
                                                ${App.renderBadge(exec.status)}
                                            </td>
                                            <td class="px-5 py-3.5">
                                                <div class="flex items-center gap-1.5 font-mono text-[11px]">
                                                    <span class="text-emerald-400 font-semibold" title="Aprovados">✓${passed}</span>
                                                    <span class="text-red-400 font-semibold" title="Falhas">✗${failed}</span>
                                                    <span class="text-gray-500" title="Total">(${total})</span>
                                                </div>
                                            </td>
                                            <td class="px-5 py-3.5 text-gray-300 font-mono">
                                                ${App.formatDuration(exec.duration)}
                                            </td>
                                            <td class="px-5 py-3.5 text-gray-400 whitespace-nowrap">
                                                ${App.formatDate(exec.started_at || exec.created_at)}
                                            </td>
                                            <td class="px-5 py-3.5 text-right whitespace-nowrap">
                                                <div class="inline-flex items-center gap-1.5">
                                                    <button onclick="History.showDetail(${exec.id})" 
                                                        class="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white rounded border border-gray-700 text-[11px] font-medium transition inline-flex items-center gap-1"
                                                        title="Ver Detalhes e Logs">
                                                        <i data-lucide="file-text" class="w-3 h-3"></i>
                                                        <span>Logs</span>
                                                    </button>
                                                    <button onclick="Execution.reRun(${exec.id})" 
                                                        class="p-1 text-gray-400 hover:text-indigo-400 rounded transition"
                                                        title="Repetir Execução">
                                                        <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Pagination Controls -->
                    <div class="px-5 py-3 bg-gray-950/60 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
                        <span>Exibindo ${this.executions.length} registro(s)</span>
                        <div class="flex items-center gap-2">
                            <button onclick="History.prevPage()" ${this.offset === 0 ? 'disabled' : ''} 
                                class="px-3 py-1 bg-gray-900 border border-gray-800 rounded text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
                                Anterior
                            </button>
                            <button onclick="History.nextPage()" ${this.executions.length < this.limit ? 'disabled' : ''} 
                                class="px-3 py-1 bg-gray-900 border border-gray-800 rounded text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
                                Próxima
                            </button>
                        </div>
                    </div>
                `}
            </div>
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Show execution detail modal with full output and stats.
     * @param {number|string} executionId 
     */
    async showDetail(executionId) {
        App.showModal(
            `Detalhes da Execução #${executionId}`,
            `<div class="p-8 text-center"><div class="spinner mx-auto mb-2"></div><p class="text-xs text-gray-400">Carregando detalhes...</p></div>`,
            [
                { label: 'Fechar', closeOnClick: true },
                {
                    label: 'Abrir no Terminal Principal',
                    class: 'px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition',
                    onClick: () => {
                        App.navigateTo('execution', { executionId });
                    }
                }
            ]
        );

        try {
            const exec = await App.apiCall(`/api/executions/${executionId}`);
            const content = document.getElementById('modal-content');
            if (!content) return;

            content.innerHTML = `
                <div class="space-y-4 text-xs">
                    <!-- Top stats grid -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div class="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
                            <span class="text-gray-400 block text-[10px] uppercase font-semibold">Status</span>
                            <div class="mt-1">${App.renderBadge(exec.status)}</div>
                        </div>
                        <div class="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
                            <span class="text-gray-400 block text-[10px] uppercase font-semibold">Duração</span>
                            <span class="text-sm font-bold font-mono text-gray-200 mt-1 block">${App.formatDuration(exec.duration)}</span>
                        </div>
                        <div class="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
                            <span class="text-gray-400 block text-[10px] uppercase font-semibold">Aprovados</span>
                            <span class="text-sm font-bold font-mono text-emerald-400 mt-1 block">${exec.passed_tests || 0}</span>
                        </div>
                        <div class="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
                            <span class="text-gray-400 block text-[10px] uppercase font-semibold">Falhas</span>
                            <span class="text-sm font-bold font-mono text-red-400 mt-1 block">${exec.failed_tests || 0}</span>
                        </div>
                    </div>

                    <!-- Meta specs -->
                    <div class="bg-gray-950 p-3 rounded-lg border border-gray-800 text-gray-300 space-y-1">
                        <div><strong>Projeto ID:</strong> ${exec.project_id} (${App.escapeHtml(exec.test_type || '')})</div>
                        <div><strong>Modo:</strong> ${App.escapeHtml(exec.mode)} | <strong>Navegador:</strong> ${App.escapeHtml(exec.browser)} | <strong>Headless:</strong> ${exec.headless}</div>
                        ${exec.tags ? `<div><strong>Tags:</strong> ${App.escapeHtml(exec.tags)}</div>` : ''}
                        <div><strong>Iniciado em:</strong> ${App.formatDate(exec.started_at)} | <strong>Finalizado em:</strong> ${App.formatDate(exec.finished_at)}</div>
                    </div>

                    <!-- Log console preview -->
                    <div>
                        <div class="flex items-center justify-between mb-1 text-gray-400 font-semibold">
                            <span>Logs Registrados:</span>
                            <button type="button" onclick="App.copyToClipboard(document.getElementById('modal-logs-box')?.innerText, 'Logs')" 
                                class="text-indigo-400 hover:text-indigo-300 font-normal">Copiar Logs</button>
                        </div>
                        <div id="modal-logs-box" class="bg-black border border-gray-800 rounded-lg p-3 font-mono text-[11px] max-h-60 overflow-y-auto text-gray-200 whitespace-pre-wrap">
                            ${App.escapeHtml(exec.log_output || 'Nenhum log gravado.')}
                        </div>
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        } catch (err) {
            const content = document.getElementById('modal-content');
            if (content) {
                content.innerHTML = `<p class="text-sm text-red-400 p-3">Erro ao carregar detalhes: ${App.escapeHtml(err.message)}</p>`;
            }
        }
    },

    nextPage() {
        this.offset += this.limit;
        this.fetchExecutions();
    },

    prevPage() {
        this.offset = Math.max(0, this.offset - this.limit);
        this.fetchExecutions();
    },

    renderSkeleton() {
        return `
            <div class="animate-pulse space-y-4">
                <div class="h-16 bg-gray-900 rounded-xl"></div>
                <div class="h-72 bg-gray-900 rounded-xl"></div>
            </div>
        `;
    }
};

window.History = History;
