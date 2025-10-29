# Widget Data Flow Documentation

## Overview
This document explains how data flows from device sensors through the database to widgets on the dashboard.

---

## System Architecture

### 1. Data Collection Layer
**Tables Involved:**
- `device_type` - Defines device types (MPFM, Pressure Sensor, etc.)
- `device_data_mapping` - Maps device properties to data fields
- `device` - Registered devices
- `device_data` - Historical device readings
- `device_latest` - Latest device readings (for real-time data)

### 2. Widget Configuration Layer
**Tables Involved:**
- `widget_types` - Widget component types (line_chart, kpi, etc.)
- `widget_definitions` - Configured widgets with data source mappings
- `dashboards` - Dashboard containers
- `dashboard_layouts` - Widget positions and configurations

---

## Complete Data Flow

### Step 1: Device Data Mapping Setup
When a device type is created, its available properties are defined in `device_data_mapping`:

```sql
-- Example: MPFM device properties
INSERT INTO device_data_mapping (device_type_id, variable_name, variable_tag, unit)
VALUES
  (1, 'Temperature', 'TempAVG', '°C'),
  (1, 'OFR', 'OfrAVG', 'l/min'),
  (1, 'WFR', 'WfrAVG', 'l/min'),
  (1, 'GFR', 'GfrAVG', 'l/min');
```

**Key Fields:**
- `variable_name` - Display name shown to users (e.g., "Temperature")
- `variable_tag` - Actual JSON field in device_data.data column (e.g., "TempAVG")
- `unit` - Measurement unit (e.g., "°C", "l/min")

---

### Step 2: Widget Creation Flow

When an admin creates a widget, they provide:
1. **Device Type** - Which device (MPFM, Pressure Sensor)
2. **Property Name** - Which property to display (Temperature, OFR)
3. **Display Name** - Chart title
4. **Widget Type** - Chart type (line_chart, kpi)
5. **Number of Series** - Single or multi-series
6. **Chart Config** - Dimensions, colors, etc.

**API Request Example:**
```json
POST /api/widgets/definitions
{
  "name": "Temperature Chart",
  "description": "MPFM Temperature Line Chart",
  "widgetTypeId": "abc-123",
  "deviceTypeId": 1,
  "propertyName": "Temperature",
  "displayName": "Temperature Chart",
  "numberOfSeries": 1,
  "chartConfig": {
    "height": 300,
    "width": 400
  }
}
```

**Backend Processing:**
1. Backend receives request
2. Queries `device_data_mapping` to find matching property:
   ```sql
   SELECT variable_tag, unit, data_type
   FROM device_data_mapping
   WHERE device_type_id = 1 AND variable_name = 'Temperature'
   ```
3. Retrieves: `variable_tag = "TempAVG"`, `unit = "°C"`
4. Creates `widget_definitions` record with complete config:
   ```json
   {
     "deviceTypeId": 1,
     "propertyName": "Temperature",
     "dataSourceProperty": "TempAVG",
     "displayName": "Temperature Chart",
     "unit": "°C",
     "numberOfSeries": 1,
     "chartConfig": { ... }
   }
   ```

---

### Step 3: Dashboard Assembly

**Adding Widget to Dashboard:**
```json
POST /api/widgets/dashboard/{dashboardId}/widget
{
  "widgetDefinitionId": "widget-uuid",
  "layoutConfig": {
    "x": 0, "y": 0, "w": 4, "h": 3
  }
}
```

Creates entry in `dashboard_layouts` linking widget to dashboard with position.

---

### Step 4: Data Loading

#### A. Loading Dashboard Configuration
```
GET /api/widgets/dashboard/{dashboardId}
```

**Query Executed:**
```sql
SELECT
  wd.data_source_config,
  wt.component_name,
  dl.layout_config
FROM dashboard_layouts dl
INNER JOIN widget_definitions wd ON dl.widget_definition_id = wd.id
INNER JOIN widget_types wt ON wd.widget_type_id = wt.id
WHERE dl.dashboard_id = :dashboardId
```

**Response:**
```json
{
  "widgets": [
    {
      "widgetId": "abc-123",
      "component": "FlowRateChart",
      "layoutConfig": { "x": 0, "y": 0, "w": 4, "h": 3 },
      "dataSourceConfig": {
        "deviceTypeId": 1,
        "propertyName": "Temperature",
        "dataSourceProperty": "TempAVG",
        "unit": "°C"
      }
    }
  ]
}
```

#### B. Loading Widget Historical Data
```
GET /api/widgets/data/{widgetId}?limit=100&timeRange=24h
```

**Query Executed:**
```sql
SELECT
  dd.created_at as timestamp,
  dd.serial_number,
  dd.data->>'TempAVG' as value  -- Uses dataSourceProperty from config
FROM device_data dd
INNER JOIN device d ON dd.device_id = d.id
WHERE d.company_id = :companyId
  AND d.device_type_id = 1  -- From widget config
  AND dd.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY dd.created_at DESC
LIMIT 100
```

**Response:**
```json
{
  "data": [
    {
      "timestamp": "2025-10-29T10:30:00Z",
      "serialNumber": "MPFM-ARB-101",
      "value": 85.4
    },
    ...
  ],
  "config": {
    "unit": "°C",
    "displayName": "Temperature Chart"
  }
}
```

#### C. Loading Widget Latest Data (Real-time)
```
GET /api/widgets/data/{widgetId}/latest
```

**Query Executed:**
```sql
SELECT
  dl.updated_at as timestamp,
  dl.serial_number,
  dl.data->>'TempAVG' as value  -- Uses dataSourceProperty from config
FROM device_latest dl
INNER JOIN device d ON dl.device_id = d.id
WHERE d.company_id = :companyId
  AND d.device_type_id = 1  -- From widget config
```

**Response with Aggregation:**
```json
{
  "data": {
    "latest": [
      {
        "serialNumber": "MPFM-ARB-101",
        "value": 85.4
      },
      {
        "serialNumber": "MPFM-ARB-102",
        "value": 87.2
      }
    ],
    "aggregatedValue": 86.3,  // Average across all devices
    "count": 2,
    "unit": "°C",
    "displayName": "Temperature"
  }
}
```

---

## Key Data Flow Points

### 1. Property Mapping Chain
```
User Input → device_data_mapping → widget_definitions → device_data query
"Temperature" → "TempAVG" → stored in config → data->>'TempAVG'
```

### 2. Multi-Series Widget Example
For a widget showing OFR, WFR, GFR together:

**Widget Definition:**
```json
{
  "deviceTypeId": 1,
  "numberOfSeries": 3,
  "seriesConfig": [
    { "name": "OFR", "property": "OfrAVG", "color": "#F56C44" },
    { "name": "WFR", "property": "WfrAVG", "color": "#46B8E9" },
    { "name": "GFR", "property": "GfrAVG", "color": "#38BF9D" }
  ]
}
```

**Data Query:** Each series queries its respective property from device_data JSON.

### 3. Device Type Filtering
All data queries automatically filter by:
- `company_id` - Only user's company data
- `device_type_id` - Only specified device type (if configured)

---

## API Endpoints Summary

### Configuration APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/widgets/device-types` | GET | List all device types |
| `/api/widgets/device-types/:id/properties` | GET | Get properties for device type |
| `/api/widgets/types` | GET | List widget component types |
| `/api/widgets/definitions` | GET | List all widget definitions |
| `/api/widgets/definitions` | POST | Create widget with mapping |
| `/api/widgets/definitions/:id` | PUT | Update widget config |
| `/api/widgets/dashboards` | POST | Create dashboard |
| `/api/widgets/dashboard/:id/widget` | POST | Add widget to dashboard |
| `/api/widgets/dashboard/:id/layout` | POST | Update widget positions |

### Data Loading APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/widgets/dashboard/:id` | GET | Load dashboard config |
| `/api/widgets/data/:id` | GET | Historical widget data |
| `/api/widgets/data/:id/latest` | GET | Real-time widget data |

---

## Complete Example: Creating Temperature Widget

### 1. Get Device Types
```
GET /api/widgets/device-types
→ Returns: [{ id: 1, type_name: "MPFM" }, ...]
```

### 2. Get MPFM Properties
```
GET /api/widgets/device-types/1/properties
→ Returns: [
  { variable_name: "Temperature", variable_tag: "TempAVG", unit: "°C" },
  { variable_name: "OFR", variable_tag: "OfrAVG", unit: "l/min" },
  ...
]
```

### 3. Get Widget Types
```
GET /api/widgets/types
→ Returns: [{ id: "uuid", name: "line_chart", component_name: "FlowRateChart" }, ...]
```

### 4. Create Widget
```
POST /api/widgets/definitions
{
  "name": "Temperature Chart",
  "widgetTypeId": "uuid",
  "deviceTypeId": 1,
  "propertyName": "Temperature",
  "displayName": "Temperature"
}
→ Backend looks up "TempAVG" from device_data_mapping
→ Saves complete config to widget_definitions
```

### 5. Add to Dashboard
```
POST /api/widgets/dashboard/{dashboardId}/widget
{ "widgetDefinitionId": "widget-uuid", "layoutConfig": {...} }
```

### 6. Load Data
```
GET /api/widgets/data/{widget-uuid}?timeRange=24h
→ Queries: device_data.data->>'TempAVG'
→ Returns temperature readings from last 24h
```

---

## Database Schema Key Relationships

```
device_type
    ↓ (1:N)
device_data_mapping (stores variable_name → variable_tag mapping)
    ↓ (referenced by)
widget_definitions.data_source_config (stores dataSourceProperty)
    ↓ (1:N)
dashboard_layouts
    ↓ (N:1)
dashboards

device_type
    ↓ (1:N)
device
    ↓ (1:N)
device_data (historical - JSONB data column)
    ↑ (queried using dataSourceProperty from widget config)
widget data endpoint

device
    ↓ (1:1)
device_latest (real-time - JSONB data column)
    ↑ (queried using dataSourceProperty from widget config)
widget latest data endpoint
```

---

## Important Notes

1. **JSON Property Access**: All device measurements are stored in `device_data.data` and `device_latest.data` as JSONB
2. **Mapping Layer**: `device_data_mapping.variable_tag` provides the JSON key to access data
3. **Type Safety**: `device_type_id` ensures widgets only query compatible devices
4. **Security**: All queries filter by `company_id` to isolate tenant data
5. **Flexibility**: Admins can create custom widgets for any property in device_data_mapping
6. **Real-time vs Historical**: Use `/latest` endpoint for current values, regular endpoint for time-series charts

---

## Time Range Options

- `1h` - Last 1 hour
- `6h` - Last 6 hours
- `24h` - Last 24 hours (default)
- `7d` - Last 7 days
- `30d` - Last 30 days

---

## Chart Configuration Options

```json
{
  "chartConfig": {
    "height": 300,
    "width": 400,
    "xAxis": "time",
    "yAxis": "value",
    "showLegend": true,
    "showGrid": true,
    "interpolation": "linear"
  }
}
```

---

## Frontend Integration Points

1. **Dashboard Load**: Call `/api/widgets/dashboard/:id` to get all widget configs
2. **Render Widgets**: Use `component_name` to load correct React component
3. **Load Data**: Call `/api/widgets/data/:widgetId` for each widget
4. **Refresh**: Poll `/latest` endpoint every 5-30 seconds
5. **Drag-Drop**: Update positions via `/dashboard/:id/layout` endpoint

---

## Admin Workflow

1. Login as admin
2. Navigate to widget configuration
3. Select device type (MPFM, Pressure, etc.)
4. System shows available properties from `device_data_mapping`
5. Select property (Temperature, OFR, etc.)
6. Choose widget type (line chart, KPI card)
7. Configure chart dimensions, colors
8. Set position on dashboard (x, y, w, h)
9. Save - widget now loads data using mapped property

---

## User Workflow

1. Login as regular user
2. Dashboard automatically loads based on company admin configuration
3. Widgets render with company's data
4. Real-time updates via WebSocket or polling
5. Users see same dashboard layout as configured by admin
