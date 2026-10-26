import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import {
  Boxes,
  Braces,
  Cloud,
  Container,
  Disc3,
  Gauge,
  GitPullRequest,
  Import,
  Keyboard,
  Library,
  LifeBuoy,
  type LucideIcon,
  Map as MapIcon,
  MicVocal,
  MonitorSmartphone,
  Rocket,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { createElement } from "react";

// The icons pages and folders name in their frontmatter / meta.json (scripts/sync-docs.ts).
const ICONS: Record<string, LucideIcon> = {
  Boxes,
  Braces,
  Cloud,
  Container,
  Disc3,
  Gauge,
  GitPullRequest,
  Import,
  Keyboard,
  Library,
  LifeBuoy,
  Map: MapIcon,
  MicVocal,
  MonitorSmartphone,
  Rocket,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Workflow,
};

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon: (name) => (name && ICONS[name] ? createElement(ICONS[name], { strokeWidth: 1.5 }) : undefined),
});
