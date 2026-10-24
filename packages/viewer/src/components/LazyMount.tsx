import { useEffect, useRef, useState } from "react";

/**
 * Renders `children` only once the placeholder scrolls near the viewport (SPEC section 10.1:
 * maps are only initialized when they scroll into view).
 */
export function LazyMount({
  className,
  placeholder,
  children,
}: {
  className?: string;
  placeholder?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return (
    <div ref={ref} className={className}>
      {visible ? children : placeholder}
    </div>
  );
}
