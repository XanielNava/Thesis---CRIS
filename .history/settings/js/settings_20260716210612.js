// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Target elements precisely from your HTML structure
    const fileInput = document.getElementById('caseDataFile');
    const uploadLabel = fileInput.closest('.file-upload');
    const uploadBtn = fileInput.closest('.card').querySelector('.card-actions .btn-primary');
    const historyTableBody = document.getElementById('uploadHistoryTableBody');

    // Default placeholder text from your HTML
    const defaultLabelText = "📤 Click to upload (CSV, XLSX, max 10MB)";
    let parsedData = null; 

    // 2. Handle visual change when a file is selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const fileExt = file.name.split('.').pop().toUpperCase();
            
            // We temporarily replace the label's text, but make sure to keep the input element inside it!
            uploadLabel.innerHTML = `📄 <strong>${file.name}</strong> <span style="color: #e25c1d; font-weight: bold;">[${fileExt}]</span> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            // Re-append the file input so it doesn't get lost from the DOM
            uploadLabel.appendChild(fileInput);
        } else {
            resetUploadLabel();
        }
    });

    // 3. Handle data parsing when "Upload & Process" is clicked
    uploadBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file to upload first.');
            return;
        }

        const fileExt = file.name.split('.').pop().toLowerCase();
        const originalBtnText = uploadBtn.textContent;
        
        // Show progress state
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

                // --- SMART HEADER VALIDATION ---
                const rawHeaders = Object.keys(jsonData[0]);
                const cleanHeaders = rawHeaders.map(h => h.trim().toLowerCase());
                
                // Look for common name variations for locations, years, and cases
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

                // Fail gracefully if column headers aren't recognizable
                if (!matchedMunicipality || !matchedYear || !matchedBites) {
                    let missing = [];
                    if (!matchedMunicipality) missing.push("'Municipality/Location'");
                    if (!matchedYear) missing.push("'Year'");
                    if (!matchedBites) missing.push("'Bite Cases/Count'");

                    throw new Error(
                        `Missing required column(s): ${missing.join(', ')}.\n\n` +
                        `We found these columns in your file:\n[ ${rawHeaders.join(', ')} ]\n\n` +
                        `Please rename your spreadsheet columns to match our structure.`
                    );
                }

                // Save validated dataset for Firestore
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

                // Add to history table
                addHistoryRow(uploadTime, file.name, recordCount, 'Completed');

                // Dynamic success alert detailing file classification
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

    // Helper: Restore default text without dropping input element
    function resetUploadLabel() {
        if (uploadLabel) {
            uploadLabel.innerHTML = defaultLabelText;
            uploadLabel.appendChild(fileInput);
        }
    }

    // Helper: Push row to target history table
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