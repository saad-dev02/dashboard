# Widget System Complete Implementation Guide

## Overview

The widget system has been completely refactored to use a **generic, property-based approach** where all line charts (including flow rate charts and fractions charts) are created dynamically based on device properties from the `device_data_mapping` table.

## Key Changes

### 1. Unified Line Chart Approach
- **Old System**: Separate components for OFR, GFR, WFR charts (FlowRateCharts.tsx, OfrChart.tsx, GfrChart.tsx, WfrChart.tsx) and FractionsChart.tsx
- **New System**: Single `CustomLineChart` component that handles ANY number of properties from ANY device type

### 2. Generic Widget Creation
Admins can now create widgets by:
1. Selecting a device type (e.g., MPFM)
2. Selecting widget type (Line Chart)
3. Selecting one or more properties to display
4. The system automatically creates the widget with proper data source configuration

## Data Flow Architecture

### Database Structure

```
device_type (MPFM, etc.)
    ↓
device_data_mapping (defines available properties: OFR, WFR, GFR, GVF, WLR, etc.)
    ↓
widget_definitions (stores which properties to display)
    data_source_config: {
      deviceTypeId: <id>,
      numberOfSeries: <count>,
      seriesConfig: [
        {
          propertyId: <device_data_mapping.id>,
          propertyName: "variable_name",
          displayName: "OFR",
          dataSourceProperty: "variable_tag", // Used to query device_data
          unit: "l/min",
          dataType: "numeric"
        }
      ]
    }
    ↓
dashboard_layouts (connects widgets to dashboards)
    ↓
device_data (actual time-series data, JSONB format)
```

### Data Loading Query Logic

When a widget requests data (`GET /api/widgets/widget-data/:widgetId`):

1. **Fetch Widget Configuration**
   ```sql
   SELECT wd.data_source_config, wt.component_name, wt.name as widget_type
   FROM widget_definitions wd
   INNER JOIN widget_types wt ON wd.widget_type_id = wt.id
   WHERE wd.id = $widgetId
   ```

2. **Extract Series Configuration**
   ```javascript
   const dataSourceConfig = widget.data_source_config;
   // dataSourceConfig.seriesConfig contains array of properties to display
   ```

3. **Query Data for Each Series**
   ```sql
   SELECT
     dd.created_at as timestamp,
     dd.serial_number,
     COALESCE((dd.data->>$dataSourceProperty)::numeric, 0) as value
   FROM device_data dd
   INNER JOIN device d ON dd.device_id = d.id
   WHERE d.company_id = $companyId
     AND d.device_type_id = $deviceTypeId
     AND dd.created_at >= NOW() - INTERVAL $timeRange
     AND dd.data ? $dataSourceProperty  -- Check if JSONB key exists
   ORDER BY dd.created_at ASC
   LIMIT $limit
   ```

4. **Format Response**
   ```javascript
   {
     success: true,
     data: {
       "OFR": {
         data: [{timestamp, serialNumber, value}, ...],
         unit: "l/min",
         propertyName: "OFR"
       },
       "WFR": {
         data: [...],
         unit: "l/min",
         propertyName: "WFR"
       }
     },
     config: dataSourceConfig
   }
   ```

## Default 10 Widgets

The system seeds **10 default widgets** for every company dashboard:

### KPI Cards (4 widgets)
1. **OFR Metric** - Oil Flow Rate KPI card
2. **WFR Metric** - Water Flow Rate KPI card
3. **GFR Metric** - Gas Flow Rate KPI card
4. **Last Refresh** - System refresh time indicator

### Line Charts (3 widgets)
5. **OFR Chart** - Oil Flow Rate over time (1 series)
6. **WFR Chart** - Water Flow Rate over time (1 series)
7. **GFR Chart** - Gas Flow Rate over time (1 series)

### Multi-Series Line Chart (1 widget)
8. **Fractions Chart** - GVF and WLR displayed together (2 series)

### Other Widgets (2 widgets)
9. **GVF/WLR Donut Charts** - Donut chart visualization
10. **Production Map** - Geographic device locations

## Seeding Process

The `seedWidgets.js` script now:

1. **Queries device_data_mapping** for each property (OFR, WFR, GFR, GVF, WLR)
2. **Creates widget_definitions** with proper `data_source_config` containing:
   - `deviceTypeId`: References the MPFM device type
   - `numberOfSeries`: Count of properties (1 for single charts, 2 for fractions)
   - `seriesConfig`: Array of property configurations including `propertyId` from `device_data_mapping`

3. **Widget Type Mapping**:
   - `line_chart` → `CustomLineChart` component (handles 1+ series)
   - `kpi` → `MetricsCard` component
   - `donut_chart` → `GVFWLRChart` component
   - `map` → `ProductionMap` component

## Frontend Components

### CustomLineChart Component
**Location**: `frontend/src/components/Dashboard/CustomLineChart.tsx`

**Functionality**:
- Accepts `widgetConfig` with `dataSourceConfig.seriesConfig`
- Fetches data from `/api/widgets/widget-data/:widgetId`
- Renders multiple series on same chart with different colors
- Supports time range filtering (1day, 7days, 1month)
- Dynamic Y-axis scaling based on data
- Responsive design with modal for full-screen view

### WidgetRenderer Component
**Location**: `frontend/src/components/Dashboard/WidgetRenderer.tsx`

**Routing Logic**:
```typescript
switch (widget.component) {
  case 'CustomLineChart':
    // All line charts (OFR, WFR, GFR, Fractions, custom)
    return <CustomLineChart widgetConfig={widget} timeRange={timeRange} />;

  case 'MetricsCard':
    // KPI cards

  case 'GVFWLRChart':
    // Donut charts

  case 'ProductionMap':
    // Map widget
}
```

## Admin Widget Creation Flow

### Step 1: Select Device Type
Admin sees list of available device types (e.g., MPFM)

### Step 2: Select Widget Type
Currently filters to show only "Line Chart" option

### Step 3: Select Properties
Admin can select one or more properties from the `device_data_mapping` table:
- TemperatureAvg
- PressureAvg
- OFR
- WFR
- GFR
- GVF
- WLR
- etc.

### Step 4: Create Widget
```javascript
POST /api/widgets/create-widget
{
  deviceTypeId: 1,
  widgetTypeId: "line_chart_id",
  propertyIds: [5, 7],  // Array of device_data_mapping IDs
  displayName: "Temperature and Pressure Chart"  // Optional
}
```

Backend:
1. Validates all propertyIds exist for the device type
2. Creates `widget_definition` with `data_source_config`
3. Adds widget to company's dashboard
4. Returns success

Frontend:
1. Refreshes dashboard
2. New widget appears with data loaded from device_data table

## User Experience

### For End Users (Non-Admin)
- **Read-Only Dashboard**: Cannot modify layout or add/remove widgets
- **Data Updates**: Sees real-time data updates every 5 seconds
- **Interactive Charts**: Can expand charts to full-screen modal
- **Time Range Selection**: Can filter data by 1 day, 7 days, or 1 month

### For Admin Users
- **Full Control**: Can add, remove, and rearrange widgets
- **Widget Creation**: Can create custom widgets with any property combinations
- **Layout Management**: Drag-and-drop interface for repositioning
- **Company-Wide**: Changes affect all users in the company

## Technical Benefits

1. **Scalability**: Adding new device types or properties requires NO code changes
2. **Flexibility**: Admins can create any chart combination without developer intervention
3. **Maintainability**: Single component handles all line charts
4. **Consistency**: Same data loading logic for all widgets
5. **Performance**: Efficient queries with proper indexing on device_data JSONB fields

## Database Queries Performance

### Indexes Recommended
```sql
-- On device_data table
CREATE INDEX idx_device_data_created_at ON device_data(created_at DESC);
CREATE INDEX idx_device_data_device_id ON device_data(device_id);
CREATE INDEX idx_device_data_gin ON device_data USING GIN(data);

-- On device table
CREATE INDEX idx_device_company_id ON device(company_id);
CREATE INDEX idx_device_device_type_id ON device(device_type_id);
```

## API Endpoints Summary

### Widget Management
- `GET /api/widgets/user-dashboard` - Get user's company dashboard
- `GET /api/widgets/device-types` - List available device types (admin only)
- `GET /api/widgets/available-widgets` - Get widget types and properties for device type
- `POST /api/widgets/create-widget` - Create new custom widget (admin only)
- `DELETE /api/widgets/remove-widget/:layoutId` - Remove widget (admin only)
- `POST /api/widgets/update-layout` - Save widget positions (admin only)

### Widget Data
- `GET /api/widgets/widget-data/:widgetId` - Get time-series data for widget
  - Query params: `timeRange` (1h, 6h, 24h, 7d, 30d), `limit` (default 100)
- `GET /api/widgets/widget-data/:widgetId/latest` - Get latest values only

## Migration from Old System

### Files Removed
- `frontend/src/components/Charts/OfrChart.tsx` ❌
- `frontend/src/components/Charts/GfrChart.tsx` ❌
- `frontend/src/components/Charts/WfrChart.tsx` ❌
- `frontend/src/components/Dashboard/FlowRateCharts.tsx` ❌
- `frontend/src/components/Dashboard/FractionsChart.tsx` ❌

### Files Modified
- `backend/scripts/seedWidgets.js` - Now queries `device_data_mapping`
- `backend/routes/widgets.js` - Enhanced data loading with proper JSONB queries
- `frontend/src/components/Dashboard/WidgetRenderer.tsx` - Simplified routing
- `frontend/src/components/Dashboard/CustomLineChart.tsx` - Enhanced for multi-series

### Files Added
None - reused existing `CustomLineChart` component

## Testing the System

### 1. Reseed the Database
```bash
cd backend
node scripts/seedWidgets.js
```

### 2. Login as Admin
- Use admin account credentials
- Navigate to dashboard
- Should see 10 default widgets

### 3. Create New Widget
- Click "Add Widget" button
- Select MPFM device type
- Select Line Chart
- Choose 1-3 properties (e.g., TemperatureAvg)
- Create widget
- Widget appears on dashboard with data

### 4. Verify Data Loading
- Check browser console for:
  - `Widget data response:` log showing fetched data
  - `Formatted chart data:` log showing processed data
- Chart should display trend lines for selected properties

### 5. Test as End User
- Login with non-admin account
- Dashboard is read-only
- All charts load properly
- Time range filter works

## Troubleshooting

### Widget Shows "No data available"
1. Check if device_data has entries for the property
2. Verify `device_data.data` JSONB contains the property key
3. Check time range - may need to expand to 7days or 30days
4. Confirm device belongs to user's company

### Widget Creation Fails
1. Verify device_data_mapping has entries for device type
2. Check if MPFM device type exists in device_type table
3. Ensure propertyIds array is not empty
4. Admin user must have proper permissions

### Data Not Updating
1. Check if device_data is being populated
2. Verify refresh interval in widget_types (default 5000ms)
3. Check browser console for API errors
4. Confirm token is valid and not expired

## Future Enhancements

1. **More Widget Types**: Add table widgets, gauge widgets, etc.
2. **Property Calculations**: Support derived properties (e.g., OFR + WFR = Total Flow)
3. **Aggregation Options**: Daily/hourly averages, min/max values
4. **Alert Thresholds**: Visual indicators when values exceed limits
5. **Export Functionality**: Download chart data as CSV/Excel
6. **Widget Templates**: Pre-configured widget sets for common use cases
7. **Multi-Device Comparison**: Compare same property across multiple devices

---

**Last Updated**: 2025-10-30
**Version**: 2.0
**Status**: ✅ Complete and Production Ready
