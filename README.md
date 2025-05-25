# Metabase MCP Server

**Author**: Hyeongjun Yu ([@hyeongjun-dev](https://github.com/hyeongjun-dev))

[![smithery badge](https://smithery.ai/badge/@hyeongjun-dev/metabase-mcp-server)](https://smithery.ai/server/@hyeongjun-dev/metabase-mcp-server)

A Model Context Protocol server that integrates AI assistants with Metabase analytics platform.

## Overview

This TypeScript-based MCP server provides seamless integration with the Metabase API, enabling AI assistants to directly interact with your analytics data. Designed for Claude and other MCP-compatible AI assistants, this server acts as a bridge between your analytics platform and conversational AI.

A common workflow for AI assistants to explore data using this server involves:
1. Listing available databases with `list_databases`.
2. Retrieving the schema of a specific database using `get_database_schema`.
3. Sampling table contents or running specific queries with `execute_query`.
This allows the AI to understand data structure and content before performing complex analyses or visualizations.

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
- `get_database_schema`: Retrieves the detailed schema (tables, columns, types) for a specific database.
- `get_postgres_performance_diagnostics`: Retrieves performance diagnostics (slow queries, index usage) for a PostgreSQL database.
- `execute_card`: Runs saved questions and retrieves results with optional parameters.
- `get_dashboard_cards`: Extracts all cards from a specific dashboard.
- `execute_query`: Executes custom SQL queries against a specified database.

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

## Code Structure

The server's codebase is organized into the following key files within the `src/` directory:

*   **`src/index.ts`**: This is the main entry point for the MCP server. It initializes the `@modelcontextprotocol/sdk Server` instance, sets up generic request handlers for listing resources (`resources/list`, `resources/list_templates`) and reading specific resources (`resources/read`). It also handles the `tools/list` request by providing tool definitions from `src/tools.ts`, and dispatches specific `tools/call` requests to the appropriate handler functions defined in `src/tools.ts`. It also manages the overall server lifecycle and global error handling.

*   **`src/metabase_client.ts`**: This file defines the `MetabaseClient` class, which is responsible for all direct interactions with the Metabase API. It handles Metabase authentication (session token and API key), constructs and sends HTTP requests to Metabase endpoints, and includes core helper methods like `_fetchPostgresDiagnostics` for complex data retrieval. All logging related to Metabase API interactions is also managed here.

*   **`src/tools.ts`**: This file centralizes the definition and implementation of all MCP tools supported by the server. It exports `ALL_TOOLS_DEFINITIONS`, an array containing the name, description, and Zod input schema for each tool. For every tool, it also provides an asynchronous `handle<ToolName>` function (e.g., `handleListDashboards`) that takes the `MetabaseClient` instance and validated arguments, performs the necessary operations, and returns the tool's response.

This modular structure separates concerns: `index.ts` for MCP server mechanics, `metabase_client.ts` for Metabase API abstraction, and `tools.ts` for the specific logic of each exposed tool.

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

### `get_database_schema`

- **Description**: Retrieves the schema for a specific database, including its tables, columns, data types, and relationships. (This tool calls the Metabase API endpoint `GET /api/database/:id/metadata`).
- **Request Schema**:
  - `database_id`: (number, required) The ID of the database.
- **Response Schema**:
  - A JSON object detailing the database schema. This would typically include:
    - `id`: (number) The database ID.
    - `name`: (string) The database name.
    - `tables`: (array of objects) A list of tables within the database. Each table object would include:
        - `id`: (number) The table ID.
        - `name`: (string) The table name.
        - `display_name`: (string) The display name of the table.
        - `schema`: (string) The schema the table belongs to (e.g., "public").
        - `fields`: (array of objects) A list of columns/fields in the table. Each field object would include:
            - `id`: (number) Field ID.
            - `name`: (string) Field name.
            - `display_name`: (string) Field display name.
            - `base_type`: (string) The Metabase base type (e.g., "type/Text", "type/Integer", "type/DateTime").
            - `effective_type`: (string) The more specific semantic type if available.
            - `semantic_type`: (string | null) The semantic type (e.g., "type/PK", "type/FK").
            - `fk_target_field_id`: (number | null) If a foreign key, the ID of the field it points to.

### `get_postgres_performance_diagnostics`

- **Description**: Retrieves performance diagnostics from a PostgreSQL database, including slow queries, index usage, and table scan information. This tool internally uses the `execute_query` MCP tool to run SQL queries against views like `pg_stat_statements`, `pg_stat_user_indexes`, `pg_indexes`, and `pg_stat_user_tables`.
- **Request Schema**:
  - `database_id`: (number, required) The ID of the target PostgreSQL database connected to Metabase.
  - `num_slow_queries`: (number, optional, default: 10) The number of top slow queries to retrieve from `pg_stat_statements`.
  - `target_table_name`: (string, optional) Specific table name to focus index analysis on (for `pg_stat_user_indexes` and `pg_stat_user_tables`).
- **Response Schema**:
  - A JSON object containing structured diagnostic information:
    - `database_id`: (number) The ID of the queried database.
    - `parameters_used`: (object) The parameters that were used for the diagnostic query.
        - `num_slow_queries`: (number) The value of `num_slow_queries` used.
        - `target_table_name`: (string | null) The value of `target_table_name` used.
    - `slow_queries`: (array of objects | null) Information on slow queries, each object including:
        - `queryid`: (string) Query identifier from `pg_stat_statements`.
        - `query`: (string) The text of the query.
        - `calls`: (number) Number of times executed.
        - `total_exec_time`: (number) Total time spent in the statement, in milliseconds.
        - `mean_exec_time`: (number) Mean time spent in the statement, in milliseconds.
        - `rows`: (number) Total number of rows retrieved or affected by the statement.
    - `slow_queries_error`: (string | null) Error message if fetching slow queries failed.
    - `table_analysis`: (object | null) Information about index usage and table scans for the `target_table_name` (only present if `target_table_name` was provided).
        - `table_name`: (string) The name of the table analyzed.
        - `index_usage`: (array of objects | null) Details of indexes for the specified table.
        - `index_usage_error`: (string | null) Error message if fetching index usage failed.
        - `scan_stats`: (array of objects | null) Statistics on table scans for the specified table.
        - `scan_stats_error`: (string | null) Error message if fetching scan statistics failed.
    - `table_analysis_error`: (string | null) General error message if table-specific analysis failed.

## AI-Assisted Database Performance Management (PostgreSQL)

Beyond general data exploration, this server provides tools that can help an AI assistant in managing and optimizing the performance of connected PostgreSQL databases. This involves identifying performance bottlenecks using data retrieved by the server, which the AI can then use to suggest improvements.

### Identifying Potential Performance Issues

The `get_postgres_performance_diagnostics` tool is designed to gather key statistics from a PostgreSQL database. An AI can use this data to look for common performance issues:
*   **Slow Queries**: The tool can return a list of slow-running queries from `pg_stat_statements`. The AI can analyze these queries for inefficiencies.
*   **Index Usage**: If a `target_table_name` is provided to the tool, it returns information about index scans from `pg_stat_user_indexes` and `pg_indexes`. This helps identify unused or infrequently used indexes.
*   **Table Scans**: The tool also returns data from `pg_stat_user_tables` for the `target_table_name`, which can highlight tables frequently undergoing full sequential scans, often indicating missing or ineffective indexes.

### Interpreting Diagnostics and AI Recommendations

Once the AI receives the diagnostic data from `get_postgres_performance_diagnostics`, it can:
*   **Recommend New Indexes**: By analyzing slow queries (especially their `WHERE` clauses and `JOIN` conditions) and comparing them against existing indexes (which can be fetched using `get_database_schema` and cross-referenced with `pg_indexes` data from the diagnostics tool), the AI can suggest creating new indexes.
*   **Suggest Query Rewrites**: For queries identified as slow, the AI could suggest alternative ways to write the query, especially if it has common anti-patterns. (Note: The current `get_postgres_performance_diagnostics` tool does not fetch `EXPLAIN` plans, which could be a valuable future enhancement for deeper query analysis.)
*   **Highlight Inefficient Indexes**: Identify unused indexes (which add overhead to write operations) or indexes that are not being used effectively by queries based on the statistics provided.

This capability allows an AI to act as a proactive assistant for database administrators, helping to maintain and improve the performance of the underlying data infrastructure connected to Metabase.
