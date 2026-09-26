import { wsManager } from '../core/websocket.js';
import { subagentCards } from '../components/subagent-cards.js';
import { terminalRenderer } from '../components/terminal-renderer.js';

document.addEventListener('DOMContentLoaded', () => {
    const agentsContainer = document.getElementById('agentsContainer');
    const clearLogsBtn = document.getElementById('clearLogs');
    const pauseLogsBtn = document.getElementById('pauseLogs');
    let isPaused = false;

    clearLogsBtn?.addEventListener('click', () => terminalRenderer.clear());
    pauseLogsBtn?.addEventListener('click', togglePause);

    wsManager.on('subagent-spawned', (data) => {
        subagentCards.updateAgent(data);
        renderAgents();
    });
    wsManager.on('subagent-updated', (data) => {
        subagentCards.updateAgent(data);
        renderAgents();
    });
    wsManager.on('subagent-completed', (data) => {
        subagentCards.updateAgent({ ...data, status: 'completed', progress: 100 });
        renderAgents();
    });
    wsManager.on('subagent-failed', (data) => {
        subagentCards.updateAgent({ ...data, status: 'failed' });
        renderAgents();
    });
    wsManager.on('terminal-log', (data) => {
        terminalRenderer.addLine(data.message, { type: data.level || 'info', timestamp: true });
    });
    wsManager.on('connect', () => addConnectionLog('Live connection established.', 'success'));
    wsManager.on('disconnect', () => addConnectionLog('Connection interrupted. Waiting for reconnect…', 'warning'));

    renderAgents();

    function renderAgents() {
        if (!agentsContainer) return;
        const agents = subagentCards.agents;
        if (!agents.size) {
            agentsContainer.innerHTML = '<div class="agent-placeholder"><div class="empty-icon" aria-hidden="true">◎</div><strong>No active agents</strong><p>Upload a legacy codebase from the dashboard to start modernization.</p></div>';
            return;
        }
        const sortedAgents = Array.from(agents.entries())
            .sort(([, first], [, second]) => second.lastUpdated - first.lastUpdated)
            .map(([id, data]) => ({ id, ...data }));
        agentsContainer.innerHTML = `<div class="agent-cards-grid">${sortedAgents.map((agent) => subagentCards.createAgentCard(agent)).join('')}</div>`;
    }

    function togglePause() {
        isPaused = !isPaused;
        if (isPaused) {
            terminalRenderer.pause();
            pauseLogsBtn.textContent = 'Resume stream';
            pauseLogsBtn.classList.add('paused');
        } else {
            terminalRenderer.resume();
            pauseLogsBtn.textContent = 'Pause stream';
            pauseLogsBtn.classList.remove('paused');
        }
    }

    function addConnectionLog(message, type) {
        terminalRenderer.addLine(message, { type, timestamp: true });
    }

    window.agentMonitor = { renderAgents, clearTerminal: () => terminalRenderer.clear(), togglePause };
});
