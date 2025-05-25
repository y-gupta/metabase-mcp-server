// src/tools.ts
import { z } from "zod";
import { MetabaseClient, McpError, ErrorCode, LogLevel } from "./metabase_client";

export interface ToolResponsePayload {
  content: { type: string; text: string; }[];
  isError?: boolean;
}

// --- Tool Input Schemas ---
const ListDashboardsInputSchema = z.object({});
const ListCardsInputSchema = z.object({});
const ListDatabasesInputSchema = z.object({});
const ExecuteCardInputSchema = z.object({
  card_id: z.number({ description: "ID of the card/question to execute" }),
  parameters: z.object({}).passthrough().optional().describe("Optional parameters for the query")
});
const GetDashboardCardsInputSchema = z.object({
  dashboard_id: z.number({ description: "ID of the dashboard" })
});
const ExecuteQueryInputSchema = z.object({
  database_id: z.number({ description: "ID of the database to query" }),
  query: z.string({ description: "SQL query to execute" }),
  native_parameters: z.array(z.object({}).passthrough()).optional().describe("Optional parameters for the query")
});
const GetDatabaseSchemaInputSchema = z.object({
  database_id: z.number({ description: "ID of the Metabase database to get schema for" })
});
const GetPostgresPerformanceDiagnosticsInputSchema = z.object({
  database_id: z.number({ description: "ID of the PostgreSQL database in Metabase to diagnose" }),
  num_slow_queries: z.number({ description: "Number of slowest queries to retrieve (default: 10)" }).optional(),
  target_table_name: z.string({ description: "Specific table name to analyze for index usage and scan frequency" }).optional()
});


// --- Tool Definitions ---
export const ALL_TOOLS_DEFINITIONS = [
  {
    name: "list_dashboards",
    description: "List all dashboards in Metabase",
    inputSchema: ListDashboardsInputSchema
  },
  {
    name: "list_cards",
    description: "List all questions/cards in Metabase",
    inputSchema: ListCardsInputSchema
  },
  {
    name: "list_databases",
    description: "List all databases in Metabase",
    inputSchema: ListDatabasesInputSchema
  },
  {
    name: "execute_card",
    description: "Execute a Metabase question/card and get results",
    inputSchema: ExecuteCardInputSchema
  },
  {
    name: "get_dashboard_cards",
    description: "Get all cards in a dashboard",
    inputSchema: GetDashboardCardsInputSchema
  },
  {
    name: "execute_query",
    description: "Execute a SQL query against a Metabase database",
    inputSchema: ExecuteQueryInputSchema
  },
  {
    name: "get_database_schema",
    description: "Get the schema of a specific database (tables, columns, types) connected to Metabase.",
    inputSchema: GetDatabaseSchemaInputSchema
  },
  {
    name: "get_postgres_performance_diagnostics",
    description: "Get performance diagnostics for a PostgreSQL database from Metabase (e.g., slow queries, index usage).",
    inputSchema: GetPostgresPerformanceDiagnosticsInputSchema
  }
];

// --- Tool Implementation Functions ---

export async function handleListDashboards(client: MetabaseClient, _args: z.infer<typeof ListDashboardsInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug('Handling list_dashboards request', { requestId });
  await client.getSessionToken(); // Ensure session is active
  const response = await client.request<any[]>('/api/dashboard');
  client.logInfo(`Successfully retrieved ${response.length} dashboards`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
}

export async function handleListCards(client: MetabaseClient, _args: z.infer<typeof ListCardsInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug('Handling list_cards request', { requestId });
  await client.getSessionToken();
  const response = await client.request<any[]>('/api/card');
  client.logInfo(`Successfully retrieved ${response.length} cards/questions`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
}

export async function handleListDatabases(client: MetabaseClient, _args: z.infer<typeof ListDatabasesInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug('Handling list_databases request', { requestId });
  await client.getSessionToken();
  const response = await client.request<any[]>('/api/database');
  client.logInfo(`Successfully retrieved ${response.length} databases`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
}

export async function handleExecuteCard(client: MetabaseClient, args: z.infer<typeof ExecuteCardInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug(`Handling execute_card request for card ID: ${args.card_id}`, { requestId, args });
  await client.getSessionToken();
  // card_id is already validated by Zod to be a number
  const parameters = args.parameters || {};
  const response = await client.request<any>(`/api/card/${args.card_id}/query`, {
    method: 'POST',
    body: JSON.stringify({ parameters })
  });
  client.logInfo(`Successfully executed card: ${args.card_id}`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
}

export async function handleGetDashboardCards(client: MetabaseClient, args: z.infer<typeof GetDashboardCardsInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug(`Handling get_dashboard_cards request for dashboard ID: ${args.dashboard_id}`, { requestId, args });
  await client.getSessionToken();
  // dashboard_id is already validated by Zod
  const response = await client.request<any>(`/api/dashboard/${args.dashboard_id}`);
  const cardCount = response.cards?.length || 0;
  client.logInfo(`Successfully retrieved ${cardCount} cards from dashboard: ${args.dashboard_id}`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(response.cards, null, 2) }]
  };
}

export async function handleExecuteQuery(client: MetabaseClient, args: z.infer<typeof ExecuteQueryInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug(`Handling execute_query request for database ID: ${args.database_id}`, { requestId, queryLength: args.query.length });
  await client.getSessionToken();
  // database_id and query are already validated by Zod
  const nativeParameters = args.native_parameters || [];
  const queryData = {
    type: "native",
    native: { query: args.query, "template-tags": {} }, // Ensure template_tags is an empty object if not used
    parameters: nativeParameters,
    database_id: args.database_id // Corrected key to database_id for the payload
  };
  const response = await client.request<any>('/api/dataset', {
    method: 'POST',
    body: JSON.stringify(queryData)
  });
  client.logInfo(`Successfully executed SQL query against database: ${args.database_id}`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
}

export async function handleGetDatabaseSchema(client: MetabaseClient, args: z.infer<typeof GetDatabaseSchemaInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug(`Handling get_database_schema request for database ID: ${args.database_id}`, { requestId, args });
  await client.getSessionToken();
  // database_id is already validated by Zod
  const response = await client.request<any>(`/api/database/${args.database_id}/metadata`);
  client.logInfo(`Successfully retrieved schema for database ID: ${args.database_id}`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
}

export async function handleGetPostgresPerformanceDiagnostics(client: MetabaseClient, args: z.infer<typeof GetPostgresPerformanceDiagnosticsInputSchema>, requestId: string): Promise<ToolResponsePayload> {
  client.logDebug('Handling get_postgres_performance_diagnostics request', { requestId, args });
  await client.getSessionToken();
  // database_id is validated by Zod.
  // num_slow_queries and target_table_name are optional and their types are ensured by Zod if provided.
  
  let numSlowQueries = args.num_slow_queries;
  if (numSlowQueries === undefined) {
    numSlowQueries = 10;
  } else if (numSlowQueries <= 0) {
    client.logWarn('Invalid num_slow_queries parameter, using default 10', { requestId, numSlowQueriesProvided: args.num_slow_queries });
    numSlowQueries = 10;
  }

  let validatedTargetTableName: string | undefined = undefined;
  if (args.target_table_name !== undefined) {
    if (args.target_table_name.trim() !== '') {
      validatedTargetTableName = args.target_table_name;
    } else {
      client.logWarn('Invalid target_table_name parameter (empty string), will be ignored.', { requestId, targetTableNameProvided: args.target_table_name });
    }
  }
  
  const diagnostics = await client._fetchPostgresDiagnostics(args.database_id, numSlowQueries, validatedTargetTableName, requestId);
  client.logInfo(`Successfully fetched PostgreSQL performance diagnostics for database ID: ${args.database_id}`, { requestId });
  return {
    content: [{ type: "text", text: JSON.stringify(diagnostics, null, 2) }]
  };
}
