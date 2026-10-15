/**
 * TestRunner Pro - Dashboard Module
 * Displays execution metrics, pass rates, recent executions, and quick action shortcuts.
 */

const Dashboard = {
    stats: null,
    refreshInterval: null,

    /**
     * Load dashboard data from API.
     */
    async load() {
        const container = document.getElementById('page-dashboard');
        if (!container) return;

        // Render skeleton while loading if initial load
        if (!this.stats) {
            container.innerHTML = this.renderSkeleton();
        }

        try {
            const stats = await App.apiCall('/api/executions/stats');
            this.stats = stats;
            this.render(stats);
        } catch (err) {
            console.error('[Dashboard] Error loading stats:', err);
            container.innerHTML = `
                <div class="p-8 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <i data-lucide="alert-triangle" class="w-12 h-12 text-amber-500 mx-auto mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-200">Não foi possível carregar as métricas</h3>
                    <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">${App.escapeHtml(err.message)}</p>
                    <button onclick="Dashboard.load()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 transition">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Tentar Novamente
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    },

    /**
     * Render dashboard content.
     * @param {object} stats 
     */
    render(stats) {
        const container = document.getElementById('page-dashboard');
        if (!container) return;

        const total = stats.total_executions || 0;
        const passed = stats.passed || 0;
        const failed = stats.failed || 0;
        const running = stats.running || 0;
        const passRate = (stats.pass_rate !== undefined && stats.pass_rate !== null) 
            ? Number(stats.pass_rate).toFixed(1) 
            : (total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0');

        const passedPercent = total > 0 ? Math.round((passed / total) * 100) : 0;
        const failedPercent = total > 0 ? Math.round((failed / total) * 100) : 0;
        const projectsCount = stats.projects_count || 0;
        const recentExecutions = stats.recent_executions || [];

        // Check if there is any actively running execution in recent executions
        const activeRun = recentExecutions.find(e => e.status === 'running');

        container.innerHTML = `
            <!-- Top Quick Actions & Alert Bar -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                        <span>Painel de Controle</span>
                        <span class="text-xs font-normal px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                            ${projectsCount} ${projectsCount === 1 ? 'projeto ativo' : 'projetos ativos'}
                        </span>
                    </h2>
                    <p class="text-xs text-gray-400 mt-0.5">Visão consolidada do pipeline de qualidade e histórico recente</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="Dashboard.load()" class="p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-300 hover:text-white transition" title="Atualizar dados">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    </button>
                    <button onclick="App.navigateTo('execution')" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium rounded-lg inline-flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition">
                        <i data-lucide="play" class="w-4 h-4 fill-current"></i>
                        <span>Nova Execução</span>
                    </button>
                </div>
            </div>

            ${activeRun ? `
                <!-- Live Execution Alert Banner -->
                <div class="mb-6 p-4 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-center justify-between gap-4 animate-pulse">
                    <div class="flex items-center gap-3">
                        <div class="w-3 h-3 rounded-full bg-blue-400 animate-ping"></div>
                        <div>
                            <p class="text-sm font-semibold text-blue-200">Execução #${activeRun.id} em andamento!</p>
                            <p class="text-xs text-blue-300/80">Navegador: ${App.escapeHtml(activeRun.browser)} | Modo: ${App.escapeHtml(activeRun.mode)}</p>
                        </div>
                    </div>
                    <button onclick="App.navigateTo('execution', { executionId: ${activeRun.id} })" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition">
                        <span>Ver Console ao Vivo</span>
                        <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            ` : ''}

            <!-- 4 Metric Cards Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <!-- Total Execuções -->
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 hover-card">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-medium text-gray-400">Total de Execuções</span>
                        <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <i data-lucide="activity" class="w-4 h-4"></i>
                        </div>
                    </div>
                    <div class="flex items-baseline justify-between">
                        <span class="text-2xl font-bold text-gray-100">${total}</span>
                        <span class="text-xs text-gray-500">${projectsCount} projetos</span>
                    </div>
                    <div class="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div class="bg-indigo-500 h-full rounded-full" style="width: 100%"></div>
                    </div>
                </div>

                <!-- Aprovados -->
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 hover-card">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-medium text-gray-400">Aprovados</span>
                        <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                        </div>
                    </div>
                    <div class="flex items-baseline justify-between">
                        <span class="text-2xl font-bold text-emerald-400">${passed}</span>
                        <span class="text-xs text-emerald-500/80 font-medium">${passedPercent}% do total</span>
                    </div>
                    <div class="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div class="bg-emerald-500 h-full rounded-full transition-all duration-500" style="width: ${passedPercent}%"></div>
                    </div>
                </div>

                <!-- Falhas -->
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 hover-card">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-medium text-gray-400">Falhas / Erros</span>
                        <div class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                            <i data-lucide="x-circle" class="w-4 h-4"></i>
                        </div>
                    </div>
                    <div class="flex items-baseline justify-between">
                        <span class="text-2xl font-bold text-red-400">${failed}</span>
                        <span class="text-xs text-red-500/80 font-medium">${failedPercent}% do total</span>
                    </div>
                    <div class="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div class="bg-red-500 h-full rounded-full transition-all duration-500" style="width: ${failedPercent}%"></div>
                    </div>
                </div>

                <!-- Em Execução -->
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 hover-card ${running > 0 ? 'border-blue-500/40 bg-blue-950/20' : ''}">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-medium text-gray-400">Em Execução</span>
                        <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                            <i data-lucide="play-circle" class="w-4 h-4 ${running > 0 ? 'animate-spin' : ''}"></i>
                        </div>
                    </div>
                    <div class="flex items-baseline justify-between">
                        <span class="text-2xl font-bold text-blue-400">${running}</span>
                        ${running > 0 
                            ? `<span class="text-xs text-blue-400 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span> ativo</span>`
                            : `<span class="text-xs text-gray-500">nenhum ativo</span>`
                        }
                    </div>
                    <div class="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div class="bg-blue-500 h-full rounded-full" style="width: ${running > 0 ? '100%' : '0%'}"></div>
                    </div>
                </div>
            </div>

            <!-- Middle Section: Pass Rate Bar & Quick Shortcuts -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <!-- Pass Rate Quality Card -->
                <div class="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <h3 class="text-sm font-semibold text-gray-200">Taxa de Sucesso Geral</h3>
                            <span class="text-xs text-gray-400">Pass Rate</span>
                        </div>
                        <p class="text-xs text-gray-400">Proporção de testes aprovados em relação ao total executado.</p>
                    </div>

                    <div class="my-6 flex items-center justify-center">
                        <div class="relative w-36 h-36 flex items-center justify-center">
                            <!-- Circular SVG Meter -->
                            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="40" stroke="#1f2937" stroke-width="8" fill="transparent" />
                                <circle cx="50" cy="50" r="40" stroke="#10b981" stroke-width="8" 
                                    stroke-dasharray="251.2" 
                                    stroke-dashoffset="${251.2 - (251.2 * (parseFloat(passRate) / 100))}" 
                                    stroke-linecap="round" 
                                    fill="transparent" 
                                    class="transition-all duration-1000 ease-out" />
                            </svg>
                            <div class="absolute inset-0 flex flex-col items-center justify-center">
                                <span class="text-2xl font-extrabold text-gray-100">${passRate}%</span>
                                <span class="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">Qualidade</span>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 pt-3 border-t border-gray-800 text-center">
                        <div class="bg-gray-950/50 p-2 rounded-lg border border-gray-800">
                            <span class="text-xs text-gray-400 block">Sucesso</span>
                            <span class="text-sm font-bold text-emerald-400">${passed}</span>
                        </div>
                        <div class="bg-gray-950/50 p-2 rounded-lg border border-gray-800">
                            <span class="text-xs text-gray-400 block">Falhas</span>
                            <span class="text-sm font-bold text-red-400">${failed}</span>
                        </div>
                    </div>
                </div>

                <!-- Fast Actions & Quick Stats Card -->
                <div class="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col justify-between">
                    <div>
                        <h3 class="text-sm font-semibold text-gray-200 mb-1">Ações Rápidas & Gestão</h3>
                        <p class="text-xs text-gray-400 mb-4">Acesse atalhos rápidos para gerenciar suítes de teste e agendamentos.</p>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <button onclick="App.navigateTo('projects'); setTimeout(() => Projects.showAddForm(), 100);" 
                                class="p-4 bg-gray-950 hover:bg-gray-800/80 border border-gray-800 rounded-lg text-left transition group">
                                <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                                    <i data-lucide="folder-plus" class="w-4 h-4"></i>
                                </div>
                                <h4 class="text-sm font-semibold text-gray-200">Novo Projeto</h4>
                                <p class="text-xs text-gray-400 mt-1">Cadastrar suíte Robot ou Playwright</p>
                            </button>

                            <button onclick="App.navigateTo('execution')" 
                                class="p-4 bg-gray-950 hover:bg-gray-800/80 border border-gray-800 rounded-lg text-left transition group">
                                <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                                    <i data-lucide="play-circle" class="w-4 h-4"></i>
                                </div>
                                <h4 class="text-sm font-semibold text-gray-200">Executar Teste</h4>
                                <p class="text-xs text-gray-400 mt-1">Disparar suíte com logs em tempo real</p>
                            </button>

                            <button onclick="App.navigateTo('schedules')" 
                                class="p-4 bg-gray-950 hover:bg-gray-800/80 border border-gray-800 rounded-lg text-left transition group">
                                <div class="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                                    <i data-lucide="calendar-clock" class="w-4 h-4"></i>
                                </div>
                                <h4 class="text-sm font-semibold text-gray-200">Agendamentos</h4>
                                <p class="text-xs text-gray-400 mt-1">Programar rotinas automáticas</p>
                            </button>
                        </div>
                    </div>

                    <div class="mt-4 pt-4 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
                        <div class="flex items-center gap-4">
                            <span class="flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full bg-indigo-400"></span> Robot Framework
                            </span>
                            <span class="flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full bg-emerald-400"></span> Playwright Tests
                            </span>
                            <span class="flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full bg-blue-400"></span> Multi-browser
                            </span>
                        </div>
                        <button onclick="App.navigateTo('history')" class="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1">
                            Ver Histórico Completo <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Recent Executions Table -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-semibold text-gray-200">Execuções Recentes</h3>
                        <p class="text-xs text-gray-400">Últimos testes executados na plataforma</p>
                    </div>
                    <button onclick="App.navigateTo('history')" class="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1">
                        Ver todas (${total}) <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                    </button>
                </div>

                ${recentExecutions.length === 0 ? `
                    <div class="p-12 text-center">
                        <div class="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3 text-gray-500">
                            <i data-lucide="inbox" class="w-6 h-6"></i>
                        </div>
                        <h4 class="text-sm font-medium text-gray-300">Nenhuma execução registrada</h4>
                        <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Cadastre um projeto e dispare sua primeira rodada de testes automatizados.</p>
                        <button onclick="App.navigateTo('execution')" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 transition">
                            <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i> Iniciar Primeira Execução
                        </button>
                    </div>
                ` : `
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-gray-950/60 text-gray-400 font-semibold border-b border-gray-800 uppercase tracking-wider">
                                <tr>
                                    <th class="px-5 py-3">ID</th>
                                    <th class="px-5 py-3">Projeto</th>
                                    <th class="px-5 py-3">Modo / Navegador</th>
                                    <th class="px-5 py-3">Status</th>
                                    <th class="px-5 py-3">Duração</th>
                                    <th class="px-5 py-3">Data / Hora</th>
                                    <th class="px-5 py-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-800">
                                ${recentExecutions.map(exec => `
                                    <tr class="hover:bg-gray-800/40 transition">
                                        <td class="px-5 py-3.5 font-mono text-gray-300">#${exec.id}</td>
                                        <td class="px-5 py-3.5">
                                            <span class="font-medium text-gray-200">Projeto #${exec.project_id}</span>
                                            ${exec.test_type ? `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 uppercase">${App.escapeHtml(exec.test_type)}</span>` : ''}
                                        </td>
                                        <td class="px-5 py-3.5 text-gray-300">
                                            <div class="flex items-center gap-1.5">
                                                <span class="capitalize text-gray-300">${exec.mode === 'full_suite' ? 'Suíte Completa' : (exec.mode === 'specific_tests' ? 'Específico' : (exec.mode === 'by_tag' ? 'Por Tags' : exec.mode))}</span>
                                                <span class="text-gray-600">•</span>
                                                <span class="text-gray-400 uppercase text-[11px]">${App.escapeHtml(exec.browser || 'chromium')}</span>
                                            </div>
                                        </td>
                                        <td class="px-5 py-3.5">
                                            ${App.renderBadge(exec.status)}
                                        </td>
                                        <td class="px-5 py-3.5 text-gray-400 font-mono">
                                            ${App.formatDuration(exec.duration)}
                                        </td>
                                        <td class="px-5 py-3.5 text-gray-400">
                                            ${App.formatDate(exec.started_at || exec.created_at)}
                                        </td>
                                        <td class="px-5 py-3.5 text-right">
                                            <div class="inline-flex items-center gap-1.5">
                                                <button onclick="App.navigateTo('execution', { executionId: ${exec.id} })" 
                                                    class="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white rounded border border-gray-700 text-[11px] font-medium transition inline-flex items-center gap-1"
                                                    title="Ver Console e Logs">
                                                    <i data-lucide="terminal" class="w-3 h-3"></i>
                                                    <span>Logs</span>
                                                </button>
                                                ${exec.status !== 'running' ? `
                                                    <button onclick="Execution.reRun(${exec.id})" 
                                                        class="p-1 text-gray-400 hover:text-indigo-400 rounded transition"
                                                        title="Repetir Execução">
                                                        <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Render loading skeleton placeholder.
     */
    renderSkeleton() {
        return `
            <div class="animate-pulse">
                <div class="h-8 bg-gray-900 rounded-lg w-1/4 mb-6"></div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div class="h-28 bg-gray-900 rounded-xl"></div>
                    <div class="h-28 bg-gray-900 rounded-xl"></div>
                    <div class="h-28 bg-gray-900 rounded-xl"></div>
                    <div class="h-28 bg-gray-900 rounded-xl"></div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <div class="h-56 bg-gray-900 rounded-xl"></div>
                    <div class="h-56 bg-gray-900 rounded-xl lg:col-span-2"></div>
                </div>
                <div class="h-64 bg-gray-900 rounded-xl"></div>
            </div>
        `;
    }
};

window.Dashboard = Dashboard;
