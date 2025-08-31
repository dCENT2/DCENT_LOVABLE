// dCent Core – Key Management

const DB_NAME = "dcentDB";
const DB_VERSION = 2;  // Einheitlich mit contractManager
const STORE_NAME = "keys";

// IndexedDB öffnen
function openDB() {
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

// Neues Keypair erzeugen
export async function createKeyPair(identityName = "default") {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put({
    id: identityName,
    publicKey: publicKeyJwk,
    privateKey: privateKeyJwk,
    created: new Date().toISOString(),
  });

  return publicKeyJwk;
}

// Alle Keys abrufen
export async function listKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Einzelnen Key abrufen (hier fehlte export!)
export async function getKey(identityName = "default") {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(identityName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
