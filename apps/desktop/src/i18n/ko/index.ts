/**
 * The Korean catalogue, split by the part of the window each string belongs to.
 *
 * Split only so that translating one area is one file; the spread below is the
 * whole assembly. A key appearing in two areas with two different translations
 * is something `i18n.test.ts` fails on rather than something the spread order
 * silently decides.
 */
import { app } from "./app.ts";
import { chrome } from "./chrome.ts";
import { editing } from "./editing.ts";
import { menu } from "./menu.ts";
import { onboarding } from "./onboarding.ts";
import { rosetta } from "./rosetta.ts";

export const ko: Record<string, string> = {
  ...app,
  ...chrome,
  ...editing,
  ...menu,
  ...onboarding,
  ...rosetta,
};
