/**
 * TestRunner Pro - Main Application Module
 * Core router, API helper, modals, toasts, and shared formatting utilities.
 */

const App = {
    currentPage: 'dashboard',
    activeExecutionId: null,

    /**
     * Initialize the application.
     */
    init() {
        this.setupNavigation();
        this.setupModalListeners();
        this.checkSystemHealth();
        
        // Listen to hash changes for deep linking (e.g. #projects, #execution)
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '').trim();
            if (hash) {
                const [page, queryString] = hash.split('?');
                const params = {};
                if (queryString) {
                    new URLSearchParams(queryString).forEach((val, key) => {
                        params[key] = val;
                    });
                }
                this.navigateTo(page, params, false);
            }
        });

        // Initial navigation
        const initialHash = window.location.hash.replace('#', '').trim();
        if (initialHash) {
            const [page, queryString] = initialHash.split('?');
            const params = {};
            if (queryString) {
                new URLSearchParams(queryString).forEach((val, key) => {
                    params[key] = val;
                });
            }
            this.navigateTo(page || 'dashboard', params, false);
        } else {
            this.navigateTo('dashboard', {}, false);
        }

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Setup sidebar and quick link navigation listeners.
     */
    setupNavigation() {
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = el.getAttribute('data-nav');
                if (targetPage) {
                    this.navigateTo(targetPage);
                }
            });
        });
    },

    /**
     * Navigate to a specific page.
     * @param {string} page - Page ID (dashboard, projects, execution, history, schedules, settings)
     * @param {object} params - Optional parameters passed to page loader
     * @param {boolean} updateHash - Whether to update window.location.hash
     */
    navigateTo(page, params = {}, updateHash = true) {
        const validPages = ['dashboard', 'projects', 'execution', 'history', 'schedules', 'settings'];
        if (!validPages.includes(page)) {
            page = 'dashboard';
        }

        this.currentPage = page;

        if (updateHash) {
            const queryString = Object.keys(params).length > 0 ? '?' + new URLSearchParams(params).toString() : '';
            window.location.hash = page + queryString;
        }

        // Hide all page containers
        document.querySelectorAll('.page-section').forEach(section => {
            section.classList.remove('active');
            section.classList.add('hidden');
        });

        // Show targeted page
        const targetSection = document.getElementById(`page-${page}`);
        if (targetSection) {
            targetSection.classList.remove('hidden');
            targetSection.classList.add('active');
        }

        // Update sidebar active links
        document.querySelectorAll('[data-nav]').forEach(el => {
            const navTarget = el.getAttribute('data-nav');
            if (navTarget === page) {
                el.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-600/30');
                el.classList.remove('text-gray-400', 'hover:bg-gray-800/60', 'hover:text-gray-200');
            } else {
                el.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-600/30');
                el.classList.add('text-gray-400', 'hover:bg-gray-800/60', 'hover:text-gray-200');
            }
        });

        // Update header title and breadcrumb
        this.updateHeader(page);

        // Call module loader
        try {
            switch (page) {
                case 'dashboard':
                    if (window.Dashboard && typeof Dashboard.load === 'function') Dashboard.load();
                    break;
                case 'projects':
                    if (window.Projects && typeof Projects.load === 'function') Projects.load();
                    break;
                case 'execution':
                    if (window.Execution && typeof Execution.load === 'function') Execution.load(params);
                    break;
                case 'history':
                    if (window.History && typeof History.load === 'function') History.load(params);
                    break;
                case 'schedules':
                    if (window.Schedules && typeof Schedules.load === 'function') Schedules.load();
                    break;
                case 'settings':
                    if (window.Settings && typeof Settings.load === 'function') Settings.load();
                    break;
            }
        } catch (err) {
            console.error(`[App] Error loading page ${page}:`, err);
            this.showToast(`Erro ao carregar a página: ${err.message}`, 'error');
        }

        // Refresh icons in newly rendered elements
        setTimeout(() => {
            if (window.lucide) {
                lucide.createIcons();
            }
        }, 30);
    },

    /**
     * Update header text and breadcrumb based on current route.
     */
    updateHeader(page) {
        const titleEl = document.getElementById('header-page-title');
        const descEl = document.getElementById('header-page-subtitle');
        if (!titleEl) return;

        const titles = {
            dashboard: { title: 'Dashboard', desc: 'Visão geral das execuções e métricas de qualidade' },
            projects: { title: 'Projetos', desc: 'Gerencie suas suítes de teste Robot Framework e Playwright' },
            execution: { title: 'Executar Testes', desc: 'Dispare e monitore execuções em tempo real com streaming de logs' },
            history: { title: 'Histórico de Execuções', desc: 'Audite execuções anteriores, relatórios e estatísticas' },
            schedules: { title: 'Agendamentos', desc: 'Configure execuções automáticas com expressões Cron' },
            settings: { title: 'Configurações', desc: 'Preferências gerais do sistema e runners de teste' }
        };

        const meta = titles[page] || titles.dashboard;
        titleEl.textContent = meta.title;
        if (descEl) descEl.textContent = meta.desc;
    },

    /**
     * Check backend health and update connection badge.
     */
    async checkSystemHealth() {
        const badge = document.getElementById('system-status-indicator');
        const badgeText = document.getElementById('system-status-text');
        try {
            const res = await fetch('/api/executions/stats');
            if (res.ok) {
                if (badge) badge.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
                if (badgeText) badgeText.textContent = 'API Online';
            } else {
                if (badge) badge.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
                if (badgeText) badgeText.textContent = 'API Instável';
            }
        } catch {
            if (badge) badge.className = 'w-2.5 h-2.5 rounded-full bg-red-500';
            if (badgeText) badgeText.textContent = 'Desconectado';
        }
    },

    /**
     * Universal API Call wrapper with JSON serialization, headers, and error handling.
     * @param {string} url - API endpoint
     * @param {string} method - GET, POST, PUT, DELETE, etc.
     * @param {object|null} body - Request payload
     * @param {boolean} silentError - If true, suppresses toast notification on error
     * @returns {Promise<any>}
     */
    async apiCall(url, method = 'GET', body = null, silentError = false) {
        const options = {
            method,
            headers: {
                'Accept': 'application/json'
            }
        };

        if (body !== null && method !== 'GET' && method !== 'HEAD') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);

            // If empty response (204 No Content)
            if (response.status === 204) {
                return true;
            }

            const contentType = response.headers.get('content-type') || '';
            let data = null;
            if (contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                let errorMessage = `Erro ${response.status}: `;
                if (data && typeof data === 'object') {
                    if (data.detail) {
                        if (Array.isArray(data.detail)) {
                            // Pydantic validation error list
                            errorMessage += data.detail.map(d => `${d.loc ? d.loc.join('.') + ': ' : ''}${d.msg}`).join(', ');
                        } else {
                            errorMessage += data.detail;
                        }
                    } else if (data.message) {
                        errorMessage += data.message;
                    } else {
                        errorMessage += JSON.stringify(data);
                    }
                } else if (typeof data === 'string' && data.trim()) {
                    errorMessage += data.substring(0, 150);
                } else {
                    errorMessage += response.statusText || 'Falha na requisição';
                }

                if (!silentError) {
                    this.showToast(errorMessage, 'error', 'Erro na Operação');
                }
                throw new Error(errorMessage);
            }

            return data;
        } catch (error) {
            if (!silentError && !error.message.startsWith('Erro ')) {
                this.showToast(error.message || 'Erro de conexão com o servidor', 'error', 'Erro de Rede');
            }
            throw error;
        }
    },

    /**
     * Display a toast notification.
     * @param {string} message 
     * @param {'success'|'error'|'warning'|'info'} type 
     * @param {string|null} title 
     * @param {number} duration 
     */
    showToast(message, type = 'info', title = null, duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-item toast-${type}`;

        // Icons mapping
        const icons = {
            success: `<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
            error: `<svg class="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
            warning: `<svg class="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
            info: `<svg class="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        };

        const defaultTitles = {
            success: 'Sucesso',
            error: 'Erro',
            warning: 'Atenção',
            info: 'Informação'
        };

        const toastTitle = title || defaultTitles[type] || 'Notificação';

        toast.innerHTML = `
            <div class="mt-0.5">${icons[type] || icons.info}</div>
            <div class="flex-1 min-w-0 pr-2">
                <p class="text-sm font-semibold text-gray-100">${this.escapeHtml(toastTitle)}</p>
                <p class="text-xs text-gray-300 mt-0.5 leading-relaxed break-words">${this.escapeHtml(message)}</p>
            </div>
            <button type="button" class="text-gray-400 hover:text-gray-200 p-1 -mr-1 -mt-1 rounded focus:outline-none" onclick="this.closest('.toast-item').remove()">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        `;

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.add('leaving');
                setTimeout(() => {
                    toast.remove();
                }, 250);
            }, duration);
        }
    },

    /**
     * Show customizable modal dialog.
     * @param {string} title - Modal title
     * @param {string} contentHtml - HTML string content
     * @param {Array<{label: string, class?: string, onClick?: Function, closeOnClick?: boolean}>} actions 
     */
    showModal(title, contentHtml, actions = []) {
        const backdrop = document.getElementById('modal-backdrop');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const actionsEl = document.getElementById('modal-actions');
        if (!backdrop || !contentEl) return;

        titleEl.textContent = title;
        contentEl.innerHTML = contentHtml;
        actionsEl.innerHTML = '';

        if (!actions || actions.length === 0) {
            actions = [{
                label: 'Fechar',
                class: 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition',
                closeOnClick: true
            }];
        }

        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = action.class || 'bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition';
            btn.innerHTML = action.label;

            btn.addEventListener('click', async (e) => {
                if (typeof action.onClick === 'function') {
                    const shouldKeepOpen = await action.onClick(e);
                    if (shouldKeepOpen === false) return; // Prevent closing if function returned false
                }
                if (action.closeOnClick !== false) {
                    this.hideModal();
                }
            });

            actionsEl.appendChild(btn);
        });

        backdrop.classList.add('active');
        backdrop.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');

        setTimeout(() => {
            if (window.lucide) lucide.createIcons();
        }, 20);
    },

    /**
     * Close the modal dialog.
     */
    hideModal() {
        const backdrop = document.getElementById('modal-backdrop');
        if (!backdrop) return;

        backdrop.classList.remove('active');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            const contentEl = document.getElementById('modal-content');
            if (contentEl) contentEl.innerHTML = '';
        }, 200);
    },

    /**
     * Setup modal click outside and Escape key listeners.
     */
    setupModalListeners() {
        const backdrop = document.getElementById('modal-backdrop');
        const closeBtn = document.getElementById('modal-close-btn');

        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    this.hideModal();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideModal());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const backdrop = document.getElementById('modal-backdrop');
                if (backdrop && backdrop.classList.contains('active')) {
                    this.hideModal();
                }
            }
        });
    },

    /**
     * Format ISO date string into Brazilian date & time format.
     * @param {string|Date} dateStr 
     * @returns {string}
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return String(dateStr);
            return date.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return String(dateStr);
        }
    },

    /**
     * Format duration in seconds to human readable Portuguese string.
     * @param {number} seconds 
     * @returns {string}
     */
    formatDuration(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) return '-';
        const sec = parseFloat(seconds);
        if (sec < 1 && sec > 0) return `${Math.round(sec * 1000)}ms`;
        if (sec < 60) return `${sec.toFixed(1)}s`;

        const minutes = Math.floor(sec / 60);
        const remSec = Math.floor(sec % 60);

        if (minutes < 60) {
            return `${minutes}m ${remSec}s`;
        }

        const hours = Math.floor(minutes / 60);
        const remMin = minutes % 60;
        return `${hours}h ${remMin}m ${remSec}s`;
    },

    /**
     * Render a colored status badge HTML with dot indicator.
     * @param {string} status 
     * @returns {string}
     */
    renderBadge(status) {
        const s = (status || 'unknown').toLowerCase();
        switch (s) {
            case 'running':
                return `
                    <span class="status-pill status-running">
                        <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
                        <span>Em Execução</span>
                    </span>
                `;
            case 'passed':
            case 'success':
                return `
                    <span class="status-pill status-passed">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>Aprovado</span>
                    </span>
                `;
            case 'failed':
            case 'failure':
                return `
                    <span class="status-pill status-failed">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                        <span>Falhou</span>
                    </span>
                `;
            case 'error':
                return `
                    <span class="status-pill status-error">
                        <span class="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                        <span>Erro</span>
                    </span>
                `;
            case 'cancelled':
                return `
                    <span class="status-pill status-cancelled">
                        <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                        <span>Cancelado</span>
                    </span>
                `;
            case 'pending':
            case 'queued':
                return `
                    <span class="status-pill status-pending">
                        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                        <span>Na Fila</span>
                    </span>
                `;
            case 'active':
                return `
                    <span class="status-pill status-passed">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>Ativo</span>
                    </span>
                `;
            case 'inactive':
                return `
                    <span class="status-pill status-cancelled">
                        <span class="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                        <span>Inativo</span>
                    </span>
                `;
            default:
                return `
                    <span class="status-pill status-cancelled">
                        <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                        <span>${this.escapeHtml(status || 'N/A')}</span>
                    </span>
                `;
        }
    },

    /**
     * Copy text to clipboard and show toast notification.
     * @param {string} text 
     * @param {string} label 
     */
    async copyToClipboard(text, label = 'Texto') {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(`${label} copiado para a área de transferência!`, 'success');
        } catch {
            this.showToast(`Não foi possível copiar ${label.toLowerCase()}`, 'error');
        }
    },

    /**
     * Escape special HTML characters.
     * @param {string} str 
     * @returns {string}
     */
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
