import { useCallback, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi';
import { isAddress, type Address } from 'viem';
import { abi, bytecode, CHAIN_ID_ENV } from '../contract';
import type { Bytes32 } from '../types';
import { computeCommitment, isBytes32Hex, normalizeErr, parseNames, randSalt32 } from '../utils';
import {
  collectAll,
  collectCurrent,
  downloadText,
  importBackup,
  loadCommitMeta,
  loadSalt,
  saveCommitMeta,
  saltKey,
} from '../storage';

export function useVotingActions(args: { addr?: Address }) {
  const { address: account, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess: txOK } = useWaitForTransactionReceipt({ hash: txHash });

  const [errorMsg, setErrorMsg] = useState('');

  const fail = useCallback((msg: string) => {
    setErrorMsg(msg);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setErrorMsg('');
      try {
        return await fn();
      } catch (e) {
        setErrorMsg(normalizeErr(e));
        return undefined;
      }
    },
    []
  );

  const ensureAddr = useCallback((): Address => {
    if (!args.addr) throw new Error('Invalid contract address.');
    return args.addr;
  }, [args.addr]);

  const ensureAccount = useCallback((): Address => {
    if (!account) throw new Error('Connect wallet first.');
    return account as Address;
  }, [account]);

  const activeChainId = Number(chainId ?? CHAIN_ID_ENV);

  const generateSalt = useCallback((): Bytes32 => {
    setErrorMsg('');
    const addr = ensureAddr();
    const acc = ensureAccount();
    const s = randSalt32();
    try {
      localStorage.setItem(saltKey({ account: acc, addr, chainId: activeChainId }), s);
    } catch {}
    return s;
  }, [ensureAddr, ensureAccount, activeChainId]);

  const compute = useCallback(
    (index: number, salt: Bytes32) => {
      const addr = ensureAddr();
      const voter = ensureAccount();
      return computeCommitment({ index, salt, voter, contract: addr, chainId: activeChainId });
    },
    [ensureAddr, ensureAccount, activeChainId]
  );

  const commitVote = useCallback(
    async (index: number, saltInput?: string) => {
      return run(async () => {
        const addr = ensureAddr();
        const voter = ensureAccount();

        let salt: Bytes32 | '' = (isBytes32Hex(saltInput) ? saltInput : '') as any;
        if (!salt) salt = loadSalt({ account: voter, addr, chainId: activeChainId });
        if (!salt) throw new Error('Missing or invalid salt (0x + 64 hex).');

        const commitment = computeCommitment({
          index,
          salt,
          voter,
          contract: addr,
          chainId: activeChainId,
        });

        saveCommitMeta({
          account: voter,
          addr,
          chainId: activeChainId,
          index,
          salt,
          commitment,
        });

        await writeContractAsync({
          address: addr,
          abi,
          functionName: 'commitVote',
          args: [commitment],
        });

        return { salt, commitment };
      });
    },
    [run, ensureAddr, ensureAccount, activeChainId, writeContractAsync]
  );

  const revealVote = useCallback(
    async (index: number, saltInput?: string) => {
      return run(async () => {
        const addr = ensureAddr();
        const voter = ensureAccount();

        const meta = loadCommitMeta({ account: voter, addr, chainId: activeChainId });

        let targetIndex = index;
        let salt: Bytes32 | '' = (isBytes32Hex(saltInput) ? saltInput : '') as any;

        if (meta) {
          if (meta.addr.toLowerCase() !== addr.toLowerCase()) {
            throw new Error('Your commit was on a different contract. Switch Contract to that address.');
          }
          if (Number(meta.chainId) !== activeChainId) {
            throw new Error('Your commit was on a different network. Switch network and try again.');
          }
          targetIndex = Number(meta.index);
          salt = meta.salt;
        } else {
          if (!salt) salt = loadSalt({ account: voter, addr, chainId: activeChainId });
        }

        if (!salt) throw new Error('Missing or invalid salt (0x + 64 hex).');

        await writeContractAsync({
          address: addr,
          abi,
          functionName: 'revealVote',
          args: [BigInt(targetIndex), salt],
        });

        return { salt, index: targetIndex };
      });
    },
    [run, ensureAddr, ensureAccount, activeChainId, writeContractAsync]
  );

  const changeState = useCallback(
    async (nextPhase: number) => {
      return run(async () => {
        const addr = ensureAddr();
        await writeContractAsync({
          address: addr,
          abi,
          functionName: 'changeState',
          args: [BigInt(nextPhase)],
        });
      });
    },
    [run, ensureAddr, writeContractAsync]
  );

  const register = useCallback(
    async (registerAddr: string) => {
      return run(async () => {
        const addr = ensureAddr();
        if (!isAddress(registerAddr)) throw new Error('Invalid address.');
        await writeContractAsync({
          address: addr,
          abi,
          functionName: 'register',
          args: [registerAddr],
        });
      });
    },
    [run, ensureAddr, writeContractAsync]
  );

  const setDeadlines = useCallback(
    async (commitMins: number, revealMins: number) => {
      return run(async () => {
        const addr = ensureAddr();
        if (!Number.isFinite(commitMins) || !Number.isFinite(revealMins) || commitMins <= 0 || revealMins <= 0) {
          throw new Error('Minutes must be positive numbers.');
        }
        const now = Math.floor(Date.now() / 1000);
        const commitUntil = BigInt(now + Math.floor(commitMins * 60));
        const revealUntil = BigInt(now + Math.floor(revealMins * 60));
        if (Number(commitUntil) >= Number(revealUntil)) throw new Error('Commit must end before reveal.');
        await writeContractAsync({
          address: addr,
          abi,
          functionName: 'setDeadlines',
          args: [commitUntil, revealUntil],
        });
      });
    },
    [run, ensureAddr, writeContractAsync]
  );

  const advanceIfExpired = useCallback(async () => {
    return run(async () => {
      const addr = ensureAddr();
      await writeContractAsync({ address: addr, abi, functionName: 'advanceIfExpired', args: [] });
    });
  }, [run, ensureAddr, writeContractAsync]);

  const addProposal = useCallback(
    async (name: string) => {
      return run(async () => {
        const addr = ensureAddr();
        const n = name.trim();
        if (!n) throw new Error('Proposal name required.');
        await writeContractAsync({ address: addr, abi, functionName: 'addProposal', args: [n] });
      });
    },
    [run, ensureAddr, writeContractAsync]
  );

  const renameProposal = useCallback(
    async (index: number, name: string) => {
      return run(async () => {
        const addr = ensureAddr();
        const n = name.trim();
        if (!Number.isInteger(index) || index < 0) throw new Error('Invalid index.');
        if (!n) throw new Error('New name required.');
        await writeContractAsync({
          address: addr,
          abi,
          functionName: 'renameProposal',
          args: [BigInt(index), n],
        });
      });
    },
    [run, ensureAddr, writeContractAsync]
  );

  const deployNewRound = useCallback(
    async (text: string) => {
      return run(async () => {
        if (!walletClient) throw new Error('Connect wallet first.');
        if (!publicClient) throw new Error('Public client not ready.');
        const names = parseNames(text);
        if (!names.length) throw new Error('Enter proposals (CSV or JSON array).');
        const hash = await walletClient.deployContract({
          abi,
          bytecode,
          args: [names],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (!receipt.contractAddress) throw new Error('Deploy failed.');
        return receipt.contractAddress as Address;
      });
    },
    [run, walletClient, publicClient]
  );

  const exportCurrentJson = useCallback(() => {
    setErrorMsg('');
    const addr = args.addr;
    if (!addr || !account) return '';
    const blob = collectCurrent({ account: account as Address, addr, chainId: activeChainId });
    return JSON.stringify(blob, null, 2);
  }, [args.addr, account, activeChainId]);

  const exportAllJson = useCallback(() => {
    setErrorMsg('');
    const blob = collectAll();
    return JSON.stringify(blob, null, 2);
  }, []);

  const downloadJson = useCallback(
    (text: string) => {
      if (!text.trim()) return fail('Nothing to download. Click Export first.');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      downloadText(`voting-salts-${ts}.json`, text);
    },
    [fail]
  );

  const importJson = useCallback(
    (text: string) => {
      setErrorMsg('');
      let obj: unknown;
      try {
        obj = JSON.parse(text);
      } catch {
        fail('Invalid JSON.');
        return 0;
      }
      const count = importBackup(obj);
      if (count === 0) fail('No valid items imported.');
      return count;
    },
    [fail]
  );

  return {
    errorMsg,
    setErrorMsg,
    isPending,
    isMining,
    txOK,
    txHash,
    activeChainId,

    fail,
    generateSalt,
    compute,

    commitVote,
    revealVote,

    changeState,
    register,
    setDeadlines,
    advanceIfExpired,

    addProposal,
    renameProposal,

    deployNewRound,

    exportCurrentJson,
    exportAllJson,
    downloadJson,
    importJson,
  };
}
