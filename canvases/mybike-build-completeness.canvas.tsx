import {
  BarChart,
  Grid,
  H1,
  H2,
  H3,
  Stack,
  Stat,
  Table,
  Text,
  UsageBar,
} from "cursor/canvas";

type DemoComponent = {
  category: string;
  name: string;
  brand?: string;
  model?: string;
  isActive: boolean;
};

type CategoryDef = {
  id: string;
  label: string;
  order: number;
};

type SubsystemDef = {
  name: string;
  categoryIds: string[];
};

const CATEGORIES: CategoryDef[] = [
  { id: "frame", label: "Frame", order: 10 },
  { id: "fork", label: "Fork", order: 20 },
  { id: "headset", label: "Headset", order: 30 },
  { id: "handlebar", label: "Handlebar", order: 40 },
  { id: "stem", label: "Stem", order: 50 },
  { id: "bar-tape", label: "Bar tape / Grips", order: 60 },
  { id: "shift-levers", label: "Shift levers", order: 70 },
  { id: "brake-levers", label: "Brake levers", order: 80 },
  { id: "front-derailleur", label: "Front derailleur", order: 90 },
  { id: "rear-derailleur", label: "Rear derailleur", order: 100 },
  { id: "crankset", label: "Crankset", order: 110 },
  { id: "bottom-bracket", label: "Bottom bracket", order: 120 },
  { id: "cassette", label: "Cassette", order: 130 },
  { id: "chain", label: "Chain", order: 140 },
  { id: "brakes", label: "Brakes", order: 150 },
  { id: "front-wheel", label: "Front wheel", order: 160 },
  { id: "rear-wheel", label: "Rear wheel", order: 170 },
  { id: "hubs", label: "Hubs", order: 180 },
  { id: "rims", label: "Rims", order: 190 },
  { id: "spokes", label: "Spokes", order: 200 },
  { id: "front-tire", label: "Front tire", order: 210 },
  { id: "rear-tire", label: "Rear tire", order: 220 },
  { id: "saddle", label: "Saddle", order: 230 },
  { id: "seatpost", label: "Seatpost", order: 240 },
  { id: "pedals", label: "Pedals", order: 250 },
  { id: "other", label: "Other", order: 999 },
];

const SUBSYSTEMS: SubsystemDef[] = [
  { name: "Frame and fork", categoryIds: ["frame", "fork", "headset"] },
  {
    name: "Cockpit",
    categoryIds: [
      "handlebar",
      "stem",
      "bar-tape",
      "shift-levers",
      "brake-levers",
    ],
  },
  {
    name: "Drivetrain",
    categoryIds: [
      "front-derailleur",
      "rear-derailleur",
      "crankset",
      "bottom-bracket",
      "cassette",
      "chain",
    ],
  },
  { name: "Brakes", categoryIds: ["brakes"] },
  {
    name: "Wheels",
    categoryIds: [
      "front-wheel",
      "rear-wheel",
      "hubs",
      "rims",
      "spokes",
      "front-tire",
      "rear-tire",
    ],
  },
  { name: "Contact", categoryIds: ["saddle", "seatpost", "pedals"] },
];

const demoComponents: DemoComponent[] = [
  { category: "frame", name: "Grizl CF SL", brand: "Canyon", isActive: true },
  { category: "fork", name: "Grizl fork", brand: "Canyon", isActive: true },
  {
    category: "headset",
    name: "Inset 7",
    brand: "Chris King",
    isActive: true,
  },
  {
    category: "handlebar",
    name: "Beacon",
    brand: "Ritchey",
    model: "44cm",
    isActive: true,
  },
  {
    category: "handlebar",
    name: "Cowchip",
    brand: "Salsa",
    model: "46cm",
    isActive: false,
  },
  { category: "stem", name: "K-Force", brand: "FSA", isActive: true },
  {
    category: "bar-tape",
    name: "Super Sticky Kush",
    brand: "Supacaz",
    isActive: true,
  },
  {
    category: "shift-levers",
    name: "GRX ST-RX810",
    brand: "Shimano",
    isActive: true,
  },
  {
    category: "rear-derailleur",
    name: "GRX RD-RX812",
    brand: "Shimano",
    isActive: true,
  },
  {
    category: "crankset",
    name: "GRX FC-RX810",
    brand: "Shimano",
    isActive: true,
  },
  {
    category: "cassette",
    name: "11-34T",
    brand: "Shimano",
    model: "CS-HG800",
    isActive: true,
  },
  {
    category: "cassette",
    name: "10-42T",
    brand: "SRAM",
    model: "XG-1275",
    isActive: false,
  },
  { category: "chain", name: "X11", brand: "KMC", isActive: true },
  {
    category: "brakes",
    name: "GRX BR-RX810",
    brand: "Shimano",
    isActive: true,
  },
  {
    category: "front-wheel",
    name: "GRC 1400",
    brand: "DT Swiss",
    isActive: true,
  },
  {
    category: "rear-wheel",
    name: "GRC 1400",
    brand: "DT Swiss",
    isActive: true,
  },
  {
    category: "front-tire",
    name: "Riddler",
    brand: "WTB",
    model: "700x45",
    isActive: true,
  },
  {
    category: "front-tire",
    name: "G-One Allround",
    brand: "Schwalbe",
    model: "700x40",
    isActive: false,
  },
  {
    category: "rear-tire",
    name: "Riddler",
    brand: "WTB",
    model: "700x45",
    isActive: true,
  },
  { category: "saddle", name: "C17", brand: "Brooks", isActive: true },
  { category: "saddle", name: "Arione", brand: "Fizik", isActive: false },
  {
    category: "pedals",
    name: "PD-ES600",
    brand: "Shimano",
    isActive: true,
  },
];

function groupByCategory(
  components: DemoComponent[],
): Record<string, DemoComponent[]> {
  const map: Record<string, DemoComponent[]> = {};
  for (const c of components) {
    const list = map[c.category];
    if (list) list.push(c);
    else map[c.category] = [c];
  }
  return map;
}

function componentLabel(c: DemoComponent): string {
  const parts: string[] = [];
  if (c.brand) parts.push(c.brand);
  if (c.model) parts.push(c.model);
  return parts.length > 0 ? parts.join(" ") : c.name;
}

function buildMetrics(components: DemoComponent[]) {
  const grouped = groupByCategory(components);
  const categoriesUsed = Object.keys(grouped).length;
  const totalCategories = CATEGORIES.length;
  const coveragePct = Math.round((categoriesUsed / totalCategories) * 100);
  const activeCount = components.filter((c) => c.isActive).length;

  const emptyCategories = CATEGORIES.filter((cat) => !grouped[cat.id]);

  const swapCategories = CATEGORIES.filter((cat) => {
    const list = grouped[cat.id];
    return list !== undefined && list.length > 1;
  }).map((cat) => ({
    label: cat.label,
    count: grouped[cat.id]?.length ?? 0,
  }));

  const subsystemScores = SUBSYSTEMS.map((sub) => {
    const filled = sub.categoryIds.filter((id) => grouped[id]).length;
    return {
      name: sub.name,
      pct: Math.round((filled / sub.categoryIds.length) * 100),
    };
  });

  const activeBuildRows: string[][] = [];
  for (const cat of CATEGORIES) {
    const list = grouped[cat.id];
    if (!list) continue;
    const active = list.find((c) => c.isActive);
    if (!active) continue;
    activeBuildRows.push([cat.label, componentLabel(active), active.name]);
  }

  return {
    categoriesUsed,
    totalCategories,
    coveragePct,
    activeCount,
    emptyCategories,
    swapCategories,
    subsystemScores,
    activeBuildRows,
  };
}

export default function MyBikeBuildCompleteness() {
  const metrics = buildMetrics(demoComponents);
  const bikeTitle = "Gravel Explorer (2023)";
  const bikeSubtitle = "Canyon Grizl";

  return (
    <Stack gap={24}>
      <Stack gap={4}>
        <H1>{bikeTitle}</H1>
        <Text tone="secondary">{bikeSubtitle}</Text>
      </Stack>

      <Grid columns={4} gap={16}>
        <Stat
          value={`${metrics.categoriesUsed}/${metrics.totalCategories}`}
          label="Categories covered"
          tone="info"
        />
        <Stat value={`${metrics.coveragePct}%`} label="Build coverage" />
        <Stat
          value={String(metrics.activeCount)}
          label="Active parts"
          tone="success"
        />
        <Stat
          value={String(metrics.swapCategories.length)}
          label="Swap-ready categories"
        />
      </Grid>

      <Stack gap={8}>
        <H2>Category coverage</H2>
        <Text tone="tertiary" size="small">
          Category slots (count) | filled vs empty
        </Text>
        <UsageBar
          total={metrics.totalCategories}
          topLeftLabel={`${metrics.coveragePct}% of slots filled`}
          topRightLabel={`${metrics.categoriesUsed} / ${metrics.totalCategories} categories`}
          segments={[
            {
              id: "filled",
              value: metrics.categoriesUsed,
              color: "green",
            },
          ]}
        />
      </Stack>

      <Stack gap={8}>
        <H2>Subsystem completeness</H2>
        <Text tone="tertiary" size="small">
          Subsystem | filled slots (%)
        </Text>
        <BarChart
          horizontal
          height={220}
          categories={metrics.subsystemScores.map((s) => s.name)}
          series={[
            {
              name: "Filled slots",
              data: metrics.subsystemScores.map((s) => s.pct),
              tone: "info",
            },
          ]}
          valueSuffix="%"
          yMax={100}
        />
      </Stack>

      <Stack gap={8}>
        <H2>Empty categories</H2>
        <Text tone="secondary" size="small">
          {metrics.emptyCategories.length} of {metrics.totalCategories} slots
          have no components:{" "}
          {metrics.emptyCategories.map((cat) => cat.label).join(", ")}
        </Text>
      </Stack>

      <Stack gap={8}>
        <H2>Swap inventory depth</H2>
        <Text tone="tertiary" size="small">
          Category | component count (parts)
        </Text>
        <BarChart
          horizontal
          height={180}
          categories={metrics.swapCategories.map((s) => s.label)}
          series={[
            {
              name: "Parts in category",
              data: metrics.swapCategories.map((s) => s.count),
            },
          ]}
          showValues
        />
      </Stack>

      <Stack gap={8}>
        <H2>Active build</H2>
        <H3>Current configuration by category</H3>
        <Table
          headers={["Category", "Brand / Model", "Name"]}
          rows={metrics.activeBuildRows}
          striped
          columnAlign={["left", "left", "left"]}
        />
      </Stack>

      <Text tone="quaternary" size="small">
        Source: embedded demo data | MyBike schema | illustrative build
      </Text>
    </Stack>
  );
}
