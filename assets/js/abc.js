// ABC.js - Complete PVO Animal Bite Cases Dashboard (Nested Schema Fixed)
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
        const q = query(collection(db, 'bite_reports'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const cases = [];
        
        querySnapshot.forEach((doc) => {
            cases.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        displayCases(cases);
        console.log(`${cases.length} reports loaded from bite_reports collection`);
    } catch (error) {
        console.error('Error loading cases:', error);
        displayCases([]); // Show empty table on error
    }
}

// Clean table display mapped perfectly to nested maps
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
        
        // Accurate deep path data extraction from Firestore layout
        const caseId = caseData.id?.slice(0, 8) || caseData.caseId || 'N/A';
        const municipality = caseData.incident?.municipality || caseData.municipality || 'N/A';
        const barangay = caseData.incident?.barangay || caseData.barangay || 'N/A';
        const animalType = caseData.animal?.species || caseData.animalType || 'N/A';
        const vaccinationStatus = caseData.medical?.patientVaccinationStatus || caseData.vaccinationStatus || 'Unknown';
        const clinicalLabResults = caseData.status || caseData.clinicalLabResults || 'Pending';
        const victimName = caseData.patient?.fullName || caseData.victimName || 'N/A';
        const victimAge = caseData.patient?.age || caseData.victimAge || 'N/A';
        
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
            
            // Constructs payload using the new nested layout structure
            const caseData = {
                userId: document.getElementById('caseId').value, // Maps ID string
                incident: {
                    municipality: document.getElementById('municipality').value,
                    barangay: document.getElementById('barangay').value,
                    date: new Date().toISOString().slice(0,10)
                },
                animal: {
                    species: document.getElementById('animalType').value,
                    vaccinationStatus: 'Unknown' // Default fallback configuration
                },
                medical: {
                    patientVaccinationStatus: document.getElementById('vaccinationStatus').value
                },
                patient: {
                    fullName: document.getElementById('victimName').value,
                    age: parseInt(document.getElementById('victimAge').value) || 0,
                    municipality: document.getElementById('municipality').value,
                    barangay: document.getElementById('barangay').value
                },
                createdAt: new Date(), // Saves as native Firestore timestamp format
                status: 'pending',
                updatedAt: new Date()
            };
            
            try {
                const docRef = await addDoc(collection(db, 'bite_reports'), caseData);
                console.log('Case saved to bite_reports:', docRef.id);
                alert(`✅ Case added for ${caseData.patient.fullName}`);
                closeCaseModal();
                await loadCases(); // Refresh UI Table
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
    
    // Search Feature Connection
    const searchInput = document.getElementById('caseSearch') || document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterCases(e.target.value);
        });
    }
    
    // Auto-load cases on startup
    await loadCases();
});

// Search table rows locally
function filterCases(searchTerm) {
    const rows = document.querySelectorAll('#casesTableBody tr');
    const term = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

// Export CSV Function (Targeting nested maps + Firestore Timestamp format safety fix)
window.exportCases = async function() {
    try {
        const q = query(collection(db, 'bite_reports'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const cases = [];
        
        snapshot.forEach(doc => {
            cases.push({ id: doc.id, ...doc.data() });
        });
        
        const csv = [
            // 1. Headers (Labels for the columns)
            ['userId', 'incident.municipality', 'incident.barangay', 'animal.species', 'medical.patientVaccinationStatus', 'status', 'patient.fullName', 'patient.age', 'createdAt'],
            
            // 2. Data rows mapping
            ...cases.map(c => {
                // Safely convert complex Firebase Timestamp Objects into basic strings
                let formattedDate = '';
                if (c.createdAt) {
                    formattedDate = typeof c.createdAt.toDate === 'function' 
                        ? c.createdAt.toDate().toISOString() 
                        : String(c.createdAt);
                }

                return [
                    c.userId || c.caseId || c.id || '',
                    `"${c.incident?.municipality || c.municipality || ''}"`,
                    `"${c.incident?.barangay || c.barangay || ''}"`,
                    c.animal?.species || c.animalType || '',
                    c.medical?.patientVaccinationStatus || c.vaccinationStatus || '',
                    c.status || c.clinicalLabResults || '',
                    `"${c.patient?.fullName || c.victimName || ''}"`,
                    c.patient?.age || c.patient?.victimAge || c.victimAge || '',
                    formattedDate
                ].join(',');
            })
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pvo-cases-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Export operation broken: ", error);
        alert('Export failed: ' + error.message);
    }
}