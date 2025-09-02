// dCent Core – Collateral Manager (Whitepaper-konform)
// Verwaltung von PfandToken (DZP) Guthaben pro Peer

import { openDB } from "./storage.js";

const STORE_NAME = "collateral";

// sicherstellen, dass der Store existiert
async function ensureStore() {
  const db = await openDB();
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    console.warn("Bitte DB-Version hochsetzen: collateral-Store fehlt!");
  }
  return db;
}

// Guthaben eines Peers abfragen
export async function getCollateral(peerId) {
  const db = await ensureStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(peerId);
    req.onsuccess = () => resolve(req.result ? req.result.amount : 0);
    req.onerror = (err) => reject(err);
  });
}

// Guthaben hinzufügen (z. B. Kauf neuer PfandToken oder Auszahlung aus Vertrag)
export async function addCollateral(peerId, amount) {
  if (amount <= 0) return;
  const db = await ensureStore();
  const current = await getCollateral(peerId);
  const newAmount = current + amount;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id: peerId, amount: newAmount });
    tx.oncomplete = () => resolve(newAmount);
    tx.onerror = (err) => reject(err);
  });
}

// Guthaben abziehen (z. B. beim Erstellen eines Vertrags durch den Sender)
export async function subtractCollateral(peerId, amount) {
  if (amount <= 0) return;
  const db = await ensureStore();
  const current = await getCollateral(peerId);

  if (current < amount) {
    throw new Error(`Nicht genug Collateral: ${peerId} hat nur ${current}, benötigt ${amount}`);
  }

  const newAmount = current - amount;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id: peerId, amount: newAmount });
    tx.oncomplete = () => resolve(newAmount);
    tx.onerror = (err) => reject(err);
  });
}

// Initial Guthaben setzen (z. B. Onboarding, Tests)
export async function setCollateral(peerId, amount) {
  const db = await ensureStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id: peerId, amount });
    tx.oncomplete = () => resolve(amount);
    tx.onerror = (err) => reject(err);
  });
}
