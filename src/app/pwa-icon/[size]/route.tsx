import { ImageResponse } from "next/og";

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f5132",
          color: "white",
          fontSize: size * 0.42,
          fontWeight: 700,
          borderRadius: size * 0.18,
        }}
      >
        AQ
      </div>
    ),
    { width: size, height: size },
  );
}
