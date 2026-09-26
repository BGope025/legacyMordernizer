# IBM Bob 2.0 Modernization Pipeline

Autonomous Legacy-to-Cloud Modernization Pipeline for IBM Bob 2.0 Hackathon.

## Overview

This platform automates the refactoring of outdated monoliths (like old Java EE/Express apps) into modern, containerized microservices using IBM Bob 2.0 as an AI-powered SDLC partner.

## Architecture

- **Frontend (Developer Dashboard)**: React/Vue/Vite UI for uploading legacy code, monitoring AI agents, viewing blueprints, and compliance reports
- **Backend (Orchestrator)**: Node.js/Express server that ingests .zip files, triggers IBM Bob 2.0 CLI, manages AI task queues, and streams agent output via Socket.io
- **IBM Bob 2.0 Integration**: Custom .bob/configs, subagent prompts, and MCP tools for security scanning and legacy analysis
- **Dummy Legacy Monolith**: Terrible legacy code used for live demonstrations
- **Modernized Output**: Auto-generated microservices ready for deployment

## Key Features

- **Plan Mode**: Generates structural blueprints before code generation
- **Parallel Subagents**: Spawns isolated AI agents to rewrite different legacy modules concurrently
- **MCP Integration**: Custom local tools for security vulnerability scanning without sending logic to cloud
- **Real-time Monitoring**: WebSocket terminal showing Bob's subagents working in parallel
- **Compliance Dashboard**: Security audit and token-cost reporting

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Start development servers:
   ```bash
   npm run dev
   ```
   - Backend: http://localhost:5000
   - Frontend: http://localhost:5173 (or as configured)

## Project Structure

```
bob-modernizer/
├── frontend/                 # Developer Dashboard
├── server/                   # Node.js/Express Orchestration Backend
├── .bob/                     # IBM Bob 2.0 Native Configs & Workflows
├── dummy-legacy-monolith/    # Sacrificial App for Live Demo
├── modernized-output/        # Auto-generated Microservices Output
├── tests/                    # Automated Validation & Contract Testing
└── docs/                     # System Docs & Hackathon Deliverables
```

## Hackathon Preparation

See [docs/judging-pitch.md](./docs/judging-pitch.md) for the 3-minute pitch script and demo cheat sheet.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
