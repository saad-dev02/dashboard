# Widget System: Complete Technical Documentation

**Version:** 1.0
**Last Updated:** 2025-10-29
**Purpose:** Code Review & Technical Understanding

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture & Data Flow](#architecture--data-flow)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Use Case: OFR Line Chart](#use-case-ofr-line-chart)
6. [Configuration & Customization](#configuration--customization)
7. [Logging Strategy](#logging-strategy)

---

## System Overview

### What is the Widget System?

The widget system is a **dynamic, database-driven dashboard framework** that allows widgets (charts, KPIs, maps) to be configured once in the database and automatically rendered with correct positioning and styling on the frontend.

### Key Benefits

1. **No Hardcoded Layouts** - All widget positions stored in database
2. **Fully Dynamic** - Change layout by updating database records
3. **Responsive** - Adapts to screen size using react-grid-layout
4. **Maintainable** - Single source of truth (database)
5. **Scalable** - Add new widgets without frontend code changes

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express + PostgreSQL |
| **Frontend** | React + TypeScript + Vite |
| **Grid System** | react-grid-layout (12-column grid) |
| **Charts** | Recharts |
| **Styling** | Tailwind CSS |

---

## Architecture & Data Flow

### High-Level Flow

```
┌─────────────┐
│  Database   │ ◄─── Widget definitions, layouts, configurations
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │ ◄─── API endpoints to fetch widgets
│  (Express)  │
└──────┬──────┘
       │ JSON response
       ▼
┌─────────────┐
│  Frontend   │ ◄─── React components render widgets
│   (React)   │
└─────────────┘
```

### Database Schema

```
widget_types
├── id (primary key)
├── name (e.g., 'kpi', 'line_chart')
├── component_name (e.g., 'MetricsCard', 'FlowRateChart')
└── default_config (JSON)

widget_definitions
├── id (primary key)
├── name (e.g., 'OFR Metric')
├── description
├── widget_type_id (foreign key → widget_types)
├── data_source_config (JSON - metric, unit, title, etc.)
└── created_by (foreign key → user)

dashboards
├── id (primary key)
├── name (e.g., 'MPFM Production Dashboard')
├── description
└── created_by (foreign key → user)

dashboard_layouts
├── id (primary key)
├── dashboard_id (foreign key → dashboards)
├── widget_definition_id (foreign key → widget_definitions)
├── layout_config (JSON - x, y, w, h, minW, minH)
├── instance_config (JSON - widget-specific overrides)
└── display_order (integer)
```

### Complete Data Flow (Step-by-Step)

```
1. USER OPENS DASHBOARD
   ↓
2. DashboardContent.tsx mounts
   ↓
3. useEffect calls loadDashboardWidgets()
   ↓
4. Frontend: GET /api/widgets/dashboards
   ↓
5. Backend: Query dashboards table
   ↓
6. Backend: Return list of dashboards
   ↓
7. Frontend: Take first dashboard ID
   ↓
8. Frontend: GET /api/widgets/dashboard/:dashboardId
   ↓
9. Backend: Query dashboard_layouts JOIN widget_definitions JOIN widget_types
   ↓
10. Backend: Return widgets array with:
    - Widget metadata (name, description)
    - Layout config (x, y, w, h)
    - Data source config (metric, unit, title)
    - Component name (MetricsCard, FlowRateChart, etc.)
    ↓
11. Frontend: Store widgets in state
    ↓
12. Frontend: DynamicDashboard.tsx receives widgets
    ↓
13. Frontend: Convert to react-grid-layout format
    ↓
14. Frontend: Render GridLayout with widgets
    ↓
15. Frontend: For each widget, call WidgetRenderer
    ↓
16. Frontend: WidgetRenderer checks widget.component
    ↓
17. Frontend: Render appropriate component (FlowRateCharts, FractionsChart, etc.)
    ↓
18. Frontend: Components fetch live data via API
    ↓
19. USER SEES COMPLETE DASHBOARD
```

---

## Backend Implementation

### API Endpoints

#### 1. GET /api/widgets/dashboards

**Purpose:** Fetch all available dashboards for the user

**Request:**
```http
GET /api/widgets/dashboards
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "MPFM Production Dashboard",
      "description": "Main production dashboard for MPFM devices",
      "version": 1,
      "isActive": true,
      "widgetCount": 10,
      "createdAt": "2025-10-29T00:00:00.000Z"
    }
  ]
}
```

**Logging:**
```
[API] GET /dashboards - User: 123
```

---

#### 2. GET /api/widgets/dashboard/:dashboardId

**Purpose:** Fetch all widgets and their configurations for a specific dashboard

**Request:**
```http
GET /api/widgets/dashboard/1
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dashboard": {
      "id": 1,
      "name": "MPFM Production Dashboard",
      "description": "Main production dashboard",
      "gridConfig": null,
      "version": 1
    },
    "widgets": [
      {
        "layoutId": "layout-1",
        "widgetId": "widget-1",
        "name": "OFR Metric",
        "description": "Oil Flow Rate KPI",
        "type": "kpi",
        "component": "MetricsCard",
        "layoutConfig": {
          "x": 0,
          "y": 0,
          "w": 3,
          "h": 2,
          "minW": 2,
          "minH": 1,
          "static": false
        },
        "dataSourceConfig": {
          "metric": "ofr",
          "unit": "l/min",
          "title": "Oil flow rate",
          "shortTitle": "OFR",
          "icon": "/oildark.png",
          "colorDark": "#4D3DF7",
          "colorLight": "#F56C44"
        },
        "instanceConfig": null,
        "defaultConfig": { "refreshInterval": 5000 },
        "displayOrder": 1
      },
      // ... 9 more widgets
    ]
  }
}
```

**Database Query:**
```sql
SELECT
  dl.id as layout_id,
  dl.layout_config,
  dl.instance_config,
  dl.display_order,
  wd.id as widget_id,
  wd.name as widget_name,
  wd.description as widget_description,
  wd.data_source_config,
  wt.name as widget_type,
  wt.component_name,
  wt.default_config as widget_default_config
FROM dashboard_layouts dl
INNER JOIN widget_definitions wd ON dl.widget_definition_id = wd.id
INNER JOIN widget_types wt ON wd.widget_type_id = wt.id
WHERE dl.dashboard_id = $1
ORDER BY dl.display_order ASC
```

**Logging:**
```
[WIDGET SYSTEM] Loaded dashboard 1 with 10 widgets from database
  [1] OFR Metric (MetricsCard) - Layout: x=0, y=0, w=3, h=2
  [2] WFR Metric (MetricsCard) - Layout: x=3, y=0, w=3, h=2
  ...
```

---

### Seeding Widget Configuration

**File:** `backend/scripts/seedWidgets.js`

**Purpose:** Populate database with widget definitions and layout configurations

**Grid Layout (12-column grid, rowHeight=80px):**

```
ROW 1 (y=0, h=2): 4 KPI Cards
┌────────┬────────┬────────┬────────┐
│  OFR   │  WFR   │  GFR   │ Refresh│  Each: w=3
│ x=0    │ x=3    │ x=6    │ x=9    │  h=2 (160px)
└────────┴────────┴────────┴────────┘

ROW 2 (y=2, h=3): 3 Line Charts
┌──────────┬──────────┬──────────┐
│OFR Chart │WFR Chart │GFR Chart │  Each: w=4
│x=0       │x=4       │x=8       │  h=3 (240px)
└──────────┴──────────┴──────────┘

ROW 3 (y=5, h=4): 2 Charts Side-by-Side
┌─────────────────┬─────────────────┐
│Fractions Chart  │  GVF/WLR Chart  │  Each: w=6
│x=0              │  x=6            │  h=4 (320px)
└─────────────────┴─────────────────┘

ROW 4 (y=9, h=4): Production Map (Full Width)
┌─────────────────────────────────────┐
│         Production Map              │  w=12 (full)
│         x=0                         │  h=4 (320px)
└─────────────────────────────────────┘
```

**Run Seed:**
```bash
cd backend
node scripts/seedWidgets.js
```

---

## Frontend Implementation

### Component Hierarchy

```
App.tsx
└── Dashboard.tsx
    └── DashboardLayout.tsx
        └── DashboardContent.tsx
            └── DynamicDashboard.tsx (react-grid-layout)
                └── WidgetRenderer.tsx
                    ├── MetricsCard (individual KPI)
                    ├── FlowRateCharts (OFR/WFR/GFR line charts)
                    ├── FractionsChart
                    ├── GVFWLRCharts
                    └── ProductionMap
```

### Key Components

#### 1. DashboardContent.tsx

**Purpose:** Orchestrate widget loading and data fetching

**Key Responsibilities:**
- Fetch dashboard configuration from API
- Manage chart data state (metrics + flow rate)
- Handle auto-refresh (5-second interval)
- Render DynamicDashboard with widgets

**State:**
```typescript
const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
const [dashboardConfig, setDashboardConfig] = useState<any>(null);
const [widgetsLoaded, setWidgetsLoaded] = useState(false);
const [metricsChartData, setMetricsChartData] = useState<DeviceChartData | null>(null);
const [flowRateChartData, setFlowRateChartData] = useState<DeviceChartData | null>(null);
```

**Lifecycle:**
```typescript
useEffect(() => {
  loadDashboardWidgets(); // Load widget configs once
}, [token]);

useEffect(() => {
  loadDeviceMetricsData(); // Load live data when device changes
}, [selectedDevice]);

useEffect(() => {
  startAutoRefresh(); // Refresh every 5 seconds
}, [selectedDevice, timeRange]);
```

**Logging:**
```
[DASHBOARD] Loading: MPFM Production Dashboard
[DASHBOARD] ✓ Loaded 10 widgets
```

---

#### 2. DynamicDashboard.tsx

**Purpose:** Render react-grid-layout with dynamic widget positions

**Key Features:**
- Responsive container width tracking
- Convert widget configs to grid layout format
- Handle drag-and-drop (when isEditable=true)
- Auto-save layout changes to database

**Props:**
```typescript
interface DynamicDashboardProps {
  dashboardId: string;
  widgets: WidgetConfig[];
  onLayoutChange?: (layouts: Layout[]) => void;
  isEditable?: boolean;
  children: (widget: WidgetConfig) => React.ReactNode;
}
```

**Grid Configuration:**
```typescript
<GridLayout
  className="layout"
  layout={layouts}          // Widget positions from database
  cols={12}                 // 12-column grid
  rowHeight={80}            // 80px per row unit
  width={containerWidth}    // Dynamic container width
  margin={[16, 16]}         // 16px gaps between widgets
  containerPadding={[0, 0]} // No outer padding
  isDraggable={false}       // Static layout (not editable)
  isResizable={false}
  compactType="vertical"    // Stack widgets vertically
  preventCollision={false}  // Allow overlapping during drag
>
```

**Layout Conversion:**
```typescript
const layouts = widgets.map((widget) => ({
  i: widget.layoutId,     // Unique identifier
  x: widget.layoutConfig.x,
  y: widget.layoutConfig.y,
  w: widget.layoutConfig.w,
  h: widget.layoutConfig.h,
  minW: widget.layoutConfig.minW,
  minH: widget.layoutConfig.minH,
  static: !isEditable
}));
```

**Logging:**
```
[GRID] Rendering 10 widgets in 10 positions
```

---

#### 3. WidgetRenderer.tsx

**Purpose:** Route widgets to correct components based on type

**Switch Logic:**
```typescript
switch (widget.component) {
  case 'MetricsCard':
    // Render individual KPI card (OFR, WFR, GFR, or Last Refresh)
    return <IndividualMetricCard {...} />;

  case 'FlowRateChart':
    // Render single line chart (OFR, WFR, or GFR)
    return <FlowRateCharts widgetConfigs={[widget]} {...} />;

  case 'FractionsChart':
    // Render GVF/WLR line chart
    return <FractionsChart widgetConfig={widget} {...} />;

  case 'GVFWLRChart':
    // Render GVF/WLR donut charts
    return <GVFWLRCharts widgetConfig={widget} {...} />;

  case 'ProductionMap':
    // Render device location map
    return <ProductionMap widgetConfig={widget} {...} />;
}
```

**Data Flow:**
```typescript
// Extract metric value from chart data
const getMetricValue = (metric: string) => {
  if (hierarchyChartData?.chartData) {
    const latest = hierarchyChartData.chartData[hierarchyChartData.chartData.length - 1];
    return latest.totalOfr || latest.totalWfr || latest.totalGfr || 0;
  }
  if (chartData?.chartData) {
    const latest = chartData.chartData[chartData.chartData.length - 1];
    return latest.ofr || latest.wfr || latest.gfr || 0;
  }
  return 0;
};
```

---

## Use Case: OFR Line Chart

Let's trace the complete lifecycle of the **OFR (Oil Flow Rate) Line Chart** widget from database to screen.

### Step 1: Database Configuration

**Widget Type:**
```sql
INSERT INTO widget_types (name, component_name, default_config)
VALUES ('line_chart', 'FlowRateChart', '{"refreshInterval": 5000}');
```

**Widget Definition:**
```sql
INSERT INTO widget_definitions (name, description, widget_type_id, data_source_config)
VALUES (
  'OFR Chart',
  'Oil Flow Rate Line Chart',
  <line_chart_type_id>,
  '{
    "metric": "ofr",
    "unit": "l/min",
    "title": "OFR",
    "dataKey": "ofr"
  }'
);
```

**Dashboard Layout:**
```sql
INSERT INTO dashboard_layouts (dashboard_id, widget_definition_id, layout_config, display_order)
VALUES (
  1,
  <ofr_chart_widget_id>,
  '{
    "x": 0,
    "y": 2,
    "w": 4,
    "h": 3,
    "minW": 3,
    "minH": 2,
    "static": false
  }',
  5
);
```

**Grid Position Explanation:**
- `x: 0` → Starts at column 0 (leftmost)
- `y: 2` → Starts at row 2 (below KPI cards which occupy rows 0-1)
- `w: 4` → Spans 4 columns (⅓ of 12-column grid)
- `h: 3` → Height of 3 row units (3 × 80px = 240px)

---

### Step 2: Backend API Response

**Endpoint:** `GET /api/widgets/dashboard/1`

**Response Fragment:**
```json
{
  "layoutId": "5",
  "widgetId": "5",
  "name": "OFR Chart",
  "description": "Oil Flow Rate Line Chart",
  "type": "line_chart",
  "component": "FlowRateChart",
  "layoutConfig": {
    "x": 0,
    "y": 2,
    "w": 4,
    "h": 3,
    "minW": 3,
    "minH": 2,
    "static": false
  },
  "dataSourceConfig": {
    "metric": "ofr",
    "unit": "l/min",
    "title": "OFR",
    "dataKey": "ofr"
  },
  "displayOrder": 5
}
```

**Backend Log:**
```
[WIDGET SYSTEM] Loaded dashboard 1 with 10 widgets from database
  [5] OFR Chart (FlowRateChart) - Layout: x=0, y=2, w=4, h=3
```

---

### Step 3: Frontend Loading

**DashboardContent.tsx:**
```typescript
// 1. Fetch widgets on mount
useEffect(() => {
  const loadDashboardWidgets = async () => {
    const dashboardsResponse = await apiService.getDashboards(token);
    const firstDashboard = dashboardsResponse.data[0];

    console.log('[DASHBOARD] Loading:', firstDashboard.name);

    const widgetsResponse = await apiService.getDashboardWidgets(firstDashboard.id, token);

    console.log('[DASHBOARD] ✓ Loaded', widgetsResponse.data.widgets.length, 'widgets');

    setWidgets(widgetsResponse.data.widgets); // Store all 10 widgets
    setWidgetsLoaded(true);
  };

  loadDashboardWidgets();
}, [token]);
```

---

### Step 4: Grid Layout Rendering

**DynamicDashboard.tsx:**
```typescript
// 2. Convert widget to grid layout
const layouts = widgets.map((widget) => ({
  i: widget.layoutId,  // "5"
  x: 0,                // Column 0
  y: 2,                // Row 2
  w: 4,                // Width 4 columns
  h: 3,                // Height 3 rows
  static: false
}));

console.log('[GRID] Rendering', widgets.length, 'widgets in', layouts.length, 'positions');

// 3. Render grid
<GridLayout
  layout={layouts}
  cols={12}
  rowHeight={80}
  width={containerWidth}
>
  {layouts.map((layout) => {
    const widget = widgetMap.get(layout.i); // Get OFR Chart widget
    return (
      <div key={layout.i}>
        {children(widget)} {/* Call WidgetRenderer */}
      </div>
    );
  })}
</GridLayout>
```

**CSS Positioning (Calculated by react-grid-layout):**
```css
.react-grid-item {
  position: absolute;
  left: 0px;           /* x=0, column 0 */
  top: 176px;          /* y=2, 2 rows × 80px + margins */
  width: calc(33.33% - 16px);  /* w=4, 4/12 columns minus margin */
  height: 256px;       /* h=3, 3 rows × 80px + margins */
}
```

---

### Step 5: Widget Rendering

**WidgetRenderer.tsx:**
```typescript
// 4. Route to correct component
const WidgetRenderer = ({ widget, chartData, timeRange }) => {
  switch (widget.component) {
    case 'FlowRateChart':
      return (
        <div className="h-full">
          <FlowRateCharts
            chartData={chartData}
            timeRange={timeRange}
            widgetConfigs={[widget]} // Pass OFR widget config
          />
        </div>
      );
  }
};
```

---

### Step 6: Chart Component

**FlowRateCharts.tsx:**
```typescript
// 5. Extract configuration
const getChartConfig = (metric: string) => {
  return widgetConfigs.find(w => w.dataSourceConfig?.metric === metric);
};

const ofrConfig = getChartConfig('ofr'); // Find OFR widget

// 6. Process chart data
const ofrData = chartData.chartData.map((point) => ({
  timestamp: new Date(point.timestamp).getTime(),
  line: point.ofr || 0  // Extract OFR value
}));

// 7. Render chart
{ofrConfig && (
  <div className="relative h-full">
    <FlowRateChart
      title="OFR"              // From dataSourceConfig.title
      unit="l/min"             // From dataSourceConfig.unit
      data={ofrData}           // Processed data points
      dataKey="line"           // Chart line key
      timeRange={timeRange}
    />
  </div>
)}
```

---

### Step 7: Chart Visualization

**FlowRateChart Component:**
```typescript
<div className="rounded-lg p-4 bg-[#162345]">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-base font-semibold">
      {title} ({unit})  {/* "OFR (l/min)" */}
    </h3>
    <ExternalLink onClick={onExpandClick} />
  </div>

  <ResponsiveContainer width="100%" height={240}>
    <LineChart data={data}>
      <CartesianGrid stroke="#d5dae740" strokeDasharray="3 3" />
      <XAxis
        dataKey="timestamp"
        tickFormatter={(v) => formatTime(v, timeRange)}
      />
      <YAxis domain={[0, maxValue * 1.2]} />
      <Line
        type="monotone"
        dataKey="line"
        stroke="#EC4899"
        strokeWidth={2}
      />
    </LineChart>
  </ResponsiveContainer>
</div>
```

---

### Step 8: Data Refresh

**Auto-Refresh (Every 5 seconds):**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    // Fetch fresh data
    loadDeviceFlowRateData(selectedDevice.id);
  }, 5000);

  return () => clearInterval(interval);
}, [selectedDevice]);
```

**Data Flow:**
```
Backend: GET /api/charts/devices/:deviceId?timeRange=day
         ↓
Frontend: Update flowRateChartData state
         ↓
FlowRateCharts: Re-render with new data
         ↓
User sees updated chart
```

---

### Complete OFR Widget Lifecycle Summary

```
1. SEED DATABASE
   seedWidgets.js creates OFR Chart widget with position x=0, y=2, w=4, h=3

2. USER OPENS DASHBOARD
   DashboardContent fetches widgets from API

3. BACKEND RETURNS
   OFR Chart config with layout and data source settings

4. FRONTEND STORES
   Widget config in state (widgets array)

5. GRID RENDERS
   DynamicDashboard positions OFR chart at row 2, column 0

6. WIDGET RENDERER
   Routes to FlowRateCharts component

7. CHART COMPONENT
   Extracts OFR data, renders Recharts LineChart

8. USER SEES
   OFR line chart at correct position with live data

9. AUTO-REFRESH
   Every 5 seconds, fetch new data and update chart
```

---

## Configuration & Customization

### Changing Widget Position

**Option 1: Update Database Directly**
```sql
UPDATE dashboard_layouts
SET layout_config = jsonb_set(
  layout_config,
  '{x}',
  '6'::jsonb
)
WHERE id = 5;  -- OFR Chart layout ID
```

**Option 2: Re-run Seed Script**
```javascript
// In seedWidgets.js
{ widget: 'OFR Chart', x: 6, y: 2, w: 4, h: 3, order: 5 },
```

**Result:** Frontend automatically reflects new position on next load

---

### Adding New Widget Type

**1. Create Widget Type:**
```sql
INSERT INTO widget_types (name, component_name, default_config)
VALUES ('bar_chart', 'BarChart', '{"refreshInterval": 10000}');
```

**2. Create Widget Definition:**
```sql
INSERT INTO widget_definitions (name, description, widget_type_id, data_source_config)
VALUES (
  'Pressure Chart',
  'Pressure Monitoring Bar Chart',
  <bar_chart_type_id>,
  '{"metric": "pressure", "unit": "psi", "title": "Pressure"}'
);
```

**3. Add to Dashboard:**
```sql
INSERT INTO dashboard_layouts (dashboard_id, widget_definition_id, layout_config, display_order)
VALUES (
  1,
  <pressure_chart_widget_id>,
  '{"x": 0, "y": 13, "w": 12, "h": 3, "minW": 6, "minH": 2}',
  11
);
```

**4. Update Frontend WidgetRenderer:**
```typescript
case 'BarChart':
  return <BarChart widgetConfig={widget} {...} />;
```

**5. Refresh Dashboard** - New widget appears automatically!

---

## Logging Strategy

### Backend Logging

**Level: INFO**
- Dashboard queries
- Widget loading
- Layout configurations

**Level: ERROR**
- Database connection failures
- Query errors
- Authentication failures

**Example Logs:**
```
[WIDGET SYSTEM] Loaded dashboard 1 with 10 widgets from database
  [1] OFR Metric (MetricsCard) - Layout: x=0, y=0, w=3, h=2
  [2] WFR Metric (MetricsCard) - Layout: x=3, y=0, w=3, h=2
  ...
```

---

### Frontend Logging

**Minimal & Purposeful** - Only log critical events

**Key Events:**
1. Dashboard loading
2. Widget count
3. Grid rendering

**Example Logs:**
```
[DASHBOARD] Loading: MPFM Production Dashboard
[DASHBOARD] ✓ Loaded 10 widgets
[GRID] Rendering 10 widgets in 10 positions
```

**No Excessive Logging:**
- ❌ Individual widget renders
- ❌ Data transformations
- ❌ Component re-renders
- ❌ State updates

**Why Minimal?**
- Cleaner console
- Faster performance
- Easier debugging
- Production-ready

---

## Summary

### What We Built

A **fully dynamic widget system** where:
- **Database** defines widget types, positions, and configurations
- **Backend** serves widget data via REST API
- **Frontend** renders widgets dynamically using react-grid-layout
- **No hardcoded layouts** - everything driven by database

### Key Takeaways

1. **Single Source of Truth** - Database holds all widget configurations
2. **Automatic Rendering** - Frontend adapts to database changes
3. **Scalable Architecture** - Add widgets without code changes
4. **Responsive Design** - Works on all screen sizes
5. **Clean Logging** - Minimal, purposeful console output

### Current Dashboard Layout

```
┌────────┬────────┬────────┬────────┐
│  OFR   │  WFR   │  GFR   │ Refresh│  4 KPI Cards
└────────┴────────┴────────┴────────┘
┌──────────┬──────────┬──────────┐
│OFR Chart │WFR Chart │GFR Chart │  3 Line Charts
└──────────┴──────────┴──────────┘
┌─────────────────┬─────────────────┐
│Fractions Chart  │  GVF/WLR Chart  │  2 Visualizations
└─────────────────┴─────────────────┘
┌─────────────────────────────────────┐
│         Production Map              │  Map Widget
└─────────────────────────────────────┘
```

**Total:** 10 widgets, fully dynamic, database-driven

---

**End of Documentation**

For questions or clarifications, refer to the codebase or contact the development team.
