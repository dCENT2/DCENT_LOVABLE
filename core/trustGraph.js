// dCent Core – TrustGraph (Whitepaper-konform)
// Proof-of-Trust mit asymptotischem Wachstum, Diversität und Collateral

import { listContracts } from "./contractManager.js";

// Parameter (können wir später feinjustieren oder in Settings speichern)
const MAX_TRUST = 100;       // asymptotisches Maximum
const K = 0.15;              // Wachstumsrate
const ALPHA = 0.05;          // Collateral-Faktor (5% Bonus pro DZP)
const BETA = 0.2;            // Diversitäts-Faktor

// Hilfsfunktion: asymptotisches Wachstum
function baseTrust(n) {
  return MAX_TRUST * (1 - Math.exp(-K * n));
}

// Hauptberechnung
export async function calculateTrustScores() {
  const contracts = await listContracts();
  const peerContracts = {};  // { peerId: [contracts...] }

  // Verträge pro Peer sammeln
  contracts.forEach(contract => {
    [contract.from, contract.to].forEach(peer => {
      if (!peerContracts[peer]) peerContracts[peer] = [];
      peerContracts[peer].push(contract);
    });
  });

  const scores = {};
  const details = {};

  for (const peer in peerContracts) {
    const contracts = peerContracts[peer];
    const n = contracts.length;

    // Diversität: Anzahl verschiedener Partner
    const partners = new Set();
    contracts.forEach(c => {
      partners.add(c.from === peer ? c.to : c.from);
    });
    const d = partners.size;

    // Collateral-Bonus (Summe aller Pfänder dieses Peers)
    let totalCollateral = 0;
    contracts.forEach(c => {
      if (c.collateral) {
        if (c.from === peer) totalCollateral += c.collateral.from || 0;
        if (c.to === peer) totalCollateral += c.collateral.to || 0;
      }
    });

    // Basiswert aus Anzahl Verträge
    const base = baseTrust(n);

    // Score mit Collateral & Diversität
    let score = base;
    score *= 1 + ALPHA * totalCollateral;   // Collateral-Faktor
    score *= 1 + BETA * (d / Math.max(1, n)); // Diversitäts-Faktor

    scores[peer] = Math.round(score);
    details[peer] = { n, d, totalCollateral, base: Math.round(base) };
  }

  return { scores, details };
}

// Einzelner TrustScore
export async function getTrustScore(peerId) {
  const { scores } = await calculateTrustScores();
  return scores[peerId] || 0;
}
