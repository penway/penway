import { useEffect, useRef } from "react";

type CursorMode = "default" | "link" | "project";

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!finePointer.matches || reducedMotion.matches) {
      return;
    }

    const cursor = cursorRef.current;
    if (!cursor) {
      return;
    }

    document.documentElement.classList.add("custom-cursor-active");

    const updatePosition = () => {
      cursor.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
      frameRef.current = null;
    };

    const getMode = (target: EventTarget | null): CursorMode => {
      if (!(target instanceof Element)) {
        return "default";
      }

      if (target.closest('[data-cursor="project"]')) {
        return "project";
      }

      if (target.closest("a, button, [role='button']")) {
        return "link";
      }

      return "default";
    };

    const onPointerMove = (event: PointerEvent) => {
      positionRef.current = { x: event.clientX, y: event.clientY };
      cursor.dataset.mode = getMode(event.target);
      cursor.classList.add("is-visible");

      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(updatePosition);
      }
    };

    const onPointerDown = () => cursor.classList.add("is-pressed");
    const onPointerUp = () => cursor.classList.remove("is-pressed");
    const onPointerLeave = () => cursor.classList.remove("is-visible");
    const onPointerEnter = () => cursor.classList.add("is-visible");

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.documentElement.addEventListener("pointerenter", onPointerEnter);

    return () => {
      document.documentElement.classList.remove("custom-cursor-active");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.documentElement.removeEventListener("pointerenter", onPointerEnter);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="custom-cursor"
      data-mode="default"
      aria-hidden="true"
    >
      <span className="custom-cursor__shape">
        <span className="custom-cursor__label">View project</span>
      </span>
    </div>
  );
}
