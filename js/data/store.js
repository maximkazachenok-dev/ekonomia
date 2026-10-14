import { firebaseConfig } from '../config.js';
import { localBackend } from './local.js';
import { savingsDelta } from '../lib/budget.js';

// Облачный режим включается, как только в config.js появились ключи Firebase.
export async function createBackend() {
  if (firebaseConfig) {
    const { createFirebaseBackend } = await import('./firebase.js');
    return createFirebaseBackend(firebaseConfig);
  }
  return localBackend;
}

// Копилки хранят баланс в самом конверте (операции грузятся только за последние периоды),
// поэтому при любой операции с копилкой корректируем баланс на разницу.
export function balanceChangesFor(envelopesById, oldTx, newTx) {
  const map = new Map();
  const add = (tx, sign) => {
    if (!tx || envelopesById[tx.envelopeId]?.kind !== 'savings') return;
    map.set(tx.envelopeId, (map.get(tx.envelopeId) || 0) + sign * savingsDelta(tx));
  };
  add(oldTx, -1);
  add(newTx, 1);
  return [...map].filter(([, d]) => d !== 0).map(([envelopeId, delta]) => ({ envelopeId, delta }));
}
