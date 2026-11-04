import { db } from '../../firebase/firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

export async function fetchPvoAnimalBiteCases() {
    const snapshot = await getDocs(collection(db, "rabies_cases"));
    const records = [];

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const municipality = String(data.municipality || "Unknown").trim();

        if (municipality.toLowerCase() === "total") return;

        records.push({
            id: docSnap.id,
            district: data.district || "N/A",
            municipality,
            year: data.year || new Date().getFullYear(),
            dogPopulation: Number(data.dogPopulation || 0),
            vaccinatedDogs: Number(data.vaccinatedDogs || 0),
            vaccinatedCats: Number(data.vaccinatedCats || 0),
            vaccinationPercentage: Number(data.vaccinationPercentage || 0),
            castrated: Number(data.castrated || 0),
            spayed: Number(data.spayed || 0),
            headSamplesSubmitted: Number(data.headSamplesSubmitted || 0),
            rabiesPositive: Number(data.rabiesPositive || 0),
            rabiesNegative: Number(data.rabiesNegative || 0),
            humanDeath: Number(data.humanDeath || 0),
            documentOrder: Number(data.documentOrder || 0)
        });
    });

    records.sort((a, b) => a.documentOrder - b.documentOrder);
    return records;
}