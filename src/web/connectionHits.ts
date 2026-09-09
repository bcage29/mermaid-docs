/**
 * Widen the click target of a diagram's connections.
 *
 * Mermaid draws links about two pixels wide, which is close to unclickable at a fitted
 * zoom. Each one gets a transparent twin with a fat stroke, inserted underneath so the
 * real link still paints on top.
 */

const HIT_CLASS = 'mmdocs-hit';

const SOURCE_SELECTOR: Record<'flowchart' | 'sequence' | 'architecture', string> = {
  flowchart: 'path.flowchart-link',
  sequence: '.messageLine0, .messageLine1',
  architecture: '.architecture-edges path.edge',
};

/**
 * Give every connection a hit target, once.
 *
 * Idempotent: this runs from the same MutationObserver that repaints the SVG, so adding
 * elements unconditionally would retrigger it forever.
 */
export function addHitTargets(host: HTMLElement, kind: 'flowchart' | 'sequence' | 'architecture'): void {
  const svg = host.querySelector('svg');
  if (!svg) return;

  // Snapshot first: the twins are inserted during the walk, and carry a different class so
  // they never match the selector themselves.
  [...svg.querySelectorAll(SOURCE_SELECTOR[kind])].forEach((el, i) => {
    if (el.previousElementSibling?.classList.contains(HIT_CLASS)) return;

    const hit = el.cloneNode(false) as SVGElement;
    hit.removeAttribute('id');
    hit.removeAttribute('style');
    hit.setAttribute('class', HIT_CLASS);
    hit.setAttribute('data-hit', String(i));
    // Sequence lines carry a `data-id` that is not an edge id, so only flowchart ids are
    // carried over; everything else is matched by position.
    const dataId = kind === 'flowchart' ? el.getAttribute('data-id') : null;
    if (dataId) hit.setAttribute('data-hit-id', dataId);
    el.parentElement?.insertBefore(hit, el);
  });
}

/** The connection a hit target stands for: by edge id where there is one, else by order. */
export function hitTarget(clicked: Element): { edgeId?: string; index: number } | undefined {
  const hit = clicked.closest(`.${HIT_CLASS}`);
  if (!hit) return undefined;
  const edgeId = hit.getAttribute('data-hit-id');
  return { ...(edgeId ? { edgeId } : {}), index: Number(hit.getAttribute('data-hit')) };
}
