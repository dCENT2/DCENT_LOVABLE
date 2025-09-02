// dCent Core – Multisig (Gruppenverträge / Zellenstrukturen)
// V0.6: Status-Integration (pending, active, broken)

import { getKey } from "./keyManager.js";
import { saveToDB, getFromDB, getAllFromDB } from "./storage.js";

const STORE_NAME = "contracts";

//
// Hilfsfunktionen für Signatur
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
// Multisig-Vertrag erstellen
//
export async function createMultisigContract(participants, threshold, content, amount = 0, collateral = null) {
  if (!Array.isArray(participants) || participants.length < 2) {
    throw new Error("Mindestens 2 Teilnehmer erforderlich");
  }
  if (threshold < 1 || threshold > participants.length) {
    throw new Error("Ungültiges Threshold");
  }

  const contractId = `ctr_multi_${Date.now()}`;
  const created = new Date().toISOString();

  const contract = {
    id: contractId,
    participants,
    threshold,
    content,
    amount,
    collateral,
    created,
    signatures: [],
    approvals: {},  // active / broken Votes
    status: "pending"
  };

  await saveToDB(STORE_NAME, contract);
  return contract;
}

//
// Vertrag signieren (aktive Zustimmung)
//
export async function signContract(contractId, signerId) {
  const contract = await getFromDB(STORE_NAME, contractId);
  if (!contract) throw new Error("Vertrag nicht gefunden");
  if (!contract.participants.includes(signerId)) {
    throw new Error("Signer ist nicht Teilnehmer des Vertrags");
  }

  // Signatur erstellen
  const signerKey = await getKey(signerId);
  if (!signerKey) throw new Error("Kein Key für diesen Peer gefunden");

  const baseData = {
    id: contract.id,
    participants: contract.participants,
    threshold: contract.threshold,
    content: contract.content,
    amount: contract.amount,
    created: contract.created
  };

  const signature = await signData(signerKey.privateKey, baseData);

  // prüfen, ob schon unterschrieben
  const alreadySigned = contract.signatures.find(s => s.signer === signerId);
  if (!alreadySigned) {
    contract.signatures.push({ signer: signerId, signature });
  }

  // Zustimmung als "active"
  contract.approvals[signerId] = "active";

  await updateMultisigStatus(contract);
  return contract;
}

//
// Vertrag explizit als "broken" markieren
//
export async function breakContract(contractId, signerId) {
  const contract = await getFromDB(STORE_NAME, contractId);
  if (!contract) throw new Error("Vertrag nicht gefunden");
  if (!contract.participants.includes(signerId)) {
    throw new Error("Signer ist nicht Teilnehmer des Vertrags");
  }

  contract.approvals = contract.approvals || {};
  contract.approvals[signerId] = "broken";

  await updateMultisigStatus(contract);
  return contract;
}

//
// Hilfsfunktion: Status aktualisieren
//
async function updateMultisigStatus(contract) {
  const approvals = Object.values(contract.approvals);

  const activeVotes = approvals.filter(v => v === "active").length;
  const brokenVotes = approvals.filter(v => v === "broken").length;

  // active, wenn genug Signaturen >= threshold
  if (activeVotes >= contract.threshold) {
    contract.status = "active";
  }
  // broken, wenn Mehrheit broken (z. B. > 50 % der Teilnehmer)
  else if (brokenVotes > contract.participants.length / 2) {
    contract.status = "broken";
  }
  else {
    contract.status = "pending";
  }

  await saveToDB(STORE_NAME, contract);
}

//
// Signaturen prüfen
//
export async function verifyMultisig(contract) {
  const baseData = {
    id: contract.id,
    participants: contract.participants,
    threshold: contract.threshold,
    content: contract.content,
    amount: contract.amount,
    created: contract.created
  };

  for (const sig of contract.signatures) {
    const signerKey = await getKey(sig.signer);
    if (!signerKey) return false;
    const ok = await verifySignature(signerKey.publicKey, baseData, sig.signature);
    if (!ok) return false;
  }

  return true;
}

//
// Alle Multisig-Verträge abrufen
//
export async function listMultisigContracts() {
  const contracts = await getAllFromDB(STORE_NAME);
  return contracts.filter(c => c.participants && Array.isArray(c.participants));
}
