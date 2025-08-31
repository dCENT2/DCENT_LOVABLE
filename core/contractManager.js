// dCent Core – Contract Management (mit Vertragsverschlüsselung)

import { getFromDB, saveToDB, getAllFromDB } from "./storage.js";
import { getKey } from "./keyManager.js";

const STORE_NAME = "contracts";

// Hilfsfunktionen
async function generateAESKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encryptAES(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))), iv: Array.from(iv) };
}

async function decryptAES(key, encryptedData, iv) {
  const bytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const ivArray = new Uint8Array(iv);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivArray },
    key,
    bytes
  );
  return new TextDecoder().decode(plaintext);
}

async function encryptKeyForPeer(aesKey, peer) {
  const peerKey = await getKey(peer);
  if (!peerKey) throw new Error(`Kein Key für ${peer}`);

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    peerKey.publicKey,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"]
  );

  // Exportiere AES-Key und verschlüssele mit peer Public Key → simuliert mit JSON
  const rawKey = await crypto.subtle.exportKey("jwk", aesKey);
  return btoa(JSON.stringify(rawKey)); // hier vereinfachte Variante
}

// Vertrag erzeugen & verschlüsseln
export async function createContract(fromId, toId, content, amount = 0) {
  const fromKey = await getKey(fromId);
  if (!fromKey) throw new Error(`Kein Key für ${fromId} gefunden`);

  const contractId = `ctr_${Date.now()}`;
  const created = new Date().toISOString();

  // Ephemeral AES-Key
  const aesKey = await generateAESKey();
  const encrypted = await encryptAES(aesKey, content);

  // AES-Key für beide Parteien verschlüsseln
  const encryptedKeys = {
    from: await encryptKeyForPeer(aesKey, fromId),
    to: await encryptKeyForPeer(aesKey, toId),
  };

  const contract = {
    id: contractId,
    from: fromId,
    to: toId,
    amount,
    created,
    encryptedContent: encrypted.ciphertext,
    iv: encrypted.iv,
    encryptedKeys,
    signature: "todo_sign", // wir können zusätzlich noch signieren
  };

  await saveToDB(STORE_NAME, contract);
  return contract;
}

// Alle Verträge abrufen
export async function listContracts() {
  return await getAllFromDB(STORE_NAME);
}
