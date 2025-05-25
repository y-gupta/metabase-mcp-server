# Metabase MCP Server

**Author**: Hyeongjun Yu ([@hyeongjun-dev](https://github.com/hyeongjun-dev))

[![smithery badge](https://smithery.ai/badge/@hyeongjun-dev/metabase-mcp-server)](https://smithery.ai/server/@hyeongjun-dev/metabase-mcp-server)

A Model Context Protocol server that integrates AI assistants with Metabase analytics platform.

## Overview

This TypeScript-based MCP server provides seamless integration with the Metabase API, enabling AI assistants to directly interact with your analytics data. Designed for Claude and other MCP-compatible AI assistants, this server acts as a bridge between your analytics platform and conversational AI.

### Key Features

- **Resource Access**: Navigate Metabase resources via intuitive `metabase://` URIs
- **Two Authentication Methods**: Support for both session-based and API key authentication
- **Structured Data Access**: JSON-formatted responses for easy consumption by AI assistants
- **Comprehensive Logging**: Detailed logging for easy debugging and monitoring
- **Error Handling**: Robust error handling with clear error messages

## Available Tools

The server exposes the following tools for AI assistants:

- `list_dashboards`: Retrieve all available dashboards in your Metabase instance
- `list_cards`: Get all saved questions/cards in Metabase
- `list_databases`: View all connected database sources
- `execute_card`: Run saved questions and retrieve results with optional parameters
- `get_dashboard_cards`: Extract all cards from a specific dashboard
- `execute_query`: Execute custom SQL queries against any connected database

## Configuration

The server supports two authentication methods:

### Option 1: Username and Password Authentication

```bash
# Required
METABASE_URL=https://your-metabase-instance.com
METABASE_USER_EMAIL=your_email@example.com
METABASE_PASSWORD=your_password

# Optional
LOG_LEVEL=info # Options: debug, info, warn, error, fatal
```

### Option 2: API Key Authentication (Recommended for Production)

```bash
# Required
METABASE_URL=https://your-metabase-instance.com
METABASE_API_KEY=your_api_key

# Optional
LOG_LEVEL=info # Options: debug, info, warn, error, fatal
```

You can set these environment variables directly or use a `.env` file with [dotenv](https://www.npmjs.com/package/dotenv).

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- An active Metabase instance with appropriate credentials

### Development Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start

# For development with auto-rebuild
npm run watch
```

### Claude Desktop Integration

To use with Claude Desktop, add this server configuration:

**MacOS**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: Edit `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "metabase-mcp-server": {
      "command": "/absolute/path/to/metabase-mcp-server/build/index.js",
      "env": {
        "METABASE_URL": "https://your-metabase-instance.com",
        "METABASE_USER_EMAIL": "your_email@example.com",
        "METABASE_PASSWORD": "your_password"
        // Or alternatively, use API key authentication
        // "METABASE_API_KEY": "your_api_key"
      }
    }
  }
}
```

Alternatively, you can use the Smithery hosted version via npx with JSON configuration:

#### API Key Authentication:

```json
{
  "mcpServers": {
    "metabase-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@smithery/cli@latest",
        "run",
        "@hyeongjun-dev/metabase-mcp-server",
        "--config",
        "{\"metabaseUrl\":\"https://your-metabase-instance.com\",\"metabaseApiKey\":\"your_api_key\",\"metabasePassword\":\"\",\"metabaseUserEmail\":\"\"}"
      ]
    }
  }
}
```

#### Username and Password Authentication:

```json
{
  "mcpServers": {
    "metabase-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@smithery/cli@latest",
        "run",
        "@hyeongjun-dev/metabase-mcp-server",
        "--config",
        "{\"metabaseUrl\":\"https://your-metabase-instance.com\",\"metabaseApiKey\":\"\",\"metabasePassword\":\"your_password\",\"metabaseUserEmail\":\"your_email@example.com\"}"
      ]
    }
  }
}
```

## Debugging

Since MCP servers communicate over stdio, use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for debugging:

```bash
npm run inspector
```

The Inspector will provide a browser-based interface for monitoring requests and responses.

## Docker Support

A Docker image is available for containerized deployment:

```bash
# Build the Docker image
docker build -t metabase-mcp-server .

# Run the container with environment variables
docker run -e METABASE_URL=https://your-metabase.com \
           -e METABASE_API_KEY=your_api_key \
           metabase-mcp-server
```

## Security Considerations

- We recommend using API key authentication for production environments
- Keep your API keys and credentials secure
- Consider using Docker secrets or environment variables instead of hardcoding credentials
- Apply appropriate network security measures to restrict access to your Metabase instance

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## MCP Tool Schemas

This section details the schemas for each MCP tool provided by the server.

### `list_dashboards`

- **Description**: Retrieves all available dashboards in your Metabase instance.
- **Request Schema**:
  - No parameters.
- **Response Schema**:
  - A JSON array of dashboard objects, each with the following properties:
    - `id`: (number) The ID of the dashboard.
    - `name`: (string) The name of the dashboard.
    - `description`: (string | null) The description of the dashboard.
    - `created_at`: (string) ISO 8601 timestamp of when the dashboard was created.
    - `updated_at`: (string) ISO 8601 timestamp of when the dashboard was last updated.
    - `collection_id`: (number | null) The ID of the collection the dashboard belongs to.
    - `archived`: (boolean) Whether the dashboard is archived.

### `list_cards`

- **Description**: Gets all saved questions/cards in Metabase.
- **Request Schema**:
  - No parameters.
- **Response Schema**:
  - A JSON array of card objects, each with the following properties:
    - `id`: (number) The ID of the card.
    - `name`: (string) The name of the card.
    - `description`: (string | null) The description of the card.
    - `display`: (string) How the card is displayed (e.g., "table", "line", "bar").
    - `visualization_settings`: (object) Settings related to the card's visualization.
    - `dataset_query`: (object) The query that defines the card.
    - `created_at`: (string) ISO 8601 timestamp of when the card was created.
    - `updated_at`: (string) ISO 8601 timestamp of when the card was last updated.
    - `collection_id`: (number | null) The ID of the collection the card belongs to.
    - `archived`: (boolean) Whether the card is archived.

### `list_databases`

- **Description**: View all connected database sources.
- **Request Schema**:
  - No parameters.
- **Response Schema**:
  - A JSON array of database objects, each with the following properties:
    - `id`: (number) The ID of the database.
    - `name`: (string) The name of the database.
    - `engine`: (string) The database engine (e.g., "postgres", "mysql", "h2").
    - `is_sample`: (boolean) Whether this is a sample database.
    - `features`: (array of strings) Features supported by this database.
    - `created_at`: (string) ISO 8601 timestamp of when the database connection was configured.
    - `updated_at`: (string) ISO 8601 timestamp of when the database connection was last updated.

### `execute_card`

- **Description**: Run saved questions and retrieve results with optional parameters.
- **Request Schema**:
  - `card_id`: (number, required) The ID of the card to execute.
  - `parameters`: (array of objects, optional) Parameters to pass to the card's query. Each object should have:
    - `type`: (string) The parameter type (e.g., "category", "date", "number").
    - `target`: (array) The target field for the parameter.
    - `value`: (any) The value for the parameter.
- **Response Schema**:
  - A JSON object representing the execution results, typically including:
    - `card_id`: (number) The ID of the executed card.
    - `status`: (string) The status of the query (e.g., "completed").
    - `data`: (object) The actual data returned by the query, usually containing:
      - `rows`: (array of arrays) The data rows.
      - `cols`: (array of objects) Descriptions of the columns.
      - `insights`: (array | null) Any insights generated by Metabase.
    - `database_id`: (number) The ID of the database the query ran against.
    - `started_at`: (string) ISO 8601 timestamp.
    - `ended_at`: (string) ISO 8601 timestamp.
    - `json_query`: (object) The query that was executed.

### `get_dashboard_cards`

- **Description**: Extract all cards from a specific dashboard.
- **Request Schema**:
  - `dashboard_id`: (number, required) The ID of the dashboard.
- **Response Schema**:
  - A JSON object containing:
    - `dashboard_id`: (number) The ID of the dashboard.
    - `cards`: (array of objects) An array of card objects associated with the dashboard. Each card object includes properties like:
      - `id`: (number) The ID of the card on the dashboard (distinct from card's own ID).
      - `card_id`: (number) The actual ID of the card.
      - `row`: (number) Row position on the dashboard.
      - `col`: (number) Column position on the dashboard.
      - `size_x`: (number) Width of the card on the dashboard.
      - `size_y`: (number) Height of the card on the dashboard.
      - `series`: (array) Card series configuration.
      - `visualization_settings`: (object) Visualization settings.
      - `parameter_mappings`: (array) Mappings for dashboard filters.
      - `card`: (object) Detailed information about the card itself (similar to `list_cards` output for one card).

### `execute_query`

- **Description**: Execute custom SQL queries against any connected database.
- **Request Schema**:
  - `database_id`: (number, required) The ID of the database to query.
  - `query`: (string, required) The SQL query to execute.
  - `query_type`: (string, required, default: "native") The type of query, typically "native" for SQL.
- **Response Schema**:
  - A JSON object representing the execution results, typically including:
    - `status`: (string) The status of the query (e.g., "completed", "failed").
    - `database_id`: (number) The ID of the database the query ran against.
    - `started_at`: (string) ISO 8601 timestamp.
    - `ended_at`: (string) ISO 8601 timestamp.
    - `json_query`: (object) The query that was executed.
    - `data`: (object) The actual data returned by the query, usually containing:
      - `rows`: (array of arrays) The data rows.
      - `cols`: (array of objects) Descriptions of the columns.
      - `results_metadata`: (object) Metadata about the results.
    - `error`: (string | null) Error message if the query failed.

## Proposal for AI Exploration of Metabase Data

To effectively leverage the Metabase MCP server for data analysis and visualization, an AI assistant can adopt a systematic approach to explore and understand the available data. This process involves discovering databases, understanding their schemas, and sampling their content.

1.  **Discover Available Databases**:
    The AI can begin by using the existing `list_databases` tool. This tool provides a list of all databases connected to the Metabase instance, including their IDs, names, and types. This initial step helps the AI identify potential data sources to explore further.

2.  **Understand Database Structure (Proposed New Tool: `get_database_schema`)**:
    Once a database of interest is identified (via its `database_id`), the AI needs to understand its structure. We propose a new MCP tool: `get_database_schema`.
    *   **Tool Name**: `get_database_schema`
    *   **Description**: Retrieves the schema for a specific database, including its tables, columns, data types, and relationships.
    *   **Request Schema**:
        *   `database_id`: (number, required) The ID of the database.
    *   **Underlying API Call**: This tool would likely call the Metabase API endpoint `GET /api/database/:id/metadata`.
    *   **Response Schema**:
        *   A JSON object detailing the database schema. This would typically include:
            *   `id`: (number) The database ID.
            *   `name`: (string) The database name.
            *   `tables`: (array of objects) A list of tables within the database. Each table object would include:
                *   `id`: (number) The table ID.
                *   `name`: (string) The table name.
                *   `display_name`: (string) The display name of the table.
                *   `schema`: (string) The schema the table belongs to (e.g., "public").
                *   `fields`: (array of objects) A list of columns/fields in the table. Each field object would include:
                    *   `id`: (number) Field ID.
                    *   `name`: (string) Field name.
                    *   `display_name`: (string) Field display name.
                    *   `base_type`: (string) The Metabase base type (e.g., "type/Text", "type/Integer", "type/DateTime").
                    *   `effective_type`: (string) The more specific semantic type if available.
                    *   `semantic_type`: (string | null) The semantic type (e.g., "type/PK", "type/FK").
                    *   `fk_target_field_id`: (number | null) If a foreign key, the ID of the field it points to.
    This tool is crucial as it provides the AI with the necessary metadata to understand table structures, column names, data types, and relationships between tables.

3.  **Sample Table Content**:
    After obtaining the schema, the AI can get a preview of the data within specific tables. Using the existing `execute_query` tool, the AI can run queries like `SELECT * FROM your_table_name LIMIT 5;` (replacing `your_table_name` with an actual table name from the schema and adjusting the `LIMIT` as needed).
    *   This provides sample rows, allowing the AI to understand the typical values and format of the data in each column.

**Benefits of this Approach**:

This two-step process (get schema with `get_database_schema`, then get sample rows with `execute_query`) empowers the AI to:
*   **Build Context**: Understand the layout and content of databases without prior knowledge.
*   **Formulate Accurate Queries**: Construct more complex and accurate SQL queries for creating insightful dashboards, charts, or answering specific data-related questions.
*   **Reduce Errors**: Minimize trial-and-error by first inspecting metadata and sample data.

### AI-Assisted Database Performance Management (PostgreSQL)

Beyond data exploration and schema understanding, the AI can also assist in managing and optimizing the performance of connected PostgreSQL databases. This involves identifying performance bottlenecks and suggesting improvements.

**1. Identify Performance Issues**:
The AI can leverage PostgreSQL's rich set of statistics views to diagnose performance problems:
*   **Slow Queries**: Query `pg_stat_statements` (requires the `pg_stat_statements` extension to be enabled in PostgreSQL) to identify frequently executed and high-total-time queries.
*   **Index Usage**: Analyze `pg_stat_user_indexes` to find unused or infrequently used indexes. It can also examine `pg_indexes` to list existing indexes and correlate this information with slow queries from `pg_stat_statements` to identify missing indexes.
*   **Table Scans**: Check statistics (e.g., from `pg_stat_user_tables` for `seq_scan` and `idx_scan`) to find tables that are frequently scanned sequentially, which might indicate missing or ineffective indexes.

**2. Proposed New Tool: `get_postgres_performance_diagnostics`**:
To facilitate this, we propose a new MCP tool specifically for PostgreSQL performance diagnostics:
*   **Tool Name**: `get_postgres_performance_diagnostics`
*   **Description**: Retrieves performance diagnostics from a PostgreSQL database, including slow queries, index usage, and table scan information.
*   **Request Schema**:
    *   `database_id`: (number, required) The ID of the target PostgreSQL database connected to Metabase.
    *   `num_slow_queries`: (number, optional, default: 10) The number of top slow queries to retrieve from `pg_stat_statements`.
    *   `target_table_name`: (string, optional) Specific table name to focus index analysis on.
    *   `get_explain_for_query_ids`: (array of numbers, optional) A list of query IDs (from `pg_stat_statements`) for which to attempt to get `EXPLAIN` plans.
*   **Underlying Mechanism**: This tool would internally use the existing `execute_query` MCP tool to run multiple SQL queries against the specified PostgreSQL database. These queries would target views like `pg_stat_statements`, `pg_stat_user_indexes`, `pg_indexes`, `pg_stat_user_tables`, and potentially run `EXPLAIN (FORMAT JSON, ANALYZE)` for specific queries if requested. The tool would need appropriate permissions to access these views and run `EXPLAIN ANALYZE`.
*   **Response Schema**:
    *   A JSON object containing structured diagnostic information:
        *   `database_id`: (number) The ID of the queried database.
        *   `slow_queries`: (array of objects) Information on slow queries, each object including:
            *   `queryid`: (string) Query identifier from `pg_stat_statements`.
            *   `query`: (string) The text of the query.
            *   `calls`: (number) Number of times executed.
            *   `total_exec_time`: (number) Total time spent in the statement, in milliseconds.
            *   `mean_exec_time`: (number) Mean time spent in the statement, in milliseconds.
            *   `rows`: (number) Total number of rows retrieved or affected by the statement.
            *   `explain_plan`: (object | null) The `EXPLAIN ANALYZE` output in JSON format, if requested and successfully retrieved.
        *   `index_analysis`: (object) Information about index usage:
            *   `unused_indexes`: (array of objects) Details of indexes with low usage.
            *   `table_specific_indexes`: (array of objects, if `target_table_name` provided) Indexes for the specified table.
        *   `table_scan_stats`: (array of objects) Statistics on table scans, indicating potential indexing issues. Each object might include:
            *   `table_name`: (string) Name of the table.
            *   `seq_scan`: (number) Number of sequential scans.
            *   `idx_scan`: (number) Number of index scans.
            *   `idx_tup_fetch`: (number) Number of live rows fetched by index scans.

**3. AI-Driven Recommendations**:
With the data from `get_postgres_performance_diagnostics`, the AI can:
*   **Recommend New Indexes**: By analyzing slow queries (especially their `WHERE` clauses and `JOIN` conditions) and comparing them against existing indexes (from `get_database_schema` and `pg_indexes`), the AI can suggest creating new indexes. It can also analyze `EXPLAIN` plans to see if the query planner suggests missing indexes.
*   **Suggest Query Rewrites**: For queries with suboptimal `EXPLAIN` plans (e.g., using nested loops where hash joins might be better, or performing full table scans unnecessarily), the AI can suggest alternative ways to write the query or modify database parameters.
*   **Highlight Inefficient Indexes**: Identify unused indexes (which add overhead to write operations) or indexes that are not being used effectively by queries.

This capability would transform the AI from a data consumer into a proactive assistant for database administrators, helping to maintain and improve the performance of the underlying data infrastructure.

By implementing the `get_database_schema` and `get_postgres_performance_diagnostics` tools and following these exploration and analysis strategies, an AI assistant can interact with Metabase data more intelligently, autonomously, and even assist in its underlying performance management.
