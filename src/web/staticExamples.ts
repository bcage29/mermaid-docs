import { buildDiagram } from '../core/diagramModel.js';
import type { Diagram } from './types.js';
import authFlowMmd from '../../examples/auth/auth-flow.mmd?raw';
import authFlowMd from '../../examples/auth/auth-flow.md?raw';
import messagingMmd from '../../examples/sequence/messaging.mmd?raw';
import messagingMd from '../../examples/sequence/messaging.md?raw';
import agenticRagMmd from '../../examples/architecture/agentic-rag.mmd?raw';
import agenticRagMd from '../../examples/architecture/agentic-rag.md?raw';

export const STATIC_DEMO = import.meta.env.VITE_MERMAID_DOCS_STATIC === 'true';

const examples = [
  buildDiagram({
    id: 'architecture/agentic-rag.mmd',
    relPath: 'architecture/agentic-rag.mmd',
    mmd: agenticRagMmd,
    md: agenticRagMd,
  }),
  buildDiagram({
    id: 'auth/auth-flow.mmd',
    relPath: 'auth/auth-flow.mmd',
    mmd: authFlowMmd,
    md: authFlowMd,
  }),
  buildDiagram({
    id: 'sequence/messaging.mmd',
    relPath: 'sequence/messaging.mmd',
    mmd: messagingMmd,
    md: messagingMd,
  }),
];

export function staticDiagramList() {
  return examples.map(({ relPath, name, group, hasDocumentation, title, steps }) => ({
    relPath,
    name,
    group,
    hasDocumentation,
    title,
    stepCount: steps.length,
  }));
}

export function staticDiagram(name: string): Diagram {
  const diagram = examples.find((example) => example.name === name);
  if (!diagram) throw new Error(`No bundled diagram named "${name}".`);
  return diagram;
}