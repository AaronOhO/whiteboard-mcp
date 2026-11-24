import { CaptureUpdateAction, getCommonBounds, useDevice, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { COMMENT_ICON, Icon } from './Icon';
import { NoteForm } from './NoteForm';

const TAP_DISTANCE = 5;

export function CommentToggle({ active, onToggle, mobile = false }: { active: boolean; onToggle(): void; mobile?: boolean }) {
  return (
    <button type="button" className={`xl-btn xl-comment-toggle${mobile ? ' xl-comment-toggle--mobile' : ''}`} title="Comment mode" aria-pressed={active} onClick={onToggle}>
      <Icon d={COMMENT_ICON} size={18} />
    </button>
  );
}

function segmentDistance(x: number, y: number, [ax, ay]: readonly [number, number], [bx, by]: readonly [number, number]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function hits(element: ExcalidrawElement, x: number, y: number, tolerance: number): boolean {
  // Test in the element's unrotated coordinates so rotated shapes and arrows keep their actual hit areas.
  if (element.angle) {
    const [x1, y1, x2, y2] = getCommonBounds([{ ...element, angle: 0 as ExcalidrawElement['angle'] }]);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const cos = Math.cos(element.angle);
    const sin = Math.sin(element.angle);
    [x, y] = [cx + (x - cx) * cos + (y - cy) * sin, cy - (x - cx) * sin + (y - cy) * cos];
  }
  x -= element.x;
  y -= element.y;
  if (element.type === 'arrow' || element.type === 'line' || element.type === 'freedraw') {
    return element.points.some((point, i) => segmentDistance(x, y, element.points[i - 1] ?? point, point) <= tolerance);
  }
  const w = element.width / 2;
  const h = element.height / 2;
  if (element.type === 'ellipse') return ((x - w) / (w + tolerance)) ** 2 + ((y - h) / (h + tolerance)) ** 2 <= 1;
  if (element.type === 'diamond') return Math.abs(x - w) / (w + tolerance) + Math.abs(y - h) / (h + tolerance) <= 1;
  return x >= -tolerance && y >= -tolerance && x <= element.width + tolerance && y <= element.height + tolerance;
}

function elementAt(api: ExcalidrawImperativeAPI, event: MouseEvent): string | undefined {
  const state = api.getAppState();
  const { x, y } = viewportCoordsToSceneCoords(event, state);
  const elements = api.getSceneElements();
  const hit = [...elements].reverse().find((element) => hits(element, x, y, 6 / state.zoom.value));
  if (hit?.type === 'text' && hit.containerId && elements.some((el) => el.id === hit.containerId)) return hit.containerId;
  return hit?.id;
}

const onCanvas = (event: Event) => event.target instanceof HTMLCanvasElement && event.target.classList.contains('interactive');

interface Props {
  api: ExcalidrawImperativeAPI;
  root: RefObject<HTMLDivElement>;
  onSend(text: string, elementId: string): boolean;
  onToggle(): void;
}

export function Comments({ api, root, onSend, onToggle }: Props) {
  const mobile = useDevice().editor.isMobile;
  const [popup, setPopup] = useState<{ x: number; y: number; elementId: string; composing: boolean } | null>(null);
  const [text, setText] = useState('');
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const board = root.current;
    if (!board) return;
    let press: { x: number; y: number; touch: boolean } | undefined;
    const select = (id?: string) => api.updateScene({
      appState: { selectedElementIds: id ? { [id]: true } : {} },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    const open = (event: MouseEvent, elementId: string) => {
      setText('');
      setPopup({ x: event.clientX, y: event.clientY, elementId, composing: false });
    };
    const pointerDown = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return;
      setPopup(null);
      press = undefined;
      if (!onCanvas(event)) return;
      if (event.button === 2) event.stopPropagation();
      if (event.isPrimary && event.button === 0) press = { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.button === 2 && onCanvas(event)) event.stopPropagation();
    };
    const pointerCancel = () => { press = undefined; };
    const click = (event: MouseEvent) => {
      const start = press;
      press = undefined;
      if (!start || !onCanvas(event) || Math.hypot(start.x - event.clientX, start.y - event.clientY) > TAP_DISTANCE) return;
      // Excalidraw clears its selection on pointerup in view mode. Select after that, on click.
      const id = elementAt(api, event);
      select(id);
      if (id && start.touch) open(event, id);
    };
    const contextMenu = (event: MouseEvent) => {
      if (!onCanvas(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const id = elementAt(api, event);
      select(id);
      if (id) open(event, id);
      else setPopup(null);
    };
    board.addEventListener('pointerdown', pointerDown, true);
    board.addEventListener('pointerup', pointerUp, true);
    board.addEventListener('pointercancel', pointerCancel, true);
    board.addEventListener('click', click, true);
    board.addEventListener('contextmenu', contextMenu, true);
    return () => {
      board.removeEventListener('pointerdown', pointerDown, true);
      board.removeEventListener('pointerup', pointerUp, true);
      board.removeEventListener('pointercancel', pointerCancel, true);
      board.removeEventListener('click', click, true);
      board.removeEventListener('contextmenu', contextMenu, true);
    };
  }, [api, root]);

  const submit = () => {
    if (!popup || !onSend(text.trim(), popup.elementId)) {
      api.setToast({ message: 'Offline — comment not sent', duration: 2500 });
      return;
    }
    api.setToast({ message: 'Sent to agent', duration: 2200 });
    setPopup(null);
  };

  return (
    <>
      {mobile && <CommentToggle active onToggle={onToggle} mobile />}
      {popup && (
        <div className="xl-comment-popup" ref={panel} style={{
          left: Math.max(8, Math.min(popup.x, window.innerWidth - (popup.composing ? 312 : 120))),
          top: Math.max(8, Math.min(popup.y, window.innerHeight - (popup.composing ? 154 : 48))),
        }}>
          {popup.composing ? (
            <NoteForm label="Comment on element" text={text} onText={setText} onSend={submit} onClose={() => setPopup(null)} className="xl-note xl-comment-form" />
          ) : (
            <div className="xl-comment-menu" role="menu" aria-label="Element actions" onKeyDown={(event) => {
              if (event.key === 'Escape') setPopup(null);
            }}>
              <button type="button" role="menuitem" autoFocus className="xl-btn" onClick={() => setPopup({ ...popup, composing: true })}>
                <Icon d={COMMENT_ICON} />
                Comment
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
