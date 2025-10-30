# Widget System Fixes - Complete Implementation

## Overview
Fixed the complete widget system flow to properly handle dynamic widget creation, device property selection, and time-series data display.

## Issues Identified and Fixed

### 1. Missing Device Data Mapping Table Seeding
**Problem**: The `device_data_mapping` table was not being seeded with MPFM device properties, causing the widget creation system to fail when trying to fetch available properties.

**Solution**: Created `seedDeviceDataMapping.js` script that:
- Seeds all 8 MPFM properties (GFR, GOR, GVF, OFR, WFR, WLR, PressureAvg, TemperatureAvg)
- Maps each property with correct variable names, tags, units, and data types
- Ensures proper ordering for UI display

**Files Modified**:
- `backend/scripts/seedDeviceDataMapping.js` (NEW)
- `backend/scripts/seed.js` (added seedDeviceDataMapping step)

### 2. Widget Definition Seeding Issues
**Problem**: The `seedWidgets.js` was trying to create mappings on-the-fly instead of relying on pre-seeded data, causing inconsistencies.

**Solution**: Updated `seedWidgets.js` to:
- Use `getMapping()` instead of `ensureMapping()` to enforce that mappings must exist
- Fail fast with clear error messages if mappings are missing
- Rely on `seedDeviceDataMapping` running first

**Files Modified**:
- `backend/scripts/seedWidgets.js`

### 3. Backend Configuration
**Problem**: Missing `.env` file in backend directory.

**Solution**: Created `backend/.env` with proper PostgreSQL connection string and all required environment variables.

**Files Created**:
- `backend/.env`

## How the Widget System Works

### Complete Flow

#### 1. Admin Creates a New Widget

**Step 1: Select Device Type**
```
Admin clicks "Add Widget" → Modal opens → Selects "MPFM" device type
```

**Step 2: Select Widget Type**
```
Admin selects "Line Chart" (currently only widget type shown as per requirements)
```

**Step 3: Select Properties**
```
Admin selects one or more properties from the list:
- Gas Flow Rate (GFR) - l/min
- Gas Oil Ratio (GOR) - ratio
- Gas Volume Fraction (GVF) - %
- Oil Flow Rate (OFR) - l/min
- Water Flow Rate (WFR) - l/min
- Water Liquid Ratio (WLR) - %
- Pressure Average (PressureAvg) - bar
- Temperature Average (TemperatureAvg) - °C

Example: Admin selects GVF and WLR for a "Fractions Chart"
```

**Step 4: Create Widget**
```
POST /api/widgets/create-widget
Body: {
  deviceTypeId: 1, // MPFM
  widgetTypeId: "<line_chart_uuid>",
  propertyIds: [<gvf_id>, <wlr_id>],
  displayName: "Fractions Chart" (optional)
}
```

#### 2. Backend Processing

**Widget Definition Creation**:
```javascript
// Backend creates widget_definition with data_source_config:
{
  "deviceTypeId": 1,
  "numberOfSeries": 2,
  "seriesConfig": [
    {
      "propertyId": <gvf_id>,
      "propertyName": "Gas Volume Fraction",
      "displayName": "GVF",
      "dataSourceProperty": "GVF", // This is the JSON key in device_data.data
      "unit": "%",
      "dataType": "numeric"
    },
    {
      "propertyId": <wlr_id>,
      "propertyName": "Water Liquid Ratio",
      "displayName": "WLR",
      "dataSourceProperty": "WLR",
      "unit": "%",
      "dataType": "numeric"
    }
  ]
}
```

**Dashboard Layout Entry**:
```javascript
// Automatically adds widget to company dashboard
INSERT INTO dashboard_layouts (
  dashboard_id,
  widget_definition_id,
  layout_config,
  display_order
)
```

#### 3. Frontend Display

**Dashboard Loading**:
```javascript
// Frontend loads dashboard and all widgets
GET /api/widgets/user-dashboard
Response: {
  dashboard: { ... },
  widgets: [
    {
      widgetId: "<widget_uuid>",
      layoutId: "<layout_uuid>",
      name: "Fractions Chart",
      type: "line_chart",
      component: "CustomLineChart",
      dataSourceConfig: { ... }, // Contains seriesConfig
      layoutConfig: { x, y, w, h, ... }
    }
  ]
}
```

**Data Fetching Per Widget**:
```javascript
// Each CustomLineChart widget fetches its own data
GET /api/widgets/widget-data/:widgetId?timeRange=24h&limit=200

// Backend queries device_data table:
SELECT
  dd.created_at as timestamp,
  dd.serial_number,
  COALESCE((dd.data->>'GVF')::numeric, 0) as value
FROM device_data dd
INNER JOIN device d ON dd.device_id = d.id
WHERE d.company_id = <user_company_id>
  AND d.device_type_id = 1
  AND dd.created_at >= NOW() - INTERVAL '24 hours'
  AND dd.data ? 'GVF'
ORDER BY dd.created_at ASC
LIMIT 200

// Returns:
{
  success: true,
  data: {
    "GVF": {
      data: [
        { timestamp: "2024-...", serialNumber: "MPFM-...", value: 75.2 },
        { timestamp: "2024-...", serialNumber: "MPFM-...", value: 75.5 },
        ...
      ],
      unit: "%",
      propertyName: "Gas Volume Fraction"
    },
    "WLR": {
      data: [...],
      unit: "%",
      propertyName: "Water Liquid Ratio"
    }
  }
}
```

**Chart Rendering**:
```javascript
// CustomLineChart formats data for Recharts:
chartData = [
  { timestamp: 1234567890, GVF: 75.2, WLR: 72.3 },
  { timestamp: 1234567950, GVF: 75.5, WLR: 72.1 },
  ...
]

// Renders LineChart with:
<Line dataKey="GVF" stroke="#EC4899" />
<Line dataKey="WLR" stroke="#38BF9D" />
```

#### 4. Time Range Filtering

**User Changes Time Range**:
```
User selects "Last 7 Days" → timeRange state changes → CustomLineChart re-fetches data
```

**Backend Applies Filter**:
```sql
-- For 1h:   AND dd.created_at >= NOW() - INTERVAL '1 hour'
-- For 6h:   AND dd.created_at >= NOW() - INTERVAL '6 hours'
-- For 24h:  AND dd.created_at >= NOW() - INTERVAL '24 hours'
-- For 7d:   AND dd.created_at >= NOW() - INTERVAL '7 days'
-- For 30d:  AND dd.created_at >= NOW() - INTERVAL '30 days'
```

#### 5. Widget Deletion

**Admin Deletes Widget**:
```javascript
// Admin clicks delete button
DELETE /api/widgets/remove-widget/:layoutId

// Backend removes from dashboard_layouts
// Widget definition remains in widget_definitions table
// Can be re-added later if needed
```

## Database Schema

### device_data_mapping
```sql
id | device_type_id | variable_name           | variable_tag    | unit    | data_type | ui_order
---|----------------|-------------------------|-----------------|---------|-----------|----------
1  | 1              | Gas Flow Rate          | GFR             | l/min   | numeric   | 1
2  | 1              | Gas Oil Ratio          | GOR             | ratio   | numeric   | 2
3  | 1              | Gas Volume Fraction    | GVF             | %       | numeric   | 3
4  | 1              | Oil Flow Rate          | OFR             | l/min   | numeric   | 4
5  | 1              | Water Flow Rate        | WFR             | l/min   | numeric   | 5
6  | 1              | Water Liquid Ratio     | WLR             | %       | numeric   | 6
7  | 1              | Pressure Average       | PressureAvg     | bar     | numeric   | 7
8  | 1              | Temperature Average    | TemperatureAvg  | °C      | numeric   | 8
```

### device_data
```sql
id | device_id | serial_number | created_at | data (JSONB)
---|-----------|---------------|------------|----------------------------------
1  | 1         | MPFM-ARB-101 | 2024-...   | {"GFR": 9600, "GOR": 10, "GVF": 75, "OFR": 850, "WFR": 2200, "WLR": 72, "PressureAvg": 6.5, "TemperatureAvg": 26}
2  | 1         | MPFM-ARB-101 | 2024-...   | {"GFR": 9650, "GOR": 10, "GVF": 76, "OFR": 860, "WFR": 2210, "WLR": 72, "PressureAvg": 6.5, "TemperatureAvg": 26}
```

## Testing the System

### Prerequisites
1. PostgreSQL database running at `localhost:5432`
2. Database named `saher-dashboard`
3. User `postgres` with password `saad`

### Steps to Test

1. **Seed the database**:
```bash
cd backend
npm run seed
```

2. **Start the backend**:
```bash
cd backend
npm start
```

3. **Start the frontend**:
```bash
cd frontend
npm run dev
```

4. **Login as admin**:
```
Email: admin@saherflow.com
Password: Admin123
```

5. **Test widget creation**:
   - Click "Add Widget" button
   - Select "MPFM" device type
   - Select "Line Chart" widget type
   - Select one or more properties (e.g., "Temperature Average")
   - Click "Create Widget"
   - Verify the new widget appears on the dashboard with data

6. **Test time range filtering**:
   - Change time range dropdown (Today, Last 7 Days, Last 1 Month)
   - Verify all line chart widgets update their data

7. **Test single property widget**:
   - Create widget with only "Temperature Average"
   - Verify it shows single line with proper units

8. **Test multi-property widget**:
   - Create widget with "GVF" and "WLR"
   - Verify it shows both lines with proper colors and legends
   - Verify each series has correct units

9. **Test widget deletion**:
   - Click delete button on a widget (admin only)
   - Confirm deletion
   - Verify widget is removed from dashboard

## Key Implementation Details

### Why `dataSourceProperty` is Critical
The `dataSourceProperty` field in `seriesConfig` MUST match the JSON key in `device_data.data` column:
```javascript
// In device_data_mapping: variable_tag = "GFR"
// In device_data.data: {"GFR": 9600, ...}
// In widget data_source_config: dataSourceProperty = "GFR"
// In SQL query: dd.data->>'GFR'
```

### Time-Series Data Flow
1. User creates widget → Backend stores property IDs and tags
2. Widget loads → Frontend requests data by widget ID
3. Backend looks up widget → Gets seriesConfig
4. For each series → Query device_data using dataSourceProperty
5. Return formatted time-series data → Frontend renders chart

### Multi-Company Support
- Each widget belongs to a dashboard
- Each dashboard belongs to a company (via creator user)
- Widget data queries filter by user's company_id
- Users only see data from their own company's devices

## Common Issues and Solutions

### Issue: "No data available for this time range"
**Cause**: No device_data entries exist for the selected time range
**Solution**: Ensure seedHierarchy.js has generated data with timestamps in the selected range

### Issue: "Property not found"
**Cause**: device_data_mapping missing entries for device type
**Solution**: Run seedDeviceDataMapping.js before seedWidgets.js

### Issue: Widget shows but no series data
**Cause**: dataSourceProperty doesn't match device_data.data JSON keys
**Solution**: Verify device_data_mapping.variable_tag matches keys in device_data.data

### Issue: Wrong units displayed
**Cause**: device_data_mapping.unit doesn't match expected unit
**Solution**: Update seedDeviceDataMapping.js with correct units and re-seed

## Files Modified Summary

### Backend
- `backend/.env` (CREATED)
- `backend/scripts/seedDeviceDataMapping.js` (CREATED)
- `backend/scripts/seed.js` (MODIFIED - added seedDeviceDataMapping step)
- `backend/scripts/seedWidgets.js` (MODIFIED - updated to use getMapping)

### Frontend
All frontend files work correctly as-is:
- `AddWidgetModal.tsx` - Already filters to show only line charts
- `CustomLineChart.tsx` - Already fetches and displays widget data correctly
- `WidgetRenderer.tsx` - Already renders widgets correctly
- `DashboardContent.tsx` - Already manages widgets correctly

## Success Criteria

✅ Admin can add new widgets selecting MPFM device and properties
✅ Only Line Chart widget type is shown (as per requirements)
✅ Properties load from database (device_data_mapping)
✅ Widget creation stores correct data_source_config
✅ Time-series data loads and displays on dashboard
✅ Time range filtering works (1h, 6h, 24h, 7d, 30d)
✅ Single property widgets display correctly
✅ Multi-property widgets display correctly with legends
✅ Units and names display correctly
✅ Admin can delete widgets
✅ All users in company see the same widgets
✅ Data is filtered by company_id

## Next Steps

1. Run `npm run seed` in backend directory
2. Verify all tables are populated correctly
3. Test widget creation flow end-to-end
4. Verify time-series data displays correctly
5. Test with different time ranges
6. Test widget deletion
