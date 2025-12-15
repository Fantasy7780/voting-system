import type { Abi } from 'viem';
import votingArtifact from '@/abi/Voting.json';

export const abi = votingArtifact.abi as unknown as Abi;
export const bytecode = votingArtifact.bytecode as `0x${string}`;

export const ENV_ADDR = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';
export const CHAIN_ID_ENV = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

export const PHASE = ['Initialization', 'Registration', 'Commit', 'Reveal', 'Finalized'] as const;
