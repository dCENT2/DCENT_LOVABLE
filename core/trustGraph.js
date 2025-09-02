// dCent Core – TrustGraph (Whitepaper-konform mit Status-Logik + Multisig)
// Proof-of-Trust mit asymptotischem Wachstum, Diversität, Collateral-Multiplikator,
// Strafe bei gebrochenen Verträgen & Threshold-Bonus

import { listContracts } from "./contractManager.js";
import { listMultisigContracts } from "./multisigManager.js";

// Parameter (feinjustierbar)
const MAX_TRUST = 100;   // asymptotisches Maximum
const K = 0.15;          // Basis-Wachstumsrate
const ALPHA = 0.05;      // Collateral-Faktor (Multiplikator, logarithmisch)
const BETA = 0.2;        // Diversitäts-Faktor
const GAMMA = 0.2;       // Strafe pro gebrochenem Vertrag (20 % vom Score)
const DELTA = 0.3;       // Multisig Threshold-Bonus (max +30 %)

// Basisfunktion nur über Anzahl erfüllter Verträge
function baseTrust(n) {
  return MAX_TRUST * (1 - Math.exp(-K * n));
}

export async function calculateTrustScores() {
  const contracts = await listContracts();
  const multisigContracts = await listMultisigContracts();
  const allContracts = [...contracts, ...multisigContracts];

  const peerContracts = {};

  // Verträge pro Peer sammeln
  allContracts.forEach(contract => {
    if (contract.participants && Array.isArray(contract.participants)) {
      // Multisig
      contract.participants.forEach(peer => {
        if (!peerContracts[peer]) peerContracts[peer] = [];
        peerContracts[peer].push(contract);
      });
    } else {
      // Bilateral
      [contract.from, contract.to].forEach(peer => {
        if (!peer) return;
        if (!peerContracts[peer]) peerContracts[peer] = [];
        peerContracts[peer].push(contract);
      });
    }
  });

  const scores = {};
  const details = {};

  for (const peer in peerContracts) {
    const cs = peerContracts[peer];

    const fulfilled = cs.filter(c => c.status === "active").length;
    const broken = cs.filter(c => c.status === "broken").length;

    // Diversität
    const partners = new Set();
    cs.forEach(c => {
      if (c.status === "active") {
        if (c.participants) {
          c.participants.forEach(p => { if (p !== peer) partners.add(p); });
        } else {
          partners.add(c.from === peer ? c.to : c.from);
        }
      }
    });
    const d = partners.size;

    // Collateral (nur aktive Verträge)
    let totalCollateral = 0;
    let multisigBonus = 0;

    cs.forEach(c => {
      if (c.status === "active" && c.collateral) {
        if (c.participants) {
          // Multisig: nur Empfänger profitieren
          if (c.toPeers && c.toPeers.includes(peer)) {
            const fromSum = Object.values(c.collateral.from || {}).reduce((a, b) => a + b, 0);
            totalCollateral += fromSum;
          }
        } else {
          if (c.from === peer) totalCollateral += c.collateral.from || 0;
          if (c.to === peer) totalCollateral += c.collateral.to || 0;
        }
      }
    });

    // Basiswert
    const base = baseTrust(fulfilled);

    // Collateral-Multiplikator (separat angewandt)
    const collateralFactor = 1 + ALPHA * Math.log(1 + totalCollateral);

    // Diversitätsbonus
    let score = base * collateralFactor * (1 + BETA * (d / Math.max(1, fulfilled || 1)));

    // Multisig Threshold-Bonus
    cs.forEach(c => {
      if (c.status === "active" && c.participants) {
        const thresholdRatio = c.threshold / c.participants.length;
        const bonusFactor = (1 + DELTA * thresholdRatio);
        const before = score;
        score *= bonusFactor;
        multisigBonus += Math.round(score - before);
      }
    });

    // Strafe für gebrochene Verträge
    if (broken > 0) {
      const penalty = GAMMA * broken * score;
      score -= penalty;
    }

    // Begrenzen
    if (score < 0) score = 0;
    if (score > MAX_TRUST) score = MAX_TRUST;

    scores[peer] = Math.round(score);
    details[peer] = {
      fulfilled,
      broken,
      d,
      totalCollateral,
      base: Math.round(base),
      collateralFactor: collateralFactor.toFixed(2),
      multisigBonus
    };
  }

  return { scores, details };
}

export async function getTrustScore(peerId) {
  const { scores } = await calculateTrustScores();
  return scores[peerId] || 0;
}
