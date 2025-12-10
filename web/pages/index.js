import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useWalletClient,
  usePublicClient,
} from 'wagmi';
import { keccak256, encodeAbiParameters } from 'viem';
import votingArtifact from '@/abi/Voting.json';

const abi = votingArtifact.abi;
const bytecode = votingArtifact.bytecode;
const ENV_ADDR = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';
const chainIdEnv = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
const PHASE = ['Initialization', 'Registration', 'Commit', 'Reveal', 'Finalized'];

// 32byte random salt as hex string
function randSalt32() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return '0x' + Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// namespaced keys 
function saltKey({ account, addr, chainId, electionId = 'default' }) {
  return `salt:${chainId}:${addr}:${(account || '').toLowerCase()}:${electionId}`;
}
function metaKey({ account, addr, chainId }) {
  return `commitmeta:${chainId}:${addr}:${(account || '').toLowerCase()}`;
}

// bytes32 hex validator 
function isBytes32Hex(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);
}


function normalizeErr(e) {
  if (!e) return 'Unknown error';
  if (e.shortMessage) return e.shortMessage;
  if (e.message) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

// parse proposals from CSV or JSON array 
function parseNames(s) {
  const t = s.trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try { return (JSON.parse(t) || []).map((x) => String(x).trim()).filter(Boolean); }
    catch { return []; }
  }
  return t.split(',').map((x) => x.trim()).filter(Boolean);
}

// commit meta helpers 
function saveCommitMeta({ account, addr, chainId, index, salt, commitment }) {
  try {
    localStorage.setItem(
      metaKey({ account, addr, chainId }),
      JSON.stringify({ index, salt, commitment, addr, chainId })
    );
  } catch {}
}
function loadCommitMeta({ account, addr, chainId }) {
  try {
    const raw = localStorage.getItem(metaKey({ account, addr, chainId }));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// collect current/all backup items 
function collectCurrent({ account, addr, chainId }) {
  const items = [];
  const kSalt = saltKey({ account, addr, chainId });
  const vSalt = localStorage.getItem(kSalt);
  if (vSalt) items.push({ type: 'salt', key: kSalt, value: vSalt });

  const kMeta = metaKey({ account, addr, chainId });
  const vMeta = localStorage.getItem(kMeta);
  if (vMeta) {
    try { items.push({ type: 'meta', key: kMeta, value: JSON.parse(vMeta) }); }
    catch {}
  }
  return { version: 1, items };
}
function collectAll() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('salt:')) items.push({ type: 'salt', key: k, value: localStorage.getItem(k) });
    else if (k.startsWith('commitmeta:')) {
      const raw = localStorage.getItem(k);
      try { items.push({ type: 'meta', key: k, value: JSON.parse(raw || 'null') }); }
      catch {}
    }
  }
  return { version: 1, items };
}

// download helper 
function downloadText(filename, text) {
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

export default function Home() {
  const { connect, connectors } = useConnect();
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // dynamic contract address (no restart)
  const [addr, setAddr] = useState(ENV_ADDR);
  const [addrInput, setAddrInput] = useState(ENV_ADDR);

  // write + tx status
  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess: txOK } = useWaitForTransactionReceipt({ hash: txHash });

  // feature-detect for proposal management
  const supportsManage = useMemo(() => {
    try {
      const names = new Set((abi || []).filter((x) => x.type === 'function').map((x) => x.name));
      return names.has('addProposal') && names.has('renameProposal');
    } catch { return false; }
  }, []);

  // reads
  const { data: stateData, refetch: refetchState } = useReadContract({
    address: addr, abi, functionName: 'state', query: { enabled: !!addr },
  });
  const { data: namesData, refetch: refetchNames } = useReadContract({
    address: addr, abi, functionName: 'proposalNames', query: { enabled: !!addr },
  });
  const { data: regData, refetch: refetchReg } = useReadContract({
    address: addr, abi, functionName: 'registeredCount', query: { enabled: !!addr },
  });
  const { data: comData, refetch: refetchCom } = useReadContract({
    address: addr, abi, functionName: 'committedCount', query: { enabled: !!addr },
  });
  const { data: revData, refetch: refetchRev } = useReadContract({
    address: addr, abi, functionName: 'revealedCount', query: { enabled: !!addr },
  });
  const { data: resultsData, refetch: refetchResults } = useReadContract({
    address: addr, abi, functionName: 'results', query: { enabled: !!addr && Number(stateData) === 4 },
  });
  const { data: chairData, refetch: refetchChair } = useReadContract({
    address: addr, abi, functionName: 'chairperson', query: { enabled: !!addr },
  });
  // on-chain voter snapshot (registered, committed, revealed, vote, commitHash)
  const { data: voterData, refetch: refetchVoter } = useReadContract({
    address: addr, abi, functionName: 'voters', args: [address], query: { enabled: !!addr && !!address },
  });
  // deadlines
  const { data: commitDl, refetch: refetchCommitDl } = useReadContract({
    address: addr, abi, functionName: 'commitDeadline', query: { enabled: !!addr },
  });
  const { data: revealDl, refetch: refetchRevealDl } = useReadContract({
    address: addr, abi, functionName: 'revealDeadline', query: { enabled: !!addr },
  });
  const { data: winnersData, refetch: refetchWinners } = useReadContract({
    address: addr, abi, functionName: 'winners',
    query: { enabled: !!addr && Number(stateData) === 4 },
  });

  // ui states
  const [phase, setPhase] = useState(0);
  const [names, setNames] = useState([]);
  const [registered, setRegistered] = useState(0);
  const [committed, setCommitted] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [results, setResults] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [selIndex, setSelIndex] = useState(0);
  const [salt, setSalt] = useState('');
  const [commitment, setCommitment] = useState('');
  const [nextPhase, setNextPhase] = useState(1);
  const [registerAddr, setRegisterAddr] = useState('');

  // proposal management inputs
  const [newProposal, setNewProposal] = useState('');
  const [renameIdx, setRenameIdx] = useState('');
  const [renameName, setRenameName] = useState('');

  // deploy new round
  const [newRoundText, setNewRoundText] = useState('');

  // backup
  const [backupJson, setBackupJson] = useState('');
  const [importJson, setImportJson] = useState('');

  /** deadlines inputs (minutes from now) */
  const [commitMins, setCommitMins] = useState('');
  const [revealMins, setRevealMins] = useState('');

  /** compute commitment: keccak256( abi.encode(index, salt, voter, contract, chainId) ) */
  const computeCommitment = (index, saltHex) => {
    if (!address) throw new Error('Connect wallet first');
    const encoded = encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'address' }, // voter
        { type: 'address' }, // contract
        { type: 'uint256' }  // chainId
      ],
      [
        BigInt(index),
        saltHex,
        address,
        addr,
        BigInt(chainId || chainIdEnv)
      ]
    );
    return keccak256(encoded);
  };

  // UI
  useEffect(() => {
    if (stateData !== undefined) setPhase(Number(stateData));
    if (namesData) setNames(namesData);
    if (regData !== undefined) setRegistered(Number(regData));
    if (comData !== undefined) setCommitted(Number(comData));
    if (revData !== undefined) setRevealed(Number(revData));
    if (resultsData) {
      const [ns, vs] = resultsData;
      setResults({ names: ns, votes: vs.map(Number) });
    } else {
      setResults(null);
    }
  }, [stateData, namesData, regData, comData, revData, resultsData]);

  /** refresh all reads */
  const refreshAll = async () => {
    try {
      await Promise.all([
        refetchState?.(), refetchNames?.(), refetchReg?.(),
        refetchCom?.(), refetchRev?.(), refetchResults?.(), refetchChair?.(),
        refetchVoter?.(), refetchCommitDl?.(), refetchRevealDl?.(), refetchWinners?.(),
      ]);
    } catch {}
  };

  useEffect(() => { if (txOK) refreshAll(); }, [txOK]);
  useEffect(() => { if (addr) refreshAll(); }, [addr]);

  useEffect(() => { if (salt) console.log('[debug] salt:', salt); }, [salt]);
  useEffect(() => { if (commitment) console.log('[debug] commitment:', commitment); }, [commitment]);

  /** actions */
  const doChangeState = async () => {
    setErrorMsg('');
    try {
      await writeContractAsync({ address: addr, abi, functionName: 'changeState', args: [BigInt(nextPhase)] });
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doRegister = async () => {
    setErrorMsg('');
    if (!registerAddr) { setErrorMsg('Address required.'); return; }
    try {
      await writeContractAsync({ address: addr, abi, functionName: 'register', args: [registerAddr] });
      setRegisterAddr('');
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doGenSalt = () => {
    setErrorMsg('');
    const s = randSalt32();
    setSalt(s);
    localStorage.setItem(
      saltKey({ account: address, addr, chainId: chainId || chainIdEnv }),
      s
    );
  };

  const doCompute = () => {
    setErrorMsg('');
    if (!isBytes32Hex(salt)) { setErrorMsg('Salt must be 0x + 64 hex.'); return; }
    try {
      setCommitment(computeCommitment(selIndex, salt));
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doCommit = async () => {
    setErrorMsg('');

    let s = salt;
    if (!isBytes32Hex(s)) {
      const stored = localStorage.getItem(
        saltKey({ account: address, addr, chainId: chainId || chainIdEnv })
      ) || '';
      if (isBytes32Hex(stored)) { s = stored; setSalt(stored); }
    }
    if (!isBytes32Hex(s)) { setErrorMsg('Missing or invalid salt (0x + 64 hex).'); return; }

    let localCommit = '';
    try {
      localCommit = computeCommitment(selIndex, s);
    } catch (e) { setErrorMsg(normalizeErr(e)); return; }
    setCommitment(localCommit);
    saveCommitMeta({
      account: address,
      addr,
      chainId: chainId || chainIdEnv,
      index: selIndex,
      salt: s,
      commitment: localCommit,
    });

    try {
      await writeContractAsync({ address: addr, abi, functionName: 'commitVote', args: [localCommit] });
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doReveal = async () => {
    setErrorMsg('');

    const meta = loadCommitMeta({ account: address, addr, chainId: chainId || chainIdEnv });
    let targetIndex = selIndex;
    let s = salt;

    if (meta) {
      if (meta.addr?.toLowerCase() !== (addr || '').toLowerCase()) {
        setErrorMsg('Your commit was on a different contract. Switch Contract to that address.');
        return;
      }
      if (Number(meta.chainId) !== Number(chainId || chainIdEnv)) {
        setErrorMsg('Your commit was on a different network. Switch network and try again.');
        return;
      }
      if (isBytes32Hex(meta.salt)) { s = meta.salt; setSalt(s); }
      if (Number.isInteger(meta.index)) { targetIndex = Number(meta.index); setSelIndex(targetIndex); }
    } else if (!isBytes32Hex(s)) {
      const stored = localStorage.getItem(
        saltKey({ account: address, addr, chainId: chainId || chainIdEnv })
      ) || '';
      if (isBytes32Hex(stored)) { s = stored; setSalt(s); }
    }

    if (!isBytes32Hex(s)) { setErrorMsg('Missing or invalid salt (0x + 64 hex).'); return; }

    try {
      await writeContractAsync({
        address: addr,
        abi,
        functionName: 'revealVote',
        args: [BigInt(targetIndex), s],
      });
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doAddProposal = async () => {
    setErrorMsg('');
    if (!newProposal.trim()) { setErrorMsg('Proposal name required.'); return; }
    if (!(phase === 0 || phase === 1)) { setErrorMsg('Proposals are frozen.'); return; }
    try {
      await writeContractAsync({ address: addr, abi, functionName: 'addProposal', args: [newProposal.trim()] });
      setNewProposal('');
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doRenameProposal = async () => {
    setErrorMsg('');
    const i = Number(renameIdx);
    if (!Number.isInteger(i)) { setErrorMsg('Bad index.'); return; }
    if (!renameName.trim()) { setErrorMsg('New name required.'); return; }
    if (!(phase === 0 || phase === 1)) { setErrorMsg('Proposals are frozen.'); return; }
    try {
      await writeContractAsync({ address: addr, abi, functionName: 'renameProposal', args: [BigInt(i), renameName.trim()] });
      setRenameIdx('');
      setRenameName('');
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doSetAddr = () => {
    setErrorMsg('');
    if (!addrInput || !addrInput.startsWith('0x')) { setErrorMsg('Invalid address.'); return; }
    setAddr(addrInput);
  };

  const deployNewRound = async () => {
    setErrorMsg('');
    if (!walletClient) { setErrorMsg('Connect wallet first.'); return; }
    const names = parseNames(newRoundText);
    if (!names.length) { setErrorMsg('Enter proposals (CSV or JSON array).'); return; }
    try {
      const hash = await walletClient.deployContract({ abi, bytecode, args: [names] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) { setErrorMsg('Deploy failed.'); return; }
      setAddr(receipt.contractAddress);
      setAddrInput(receipt.contractAddress);
      setNewRoundText('');
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  // deadlines actions
  const doSetDeadlines = async () => {
    setErrorMsg('');
    const cm = Number(commitMins);
    const rm = Number(revealMins);
    if (!Number.isFinite(cm) || !Number.isFinite(rm) || cm <= 0 || rm <= 0) {
      setErrorMsg('Minutes must be positive numbers.');
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const commitUntil = BigInt(now + Math.floor(cm * 60));
    const revealUntil = BigInt(now + Math.floor(rm * 60));
    if (Number(commitUntil) >= Number(revealUntil)) {
      setErrorMsg('Commit must end before reveal.');
      return;
    }
    try {
      await writeContractAsync({
        address: addr, abi, functionName: 'setDeadlines', args: [commitUntil, revealUntil],
      });
      setCommitMins(''); setRevealMins('');
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  const doAdvanceIfExpired = async () => {
    setErrorMsg('');
    try {
      await writeContractAsync({ address: addr, abi, functionName: 'advanceIfExpired', args: [] });
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };

  // export/import actions
  const exportCurrent = () => {
    try {
      const blob = collectCurrent({ account: address, addr, chainId: chainId || chainIdEnv });
      setBackupJson(JSON.stringify(blob, null, 2));
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };
  const exportAll = () => {
    try {
      const blob = collectAll();
      setBackupJson(JSON.stringify(blob, null, 2));
    } catch (e) { setErrorMsg(normalizeErr(e)); }
  };
  const downloadBackup = () => {
    if (!backupJson.trim()) { setErrorMsg('Nothing to download. Click Export first.'); return; }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(`voting-salts-${ts}.json`, backupJson);
  };
  const importFromJson = () => {
    setErrorMsg('');
    let obj;
    try { obj = JSON.parse(importJson); }
    catch { setErrorMsg('Invalid JSON.'); return; }
    if (!obj || !Array.isArray(obj.items)) { setErrorMsg('Bad schema: missing items[].'); return; }
    let count = 0;
    for (const it of obj.items) {
      if (!it || typeof it.key !== 'string') continue;
      if (it.type === 'salt' && isBytes32Hex(it.value)) {
        localStorage.setItem(it.key, it.value); count++;
      } else if (it.type === 'meta' && it.value && typeof it.value === 'object') {
        try { localStorage.setItem(it.key, JSON.stringify(it.value)); count++; } catch {}
      }
    }
    if (count === 0) { setErrorMsg('No valid items imported.'); return; }
    const meta = loadCommitMeta({ account: address, addr, chainId: chainId || chainIdEnv });
    if (meta) {
      if (isBytes32Hex(meta.salt)) setSalt(meta.salt);
      if (Number.isInteger(meta.index)) setSelIndex(Number(meta.index));
      setCommitment(meta.commitment || '');
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2>Voting (commit–reveal)</h2>

      {errorMsg && (
        <div style={{ background: '#ffe5e5', color: '#900', padding: '8px 12px', border: '1px solid #f5b5b5', borderRadius: 6, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {errorMsg}
        </div>
      )}

      {(isPending || isMining) && (
        <div style={{ background: '#eef6ff', color: '#084298', padding: '8px 12px', border: '1px solid #b6daff', borderRadius: 6, marginBottom: 12 }}>
          Waiting for transaction…
        </div>
      )}

      {/* wallet */}
      <section style={{ marginBottom: 12 }}>
        <b>Wallet</b><br />
        {isConnected ? (
          <div>
            <div>{address} (chain {chainId})</div>
            <button onClick={() => disconnect()}>Disconnect</button>
          </div>
        ) : (
          connectors.map((c) => (
            <button key={c.uid} onClick={() => connect({ connector: c })} style={{ marginRight: 8 }}>
              Connect {c.name}
            </button>
          ))
        )}
      </section>

      {/* contract address + switch */}
      <section style={{ marginBottom: 12 }}>
        <b>Contract</b>
        <div style={{ marginTop: 6 }}>
          <input value={addrInput} onChange={(e) => setAddrInput(e.target.value)} placeholder="0x..." style={{ width: '70%' }} />
          <button onClick={doSetAddr} style={{ marginLeft: 8 }}>Use address</button>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#555' }}>Active: {addr || '-'}</div>
      </section>

      {/* new round (deploy) */}
      <section style={{ marginBottom: 12, borderTop: '1px solid #ddd', paddingTop: 10 }}>
        <b>New Round</b> <span style={{ fontSize: 12, color: '#666' }}>(deploy a new contract)</span>
        <div style={{ marginTop: 6 }}>
          <input
            value={newRoundText}
            onChange={(e) => setNewRoundText(e.target.value)}
            placeholder='CSV: Alice,Bob or JSON: ["Alice","Bob"]'
            style={{ width: '70%' }}
          />
          <button onClick={deployNewRound} disabled={!isConnected || isPending || isMining} style={{ marginLeft: 8 }}>
            Deploy New Round
          </button>
        </div>
      </section>

      {/* status */}
      <section style={{ marginBottom: 12 }}>
        <b>Status</b>
        <div>Chairperson: {chairData || '-'}</div>
        <div>Phase: {PHASE[phase]} ({phase})</div>
        <div>Registered: {registered} | Committed: {committed} | Revealed: {revealed}</div>
        <div>Proposals: {names.join(' , ')}</div>
        <div>Commit deadline: {commitDl ? new Date(Number(commitDl) * 1000).toLocaleString() : '-'}</div>
        <div>Reveal deadline: {revealDl ? new Date(Number(revealDl) * 1000).toLocaleString() : '-'}</div>
      </section>

      {/* chairperson ops */}
      <section style={{ marginBottom: 12, borderTop: '1px solid #ddd', paddingTop: 10 }}>
        <b>Chairperson Ops</b>

        <div style={{ marginTop: 6 }}>
          next phase (1-Registration / 2-Commit / 3-Reveal / 4-Finalized):&nbsp;
          <input value={nextPhase} onChange={(e) => setNextPhase(Number(e.target.value))} style={{ width: 60 }} />
          <button onClick={doChangeState} disabled={isPending || isMining} style={{ marginLeft: 8 }}>
            changeState
          </button>
        </div>

        <div style={{ marginTop: 6 }}>
          register address:&nbsp;
          <input
            value={registerAddr}
            onChange={(e) => setRegisterAddr(e.target.value)}
            placeholder="0x..."
            style={{ width: '60%' }}
          />
          <button onClick={doRegister} disabled={isPending || isMining} style={{ marginLeft: 8 }}>
            register
          </button>
        </div>

        {/* set deadlines during Registration */}
        <div style={{ marginTop: 10, opacity: (phase === 1) ? 1 : 0.6 }}>
          <div><b>Deadlines</b> (set during Registration)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input
              value={commitMins}
              onChange={(e) => setCommitMins(e.target.value)}
              placeholder="commit minutes from now"
              style={{ width: 200 }}
              disabled={phase !== 1}
            />
            <input
              value={revealMins}
              onChange={(e) => setRevealMins(e.target.value)}
              placeholder="reveal minutes from now"
              style={{ width: 200 }}
              disabled={phase !== 1}
            />
            <button onClick={doSetDeadlines} disabled={isPending || isMining || phase !== 1}>
              setDeadlines
            </button>
          </div>
        </div>

        {/* anyone can call， succeeds only when expired */}
        <div style={{ marginTop: 10 }}>
          <button onClick={doAdvanceIfExpired} disabled={isPending || isMining}>
            advanceIfExpired
          </button>
        </div>

        {supportsManage && (
          <div style={{ marginTop: 10, opacity: (phase === 0 || phase === 1) ? 1 : 0.6 }}>
            <div style={{ marginBottom: 6 }}><b>Proposals</b> (Initialization/Registration only)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input value={newProposal} onChange={(e) => setNewProposal(e.target.value)} placeholder="new proposal name" style={{ width: '60%' }} disabled={!(phase === 0 || phase === 1)} />
              <button onClick={doAddProposal} disabled={isPending || isMining || !(phase === 0 || phase === 1)}>addProposal</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={renameIdx} onChange={(e) => setRenameIdx(e.target.value)} placeholder="index" style={{ width: 80 }} disabled={!(phase === 0 || phase === 1)} />
              <input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="new name" style={{ width: '50%' }} disabled={!(phase === 0 || phase === 1)} />
              <button onClick={doRenameProposal} disabled={isPending || isMining || !(phase === 0 || phase === 1)}>renameProposal</button>
            </div>
          </div>
        )}
      </section>

      {/* choice */}
      <section style={{ marginBottom: 12, borderTop: '1px solid #ddd', paddingTop: 10 }}>
        <b>Your Choice</b><br />
        <select value={selIndex} onChange={(e) => setSelIndex(Number(e.target.value))}>
          {names.map((n, i) => (
            <option key={i} value={i}>
              {i} - {n}
            </option>
          ))}
        </select>
      </section>

      {/* commit */}
      <section style={{ marginBottom: 12, borderTop: '1px solid #ddd', paddingTop: 10 }}>
        <b>Commit</b>
        <div style={{ marginTop: 6 }}>
          <button onClick={doGenSalt}>Generate Salt</button>
          <input value={salt} onChange={(e) => setSalt(e.target.value)} placeholder="0x..." style={{ width: '70%', marginLeft: 8 }} />
        </div>
        <div style={{ marginTop: 6 }}>
          <button onClick={doCompute}>Compute Commitment</button>
          <input value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="0x..." style={{ width: '70%', marginLeft: 8 }} />
        </div>
        <div style={{ marginTop: 6 }}>
          <button onClick={doCommit} disabled={isPending || isMining}>commitVote</button>
        </div>
      </section>

      {/* reveal */}
      <section style={{ marginBottom: 12, borderTop: '1px solid #ddd', paddingTop: 10 }}>
        <b>Reveal</b><br />
        <button onClick={doReveal} disabled={isPending || isMining}>revealVote</button>
      </section>

      {/* results */}
      <section style={{ marginBottom: 12, borderTop: '1px solid #ddd', paddingTop: 10 }}>
        <b>Results</b>
        {results ? (
          <ul>
            {results.names.map((n, i) => (
              <li key={i}>
                {n}: {results.votes[i]} votes
              </li>
            ))}
          </ul>
        ) : (
          <div>Switch to Finalized to load results.</div>
        )}

        {/* winners */}
        {Number(phase) === 4 && winnersData && names.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <b>Winners</b>
            <div>
              {winnersData.length > 1 ? 'Tie: ' : 'Winner: '}
              {winnersData.map((i, idx) => {
                const ii = Number(i);
                return <span key={idx}>{names[ii]}{idx < winnersData.length - 1 ? ', ' : ''}</span>;
              })}
            </div>
          </div>
        )}
      </section>

      {/* debug */}
      <section style={{ marginBottom: 12, borderTop: '1px dashed #ccc', paddingTop: 10 }}>
        <b>Debug</b>
        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: '18px' }}>
          <div>Salt (current input): {salt || '-'}</div>
          <div>Commitment (current input): {commitment || '-'}</div>
          {(() => {
            const ok = isBytes32Hex(salt) && address && addr;
            const recomputed = ok ? keccak256(
              encodeAbiParameters(
                [
                  { type: 'uint256' },
                  { type: 'bytes32' },
                  { type: 'address' },
                  { type: 'address' },
                  { type: 'uint256' }
                ],
                [BigInt(selIndex), salt, address, addr, BigInt(chainId || chainIdEnv)]
              )
            ) : '';
            const onchain = voterData && voterData.length >= 5 ? voterData[4] : '';
            const meta = loadCommitMeta({ account: address, addr, chainId: chainId || chainIdEnv });
            const metaRecomputed = (meta && isBytes32Hex(meta.salt) && addr)
              ? keccak256(
                  encodeAbiParameters(
                    [
                      { type: 'uint256' },
                      { type: 'bytes32' },
                      { type: 'address' },
                      { type: 'address' },
                      { type: 'uint256' }
                    ],
                    [BigInt(meta.index ?? 0), meta.salt, address, addr, BigInt(chainId || chainIdEnv)]
                  )
                )
              : '';
            const matchInput = recomputed && onchain
              ? (recomputed.toLowerCase() === onchain.toLowerCase() ? 'YES' : 'NO')
              : '-';
            const matchMeta = metaRecomputed && onchain
              ? (metaRecomputed.toLowerCase() === onchain.toLowerCase() ? 'YES' : 'NO')
              : '-';
            return (
              <>
                <div>Commitment (recomputed by current input): {recomputed || '-'}</div>
                <div>Commitment (recomputed by saved meta): {metaRecomputed || '-'}</div>
                <div>Commitment (on-chain): {onchain || '-'}</div>
                <div>Match current input vs on-chain: {matchInput}</div>
                <div>Match saved meta vs on-chain: {matchMeta}</div>
              </>
            );
          })()}
          <button onClick={refreshAll} style={{ marginTop: 8 }}>Refresh debug</button>
        </div>
      </section>

      {/* backup / restore */}
      <section style={{ marginBottom: 24, borderTop: '1px solid #ddd', paddingTop: 10 }}>
        <b>Backup / Restore</b>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={exportCurrent}>Export current</button>
          <button onClick={exportAll}>Export all</button>
          <button onClick={downloadBackup}>Download .json</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: '#555' }}>Export JSON (readonly)</div>
            <textarea value={backupJson} readOnly rows={10} style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#555' }}>Import JSON (paste here)</div>
            <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace' }} />
            <button onClick={importFromJson} style={{ marginTop: 6 }}>Import JSON</button>
          </div>
        </div>
      </section>
    </div>
  );
}
