import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { cn } from "@/lib/utils";

export function EChart({
  option,
  className,
  style,
  onEvents,
  instanceRef,
}: {
  option: EChartsOption;
  className?: string;
  style?: React.CSSProperties;
  onEvents?: Record<string, (params: unknown) => void>;
  /** Optional: receives the live ECharts instance so callers can export a PNG (getDataURL). */
  instanceRef?: React.MutableRefObject<echarts.ECharts | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const inst = echarts.init(ref.current, undefined, { renderer: "canvas" });
    instRef.current = inst;
    if (instanceRef) instanceRef.current = inst;
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      inst.dispose();
      instRef.current = null;
      if (instanceRef) instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    instRef.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
    const inst = instRef.current;
    if (!inst || !onEvents) return;
    const entries = Object.entries(onEvents);
    entries.forEach(([evt, fn]) => inst.on(evt, fn));
    return () => {
      entries.forEach(([evt, fn]) => inst.off(evt, fn));
    };
  }, [onEvents]);

  return <div ref={ref} className={cn("h-full w-full", className)} style={style} />;
}
