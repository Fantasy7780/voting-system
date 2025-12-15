import { useCallback, useMemo } from 'react';
import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { abi } from '../contract';
import type { Phase, VoteResults } from '../types';

export function useVotingSnapshot(args: { addr?: Address; account?: Address }) {
  const enabled = !!args.addr;

  const state = useReadContract({
    address: args.addr,
    abi,
    functionName: 'state',
    query: { enabled },
  });

  const names = useReadContract({
    address: args.addr,
    abi,
    functionName: 'proposalNames',
    query: { enabled },
  });

  const reg = useReadContract({
    address: args.addr,
    abi,
    functionName: 'registeredCount',
    query: { enabled },
  });

  const com = useReadContract({
    address: args.addr,
    abi,
    functionName: 'committedCount',
    query: { enabled },
  });

  const rev = useReadContract({
    address: args.addr,
    abi,
    functionName: 'revealedCount',
    query: { enabled },
  });

  const chair = useReadContract({
    address: args.addr,
    abi,
    functionName: 'chairperson',
    query: { enabled },
  });

  const commitDl = useReadContract({
    address: args.addr,
    abi,
    functionName: 'commitDeadline',
    query: { enabled },
  });

  const revealDl = useReadContract({
    address: args.addr,
    abi,
    functionName: 'revealDeadline',
    query: { enabled },
  });

  const phase = (Number(state.data ?? 0) as Phase);

  const resultsRaw = useReadContract({
    address: args.addr,
    abi,
    functionName: 'results',
    query: { enabled: enabled && phase === 4 },
  });

  const winners = useReadContract({
    address: args.addr,
    abi,
    functionName: 'winners',
    query: { enabled: enabled && phase === 4 },
  });

  const voter = useReadContract({
    address: args.addr,
    abi,
    functionName: 'voters',
    args: args.account ? [args.account] : undefined,
    query: { enabled: enabled && !!args.account },
  });

  // feature-detect for proposal management
  const supportsManage = useMemo(() => {
    try {
      const names = new Set(
        (abi as any[])
          .filter((x) => x?.type === 'function')
          .map((x) => x?.name)
      );
      return names.has('addProposal') && names.has('renameProposal');
    } catch {
      return false;
    }
  }, []);

  const results: VoteResults | null = useMemo(() => {
    const r = resultsRaw.data as any;
    if (!r) return null;
    const [ns, vs] = r as [string[], bigint[]];
    return { names: ns, votes: (vs || []).map((x) => Number(x)) };
  }, [resultsRaw.data]);

  // refresh all reads 
  const refetchAll = useCallback(async () => {
    await Promise.allSettled([
      state.refetch?.(),
      names.refetch?.(),
      reg.refetch?.(),
      com.refetch?.(),
      rev.refetch?.(),
      chair.refetch?.(),
      commitDl.refetch?.(),
      revealDl.refetch?.(),
      resultsRaw.refetch?.(),
      winners.refetch?.(),
      voter.refetch?.(),
    ]);
  }, [
    state.refetch,
    names.refetch,
    reg.refetch,
    com.refetch,
    rev.refetch,
    chair.refetch,
    commitDl.refetch,
    revealDl.refetch,
    resultsRaw.refetch,
    winners.refetch,
    voter.refetch,
  ]);

  return {
    phase,
    names: ((names.data as string[]) || []) as string[],
    chairperson: (chair.data as Address | undefined) ?? undefined,
    counts: {
      registered: Number(reg.data ?? 0),
      committed: Number(com.data ?? 0),
      revealed: Number(rev.data ?? 0),
    },
    deadlines: {
      commitDl: commitDl.data as bigint | undefined,
      revealDl: revealDl.data as bigint | undefined,
    },
    results,
    winners: winners.data as readonly bigint[] | undefined,
    voterRaw: voter.data as any,
    supportsManage,
    refetchAll,
  };
}
