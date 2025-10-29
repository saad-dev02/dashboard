# Widget System API - Summary

## Overview
The widget system has been completely restructured to support company-specific dashboards with customizable widgets based on device types and their properties.

## Key Concepts

### User Roles
- **Normal User**: Views the dashboard configured by their company admin
- **Admin User**: Can create widgets, configure dashboard layout, and manage company dashboard

### Data Flow
1. Admin selects a device type (e.g., MPFM)
2. System shows available widget types (Line Chart, KPI, Donut Chart, Map) and device properties
3. Admin creates a custom widget by selecting:
   - Widget type (e.g., Line Chart)
   - Number of properties (e.g., 2)
   - Specific properties (e.g., GVF, WLR)
   - Display names for each property
4. Widget is created with `data_source_config` containing:
   - `deviceTypeId`
   - `seriesConfig` array with property mappings from `device_data_mapping`
5. When widget loads data, it uses `dataSourceProperty` (variable_tag) from `device_data_mapping`
6. Data is fetched from `device_data` or `device_latest` tables

---

## API Endpoints

### 1. Get User Dashboard
**GET** `/api/widgets/user-dashboard`

Returns the dashboard for the logged-in user's company.

**Response:**
```json
{
  "success": true,
  "data": {
    "dashboard": {
      "id": "uuid",
      "name": "MPFM Production Dashboard",
      "description": "Main production dashboard",
      "gridConfig": {...},
      "version": 1,
      "companyName": "Saher Flow",
      "canEdit": true
    },
    "widgets": [...]
  }
}
```

---

### 2. Get Device Types (Admin Only)
**GET** `/api/widgets/device-types`

Returns all device types for widget creation.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "typeName": "MPFM",
      "logo": "/mpfm.png"
    }
  ]
}
```

---

### 3. Get Available Widgets (Admin Only)
**GET** `/api/widgets/available-widgets?deviceTypeId=1`

Returns available widget types and properties for a device type.

**Response:**
```json
{
  "success": true,
  "data": {
    "deviceType": {
      "id": 1,
      "type_name": "MPFM"
    },
    "widgetTypes": [
      {
        "id": "uuid",
        "name": "line_chart",
        "componentName": "FlowRateChart",
        "displayName": "Line Chart"
      }
    ],
    "properties": [
      {
        "id": 1,
        "name": "Temperature",
        "tag": "TempAVG",
        "dataType": "float",
        "unit": "°C",
        "order": 1
      }
    ]
  }
}
```

---

### 4. Create Widget (Admin Only)
**POST** `/api/widgets/create-widget`

Creates a custom widget by selecting device type, widget type, and properties.

**Request Body:**
```json
{
  "deviceTypeId": 1,
  "widgetTypeId": "uuid",
  "properties": [
    {
      "propertyName": "Temperature",
      "displayName": "Temperature Chart"
    },
    {
      "propertyName": "Pressure",
      "displayName": "Pressure Chart"
    }
  ],
  "displayName": "Temperature and Pressure Monitor"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "widgetId": "uuid",
    "dataSourceConfig": {
      "deviceTypeId": 1,
      "numberOfSeries": 2,
      "seriesConfig": [
        {
          "propertyName": "Temperature",
          "displayName": "Temperature Chart",
          "dataSourceProperty": "TempAVG",
          "unit": "°C",
          "dataType": "float"
        },
        {
          "propertyName": "Pressure",
          "displayName": "Pressure Chart",
          "dataSourceProperty": "PressureAVG",
          "unit": "bar",
          "dataType": "float"
        }
      ]
    }
  }
}
```

---

### 5. Add Widget to Dashboard (Admin Only)
**POST** `/api/widgets/add-to-dashboard`

Adds a widget to the company dashboard.

**Request Body:**
```json
{
  "widgetDefinitionId": "uuid",
  "layoutConfig": {
    "x": 0,
    "y": 0,
    "w": 4,
    "h": 3,
    "minW": 2,
    "minH": 2,
    "static": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "layoutId": "uuid",
    "dashboardId": "uuid"
  }
}
```

---

### 6. Update Widget Layout (Admin Only)
**POST** `/api/widgets/update-layout`

Updates widget positions and sizes on dashboard (drag-drop).

**Request Body:**
```json
{
  "layouts": [
    {
      "layoutId": "uuid",
      "layoutConfig": {
        "x": 0,
        "y": 0,
        "w": 6,
        "h": 4,
        "minW": 2,
        "minH": 2,
        "static": false
      }
    }
  ]
}
```

---

### 7. Remove Widget (Admin Only)
**DELETE** `/api/widgets/remove-widget/:layoutId`

Removes a widget from the dashboard.

---

### 8. Get Widget Historical Data
**GET** `/api/widgets/widget-data/:widgetId?limit=100&timeRange=24h`

Returns historical data for a widget from `device_data` table.

**Query Parameters:**
- `limit`: Number of records (default: 100)
- `timeRange`: 1h, 6h, 24h, 7d, 30d (default: 24h)

**Response:**
```json
{
  "success": true,
  "data": {
    "Temperature Chart": [
      {
        "timestamp": "2024-10-29T10:00:00Z",
        "serialNumber": "MPFM001",
        "value": 25.5
      }
    ],
    "Pressure Chart": [...]
  },
  "config": {...}
}
```

---

### 9. Get Widget Latest Data
**GET** `/api/widgets/widget-data/:widgetId/latest`

Returns latest data for a widget from `device_latest` table with aggregation.

**Response:**
```json
{
  "success": true,
  "data": {
    "Temperature Chart": {
      "latest": [...],
      "aggregatedValue": 25.3,
      "count": 10,
      "unit": "°C"
    },
    "Pressure Chart": {...}
  },
  "config": {...}
}
```

---

## Database Structure

### widget_definitions.data_source_config
```json
{
  "deviceTypeId": 1,
  "numberOfSeries": 2,
  "seriesConfig": [
    {
      "propertyName": "Temperature",
      "displayName": "Temp Chart",
      "dataSourceProperty": "TempAVG",
      "unit": "°C",
      "dataType": "float"
    }
  ]
}
```

### Key Points
- `propertyName`: User-facing property name from device_data_mapping.variable_name
- `displayName`: Custom name given by admin
- `dataSourceProperty`: Actual database field from device_data_mapping.variable_tag
- When loading data, API uses `dataSourceProperty` to query device_data/device_latest

---

## Changes from Previous System

### Removed
- Custom widget creation without device type context
- Hardcoded widget configurations
- Separate fractions_chart widget type (now handled as line_chart with 2 series)
- Dashboard creation by users (now one dashboard per company)
- Direct widget definition updates

### Added
- Device type-based widget creation
- Property selection from device_data_mapping
- Multi-series support in single widgets
- Company-specific dashboard access
- Admin-only widget management
- Automatic property mapping from device_data_mapping

### Modified
- `/api/widgets/dashboard/:dashboardId` → `/api/widgets/user-dashboard`
- `/api/widgets/definitions` (POST) → `/api/widgets/create-widget`
- `/api/widgets/dashboard/:dashboardId/widget` → `/api/widgets/add-to-dashboard`
- `/api/widgets/data/:widgetId` → `/api/widgets/widget-data/:widgetId`
