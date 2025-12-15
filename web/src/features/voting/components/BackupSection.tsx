'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function BackupSection() {
  const { snapshot, actions, backupJson, setBackupJson, importJson, setImportJson } = useVotingCtx();

  return (
    <Section title="Backup / Restore">
      <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setBackupJson(actions.exportCurrentJson())}>Export current</button>
        <button onClick={() => setBackupJson(actions.exportAllJson())}>Export all</button>
        <button onClick={() => actions.downloadJson(backupJson)}>Download .json</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: '#555' }}>Export JSON (readonly)</div>
          <textarea
            value={backupJson}
            readOnly
            rows={10}
            style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace' }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#555' }}>Import JSON (paste here)</div>
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            rows={10}
            style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace' }}
          />
          <button
            onClick={() => {
              const n = actions.importJson(importJson);
              if (n > 0) snapshot.refetchAll();
            }}
            style={{ marginTop: 6 }}
          >
            Import JSON
          </button>
        </div>
      </div>
    </Section>
  );
}
