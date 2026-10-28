import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The brand mark on black, for home screens. */
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#101010" }}>
      <svg width="108" height="108" viewBox="2 2 12 12" fill="#ebebeb">
        <title>lodesong</title>
        <path d="M2 2h12v4H7.25v2.5H2zM2 10h6.75V7.5H14V14H2z" />
      </svg>
    </div>,
    size,
  );
}
