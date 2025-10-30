# Widget Data Loading Logic - Complete Guide

## Overview

Your project uses a **property-based dynamic widget system** where admins can create custom widgets by selecting device properties. This document explains exactly how data flows from database to display.

---

## Database Structure

### Key Tables

1. **`device_data_mapping`** - Maps device properties to data fields
   - `id` - Unique property identifier
   - `device_type_id` - Links to device type (e.g., MPFM)
   - `variable_name` - Display name (e.g., "TemperatureAvg")
   - `variable_tag` - JSON key in device_data (e.g., "temperature_avg")
   - `unit` - Measurement unit (e.g., "°C")
   - `data_type` - Type of data (e.g., "float")

2. **`device_data`** - Historical time-series data
   - `id` - Record ID
   - `device_id` - Device reference
   - `data` - JSONB column containing ALL property values
   - `created_at` - Timestamp
   - Example data structure:
     ```json
     {
       "temperature_avg": 45.2,
       "pressure": 120.5,
       "ofr": 1200,
       "wfr": 800
     }
     ```

3. **`widget_definitions`** - Widget configurations
   - `id` - Widget ID
   - `name` - Widget name
   - `widget_type_id` - Type (line_chart, kpi, etc.)
   - `data_source_config` - JSONB with property mappings
   - Example for custom widget:
     ```json
     {
       "deviceTypeId": 1,
       "numberOfSeries": 1,
       "seriesConfig": [
         {
           "propertyId": 15,
           "propertyName": "TemperatureAvg",
           "displayName": "TemperatureAvg",
           "dataSourceProperty": "temperature_avg",
           "unit": "°C",
           "dataType": "float"
         }
       ]
     }
     ```

---

## Admin Workflow - Creating a Custom Widget

### Step 1: Admin Opens Add Widget Modal
- Admin clicks "Add Widget" button
- Modal shows 3-step wizard

### Step 2: Select Device Type
- API call: `GET /api/widgets/device-types`
- Returns list of device types (e.g., MPFM)
- Admin selects a device type (e.g., MPFM with id=1)

### Step 3: Select Widget Type
- API call: `GET /api/widgets/available-widgets?deviceTypeId=1`
- Returns:
  - Available widget types (Line Chart, KPI, etc.)
  - Available properties from `device_data_mapping` for that device type
- Admin selects "Line Chart"

### Step 4: Select Properties
- Admin sees list of all properties for MPFM:
  - TemperatureAvg (°C)
  - Pressure (bar)
  - OFR (l/min)
  - WFR (l/min)
  - etc.
- Admin can select 1 or more properties (e.g., just "TemperatureAvg")
- Admin optionally provides custom widget name

### Step 5: Widget Creation
- API call: `POST /api/widgets/create-widget`
- Request body:
  ```json
  {
    "deviceTypeId": 1,
    "widgetTypeId": "line_chart_widget_type_id",
    "propertyIds": [15],
    "displayName": "Temperature Monitor"
  }
  ```

### Backend Processing (widgets.js)
```javascript
// 1. Fetch property details from device_data_mapping
const mapping = await query(
  `SELECT id, variable_name, variable_tag, unit, data_type
   FROM device_data_mapping
   WHERE id = $1 AND device_type_id = $2`,
  [propertyId, deviceTypeId]
);

// 2. Build seriesConfig
const seriesConfig = [{
  propertyId: 15,
  propertyName: "TemperatureAvg",
  displayName: "TemperatureAvg",
  dataSourceProperty: "temperature_avg", // This is the JSON key!
  unit: "°C",
  dataType: "float"
}];

// 3. Store in widget_definitions
const dataSourceConfig = {
  deviceTypeId: 1,
  numberOfSeries: 1,
  seriesConfig: seriesConfig
};

// 4. Add to company dashboard
await insertDashboardLayout(dashboardId, widgetId);
```

---

## Data Loading at Runtime

### When User Views Dashboard

1. **Load Dashboard Configuration**
   - API: `GET /api/widgets/user-dashboard`
   - Returns list of all widgets with their `data_source_config`

2. **For Each Custom Widget**
   - Frontend detects `seriesConfig` exists in `data_source_config`
   - Renders using `CustomLineChart` component

3. **Load Widget Data**
   - API: `GET /api/widgets/widget-data/:widgetId?timeRange=24h&limit=200`
   - Backend query (widgets.js line 556-574):

```javascript
// For EACH series in seriesConfig
for (const s of dataSourceConfig.seriesConfig) {
  const query = `
    SELECT
      dd.created_at as timestamp,
      dd.serial_number,
      (dd.data->>$1)::numeric as value    -- Extract JSON property!
    FROM device_data dd
    INNER JOIN device d ON dd.device_id = d.id
    WHERE d.company_id = $2
      AND d.device_type_id = $3
      AND dd.created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY dd.created_at ASC
    LIMIT 200
  `;

  // $1 = s.dataSourceProperty = "temperature_avg"
  // This extracts the temperature_avg value from the JSONB data column

  const result = await query(query, [
    s.dataSourceProperty,     // "temperature_avg"
    companyId,                // User's company
    dataSourceConfig.deviceTypeId  // MPFM = 1
  ]);
}
```

4. **Response Format**
```json
{
  "success": true,
  "data": {
    "TemperatureAvg": {
      "data": [
        {
          "timestamp": "2025-10-30T10:00:00Z",
          "serialNumber": "MPFM-001",
          "value": 45.2
        },
        {
          "timestamp": "2025-10-30T10:05:00Z",
          "serialNumber": "MPFM-001",
          "value": 45.8
        }
      ],
      "unit": "°C",
      "propertyName": "TemperatureAvg"
    }
  },
  "config": {
    "deviceTypeId": 1,
    "numberOfSeries": 1,
    "seriesConfig": [...]
  }
}
```

5. **Frontend Rendering (CustomLineChart.tsx)**
```typescript
// Format data for Recharts
const formatChartData = (seriesData) => {
  const dataMap = {};

  // For each series (e.g., TemperatureAvg)
  Object.entries(seriesData).forEach(([seriesName, series]) => {
    series.data.forEach((point) => {
      const timestamp = new Date(point.timestamp).getTime();
      if (!dataMap[timestamp]) {
        dataMap[timestamp] = { timestamp };
      }
      dataMap[timestamp][seriesName] = point.value;
    });
  });

  // Result: [
  //   { timestamp: 1730280000000, TemperatureAvg: 45.2 },
  //   { timestamp: 1730280300000, TemperatureAvg: 45.8 }
  // ]
  return Object.values(dataMap).sort((a, b) => a.timestamp - b.timestamp);
};

// Render with Recharts
<LineChart data={chartData}>
  <Line dataKey="TemperatureAvg" stroke="#EC4899" />
</LineChart>
```

---

## Multiple Properties Example

If admin selects 3 properties (TemperatureAvg, Pressure, OFR):

### data_source_config:
```json
{
  "deviceTypeId": 1,
  "numberOfSeries": 3,
  "seriesConfig": [
    {
      "propertyId": 15,
      "propertyName": "TemperatureAvg",
      "dataSourceProperty": "temperature_avg",
      "unit": "°C"
    },
    {
      "propertyId": 16,
      "propertyName": "Pressure",
      "dataSourceProperty": "pressure",
      "unit": "bar"
    },
    {
      "propertyId": 17,
      "propertyName": "OFR",
      "dataSourceProperty": "ofr",
      "unit": "l/min"
    }
  ]
}
```

### Backend runs 3 queries:
1. Extract `temperature_avg` from device_data JSONB
2. Extract `pressure` from device_data JSONB
3. Extract `ofr` from device_data JSONB

### Frontend renders 3 lines on same chart:
- Line 1: TemperatureAvg (pink)
- Line 2: Pressure (green)
- Line 3: OFR (orange)

---

## Default vs Custom Widgets

### Default Widgets (Pre-configured)
- **FlowRateChart**: Uses hardcoded OFR/WFR/GFR logic
- **FractionsChart**: Uses hardcoded GVF/WLR logic
- **MetricsCard**: Shows single KPI value
- These use OLD data loading from `/api/charts/device/:id`

### Custom Widgets (Admin-created)
- **Identified by**: `data_source_config.seriesConfig` exists
- **Always use**: CustomLineChart component
- **Data from**: `/api/widgets/widget-data/:widgetId`
- **Can display**: ANY property from device_data_mapping

---

## Key Points

1. **One JSONB Column**: All device properties stored in `device_data.data` JSONB column
2. **Property Mapping**: `device_data_mapping.variable_tag` = JSON key in device_data
3. **Dynamic Extraction**: Query uses `dd.data->>$1` to extract specific property
4. **Series Config**: Stored in `widget_definitions.data_source_config.seriesConfig`
5. **Unified Component**: All custom widgets use CustomLineChart regardless of number of properties

---

## Troubleshooting

### Widget Shows "No data available"
1. Check widget_definitions.data_source_config has seriesConfig
2. Verify dataSourceProperty matches device_data_mapping.variable_tag
3. Ensure device_data has records for that device_type_id
4. Check device_data.data JSONB contains the property key

### Widget Created But Empty
- Backend query may be failing
- Check browser console for API response
- Verify time range has data (try longer range)
- Confirm company has devices with data

### Wrong Data Displayed
- Check propertyId in seriesConfig matches device_data_mapping.id
- Verify dataSourceProperty is correct JSON key
- Ensure deviceTypeId matches device.device_type_id
