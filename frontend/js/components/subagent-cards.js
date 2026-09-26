// Dynamic UI showing which subagent is working on what module
class SubagentCards {
    constructor(containerId = 'agentsContainer') {
        this.container = document.getElementById(containerId);
        this.agents = new Map(); // agentId => agentData
    }

    // Add or update a subagent card
    updateAgent(agentData) {
        const { agentId, name, status, progress, currentTask, logs } = agentData;
        
        // Store agent data
        this.agents.set(agentId, { ...agentData, lastUpdated: Date.now() });
        
        // Render all agents
        this.render();
    }

    // Remove a subagent card
    removeAgent(agentId) {
        this.agents.delete(agentId);
        this.render();
    }

    // Clear all agents
    clearAgents() {
        this.agents.clear();
        this.render();
    }

    // Render all agent cards
    render() {
        if (!this.container) return;

        if (this.agents.size === 0) {
            this.container.innerHTML = `
                <div class="agent-placeholder">
                    <p>No active agents. Upload a legacy codebase to start modernization.</p>
                </div>
            `;
            return;
        }

        // Sort agents by last updated (newest first)
        const sortedAgents = Array.from(this.agents.entries())
            .sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated)
            .map(([id, data]) => ({ id, ...data }));

        this.container.innerHTML = `
            <div class="agent-cards-grid">
                ${sortedAgents.map(agent => this.createAgentCard(agent)).join('')}
            </div>
        `;
    }

    // Create individual agent card HTML
    createAgentCard(agent) {
        const { agentId, name, status, progress, currentTask, logs, lastUpdated } = agent;
        const statusClass = this.getStatusClass(status);
        const statusText = this.getStatusText(status);
        
        return `
            <div class="agent-card" data-agent-id="${agentId}">
                <div class="agent-card-header">
                    <h3 class="agent-card-title">${name}</h3>
                    <div class="agent-status ${statusClass}">
                        <span class="status-dot"></span>
                        <span>${statusText}</span>
                    </div>
                </div>
                
                <div class="agent-card-body">
                    ${currentTask ? `<p class="agent-task"><strong>Task:</strong> ${currentTask}</p>` : ''}
                    
                    ${progress !== undefined ? `
                        <div class="agent-progress">
                            <label>Progress:</label>
                            <progress value="${progress}" max="100"></progress>
                            <span class="progress-text">${progress}%</span>
                        </div>
                    ` : ''}
                    
                    ${logs && logs.length > 0 ? `
                        <div class="agent-logs">
                            <strong>Recent Logs:</strong>
                            <ul class="log-list">
                                ${logs.slice(-3).map(log => `
                                    <li class="log-entry log-${log.type || 'info'}">
                                        ${new Date(log.timestamp || Date.now()).toLocaleTimeString()}: ${log.message}
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
                
                <div class="agent-card-footer">
                    <small>Updated: ${new Date(lastUpdated).toLocaleTimeString()}</small>
                </div>
            </div>
        `;
    }

    // Helper methods
    getStatusClass(status) {
        switch (status.toLowerCase()) {
            case 'idle': return 'status-idle';
            case 'running': return 'status-running';
            case 'completed': return 'status-success';
            case 'failed': return 'status-error';
            case 'pending': return 'status-warning';
            default: return 'status-info';
        }
    }

    getStatusText(status) {
        switch (status.toLowerCase()) {
            case 'idle': return 'Idle';
            case 'running': return 'Running';
            case 'completed': return 'Completed';
            case 'failed': return 'Failed';
            case 'pending': return 'Pending';
            default: return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        }
    }
}

// Export singleton instance
export const subagentCards = new SubagentCards();
