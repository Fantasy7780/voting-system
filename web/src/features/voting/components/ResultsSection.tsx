'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function ResultsSection() {
  const { snapshot } = useVotingCtx();

  return (
    <Section title="Results">
      {snapshot.results ? (
        <ul>
          {snapshot.results.names.map((n, i) => (
            <li key={i}>
              {n}: {snapshot.results?.votes[i]} votes
            </li>
          ))}
        </ul>
      ) : (
        <div>Switch to Finalized to load results.</div>
      )}
    </Section>
  );
}
