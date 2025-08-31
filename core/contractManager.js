// dCent Core – Contract Management
// Erstellt & speichert Verträge (bilaterale JSON-Struktur)

import { getKey } from "./keyManager.js";

const DB_NAME = "dcentDB";
const STORE_NAME = "contracts";

// IndexedDB öffnen
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Vertrag erzeugen & signieren
export async function createContract(fromId, toId, content, amount = 0) {
  const fromKey = await getKey(fromId);
  if (!fromKey) throw new Error(`Kein Key für ${fromId} gefunden`);

  // Vertrag als JSON-Objekt
  const contract = {
    id: `ctr_${Date.now()}`,
    from: fromId,
    to: toId,
    content,
    amount,
    created: new Date().toISOString(),
  };

  // Signatur mit privatem Key
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    fromKey.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(contract));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );

  // Signatur im Vertrag speichern
  contract.signature = btoa(String.fromCharCode(...new Uint8Array(signature)));

  // Vertrag in IndexedDB speichern
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(contract);

  return contract;
}

// Alle Verträge abrufen
export async function listContracts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
