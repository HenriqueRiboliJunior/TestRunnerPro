/**
 * TestRunner Pro - Schedules Module
 * Manages automated test executions using standard 5-part cron expressions.
 */

const Schedules = {
    schedules: [],
    projects: [],

    /**
     * Load schedules from API and render.
     */
    async load() {
        const container = document.getElementById('page-schedules');
        if (!container) return;

        if (!this.schedules || this.schedules.length === 0) {
            container.innerHTML = this.renderSkeleton();
        }

        try {
            const [schedulesData, projectsData] = await Promise.all([
                App.apiCall('/api/schedules'),
                App.apiCall('/api/projects')
            ]);
            this.schedules = Array.isArray(schedulesData) ? schedulesData : [];
            this.projects = Array.isArray(projectsData) ? projectsData : [];
            this.render();
        } catch (err) {
            console.error('[Schedules] Error loading data:', err);
            container.innerHTML = `
                <div class="p-8 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <i data-lucide="alert-triangle" class="w-12 h-12 text-amber-500 mx-auto mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-200">Não foi possível carregar os agendamentos</h3>
                    <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">${App.escapeHtml(err.message)}</p>
                    <button onclick="Schedules.load()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 transition">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Tentar Novamente
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    },

    /**
     * Render schedules view.
     */
    render() {
        const container = document.getElementById('page-schedules');
        if (!container) return;

        const projectNameMap = {};
        this.projects.forEach(p => { projectNameMap[p.id] = p.name; });

        container.innerHTML = `
            <!-- Top Controls -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h3 class="text-base font-bold text-gray-100 flex items-center gap-2">
                        <span>Rotinas Agendadas</span>
                        <span class="text-xs px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                            ${this.schedules.length} ${this.schedules.length === 1 ? 'agendamento' : 'agendamentos'}
                        </span>
                    </h3>
                    <p class="text-xs text-gray-400 mt-0.5">Execuções periódicas automatizadas disparadas por cron jobs do sistema.</p>
                </div>

                <div class="flex items-center gap-2">
                    <button onclick="Schedules.load()" class="p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-400 hover:text-white transition" title="Recarregar">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    </button>
                    <button onclick="Schedules.showAddForm()" 
                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold rounded-lg inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition">
                        <i data-lucide="calendar-plus" class="w-4 h-4"></i>
                        <span>Novo Agendamento</span>
                    </button>
                </div>
            </div>

            <!-- Schedules Table / Cards -->
            ${this.schedules.length === 0 ? `
                <div class="p-12 text-center bg-gray-900 border border-gray-800 rounded-xl">
                    <div class="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3 text-gray-500">
                        <i data-lucide="calendar-clock" class="w-6 h-6"></i>
                    </div>
                    <h4 class="text-sm font-semibold text-gray-200">Nenhum agendamento ativo</h4>
                    <p class="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                        Crie rotinas para executar testes à noite, a cada hora ou nos finais de semana automaticamente.
                    </p>
                    <button onclick="Schedules.showAddForm()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition">
                        <i data-lucide="plus" class="w-4 h-4"></i> Criar Primeiro Agendamento
                    </button>
                </div>
            ` : `
                <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-md">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-gray-950/60 text-gray-400 font-semibold border-b border-gray-800 uppercase tracking-wider">
                                <tr>
                                    <th class="px-5 py-3.5">Nome / Projeto</th>
                                    <th class="px-5 py-3.5">Frequência (Cron)</th>
                                    <th class="px-5 py-3.5">Configuração</th>
                                    <th class="px-5 py-3.5">Última Execução</th>
                                    <th class="px-5 py-3.5">Próxima Execução</th>
                                    <th class="px-5 py-3.5 text-center">Ativo</th>
                                    <th class="px-5 py-3.5 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-800">
                                ${this.schedules.map(sch => {
                                    const projectName = projectNameMap[sch.project_id] || `Projeto #${sch.project_id}`;
                                    const humanCron = this.humanizeCron(sch.cron_expression);

                                    return `
                                        <tr class="hover:bg-gray-800/40 transition">
                                            <td class="px-5 py-4">
                                                <div class="font-bold text-gray-100">${App.escapeHtml(sch.name)}</div>
                                                <div class="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                                                    <i data-lucide="folder" class="w-3 h-3 text-gray-500"></i>
                                                    <span>${App.escapeHtml(projectName)}</span>
                                                </div>
                                            </td>

                                            <td class="px-5 py-4">
                                                <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-indigo-300">
                                                    <i data-lucide="clock" class="w-3 h-3 text-indigo-400"></i>
                                                    <span>${App.escapeHtml(sch.cron_expression)}</span>
                                                </div>
                                                <p class="text-[11px] text-gray-400 mt-1">${App.escapeHtml(humanCron)}</p>
                                            </td>

                                            <td class="px-5 py-4 text-gray-300">
                                                <div class="flex items-center gap-1.5 text-[11px]">
                                                    <span class="capitalize">${sch.mode === 'full_suite' ? 'Completa' : (sch.mode === 'specific_tests' ? 'Específicos' : 'Tags')}</span>
                                                    <span class="text-gray-600">•</span>
                                                    <span class="uppercase font-mono text-gray-400">${App.escapeHtml(sch.browser || 'chromium')}</span>
                                                </div>
                                                ${sch.tags ? `<span class="text-[10px] text-indigo-400 font-mono mt-0.5 block truncate max-w-[150px]">tags: ${App.escapeHtml(sch.tags)}</span>` : ''}
                                            </td>

                                            <td class="px-5 py-4 text-gray-400 font-mono">
                                                ${sch.last_run ? App.formatDate(sch.last_run) : '<span class="text-gray-600">Nunca</span>'}
                                            </td>

                                            <td class="px-5 py-4 text-emerald-400 font-mono">
                                                ${sch.next_run ? App.formatDate(sch.next_run) : '<span class="text-gray-500">Calculando...</span>'}
                                            </td>

                                            <td class="px-5 py-4 text-center">
                                                <label class="toggle-switch inline-block">
                                                    <input type="checkbox" ${sch.is_active ? 'checked' : ''} 
                                                        onchange="Schedules.toggle(${sch.id}, this.checked)">
                                                    <span class="toggle-slider"></span>
                                                </label>
                                            </td>

                                            <td class="px-5 py-4 text-right">
                                                <div class="inline-flex items-center gap-1">
                                                    <button onclick="Schedules.showEditForm(${JSON.stringify(sch).replace(/"/g, '&quot;')})" 
                                                        class="p-1.5 text-gray-400 hover:text-indigo-400 rounded hover:bg-gray-800 transition" 
                                                        title="Editar Agendamento">
                                                        <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                                                    </button>
                                                    <button onclick="Schedules.delete(${sch.id}, '${App.escapeHtml(sch.name)}')" 
                                                        class="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition" 
                                                        title="Excluir Agendamento">
                                                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `}
        `;

        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Translate common cron expressions to human-readable Portuguese.
     * @param {string} cron 
     * @returns {string}
     */
    humanizeCron(cron) {
        if (!cron) return 'Expressão inválida';
        const clean = cron.trim();

        const dict = {
            '*/15 * * * *': 'A cada 15 minutos',
            '*/30 * * * *': 'A cada 30 minutos',
            '0 * * * *': 'A cada hora cheia',
            '0 0 * * *': 'Todos os dias à meia-noite',
            '0 6 * * *': 'Todos os dias às 06:00',
            '0 8 * * *': 'Todos os dias às 08:00',
            '0 22 * * *': 'Todos os dias às 22:00',
            '0 8 * * 1': 'Toda segunda-feira às 08:00',
            '0 8 * * 1-5': 'Segunda a Sexta às 08:00',
            '0 22 * * 1-5': 'Segunda a Sexta às 22:00'
        };

        if (dict[clean]) return dict[clean];

        const parts = clean.split(/\s+/);
        if (parts.length === 5) {
            const [min, hr, dom, mon, dow] = parts;
            if (min === '0' && hr !== '*' && dom === '*' && mon === '*' && dow === '*') {
                return `Todos os dias às ${hr.padStart(2, '0')}:00`;
            }
            if (min.startsWith('*/') && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
                return `A cada ${min.replace('*/', '')} minutos`;
            }
        }

        return 'Expressão Cron personalizada';
    },

    /**
     * Show modal to create a new schedule.
     */
    showAddForm() {
        this.renderFormModal('Novo Agendamento de Testes', null);
    },

    /**
     * Show modal to edit an existing schedule.
     * @param {object} schedule 
     */
    showEditForm(schedule) {
        this.renderFormModal('Editar Agendamento', schedule);
    },

    /**
     * Render the schedule form modal.
     * @param {string} modalTitle 
     * @param {object|null} schedule 
     */
    renderFormModal(modalTitle, schedule = null) {
        const isEditing = !!schedule;
        const name = schedule?.name || '';
        const projectId = schedule?.project_id || (this.projects[0]?.id || '');
        const cron = schedule?.cron_expression || '0 8 * * *';
        const mode = schedule?.mode || 'full_suite';
        const browser = schedule?.browser || 'chromium';
        const headless = schedule?.headless ?? true;
        const tags = schedule?.tags || '';

        const presets = [
            { label: 'A cada 15 minutos', cron: '*/15 * * * *' },
            { label: 'A cada 30 minutos', cron: '*/30 * * * *' },
            { label: 'A cada hora', cron: '0 * * * *' },
            { label: 'Todos os dias às 06:00', cron: '0 6 * * *' },
            { label: 'Todos os dias às 08:00', cron: '0 8 * * *' },
            { label: 'Todos os dias à meia-noite', cron: '0 0 * * *' },
            { label: 'Segunda a Sexta às 08:00', cron: '0 8 * * 1-5' },
            { label: 'Segunda a Sexta às 22:00', cron: '0 22 * * 1-5' }
        ];

        const contentHtml = `
            <form id="schedule-form" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                        Nome do Agendamento <span class="text-red-400">*</span>
                    </label>
                    <input type="text" id="sch-form-name" required value="${App.escapeHtml(name)}"
                        placeholder="Ex: Regressão Noturna Diária" 
                        class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition">
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                            Projeto <span class="text-red-400">*</span>
                        </label>
                        <select id="sch-form-project" required
                            class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                            ${this.projects.map(p => `
                                <option value="${p.id}" ${String(projectId) === String(p.id) ? 'selected' : ''}>
                                    ${App.escapeHtml(p.name)} [${(p.test_type || '').toUpperCase()}]
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                            Navegador
                        </label>
                        <select id="sch-form-browser"
                            class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                            <option value="chromium" ${browser === 'chromium' ? 'selected' : ''}>Chromium</option>
                            <option value="firefox" ${browser === 'firefox' ? 'selected' : ''}>Firefox</option>
                            <option value="webkit" ${browser === 'webkit' ? 'selected' : ''}>WebKit</option>
                        </select>
                    </div>
                </div>

                <!-- Cron Expression & Presets -->
                <div>
                    <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                        Expressão Cron <span class="text-red-400">*</span>
                    </label>
                    
                    <div class="flex items-center gap-2 mb-2">
                        <select id="sch-cron-presets" onchange="document.getElementById('sch-form-cron').value = this.value; Schedules.updateCronPreview(this.value);"
                            class="w-1/2 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-indigo-500">
                            <option value="">-- Escolher Modelo Pré-definido --</option>
                            ${presets.map(pr => `
                                <option value="${pr.cron}" ${pr.cron === cron ? 'selected' : ''}>
                                    ${pr.label} (${pr.cron})
                                </option>
                            `).join('')}
                        </select>

                        <input type="text" id="sch-form-cron" required value="${App.escapeHtml(cron)}" 
                            placeholder="* * * * *"
                            oninput="Schedules.updateCronPreview(this.value)"
                            class="w-1/2 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500">
                    </div>

                    <div id="sch-cron-preview" class="text-[11px] text-gray-400 bg-gray-950/60 p-2 rounded border border-gray-800/80">
                        ${this.humanizeCron(cron)}
                    </div>
                </div>

                <!-- Execution Mode & Tags -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                            Modo
                        </label>
                        <select id="sch-form-mode"
                            class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition">
                            <option value="full_suite" ${mode === 'full_suite' ? 'selected' : ''}>Suíte Completa</option>
                            <option value="by_tag" ${mode === 'by_tag' ? 'selected' : ''}>Por Tags</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                            Filtro de Tags (Opcional)
                        </label>
                        <input type="text" id="sch-form-tags" value="${App.escapeHtml(tags)}" placeholder="ex: smoke, regression"
                            class="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition">
                    </div>
                </div>

                <!-- Headless Switch -->
                <div class="pt-2 border-t border-gray-800/80 flex items-center justify-between">
                    <div>
                        <span class="text-xs font-semibold text-gray-200 block">Modo Headless</span>
                        <span class="text-[11px] text-gray-400">Execuções agendadas devem rodar em segundo plano</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="sch-form-headless" ${headless ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
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
                label: isEditing ? 'Salvar Alterações' : 'Criar Agendamento',
                class: 'px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-md shadow-indigo-600/30 transition',
                closeOnClick: false,
                onClick: async () => {
                    const form = document.getElementById('schedule-form');
                    if (!form || !form.reportValidity()) return false;

                    const nameInput = document.getElementById('sch-form-name').value.trim();
                    const projectInput = parseInt(document.getElementById('sch-form-project').value, 10);
                    const cronInput = document.getElementById('sch-form-cron').value.trim();
                    const browserInput = document.getElementById('sch-form-browser').value;
                    const modeInput = document.getElementById('sch-form-mode').value;
                    const tagsInput = document.getElementById('sch-form-tags').value.trim();
                    const headlessInput = document.getElementById('sch-form-headless').checked;

                    const payload = {
                        name: nameInput,
                        project_id: projectInput,
                        cron_expression: cronInput,
                        browser: browserInput,
                        mode: modeInput,
                        tags: tagsInput || null,
                        headless: headlessInput,
                        selected_tests: []
                    };

                    try {
                        if (isEditing) {
                            await App.apiCall(`/api/schedules/${schedule.id}`, 'PUT', payload);
                            App.showToast('Agendamento atualizado com sucesso!', 'success');
                        } else {
                            await App.apiCall('/api/schedules', 'POST', payload);
                            App.showToast('Agendamento criado com sucesso!', 'success');
                        }
                        App.hideModal();
                        await Schedules.load();
                    } catch (err) {
                        console.error('[Schedules] Save error:', err);
                    }
                }
            }
        ];

        App.showModal(modalTitle, contentHtml, actions);
    },

    /**
     * Update the preview text of cron expression in modal.
     * @param {string} val 
     */
    updateCronPreview(val) {
        const preview = document.getElementById('sch-cron-preview');
        if (preview) {
            preview.textContent = this.humanizeCron(val);
        }
    },

    /**
     * Toggle active status of a schedule.
     * @param {number|string} scheduleId 
     * @param {boolean} isActive 
     */
    async toggle(scheduleId, isActive) {
        try {
            await App.apiCall(`/api/schedules/${scheduleId}/toggle`, 'POST', { is_active: isActive });
            App.showToast(`Agendamento ${isActive ? 'ativado' : 'desativado'}!`, 'info');
            // Update local memory
            const item = this.schedules.find(s => s.id === scheduleId);
            if (item) item.is_active = isActive;
        } catch (err) {
            console.error('[Schedules] Toggle error:', err);
            // Revert checkbox state
            await this.load();
        }
    },

    /**
     * Delete schedule with confirmation dialog.
     * @param {number|string} scheduleId 
     * @param {string} scheduleName 
     */
    delete(scheduleId, scheduleName) {
        App.showModal(
            'Confirmar Exclusão',
            `
                <p class="text-sm text-gray-300">
                    Deseja realmente remover o agendamento <strong class="text-white">${App.escapeHtml(scheduleName)}</strong>?
                </p>
            `,
            [
                { label: 'Cancelar', closeOnClick: true },
                {
                    label: 'Excluir Agendamento',
                    class: 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition',
                    closeOnClick: false,
                    onClick: async () => {
                        try {
                            await App.apiCall(`/api/schedules/${scheduleId}`, 'DELETE');
                            App.showToast('Agendamento removido com sucesso!', 'success');
                            App.hideModal();
                            await Schedules.load();
                        } catch (err) {
                            console.error('[Schedules] Delete error:', err);
                        }
                    }
                }
            ]
        );
    },

    renderSkeleton() {
        return `
            <div class="animate-pulse space-y-4">
                <div class="h-10 bg-gray-900 rounded-lg w-1/3"></div>
                <div class="h-64 bg-gray-900 rounded-xl"></div>
            </div>
        `;
    }
};

window.Schedules = Schedules;
