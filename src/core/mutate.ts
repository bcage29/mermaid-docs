import { removeRegion, setRegion, setRegions } from './markers.js';
import { parseDoc, removeSection, reorderSections, serializeDoc, setSection } from './docFormat.js';
import type { ParsedDoc } from './types.js';

export interface DiagramFiles {
  mmd: string;
  /** Undefined when the sibling .md does not exist yet. */
  md?: string;
}

export interface SetStepInput {
  stepId: string;
  title?: string;
  body?: string;
  /** Free-form grouping label, shown as a tag on the step. Omit to leave it alone. */
  phase?: string;
  /**
   * 1-based inclusive line range in the .mmd to highlight. Omit to leave the regions alone.
   *
   * A step may be marked in several places, but this writes one: supplying a range
   * replaces every existing region for the id. Add further ones by editing the .mmd.
   */
  startLine?: number;
  endLine?: number;
  /** Insert after this step id; "" means first. Ignored when the step already exists. */
  after?: string;
}

/** Start a documentation file for a diagram that has none. */
export function scaffoldDoc(title: string): string {
  return `---\ntitle: ${title}\n---\n\nDocument what this diagram shows.\n`;
}

function docOf(files: DiagramFiles, fallbackTitle: string): ParsedDoc {
  return parseDoc(files.md ?? scaffoldDoc(fallbackTitle));
}

/**
 * Create or update a step across both files.
 *
 * The region and the documentation section are keyed by the same id, so this is the one
 * operation that must touch both files together — doing it by hand is what lets the two
 * drift apart.
 */
export function setStep(files: DiagramFiles, input: SetStepInput, fallbackTitle = 'Diagram'): DiagramFiles {
  const mmd =
    input.startLine !== undefined && input.endLine !== undefined
      ? setRegion(files.mmd, input.stepId, input.startLine, input.endLine)
      : files.mmd;

  const doc = setSection(docOf(files, fallbackTitle), input.stepId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.phase !== undefined ? { phase: input.phase } : {}),
    ...(input.after !== undefined ? { after: input.after } : {}),
  });

  return { mmd, md: serializeDoc(doc) };
}

/** Remove a step's marker pair and its documentation section. */
export function deleteStep(files: DiagramFiles, stepId: string, fallbackTitle = 'Diagram'): DiagramFiles {
  return {
    mmd: removeRegion(files.mmd, stepId),
    md: serializeDoc(removeSection(docOf(files, fallbackTitle), stepId)),
  };
}

/** Reorder the documentation sections; the .mmd is untouched since order lives in the .md. */
export function reorderSteps(files: DiagramFiles, stepIds: string[], fallbackTitle = 'Diagram'): DiagramFiles {
  return {
    mmd: files.mmd,
    md: serializeDoc(reorderSections(docOf(files, fallbackTitle), stepIds)),
  };
}

/**
 * Apply several step updates in one pass.
 *
 * The two files need opposite traversal orders, so they are handled separately:
 *  - Regions go through `setRegions`, which resolves every range against the original
 *    coordinates and emits all markers in one pass. Splicing them one at a time would let
 *    each insertion invalidate the line numbers of the ranges still to be written.
 *  - Sections are written **in caller order**, because that order is the step order readers
 *    see. Writing them bottom-up would silently reverse the walkthrough.
 */
export function setSteps(files: DiagramFiles, inputs: SetStepInput[], fallbackTitle = 'Diagram'): DiagramFiles {
  const specs = inputs
    .filter(
      (i): i is SetStepInput & { startLine: number; endLine: number } =>
        i.startLine !== undefined && i.endLine !== undefined,
    )
    .map((i) => ({ id: i.stepId, startLine: i.startLine, endLine: i.endLine }));
  const mmd = specs.length > 0 ? setRegions(files.mmd, specs) : files.mmd;

  let doc = docOf(files, fallbackTitle);
  for (const input of inputs) {
    doc = setSection(doc, input.stepId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
      ...(input.after !== undefined ? { after: input.after } : {}),
    });
  }

  return { mmd, md: serializeDoc(doc) };
}
