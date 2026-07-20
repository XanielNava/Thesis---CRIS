// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Elements for Case Data Upload
    const fileInput = document.getElementById('caseDataFile');
    const uploadLabel = document.querySelector('.file-upload');
    const uploadBtn = document.querySelector('#caseDataFile').closest('.card').querySelector('.btn-primary');
    const historyTableBody = document.getElementById('uploadHistoryTableBody');

    // 2. Visual feedback when a file is selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Update label text to show the selected file
            uploadLabel.innerHTML = `📄 Selected: <strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            uploadLabel.style.borderColor = 'var(--primary-color, #007bff)';
        } else {
            resetUploadLabel();
        }
    });

    // 3. Handle the Upload & Process Action
    uploadBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file to upload first.');
            return;
        }

        // Show a loading/processing state on the button
        const originalBtnText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing File...';

        try {
            // Simulated processing delay (Replace this with your actual parsing/Firestore upload logic!)
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Example metadata - In production, count rows from your parser (e.g., SheetJS)
            const recordCount = "1,240"; // Placeholder count
            const uploadTime = new Date().toLocaleString('en-US', { 
                month: '2-digit', 
                day: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true 
            });

            // Add the new upload log to our history table
            addHistoryRow(uploadTime, file.name, recordCount, 'Completed');

            alert('Data uploaded and processed successfully!');
            resetUploadLabel();
            fileInput.value = ''; // Reset input

        } catch (error) {
            console.error("Upload failed: ", error);
            alert('An error occurred while processing the file.');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = originalBtnText;
        }
    });

    // Helper: Reset File Input Label
    function resetUploadLabel() {
        uploadLabel.innerHTML = `📤 Click to upload (CSV, XLSX, max 10MB)`;
        uploadLabel.style.borderColor = '';
    }

    // Helper: Inject new row into the history table
    function addHistoryRow(date, fileName, records, status) {
        const tr = document.createElement('tr');
        
        // Define status badge class
        const statusClass = status.toLowerCase() === 'completed' ? 'success' : 'danger';

        tr.innerHTML = `
            <td>${date}</td>
            <td style="font-family: monospace;">${fileName}</td>
            <td>${records}</td>
            <td><span class="badge ${statusClass}">${status}</span></td>
        `;

        // Prepend to show the latest upload at the top of the list
        if (historyTableBody) {
            historyTableBody.insertBefore(tr, historyTableBody.firstChild);
        }
    }
});