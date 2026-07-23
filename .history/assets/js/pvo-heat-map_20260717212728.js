// ==========================================================
// FETCH POPULATION DATA FROM POPULATION_DATA COLLECTION
// ==========================================================

async function fetchPopulationDataFromFirestore() {
    try {
        console.log("👥 Fetching active census from 'population_data'...");
        
        const populationCollection = collection(db, "population_data");
        const querySnapshot = await getDocs(populationCollection);
        
        if (querySnapshot.empty) {
            console.warn("⚠️ 'population_data' collection is empty. Please upload population data first.");
            return;
        }

        let totalPopulation = 0;
        let municipalityCount = 0;
        municipalityPopulations = {}; // Reset

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Handle both manual field schemas and doc.id names seamlessly
            const rawMun = data.municipality || data.Municipality || doc.id || "";
            const cleanMun = rawMun.trim().toLowerCase();
            const population = Number(data.totalPopulation || data.population || data.total_population || data.Population) || 0;
            
            if (cleanMun) {
                municipalityPopulations[cleanMun] = population;
                totalPopulation += population;
                municipalityCount++;
            }
        });

        totalHumanPopulation = totalPopulation;
        console.log(`Population data loaded: ${municipalityCount} municipalities indexed`);
        console.log(`👥 Explicit total verification: ${totalHumanPopulation}`);
        
        // FORCED DOM INTERVENTION: Force the HTML element to update right here,
        // so it doesn't wait for any map filters or case datasets.
        const populationCard = document.getElementById("humanPopulation");
        if (populationCard) {
            populationCard.innerText = totalHumanPopulation.toLocaleString();
        }

    } catch (error) {
        console.error("❌ Error loading population collection:", error);
    }
}