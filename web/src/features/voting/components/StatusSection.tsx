'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';
import { PHASE } from '../contract';
import { formatDeadline } from '../utils';

export function StatusSection() {
  const { snapshot, addr, devMode, isChair } = useVotingCtx();

  if (!devMode) {
  return (
    <Section title="Status">
      <div>Phase: {PHASE[snapshot.phase]} ({snapshot.phase})</div>
      <div>Proposals: {snapshot.names.join(' , ')}</div>

      {isChair && (
        <>
          <div>Registered: {snapshot.counts.registered} | Committed: {snapshot.counts.committed} | Revealed: {snapshot.counts.revealed}</div>
          <div>Commit deadline: {formatDeadline(snapshot.deadlines.commitDl)}</div>
          <div>Reveal deadline: {formatDeadline(snapshot.deadlines.revealDl)}</div>
        </>
      )}
    </Section>
  );
}

  return (
    <Section title="Status">
      <div>Contract: {addr || '-'}</div>
      <div>Chairperson: {snapshot.chairperson ? String(snapshot.chairperson) : '-'}</div>
      <div>
        Role (auto): {snapshot.chairperson ? (isChair ? 'Chairperson' : 'Voter') : '-'}
        {devMode ? ' (dev override: show all)' : ''}
      </div>
      <div>
        Phase: {PHASE[snapshot.phase]} ({snapshot.phase})
      </div>
      <div>
        Registered: {snapshot.counts.registered} | Committed: {snapshot.counts.committed} | Revealed: {snapshot.counts.revealed}
      </div>
      <div>Proposals: {snapshot.names.join(' , ')}</div>
      <div>Commit deadline: {formatDeadline(snapshot.deadlines.commitDl)}</div>
      <div>Reveal deadline: {formatDeadline(snapshot.deadlines.revealDl)}</div>
    </Section>
  );
}
