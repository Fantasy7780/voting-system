'use client';

import type { ReactNode } from 'react';

export function Section(props: {
  title: string;
  children: ReactNode;
  topBorder?: 'none' | 'solid' | 'dashed';
}) {
  const topBorder = props.topBorder ?? 'solid';
  const borderTop =
    topBorder === 'none' ? 'none' : topBorder === 'dashed' ? '1px dashed #ccc' : '1px solid #ddd';

  return (
    <section style={{ marginBottom: 12, borderTop, paddingTop: topBorder === 'none' ? 0 : 10 }}>
      <b>{props.title}</b>
      <div style={{ marginTop: 6 }}>{props.children}</div>
    </section>
  );
}
