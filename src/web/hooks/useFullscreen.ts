import { useCallback, useEffect, useState } from 'react';

/**
 * Fullscreen state for one element.
 *
 * The user can leave fullscreen with Escape without touching our button, so the flag
 * follows the document rather than the last click.
 */
export function useFullscreen(target: () => Element | null): { isFullscreen: boolean; toggle: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void target()?.requestFullscreen();
  }, [target]);

  return { isFullscreen, toggle };
}
