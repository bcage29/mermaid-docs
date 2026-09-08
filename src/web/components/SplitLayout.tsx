import type { ReactNode } from 'react';
import { Group, useDefaultLayout } from 'react-resizable-panels';
import type { Orientation } from 'react-resizable-panels';

export interface SplitLayoutProps {
  /** Stable id; the layout is persisted to localStorage under it. */
  id: string;
  orientation: Orientation;
  /** Must match the Panel ids rendered inside, so a saved layout restores correctly. */
  panelIds: string[];
  className?: string;
  children: ReactNode;
}

/**
 * A resizable panel group whose layout survives a reload.
 *
 * Wrapped so every group persists consistently - a reading layout someone has dragged into
 * shape should still be there next time they open the diagram.
 */
export function SplitLayout({ id, orientation, panelIds, className, children }: SplitLayoutProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id, panelIds });
  return (
    <Group
      id={id}
      orientation={orientation}
      {...(defaultLayout !== undefined ? { defaultLayout } : {})}
      onLayoutChanged={onLayoutChanged}
      {...(className !== undefined ? { className } : {})}
    >
      {children}
    </Group>
  );
}
