import { lazy } from "react";

/*
 * The shadcn sidebar renders a Sheet (a Base UI dialog) only on phones. This app is desktop web (phones use a
 * Subsonic app), so the sheet loads on demand instead of sitting in the first screen. Used by components/ui/sidebar.tsx.
 */
const sheet = () => import("@keep/ui/components/sheet");

export const Sheet = lazy(() => sheet().then((module) => ({ default: module.Sheet })));
export const SheetContent = lazy(() => sheet().then((module) => ({ default: module.SheetContent })));
export const SheetDescription = lazy(() => sheet().then((module) => ({ default: module.SheetDescription })));
export const SheetHeader = lazy(() => sheet().then((module) => ({ default: module.SheetHeader })));
export const SheetTitle = lazy(() => sheet().then((module) => ({ default: module.SheetTitle })));
