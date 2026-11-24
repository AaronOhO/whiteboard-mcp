import { getCommonBounds, sceneCoordsToViewportCoords } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasNote } from '../../src/shared/protocol';
import { COMMENT_ICON, Icon } from './Icon';

const BADGE_RADIUS = 13;
const GAP = 8;
const CLOSE_ICON = 'M6 6l12 12M6 18L18 6';

interface Marker {
  id: string;
  x: number;
  y: number;
  label?: string;
}

function commentCorner(element: ExcalidrawElement) {
  const [left, top, right, bottom] = getCommonBounds([element]);
  if ((element.type !== 'diamond' && element.type !== 'ellipse') || !element.width || !element.height) {
    return { sceneX: right, sceneY: bottom, offset: 0 };
  }
  // Intersect the lower-right diagonal with the actual outline, including rotated shapes.
  const dx = (right - left) / 2;
  const dy = (bottom - top) / 2;
  const cos = Math.cos(element.angle);
  const sin = Math.sin(element.angle);
  const x = (dx * cos + dy * sin) / (element.width / 2);
  const y = (dy * cos - dx * sin) / (element.height / 2);
  const distance = element.type === 'diamond' ? Math.abs(x) + Math.abs(y) : Math.hypot(x, y);
  return { sceneX: left + dx + dx / distance, sceneY: top + dy + dy / distance, offset: 7 };
}

export function CommentMarkers({ api, notes }: { api: ExcalidrawImperativeAPI; notes: readonly CanvasNote[] }) {
  const byElement = useMemo(() => {
    const groups = new Map<string, CanvasNote[]>();
    for (const note of notes) {
      const id = note.target?.id;
      if (!id) continue;
      const group = groups.get(id);
      if (group) group.push(note);
      else groups.set(id, [note]);
    }
    return groups;
  }, [notes]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [openId, setOpenId] = useState<string>();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!byElement.size) {
      setMarkers([]);
      return;
    }
    const update = () => {
      const state = api.getAppState();
      const right = state.offsetLeft + state.width;
      const bottom = state.offsetTop + state.height;
      const labels = new Map<string, string>();
      const targets = api.getSceneElements().filter((element) => {
        if (element.type === 'text' && element.containerId && byElement.has(element.containerId)) {
          labels.set(element.containerId, element.originalText);
        }
        return byElement.has(element.id);
      });
      const next: Marker[] = [];
      for (const element of targets) {
        const { sceneX, sceneY, offset } = commentCorner(element);
        const { x, y } = sceneCoordsToViewportCoords({ sceneX, sceneY }, state);
        if (x < state.offsetLeft || x > right || y < state.offsetTop || y > bottom) continue;
        const label = (element.type === 'text' ? element.originalText : labels.get(element.id))?.replace(/\s+/g, ' ').trim();
        next.push({ id: element.id, label, x: Math.min(x + offset, right - BADGE_RADIUS - 2), y: Math.min(y + offset, bottom - BADGE_RADIUS - 2) });
      }
      setMarkers((current) => current.length === next.length && current.every((marker, i) => {
        const updated = next[i]!;
        return marker.id === updated.id && marker.x === updated.x && marker.y === updated.y && marker.label === updated.label;
      }) ? current : next);
    };
    update();
    const offChange = api.onChange(update);
    const offScroll = api.onScrollChange(update);
    return () => {
      offChange();
      offScroll();
    };
  }, [api, byElement]);

  const active = markers.find((marker) => marker.id === openId);
  const comments = active && byElement.get(active.id);
  const visibleId = comments ? active?.id : undefined;

  useEffect(() => {
    if (!visibleId) {
      setOpenId(undefined);
      return;
    }
    panel.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) setOpenId(undefined);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpenId(undefined);
      anchor.current?.focus();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [visibleId]);

  const panelWidth = Math.min(320, window.innerWidth - 2 * GAP);
  const panelGap = BADGE_RADIUS + GAP;
  const below = active ? window.innerHeight - active.y - panelGap - GAP : 0;
  const above = active ? active.y - panelGap - GAP : 0;
  const openAbove = below < 180 && above > below;

  return (
    <>
      {markers.map(({ id, x, y, label }) => {
        if (!byElement.has(id)) return null;
        return (
          <button key={id} type="button" className="xl-comment-badge" style={{ left: x, top: y }}
            ref={openId === id ? anchor : undefined} title="View comments" aria-label={label ? `View comments on ${label}` : 'View comments'}
            aria-expanded={openId === id} onClick={() => setOpenId(openId === id ? undefined : id)}>
            <Icon d={COMMENT_ICON} size={16} />
          </button>
        );
      })}
      {active && comments && (
        <aside className="xl-comment-popup xl-comment-history" ref={panel} role="dialog" aria-label="Element comments" tabIndex={-1}
          onKeyDown={(event) => event.stopPropagation()} style={{
          left: Math.max(GAP, Math.min(active.x - BADGE_RADIUS, window.innerWidth - panelWidth - GAP)),
          top: openAbove ? undefined : active.y + panelGap,
          bottom: openAbove ? window.innerHeight - active.y + panelGap : undefined,
          width: panelWidth,
          maxHeight: Math.min(320, openAbove ? above : below),
        }}>
          <header>
            <strong>Comments</strong>
            <button type="button" className="xl-btn" aria-label="Close comments" onClick={() => {
              setOpenId(undefined);
              anchor.current?.focus();
            }}><Icon d={CLOSE_ICON} /></button>
          </header>
          <ol>{comments.map((note) => <li key={note.id}>{note.text}</li>)}</ol>
        </aside>
      )}
    </>
  );
}
