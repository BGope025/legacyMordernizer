import { wsManager } from '../core/websocket.js';

// Compliance page controller
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const reportDateEl = document.getElementById('reportDate');
    const jobIdEl = document.getElementById('jobId');
    const securityScoreEl = document.getElementById('securityScore');
    const codeQualityEl = document.getElementById('codeQuality');
    const testCoverageEl = document.getElementById('testCoverage');
    const technicalDebtEl = document.getElementById('technicalDebt');
    const totalTokensEl = document.getElementById('totalTokens');
    const estimatedCostEl = document.getElementById('estimatedCost');
    const tokensSavedEl = document.getElementById('tokensSaved');
    const modernizationSpeedEl = document.getElementById('modernizationSpeed');
    const downloadReportBtn = document.getElementById('downloadReport');
    const retestCodeBtn = document.getElementById('retestCode');
    const deployToStagingBtn = document.getElementById('deployToStaging');
    const securityFindingsEl = document.getElementById('securityFindings');
    const qualityFindingsEl = document.getElementById('qualityFindings');
    const performanceFindingsEl = document.getElementById('performanceFindings');

    // State
    let reportData = null;

    // Initialize
    initCompliancePage();

    function initCompliancePage() {
        // Event listeners
        if (downloadReportBtn) downloadReportBtn.addEventListener('click', downloadReport);
        if (retestCodeBtn) retestCodeBtn.addEventListener('click', retestCode);
        if (deployToStagingBtn) deployToStagingBtn.addEventListener('click', deployToStaging);

        // Set up WebSocket listeners for compliance updates
        setupWebSocketListeners();
        setupFindingsTabs();

        // Load initial data (in real app, would fetch from API)
        loadInitialData();
    }

    function setupWebSocketListeners() {
        // Listen for compliance report updates
        wsManager.on('compliance-report-generated', (data) => {
            reportData = data;
            renderComplianceReport(data);
        });

        wsManager.on('compliance-report-updated', (data) => {
            reportData = {
                ...reportData,
                ...data
            };
            renderComplianceReport(reportData);
        });

        // Listen for token analytics updates
        wsManager.on('token-analytics-updated', (data) => {
            if (reportData) {
                reportData.tokenAnalytics = {
                    ...(reportData.tokenAnalytics || {}),
                    ...data
                };
                renderComplianceReport(reportData);
            }
        });

        // Listen for findings updates
        wsManager.on('findings-updated', (data) => {
            if (reportData) {
                reportData.findings = {
                    ...(reportData.findings || {}),
                    ...data
                };
                renderComplianceReport(reportData);
            }
        });
    }

    function setupFindingsTabs() {
        const tabs = Array.from(document.querySelectorAll('.findings-tab'));
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((item) => {
                    const active = item === tab;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-selected', String(active));
                    item.tabIndex = active ? 0 : -1;
                });
                document.querySelectorAll('.findings-panel').forEach((panel) => {
                    panel.classList.toggle('active', panel.id === tab.getAttribute('aria-controls'));
                });
            });
        });
    }

    function loadInitialData() {
        // In a real app, this would fetch from API
        // For now, show placeholder data
        renderPlaceholderData();
    }

    function renderPlaceholderData() {
        // Set placeholder values
        if (reportDateEl) reportDateEl.textContent = 'Report generated: --';
        if (jobIdEl) jobIdEl.textContent = 'Job ID: --';
        if (securityScoreEl) securityScoreEl.textContent = '--/100';
        if (codeQualityEl) codeQualityEl.textContent = '--/100';
        if (testCoverageEl) testCoverageEl.textContent = '--%';
        if (technicalDebtEl) technicalDebtEl.textContent = '-- hrs';
        if (totalTokensEl) totalTokensEl.textContent = '--';
        if (estimatedCostEl) estimatedCostEl.textContent = '$--';
        if (tokensSavedEl) tokensSavedEl.textContent = '--%';
        if (modernizationSpeedEl) modernizationSpeedEl.textContent = '--x faster';

        // Clear findings sections
        if (securityFindingsEl) securityFindingsEl.innerHTML = '<p>No security data available</p>';
        if (qualityFindingsEl) qualityFindingsEl.innerHTML = '<p>No quality data available</p>';
        if (performanceFindingsEl) performanceFindingsEl.innerHTML = '<p>No performance data available</p>';

        // Disable action buttons
        if (downloadReportBtn) downloadReportBtn.disabled = true;
        if (retestCodeBtn) retestCodeBtn.disabled = true;
        if (deployToStagingBtn) deployToStagingBtn.disabled = true;
    }

    function renderComplianceReport(data) {
        reportData = data;

        // Update header info
        if (reportDateEl) {
            const date = data.generatedAt ? new Date(data.generatedAt) : new Date();
            reportDateEl.textContent = `Report generated: ${date.toLocaleString()}`;
        }
        if (jobIdEl) jobIdEl.textContent = `Job ID: ${data.jobId || '--'}`;

        // Update compliance summary
        if (securityScoreEl) {
            const score = data.securityScore !== undefined ? data.securityScore : 0;
            securityScoreEl.textContent = `${score}/100`;
            // Add color class based on score
            securityScoreEl.className = `metric-value ${getScoreClass(score)}`;
        }
        if (codeQualityEl) {
            const score = data.codeQuality !== undefined ? data.codeQuality : 0;
            codeQualityEl.textContent = `${score}/100`;
            codeQualityEl.className = `metric-value ${getScoreClass(score)}`;
        }
        if (testCoverageEl) {
            const coverage = data.testCoverage !== undefined ? data.testCoverage : 0;
            testCoverageEl.textContent = `${coverage}%`;
            testCoverageEl.className = `metric-value ${getScoreClass(coverage)}`;
        }
        if (technicalDebtEl) {
            const debt = data.technicalDebt !== undefined ? data.technicalDebt : 0;
            technicalDebtEl.textContent = `${debt} hrs`;
            // For technical debt, lower is better
            technicalDebtEl.className = `metric-value ${getDebtClass(debt)}`;
        }

        // Update token analytics
        if (totalTokensEl) {
            const tokens = data.totalTokens !== undefined ? data.totalTokens : 0;
            totalTokensEl.textContent = formatNumber(tokens);
        }
        if (estimatedCostEl) {
            const cost = data.estimatedCost !== undefined ? data.estimatedCost : 0;
            estimatedCostEl.textContent = `$${cost.toFixed(2)}`;
        }
        if (tokensSavedEl) {
            const saved = data.tokensSaved !== undefined ? data.tokensSaved : 0;
            tokensSavedEl.textContent = `${saved}%`;
        }
        if (modernizationSpeedEl) {
            const speed = data.modernizationSpeed !== undefined ? data.modernizationSpeed : 0;
            modernizationSpeedEl.textContent = `${speed}x faster`;
        }

        // Enable action buttons if we have data
        const hasData = !!data.jobId;
        if (downloadReportBtn) downloadReportBtn.disabled = !hasData;
        if (retestCodeBtn) retestCodeBtn.disabled = !hasData;
        if (deployToStagingBtn) deployToStagingBtn.disabled = !hasData;

        // Update findings sections
        renderFindingsSection('security', data.findings?.security, securityFindingsEl);
        renderFindingsSection('quality', data.findings?.quality, qualityFindingsEl);
        renderFindingsSection('performance', data.findings?.performance, performanceFindingsEl);
    }

    function renderFindingsSection(type, findings, container) {
        if (!container) return;

        if (!findings || (Array.isArray(findings) && findings.length === 0)) {
            container.innerHTML = `<p>No ${type} findings available</p>`;
            return;
        }

        if (Array.isArray(findings)) {
            container.innerHTML = `
                <ul class="findings-list">
                    ${findings.map(finding => `
                        <li class="finding-item">
                            <div class="finding-header">
                                <h4>${finding.title || 'Finding'}</h4>
                                <span class="finding-severity ${getSeverityClass(finding.severity)}">${finding.severity || 'info'}</span>
                            </div>
                            <div class="finding-description">${finding.description || 'No description available'}</div>
                            ${finding.location ? `<div class="finding-location"><small>Location: ${finding.location}</small></div>` : ''}
                            ${finding.recommendation ? `<div class="finding-recommendation"><strong>Recommendation:</strong> ${finding.recommendation}</div>` : ''}
                        </li>
                    `).join('')}
                </ul>
            `;
        } else {
            // Object format
            const findingsList = [];
            for (const [key, value] of Object.entries(findings || {})) {
                findingsList.push(`
                    <div class="finding-item">
                        <div class="finding-header">
                            <h4>${key}</h4>
                            <span class="finding-severity info">info</span>
                        </div>
                        <div class="finding-description">${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}</div>
                    </div>
                `);
            }
            container.innerHTML = `<ul class="findings-list">${findingsList.join('')}</ul>`;
        }
    }

    function getScoreClass(score) {
        if (score >= 90) return 'score-excellent';
        if (score >= 80) return 'score-good';
        if (score >= 70) return 'score-fair';
        return 'score-poor';
    }

    function getDebtClass(debt) {
        // For debt, lower is better
        if (debt <= 5) return 'debt-low';
        if (debt <= 15) return 'debt-moderate';
        return 'debt-high';
    }

    function getSeverityClass(severity) {
        switch (severity?.toLowerCase()) {
            case 'critical': return 'severity-critical';
            case 'high': return 'severity-high';
            case 'medium': return 'severity-medium';
            case 'low': return 'severity-low';
            case 'info': return 'severity-info';
            default: return 'severity-info';
        }
    }

    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    function downloadReport() {
        if (!reportData) return;

        // In a real app, this would generate and download a PDF report
        // For now, we'll download JSON
        const jsonString = JSON.stringify(reportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `compliance-report-${reportData.jobId || 'unknown'}.json`;
        a.click();

        // Clean up
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);

        showInfo('Compliance report downloaded');
    }

    function retestCode() {
        if (!reportData || !reportData.jobId) return;

        showInfo('Re-running code analysis...');
        // In a real app, this would trigger a re-analysis
        setTimeout(() => {
            showInfo('Code analysis completed');
        }, 3000);
    }

    function deployToStaging() {
        if (!reportData || !reportData.jobId) return;

        if (confirm('Are you sure you want to deploy this version to staging?')) {
            showInfo('Deploying to staging...');
            // In a real app, this would trigger deployment
            setTimeout(() => {
                showInfo('Deployment to staging initiated');
            }, 2000);
        }
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
    window.compliancePage = {
        init: initCompliancePage,
        renderReport: renderComplianceReport,
        downloadReport: downloadReport,
        retestCode: retestCode,
        deployToStaging: deployToStaging
    };
});
