'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';
import { PHASE } from '../contract';
import { formatDeadline } from '../utils';

export function StatusSection() {
  const { snapshot } = useVotingCtx();

  return (
    <Section title="Status">
      <div>Chairperson: {snapshot.chairperson ? String(snapshot.chairperson) : '-'}</div>
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
