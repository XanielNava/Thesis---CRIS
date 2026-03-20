// ABC.js - Complete PVO Animal Bite Cases Dashboard (FIXED)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240",
    measurementId: "G-0X99BH7GW4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// GLOBAL FUNCTIONS for onclick handlers
window.openCaseModal = function() {
    document.getElementById('caseModal').style.display = 'flex';
}

window.closeCaseModal = function() {
    document.getElementById('caseModal').style.display = 'none';
    document.getElementById('caseForm').reset();
}

// Load cases from Firestore
async function loadCases() {
    try {
        const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const cases = [];
        
        querySnapshot.forEach((doc) => {
            cases.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        displayCases(cases);
        console.log(`${cases.length} cases loaded from Firestore`);
    } catch (error) {
        console.error('Error loading cases:', error);
        displayCases([]); // Show empty table on error
    }
}

// FIXED: Clean table display with proper formatting
function displayCases(cases) {
    const tbody = document.querySelector('#casesTableBody');
    if (!tbody) {
        console.log('Table body not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    if (cases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">No cases found</td></tr>';
        return;
    }
    
    cases.slice(0, 50).forEach((caseData) => { // Limit to 50 for performance
        const row = document.createElement('tr');
        
        // Clean data extraction - handles missing fields
        const caseId = caseData.caseId || caseData.id?.slice(0,8) || 'N/A';
        const municipality = caseData.municipality || 'N/A';
        const barangay = caseData.barangay || 'N/A';
        const animalType = caseData.animalType || 'N/A';
        const vaccinationStatus = caseData.vaccinationStatus || 'Unknown';
        const clinicalLabResults = caseData.clinicalLabResults || 'Pending';
        const victimName = caseData.victimName || 'N/A';
        const victimAge = caseData.victimAge || 'N/A';
        
        row.innerHTML = `
            <td style="font-weight: 600;">${caseId}</td>
            <td>${municipality}</td>
            <td>${barangay}</td>
            <td>${animalType}</td>
            <td><span class="status-badge vaccinated">${vaccinationStatus}</span></td>
            <td><span class="status-badge ${clinicalLabResults.toLowerCase()}">${clinicalLabResults}</span></td>
            <td>${victimName}</td>
            <td style="text-align: center; font-weight: 500;">${victimAge}</td>
        `;
        tbody.appendChild(row);
    });
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async function() {
    console.log('PVO Dashboard loaded');
    
    // Form submission
    const caseForm = document.getElementById('caseForm');
    if (caseForm) {
        caseForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitCaseBtn');
            submitBtn.textContent = 'Adding...';
            submitBtn.disabled = true;
            
            const caseData = {
                caseId: document.getElementById('caseId').value,
                municipality: document.getElementById('municipality').value,
                barangay: document.getElementById('barangay').value,
                animalType: document.getElementById('animalType').value,
                vaccinationStatus: document.getElementById('vaccinationStatus').value,
                clinicalLabResults: document.getElementById('clinicalLabResults').value,
                victimName: document.getElementById('victimName').value,
                victimAge: parseInt(document.getElementById('victimAge').value),
                createdAt: new Date().toISOString(),
                status: 'pending',
                updatedAt: new Date().toISOString()
            };
            
            try {
                const docRef = await addDoc(collection(db, 'cases'), caseData);
                console.log('Case saved:', docRef.id);
                alert(`✅ Case ${caseData.caseId} added for ${caseData.victimName}`);
                closeCaseModal();
                await loadCases(); // Refresh table
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Failed: ' + error.message);
            } finally {
                submitBtn.textContent = 'Add Case';
                submitBtn.disabled = false;
            }
        });
    }
    
    // Modal overlay close
    const modal = document.getElementById('caseModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal-overlay')) {
                closeCaseModal();
            }
        });
    }
    
    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterCases(e.target.value);
        });
    }
    
    // Auto-load cases
    await loadCases();
});

// Search cases
function filterCases(searchTerm) {
    const rows = document.querySelectorAll('#casesTableBody tr');
    const term = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

// Export CSV
window.exportCases = async function() {
    try {
        const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const cases = [];
        
        snapshot.forEach(doc => {
            cases.push({ id: doc.id, ...doc.data() });
        });
        
        const csv = [
            ['Case ID','Municipality','Barangay','Animal','Vaccine','Lab','Victim','Age','Date'],
            ...cases.map(c => [
                c.caseId || '',
                `"${c.municipality || ''}"`,
                `"${c.barangay || ''}"`,
                c.animalType || '',
                c.vaccinationStatus || '',
                c.clinicalLabResults || '',
                `"${c.victimName || ''}"`,
                c.victimAge || '',
                c.createdAt || ''
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pvo-cases-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert('Export failed: ' + error.message);
    }
}
