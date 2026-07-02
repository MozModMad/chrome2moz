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

// NEW: URL Parameter Support
function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const autoConvert = params.get('autoconvert') === 'true';
    const autoDownload = params.get('autodownload') === 'true';

    console.log('🔗 URL Params detected:', { id, autoConvert, autoDownload });

    if (id) {
        console.log(`📦 Extension ID provided: ${id} (ready for future auto-fetch)`);
    }

    window.autoConvertFlag = autoConvert;
    window.autoDownloadFlag = autoDownload;
}

// Initialize WASM
async function initWasm() {
    try {
        wasmModule = await init();
        console.log('WASM module loaded successfully');
        
        // Handle API query parameters
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

// Event Listeners (unchanged)
fileInput.addEventListener('change', handleFileSelect);
uploadBox.addEventListener('dragover', handleDragOver);
uploadBox.addEventListener('dragleave', handleDragLeave);
uploadBox.addEventListener('drop', handleDrop);
uploadBox.addEventListener('click', (e) => {
    if (e.target === uploadBox || e.target.closest('.icon') || e.target.closest('.text')) {
        // Let label handle file dialog
    }
});
convertBtn.addEventListener('click', handleConvert);
cancelBtn.addEventListener('click', resetUI);
downloadBtn.addEventListener('click', handleDownload);
newConversionBtn.addEventListener('click', resetUI);
retryBtn.addEventListener('click', resetUI);

// File Handling (unchanged)
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
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
    if (file) processFile(file);
}

// Process uploaded file
async function processFile(file) {
    if (!file.name.endsWith('.zip')) {
        showError('Please upload a ZIP file containing your Chrome extension.');
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
        } catch (error) {
            console.warn('Shortcut analysis failed:', error);
            shortcutData = null;
        }

        showAnalysis(analysisData);

        // NEW: Auto-convert if URL param is set
        if (window.autoConvertFlag) {
            console.log('🚀 Auto-converting due to ?autoconvert=true');
            setTimeout(() => handleConvert(), 1200);
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showError(`Analysis failed: ${error.message || error}`);
    }
}

// ... (the rest of the functions like showAnalysis, groupIncompatibilities, etc. remain exactly the same) ...

// Handle conversion (unchanged except comment)
async function handleConvert() {
    if (!currentFile) {
        showError('No file selected');
        return;
    }

    showProcessing('Converting extension...');

    try {
        const geckoIdInput = document.getElementById('geckoIdInput');
        const geckoId = geckoIdInput ? geckoIdInput.value.trim() : '';
        
        if (geckoId && !validateGeckoId(geckoId)) {
            showError('Invalid extension ID format. Please use email format (e.g., extension@example.com)');
            return;
        }

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
        
        if (geckoId) console.log('Custom Gecko ID:', geckoId);
    } catch (error) {
        console.error('Conversion error:', error);
        showError(`Conversion failed: ${error.message || error}`);
    }
}

// showSuccess with auto-download
function showSuccess() {
    hideAllSections();
    successSection.style.display = 'block';
    
    if (analysisData) {
        const selectedFormat = document.querySelector('input[name="format"]:checked').value;
        const formatText = selectedFormat === 'xpi' ? 'XPI' : 'ZIP';
        downloadInfo.textContent = `${analysisData.extension_name} v${analysisData.extension_version} - Ready as ${formatText}`;
    }

    // NEW: Auto-download
    if (window.autoDownloadFlag && convertedData) {
        console.log('📥 Auto-downloading due to ?autodownload=true');
        setTimeout(handleDownload, 1500);
    }
}

// Rest of the file (hideAllSections, showProcessing, showError, resetUI, validateGeckoId, handleDownload, etc.) remains unchanged
