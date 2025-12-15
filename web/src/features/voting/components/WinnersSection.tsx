'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function WinnersSection() {
  const { snapshot } = useVotingCtx();

  return (
    <Section title="Winners">
      {snapshot.phase !== 4 ? (
        <div>Switch to Finalized to load winners.</div>
      ) : snapshot.winners && snapshot.winners.length > 0 ? (
        <div>
          {snapshot.winners.length > 1 ? 'Tie: ' : 'Winner: '}
          {snapshot.winners.map((i, idx) => {
            const ii = Number(i);
            const name = snapshot.names[ii] ?? String(i);
            return (
              <span key={idx}>
                {name}
                {idx < snapshot.winners!.length - 1 ? ', ' : ''}
              </span>
            );
          })}
        </div>
      ) : (
        <div>-</div>
      )}
    </Section>
  );
}
