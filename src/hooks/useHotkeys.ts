import { useEffect } from "react";

function isTypingTarget(t: EventTarget | null) {
    if (!(t instanceof HTMLElement)) return false;

    const tag = t.tagName.toLowerCase();
    const editable = t.isContentEditable;

    return editable || tag === "input" || tag === "textarea" || tag === "select";
}

export function useHotkeys(args: {
    onRefresh: () => void;
    onPin: () => void;
    onFocusSearch: () => void;
    enabled?: boolean;
}) {
    const { onRefresh, onPin, onFocusSearch, enabled = true } = args;

    useEffect(() => {
        if (!enabled) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;

            const key = e.key;
            const typing = isTypingTarget(e.target);

            if (key === "/" && !typing) {
                e.preventDefault();
                onFocusSearch();
                return;
            }

            if (typing) return;

            if (key === "r" || key === "R") {
                e.preventDefault();
                onRefresh();
            }

            if (key === "p" || key === "P") {
                e.preventDefault();
                onPin();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [enabled, onFocusSearch, onPin, onRefresh]);
}
