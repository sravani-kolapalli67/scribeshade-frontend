import { useState, useRef, useCallback } from "react";
import { WIDGET_W } from "@/features/launcher/constants";

interface CardPos {
  x: number;
  y: number;
}

interface UseCardPositionReturn {
  cardPos: CardPos;
  isDraggingRef: React.MutableRefObject<boolean>;
  handleDragStart: (e: React.MouseEvent) => void;
}

export function useCardPosition(): UseCardPositionReturn {
  const [cardPos, setCardPos] = useState<CardPos>(() => {
    try {
      const s = localStorage.getItem("launcher-card-pos");
      if (s) return JSON.parse(s) as CardPos;
    } catch {
      /* ignore */
    }
    return {
      x: Math.max(0, Math.round(window.innerWidth / 2 - WIDGET_W / 2)),
      y: 20,
    };
  });

  const isDraggingRef = useRef(false);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startMX = e.clientX;
      const startMY = e.clientY;
      const startX = cardPos.x;
      const startY = cardPos.y;
      isDraggingRef.current = true;

      const onMove = (ev: MouseEvent) => {
        setCardPos({
          x: startX + ev.clientX - startMX,
          y: startY + ev.clientY - startMY,
        });
      };
      const onUp = (ev: MouseEvent) => {
        const newPos = {
          x: startX + ev.clientX - startMX,
          y: startY + ev.clientY - startMY,
        };
        setCardPos(newPos);
        localStorage.setItem("launcher-card-pos", JSON.stringify(newPos));
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        isDraggingRef.current = false;
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [cardPos.x, cardPos.y],
  );

  return { cardPos, isDraggingRef, handleDragStart };
}
