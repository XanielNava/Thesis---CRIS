// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Elements for Case Data Upload
    const fileInput = document.getElementById('caseDataFile');
    const uploadLabel = document.querySelector('.file-upload');
    const uploadBtn = document.querySelector('#caseDataFile').closest('.card').querySelector('.btn-primary');
    const historyTableBody = document.getElementById('uploadHistoryTableBody');

    // Store the raw parsed data globally so we can access it later when saving to Firestore
    let parsedData = null; 

    // 2. Visual feedback when a file is selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadLabel.innerHTML = `📄 Selected: <strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            uploadLabel.style.borderColor = 'var(--primary-color, #007bff)';
        } else {
            resetUploadLabel();
        }
    });

    // 3. Handle the Upload & Process Action
    uploadBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file to upload first.');
            return;
        }

        // Show a loading/processing state
        const originalBtnText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Parsing Spreadsheet...';

        const reader = new FileReader();

        // This event fires once the browser finishes reading the raw file bytes
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                // SheetJS parses the binary data
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Target the first sheet of the workbook
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert sheet to a JSON array of objects
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    throw new Error("The selected spreadsheet is empty.");
                }

                // --- DATA VALIDATION ---
                // Let's grab the keys (column headers) of the first row
                const headers = Object.keys(jsonData[0]).map(h => h.trim().toLowerCase());
                
                // Define the essential columns we expect
                const hasMunicipality = headers.some(h => h.includes('municipality') || h.includes('location'));
                const hasYear = headers.some(h => h.includes('year'));
                const hasBites = headers.some(h => h.includes('bite') || h.includes('case'));

                if (!hasMunicipality || !hasYear || !hasBites) {
                    throw new Error("Invalid file structure. Make sure your file has columns for 'Municipality', 'Year', and 'Bite Cases'.");
                }

                // Save data to our variable for the next phase (database write)
                parsedData = jsonData; 

                // Format actual record count (e.g., 1,240)
                const recordCount = jsonData.length.toLocaleString();
                const uploadTime = new Date().toLocaleString('en-US', { 
                    month: '2-digit', 
                    day: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true 
                });

                // Add to our history table
                addHistoryRow(uploadTime, file.name, recordCount, 'Completed');

                alert(`Success! Successfully read ${recordCount} records from ${file.name}.`);
                resetUploadLabel();
                fileInput.value = ''; // Reset input element

            } catch (error) {
                console.error("Processing failed: ", error);
                alert(`Upload Failed: ${error.message}`);
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.textContent = originalBtnText;
            }
        };

        // Tell the reader to process the file as an ArrayBuffer
        reader.readAsArrayBuffer(file);
    });

    // Helper: Reset File Input Label
    function resetUploadLabel() {
        uploadLabel.innerHTML = `📤 Click to upload (CSV, XLSX, max 10MB)`;
        uploadLabel.style.borderColor = '';
    }

    // Helper: Inject new row into the history table
    function addHistoryRow(date, fileName, records, status) {
        const tr = document.createElement('tr');
        const statusClass = status.toLowerCase() === 'completed' ? 'success' : 'danger';

        tr.innerHTML = `
            <td>${date}</td>
            <td style="font-family: monospace;">${fileName}</td>
            <td>${records}</td>
            <td><span class="badge ${statusClass}">${status}</span></td>
        `;

        if (historyTableBody) {
            historyTableBody.insertBefore(tr, historyTableBody.firstChild);
        }
    }
});