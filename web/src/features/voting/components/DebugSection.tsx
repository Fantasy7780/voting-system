'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';
import { computeCommitment, isBytes32Hex } from '../utils';
import { loadCommitMeta } from '../storage';

export function DebugSection() {
  const { snapshot, actions, addr, address, selIndex, salt, commitment, activeChainId } = useVotingCtx();

  const ok = !!addr && !!address && isBytes32Hex(salt);

  const recomputed = ok
    ? computeCommitment({
        index: selIndex,
        salt,
        voter: address!,
        contract: addr!,
        chainId: activeChainId,
      })
    : '';

  const onchain = (() => {
    const v = snapshot.voterRaw;
    // voter tuple last field is usually commitment hash.
    if (!v || !Array.isArray(v)) return '';
    const last = v[v.length - 1];
    return typeof last === 'string' ? last : '';
  })();

  const metaRecomputed = (() => {
    if (!addr || !address) return '';
    const meta = loadCommitMeta({ account: address, addr, chainId: activeChainId });
    if (!meta) return '';
    if (!isBytes32Hex(meta.salt)) return '';
    return computeCommitment({
      index: Number(meta.index ?? 0),
      salt: meta.salt,
      voter: address,
      contract: addr,
      chainId: activeChainId,
    });
  })();

  const matchInput = ok && onchain ? String(recomputed === onchain) : '-';
  const matchMeta = metaRecomputed && onchain ? String(metaRecomputed === onchain) : '-';

  return (
    <Section title="Debug" topBorder="dashed">
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: '18px' }}>
        <div>Salt (current input): {salt || '-'}</div>
        <div>Commitment (current input): {commitment || '-'}</div>
        <div>Commitment (recomputed by current input): {recomputed || '-'}</div>
        <div>Commitment (recomputed by saved meta): {metaRecomputed || '-'}</div>
        <div>Commitment (on-chain): {onchain || '-'}</div>
        <div>Match current input vs on-chain: {matchInput}</div>
        <div>Match saved meta vs on-chain: {matchMeta}</div>
        <button onClick={() => snapshot.refetchAll()} style={{ marginTop: 8 }} disabled={actions.isPending || actions.isMining}>
          Refresh debug
        </button>
      </div>
    </Section>
  );
}
