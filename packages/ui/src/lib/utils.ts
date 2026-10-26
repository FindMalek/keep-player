import { createCn } from "cn/config";

// The theme's own sizes, shadow and easing, so merging `text-body` with `text-muted-foreground` keeps both.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["label", "meta", "small", "body", "lead", "title"] }],
      shadow: [{ shadow: ["float"] }],
      ease: [{ ease: ["spring"] }],
    },
  },
});
