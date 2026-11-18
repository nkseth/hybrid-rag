"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Series = { key: string; label: string; color?: string };
type Props = { data: Record<string, string | number | null>[]; x: string; series: Series[]; height?: number; stacked?: boolean };

const cfg = (series: Series[]): ChartConfig =>
  Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.color ?? `var(--chart-${(i % 5) + 1})` }]));

const shortDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : v);

export function AreaSeries({ data, x, series, height = 220, stacked }: Props) {
  return (
    <ChartContainer config={cfg(series)} className="w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: -8, right: 8, top: 4 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.35} />
              <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2))} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => shortDate(String(v))} />} />
        {series.map((s) => (
          <Area key={s.key} dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} fill={`url(#fill-${s.key})`} strokeWidth={1.5} stackId={stacked ? "a" : undefined} />
        ))}
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
      </AreaChart>
    </ChartContainer>
  );
}

export function BarSeries({ data, x, series, height = 220, stacked, horizontal }: Props & { horizontal?: boolean }) {
  return (
    <ChartContainer config={cfg(series)} className="w-full" style={{ height }}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 0 : -8, right: 8, top: 4 }}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey={x} tickLine={false} axisLine={false} width={130} tick={{ fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={shortDate} />
            <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2))} />
          </>
        )}
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => shortDate(String(v))} />} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={stacked && i < series.length - 1 ? 0 : 4} stackId={stacked ? "a" : undefined} maxBarSize={40} />
        ))}
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
      </BarChart>
    </ChartContainer>
  );
}
