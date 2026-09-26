import { wsManager } from '../core/websocket.js';
import '../components/architecture-graph.js';

// Blueprint viewer page controller
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const blueprintSelect = document.getElementById('blueprintSelect');
    const blueprintContainer = document.getElementById('blueprintContainer');
    const architectureGraph = document.getElementById('architectureGraph');
    const refreshBtn = document.getElementById('refreshBlueprints');
    const exportBtn = document.getElementById('exportBlueprint');

    // State
    let blueprints = {};
    let selectedBlueprintId = null;

    // Initialize
    initBlueprintViewer();

    function initBlueprintViewer() {
        // Event listeners
        refreshBtn.addEventListener('click', refreshBlueprints);
        blueprintSelect.addEventListener('change', onBlueprintSelect);
        exportBtn.addEventListener('click', exportBlueprint);

        // Load initial blueprints
        loadBlueprints();

        // Set up WebSocket listeners for blueprint updates
        setupWebSocketListeners();
    }

    function setupWebSocketListeners() {
        // Listen for blueprint updates
        wsManager.on('blueprint-generated', (data) => {
            blueprints[data.blueprintId] = data;
            updateBlueprintSelect();

            // Auto-select if it's the first blueprint
            if (Object.keys(blueprints).length === 1) {
                selectBlueprint(data.blueprintId);
            }
        });

        wsManager.on('blueprint-updated', (data) => {
            blueprints[data.blueprintId] = {
                ...blueprints[data.blueprintId],
                ...data
            };
            updateBlueprintSelect();

            // Re-render if currently selected
            if (selectedBlueprintId === data.blueprintId) {
                renderBlueprint(data.blueprintId);
                renderArchitectureGraph(data);
            }
        });

        // Listen for architecture updates
        wsManager.on('architecture-update', (data) => {
            renderArchitectureGraph(data);
        });
    }

    function loadBlueprints() {
        // In a real app, this would fetch from API
        // For now, we'll show empty state
        updateBlueprintSelect();
    }

    function refreshBlueprints() {
        // In a real app, this would fetch from API
        showInfo('Refreshing blueprints...');
        // Simulate API call
        setTimeout(() => {
            showInfo('Blueprints refreshed');
        }, 1000);
    }

    function updateBlueprintSelect() {
        if (!blueprintSelect) return;

        // Save current selection
        const currentValue = blueprintSelect.value;

        // Clear and repopulate options
        blueprintSelect.innerHTML = '<option value="">Select a blueprint to view...</option>';

        Object.keys(blueprints).forEach(id => {
            const blueprint = blueprints[id];
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${blueprint.name || `Blueprint ${id}`} (${blueprint.serviceCount || 0} services)`;
            blueprintSelect.appendChild(option);
        });

        // Restore selection if still valid
        if (blueprints[currentValue]) {
            blueprintSelect.value = currentValue;
            onBlueprintSelect();
        } else if (Object.keys(blueprints).length > 0) {
            // Select first available
            const firstId = Object.keys(blueprints)[0];
            blueprintSelect.value = firstId;
            onBlueprintSelect(firstId);
        } else {
            blueprintSelect.value = '';
            onBlueprintSelect();
        }
    }

    function onBlueprintSelect(selectedId) {
        const blueprintId = selectedId || blueprintSelect.value;
        selectBlueprint(blueprintId);
    }

    function selectBlueprint(blueprintId) {
        if (!blueprintId || !blueprints[blueprintId]) {
            clearBlueprint();
            return;
        }

        selectedBlueprintId = blueprintId;
        renderBlueprint(blueprintId);

        // Also render architecture graph if available
        const blueprint = blueprints[blueprintId];
        if (blueprint.architecture) {
            renderArchitectureGraph(blueprint.architecture);
        }

        // Update UI
        if (blueprintSelect) blueprintSelect.value = blueprintId;
        if (exportBtn) exportBtn.disabled = false;
    }

    function clearBlueprint() {
        selectedBlueprintId = null;
        if (blueprintContainer) blueprintContainer.innerHTML = '<div class="empty-panel"><div class="empty-icon" aria-hidden="true">{ }</div><strong>No blueprint selected</strong><p>Choose a generated blueprint above to inspect its structure.</p></div>';
        if (architectureGraph) architectureGraph.innerHTML = '<div class="empty-panel"><div class="empty-icon" aria-hidden="true">⌘</div><strong>No architecture selected</strong><p>Choose a blueprint to see its legacy components and target services.</p></div>';
        if (blueprintSelect) blueprintSelect.value = '';
        if (exportBtn) exportBtn.disabled = true;
    }

    function renderBlueprint(blueprintId) {
        if (!blueprintContainer || !blueprints[blueprintId]) return;

        const blueprint = blueprints[blueprintId];

        // Format as JSON with syntax highlighting
        const jsonString = JSON.stringify(blueprint, null, 2);
        const highlightedJson = highlightJson(jsonString);

        blueprintContainer.innerHTML = `
            <div class="blueprint-header">
                <h3>${blueprint.name || `Blueprint ${blueprintId}`}</h3>
                <div class="blueprint-meta">
                    <span>ID: ${blueprintId}</span>
                    <span>Version: ${blueprint.version || '1.0.0'}</span>
                    <span>Generated: ${new Date(blueprint.generatedAt || Date.now()).toLocaleString()}</span>
                </div>
            </div>
            <div class="json-viewer">
                <pre class="json-code">${highlightedJson}</pre>
            </div>
        `;
    }

    function renderArchitectureGraph(architectureData) {
        if (!architectureGraph) return;

        if (!architectureData) {
            architectureGraph.innerHTML = '<p>No architecture data available</p>';
            return;
        }

        // Initialize architecture graph if not already done
        if (!window.archGraphInstance) {
            window.archGraphInstance = new ArchitectureGraph('architectureGraph');
        }

        // Set legacy system
        if (architectureData.legacySystem) {
            window.archGraphInstance.setLegacySystem(architectureData.legacySystem);
        }

        // Set modern services
        if (architectureData.modernServices) {
            window.archGraphInstance.setModernServices(architectureData.modernServices);
        }

        // Set dependencies
        if (architectureData.dependencies) {
            window.archGraphInstance.setDependencies(architectureData.dependencies);
        }
    }

    function exportBlueprint() {
        if (!selectedBlueprintId || !blueprints[selectedBlueprintId]) return;

        const blueprint = blueprints[selectedBlueprintId];
        const jsonString = JSON.stringify(blueprint, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `blueprint-${selectedBlueprintId}.json`;
        a.click();

        // Clean up
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
    }

    function highlightJson(json) {
        return json
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                let cls = 'number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'key';
                    } else {
                        cls = 'string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'boolean';
                } else if (/null/.test(match)) {
                    cls = 'null';
                }
                return '<span class="json-' + cls + '">' + match + '</span>';
            });
    }

    function showInfo(message) {
        const toastRegion = document.getElementById('toastRegion');
        if (!toastRegion) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastRegion.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    // Export functions for potential use elsewhere
    window.blueprintViewer = {
        init: initBlueprintViewer,
        refresh: refreshBlueprints,
        selectBlueprint: selectBlueprint,
        clear: clearBlueprint
    };
});
