import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import type { Bytes32 } from './types';

// 32byte random salt as hex string 
export function randSalt32(): Bytes32 {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return ('0x' +
    Array.from(a)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')) as Bytes32;
}

// hex validator 
export function isBytes32Hex(s: unknown): s is Bytes32 {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);
}

export function normalizeErr(e: unknown): string {
  const anyE = e as any;
  if (!e) return 'Unknown error';
  if (anyE.shortMessage) return String(anyE.shortMessage);
  if (anyE.message) return String(anyE.message);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// parse proposals from JSON array 
export function parseNames(s: string): string[] {
  const t = s.trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      return (JSON.parse(t) || [])
        .map((x: unknown) => String(x).trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  return t
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// commitment: keccak256( abi.encode(index, salt, voter, contract, chainId) ) 
export function computeCommitment(args: {
  index: number;
  salt: Bytes32;
  voter: Address;
  contract: Address;
  chainId: number;
}): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'bytes32' },
      { type: 'address' }, // voter
      { type: 'address' }, // contract
      { type: 'uint256' }, // chainId
    ],
    [
      BigInt(args.index),
      args.salt,
      args.voter,
      args.contract,
      BigInt(args.chainId),
    ]
  );
  return keccak256(encoded);
}

export function formatDeadline(ts?: bigint): string {
  if (!ts) return '-';
  const ms = Number(ts) * 1000;
  if (!Number.isFinite(ms)) return '-';
  return new Date(ms).toISOString();
}
