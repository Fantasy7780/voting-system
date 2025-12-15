import type { Address, Hex } from 'viem';

export type Phase = 0 | 1 | 2 | 3 | 4;
export type Bytes32 = `0x${string}`;

export interface CommitMeta {
  account?: Address;
  addr: Address;
  chainId: number;
  index: number;
  salt: Bytes32;
  commitment: Hex;
}

export interface BackupItemSalt {
  type: 'salt';
  key: string;
  value: Bytes32;
}

export interface BackupItemMeta {
  type: 'meta';
  key: string;
  value: CommitMeta;
}

export interface BackupBlob {
  version: 1;
  items: Array<BackupItemSalt | BackupItemMeta>;
}

export interface VoteResults {
  names: string[];
  votes: number[];
}
