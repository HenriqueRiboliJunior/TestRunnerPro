<div align="center">

# 🧪 TestRunner Pro

### Plataforma Moderna para Orquestração e Execução de Testes Automatizados

**Playwright &bull; Cypress &bull; Robot Framework &bull; Pytest &bull; Postman/Newman &bull; K6**

---

[![Python Version](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Playwright](https://img.shields.io/badge/Playwright-Supported-45ba4b?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Cypress](https://img.shields.io/badge/Cypress-Supported-17202C?style=for-the-badge&logo=cypress&logoColor=white)](https://www.cypress.io/)
[![Robot Framework](https://img.shields.io/badge/Robot%20Framework-Supported-000000?style=for-the-badge&logo=robotframework&logoColor=white)](https://robotframework.org/)
[![Pytest](https://img.shields.io/badge/Pytest-Supported-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white)](https://docs.pytest.org/)
[![Postman](https://img.shields.io/badge/Postman%2FNewman-Supported-FF6C37?style=for-the-badge&logo=postman&logoColor=white)](https://www.postman.com/)
[![k6](https://img.shields.io/badge/K6%20Load%20Testing-Supported-7D64FF?style=for-the-badge&logo=k6&logoColor=white)](https://k6.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-Dark_Mode-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>

O **TestRunner Pro** é uma plataforma completa (backend assíncrono + frontend SPA) para gerenciar, orquestrar, executar e monitorar suítes de testes automatizados em tempo real através do navegador, com suporte nativo às principais ferramentas de teste do mercado: **Playwright, Cypress, Robot Framework, Pytest, Postman (Newman) e K6**.

</div>

---

## 📌 Índice

- [Visão Geral](#-visão-geral)
- [Frameworks Suportados](#-frameworks-suportados)
- [Principais Funcionalidades](#-principais-funcionalidades)
- [Arquitetura do Projeto](#-arquitetura-do-projeto)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação e Execução](#-instalação-e-execução)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Como Utilizar](#-como-utilizar)
  - [1. Cadastrando Projetos](#1-cadastrando-projetos)
  - [2. Orquestrador de Aplicações (App Manager)](#2-orquestrador-de-aplicações-app-manager)
  - [3. Executando Testes](#3-executando-testes)
  - [4. Agendando Execuções (Cron)](#4-agendando-execuções-cron)
  - [5. Visualizando Histórico e Relatórios](#5-visualizando-histórico-e-relatórios)
- [Documentação da API & WebSockets](#-documentação-da-api--websockets)
- [Boas Práticas de Segurança & Git](#-boas-práticas-de-segurança--git)
- [Licença](#-licença)

---

## 🚀 Visão Geral

O **TestRunner Pro** foi desenvolvido para centralizar a automação de testes de times de QA e Engenharia de Software. Em vez de depender de linhas de comando isoladas ou ferramentas fragmentadas, o TestRunner Pro disponibiliza:

- **Interface Unificada:** Controle suítes de ponta a ponta (Web, API, Performance e Unitários) em um único painel web moderno.
- **Transmissão em Tempo Real:** Acompanhe a saída do terminal linha por linha via **WebSockets**, com auto-scroll e controle de cancelamento em tempo de execução.
- **Gerenciamento do Ambiente sob Teste:** Inicie dependências pré-teste (ex: Docker Compose, APIs e Frontend de desenvolvimento) e desligue-os automaticamente após a execução dos testes.
- **Agendador Integrado:** Programe rotinas de testes contínuas diretamente pela interface web usando expressões Cron padrão.

---

## 🧰 Frameworks Suportados

| Framework | Tipo de Teste | Extensões Detectadas | Comando Base |
| :--- | :--- | :--- | :--- |
| **Playwright** | E2E Web & Componentes | `.spec.ts`, `.spec.js`, `.test.ts`, `.test.js` | `playwright test` |
| **Cypress** | E2E Web | `.cy.js`, `.cy.ts`, `.cy.jsx`, `.cy.tsx` | `cypress run` |
| **Robot Framework** | Acceptance & E2E (Python) | `.robot` | `robot` |
| **Pytest** | Unitário, Integração & API (Python) | `test_*.py`, `*_test.py` | `pytest` |
| **Postman / Newman** | Testes de API Rest | `*.postman_collection.json`, `*collection*.json` | `newman run` |
| **K6** | Performance & Carga | `*.js`, `*.ts` | `k6 run` |

---

## 🌟 Principais Funcionalidades

### 📊 Dashboard Interativo
- Métricas em tempo real: Total de execuções, taxa de aprovação (*pass rate*), testes aprovados, reprovados e em execução.
- Lista rápida com as execuções mais recentes e acesso imediato aos relatórios.

### 📁 Gerenciamento de Projetos
- Suporte a múltiplos projetos locais com caminhos absolutos validados.
- **Descoberta Automática de Testes:**
  - **Robot Framework:** Varre diretórios encontrando arquivos `.robot`.
  - **Playwright:** Detecta arquivos `.spec.ts`, `.test.ts`, `.spec.js`, `.test.js`, etc.
- Injeção de variáveis de ambiente personalizadas por projeto.

### ⚙️ App Manager (Orquestrador de Aplicação sob Teste)
- Configure comandos de inicialização para o sistema sob teste antes de iniciar as suítes:
  - Exemplos: `docker compose up -d`, `npm run dev`, `yarn start`, `python manage.py runserver`.
- Suporte a processos do tipo **daemon** (servidores persistentes) ou **oneshot** (scripts de setup/migração).
- Opção **Auto-Start**: Inicia a aplicação automaticamente antes da suíte e encerra o processo de forma limpa ao final da execução.
- Transmissão de logs da aplicação em tempo real via WebSocket.

### ⚡ Execução de Testes Flexível
- **Modos de Execução:**
  - Suíte completa (*Full Suite*)
  - Testes específicos selecionados na árvore
  - Execução por tags/expressões grep
- **Seleção de Navegador:** Chromium, Firefox ou WebKit.
- **Opções Avançadas:** Modo Headless (segundo plano) ou Headed (com interface visual), Modo Debug com passo a passo e sobrescrita de variáveis de ambiente em tempo de execução.
- **Cancelamento Sob Demanda:** Interrompa execuções em andamento com segurança.

### ⏰ Agendamentos (Scheduler)
- Agendamento de testes em segundo plano baseado em **APScheduler**.
- Suporte completo a expressões Cron (ex: `0 2 * * *` para rodar às 02h diariamente).
- Ativação/pausa de agendamentos em tempo real com um único toggle.

### 🔔 Configurações Globais & Integrações
- Definição de limites de execuções paralelas e timeouts padrão.
- Política de retenção de relatórios antigos.
- Suporte a **Webhooks** para integração externa (Discord, Slack, Microsoft Teams).

---

## 🏗️ Arquitetura do Projeto

```
testrunner-pro/
├── app/
│   ├── main.py                 # Ponto de entrada FastAPI, lifespans, CORS e SPA
│   ├── config.py               # Configurações gerais (Pydantic BaseSettings)
│   ├── database.py             # Configuração assíncrona do SQLAlchemy & SQLite
│   ├── models.py               # Modelos de dados (Project, Execution, Schedule, Setting)
│   ├── schemas.py              # Schemas de validação e serialização (Pydantic)
│   ├── routers/                # Endpoints da API REST
│   │   ├── projects.py         # CRUD de projetos, discovery e App Manager
│   │   ├── executions.py       # Disparo, listagem, cancelamento e métricas
│   │   ├── schedules.py        # Gestão de agendamentos com APScheduler
│   │   └── settings.py         # Configurações globais e semente inicial
│   ├── services/               # Lógica de negócio e executores
│   │   ├── runner.py           # Orquestrador central de execuções e WebSockets
│   │   ├── app_manager.py      # Gestor de processos de apps sob teste
│   │   ├── playwright_runner.py# Executor especializado para Playwright
│   │   ├── robot_runner.py     # Executor especializado para Robot Framework
│   │   ├── scheduler.py        # Gestão de tarefas em segundo plano (APScheduler)
│   │   └── discovery.py        # Descoberta de suítes de teste no filesystem
│   └── static/                 # Frontend SPA integrado
│       ├── templates/index.html# Estrutura HTML da interface web
│       ├── css/styles.css      # Estilização customizada e animações
│       └── js/                 # Módulos JavaScript (App, Dashboard, Executions, etc.)
├── reports/                    # Diretório local para relatórios de testes (ignorado no git)
├── .env.example                # Modelo de variáveis de ambiente
├── .gitignore                  # Regras de exclusão seguras para o Git
├── requirements.txt            # Dependências Python
├── run.py                      # Script para inicialização do servidor Uvicorn
└── README.md                   # Documentação do projeto
```

---

## 📦 Pré-requisitos

Antes de iniciar, certifique-se de ter instalado em seu ambiente:

- **Python 3.11 ou superior**
- **Git**
- *(Opcional)* **Node.js 18+ e NPM/Yarn** (necessário para projetos que utilizem testes em Playwright)
- *(Opcional)* **Docker & Docker Compose** (caso utilize o App Manager para subir contêineres)

---

## 🔧 Instalação e Execução

### 1. Clonar o repositório

```bash
git clone https://github.com/SEU_USUARIO/testrunner-pro.git
cd testrunner-pro
```

### 2. Criar e ativar o ambiente virtual

**No Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**No Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 3. Instalar as dependências do projeto

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configurar as variáveis de ambiente

Copie o arquivo de exemplo `.env.example` para `.env`:

```bash
cp .env.example .env
```

*(No Windows cmd: `copy .env.example .env`)*

### 5. Iniciar a aplicação

```bash
python run.py
```

O servidor iniciará automaticamente em **http://localhost:8000** com recarregamento automático (*auto-reload*) ativado.

Ao iniciar pela primeira vez:
- O banco de dados SQLite local (`testrunner.db`) será criado automaticamente.
- As tabelas e configurações padrão serão semeadas de forma transparente.

---

## 🔐 Variáveis de Ambiente

O arquivo [`.env.example`](.env.example) contém os parâmetros configuráveis:

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `APP_NAME` | `"TestRunner Pro"` | Nome da aplicação exibido na interface e logs |
| `DATABASE_URL` | `"sqlite+aiosqlite:///./testrunner.db"` | URL assíncrona de conexão com o banco de dados |
| `DEBUG` | `True` | Ativa logs detalhados e modo depuração |
| `DEFAULT_BROWSER` | `"chromium"` | Navegador padrão (`chromium`, `firefox`, `webkit`) |
| `DEFAULT_HEADLESS`| `True` | Se os testes devem rodar em segundo plano por padrão |
| `DEFAULT_TIMEOUT` | `30000` | Timeout padrão das execuções em milissegundos |
| `REPORTS_DIR` | `"./reports"` | Diretório onde os relatórios e logs serão gravados |

---

## 🖥️ Como Utilizar

### 1. Cadastrando Projetos
1. No menu lateral, acesse **Projetos** e clique em **Novo Projeto**.
2. Preencha o nome do projeto e selecione o tipo de teste (**Playwright** ou **Robot Framework**).
3. Informe o caminho absoluto do diretório onde estão localizados os testes (ex: `/home/usuario/meu-projeto/testes`).
4. (Opcional) Adicione variáveis de ambiente no formato `CHAVE=VALOR` específicas para esse projeto.

### 2. Orquestrador de Aplicações (App Manager)
Se seus testes precisam de serviços locais rodando (ex: um frontend Next.js/React e uma API Flask/Node):
1. No cadastro/edição do projeto, adicione **Comandos de Inicialização**.
2. Configure o comando (ex: `npm run dev`), o diretório de trabalho (`cwd`) e o tipo (`daemon` para servidores ou `oneshot` para scripts).
3. Ative a opção **"Iniciar automaticamente antes dos testes"** para que o TestRunner cuide do ciclo de vida da aplicação.

### 3. Executando Testes
1. Acesse o menu **Executar Testes**.
2. Selecione o projeto cadastrado. O TestRunner descobrirá automaticamente todos os arquivos de teste.
3. Escolha executar a **Suíte Completa**, **Testes Específicos** ou filtre por **Tags**.
4. Configure as opções de execução (Navegador, Headless, Debug).
5. Clique em **Iniciar Execução** e assista a saída do console no terminal integrado via WebSocket.

### 4. Agendando Execuções (Cron)
1. Vá até o menu **Agendamentos**.
2. Clique em **Novo Agendamento**, selecione o projeto e informe a expressão Cron desejada.
   - Exemplo diário às 3 da manhã: `0 3 * * *`
   - Exemplo a cada 30 minutos em dias úteis: `*/30 * * * 1-5`
3. O serviço em background executará os testes pontualmente sem necessidade de intervenção manual.

### 5. Visualizando Histórico e Relatórios
1. Acesse a aba **Histórico** para filtrar execuções passadas por status (*passed*, *failed*, *error*, *cancelled*).
2. Clique em qualquer execução para inspecionar os logs completos do console e abrir o relatório HTML gerado.

---

## 📡 Documentação da API & WebSockets

Com o servidor em execução, acesse a documentação interativa Swagger no navegador:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Principais Rotas REST:

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/projects` | Lista todos os projetos cadastrados |
| `POST` | `/api/projects` | Cadastra um novo projeto |
| `GET` | `/api/projects/{id}/tests` | Varre o filesystem e descobre testes do projeto |
| `POST` | `/api/projects/{id}/app/start` | Inicia os serviços da aplicação associada |
| `POST` | `/api/projects/{id}/app/stop` | Para os serviços da aplicação associada |
| `GET` | `/api/executions` | Consulta histórico de execuções com filtros |
| `GET` | `/api/executions/stats` | Estatísticas gerais do Dashboard (taxas e totais) |
| `POST` | `/api/executions` | Enfileira e dispara uma nova execução |
| `POST` | `/api/executions/{id}/cancel` | Cancela uma execução em andamento |
| `GET` | `/api/schedules` | Lista agendamentos configurados |
| `POST` | `/api/schedules` | Registra um novo agendamento Cron |
| `GET` | `/api/settings` | Obtém as preferências globais do sistema |

### Canais WebSocket:

- `ws://localhost:8000/ws/execution/{execution_id}`: Stream contínuo dos logs de terminal do executor de testes.
- `ws://localhost:8000/ws/app/{project_id}`: Stream contínuo dos logs de stdout/stderr das aplicações iniciadas pelo App Manager.

---

## 🔒 Boas Práticas de Segurança & Git

Este repositório inclui um arquivo [`.gitignore`](.gitignore) pronto para produção:
- ❌ **Nunca sobe credenciais:** Arquivos `.env`, chaves privadas (`*.pem`, `*.key`) e tokens são automaticamente ignorados.
- ❌ **Não sobe dados locais:** O arquivo de banco de dados SQLite (`testrunner.db`) e relatórios de execuções passadas (`reports/`) não são incluídos no commit.
- ✅ **Template seguro:** O arquivo [`.env.example`](.env.example) serve como guia seguro sem expor senhas ou chaves de produção.

---

## 📄 Licença

Este projeto está sob a licença [MIT](LICENSE). Sinta-se livre para utilizar, modificar e distribuir conforme as necessidades do seu time.

---

<div align="center">
  <sub>Construído com foco em produtividade e qualidade de software.</sub>
</div>
