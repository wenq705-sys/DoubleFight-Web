export interface RandomSource {
  next(): number;
}

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    const normalized = seed >>> 0;
    this.state = normalized === 0 ? 0x6d2b79f5 : normalized;
  }

  next(): number {
    // Mulberry32: compact deterministic PRNG suitable for reproducible game spawns.
    let value = this.state += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const result = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    this.state >>>= 0;
    return result;
  }

  snapshot(): number {
    return this.state >>> 0;
  }
}

export function randomUint32(): number {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues) {
    const data = new Uint32Array(1);
    cryptoObject.getRandomValues(data);
    return data[0] || 1;
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}
