/**
 * Keep the participant row of a sequence diagram in view while panning down.
 *
 * A long sequence diagram is unreadable once the actor names scroll off, because every
 * message is drawn between two anonymous vertical lines.
 *
 * This moves Mermaid's own actor groups rather than overlaying a copy of them, so there is
 * only ever one SVG in the DOM and the highlight classes stay on the elements they were
 * applied to.
 */

/** The top-level group an element belongs to, so whole actor boxes move together. */
function topLevelGroup(svg: SVGSVGElement, el: Element): Element | undefined {
  let node: Element | null = el;
  while (node && node.parentElement !== (svg as unknown as HTMLElement)) node = node.parentElement;
  return node ?? undefined;
}

const BACKDROP_CLASS = 'mermaid-docs-actor-backdrop';

/**
 * Put the autonumber discs on top of the lifelines.
 *
 * Each lifeline shares a group with its actor box, and the sticky header keeps those
 * groups last, so the lifelines paint over every number. The lifelines are lifted out of
 * those groups and the numbers placed after them; the actor boxes still end up last.
 *
 * Each number is a zero-length line carrying a circle marker, followed by the numeral.
 */
export function raiseSequenceNumbers(host: HTMLElement): void {
  const svg = host.querySelector('svg');
  if (!svg) return;

  for (const lifeline of svg.querySelectorAll('.actor-line')) {
    if (lifeline.parentElement !== (svg as Element)) svg.append(lifeline);
  }

  for (const numeral of svg.querySelectorAll<SVGTextElement>('text.sequenceNumber')) {
    if (numeral.dataset.mermaidDocsRaised) continue;
    numeral.dataset.mermaidDocsRaised = 'true';
    const disc = numeral.previousElementSibling;
    // Guarded, so a real message line is never mistaken for a disc and dragged out of place.
    if (
      disc instanceof SVGLineElement &&
      disc.x1.baseVal.value === disc.x2.baseVal.value &&
      disc.y1.baseVal.value === disc.y2.baseVal.value
    ) {
      svg.append(disc);
    }
    svg.append(numeral);
  }
}

interface ActorHeader {
  groups: Element[];
  firstActor: SVGRectElement;
  backdrop: SVGRectElement;
  /** Height of the actor row in user units, measured from the top of the viewBox. */
  height: number;
  /** How far the row can travel before it would pass the end of the diagram. */
  maxShift: number;
}

function measure(svg: SVGSVGElement): ActorHeader | undefined {
  const rects = [...svg.querySelectorAll<SVGRectElement>('rect.actor-top')];
  if (rects.length === 0) return undefined;

  const groups = [...new Set(rects.map((r) => topLevelGroup(svg, r)).filter((g): g is Element => g !== undefined))];
  if (groups.length === 0) return undefined;

  const box = svg.viewBox.baseVal;
  const bottom = Math.max(...rects.map((r) => r.y.baseVal.value + r.height.baseVal.value));
  const height = bottom - box.y;

  // Messages are drawn after the actors, so without this the row travels underneath them.
  // Both the backdrop and the reordering are idempotent, or the MutationObserver that
  // repaints the SVG would retrigger itself.
  let backdrop = svg.querySelector<SVGRectElement>(`rect.${BACKDROP_CLASS}`);
  if (!backdrop) {
    backdrop = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backdrop.setAttribute('class', BACKDROP_CLASS);
    backdrop.setAttribute('x', String(box.x));
    backdrop.setAttribute('y', String(box.y));
    backdrop.setAttribute('width', String(box.width));
    backdrop.setAttribute('height', String(height));
    svg.append(backdrop);
  }
  if (svg.lastElementChild !== groups[groups.length - 1]) svg.append(backdrop, ...groups);

  return { groups, firstActor: rects[0]!, backdrop, height, maxShift: Math.max(0, box.height - height) };
}

/**
 * Slide the actor row down by however far the diagram has been panned above the viewport.
 *
 * `getBoundingClientRect` is post-transform, so the gap is in screen pixels and has to be
 * divided by the scale to become user units.
 */
export function positionStickyActors(host: HTMLElement, scale: number): void {
  const svg = host.querySelector('svg');
  const viewport = host.closest('.canvas-viewport');
  if (!svg || !viewport) return;

  const header = measure(svg);
  if (!header) return;

  const previousShift = Number(header.backdrop.dataset.mermaidDocsShift ?? 0);
  const gap = viewport.getBoundingClientRect().top - header.firstActor.getBoundingClientRect().top;
  const shift = Math.min(Math.max(0, previousShift + gap / scale), header.maxShift);
  const transform = shift > 0 ? `translateY(${shift}px)` : '';

  header.backdrop.dataset.mermaidDocsShift = String(shift);
  header.backdrop.style.transform = transform;
  header.backdrop.style.opacity = shift > 0 ? '1' : '0';
  for (const group of header.groups) (group as SVGGElement).style.transform = transform;
}

/** Undo the sticky offset, for when the diagram is no longer a sequence diagram. */
export function clearStickyActors(host: HTMLElement): void {
  for (const el of host.querySelectorAll<SVGGElement>('svg > g, svg > rect')) {
    el.style.transform = '';
  }
}
