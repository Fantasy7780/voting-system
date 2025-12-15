'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isAddress, type Address } from 'viem';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { CHAIN_ID_ENV, ENV_ADDR } from './contract';
import { useVotingSnapshot } from './hooks/useVotingSnapshot';
import { useVotingActions } from './hooks/useVotingActions';
import { isBytes32Hex } from './utils';
import { loadCommitMeta } from './storage';

export interface VotingContextValue {
  // wallet
  isConnected: boolean;
  address?: Address;
  chainId?: number;
  connectors: ReturnType<typeof useConnect>['connectors'];
  connect: ReturnType<typeof useConnect>['connect'];
  disconnect: ReturnType<typeof useDisconnect>['disconnect'];

  // contract
  addr?: Address;
  addrInput: string;
  setAddrInput: (v: string) => void;
  setAddrFromInput: () => void;

  // ui inputs
  newRoundText: string;
  setNewRoundText: (v: string) => void;

  nextPhase: number;
  setNextPhase: (v: number) => void;

  registerAddr: string;
  setRegisterAddr: (v: string) => void;

  commitMins: string;
  setCommitMins: (v: string) => void;
  revealMins: string;
  setRevealMins: (v: string) => void;

  newProposal: string;
  setNewProposal: (v: string) => void;

  renameIdx: string;
  setRenameIdx: (v: string) => void;
  renameName: string;
  setRenameName: (v: string) => void;

  selIndex: number;
  setSelIndex: (v: number) => void;

  salt: string;
  setSalt: (v: string) => void;

  commitment: string;
  setCommitment: (v: string) => void;

  backupJson: string;
  setBackupJson: (v: string) => void;

  importJson: string;
  setImportJson: (v: string) => void;

  // data + actions
  snapshot: ReturnType<typeof useVotingSnapshot>;
  actions: ReturnType<typeof useVotingActions>;

  // helpers
  activeChainId: number;
  setAddrDirect: (a: Address) => void;
}

const Ctx = createContext<VotingContextValue | null>(null);

export function useVotingCtx(): VotingContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('VotingContext not found.');
  return v;
}

export function VotingProvider({ children }: { children: React.ReactNode }) {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, chainId, isConnected } = useAccount();

  const [addr, setAddr] = useState<Address | undefined>(() =>
    isAddress(ENV_ADDR) ? (ENV_ADDR as Address) : undefined
  );
  const [addrInput, setAddrInput] = useState<string>(ENV_ADDR);

  // ui inputs
  const [newRoundText, setNewRoundText] = useState('');
  const [nextPhase, setNextPhase] = useState(1);
  const [registerAddr, setRegisterAddr] = useState('');

  const [commitMins, setCommitMins] = useState('');
  const [revealMins, setRevealMins] = useState('');

  const [newProposal, setNewProposal] = useState('');
  const [renameIdx, setRenameIdx] = useState('0');
  const [renameName, setRenameName] = useState('');

  const [selIndex, setSelIndex] = useState(0);
  const [salt, setSalt] = useState('');
  const [commitment, setCommitment] = useState('');

  const [backupJson, setBackupJson] = useState('');
  const [importJson, setImportJson] = useState('');

  const activeChainId = Number(chainId ?? CHAIN_ID_ENV);

  const snapshot = useVotingSnapshot({
    addr,
    account: (address as Address | undefined) ?? undefined,
  });

  const actions = useVotingActions({ addr });

  const setAddrFromInput = () => {
    actions.setErrorMsg('');
    if (!isAddress(addrInput)) return actions.fail('Invalid address.');
    setAddr(addrInput as Address);
  };

  // restore salt/index/commitment from meta if present 
  useEffect(() => {
    if (!addr || !address) return;
    const meta = loadCommitMeta({ account: address as Address, addr, chainId: activeChainId });
    if (!meta) return;
    if (isBytes32Hex(meta.salt)) setSalt(meta.salt);
    if (Number.isInteger(meta.index)) setSelIndex(Number(meta.index));
    setCommitment(meta.commitment || '');
  }, [addr, address, activeChainId]);

  // refetch on successful tx
  useEffect(() => {
    if (actions.txOK) snapshot.refetchAll();
  }, [actions.txOK, snapshot]);

  const value: VotingContextValue = useMemo(
    () => ({
      isConnected,
      address: (address as Address | undefined) ?? undefined,
      chainId: chainId ?? undefined,
      connectors,
      connect,
      disconnect,

      addr,
      addrInput,
      setAddrInput,
      setAddrFromInput,
      setAddrDirect: setAddr,

      newRoundText,
      setNewRoundText,

      nextPhase,
      setNextPhase,

      registerAddr,
      setRegisterAddr,

      commitMins,
      setCommitMins,
      revealMins,
      setRevealMins,

      newProposal,
      setNewProposal,

      renameIdx,
      setRenameIdx,
      renameName,
      setRenameName,

      selIndex,
      setSelIndex,

      salt,
      setSalt,

      commitment,
      setCommitment,

      backupJson,
      setBackupJson,

      importJson,
      setImportJson,

      snapshot,
      actions,

      activeChainId,
    }),
    [
      isConnected,
      address,
      chainId,
      connectors,
      connect,
      disconnect,
      addr,
      addrInput,
      newRoundText,
      nextPhase,
      registerAddr,
      commitMins,
      revealMins,
      newProposal,
      renameIdx,
      renameName,
      selIndex,
      salt,
      commitment,
      backupJson,
      importJson,
      snapshot,
      actions,
      activeChainId,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
