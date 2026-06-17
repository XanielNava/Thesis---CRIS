/**
 * CRIS CORE ENGINE - PATIENT REGISTRY & REAL-TIME SEARCH COMPONENT
 */
document.addEventListener('DOMContentLoaded', () => {

    // Mock Data Matrix Store representing existing server database tables
    let patientMockDatabase = [
        { id: "#PAT-2026-001", name: "Juan Antonio Santos", age: 32, exposure: "Dog Bite", category: "Category III", date: "2026-01-01", status: "In Progress" },
        { id: "#PAT-2026-002", name: "Elena Gomez Rodriguez", age: 28, exposure: "Cat Bite", category: "Category II", date: "2025-12-28", status: "Completed" },
        { id: "#PAT-2026-003", name: "Carlos Mendoza", age: 45, exposure: "Dog Bite", category: "Category III", date: "2025-12-30", status: "In Progress" },
        { id: "#PAT-2026-004", name: "Maria Cruz Lopez", age: 19, exposure: "Bat Exposure", category: "Category I", date: "2025-12-29", status: "Pending" },
        { id: "#PAT-2026-005", name: "Roberto Fernandez", age: 55, exposure: "Dog Bite", category: "Category II", date: "2025-12-27", status: "Completed" },
        { id: "#PAT-2026-006", name: "Isabella Torres", age: 26, exposure: "Cat Bite", category: "Category II", date: "2026-01-01", status: "In Progress" },
        { id: "#PAT-2026-007", name: "Miguel Gutierrez", age: 38, exposure: "Dog Bite", category: "Category III", date: "2026-01-01", status: "Pending" }
    ];

    // Element Selector Cache
    const tableBody = document.getElementById('patientTableBody');
    const paginationInfo = document.getElementById('paginationInfo');
    
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const exposureFilter = document.getElementById('exposureFilter');
    
    const tabExistingBtn = document.getElementById('tabExistingBtn');
    const tabNewPatientBtn = document.getElementById('tabNewPatientBtn');
    const patientModal = document.getElementById('patientModal');
    
    // Modal Selectors
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const newPatientForm = document.getElementById('newPatientForm');

    /**
     * Component Render Engine Pipeline 
     */
    function renderRegistryMatrix(dataset) {
        tableBody.innerHTML = '';
        
        if(dataset.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #999; padding: 30px;">No patient profiles matched your query definitions.</td></tr>`;
            paginationInfo.textContent = `Showing 0 of 0 patients`;
            return;
        }

        dataset.forEach(patient => {
            const tr = document.createElement('tr');
            
            // Resolve Category classes dynamically
            let catClass = 'badge-info';
            if (patient.category === 'Category II') catClass = 'badge-warning';
            if (patient.category === 'Category III') catClass = 'badge-danger';

            // Resolve Status classes dynamically
            let statusClass = 'status-pending';
            if (patient.status === 'In Progress') statusClass = 'status-in-progress';
            if (patient.status === 'Completed') statusClass = 'status-completed';

            tr.innerHTML = `
                <td><strong>${patient.id}</strong></td>
                <td>${patient.name}</td>
                <td>${patient.age}</td>
                <td>${patient.exposure}</td>
                <td><span class="badge ${catClass}">${patient.category}</span></td>
                <td>${patient.date}</td>
                <td><span class="status-badge ${statusClass}">${patient.status}</span></td>
                <td><button class="btn-action" onclick="alert('Viewing comprehensive clinical folder for ${patient.name}')">View</button></td>
            `;
            tableBody.appendChild(tr);
        });

        paginationInfo.textContent = `Showing ${dataset.length} of ${dataset.length} profiles listed`;
    }

    /**
     * Search Routing and Filtering Engine
     */
    function executeFilterQuery() {
        const queryStr = searchInput.value.toLowerCase().trim();
        const selectedStatus = statusFilter.value;
        const selectedExposure = exposureFilter.value;

        const filteredSet = patientMockDatabase.filter(patient => {
            const matchesSearch = patient.name.toLowerCase().includes(queryStr) || patient.id.toLowerCase().includes(queryStr);
            const matchesStatus = selectedStatus === "" || patient.status === selectedStatus;
            const matchesExposure = selectedExposure === "" || patient.exposure === selectedExposure;
            
            return matchesSearch && matchesStatus && matchesExposure;
        });

        renderRegistryMatrix(filteredSet);
    }

    // Filter Trigger Listeners
    document.getElementById('applyFiltersBtn').addEventListener('click', executeFilterQuery);
    
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
        searchInput.value = "";
        statusFilter.value = "";
        exposureFilter.value = "";
        renderRegistryMatrix(patientMockDatabase);
    });

    // Realtime incremental search tracking
    searchInput.addEventListener('input', executeFilterQuery);

    /**
     * Tab Routing State Handlers
     */
    tabExistingBtn.addEventListener('click', () => {
        tabNewPatientBtn.classList.remove('active');
        tabExistingBtn.classList.add('active');
        // Flash visual focus ring onto search input
        searchInput.focus();
    });

    tabNewPatientBtn.addEventListener('click', () => {
        // Automatically open the registration layout modal
        patientModal.classList.add('open');
    });

    /**
     * Form Modal UI Window Controls
     */
    function safelyCloseModalWindow() {
        patientModal.classList.remove('open');
        newPatientForm.reset();
    }

    closeModalBtn.addEventListener('click', safelyCloseModalWindow);
    cancelModalBtn.addEventListener('click', safelyCloseModalWindow);

    // Close window if clicking background mask
    window.addEventListener('click', (e) => {
        if (e.target === patientModal) safelyCloseModalWindow();
    });

    /**
     * Form Processing Pipeline - Insert Operations
     */
    newPatientForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Object formatting matching schema structures
        const nextIdIndex = patientMockDatabase.length + 1;
        const generatedHexId = `#PAT-2026-${String(nextIdIndex).padStart(3, '0')}`;
        
        const timestampToday = new Date();
        const formattedRegDate = `${timestampToday.getFullYear()}-${String(timestampToday.getMonth() + 1).padStart(2, '0')}-${String(timestampToday.getDate()).padStart(2, '0')}`;

        const newProfileInstance = {
            id: generatedHexId,
            name: document.getElementById('patientName').value.trim(),
            age: parseInt(document.getElementById('patientAge').value),
            exposure: document.getElementById('patientExposureType').value,
            category: document.getElementById('patientCategory').value,
            date: formattedRegDate,
            status: "In Progress" // Initial status state definition
        };

        // Mutation of State Array array records
        patientMockDatabase.unshift(newProfileInstance);

        // Re-paint presentation view grid matrices
        renderRegistryMatrix(patientMockDatabase);
        
        // Return window controls state
        safelyCloseModalWindow();
        
        alert(`Success! Profile folder ${generatedHexId} created for ${newProfileInstance.name}. Initialized dose logging tracking patterns.`);
    });

    // Initial table paint operation cycle run
    renderRegistryMatrix(patientMockDatabase);
});