// =========================================================================
// CORRECTED populateFilters() FUNCTION - ONLY FROM CASE DATA
// =========================================================================

function populateFilters() {
    // YEAR FILTER - from case data
    if (yearFilter) {
        yearFilter.innerHTML = '<option value="All">All Years</option>';
        const years = [...new Set(excelData.map(item => item.Year))].sort();
        years.forEach(year => {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });
    }

    // MUNICIPALITY FILTER - ONLY FROM CASE DATA (rabies_cases)
    // Do NOT include population data municipalities
    if (municipalityFilter) {
        municipalityFilter.innerHTML = '<option value="All">All Municipalities</option>';
        
        // Get ONLY municipalities from excelData (which comes from rabies_cases)
        const municipalities = [...new Set(excelData.map(item => item.Municipality))].sort();
        
        municipalities.forEach(mun => {
            const option = document.createElement("option");
            option.value = mun;
            option.textContent = mun;
            municipalityFilter.appendChild(option);
        });
        
        console.log(`✅ Municipality filter populated with ${municipalities.length} facilities from case data`);
    }
}