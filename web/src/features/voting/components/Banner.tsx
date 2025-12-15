'use client';

import { useVotingCtx } from '../VotingContext';

export function Banner() {
  const { actions } = useVotingCtx();

  return (
    <>
      {actions.errorMsg && (
        <div
          style={{
            background: '#ffe5e5',
            color: '#900',
            padding: '8px 12px',
            border: '1px solid #f5b5b5',
            borderRadius: 6,
            marginBottom: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {actions.errorMsg}
        </div>
      )}

      {(actions.isPending || actions.isMining) && (
        <div
          style={{
            background: '#eef6ff',
            color: '#084298',
            padding: '8px 12px',
            border: '1px solid #b6daff',
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          Waiting for transaction…
        </div>
      )}
    </>
  );
}
