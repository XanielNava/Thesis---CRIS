import { db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    getDocs, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/**
 * Listens to population changes in real-time
 */
export function listenToProvincePopulation(callback) {
    const populationCollection = collection(db, "population_data");
    return onSnapshot(populationCollection, (snapshot) => {
        let totalPop = 0;
        const muniPop = {};

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (docSnap.id === "ILOILO_TOTAL") {
                totalPop = Number(data.totalPopulation) || 0;
            } else {
                const name = data.municipality || docSnap.id;
                if (name && data.totalPopulation !== undefined) {
                    muniPop[name.trim().toLowerCase()] = Number(data.totalPopulation);
                }
            }
        });

        if (totalPop === 0) {
            Object.values(muniPop).forEach(val => totalPop += val);
        }

        callback({ totalPop, muniPop });
    });
}

/**
 * Fetches epidemiological points and coordinates from Firestore
 * NOTE: Ensure the exact name "export async function fetchHeatmapCasePoints"
 */
export async function fetchHeatmapCasePoints() {
    const caseCollection = collection(db, "rabies_cases");
    const snapshot = await getDocs(caseCollection);
    const casePoints = [];

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let rawMun = data.municipality || data.facilityName || "";
        let cleanedMun = rawMun.replace(/(rhu|health center|district hospital|clinic)/gi, "").trim();

        const lat = Number(data.latitude);
        const lng = Number(data.longitude);

        casePoints.push({
            Year: data.year || new Date().getFullYear(),
            Municipality: cleanedMun || "Unknown",
            Latitude: !isNaN(lat) && lat !== 0 ? lat : 10.90,
            Longitude: !isNaN(lng) && lng !== 0 ? lng : 122.60,
            "Animal Bite Cases": Number(data.totalCases || data.biteCases) || 0,
            "Human Rabies Deaths": Number(data.humanDeaths || data.maleCases) || 0,
            "Animal Rabies Deaths": Number(data.animalDeaths || data.femaleCases) || 0
        });
    });

    return casePoints;
}