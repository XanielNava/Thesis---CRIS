// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Elements for Case Data Upload
    const fileInput = document.getElementById('caseDataFile');
    const fileNameDisplay = document.getElementById('uploadedFileName'); // Target the new filename text span
    const uploadBtn = document.querySelector('#caseDataFile').closest('.card').querySelector('.btn-primary');
    const historyTableBody = document.getElementById('uploadHistoryTableBody');

    let parsedData = null; 

    // 2. Visual feedback when a file is selected (Populates the filename next to the button)
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const fileExt = file.name.split('.').pop().toUpperCase();
            // Update only the text on the right of your "Choose File" button
            fileNameDisplay.innerHTML = `<strong>${file.name}</strong> <span style="color: var(--primary-color, #e25c1d); font-weight: bold;">[${fileExt}]</span> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
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

        const fileExt = file.name.split('.').pop().toLowerCase();
        const originalBtnText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Parsing Spreadsheet...';

        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    throw new Error("The selected spreadsheet is empty.");
                }

                // --- SMART HEADER NORMALIZATION & VALIDATION ---
                const rawHeaders = Object.keys(jsonData[0]);
                const cleanHeaders = rawHeaders.map(h => h.trim().toLowerCase());
                
                // Flexible matching for expected animal bite case columns
                const matchedMunicipality = rawHeaders.find((_, i) => 
                    cleanHeaders[i].includes('municipality') || 
                    cleanHeaders[i].includes('location') || 
                    cleanHeaders[i].includes('town') || 
                    cleanHeaders[i].includes('city')
                );

                const matchedYear = rawHeaders.find((_, i) => 
                    cleanHeaders[i].includes('year') || 
                    cleanHeaders[i].includes('yr')
                );

                const matchedBites = rawHeaders.find((_, i) => 
                    cleanHeaders[i].includes('bite') || 
                    cleanHeaders[i].includes('case') || 
                    cleanHeaders[i].includes('count')
                );

                // Validation Guard
                if (!matchedMunicipality || !matchedYear || !matchedBites) {
                    let missing = [];
                    if (!matchedMunicipality) missing.push("'Municipality/Location'");
                    if (!matchedYear) missing.push("'Year'");
                    if (!matchedBites) missing.push("'Bite Cases/Count'");

                    throw new Error(
                        `Missing required column(s): ${missing.join(', ')}.\n\n` +
                        `We detected these headers in your file:\n[ ${rawHeaders.join(', ')} ]\n\n` +
                        `Please rename your columns or use a valid dataset format.`
                    );
                }

                // Save validated dataset for database insertion
                parsedData = jsonData; 

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

                // Dynamic success confirmation pop-up
                alert(
                    `🎉 Success! File Processed.\n\n` +
                    `📁 File Type: ${fileExt.toUpperCase()}\n` +
                    `📄 Sheet Name: "${firstSheetName}"\n` +
                    `📊 Total Records: ${recordCount} rows\n\n` +
                    `Mapped Columns:\n` +
                    `📍 Location ➔ "${matchedMunicipality}"\n` +
                    `📅 Timeframe ➔ "${matchedYear}"\n` +
                    `🐕 Cases ➔ "${matchedBites}"`
                );

                resetUploadLabel();
                fileInput.value = ''; 

            } catch (error) {
                console.error("Processing failed: ", error);
                alert(`⚠️ Upload Failed:\n${error.message}`);
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.textContent = originalBtnText;
            }
        };

        reader.readAsArrayBuffer(file);
    });

    // Helper: Reset dynamic filename text
    function resetUploadLabel() {
        if (fileNameDisplay) {
            fileNameDisplay.textContent = 'No file chosen';
        }
    }

    // Helper: Inject dynamic row into history table
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