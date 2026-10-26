import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The brand mark on black, for home screens. */
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#101010" }}>
      <div style={{ width: 84, height: 84, background: "#ebebeb" }} />
    </div>,
    size,
  );
}
