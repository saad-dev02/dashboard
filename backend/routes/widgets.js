// routes/widgets.js
const express = require('express');
const router = express.Router();
const database = require('../config/database');

// Import the protect middleware function (adjust if your middleware uses a different name)
const { protect } = require('../middleware/auth');

// Runtime sanity check (temporary; safe to keep)
if (typeof protect !== 'function') {
  console.error('ERROR: protect middleware is not a function. Check ../middleware/auth.js export.');
  throw new Error('Auth middleware not found (protect)');
}

// GET /api/widgets/dashboard/:dashboardId
router.get('/dashboard/:dashboardId', protect, async (req, res) => {
  try {
    const { dashboardId } = req.params;
    const userId = req.user.id;

    const dashboardQuery = `
      SELECT d.*
      FROM dashboards d
      WHERE d.id = $1
        AND (d.created_by = $2 OR d.is_active = true)
    `;

    const dashboardResult = await database.query(dashboardQuery, [dashboardId, userId]);

    if (dashboardResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dashboard not found'
      });
    }

    const dashboard = dashboardResult.rows[0];

    const widgetsQuery = `
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
    `;

    const widgetsResult = await database.query(widgetsQuery, [dashboardId]);

    console.log(`[WIDGET SYSTEM] Loaded dashboard ${dashboardId} with ${widgetsResult.rows.length} widgets from database`);
    widgetsResult.rows.forEach((w, idx) => {
      console.log(`  [${idx + 1}] ${w.widget_name} (${w.component_name}) - Layout: x=${w.layout_config?.x}, y=${w.layout_config?.y}, w=${w.layout_config?.w}, h=${w.layout_config?.h}`);
    });

    res.json({
      success: true,
      data: {
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          description: dashboard.description,
          gridConfig: dashboard.grid_config,
          version: dashboard.version
        },
        widgets: widgetsResult.rows.map(widget => ({
          layoutId: widget.layout_id,
          widgetId: widget.widget_id,
          name: widget.widget_name,
          description: widget.widget_description,
          type: widget.widget_type,
          component: widget.component_name,
          layoutConfig: widget.layout_config,
          dataSourceConfig: widget.data_source_config,
          instanceConfig: widget.instance_config,
          defaultConfig: widget.widget_default_config,
          displayOrder: widget.display_order
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard',
      error: error.message
    });
  }
});

// GET /api/widgets/dashboards
router.get('/dashboards', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT
        d.*,
        COUNT(dl.id) as widget_count
      FROM dashboards d
      LEFT JOIN dashboard_layouts dl ON d.id = dl.dashboard_id
      WHERE d.created_by = $1 OR d.is_active = true
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `;

    const result = await database.query(query, [userId]);

    res.json({
      success: true,
      data: result.rows.map(dashboard => ({
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        version: dashboard.version,
        isActive: dashboard.is_active,
        widgetCount: parseInt(dashboard.widget_count, 10),
        createdAt: dashboard.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching dashboards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboards',
      error: error.message
    });
  }
});

// GET /api/widgets/types
router.get('/types', protect, async (req, res) => {
  try {
    const query = 'SELECT * FROM widget_types ORDER BY name';
    const result = await database.query(query);

    res.json({
      success: true,
      data: result.rows.map(type => ({
        id: type.id,
        name: type.name,
        componentName: type.component_name,
        defaultConfig: type.default_config
      }))
    });
  } catch (error) {
    console.error('Error fetching widget types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget types',
      error: error.message
    });
  }
});

// POST /api/widgets/dashboard/:dashboardId/layout
// Update widget layout for a dashboard
router.post('/dashboard/:dashboardId/layout', protect, async (req, res) => {
  const client = await database.pool.connect();
  try {
    const { dashboardId } = req.params;
    const { layouts } = req.body; // Array of { layoutId, layoutConfig: { x, y, w, h, minW, minH, static } }

    if (!Array.isArray(layouts)) {
      return res.status(400).json({
        success: false,
        message: 'layouts must be an array'
      });
    }

    await client.query('BEGIN');

    console.log(`[WIDGET SYSTEM] Updating ${layouts.length} widget layouts for dashboard ${dashboardId}`);

    for (const layout of layouts) {
      const { layoutId, layoutConfig } = layout;

      const result = await client.query(`
        UPDATE dashboard_layouts
        SET layout_config = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND dashboard_id = $3
        RETURNING id
      `, [JSON.stringify(layoutConfig), layoutId, dashboardId]);

      if (result.rows.length > 0) {
        console.log(`  Updated layout ${layoutId}: x=${layoutConfig.x}, y=${layoutConfig.y}, w=${layoutConfig.w}, h=${layoutConfig.h}`);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Widget layouts updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating widget layouts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update widget layouts',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// POST /api/widgets/dashboard/:dashboardId/widget
// Add a new widget to a dashboard
router.post('/dashboard/:dashboardId/widget', protect, async (req, res) => {
  const client = await database.pool.connect();
  try {
    const { dashboardId } = req.params;
    const { widgetDefinitionId, layoutConfig, instanceConfig, displayOrder } = req.body;

    if (!widgetDefinitionId) {
      return res.status(400).json({
        success: false,
        message: 'widgetDefinitionId is required'
      });
    }

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO dashboard_layouts (
        dashboard_id,
        widget_definition_id,
        layout_config,
        instance_config,
        display_order
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      dashboardId,
      widgetDefinitionId,
      JSON.stringify(layoutConfig || { x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 1, static: false }),
      JSON.stringify(instanceConfig || {}),
      displayOrder || 0
    ]);

    await client.query('COMMIT');

    console.log(`[WIDGET SYSTEM] Added widget ${widgetDefinitionId} to dashboard ${dashboardId}`);

    res.json({
      success: true,
      data: {
        layoutId: result.rows[0].id
      },
      message: 'Widget added successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding widget:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add widget',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// DELETE /api/widgets/dashboard/:dashboardId/layout/:layoutId
// Remove a widget from a dashboard
router.delete('/dashboard/:dashboardId/layout/:layoutId', protect, async (req, res) => {
  try {
    const { dashboardId, layoutId } = req.params;

    const result = await database.query(`
      DELETE FROM dashboard_layouts
      WHERE id = $1 AND dashboard_id = $2
      RETURNING id
    `, [layoutId, dashboardId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Widget layout not found'
      });
    }

    console.log(`[WIDGET SYSTEM] Removed widget layout ${layoutId} from dashboard ${dashboardId}`);

    res.json({
      success: true,
      message: 'Widget removed successfully'
    });
  } catch (error) {
    console.error('Error removing widget:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove widget',
      error: error.message
    });
  }
});

// GET /api/widgets/definitions
// Get all available widget definitions
router.get('/definitions', protect, async (req, res) => {
  try {
    const query = `
      SELECT
        wd.id,
        wd.name,
        wd.description,
        wd.data_source_config,
        wt.name as widget_type,
        wt.component_name,
        wt.default_config
      FROM widget_definitions wd
      INNER JOIN widget_types wt ON wd.widget_type_id = wt.id
      ORDER BY wd.name
    `;

    const result = await database.query(query);

    res.json({
      success: true,
      data: result.rows.map(def => ({
        id: def.id,
        name: def.name,
        description: def.description,
        dataSourceConfig: def.data_source_config,
        widgetType: def.widget_type,
        componentName: def.component_name,
        defaultConfig: def.default_config
      }))
    });
  } catch (error) {
    console.error('Error fetching widget definitions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget definitions',
      error: error.message
    });
  }
});

// GET /api/widgets/device-types
// Get all device types
router.get('/device-types', protect, async (req, res) => {
  try {
    const result = await database.query('SELECT id, type_name, logo FROM device_type ORDER BY type_name');

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching device types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device types',
      error: error.message
    });
  }
});

// GET /api/widgets/device-types/:deviceTypeId/properties
// Get available properties for a device type from device_data_mapping
router.get('/device-types/:deviceTypeId/properties', protect, async (req, res) => {
  try {
    const { deviceTypeId } = req.params;

    const result = await database.query(`
      SELECT
        id,
        variable_name,
        variable_tag,
        data_type,
        unit,
        ui_order
      FROM device_data_mapping
      WHERE device_type_id = $1
      ORDER BY ui_order, variable_name
    `, [deviceTypeId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching device properties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device properties',
      error: error.message
    });
  }
});

// POST /api/widgets/definitions
// Create a new widget definition with device type and property mapping
router.post('/definitions', protect, async (req, res) => {
  try {
    const {
      name,
      description,
      widgetTypeId,
      deviceTypeId,
      propertyName,
      displayName,
      numberOfSeries,
      seriesConfig,
      chartConfig
    } = req.body;
    const userId = req.user.id;

    if (!name || !widgetTypeId) {
      return res.status(400).json({
        success: false,
        message: 'name and widgetTypeId are required'
      });
    }

    let dataSourceConfig = {};

    if (deviceTypeId && propertyName) {
      const mappingResult = await database.query(`
        SELECT variable_tag, unit, data_type
        FROM device_data_mapping
        WHERE device_type_id = $1 AND variable_name = $2
      `, [deviceTypeId, propertyName]);

      if (mappingResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Property ${propertyName} not found for device type ${deviceTypeId}`
        });
      }

      const mapping = mappingResult.rows[0];

      dataSourceConfig = {
        deviceTypeId: parseInt(deviceTypeId),
        propertyName: propertyName,
        dataSourceProperty: mapping.variable_tag,
        displayName: displayName || propertyName,
        unit: mapping.unit,
        dataType: mapping.data_type,
        numberOfSeries: numberOfSeries || 1,
        seriesConfig: seriesConfig || [],
        chartConfig: chartConfig || {}
      };
    } else if (req.body.dataSourceConfig) {
      dataSourceConfig = req.body.dataSourceConfig;
    }

    const result = await database.query(`
      INSERT INTO widget_definitions (
        name,
        description,
        widget_type_id,
        data_source_config,
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      name,
      description || '',
      widgetTypeId,
      JSON.stringify(dataSourceConfig),
      userId
    ]);

    console.log(`[WIDGET SYSTEM] Created widget definition: ${name}`);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        dataSourceConfig
      },
      message: 'Widget definition created successfully'
    });
  } catch (error) {
    console.error('Error creating widget definition:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create widget definition',
      error: error.message
    });
  }
});

// PUT /api/widgets/definitions/:id
// Update widget definition (for changing units, titles, etc.)
router.put('/definitions/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, dataSourceConfig } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }

    if (dataSourceConfig) {
      updates.push(`data_source_config = $${paramCount++}`);
      values.push(JSON.stringify(dataSourceConfig));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await database.query(`
      UPDATE widget_definitions
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Widget definition not found'
      });
    }

    console.log(`[WIDGET SYSTEM] Updated widget definition ${id}`);

    res.json({
      success: true,
      message: 'Widget definition updated successfully'
    });
  } catch (error) {
    console.error('Error updating widget definition:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update widget definition',
      error: error.message
    });
  }
});

// GET /api/widgets/data/:widgetId
// Get widget data based on its configuration
router.get('/data/:widgetId', protect, async (req, res) => {
  try {
    const { widgetId } = req.params;
    const { limit = 100, timeRange = '24h' } = req.query;
    const companyId = req.user.company_id;

    const widgetResult = await database.query(`
      SELECT
        wd.data_source_config,
        wt.component_name
      FROM widget_definitions wd
      INNER JOIN widget_types wt ON wd.widget_type_id = wt.id
      WHERE wd.id = $1
    `, [widgetId]);

    if (widgetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Widget not found'
      });
    }

    const widget = widgetResult.rows[0];
    const dataSourceConfig = widget.data_source_config;

    if (!dataSourceConfig.dataSourceProperty) {
      return res.json({
        success: true,
        data: [],
        message: 'No data source property configured'
      });
    }

    let timeFilter = '';
    if (timeRange === '1h') timeFilter = "AND dd.created_at >= NOW() - INTERVAL '1 hour'";
    else if (timeRange === '6h') timeFilter = "AND dd.created_at >= NOW() - INTERVAL '6 hours'";
    else if (timeRange === '24h') timeFilter = "AND dd.created_at >= NOW() - INTERVAL '24 hours'";
    else if (timeRange === '7d') timeFilter = "AND dd.created_at >= NOW() - INTERVAL '7 days'";
    else if (timeRange === '30d') timeFilter = "AND dd.created_at >= NOW() - INTERVAL '30 days'";

    let query = '';
    let params = [];

    if (dataSourceConfig.deviceTypeId) {
      query = `
        SELECT
          dd.created_at as timestamp,
          dd.serial_number,
          dd.data->>$1 as value,
          d.metadata->>'location' as location
        FROM device_data dd
        INNER JOIN device d ON dd.device_id = d.id
        WHERE d.company_id = $2
          AND d.device_type_id = $3
          ${timeFilter}
        ORDER BY dd.created_at DESC
        LIMIT $4
      `;
      params = [dataSourceConfig.dataSourceProperty, companyId, dataSourceConfig.deviceTypeId, parseInt(limit)];
    } else {
      query = `
        SELECT
          dd.created_at as timestamp,
          dd.serial_number,
          dd.data->>$1 as value
        FROM device_data dd
        INNER JOIN device d ON dd.device_id = d.id
        WHERE d.company_id = $2
          ${timeFilter}
        ORDER BY dd.created_at DESC
        LIMIT $3
      `;
      params = [dataSourceConfig.dataSourceProperty, companyId, parseInt(limit)];
    }

    const dataResult = await database.query(query, params);

    const formattedData = dataResult.rows.map(row => ({
      timestamp: row.timestamp,
      serialNumber: row.serial_number,
      value: parseFloat(row.value) || 0,
      location: row.location
    }));

    res.json({
      success: true,
      data: formattedData,
      config: dataSourceConfig
    });
  } catch (error) {
    console.error('Error fetching widget data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget data',
      error: error.message
    });
  }
});

// GET /api/widgets/data/:widgetId/latest
// Get latest widget data from device_latest
router.get('/data/:widgetId/latest', protect, async (req, res) => {
  try {
    const { widgetId } = req.params;
    const companyId = req.user.company_id;

    const widgetResult = await database.query(`
      SELECT
        wd.data_source_config,
        wt.component_name
      FROM widget_definitions wd
      INNER JOIN widget_types wt ON wd.widget_type_id = wt.id
      WHERE wd.id = $1
    `, [widgetId]);

    if (widgetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Widget not found'
      });
    }

    const widget = widgetResult.rows[0];
    const dataSourceConfig = widget.data_source_config;

    if (!dataSourceConfig.dataSourceProperty) {
      return res.json({
        success: true,
        data: null,
        message: 'No data source property configured'
      });
    }

    let query = '';
    let params = [];

    if (dataSourceConfig.deviceTypeId) {
      query = `
        SELECT
          dl.updated_at as timestamp,
          dl.serial_number,
          dl.data->>$1 as value,
          d.metadata->>'location' as location,
          dt.type_name as device_type
        FROM device_latest dl
        INNER JOIN device d ON dl.device_id = d.id
        INNER JOIN device_type dt ON d.device_type_id = dt.id
        WHERE d.company_id = $2
          AND d.device_type_id = $3
        ORDER BY dl.updated_at DESC
      `;
      params = [dataSourceConfig.dataSourceProperty, companyId, dataSourceConfig.deviceTypeId];
    } else {
      query = `
        SELECT
          dl.updated_at as timestamp,
          dl.serial_number,
          dl.data->>$1 as value,
          d.metadata->>'location' as location,
          dt.type_name as device_type
        FROM device_latest dl
        INNER JOIN device d ON dl.device_id = d.id
        INNER JOIN device_type dt ON d.device_type_id = dt.id
        WHERE d.company_id = $2
        ORDER BY dl.updated_at DESC
      `;
      params = [dataSourceConfig.dataSourceProperty, companyId];
    }

    const dataResult = await database.query(query, params);

    const formattedData = dataResult.rows.map(row => ({
      timestamp: row.timestamp,
      serialNumber: row.serial_number,
      value: parseFloat(row.value) || 0,
      location: row.location,
      deviceType: row.device_type
    }));

    let aggregatedValue = null;
    if (formattedData.length > 0) {
      const sum = formattedData.reduce((acc, item) => acc + item.value, 0);
      aggregatedValue = sum / formattedData.length;
    }

    res.json({
      success: true,
      data: {
        latest: formattedData,
        aggregatedValue,
        count: formattedData.length,
        unit: dataSourceConfig.unit,
        displayName: dataSourceConfig.displayName
      },
      config: dataSourceConfig
    });
  } catch (error) {
    console.error('Error fetching latest widget data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch latest widget data',
      error: error.message
    });
  }
});

// POST /api/widgets/dashboards
// Create a new dashboard
router.post('/dashboards', protect, async (req, res) => {
  try {
    const { name, description, gridConfig } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'name is required'
      });
    }

    const result = await database.query(`
      INSERT INTO dashboards (name, description, grid_config, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [
      name,
      description || '',
      JSON.stringify(gridConfig || {
        cols: 12,
        rowHeight: 100,
        margin: [10, 10],
        breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 },
        containerPadding: [10, 10]
      }),
      userId
    ]);

    console.log(`[WIDGET SYSTEM] Created dashboard: ${name}`);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id
      },
      message: 'Dashboard created successfully'
    });
  } catch (error) {
    console.error('Error creating dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create dashboard',
      error: error.message
    });
  }
});

module.exports = router;
