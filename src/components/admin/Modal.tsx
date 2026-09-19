'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The office's modal.
 *
 * A real `<dialog>` rather than a positioned div, because the platform
 * already does the four things a hand-rolled one gets wrong: it traps focus,
 * it closes on Escape, it renders above everything without a z-index
 * argument, and it gives the backdrop its own pseudo-element.
 *
 * Closing always goes through the dialog's own `close()` — the button, the
 * backdrop and Escape all end up in `onClose`, so there is one path out and
 * the parent's state cannot drift from what is on screen.
 *
 * The one thing that path has to survive is Strict Mode. In development React
 * mounts, unmounts and remounts every effect, so the cleanup below runs a
 * `close()` a moment after the first `showModal()`. `close()` does not fire
 * its event there and then — it queues one — so the event lands after the
 * second `showModal()` has already reopened the dialog, and an unguarded
 * `onClose` would tell the parent to drop a dialog that is on screen. The
 * dialog would open and vanish in the same frame, which looks exactly like a
 * button that does nothing. Hence the guard: a real close leaves `open`
 * false, and the phantom one does not.
 *
 * The office reaches for a panel far more often than this; see `PANEL` in
 * ui.tsx for when each is right.
 */
export function Modal({
  label,
  onClose,
  children,
}: {
  /** Names the dialog for screen readers. */
  label: string;
  onClose: () => void;
  /**
   * Called with the dialog element once it is open, for anything inside that
   * portals — a Radix menu, a popover. They must render *into* the dialog:
   * `showModal()` puts it in the top layer, which paints over the whole of
   * `document.body`, so a menu portalled to the body lands underneath the
   * backdrop, invisible and unclickable. It is a render prop rather than
   * context because the caller reads it in its own body, which sits above
   * this component in the tree and so could never be a consumer.
   */
  children: React.ReactNode | ((container: HTMLElement | null) => React.ReactNode);
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // State rather than the ref alone: the children need a re-render once the
  // element exists, and a ref's mutation does not cause one.
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    setContainer(dialog);

    // `showModal` puts the dialog on the top layer but leaves the page behind
    // it scrolling, which on a long roster means the list slides around under
    // the backdrop while you are reading the dialog.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      // Only a close that left the dialog shut is a close. See above.
      onClose={(e) => {
        if (!e.currentTarget.open) onClose();
      }}
      // A click on the backdrop closes. Identifying one takes both halves of
      // this test. Landing on the dialog element rather than the content
      // below it is the usual sign — but it is not proof, because a click's
      // target is the nearest ancestor of where the press and the release
      // landed, so anything that opens on pointerdown and swallows the
      // pointerup (a Radix menu, say) also reports the dialog. Hence the
      // second half: a real backdrop click is also outside the dialog's box.
      // `detail` keeps a keyboard-synthesised click, which carries 0,0 and
      // would read as outside, from closing the dialog.
      onClick={(e) => {
        const dialog = ref.current;
        if (e.target !== dialog || e.detail === 0) return;
        const box = dialog.getBoundingClientRect();
        const outside =
          e.clientX < box.left ||
          e.clientX > box.right ||
          e.clientY < box.top ||
          e.clientY > box.bottom;
        if (outside) dialog.close();
      }}
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-2xl bg-white p-0 text-pine shadow-[0_24px_60px_rgba(19,39,29,0.22)] backdrop:bg-pine/35 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex max-h-[85vh] flex-col overflow-y-auto overscroll-contain font-ui">
        {typeof children === 'function' ? children(container) : children}
      </div>
    </dialog>
  );
}
