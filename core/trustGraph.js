// dCent Core – TrustGraph (Whitepaper-konform mit Status-Logik)
// Proof-of-Trust mit asymptotischem Wachstum, Diversität, Collateral und Strafe bei gebrochenen Verträgen

import { listContracts } from "./contractManager.js";

// Parameter (feinjustierbar)
const MAX_TRUST = 100;   // asymptotisches Maximum
const K = 0.15;          // Basis-Wachstumsrate
const ALPHA = 0.05;      // Collateral-Faktor (logarithmische Dehnung)
const BETA = 0.2;        // Diversitäts-Faktor
const GAMMA = 0.2;       // Strafe pro gebrochenem Vertrag (20 % vom Score)

// Asymptotische Funktion mit Collateral-Dehnung
function baseTrust(n, totalCollateral) {
  const fCollateral = ALPHA * Math.log(1 + totalCollateral); // Collateral dehnt die Kurve
  const effectiveK = K + fCollateral;
  return MAX_TRUST * (1 - Math.exp(-effectiveK * n));
}

// Hauptberechnung
export async function calculateTrustScores() {
  const contracts = await listContracts();
  const peerContracts = {};

  // Verträge pro Peer sammeln
  contracts.forEach(contract => {
    [contract.from, contract.to].forEach(peer => {
      if (!peer) return; // undefined vermeiden
      if (!peerContracts[peer]) peerContracts[peer] = [];
      peerContracts[peer].push(contract);
    });
  });

  const scores = {};
  const details = {};

  for (const peer in peerContracts) {
    const cs = peerContracts[peer];

    // Zählen: nur nach Status
    const fulfilled = cs.filter(c => c.status === "active").length;
    const broken = cs.filter(c => c.status === "broken").length;

    // Diversität: nur aus aktiven Verträgen
    const partners = new Set();
    cs.forEach(c => {
      if (c.status === "active") {
        partners.add(c.from === peer ? c.to : c.from);
      }
    });
    const d = partners.size;

    // Collateral: nur aus aktiven Verträgen
    let totalCollateral = 0;
    cs.forEach(c => {
      if (c.status === "active" && c.collateral) {
        if (c.from === peer) totalCollateral += c.collateral.from || 0;
        if (c.to === peer) totalCollateral += c.collateral.to || 0;
      }
    });

    // Basiswert aus erfüllten Verträgen
    const base = baseTrust(fulfilled, totalCollateral);

    // Diversitätsbonus
    let score = base * (1 + BETA * (d / Math.max(1, fulfilled || 1)));

    // Strafe für gebrochene Verträge
    if (broken > 0) {
      const penalty = GAMMA * broken * score;
      score -= penalty;
    }

    // Score begrenzen
    if (score < 0) score = 0;
    if (score > MAX_TRUST) score = MAX_TRUST;

    scores[peer] = Math.round(score);
    details[peer] = {
      fulfilled,
      broken,
      d,
      totalCollateral,
      base: Math.round(base)
    };
  }

  return { scores, details };
}

// Einzelner TrustScore
export async function getTrustScore(peerId) {
  const { scores } = await calculateTrustScores();
  return scores[peerId] || 0;
}
