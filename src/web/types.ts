import type { Diagram, ValidationIssue } from '../core/types.js';

export type { Diagram, ValidationIssue };

export interface DiagramSummary {
  /** Unique within the workspace, and how the diagram is addressed everywhere. */
  name: string;
  relPath: string;
  group: string;
  hasDocumentation: boolean;
  title: string;
  stepCount: number;
}

/** Step 0 is the diagram overview; steps are 1-indexed for display. */
export const OVERVIEW = 'overview';
