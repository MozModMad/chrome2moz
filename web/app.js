// Import WASM module
import init, {
    convert_extension_zip,
    convert_extension_zip_with_shortcuts,
    analyze_extension_zip,
    analyze_keyboard_shortcuts
} from './pkg/chrome2moz.js';

// State
let wasmModule = null;
let currentFile = null;
let analysisData = null;
let convertedData = null;
let shortcutData = null;
let selectedShortcuts = new Map(); // Map of original shortcut -> selected alternative

// NEW: URL Parameter Support + CRX Auto-Fetch
async function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const autoConvert = params.get('autoconvert') === 'true';
    const autoDownload = params.get('autodownload') === 'true';

    console.log('🔗 URL Params detected:', { id, autoConvert, autoDownload });

    if (id) {
        console.log(`📦 Starting auto-fetch for Chrome extension ID: ${id}`);
        await autoFetchAndConvertCRX(id, autoConvert, autoDownload);
        return;
    }

    // Fallback for non-id params
    window.autoConvertFlag = autoConvert;
    window.autoDownloadFlag = autoDownload;
}

async function autoFetchAndConvertCRX(extensionId, autoConvert, autoDownload) {
    showProcessing('Downloading extension from Chrome Web Store...');

    try {
        // Chrome Web Store CRX download URL
        const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=128.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;

        const response = await fetch(crxUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Could not download extension`);
        }

        const blob = await response.blob();
        currentFile = new File([blob], `${extensionId}.zip`, { type: 'application/zip' });

        // Analyze
        const arrayBuffer = await currentFile.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        statusDetail.textContent = 'Analyzing downloaded extension...';
        const analysisJson = analyze_extension_zip(uint8Array);
        analysisData = JSON.parse(analysisJson);

        showAnalysis(analysisData);

        if (autoConvert) {
            console.log('🚀 Auto-converting...');
            setTimeout(() => handleConvert(), 1200);
        }
    } catch (error) {
        console.error('CRX fetch error:', error);
        showError(`Failed to download extension ${extensionId}. It may be private or removed from Chrome Web Store.`);
    }
}

// Initialize WASM
async function initWasm() {
    try {
        wasmModule = await init();
        console.log('WASM module loaded successfully');
        handleUrlParameters();
    } catch (error) {
        console.error('Failed to load WASM module:', error);
        showError('Failed to initialize converter. Please refresh the page.');
    }
}

// DOM Elements
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const processingSection = document.getElementById('processingSection');
const analysisSection = document.getElementById('analysisSection');
const successSection = document.getElementById('successSection');
const errorSection = document.getElementById('errorSection');
const statusMessage = document.getElementById('statusMessage');
const statusDetail = document.getElementById('statusDetail');
const analysisResults = document.getElementById('analysisResults');
const convertBtn = document.getElementById('convertBtn');
const cancelBtn = document.getElementById('cancelBtn');
const downloadBtn = document.getElementById('downloadBtn');
const newConversionBtn = document.getElementById('newConversionBtn');
const retryBtn = document.getElementById('retryBtn');
const errorMessage = document.getElementById('errorMessage');
const downloadInfo = document.getElementById('downloadInfo');

// Event Listeners
fileInput.addEventListener('change', handleFileSelect);
uploadBox.addEventListener('dragover', handleDragOver);
uploadBox.addEventListener('dragleave', handleDragLeave);
uploadBox.addEventListener('drop', handleDrop);
uploadBox.addEventListener('click', (e) => {
    if (e.target === uploadBox || e.target.closest('.icon') || e.target.closest('.text')) {
        // Let the label's default behavior handle opening file dialog
    }
});
convertBtn.addEventListener('click', handleConvert);
cancelBtn.addEventListener('click', resetUI);
downloadBtn.addEventListener('click', handleDownload);
newConversionBtn.addEventListener('click', resetUI);
retryBtn.addEventListener('click', resetUI);

// File Handling
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    uploadBox.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadBox.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadBox.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file) {
        processFile(file);
    }
}

// Process uploaded file
async function processFile(file) {
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.crx')) {
        showError('Please upload a ZIP or CRX file containing your Chrome extension.');
        return;
    }

    currentFile = file;
    showProcessing('Analyzing extension...');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        statusDetail.textContent = 'Checking for incompatibilities...';
        const analysisJson = analyze_extension_zip(uint8Array);
        analysisData = JSON.parse(analysisJson);

        statusDetail.textContent = 'Checking keyboard shortcuts...';
        try {
            const shortcutJson = analyze_keyboard_shortcuts(uint8Array);
            shortcutData = JSON.parse(shortcutJson);
            console.log('Shortcut analysis:', shortcutData);
        } catch (error) {
            console.warn('Shortcut analysis failed:', error);
            shortcutData = null;
        }

        showAnalysis(analysisData);

        if (window.autoConvertFlag) {
            console.log('🚀 Auto-converting due to URL parameter...');
            setTimeout(() => handleConvert(), 1200);
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showError(`Analysis failed: ${error.message || error}`);
    }
}

// Show analysis results
function showAnalysis(data) {
    hideAllSections();
    analysisSection.style.display = 'block';

    let html = '<div class="stats-grid">';
    html += `<div class="stat-card"><div class="label">Extension</div><div class="value">${data.extension_name}</div></div>`;
    html += `<div class="stat-card"><div class="label">Version</div><div class="value">${data.extension_version}</div></div>`;
    html += `<div class="stat-card"><div class="label">Manifest</div><div class="value">v${data.manifest_version}</div></div>`;
    html += `<div class="stat-card"><div class="label">Files</div><div class="value">${data.file_count}</div></div>`;
    html += `<div class="stat-card"><div class="label">Lines</div><div class="value">${data.line_count}</div></div>`;
    html += `<div class="stat-card"><div class="label">Issues</div><div class="value">${data.incompatibilities.length}</div></div>`;
    html += '</div>';

    const categories = groupIncompatibilities(data.incompatibilities);

    if (data.incompatibilities.length === 0) {
        html += '<div style="text-align: center; padding: 2rem; color: var(--text-primary);">';
        html += '<h3>✓ No incompatibilities found</h3>';
        html += '<p>This extension should work well in Firefox.</p>';
        html += '</div>';
    } else {
        const severityOrder = { 'Blocker': 0, 'Major': 1, 'Minor': 2, 'Info': 3 };
        const sortedCategories = Object.keys(categories).sort((a, b) => {
            const issuesA = categories[a];
            const issuesB = categories[b];
            const maxSeverityA = Math.min(...issuesA.map(i => severityOrder[i.severity] ?? 4));
            const maxSeverityB = Math.min(...issuesB.map(i => severityOrder[i.severity] ?? 4));
            return maxSeverityA - maxSeverityB;
        });

        sortedCategories.forEach((category, index) => {
            const issues = categories[category];
            if (issues.length > 0) {
                html += renderCollapsibleSection(category, issues, index === 0);
            }
        });
    }

    if (data.warnings && data.warnings.length > 0) {
        html += renderCollapsibleSection('Warnings', data.warnings.map(w => ({
            description: `<strong>${w.location || 'General'}:</strong> ${w.message}`,
            severity: 'Info'
        })), false);
    }

    if (shortcutData) {
        html += renderShortcutAnalysis(shortcutData);
    }

    analysisResults.innerHTML = html;

    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', toggleSection);
    });
    
    setupShortcutSelectors();
}

function groupIncompatibilities(incompatibilities) {
    const categories = {
        'Simple Namespace Conversions (chrome → browser)': [],
        'Callback-Style API Updates': [],
        'Manifest Modifications': [],
        'APIs Using Compatibility Shims': [],
        'APIs Using Stubs (No-op)': [],
        'APIs with Workarounds': [],
        'Unsupported APIs (No Firefox Equivalent)': [],
        'Permission Updates': [],
        'Configuration Changes': []
    };

    incompatibilities.forEach(issue => {
        const desc = issue.description.toLowerCase();
        const location = issue.location.toLowerCase();

        const isJustNamespace = (desc.includes('chrome namespace usage') || desc.includes('will be converted to browser'))
            && !desc.includes('callback') && !desc.includes('shim') && !desc.includes('stub') 
            && !desc.includes('workaround') && !desc.includes('unsupported');

        if (isJustNamespace) {
            categories['Simple Namespace Conversions (chrome → browser)'].push(issue);
        } else if (desc.includes('callback') || desc.includes('promise') || (desc.includes('async') && !location.includes('manifest'))) {
            categories['Callback-Style API Updates'].push(issue);
        } else if (location.includes('manifest') || desc.includes('manifest.json') || desc.includes('browser_specific_settings')) {
            categories['Manifest Modifications'].push(issue);
        } else if (issue.auto_fixable && desc.includes('chrome-only api')) {
            categories['APIs Using Compatibility Shims'].push(issue);
        } else if (desc.includes('shim') || desc.includes('polyfill') || desc.includes('storage.session') || desc.includes('sidepanel')) {
            categories['APIs Using Compatibility Shims'].push(issue);
        } else if (desc.includes('stub') || desc.includes('tabgroups') || desc.includes('privacy api')) {
            categories['APIs Using Stubs (No-op)'].push(issue);
        } else if (desc.includes('workaround') || desc.includes('offscreen') || desc.includes('declarativecontent')) {
            categories['APIs with Workarounds'].push(issue);
        } else if (desc.includes('chrome-only api') && !issue.auto_fixable) {
            categories['Unsupported APIs (No Firefox Equivalent)'].push(issue);
        } else if (desc.includes('permission') && !location.includes('manifest')) {
            categories['Permission Updates'].push(issue);
        } else if (desc.includes('gecko.id') || desc.includes('extension id')) {
            categories['Configuration Changes'].push(issue);
        }
    });

    Object.keys(categories).forEach(key => {
        if (categories[key].length === 0) delete categories[key];
    });

    return categories;
}

function renderCollapsibleSection(title, issues, isExpanded = true) {
    const sectionId = title.replace(/\s+/g, '-').toLowerCase();
    const expandedClass = isExpanded ? '' : 'collapsed';
    
    const commonSeverity = issues.every(i => i.severity === issues[0].severity) ? issues[0].severity : null;
    const allAutoFixable = issues.every(i => i.auto_fixable);
    const commonSuggestion = issues.every(i => i.suggestion === issues[0].suggestion) ? issues[0].suggestion : null;
    
    let html = '<div class="analysis-section">';
    html += `<div class="section-header ${expandedClass}" data-section="${sectionId}">`;
    html += '<div class="section-header-content">';
    html += `<h3>${title}</h3>`;
    html += '<div class="section-meta">';
    html += `<span class="section-count">${issues.length} change${issues.length !== 1 ? 's' : ''}</span>`;
    html += '</div>';
    html += '</div>';
    html += '<span class="toggle-icon">▼</span>';
    html += '</div>';
    html += `<div class="section-content ${expandedClass}" id="${sectionId}">`;
    
    if (commonSeverity || allAutoFixable || commonSuggestion) {
        html += '<div class="common-attributes">';
        if (commonSeverity) html += `<span class="severity-badge severity-${commonSeverity.toLowerCase()}">${commonSeverity}</span>`;
        if (allAutoFixable) html += '<span class="auto-fixable-badge">✓ Auto-fix</span>';
        if (commonSuggestion) html += `<div class="common-suggestion">💡 ${commonSuggestion}</div>`;
        html += '</div>';
    }
    
    html += '<div class="compact-issue-list">';
    issues.forEach(issue => {
        html += renderCompactIssue(issue, commonSeverity, allAutoFixable, commonSuggestion);
    });
    html += '</div>';
    
    html += '</div>';
    html += '</div>';
    return html;
}

function renderCompactIssue(issue, commonSeverity, commonAutoFix, commonSuggestion) {
    let html = '<div class="compact-issue">';
    const showSeverity = !commonSeverity;
    const showAutoFix = !commonAutoFix && issue.auto_fixable;
    
    if (showSeverity || showAutoFix) {
        html += '<div class="issue-badges">';
        if (showSeverity) html += `<span class="severity-badge severity-${issue.severity.toLowerCase()}">${issue.severity}</span>`;
        if (showAutoFix) html += '<span class="auto-fixable-badge">✓</span>';
        html += '</div>';
    }
    
    html += `<div class="issue-location">${issue.location}</div>`;
    html += `<div class="issue-description">${issue.description}</div>`;
    html += '</div>';
    return html;
}

function toggleSection(e) {
    const header = e.currentTarget;
    const sectionId = header.dataset.section;
    const content = document.getElementById(sectionId);
    header.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}

function renderShortcutAnalysis(shortcutData) {
    const hasConflicts = shortcutData.conflicts && shortcutData.conflicts.length > 0;
    const hasSafe = shortcutData.safe_shortcuts && shortcutData.safe_shortcuts.length > 0;
    
    if (!hasConflicts && !hasSafe) return '';

    let html = '<div class="analysis-section shortcut-section">';
    html += '<div class="section-header" data-section="keyboard-shortcuts">';
    html += '<div class="section-header-content">';
    html += '<h3>⌨️ Keyboard Shortcuts</h3>';
    html += '<div class="section-meta">';
    if (hasConflicts) {
        html += `<span class="section-count">${shortcutData.conflicts.length} conflicts</span>`;
    } else {
        html += '<span class="section-count">✓ No conflicts</span>';
    }
    html += '</div>';
    html += '</div>';
    html += '<span class="toggle-icon">▼</span>';
    html += '</div>';
    html += '<div class="section-content" id="keyboard-shortcuts">';
    html += '</div></div>';
    return html;
}

function renderShortcutConflict(conflict, index) {
    return `<div class="shortcut-conflict">Conflict for ${conflict.chrome_shortcut}</div>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupShortcutSelectors() {}

// Handle conversion
async function handleConvert() {
    if (!currentFile) {
        showError('No file selected');
        return;
    }

    showProcessing('Converting extension...');

    try {
        const geckoIdInput = document.getElementById('geckoIdInput');
        const geckoId = geckoIdInput ? geckoIdInput.value.trim() : '';

        const arrayBuffer = await currentFile.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        statusDetail.textContent = 'Transforming files...';
        
        if (selectedShortcuts.size > 0) {
            const replacements = JSON.stringify(Object.fromEntries(selectedShortcuts));
            convertedData = convert_extension_zip_with_shortcuts(uint8Array, replacements);
        } else {
            convertedData = convert_extension_zip(uint8Array);
        }

        showSuccess();
    } catch (error) {
        console.error('Conversion error:', error);
        showError(`Conversion failed: ${error.message || error}`);
    }
}

function validateGeckoId(id) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(id);
}

function handleDownload() {
    if (!convertedData) {
        showError('No converted data available');
        return;
    }

    try {
        const selectedFormat = document.querySelector('input[name="format"]:checked').value || 'xpi';
        const extension = selectedFormat === 'xpi' ? 'xpi' : 'zip';
        
        const blob = new Blob([convertedData], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(analysisData ? analysisData.extension_name : 'extension')}-firefox.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to download file.');
    }
}

// UI State Management
function hideAllSections() {
    document.querySelector('.upload-section').style.display = 'none';
    processingSection.style.display = 'none';
    analysisSection.style.display = 'none';
    successSection.style.display = 'none';
    errorSection.style.display = 'none';
}

function showProcessing(message) {
    hideAllSections();
    processingSection.style.display = 'block';
    statusMessage.textContent = message;
    statusDetail.textContent = 'This may take a moment...';
}

function showSuccess() {
    hideAllSections();
    successSection.style.display = 'block';
    
    if (analysisData) {
        const selectedFormat = document.querySelector('input[name="format"]:checked') ? document.querySelector('input[name="format"]:checked').value : 'xpi';
        const formatText = selectedFormat === 'xpi' ? 'XPI' : 'ZIP';
        downloadInfo.textContent = `${analysisData.extension_name} v${analysisData.extension_version} - Ready as ${formatText}`;
    }

    if (window.autoDownloadFlag && convertedData) {
        console.log('📥 Auto-downloading...');
        setTimeout(handleDownload, 1500);
    }
}

function showError(message) {
    hideAllSections();
    errorSection.style.display = 'block';
    errorMessage.textContent = message;
}

function resetUI() {
    currentFile = null;
    analysisData = null;
    convertedData = null;
    fileInput.value = '';
    hideAllSections();
    document.querySelector('.upload-section').style.display = 'block';
}

// Initialize on load
initWasm();
