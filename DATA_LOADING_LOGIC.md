# Widget Data Loading Logic - Complete Explanation

## Problem Overview
The original system was not loading data for custom widgets. All widgets were receiving the same hardcoded `chartData` and `hierarchyChartData` which only contained OFR, WFR, GFR data. Custom widgets with properties like TemperatureAvg were showing empty because no data was being fetched.

## Solution Implemented

### 1. Backend Data Query Logic

#### Widget Data Endpoint: `GET /api/widgets/widget-data/:widgetId`

**Query Flow:**
```
1. Fetch widget definition and data_source_config from database
2. Extract seriesConfig array containing property details
3. For each property in seriesConfig:
   - Get dataSourceProperty (the JSON key in device_data.data column)
   - Query device_data table filtering by:
     * Company ID (for multi-tenancy)
     * Device Type ID (e.g., MPFM = 1)
     * Time range (1h, 6h, 24h, 7d, 30d)
4. Return time-series data grouped by property
```

**SQL Query Example:**
```sql
SELECT
  dd.created_at as timestamp,
  dd.serial_number,
  (dd.data->>'TemperatureAvg')::numeric as value
FROM device_data dd
INNER JOIN device d ON dd.device_id = d.id
WHERE d.company_id = $1
  AND d.device_type_id = $2
  AND dd.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY dd.created_at ASC
LIMIT 100
```

**Database Tables Used:**
- `device_data` - Historical time-series data (JSONB column `data`)
- `device_data_latest` - Latest values for real-time display
- `device` - Device metadata and company association
- `device_data_mapping` - Property definitions with tags and units

**Data Structure in device_data.data (JSONB):**
```json
{
  "GFR": 5432.1,
  "OFR": 3210.5,
  "WFR": 1245.8,
  "TemperatureAvg": 85.3,
  "PressureAvg": 145.2,
  "GVF": 62.5,
  "WLR": 27.9
}
```

### 2. Frontend Data Fetching Logic

#### CustomLineChart Component
**Purpose:** Fetches and displays data for custom widgets based on their configuration

**Fetch Flow:**
```
1. Component mounts with widgetConfig and timeRange props
2. useEffect triggers loadWidgetData()
3. API call to /api/widgets/widget-data/:widgetId
4. Response contains data grouped by property name:
   {
     "TemperatureAvg": {
       "data": [
         { timestamp: "2024-01-01T10:00:00Z", value: 85.3, serialNumber: "MPFM-001" },
         { timestamp: "2024-01-01T10:05:00Z", value: 86.1, serialNumber: "MPFM-001" }
       ],
       "unit": "°C",
       "propertyName": "TemperatureAvg"
     }
   }
5. Data is transformed into Recharts format
6. Chart renders with multiple series if multiple properties selected
```

#### WidgetRenderer Component
**Purpose:** Routes widgets to appropriate rendering components

**Logic:**
```javascript
// Check if this is a custom widget
const isCustomWidget = dsConfig.seriesConfig &&
                       Array.isArray(dsConfig.seriesConfig) &&
                       dsConfig.seriesConfig.length > 0;

// If custom widget with LineChart type
if (isCustomWidget && widget.component === 'LineChart') {
  return <CustomLineChart widgetConfig={widget} timeRange={timeRange} />;
}

// Otherwise, use legacy components
switch (widget.component) {
  case 'FlowRateChart':
    return <FlowRateCharts chartData={chartData} ... />;
  // ... other legacy widgets
}
```

### 3. Data Flow Comparison

#### Old System (Hardcoded):
```
DashboardContent
  └─> Fetches chartData via getDeviceChartDataEnhanced()
      └─> Returns only: GFR, OFR, WFR, GVF, WLR, Pressure, Temperature
          └─> Passed to ALL widgets
              └─> Custom widgets show nothing (wrong data structure)
```

#### New System (Dynamic):
```
DashboardContent
  └─> Loads widget definitions from /api/widgets/user-dashboard
      └─> For each widget:
          ├─> Legacy widgets: Use chartData/hierarchyChartData (old system)
          └─> Custom widgets: CustomLineChart fetches its own data
              └─> Calls /api/widgets/widget-data/:widgetId
                  └─> Returns data for specific properties configured
                      └─> Chart displays with proper values
```

## Backend Query Details

### Device Data Mapping Query
**Purpose:** Get property metadata from device_data_mapping table

```sql
SELECT id, variable_name, variable_tag, unit, data_type
FROM device_data_mapping
WHERE id = $1 AND device_type_id = $2
```

**Example Result:**
```
id: 5
variable_name: TemperatureAvg
variable_tag: TemperatureAvg
unit: °C
data_type: numeric
```

### Time Series Data Query
**Purpose:** Fetch historical data from device_data table

```sql
SELECT
  dd.created_at as timestamp,
  dd.serial_number,
  (dd.data->>'TemperatureAvg')::numeric as value
FROM device_data dd
INNER JOIN device d ON dd.device_id = d.id
WHERE d.company_id = $1
  AND d.device_type_id = $2
  AND dd.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY dd.created_at ASC
LIMIT 100
```

**Query Performance:**
- Uses BTREE index on `device_data(device_id, created_at DESC)`
- Uses GIN index on `device_data(data)` for JSONB queries
- BRIN index on `device_data(created_at)` for time-range queries

### Latest Data Query (for KPI widgets)
**Purpose:** Get most recent values from device_data_latest

```sql
SELECT
  dl.updated_at as timestamp,
  dl.serial_number,
  dl.data->>'TemperatureAvg' as value,
  d.metadata->>'location' as location,
  dt.type_name as device_type
FROM device_latest dl
INNER JOIN device d ON dl.device_id = d.id
INNER JOIN device_type dt ON d.device_type_id = dt.id
WHERE d.company_id = $1
  AND d.device_type_id = $2
ORDER BY dl.updated_at DESC
```

## Data Transformation Pipeline

### Step 1: Backend Response Format
```json
{
  "success": true,
  "data": {
    "TemperatureAvg": {
      "data": [
        { "timestamp": "2024-01-01T10:00:00Z", "serialNumber": "MPFM-001", "value": 85.3 },
        { "timestamp": "2024-01-01T10:05:00Z", "serialNumber": "MPFM-001", "value": 86.1 }
      ],
      "unit": "°C",
      "propertyName": "TemperatureAvg"
    },
    "PressureAvg": {
      "data": [
        { "timestamp": "2024-01-01T10:00:00Z", "serialNumber": "MPFM-001", "value": 145.2 },
        { "timestamp": "2024-01-01T10:05:00Z", "serialNumber": "MPFM-001", "value": 146.8 }
      ],
      "unit": "bar",
      "propertyName": "PressureAvg"
    }
  },
  "config": {
    "deviceTypeId": 1,
    "numberOfSeries": 2,
    "seriesConfig": [...]
  }
}
```

### Step 2: Frontend Transformation to Recharts Format
```javascript
function formatChartData(seriesData) {
  const dataMap = {};

  // For each series (property)
  Object.entries(seriesData).forEach(([seriesName, series]) => {
    // For each data point
    series.data.forEach((point) => {
      const timestamp = new Date(point.timestamp).getTime();

      // Group by timestamp
      if (!dataMap[timestamp]) {
        dataMap[timestamp] = { timestamp };
      }

      // Add value for this series
      dataMap[timestamp][seriesName] = point.value;
    });
  });

  // Convert to array and sort by time
  return Object.values(dataMap).sort((a, b) => a.timestamp - b.timestamp);
}
```

### Step 3: Final Recharts Data Format
```javascript
[
  {
    timestamp: 1704106800000,
    TemperatureAvg: 85.3,
    PressureAvg: 145.2
  },
  {
    timestamp: 1704107100000,
    TemperatureAvg: 86.1,
    PressureAvg: 146.8
  }
]
```

## Time Range Mapping

| Frontend      | API Parameter | SQL Interval           | Typical Points |
|--------------|---------------|------------------------|----------------|
| 1day         | 24h           | 24 hours               | 100-300        |
| 7days        | 7d            | 7 days                 | 100-300        |
| 1month       | 30d           | 30 days                | 100-300        |

## Auto-Refresh Logic

**DashboardContent.tsx:**
```javascript
useEffect(() => {
  const interval = setInterval(() => {
    // Refresh data every 5 seconds
    loadDeviceFlowRateData();
    loadHierarchyFlowRateData();
  }, 5000);

  return () => clearInterval(interval);
}, [dependencies]);
```

**CustomLineChart.tsx:**
```javascript
useEffect(() => {
  // Load data when widget ID or time range changes
  loadWidgetData();
}, [widgetConfig.widgetId, timeRange]);

// Note: Does NOT auto-refresh. Could be added if needed.
```

## Error Handling

### Backend Errors:
- **404**: Widget not found in database
- **400**: Invalid parameters (missing deviceTypeId, widgetTypeId, or propertyIds)
- **500**: Database query errors or connection issues

### Frontend Errors:
- **Loading State**: Shows spinner while fetching
- **Empty Data**: Shows "No data available for this time range"
- **Network Error**: Shows error message with retry option

## Testing the Data Flow

### 1. Check if data exists in device_data:
```sql
SELECT
  dd.id,
  dd.serial_number,
  dd.created_at,
  dd.data->>'TemperatureAvg' as temp,
  dd.data->>'PressureAvg' as pressure
FROM device_data dd
INNER JOIN device d ON dd.device_id = d.id
WHERE d.device_type_id = 1
ORDER BY dd.created_at DESC
LIMIT 10;
```

### 2. Check device_data_mapping entries:
```sql
SELECT * FROM device_data_mapping WHERE device_type_id = 1;
```

### 3. Test widget data endpoint:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/widgets/widget-data/WIDGET_UUID?timeRange=24h&limit=100"
```

### 4. Check browser console for:
- Network requests to `/api/widgets/widget-data/:id`
- Response data structure
- Any JavaScript errors in CustomLineChart

## Common Issues and Solutions

### Issue: Widget shows "No data available"
**Causes:**
1. No data in device_data table for selected time range
2. Wrong device_type_id in widget configuration
3. Property name mismatch between device_data_mapping and device_data.data

**Solution:**
```sql
-- Check if data exists
SELECT COUNT(*) FROM device_data dd
INNER JOIN device d ON dd.device_id = d.id
WHERE d.device_type_id = 1
  AND dd.created_at >= NOW() - INTERVAL '24 hours';

-- Check JSONB keys in device_data
SELECT DISTINCT jsonb_object_keys(data) as keys
FROM device_data
LIMIT 1;
```

### Issue: Widget shows wrong data or zeros
**Causes:**
1. Type casting issue ((dd.data->>'Property')::numeric fails)
2. NULL values in device_data.data
3. Wrong variable_tag in device_data_mapping

**Solution:**
- Ensure variable_tag matches exact key in device_data.data JSONB
- Use COALESCE for NULL handling: `COALESCE((dd.data->>'Temp')::numeric, 0)`

## Performance Optimization

### Current Limits:
- **Max data points per query**: 100
- **Auto-refresh interval**: 5 seconds (legacy widgets only)
- **Query timeout**: 30 seconds

### Optimization Strategies:
1. **Pagination**: Add offset/limit parameters for large datasets
2. **Aggregation**: Use time bucketing for long time ranges
3. **Caching**: Cache widget data for 1-2 seconds to reduce DB load
4. **Indexes**: Ensure proper indexes on frequently queried columns

## Future Enhancements

1. **Real-time Updates**: WebSocket support for live data streaming
2. **Aggregation Options**: Min, Max, Avg, Sum for time buckets
3. **Multiple Devices**: Select multiple devices per widget
4. **Data Export**: CSV/Excel export functionality
5. **Alert Thresholds**: Configure min/max thresholds with visual indicators
