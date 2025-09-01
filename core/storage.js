// dCent Core – Storage Utilities
// Zentraler Zugriff auf IndexedDB (Keys + Contracts) + Backup/Restore

const DB_NAME = "dcentDB";
const DB_VERSION = 2; // Einheitlich für alle Module

// Öffnet DB und legt Stores an, falls nicht vorhanden
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("contracts")) {
        db.createObjectStore("contracts", { keyPath: "id" });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Speichern eines Objekts
export async function saveToDB(storeName, object) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(object);
  return object;
}

// Einzelnes Objekt laden
export async function getFromDB(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Alle Objekte laden
export async function getAllFromDB(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Objekt löschen
export async function deleteFromDB(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

//
// -------- Backup & Restore --------
//

// Backup aller Stores als JSON
export async function exportBackup() {
  const keys = await getAllFromDB("keys");
  const contracts = await getAllFromDB("contracts");

  return {
    version: DB_VERSION,
    timestamp: new Date().toISOString(),
    keys,
    contracts
  };
}

// Backup als Datei herunterladen
export async function downloadBackup(filename = "dcent-backup.json") {
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// Restore aus einem JSON-Objekt
export async function importBackup(data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(["keys", "contracts"], "readwrite");

    try {
      // Keys wiederherstellen
      if (Array.isArray(data.keys)) {
        data.keys.forEach(key => {
          tx.objectStore("keys").put(key);
        });
      }

      // Verträge wiederherstellen
      if (Array.isArray(data.contracts)) {
        data.contracts.forEach(contract => {
          tx.objectStore("contracts").put(contract);
        });
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = (err) => reject(err);
    } catch (err) {
      reject(err);
    }
  });
}

// Restore aus einer hochgeladenen Datei
export async function uploadBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        await importBackup(data);
        resolve(true);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}
