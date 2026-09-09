import { buildDiagram } from '../core/diagramModel.js';
import type { Diagram } from './types.js';
import authFlowMmd from '../../examples/auth/auth-flow.mmd?raw';
import authFlowMd from '../../examples/auth/auth-flow.md?raw';
import schemaMmd from '../../examples/data/schema.mmd?raw';

export const STATIC_DEMO = import.meta.env.VITE_MMDOCS_STATIC === 'true';

const examples = [
  buildDiagram({
    id: 'auth/auth-flow.mmd',
    relPath: 'auth/auth-flow.mmd',
    mmd: authFlowMmd,
    md: authFlowMd,
  }),
  buildDiagram({
    id: 'data/schema.mmd',
    relPath: 'data/schema.mmd',
    mmd: schemaMmd,
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