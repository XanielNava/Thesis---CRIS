import { auth, db } from '../../firebase/firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    query, 
    where, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

export async function fetchCurrentOfficerProfile(uid) {
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) return null;
    return snap.data();
}

export async function fetchPvoSurveillanceMetrics() {
    let snapshot = await getDocs(collection(db, "pho-database", "main", "legacy-summary"));
    if (snapshot.empty) {
        snapshot = await getDocs(collection(db, "pvo_rabies_cases"));
    }

    const records = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let bites = 0;
        let vaccinations = 0;
        let confirmed = 0;

        if (data.rawData && Array.isArray(data.rawData)) {
            const row = data.rawData;
            const is24Col = row.length >= 17;
            bites = is24Col ? (Number(row[16]) || 0) : (Number(row[1]) || 0);
            vaccinations = is24Col ? (Number(row[13]) || 0) : (Number(row[4]) || 0);
            confirmed = is24Col ? (Number(row[12]) || 0) : (Number(row[2]) || 0);
        } else {
            bites = Number(data.total || data.totalCases || data.biteCases || 0);
            vaccinations = Number(data.tcv || data.petTcv || data.vaccinated || 0);
            confirmed = Number(data.hr || data.humanDeaths || data.confirmed || 0);
        }

        let year = null;
        if (data.year) year = Number(data.year);
        else if (data.date) {
            const dt = data.date.toDate ? data.date.toDate() : new Date(data.date);
            if (!isNaN(dt.getFullYear())) year = dt.getFullYear();
        }

        let month = null;
        if (data.month !== undefined && data.month !== null) {
            const m = Number(data.month);
            month = m >= 1 && m <= 12 ? m - 1 : (m >= 0 && m <= 11 ? m : null);
        } else if (data.date) {
            const dt = data.date.toDate ? data.date.toDate() : new Date(data.date);
            if (!isNaN(dt.getMonth())) month = dt.getMonth();
        }

        records.push({ year, month, bites, vaccinations, confirmed });
    });

    return records;
}

export async function fetchRecentSurveillanceLogs(limitCount = 10) {
    const q = query(
        collection(db, "bite_reports"),
        orderBy("reportedAt", "desc"),
        limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchCalendarEventsForMonth(startStr, endStr) {
    const q = query(
        collection(db, "calendar-events"),
        where("date", ">=", startStr),
        where("date", "<=", endStr)
    );
    const snap = await getDocs(q);
    const dates = new Set();
    snap.forEach(d => dates.add(d.data().date));
    return dates;
}

export async function getCalendarEvent(dateStr) {
    const snap = await getDoc(doc(db, "calendar-events", dateStr));
    return snap.exists() ? snap.data().description || "" : "";
}

export async function saveCalendarEvent(dateStr, description) {
    await setDoc(doc(db, "calendar-events", dateStr), {
        category: "PVO Announcement",
        date: dateStr,
        description,
        updatedAt: new Date().toISOString()
    }, { merge: true });
}