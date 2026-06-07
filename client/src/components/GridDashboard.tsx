import { Responsive } from "react-grid-layout";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import Box from "@mui/material/Box";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

type ResponsiveProps = ComponentProps<typeof Responsive>;
type LayoutsProp = NonNullable<ResponsiveProps["layouts"]>;

export type RGLLayouts = LayoutsProp;

export function GridDashboard({
                                layouts,
                                onLayoutsChange,
                                childrenById,
                              }: {
  layouts: RGLLayouts;
  onLayoutsChange: (next: RGLLayouts) => void;
  childrenById: Record<string, ReactNode>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  const measure = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setWidth(Math.max(100, Math.floor(rect.width)));
  };

  useLayoutEffect(() => {
    measure();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const ids = useMemo(() => Object.keys(childrenById), [childrenById]);

  const handleLayoutChange: NonNullable<ResponsiveProps["onLayoutChange"]> = (_current, all) => {
    onLayoutsChange(all as LayoutsProp);
  };

  return (
      <Box ref={wrapRef} sx={{ width: "100%", overflow: "visible" }}>
        <style>{`
        .layout {
          overflow: visible !important;
        }
        .react-grid-item {
          overflow: visible !important;
        }
        .react-grid-item.react-draggable-dragging,
        .react-grid-item.resizing {
          z-index: 1000 !important;
        }
        .react-resizable-handle {
          position: absolute;
          z-index: 100;
          background: transparent;
        }
        .react-resizable-handle::after {
          display: none;
        }
        .react-resizable-handle-se {
          bottom: 0;
          right: 0;
          width: 20px !important;
          height: 20px !important;
          cursor: se-resize;
        }
        .react-resizable-handle-sw {
          bottom: 0;
          left: 0;
          width: 20px !important;
          height: 20px !important;
          cursor: sw-resize;
        }
        .react-resizable-handle-ne {
          top: 0;
          right: 0;
          width: 20px !important;
          height: 20px !important;
          cursor: ne-resize;
        }
        .react-resizable-handle-nw {
          top: 0;
          left: 0;
          width: 20px !important;
          height: 20px !important;
          cursor: nw-resize;
        }
        .react-resizable-handle-n {
          top: 0;
          left: 20px;
          right: 20px;
          width: auto !important;
          height: 8px !important;
          cursor: n-resize;
        }
        .react-resizable-handle-s {
          bottom: 0;
          left: 20px;
          right: 20px;
          width: auto !important;
          height: 8px !important;
          cursor: s-resize;
        }
        .react-resizable-handle-e {
          right: 0;
          top: 20px;
          bottom: 20px;
          width: 8px !important;
          height: auto !important;
          cursor: e-resize;
        }
        .react-resizable-handle-w {
          left: 0;
          top: 20px;
          bottom: 20px;
          width: 8px !important;
          height: auto !important;
          cursor: w-resize;
        }
        .react-grid-item.react-grid-placeholder {
          background: rgba(37,243,225,0.10);
          border: 1px solid rgba(37,243,225,0.18);
          border-radius: 16px;
        }
      `}</style>

        <Responsive
            width={width}
            className="layout"
            layouts={layouts}
            breakpoints={{ xl: 1920, lg: 1200, md: 900, sm: 600, xs: 0 }}
            cols={{ xl: 12, lg: 12, md: 12, sm: 6, xs: 1 }}
            rowHeight={30}
            margin={[16, 16]}
            containerPadding={[0, 0]}
            onLayoutChange={handleLayoutChange}
        >
          {ids.map((id) => (
              <div key={id} style={{ height: "100%" }}>
                {childrenById[id]}
              </div>
          ))}
        </Responsive>
      </Box>
  );
}
