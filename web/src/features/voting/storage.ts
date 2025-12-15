import type { Address } from 'viem';
import type { BackupBlob, Bytes32, CommitMeta } from './types';
import { isBytes32Hex } from './utils';

// namespaced keys 
export function saltKey(args: {
  account?: Address;
  addr: Address;
  chainId: number;
  electionId?: string;
}): string {
  const electionId = args.electionId ?? 'default';
  return `salt:${args.chainId}:${args.addr}:${(args.account || '').toLowerCase()}:${electionId}`;
}

export function metaKey(args: { account?: Address; addr: Address; chainId: number }): string {
  return `commitmeta:${args.chainId}:${args.addr}:${(args.account || '').toLowerCase()}`;
}

export function saveCommitMeta(meta: CommitMeta): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      metaKey({ account: meta.account, addr: meta.addr, chainId: meta.chainId }),
      JSON.stringify(meta)
    );
  } catch {}
}

export function loadCommitMeta(args: {
  account?: Address;
  addr: Address;
  chainId: number;
}): CommitMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(metaKey(args));
    return raw ? (JSON.parse(raw) as CommitMeta) : null;
  } catch {
    return null;
  }
}

export function loadSalt(args: { account?: Address; addr: Address; chainId: number }): Bytes32 | '' {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(saltKey(args)) || '';
    return isBytes32Hex(raw) ? raw : '';
  } catch {
    return '';
  }
}

// collect current backup items 
export function collectCurrent(args: {
  account?: Address;
  addr: Address;
  chainId: number;
}): BackupBlob {
  if (typeof window === 'undefined') return { version: 1, items: [] };
  const items: BackupBlob['items'] = [];

  const kSalt = saltKey(args);
  const vSalt = localStorage.getItem(kSalt);
  if (isBytes32Hex(vSalt)) items.push({ type: 'salt', key: kSalt, value: vSalt });

  const kMeta = metaKey(args);
  const vMeta = localStorage.getItem(kMeta);
  if (vMeta) {
    try {
      items.push({ type: 'meta', key: kMeta, value: JSON.parse(vMeta) as CommitMeta });
    } catch {}
  }

  return { version: 1, items };
}

export function collectAll(): BackupBlob {
  if (typeof window === 'undefined') return { version: 1, items: [] };
  const items: BackupBlob['items'] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;

    if (k.startsWith('salt:')) {
      const v = localStorage.getItem(k) || '';
      if (isBytes32Hex(v)) items.push({ type: 'salt', key: k, value: v });
    } else if (k.startsWith('commitmeta:')) {
      const raw = localStorage.getItem(k);
      try {
        const meta = JSON.parse(raw || 'null') as CommitMeta | null;
        if (meta && typeof meta === 'object') items.push({ type: 'meta', key: k, value: meta });
      } catch {}
    }
  }

  return { version: 1, items };
}

export function importBackup(blob: unknown): number {
  if (typeof window === 'undefined') return 0;
  const obj = blob as any;
  if (!obj || !Array.isArray(obj.items)) return 0;

  let count = 0;
  for (const it of obj.items) {
    if (!it || typeof it.key !== 'string') continue;

    if (it.type === 'salt' && isBytes32Hex(it.value)) {
      localStorage.setItem(it.key, it.value);
      count++;
    } else if (it.type === 'meta' && it.value && typeof it.value === 'object') {
      try {
        localStorage.setItem(it.key, JSON.stringify(it.value));
        count++;
      } catch {}
    }
  }
  return count;
}

// download helper 
export function downloadText(filename: string, text: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
