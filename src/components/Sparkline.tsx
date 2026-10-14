import { Area, AreaChart, ResponsiveContainer } from "recharts";

/** Mini-gráfico de tendência (sem eixos) para cards de indicador. */
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={color}
          fillOpacity={0.12}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
