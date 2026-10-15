/**
 * TestRunner Pro - Settings Module
 * Manages global application configuration, browser defaults, timeouts, and execution parameters.
 */

const Settings = {
    settingsList: [],
    settingsMap: {},

    /**
     * Load settings from API.
     */
    async load() {
        const container = document.getElementById('page-settings');
        if (!container) return;

        container.innerHTML = this.renderSkeleton();

        try {
            const data = await App.apiCall('/api/settings');
            this.settingsList = Array.isArray(data) ? data : [];
            this.settingsMap = {};

            // Index by key
            this.settingsList.forEach(s => {
                if (s && s.key) {
                    this.settingsMap[s.key] = s.value;
                }
            });

            this.render();
        } catch (err) {
            console.error('[Settings] Error loading settings:', err);
            container.innerHTML = `
                <div class="p-8 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <i data-lucide="alert-triangle" class="w-12 h-12 text-amber-500 mx-auto mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-200">Não foi possível carregar as configurações</h3>
                    <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">${App.escapeHtml(err.message)}</p>
                    <button onclick="Settings.load()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 transition">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Tentar Novamente
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    },

    /**
     * Render settings form.
     */
    render() {
        const container = document.getElementById('page-settings');
        if (!container) return;

        // Default values if not yet configured in DB
        const defaults = {
            default_browser: 'chromium',
            default_headless: 'true',
            default_timeout: '30000',
            max_parallel_executions: '2',
            report_retention_days: '30',
            reports_dir: './reports',
            auto_open_report: 'false',
            enable_debug_logging: 'false',
            notification_webhook: ''
        };

        const getVal = (key) => {
            return this.settingsMap[key] !== undefined ? this.settingsMap[key] : defaults[key];
        };

        container.innerHTML = `
            <div class="max-w-4xl space-y-6">
                <!-- Header -->
                <div class="flex items-center justify-between pb-2 border-b border-gray-800">
                    <div>
                        <h3 class="text-base font-bold text-gray-100">Preferências do Sistema</h3>
                        <p class="text-xs text-gray-400 mt-0.5">Defina padrões globais para os executores de teste Robot e Playwright.</p>
                    </div>
                    <button onclick="Settings.save()" id="btn-save-settings" 
                        class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold rounded-lg inline-flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition">
                        <i data-lucide="save" class="w-4 h-4"></i>
                        <span>Salvar Alterações</span>
                    </button>
                </div>

                <!-- Form Groups Grid -->
                <form id="settings-form" onsubmit="event.preventDefault(); Settings.save();" class="space-y-6">

                    <!-- Group 1: Navegadores e Execução -->
                    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
                        <div class="flex items-center gap-2 pb-3 mb-4 border-b border-gray-800">
                            <i data-lucide="monitor" class="w-4 h-4 text-indigo-400"></i>
                            <h4 class="text-sm font-bold text-gray-200 uppercase tracking-wider">Navegador & Execução Padrão</h4>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                    Navegador Padrão
                                </label>
                                <select id="setting-default_browser" data-key="default_browser" data-category="browser"
                                    class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                                    <option value="chromium" ${getVal('default_browser') === 'chromium' ? 'selected' : ''}>Chromium (Google Chrome)</option>
                                    <option value="firefox" ${getVal('default_browser') === 'firefox' ? 'selected' : ''}>Mozilla Firefox</option>
                                    <option value="webkit" ${getVal('default_browser') === 'webkit' ? 'selected' : ''}>WebKit (Safari)</option>
                                </select>
                                <p class="text-[11px] text-gray-500 mt-1">Navegador pré-selecionado para novos testes e agendamentos.</p>
                            </div>

                            <div>
                                <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                    Timeout Padrão por Teste (ms)
                                </label>
                                <input type="number" id="setting-default_timeout" data-key="default_timeout" data-category="browser"
                                    value="${App.escapeHtml(getVal('default_timeout'))}" min="1000" step="1000"
                                    class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                                <p class="text-[11px] text-gray-500 mt-1">Tempo limite máximo em milissegundos (ex: 30000 = 30s).</p>
                            </div>
                        </div>

                        <div class="pt-4 mt-4 border-t border-gray-800/80 flex items-center justify-between">
                            <div>
                                <span class="text-xs font-semibold text-gray-200 block">Executar em Modo Headless por Padrão</span>
                                <span class="text-[11px] text-gray-400">Ocultar janelas visuais durante disparos de teste</span>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="setting-default_headless" data-key="default_headless" data-category="browser"
                                    ${getVal('default_headless') === 'true' ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Group 2: Paralelismo e Recursos -->
                    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
                        <div class="flex items-center gap-2 pb-3 mb-4 border-b border-gray-800">
                            <i data-lucide="cpu" class="w-4 h-4 text-emerald-400"></i>
                            <h4 class="text-sm font-bold text-gray-200 uppercase tracking-wider">Paralelismo & Recursos</h4>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                    Máximo de Execuções Simultâneas
                                </label>
                                <input type="number" id="setting-max_parallel_executions" data-key="max_parallel_executions" data-category="general"
                                    value="${App.escapeHtml(getVal('max_parallel_executions'))}" min="1" max="10"
                                    class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                                <p class="text-[11px] text-gray-500 mt-1">Controle de concorrência para poupar memória RAM e processamento.</p>
                            </div>

                            <div>
                                <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                    Retenção de Relatórios (Dias)
                                </label>
                                <input type="number" id="setting-report_retention_days" data-key="report_retention_days" data-category="general"
                                    value="${App.escapeHtml(getVal('report_retention_days'))}" min="1" max="365"
                                    class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                                <p class="text-[11px] text-gray-500 mt-1">Período antes da limpeza automática de arquivos HTML e capturas.</p>
                            </div>
                        </div>
                    </div>

                    <!-- Group 3: Diretórios & Relatórios -->
                    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
                        <div class="flex items-center gap-2 pb-3 mb-4 border-b border-gray-800">
                            <i data-lucide="folder-output" class="w-4 h-4 text-blue-400"></i>
                            <h4 class="text-sm font-bold text-gray-200 uppercase tracking-wider">Diretórios & Relatórios</h4>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                    Diretório de Armazenamento de Relatórios
                                </label>
                                <input type="text" id="setting-reports_dir" data-key="reports_dir" data-category="general"
                                    value="${App.escapeHtml(getVal('reports_dir'))}"
                                    class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                                <p class="text-[11px] text-gray-500 mt-1">Pasta onde os artefatos gerados pelo Robot e Playwright serão gravados.</p>
                            </div>

                            <div class="pt-3 border-t border-gray-800/80 flex items-center justify-between">
                                <div>
                                    <span class="text-xs font-semibold text-gray-200 block">Abrir Relatório Automaticamente ao Finalizar</span>
                                    <span class="text-[11px] text-gray-400">Exibir aba com o relatório HTML após a conclusão da execução</span>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="setting-auto_open_report" data-key="auto_open_report" data-category="general"
                                        ${getVal('auto_open_report') === 'true' ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- Group 4: Notificações & Webhooks -->
                    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
                        <div class="flex items-center gap-2 pb-3 mb-4 border-b border-gray-800">
                            <i data-lucide="bell" class="w-4 h-4 text-purple-400"></i>
                            <h4 class="text-sm font-bold text-gray-200 uppercase tracking-wider">Notificações Externas (Webhook)</h4>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                URL do Webhook (Discord / Slack / Teams)
                            </label>
                            <input type="url" id="setting-notification_webhook" data-key="notification_webhook" data-category="notifications"
                                placeholder="https://discord.com/api/webhooks/... ou https://hooks.slack.com/services/..."
                                value="${App.escapeHtml(getVal('notification_webhook'))}"
                                class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                            <p class="text-[11px] text-gray-500 mt-1">Dispare alertas automáticos sempre que houver falhas em agendamentos.</p>
                        </div>
                    </div>

                    <!-- Save Action at Bottom -->
                    <div class="flex justify-end pt-2">
                        <button type="submit" 
                            class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg shadow-lg shadow-indigo-600/30 transition">
                            Salvar Todas as Configurações
                        </button>
                    </div>

                </form>
            </div>
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Collect form data and send PUT request to API.
     */
    async save() {
        const btn = document.getElementById('btn-save-settings');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<div class="spinner w-4 h-4 border-2 mr-2"></div> Salvando...`;
        }

        const updates = [];

        // Collect inputs with data-key
        document.querySelectorAll('[data-key]').forEach(el => {
            const key = el.getAttribute('data-key');
            let value = '';

            if (el.type === 'checkbox') {
                value = el.checked ? 'true' : 'false';
            } else {
                value = el.value.trim();
            }

            updates.push({ key, value });
            this.settingsMap[key] = value;
        });

        try {
            await App.apiCall('/api/settings', 'PUT', updates);
            App.showToast('Configurações salvas com sucesso!', 'success');
        } catch (err) {
            console.error('[Settings] Save error:', err);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i><span>Salvar Alterações</span>`;
                if (window.lucide) lucide.createIcons();
            }
        }
    },

    renderSkeleton() {
        return `
            <div class="animate-pulse space-y-6 max-w-4xl">
                <div class="h-10 bg-gray-900 rounded-lg w-1/3"></div>
                <div class="h-48 bg-gray-900 rounded-xl"></div>
                <div class="h-48 bg-gray-900 rounded-xl"></div>
                <div class="h-32 bg-gray-900 rounded-xl"></div>
            </div>
        `;
    }
};

window.Settings = Settings;
