#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequestSchema,
  // Types needed for CallToolRequestSchema handler
  type CallToolRequest,
  type CallToolResponse,
} from "@modelcontextprotocol/sdk/types.js";
import { z, ZodError } from "zod";

import { MetabaseClient, McpError, ErrorCode, LogLevel } from "./metabase_client";
import { 
  ALL_TOOLS_DEFINITIONS,
  handleListDashboards,
  handleListCards,
  handleListDatabases,
  handleExecuteCard,
  handleGetDashboardCards,
  handleExecuteQuery,
  handleGetDatabaseSchema,
  handleGetPostgresPerformanceDiagnostics,
  type ToolResponsePayload
} from "./tools";

// --- Zod Schemas for MCP Server ---
const ListResourceTemplatesRequestSchema = z.object({
  method: z.literal("resources/list_templates")
});

const ListToolsRequestSchema = z.object({
  method: z.literal("tools/list")
});

// --- Utility Functions ---
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// --- Main Server Setup ---
const metabaseClient = new MetabaseClient();

const server = new Server(
  {
    name: "metabase-mcp-server",
    version: "0.1.0", // Consider moving to package.json or a config file
  },
  {
    capabilities: {
      resources: {}, // Define if resource capabilities are needed
      tools: {},     // Define if tool capabilities are needed
    },
  }
);

// --- Resource Handlers ---
server.setRequestHandler(ListResourcesRequestSchema, async (_request) => {
  const requestId = generateRequestId();
  metabaseClient.logInfo('Processing request to list resources', { requestId });
  await metabaseClient.getSessionToken();

  try {
    metabaseClient.logDebug('Fetching dashboards from Metabase', { requestId });
    const dashboardsResponse = await metabaseClient.request<any[]>('/api/dashboard');
    metabaseClient.logInfo(`Successfully retrieved ${dashboardsResponse.length} dashboards`, { requestId });

    return {
      resources: dashboardsResponse.map((dashboard: any) => ({
        uri: `metabase://dashboard/${dashboard.id}`,
        mimeType: "application/json",
        name: dashboard.name,
        description: `Metabase dashboard: ${dashboard.name}`
      }))
    };
  } catch (error) {
    metabaseClient.logError('Failed to retrieve dashboards from Metabase', error);
    // Convert error to McpError or a generic error structure expected by the SDK
    if (error instanceof McpError) throw error;
    throw new McpError(ErrorCode.InternalError, 'Failed to retrieve Metabase resources');
  }
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  metabaseClient.logInfo('Processing request to list resource templates');
  return {
    resourceTemplates: [
      {
        uriTemplate: 'metabase://dashboard/{id}',
        name: 'Dashboard by ID',
        mimeType: 'application/json',
        description: 'Get a Metabase dashboard by its ID',
      },
      {
        uriTemplate: 'metabase://card/{id}',
        name: 'Card by ID',
        mimeType: 'application/json',
        description: 'Get a Metabase question/card by its ID',
      },
      {
        uriTemplate: 'metabase://database/{id}',
        name: 'Database by ID',
        mimeType: 'application/json',
        description: 'Get a Metabase database by its ID',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const requestId = generateRequestId();
  metabaseClient.logInfo('Processing request to read resource', { requestId, uri: request.params?.uri });
  await metabaseClient.getSessionToken();

  const uri = request.params?.uri;
  if (!uri) {
    metabaseClient.logWarn('Missing URI parameter in resource request', { requestId });
    throw new McpError(ErrorCode.InvalidParams, "URI parameter is required");
  }

  let match;
  try {
    if ((match = uri.match(/^metabase:\/\/dashboard\/(\d+)$/))) {
      const dashboardId = match[1];
      metabaseClient.logDebug(`Fetching dashboard with ID: ${dashboardId}`, { requestId });
      const response = await metabaseClient.request<any>(`/api/dashboard/${dashboardId}`);
      metabaseClient.logInfo(`Successfully retrieved dashboard: ${response.name || dashboardId}`, { requestId });
      return { contents: [{ uri: request.params?.uri, mimeType: "application/json", text: JSON.stringify(response, null, 2) }] };
    }
    else if ((match = uri.match(/^metabase:\/\/card\/(\d+)$/))) {
      const cardId = match[1];
      metabaseClient.logDebug(`Fetching card/question with ID: ${cardId}`, { requestId });
      const response = await metabaseClient.request<any>(`/api/card/${cardId}`);
      metabaseClient.logInfo(`Successfully retrieved card: ${response.name || cardId}`, { requestId });
      return { contents: [{ uri: request.params?.uri, mimeType: "application/json", text: JSON.stringify(response, null, 2) }] };
    }
    else if ((match = uri.match(/^metabase:\/\/database\/(\d+)$/))) {
      const databaseId = match[1];
      metabaseClient.logDebug(`Fetching database with ID: ${databaseId}`, { requestId });
      const response = await metabaseClient.request<any>(`/api/database/${databaseId}`);
      metabaseClient.logInfo(`Successfully retrieved database: ${response.name || databaseId}`, { requestId });
      return { contents: [{ uri: request.params?.uri, mimeType: "application/json", text: JSON.stringify(response, null, 2) }] };
    }
    else {
      metabaseClient.logWarn(`Invalid URI format: ${uri}`, { requestId });
      throw new McpError(ErrorCode.InvalidRequest, `Invalid URI format: ${uri}`);
    }
  } catch (error: any) {
    const errorMessage = error.data?.message || error.message || 'Unknown error';
    metabaseClient.logError(`Failed to fetch Metabase resource: ${errorMessage}`, error);
    if (error instanceof McpError) throw error;
    throw new McpError(ErrorCode.InternalError, `Metabase API error: ${errorMessage}`);
  }
});

// --- Tool Handlers ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  metabaseClient.logInfo('Processing request to list available tools');
  // Convert Zod schemas to JSON schemas for the response
  const toolsForResponse = ALL_TOOLS_DEFINITIONS.map(tool => {
      const { inputSchema, ...rest } = tool;
      // This is a simplified conversion. For full Zod to JSON Schema, a library might be needed.
      // For now, we'll assume the structure is compatible or manually define it.
      // The SDK might also have utilities for this, or expect Zod schemas directly in future.
      // For this refactor, we'll pass the Zod schema's definition if possible, or a simplified object.
      // Let's assume a simplified object representation for now.
      const properties: Record<string, any> = {};
      const required: string[] = [];
      if (inputSchema && inputSchema.shape) {
        for (const key in inputSchema.shape) {
          const field = inputSchema.shape[key] as z.ZodTypeAny;
          properties[key] = { 
            type: (field._def as any).typeName?.replace('Zod', '').toLowerCase() || 'any', 
            description: field.description 
          };
          if (!field.isOptional()) {
            required.push(key);
          }
        }
      }
      return {
          ...rest,
          inputSchema: {
              type: "object",
              properties,
              required: required.length > 0 ? required : undefined
          }
      };
  });
  return { tools: toolsForResponse };
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResponse> => {
  const toolName = request.params?.name || 'unknown_tool';
  const requestId = generateRequestId();
  metabaseClient.logInfo(`Processing tool execution request: ${toolName}`, { requestId, toolName, arguments: request.params?.arguments });

  const toolDefinition = ALL_TOOLS_DEFINITIONS.find(t => t.name === toolName);

  if (!toolDefinition) {
    metabaseClient.logWarn(`Received request for unknown tool: ${toolName}`, { requestId });
    return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
  }

  try {
    // Validate arguments against the tool's Zod schema
    const validatedArgs = toolDefinition.inputSchema.parse(request.params?.arguments || {});
    
    let responsePayload: ToolResponsePayload;

    switch (toolName) {
      case "list_dashboards":
        responsePayload = await handleListDashboards(metabaseClient, validatedArgs, requestId);
        break;
      case "list_cards":
        responsePayload = await handleListCards(metabaseClient, validatedArgs, requestId);
        break;
      case "list_databases":
        responsePayload = await handleListDatabases(metabaseClient, validatedArgs, requestId);
        break;
      case "execute_card":
        responsePayload = await handleExecuteCard(metabaseClient, validatedArgs, requestId);
        break;
      case "get_dashboard_cards":
        responsePayload = await handleGetDashboardCards(metabaseClient, validatedArgs, requestId);
        break;
      case "execute_query":
        responsePayload = await handleExecuteQuery(metabaseClient, validatedArgs, requestId);
        break;
      case "get_database_schema":
        responsePayload = await handleGetDatabaseSchema(metabaseClient, validatedArgs, requestId);
        break;
      case "get_postgres_performance_diagnostics":
        responsePayload = await handleGetPostgresPerformanceDiagnostics(metabaseClient, validatedArgs, requestId);
        break;
      default:
        // This case should ideally not be reached due to the check above
        metabaseClient.logError(`Handler not implemented for tool: ${toolName}`, new Error("Unimplemented tool handler"), { requestId });
        return { content: [{ type: "text", text: `Handler not implemented for tool: ${toolName}` }], isError: true };
    }
    return responsePayload;

  } catch (error: any) {
    let errorMessage = 'Tool execution failed';
    let errorCode = ErrorCode.InternalError;
    
    if (error instanceof ZodError) {
      errorMessage = `Invalid arguments for tool ${toolName}: ${error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join(', ')}`;
      errorCode = ErrorCode.InvalidParams;
      metabaseClient.logWarn(errorMessage, { requestId, toolName, errors: error.errors });
    } else if (error instanceof McpError) {
      errorMessage = error.message;
      errorCode = error.code;
      metabaseClient.logError(`Tool execution failed for ${toolName}: ${errorMessage}`, error, { requestId });
    } else {
      errorMessage = error.message || 'An unexpected error occurred';
      metabaseClient.logError(`Unexpected error during tool execution for ${toolName}: ${errorMessage}`, error, { requestId });
    }
    
    // Ensure the response structure matches CallToolResponse
    return {
      content: [{ type: "text", text: `Error (${errorCode}): ${errorMessage}` }],
      isError: true
    };
  }
});

// --- Schema Verification (Conceptual Tests) ---
function _checkToolSchema(toolDefinition: any, expectedProperties: { name: string, type: string, optional?: boolean }[], expectedRequired: string[]) {
  if (!toolDefinition) {
    metabaseClient.logError("Schema Check Failed: Tool definition is undefined.", new Error("Undefined tool definition"));
    return;
  }
  const toolName = toolDefinition.name || "Unnamed Tool";

  if (!toolDefinition.description || typeof toolDefinition.description !== 'string' || toolDefinition.description.trim() === '') {
    metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" description is invalid.`, new Error(`${toolName} description error`));
  }
  
  // Assuming inputSchema is the Zod schema itself, not a JSON schema representation
  const inputSchema = toolDefinition.inputSchema as z.ZodObject<any, any>;
  if (!inputSchema || typeof inputSchema.parse !== 'function' || !inputSchema.shape) {
     metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" inputSchema is not a valid Zod object schema.`, new Error(`${toolName} inputSchema type error`));
     return;
  }

  const shape = inputSchema.shape;
  for (const prop of expectedProperties) {
    if (!shape[prop.name]) {
      metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.${prop.name} is missing.`, new Error(`${toolName} ${prop.name} property missing`));
    } else {
      const zodType = (shape[prop.name]._def as any).typeName;
      let expectedZodTypePrefix = `Zod${prop.type.charAt(0).toUpperCase() + prop.type.slice(1)}`;
      if (prop.type === 'array') expectedZodTypePrefix = 'ZodArray';
      if (prop.type === 'object') expectedZodTypePrefix = 'ZodObject';


      if (!zodType || !zodType.startsWith(expectedZodTypePrefix)) {
        metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.${prop.name}.type is not '${prop.type}' (found ${zodType}).`, new Error(`${toolName} ${prop.name} type error`));
      }
      if (prop.optional && shape[prop.name].isOptional() === false) {
         metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.${prop.name} is not optional.`, new Error(`${toolName} ${prop.name} optionality error`));
      }
      if (!prop.optional && shape[prop.name].isOptional() === true && expectedRequired.includes(prop.name)) {
         metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.${prop.name} is optional but listed as required.`, new Error(`${toolName} ${prop.name} required error`));
      }
    }
  }
  
  // Check required fields by trying to parse with empty object if all fields are optional,
  // or by checking which ones are not optional against expectedRequired.
  const nonOptionalFieldsInSchema = Object.keys(shape).filter(key => !shape[key].isOptional());
  for (const req of expectedRequired) {
    if (!nonOptionalFieldsInSchema.includes(req)) {
       metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.required does not effectively include '${req}'.`, new Error(`${toolName} required field ${req} error`));
    }
  }
  const extraRequiredFields = nonOptionalFieldsInSchema.filter(nf => !expectedRequired.includes(nf));
  if(extraRequiredFields.length > 0){
      metabaseClient.logError(`Schema Check Failed: Tool "${toolName}" inputSchema has extra non-optional fields: ${extraRequiredFields.join(', ')}.`, new Error(`${toolName} extra required fields error`));
  }

}

function _verifyToolSchemas(allTools: typeof ALL_TOOLS_DEFINITIONS) {
  metabaseClient.logInfo("Attempting to verify tool schemas...");
  
  const getDbSchema = allTools.find(t => t.name === "get_database_schema");
  if (getDbSchema) {
    _checkToolSchema(getDbSchema, 
      [{ name: 'database_id', type: 'number' }], 
      ['database_id']
    );
  } else {
    metabaseClient.logError("Schema Check Failed: Tool 'get_database_schema' not found in ALL_TOOLS_DEFINITIONS.", new Error("Tool get_database_schema missing"));
  }

  const getPgDiag = allTools.find(t => t.name === "get_postgres_performance_diagnostics");
  if (getPgDiag) {
    _checkToolSchema(getPgDiag, 
      [
        { name: 'database_id', type: 'number' },
        { name: 'num_slow_queries', type: 'number', optional: true },
        { name: 'target_table_name', type: 'string', optional: true }
      ], 
      ['database_id']
    );
  } else {
     metabaseClient.logError("Schema Check Failed: Tool 'get_postgres_performance_diagnostics' not found in ALL_TOOLS_DEFINITIONS.", new Error("Tool get_postgres_performance_diagnostics missing"));
  }
  metabaseClient.logInfo("Tool schema verification checks completed.");
}

// --- Server Initialization and Startup ---
async function main() {
  metabaseClient.logInfo("Starting Metabase MCP server");

  server.onerror = (error: Error) => {
    metabaseClient.logError('Unexpected server error occurred', error);
  };

  process.on('SIGINT', async () => {
    metabaseClient.logInfo('Gracefully shutting down server...');
    await server.close();
    process.exit(0);
  });
  
  // Perform schema verification
  _verifyToolSchemas(ALL_TOOLS_DEFINITIONS);

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    metabaseClient.logInfo('Metabase MCP server successfully connected and running on stdio transport');
  } catch (error) {
    metabaseClient.logFatal('Failed to start Metabase MCP server', error);
    throw error; // Rethrow to exit process if startup fails
  }
}

// Global error handlers
process.on('uncaughtException', (error: Error) => {
  metabaseClient.logFatal('Uncaught exception detected', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
  metabaseClient.logFatal('Unhandled promise rejection detected', reason instanceof Error ? reason : new Error(String(reason)));
  // Consider exiting, depending on the nature of unhandled rejections in your app
  // process.exit(1); 
});

main().catch(error => {
  // This catch is for errors during the main() async function execution itself,
  // primarily for the server.connect() part or if _verifyToolSchemas were async and threw.
  metabaseClient.logFatal('Fatal error during server startup or main execution', error);
  process.exit(1);
});
