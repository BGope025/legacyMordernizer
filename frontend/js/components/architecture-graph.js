// Renders the legacy vs. modern microservice topology
class ArchitectureGraph {
    constructor(containerId = 'architectureGraph') {
        this.container = document.getElementById(containerId);
        this.legacySystem = null;
        this.modernServices = [];
        this.dependencies = [];
    }

    // Set the legacy system data
    setLegacySystem(systemData) {
        this.legacySystem = {
            ...systemData,
            type: 'legacy',
            id: 'legacy-system',
            label: systemData.name || 'Legacy Monolith'
        };
        this.render();
    }

    // Set modern microservices data
    setModernServices(servicesData) {
        this.modernServices = servicesData.map((service, index) => ({
            ...service,
            type: 'microservice',
            id: `microservice-${index}`,
            label: service.name || `Service ${index + 1}`
        }));
        this.render();
    }

    // Set dependencies between services
    setDependencies(dependenciesData) {
        this.dependencies = dependenciesData;
        this.render();
    }

    // Clear all data
    clear() {
        this.legacySystem = null;
        this.modernServices = [];
        this.dependencies = [];
        this.render();
    }

    // Render the architecture graph
    render() {
        if (!this.container) return;

        // Create SVG container
        this.container.innerHTML = `
            <div class="graph-wrapper">
                <svg class="architecture-svg" width="100%" height="400" viewBox="0 0 800 400">
                    <!-- Graph elements will be added here -->
                </svg>
            </div>
            <div class="graph-legend">
                <div class="legend-item">
                    <div class="legend-color legacy"></div>
                    <span>Legacy System</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color microservice"></div>
                    <span>Microservice</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color dependency"></div>
                    <span>Dependency</span>
                </div>
            </div>
        `;

        const svg = this.container.querySelector('.architecture-svg');
        if (!svg) return;

        // Clear existing elements
        svg.innerHTML = '';

        // If no data, show placeholder
        if (!this.legacySystem && this.modernServices.length === 0) {
            svg.innerHTML = `
                <text x="50%" y="50%" text-anchor="middle" dy=".3em"
                      fill="var(--color-gray)" font-size="16">
                    No architecture data available. Upload a legacy codebase to generate modernization plan.
                </text>
            `;
            return;
        }

        // Draw legacy system
        if (this.legacySystem) {
            this.drawLegacySystem(svg);
        }

        // Draw modern services
        this.modernServices.forEach((service, index) => {
            this.drawMicroservice(svg, service, index);
        });

        // Draw dependencies
        this.dependencies.forEach(dependency => {
            this.drawDependency(svg, dependency);
        });
    }

    // Draw legacy system (positioned on left)
    drawLegacySystem(svg) {
        const x = 100;
        const y = 200;
        const width = 120;
        const height = 80;

        // Draw box
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x - width/2);
        rect.setAttribute('y', y - height/2);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('fill', 'var(--color-dark)');
        rect.setAttribute('stroke', 'var(--color-primary)');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('rx', '8');
        svg.appendChild(rect);

        // Draw label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', 'var(--color-primary)');
        text.setAttribute('font-size', '14');
        text.setAttribute('font-weight', '600');
        text.textContent = this.legacySystem.label;
        svg.appendChild(text);

        // Draw icon (simple database cylinder representation)
        this.drawCylinderIcon(svg, x, y - 10, 20, 12, 'var(--color-primary)');
    }

    // Draw microservice (positioned on right in a column)
    drawMicroservice(svg, service, index) {
        const startX = 500;
        const startY = 100 + (index * 100);
        const width = 140;
        const height = 60;

        // Draw box
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', startX - width/2);
        rect.setAttribute('y', startY - height/2);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('fill', 'var(--color-dark)');
        rect.setAttribute('stroke', 'var(--color-success)');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('rx', '6');
        svg.appendChild(rect);

        // Draw label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', startX);
        text.setAttribute('y', startY - 10);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'var(--color-success)');
        text.setAttribute('font-size', '13');
        text.setAttribute('font-weight', '600');
        text.textContent = service.label;
        svg.appendChild(text);

        // Draw details (if any)
        if (service.type || service.description) {
            const detailText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            detailText.setAttribute('x', startX);
            detailText.setAttribute('y', startY + 10);
            detailText.setAttribute('text-anchor', 'middle');
            detailText.setAttribute('fill', 'var(--color-light)');
            detailText.setAttribute('font-size', '11');
            detailText.textContent = `${service.type || ''} ${service.description || ''}`.trim();
            svg.appendChild(detailText);
        }

        // Draw icon (simple gear/representation)
        this.drawGearIcon(svg, startX, startY - 25, 15);
    }

    // Draw dependency line between systems
    drawDependency(svg, dependency) {
        const { from, to, type, label } = dependency;

        // Find coordinates of from and to elements
        const fromPos = this.getElementPosition(from);
        const toPos = this.getElementPosition(to);

        if (!fromPos || !toPos) return;

        // Draw line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', fromPos.x);
        line.setAttribute('y1', fromPos.y);
        line.setAttribute('x2', toPos.x);
        line.setAttribute('y2', toPos.y);
        line.setAttribute('stroke', 'var(--color-info)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5,5');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        svg.appendChild(line);

        // Draw label if provided
        if (label) {
            const midX = (fromPos.x + toPos.x) / 2;
            const midY = (fromPos.y + toPos.y) / 2;

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY - 10);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', 'var(--color-info)');
            text.setAttribute('font-size', '12');
            text.textContent = label;
            svg.appendChild(text);
        }
    }

    // Get element position by ID (simplified)
    getElementPosition(id) {
        // In a real implementation, we'd store positions when drawing elements
        // For now, return approximate positions based on ID patterns
        if (id === 'legacy-system' || id.includes('legacy')) {
            return { x: 100, y: 200 };
        }

        // Modern services are positioned vertically on the right
        if (id.startsWith('microservice-')) {
            const index = parseInt(id.split('-')[1], 10);
            if (!isNaN(index)) {
                return { x: 500, y: 100 + (index * 100) };
            }
        }

        // Default position
        return { x: 400, y: 200 };
    }

    // Draw cylinder icon for legacy system
    drawCylinderIcon(svg, cx, cy, width, height, color) {
        // Top ellipse
        const topEllipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        topEllipse.setAttribute('cx', cx);
        topEllipse.setAttribute('cy', cy - height/2);
        topEllipse.setAttribute('rx', width/2);
        topEllipse.setAttribute('ry', height/4);
        topEllipse.setAttribute('fill', 'none');
        topEllipse.setAttribute('stroke', color);
        topEllipse.setAttribute('stroke-width', '1.5');
        svg.appendChild(topEllipse);

        // Bottom ellipse
        const bottomEllipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        bottomEllipse.setAttribute('cx', cx);
        bottomEllipse.setAttribute('cy', cy + height/2);
        bottomEllipse.setAttribute('rx', width/2);
        bottomEllipse.setAttribute('ry', height/4);
        bottomEllipse.setAttribute('fill', 'none');
        bottomEllipse.setAttribute('stroke', color);
        bottomEllipse.setAttribute('stroke-width', '1.5');
        svg.appendChild(bottomEllipse);

        // Left vertical line
        const leftLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        leftLine.setAttribute('x1', cx - width/2);
        leftLine.setAttribute('y1', cy - height/2);
        leftLine.setAttribute('x2', cx - width/2);
        leftLine.setAttribute('y2', cy + height/2);
        leftLine.setAttribute('stroke', color);
        leftLine.setAttribute('stroke-width', '1.5');
        svg.appendChild(leftLine);

        // Right vertical line
        const rightLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        rightLine.setAttribute('x1', cx + width/2);
        rightLine.setAttribute('y1', cy - height/2);
        rightLine.setAttribute('x2', cx + width/2);
        rightLine.setAttribute('y2', cy + height/2);
        rightLine.setAttribute('stroke', color);
        rightLine.setAttribute('stroke-width', '1.5');
        svg.appendChild(rightLine);
    }

    // Draw gear icon for microservices
    drawGearIcon(svg, cx, cy, radius) {
        const teeth = 8;
        const outerRadius = radius;
        const innerRadius = radius * 0.5;

        // Create gear path
        let pathData = '';
        for (let i = 0; i < teeth * 2; i++) {
            const angle = (i * Math.PI) / teeth;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);

            if (i === 0) {
                pathData += `M ${x} ${y}`;
            } else {
                pathData += `L ${x} ${y}`;
            }
        }
        pathData += ' Z';

        // Add center circle
        pathData += `M ${cx} ${cy - innerRadius/2} a ${innerRadius/2} ${innerRadius/2} 0 1 0 ${innerRadius} 0 a ${innerRadius/2} ${innerRadius/2} 0 1 0 -${innerRadius} 0`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--color-success)');
        path.setAttribute('stroke-width', '1.5');
        svg.appendChild(path);
    }
}

// Export for use in other modules
window.ArchitectureGraph = ArchitectureGraph;
