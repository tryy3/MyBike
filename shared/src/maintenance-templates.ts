import type { CategoryDef } from "./categories.js";
import type {
  MaintenanceTaskKind,
  MaintenanceTemplate,
  MaintenanceTriggerMode,
} from "./schemas/maintenance.js";

type CategoryId = CategoryDef["id"];

function tpl(
  templateKey: string,
  kind: MaintenanceTaskKind,
  title: string,
  opts: {
    description?: string;
    componentCategory?: CategoryId;
    triggerMode?: MaintenanceTriggerMode;
    distanceMeters?: number;
    intervalDays?: number;
    guideUrl?: string;
    sortOrder: number;
  },
): MaintenanceTemplate {
  return {
    templateKey,
    kind,
    title,
    description: opts.description ?? null,
    componentCategory: opts.componentCategory ?? null,
    triggerMode: opts.triggerMode ?? null,
    distanceMeters: opts.distanceMeters ?? null,
    intervalDays: opts.intervalDays ?? null,
    guideUrl: opts.guideUrl ?? null,
    sortOrder: opts.sortOrder,
  };
}

/** Default maintenance tasks seeded when a bike is created. */
export const MAINTENANCE_TEMPLATES: readonly MaintenanceTemplate[] = [
  tpl("pre-ride-check", "touch_up", "Pre-ride safety check", {
    description:
      "Quick every-ride pass before you roll: confirm brakes bite, wheels are seated, stem and seatpost bolts look snug, and the chain isn't dry or rusty. Takes a few minutes and catches most safety issues early.",
    guideUrl: "https://www.rei.com/learn/expert-advice/pre-ride-inspection.html",
    sortOrder: 10,
  }),
  tpl("tire-pressure", "touch_up", "Tire pressure", {
    description:
      "Check and adjust tire pressure before every ride. Correct pressure improves comfort, grip, and puncture resistance.",
    guideUrl: "https://www.youtube.com/watch?v=CBK88bdmqfk",
    sortOrder: 20,
  }),
  tpl("inspect-tires", "touch_up", "Inspect tires", {
    description:
      "Weekly look-over for cuts, embedded glass, squaring, sidewall damage, and tread wear. Catches problems that pressure checks alone won't.",
    guideUrl: "https://www.rei.com/learn/expert-advice/spring-cycling.html",
    sortOrder: 30,
  }),
  tpl("chain-wipe", "touch_up", "Wipe / lube chain", {
    description:
      "Light wipe and re-lube when the chain sounds dry or after routine rides. Use this habit whenever the chain chirps or looks grimy — it complements the distance-based lube reminder, not replaces it.",
    guideUrl: "https://www.youtube.com/watch?v=zyietLL9yNk",
    sortOrder: 35,
  }),
  tpl("clean-bike", "touch_up", "Clean bike", {
    description:
      "Frame wipe-down or full wash. Keeping the bike clean makes inspection easier and slows grime buildup on the drivetrain.",
    guideUrl: "https://www.youtube.com/watch?v=B2sKhSDrugE",
    sortOrder: 40,
  }),
  tpl("post-wet-ride", "touch_up", "After wet ride", {
    description:
      "After rain or mud: wipe the chain, check brakes, and rinse the drivetrain if heavily gritted. A few minutes now prevents much faster wear later.",
    guideUrl: "https://www.youtube.com/watch?v=KM6mzE5lQ0w",
    sortOrder: 50,
  }),

  tpl("chain-lube", "periodic", "Clean & lube chain", {
    description:
      "Reminder to clean and lubricate the chain. Intervals vary widely: roughly 150–500 km for drip/wet lube, 400–800 km for wax, and sooner after wet or gritty rides. Default 300 km — raise for wax/dry conditions, lower for mud and rain.",
    componentCategory: "chain",
    triggerMode: "distance",
    distanceMeters: 300_000,
    guideUrl:
      "https://www.parktool.com/en-us/blog/repair-help/chain-cleaning-with-a-park-tool-chain-scrubber",
    sortOrder: 110,
  }),
  tpl("chain-wear-check", "periodic", "Check chain wear", {
    description:
      "Measure elongation with a chain checker before it damages the cassette and rings. Typical checks every 500–1,000 km or monthly on 11/12-speed; replace around 0.5% wear. Default: every 800 km or 30 days, whichever comes first.",
    componentCategory: "chain",
    triggerMode: "both",
    distanceMeters: 800_000,
    intervalDays: 30,
    guideUrl:
      "https://www.parktool.com/en-us/blog/repair-help/when-to-replace-a-chain-on-a-bicycle",
    sortOrder: 120,
  }),
  tpl("deep-clean", "periodic", "Deep clean drivetrain", {
    description:
      "Thorough degrease of the chain, cassette, chainrings, and jockey wheels — separate from quick post-ride wipes. Most riders need this every 3–6 months depending on conditions. Default: every 90 days.",
    componentCategory: "chain",
    triggerMode: "time",
    intervalDays: 90,
    guideUrl: "https://www.youtube.com/watch?v=MuwS_nSevy4",
    sortOrder: 130,
  }),
  tpl("shifting-check", "periodic", "Shifting & indexing check", {
    description:
      "Check indexing, limit screws, and smooth shifts under load. Catches cable stretch, hanger issues, and derailleur wear before they become ride-ending. Default: every 2,000 km or 180 days.",
    componentCategory: "rear-derailleur",
    triggerMode: "both",
    distanceMeters: 2_000_000,
    intervalDays: 180,
    guideUrl: "https://www.youtube.com/watch?v=UkZxPIZ1ngY",
    sortOrder: 140,
  }),
  tpl("brake-inspection", "periodic", "Brake inspection", {
    description:
      "Inspect pad thickness and wear indicators, rotor or rim rub, and lever feel. Disc and rim brakes differ in detail, but the habit is the same — look before stopping power drops. Rim-brake riders can swap the guide link to Park Tool's rim pad article.",
    componentCategory: "brakes",
    triggerMode: "both",
    distanceMeters: 800_000,
    intervalDays: 90,
    guideUrl: "https://www.youtube.com/watch?v=ZHbTMl6EGJc",
    sortOrder: 150,
  }),
  tpl("annual-service", "periodic", "Annual bike check", {
    description:
      "Once a year, work through the whole bike for wear and play — not a shop overhaul, but a deliberate inspection pass. Covers headset and bottom bracket bearings, bar tape or grips, saddle and seatpost, hub play and wheel true, cockpit bolt torque, and a frame/fork visual for damage.",
    componentCategory: "frame",
    triggerMode: "time",
    intervalDays: 365,
    guideUrl:
      "https://www.parktool.com/en-us/blog/calvins-corner/springtime-attention-brings-problem-prevention",
    sortOrder: 160,
  }),

  tpl("chain-eol", "eol", "Replace chain", {
    description:
      "Replace the chain before elongation wears the cassette and chainrings. Typical lifespan 2,000–5,000 km on 11/12-speed depending on lube and conditions; replace sooner if a wear tool shows 0.5%+. Default limit: 3,000 km total wear.",
    componentCategory: "chain",
    triggerMode: "distance",
    distanceMeters: 3_000_000,
    guideUrl: "https://www.parktool.com/en-us/blog/repair-help/chain-replacement-derailleur-bikes",
    sortOrder: 210,
  }),
  tpl("brake-pads-eol", "eol", "Replace brake pads", {
    description:
      "Replace when pad material is below safe thickness or stopping power is reduced. Highly variable: disc resin often 800–3,200 km, rim pads 2,000–5,000 km. Default limit: 2,500 km total wear — conservative for wet and hilly riding. Rim-brake riders can swap the guide link to Park Tool's rim pad article.",
    componentCategory: "brakes",
    triggerMode: "distance",
    distanceMeters: 2_500_000,
    guideUrl: "https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation",
    sortOrder: 220,
  }),
  tpl("cassette-eol", "eol", "Replace cassette", {
    description:
      "Replace when a new chain skips under load or cogs show significant wear. Usually lasts roughly two to three chains (often 8,000–16,000 km). Default limit: 8,000 km total wear.",
    componentCategory: "cassette",
    triggerMode: "distance",
    distanceMeters: 8_000_000,
    guideUrl: "https://www.parktool.com/en-us/blog/repair-help/cassette-removal-and-installation",
    sortOrder: 230,
  }),
  tpl("front-tire-eol", "eol", "Replace front tire", {
    description:
      "Front tires often last longer than rears but still need replacing for deep cuts, age, or squared tread. Typical front life roughly 1.5–2× the rear on road. Default limit: 6,000 km total wear.",
    componentCategory: "front-tire",
    triggerMode: "distance",
    distanceMeters: 6_000_000,
    guideUrl:
      "https://www.parktool.com/en-us/blog/repair-help/tire-and-tube-removal-and-installation",
    sortOrder: 240,
  }),
  tpl("rear-tire-eol", "eol", "Replace rear tire", {
    description:
      "Rear tires wear faster than fronts — replace when the profile squares off, casing shows, or flats become frequent. Typical road rear life 3,000–6,000 km. Default limit: 4,000 km total wear.",
    componentCategory: "rear-tire",
    triggerMode: "distance",
    distanceMeters: 4_000_000,
    guideUrl:
      "https://www.parktool.com/en-us/blog/repair-help/tire-and-tube-removal-and-installation",
    sortOrder: 250,
  }),
] as const;

export const MAINTENANCE_TEMPLATE_BY_KEY = new Map(
  MAINTENANCE_TEMPLATES.map((t) => [t.templateKey, t]),
);

export const SNOOZE_DISTANCE_PRESETS_METERS = [50_000, 100_000, 200_000] as const;
export const SNOOZE_TIME_PRESETS_DAYS = [7, 14, 30] as const;
