// dCent Core – Contract Management (mit Verschlüsselung + Signatur)

import { getKey } from "./keyManager.js";
import { saveToDB, getAllFromDB } from "./storage.js";

const STORE_NAME = "contracts";

//
// -------- AES Hilfsfunktionen --------
//
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
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: Array.from(iv)
  };
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

//
// -------- AES Key-Sharing (vereinfacht) --------
//
async function encryptKeyForPeer(aesKey, peerId) {
  const peerKey = await getKey(peerId);
  if (!peerKey) throw new Error(`Kein Key für ${peerId}`);
  const rawKey = await crypto.subtle.exportKey("jwk", aesKey);
  return btoa(JSON.stringify(rawKey));
}

async function decryptKeyForPeer(encryptedKeyB64, peerId) {
  const rawKey = JSON.parse(atob(encryptedKeyB64));
  return await crypto.subtle.importKey(
    "jwk",
    rawKey,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

//
// -------- Signatur Hilfsfunktionen --------
//
async function signData(privateKeyJwk, data) {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoded
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifySignature(publicKeyJwk, data, signatureB64) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"]
  );

  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const sigBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));

  return await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    sigBytes,
    encoded
  );
}

//
// -------- Vertragsfunktionen --------
//
export async function createContract(fromId, toId, content, amount = 0) {
  const fromKey = await getKey(fromId);
  if (!fromKey) throw new Error(`Kein Key für ${fromId}`);

  const contractId = `ctr_${Date.now()}`;
  const created = new Date().toISOString();

  // Ephemeral AES-Key
  const aesKey = await generateAESKey();
  const encrypted = await encryptAES(aesKey, content);

  // AES-Key für beide Parteien mit ihren Peer-IDs speichern
  const encryptedKeys = {};
  encryptedKeys[fromId] = await encryptKeyForPeer(aesKey, fromId);
  encryptedKeys[toId] = await encryptKeyForPeer(aesKey, toId);

  // Basisdaten ohne Signatur
  const baseData = {
    id: contractId,
    from: fromId,
    to: toId,
    amount,
    created,
    encryptedContent: encrypted.ciphertext,
    iv: encrypted.iv,
    encryptedKeys
  };

  // Signatur erstellen
  const signature = await signData(fromKey.privateKey, baseData);

  const contract = {
    ...baseData,
    signature,
    signer: fromId
  };

  await saveToDB(STORE_NAME, contract);
  return contract;
}

// Alle Verträge abrufen
export async function listContracts() {
  return await getAllFromDB(STORE_NAME);
}

// Vertrag entschlüsseln für einen Peer
export async function decryptContract(contract, peerId) {
  if (!contract.encryptedKeys[peerId]) {
    throw new Error("Peer ist nicht Teil dieses Vertrags");
  }

  const aesKey = await decryptKeyForPeer(contract.encryptedKeys[peerId], peerId);
  const plaintext = await decryptAES(aesKey, contract.encryptedContent, contract.iv);

  return {
    ...contract,
    content: plaintext
  };
}

// Vertragssignatur prüfen
export async function verifyContractSignature(contract) {
  const { signature, signer, ...baseData } = contract;
  const signerKey = await getKey(signer);
  if (!signerKey) throw new Error(`Kein Key für ${signer}`);

  return await verifySignature(signerKey.publicKey, baseData, signature);
}
