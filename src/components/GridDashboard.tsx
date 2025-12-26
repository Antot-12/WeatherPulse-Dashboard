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
  const [width, setWidth] = useState(0);

  const measure = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setWidth(Math.max(0, Math.floor(rect.width)));
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
      <Box ref={wrapRef} sx={{ width: "100%" }}>
        <style>{`
        .react-resizable-handle {
          width: 16px !important;
          height: 16px !important;
          opacity: 0.9;
        }
        .react-resizable-handle::after {
          border-right: 2px solid rgba(37,243,225,0.55);
          border-bottom: 2px solid rgba(37,243,225,0.55);
          width: 7px;
          height: 7px;
          right: 3px;
          bottom: 3px;
        }
        .react-grid-item.react-grid-placeholder {
          background: rgba(37,243,225,0.10);
          border: 1px solid rgba(37,243,225,0.18);
          border-radius: 16px;
        }
      `}</style>

        {width > 0 && (
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
        )}
      </Box>
  );
}
