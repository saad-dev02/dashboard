# Widget Creation System - Implementation Complete

## Overview
Implemented a complete widget management system that allows company admins to create custom dashboard widgets based on device properties stored in `device_data_mapping` table, while regular users see a read-only view of their company's configured dashboard.

## Features Implemented

### 1. Admin Widget Creation Flow
- **Step 1**: Select Device Type (e.g., MPFM, Pressure Sensor)
- **Step 2**: Select Widget Type (e.g., Line Chart, KPI Card, Donut Chart)
- **Step 3**: Select Properties to Display (from `device_data_mapping` table)
- **Optional**: Provide custom widget name

### 2. User Dashboard Experience
- **Admin Users**: See "Add Widget" button to create new widgets
- **Regular Users**: See read-only dashboard with widgets configured by their company admin
- **Real-time Updates**: Widgets refresh automatically every 5 seconds
- **Time Range Selection**: Users can change time range (Today, Last 7 Days, Last Month)

### 3. Data Flow
1. Admin selects device type → System loads available widget types and properties from `device_data_mapping`
2. Admin selects properties (e.g., TemperatureAvg) → System stores property IDs in widget definition
3. Widget is created and automatically added to company dashboard
4. System fetches data from `device_data` and `device_data_latest` tables using property tags
5. All users in the company see the new widget on their dashboard

## Technical Implementation

### Backend Changes

#### `/backend/routes/widgets.js`
- **Updated `POST /api/widgets/create-widget`**: Now accepts `propertyIds` array instead of property names
- Fetches property details from `device_data_mapping` using property IDs
- Stores complete property configuration in `data_source_config` JSONB column
- Automatically adds widget to company dashboard upon creation

- **Updated `GET /api/widgets/widget-data/:widgetId`**: Fetches data using property tags from `device_data_mapping`
- Returns time-series data grouped by property with units and metadata

- **Existing endpoints remain functional**:
  - `GET /api/widgets/user-dashboard` - Fetches dashboard for logged-in user
  - `GET /api/widgets/device-types` - Lists available device types
  - `GET /api/widgets/available-widgets` - Lists widget types and properties for a device type

### Frontend Changes

#### New Component: `/frontend/src/components/Dashboard/AddWidgetModal.tsx`
- **3-Step Wizard Interface**:
  1. Device Type Selection
  2. Widget Type Selection
  3. Property Selection (multi-select)
- Progress indicator showing current step
- Form validation at each step
- Success/error handling with user feedback
- Responsive design for mobile and desktop

#### Updated Component: `/frontend/src/components/Dashboard/DashboardContent.tsx`
- Added "Add Widget" button visible only to admin users
- Integrated `AddWidgetModal` component
- Added user role detection to show/hide admin features
- Auto-refresh dashboard widgets after new widget creation

#### Updated Service: `/frontend/src/services/api.ts`
- Fixed dashboard and widget endpoints to use correct API routes
- Ensured compatibility with backend widget system

## Database Schema

### `device_data_mapping` Table Structure
```sql
CREATE TABLE device_data_mapping (
  id BIGSERIAL PRIMARY KEY,
  device_type_id BIGINT NOT NULL REFERENCES device_type(id),
  variable_name TEXT NOT NULL,          -- Display name (e.g., "TemperatureAvg")
  variable_tag TEXT,                    -- JSON path in device_data (e.g., "TemperatureAvg")
  data_type TEXT,                       -- Data type (e.g., "numeric", "text")
  unit TEXT,                            -- Unit of measurement (e.g., "°C", "bar")
  ui_order INTEGER DEFAULT 100,         -- Display order in UI
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `widget_definitions` Table - data_source_config Format
```json
{
  "deviceTypeId": 1,
  "numberOfSeries": 1,
  "seriesConfig": [
    {
      "propertyId": 5,
      "propertyName": "TemperatureAvg",
      "displayName": "TemperatureAvg",
      "dataSourceProperty": "TemperatureAvg",
      "unit": "°C",
      "dataType": "numeric"
    }
  ]
}
```

## Usage Examples

### Admin Creating a Widget
1. Admin logs in and navigates to dashboard
2. Clicks "Add Widget" button
3. Selects "MPFM" as device type
4. Selects "Line Chart" as widget type
5. Selects "TemperatureAvg" property
6. Optionally enters custom name "Temperature Monitor"
7. Clicks "Create Widget"
8. Widget appears on dashboard immediately

### Regular User Experience
1. User logs in to their company account
2. Sees dashboard with all widgets configured by admin
3. Can change time range to view different periods
4. Cannot add, remove, or modify widgets
5. Widgets update automatically every 5 seconds

## API Endpoints Summary

### Widget Management
- `GET /api/widgets/user-dashboard` - Get company dashboard with widgets
- `GET /api/widgets/device-types` - List available device types (admin only)
- `GET /api/widgets/available-widgets?deviceTypeId=X` - List widget types and properties
- `POST /api/widgets/create-widget` - Create new widget (admin only)
- `GET /api/widgets/widget-data/:widgetId` - Fetch widget data

### Request Example
```json
POST /api/widgets/create-widget
{
  "deviceTypeId": 1,
  "widgetTypeId": "uuid-of-line-chart",
  "propertyIds": [5, 7, 9],
  "displayName": "Custom Temperature Chart"
}
```

### Response Example
```json
{
  "success": true,
  "data": {
    "widgetId": "new-widget-uuid",
    "dataSourceConfig": { ... },
    "widgetName": "Custom Temperature Chart"
  },
  "message": "Widget created and added to dashboard successfully"
}
```

## Security & Permissions
- ✅ Only admin users can create, modify, or delete widgets
- ✅ Regular users have read-only access to company dashboard
- ✅ All API endpoints protected with JWT authentication
- ✅ Company-level data isolation (users only see their company's data)
- ✅ Input validation on all endpoints

## Testing
To test the complete flow:
1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm run dev`
3. Login as admin (role='admin' in database)
4. Click "Add Widget" button
5. Follow wizard to create widget
6. Verify widget appears on dashboard
7. Login as regular user
8. Verify they see the widget but cannot add new ones

## Build Status
✅ Frontend build successful (1,034 KB bundle)
✅ All TypeScript compilation errors resolved
✅ No breaking changes to existing functionality

## Future Enhancements
- Widget editing capability for admins
- Widget reordering/repositioning (drag & drop)
- Widget templates library
- Export/import dashboard configurations
- Widget sharing between companies
