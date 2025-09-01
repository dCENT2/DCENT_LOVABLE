// dCent Core – Collateral Manager
// Verwaltung von PfandToken (DZP) pro Peer

import { openDB } from "./storage.js";

const STORE_NAME = "collateral";

// DB vorbereiten
async function initStore() {
  const db = await openDB();
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    // WARNUNG: objectStoreNames ist read-only bei laufendem DB
    // Lösung: DB Version hochziehen, falls nötig
    console.warn("Bitte DB-Version erhöhen, falls collateral-Store fehlt.");
  }
}

// Guthaben eines Peers abfragen
export async function getCollateral(peerId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(peerId);
    request.onsuccess = () => resolve(request.result ? request.result.amount : 0);
    request.onerror = (err) => reject(err);
  });
}

// Guthaben hinzufügen (z. B. Kauf neuer PfandToken)
export async function addCollateral(peerId, amount) {
  const db = await openDB();
  const current = await getCollateral(peerId);

  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put({ id: peerId, amount: current + amount });

  return current + amount;
}

// Guthaben abziehen (z. B. Verkauf oder Verlust durch Betrug)
export async function subtractCollateral(peerId, amount) {
  const db = await openDB();
  const current = await getCollateral(peerId);
  const newAmount = Math.max(0, current - amount);

  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put({ id: peerId, amount: newAmount });

  return newAmount;
}

// Collateral für einen Vertrag locken
export async function lockCollateral(contractId, peerId, amount) {
  const db = await openDB();
  const current = await getCollateral(peerId);

  if (current < amount) {
    throw new Error(`Nicht genug Collateral: ${peerId} hat nur ${current}, benötigt ${amount}`);
  }

  // Guthaben reduzieren
  const newAmount = current - amount;
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put({ id: peerId, amount: newAmount });

  // Lock-Eintrag im collateral-Store anlegen
  const lockStore = tx.objectStore(STORE_NAME);
  const lockId = `${contractId}_${peerId}`;
  lockStore.put({ id: lockId, amount, locked: true });

  return true;
}

// Collateral freigeben nach erfolgreichem Vertrag
export async function releaseCollateral(contractId, peerId) {
  const db = await openDB();
  const lockId = `${contractId}_${peerId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(lockId);

    req.onsuccess = () => {
      const lock = req.result;
      if (lock && lock.locked) {
        // zurückbuchen
        const update = store.get(peerId);
        update.onsuccess = () => {
          const current = update.result ? update.result.amount : 0;
          store.put({ id: peerId, amount: current + lock.amount });
          store.delete(lockId);
          resolve(true);
        };
      } else {
        reject(new Error("Kein Lock gefunden"));
      }
    };

    req.onerror = (err) => reject(err);
  });
}

// Collateral einziehen bei Vertragsbruch
export async function forfeitCollateral(contractId, peerId) {
  const db = await openDB();
  const lockId = `${contractId}_${peerId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(lockId);

    req.onsuccess = () => {
      const lock = req.result;
      if (lock && lock.locked) {
        // Lock einfach löschen (Collateral weg)
        store.delete(lockId);
        resolve(true);
      } else {
        reject(new Error("Kein Lock gefunden"));
      }
    };

    req.onerror = (err) => reject(err);
  });
}
