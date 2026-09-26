import { wsManager } from '../core/websocket.js';
import { api } from '../core/api.js';

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const uploadZone = document.getElementById('uploadZone');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressBar = uploadProgress?.querySelector('progress');
    const progressText = document.getElementById('progressText');
    const jobsList = document.getElementById('jobsList');
    const startBtn = document.getElementById('startBtn');
    const selectedFilePanel = document.getElementById('selectedFile');
    const selectedFileName = document.getElementById('selectedFileName');
    const removeFileBtn = document.getElementById('removeFileBtn');
    const jobsLabel = document.getElementById('jobsLabel');
    const jobCount = document.getElementById('jobCount');
    const toastRegion = document.getElementById('toastRegion');

    let selectedFile = null;
    let uploadInProgress = false;
    const jobs = [];

    initDashboard();

    function initDashboard() {
        browseBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (event) => selectFile(event.target.files?.[0]));
        removeFileBtn?.addEventListener('click', clearSelection);
        startBtn?.addEventListener('click', startModernization);
        uploadZone?.addEventListener('click', (event) => {
            if (event.target.closest('button')) return;
            fileInput?.click();
        });
        uploadZone?.addEventListener('dragover', handleDragOver);
        uploadZone?.addEventListener('dragleave', handleDragLeave);
        uploadZone?.addEventListener('drop', handleFileDrop);
        loadRecentJobs();

        wsManager.on('job-status-update', (data) => updateJobStatus(data.jobId, data.status));
        wsManager.on('job-completed', (data) => {
            updateJobStatus(data.jobId, 'completed');
            showToast(`Job ${data.jobId} completed successfully.`);
        });
    }

    function isZip(file) {
        return Boolean(file && (/\.zip$/i.test(file.name) || ['application/zip', 'application/x-zip-compressed'].includes(file.type)));
    }

    function selectFile(file) {
        if (!file) return;
        if (!isZip(file)) {
            showToast('Please select a .zip archive.', true);
            if (fileInput) fileInput.value = '';
            return;
        }
        selectedFile = file;
        if (selectedFileName) selectedFileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
        if (selectedFilePanel) selectedFilePanel.hidden = false;
        if (startBtn) startBtn.disabled = false;
        uploadZone?.classList.add('has-file');
        showToast('Archive ready to start.');
    }

    function clearSelection() {
        if (uploadInProgress) return;
        selectedFile = null;
        if (selectedFilePanel) selectedFilePanel.hidden = true;
        if (selectedFileName) selectedFileName.textContent = '';
        if (fileInput) fileInput.value = '';
        if (startBtn) startBtn.disabled = true;
        uploadZone?.classList.remove('has-file');
    }

    function handleDragOver(event) {
        event.preventDefault();
        uploadZone?.classList.add('dragover');
    }

    function handleDragLeave(event) {
        event.preventDefault();
        if (!uploadZone?.contains(event.relatedTarget)) uploadZone?.classList.remove('dragover');
    }

    function handleFileDrop(event) {
        event.preventDefault();
        uploadZone?.classList.remove('dragover');
        selectFile(event.dataTransfer?.files?.[0]);
    }

    async function startModernization() {
        if (!selectedFile || uploadInProgress) return;
        const file = selectedFile;
        uploadInProgress = true;
        if (startBtn) startBtn.disabled = true;
        if (removeFileBtn) removeFileBtn.disabled = true;
        if (browseBtn) browseBtn.disabled = true;
        if (uploadProgress) uploadProgress.style.display = 'flex';
        showToast('Uploading...');

        try {
            const formData = new FormData();
            formData.append('legacyCode', file);
            const uploadResponse = await api.request('/api/v1/upload', {
                method: 'POST',
                body: formData
            });
            const { jobId } = uploadResponse;
            showToast('Upload completed, starting plan...');

            // Plan
            const planResponse = await api.request('/api/v1/plan', {
                method: 'POST',
                body: JSON.stringify({ jobId }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const { planId } = planResponse;
            showToast('Plan generated, starting transformation...');

            // Transform
            const transformResponse = await api.request('/api/v1/transform', {
                method: 'POST',
                body: JSON.stringify({ planId, jobId }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const { transformationId } = transformResponse;
            showToast('Transformation completed, starting tests...');

            // Test
            const testResponse = await api.request('/api/v1/test', {
                method: 'POST',
                body: JSON.stringify({ jobId, transformationId }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const { testRunId } = testResponse;
            showToast('Tests completed.');
        } catch (error) {
            console.error(error);
            const message = error.response?.data?.message || error.message || 'Unknown error';
            showToast(`Error: ${message}`, true);
        } finally {
            uploadInProgress = false;
            if (uploadProgress) uploadProgress.style.display = 'none';
            if (progressBar) progressBar.value = 0;
            if (progressText) progressText.textContent = '0%';
            if (removeFileBtn) removeFileBtn.disabled = false;
            if (browseBtn) browseBtn.disabled = false;
            clearSelection();
        }
    }

    function loadRecentJobs() {
        renderJobs();
    }

    function renderJobs() {
        if (!jobsList) return;
        if (jobCount) jobCount.textContent = String(jobs.length);
        if (jobsLabel) jobsLabel.textContent = `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`;
        if (!jobs.length) {
            jobsList.innerHTML = '<div class="empty-state"><div class="empty-icon" aria-hidden="true">▤</div><strong>No modernization jobs yet</strong><p>Your latest uploads and their progress will show up here.</p></div>';
            return;
        }
        jobsList.innerHTML = jobs.map((job) => `
            <article class="job-item" data-job-id="${escapeHTML(job.id)}">
                <div class="job-info"><h4>${escapeHTML(job.name)}</h4><p class="job-id">${escapeHTML(job.id)}</p></div>
                <span class="status-badge status-${escapeHTML(job.status)}">${escapeHTML(job.status)}</span>
                <div class="job-timestamp">${new Date(job.startedAt).toLocaleString()}</div>
            </article>
        `).join('');
    }

    function addJobToList(job) {
        jobs.unshift(job);
        renderJobs();
    }

    function updateJobStatus(jobId, status) {
        const job = jobs.find((item) => String(item.id) === String(jobId));
        if (!job) return;
        job.status = status;
        renderJobs();
    }

    function showToast(message, isError = false) {
        if (!toastRegion) return;
        const toast = document.createElement('div');
        toast.className = `toast${isError ? ' error' : ''}`;
        toast.textContent = message;
        toastRegion.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3600);
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    }

    window.dashboard = { startModernization, addJobToList, loadRecentJobs };
});
