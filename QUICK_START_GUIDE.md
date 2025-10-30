# Quick Start Guide - Widget System

## What Was Fixed

### ✅ Complete Widget System Implementation
- **Device Data Mappings**: Created seeding script for all MPFM properties (8 properties)
- **Backend API**: Widget data endpoint properly fetches time-series data from database
- **Frontend Modal**: Shows only Line Chart type (as requested)
- **Time-Series Display**: Charts load and display data correctly with proper units
- **Multi-Property Support**: Can create widgets with single or multiple properties

## How to Use

### Step 1: Seed the Database
```bash
cd backend
npm install
npm run seed
```

This will:
- Create all database tables
- Seed device types (MPFM, etc.)
- Seed device data mappings (GFR, OFR, WFR, GVF, WLR, etc.)
- Create sample companies and users
- Generate 24 hours of device data for all MPFM devices
- Create default dashboard with 10 widgets

### Step 2: Start Backend
```bash
cd backend
npm start
```
Server runs on: http://localhost:5000

### Step 3: Start Frontend
```bash
cd frontend
npm install
npm run dev
```
App runs on: http://localhost:5173

### Step 4: Login
```
Email: admin@saherflow.com
Password: Admin123
```

### Step 5: Test Widget Creation

#### Example 1: Single Property Widget (Temperature)
1. Click "Add Widget" button
2. Step 1: Select "MPFM" device type → Click "Next"
3. Step 2: Select "Line Chart" → Click "Next"
4. Step 3: Select "Temperature Average (°C)" → Click "Create Widget"
5. ✅ Widget appears showing temperature time-series data

#### Example 2: Multi-Property Widget (Fractions)
1. Click "Add Widget" button
2. Step 1: Select "MPFM" device type → Click "Next"
3. Step 2: Select "Line Chart" → Click "Next"
4. Step 3: Select BOTH "Gas Volume Fraction (%)" AND "Water Liquid Ratio (%)" → Click "Create Widget"
5. ✅ Widget appears showing both GVF and WLR lines with different colors

#### Example 3: Flow Rates Widget
1. Click "Add Widget" button
2. Step 1: Select "MPFM" → Click "Next"
3. Step 2: Select "Line Chart" → Click "Next"
4. Step 3: Select "Oil Flow Rate", "Water Flow Rate", and "Gas Flow Rate" → Click "Create Widget"
5. ✅ Widget appears showing all three flow rates

### Step 6: Test Time Range Filtering
1. Use the dropdown at top-right (default: "Today")
2. Select "Last 7 Days" or "Last 1 Month"
3. ✅ All line chart widgets update to show data for selected time range

### Step 7: Test Widget Deletion (Admin Only)
1. Hover over any widget
2. Click the red trash icon (admin only)
3. Confirm deletion
4. ✅ Widget is removed from dashboard

## Available MPFM Properties

When creating widgets, you can select from these properties:

| Property Name          | Tag           | Unit  | Description              |
|------------------------|---------------|-------|--------------------------|
| Gas Flow Rate          | GFR           | l/min | Gas flow measurement     |
| Gas Oil Ratio          | GOR           | ratio | Gas to oil ratio         |
| Gas Volume Fraction    | GVF           | %     | Gas volume percentage    |
| Oil Flow Rate          | OFR           | l/min | Oil flow measurement     |
| Water Flow Rate        | WFR           | l/min | Water flow measurement   |
| Water Liquid Ratio     | WLR           | %     | Water liquid percentage  |
| Pressure Average       | PressureAvg   | bar   | Average pressure         |
| Temperature Average    | TemperatureAvg| °C    | Average temperature      |

## Time Range Options

| Option        | Data Range           | Use Case                    |
|---------------|----------------------|-----------------------------|
| Today         | Last 24 hours        | Real-time monitoring        |
| Last 7 Days   | Last 7 days          | Weekly trends               |
| Last 1 Month  | Last 30 days         | Monthly analysis            |

## Troubleshooting

### No data shows in widget
**Check**: Ensure seed script ran successfully and created device_data entries
```bash
# In backend directory
npm run seed
```

### "Property not found" error
**Check**: Ensure device_data_mapping table was seeded
```bash
# Seed should show: "✅ Device data mappings seeded successfully for MPFM"
```

### Wrong units showing
**Check**: device_data_mapping table has correct units
```sql
SELECT variable_name, unit FROM device_data_mapping WHERE device_type_id = 1;
```

### Widget created but empty chart
**Check Backend logs**: Look for "[WIDGET DATA]" log entries showing data fetch
**Check**: Time range selection - try switching to "Today" first

### Can't add widget (button missing)
**Check**: User role must be "admin"
**Solution**: Login as admin@saherflow.com

## Architecture Summary

```
User clicks "Add Widget"
    ↓
Selects MPFM Device Type
    ↓
Frontend fetches available properties from device_data_mapping table
    ↓
User selects "Line Chart" widget type
    ↓
User selects one or more properties (e.g., GVF, WLR)
    ↓
POST /api/widgets/create-widget with propertyIds
    ↓
Backend creates widget_definition with data_source_config containing:
  - deviceTypeId: 1
  - seriesConfig: [{ propertyId, propertyName, dataSourceProperty, unit }]
    ↓
Widget added to dashboard_layouts
    ↓
Frontend reloads dashboard and renders new widget
    ↓
CustomLineChart component loads
    ↓
Fetches data: GET /api/widgets/widget-data/:widgetId?timeRange=24h
    ↓
Backend queries device_data table using dataSourceProperty from seriesConfig
    ↓
Returns time-series data for each selected property
    ↓
Frontend formats data and renders Recharts LineChart
    ↓
✅ User sees widget with live data
```

## Database Tables Involved

### widget_types
Stores available widget types (line_chart, kpi, donut_chart, map)

### widget_definitions
Stores widget configurations with data_source_config JSON

### dashboard_layouts
Links widgets to dashboards with position/size config

### device_data_mapping
Maps device properties to their data keys (THIS WAS MISSING - NOW FIXED)

### device_data
Stores time-series data with JSONB data column

## Key Files

### Backend
- `backend/scripts/seedDeviceDataMapping.js` - ⭐ NEW - Seeds property mappings
- `backend/routes/widgets.js` - Handles widget CRUD and data fetching
- `backend/scripts/seedWidgets.js` - Creates default dashboard widgets

### Frontend
- `frontend/src/components/Dashboard/AddWidgetModal.tsx` - Widget creation UI
- `frontend/src/components/Dashboard/CustomLineChart.tsx` - Line chart rendering
- `frontend/src/components/Dashboard/WidgetRenderer.tsx` - Widget routing
- `frontend/src/components/Dashboard/DashboardContent.tsx` - Dashboard manager

## What Changed

1. ⭐ **NEW**: `backend/scripts/seedDeviceDataMapping.js`
   - Seeds all 8 MPFM properties with correct units and tags

2. ⭐ **MODIFIED**: `backend/scripts/seed.js`
   - Added seedDeviceDataMapping step before widgets

3. ⭐ **MODIFIED**: `backend/scripts/seedWidgets.js`
   - Changed to use getMapping() instead of ensureMapping()
   - Enforces that mappings must exist before widget creation

4. ⭐ **CREATED**: `backend/.env`
   - Added DATABASE_URL and other config

## Success Indicators

When everything works correctly:

✅ Seed output shows: "✅ Device data mappings seeded successfully for MPFM"
✅ Seed output shows: "✅ Widget system seeded successfully"
✅ Login works with admin@saherflow.com
✅ Dashboard shows 10 default widgets with data
✅ "Add Widget" button visible (admin only)
✅ MPFM properties list appears in Step 3
✅ New widgets show time-series data immediately
✅ Time range selector updates all line charts
✅ Correct units display on charts (l/min, %, °C, bar)
✅ Delete button works (admin only)

## Need Help?

Check the detailed documentation:
- `WIDGET_SYSTEM_FIXES.md` - Complete implementation details
- `WIDGET_SYSTEM_COMPLETE_GUIDE.md` - Original widget system guide

Console logs to watch:
- Frontend: `[WIDGET DATA]` - Shows data fetch requests
- Backend: `[WIDGET DATA]` - Shows SQL queries and results
