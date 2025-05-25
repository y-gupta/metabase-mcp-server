#!/usr/bin/env node

/**
 * Metabase MCP Server
 * Implements interaction with Metabase API, providing the following functions:
 * - Get dashboard list
 * - Get questions list
 * - Get database list
 * - Execute question queries
 * - Get dashboard details
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Custom error enum
enum ErrorCode {
  InternalError = "internal_error",
  InvalidRequest = "invalid_request",
  InvalidParams = "invalid_params",
  MethodNotFound = "method_not_found"
}

// Custom error class
class McpError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "McpError";
  }
}

// API error type definition
interface ApiError {
  status?: number;
  message?: string;
  data?: { message?: string };
}

// Get Metabase configuration from environment variables
const METABASE_URL = process.env.METABASE_URL;
const METABASE_USER_EMAIL = process.env.METABASE_USER_EMAIL;
const METABASE_PASSWORD = process.env.METABASE_PASSWORD;
const METABASE_API_KEY = process.env.METABASE_API_KEY;

if (!METABASE_URL || (!METABASE_API_KEY && (!METABASE_USER_EMAIL || !METABASE_PASSWORD))) {
  throw new Error("METABASE_URL is required, and either METABASE_API_KEY or both METABASE_USER_EMAIL and METABASE_PASSWORD must be provided");
}

// Create custom Schema object using z.object
const ListResourceTemplatesRequestSchema = z.object({
  method: z.literal("resources/list_templates")
});

const ListToolsRequestSchema = z.object({
  method: z.literal("tools/list")
});

// Logger level enum
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

// Authentication method enum
enum AuthMethod {
  SESSION = 'session',
  API_KEY = 'api_key'
}

class MetabaseServer {
  private server: Server;
  private baseUrl: string;
  private sessionToken: string | null = null;
  private apiKey: string | null = null;
  private authMethod: AuthMethod = METABASE_API_KEY ? AuthMethod.API_KEY : AuthMethod.SESSION;
  private headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  constructor() {
    this.server = new Server(
      {
        name: "metabase-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.baseUrl = METABASE_URL!;
    if (METABASE_API_KEY) {
      this.apiKey = METABASE_API_KEY;
      this.logInfo('Using API Key authentication method');
    } else {
      this.logInfo('Using Session Token authentication method');
    }

    this.setupResourceHandlers();
    this.setupToolHandlers();

    // Enhanced error handling with logging
    this.server.onerror = (error: Error) => {
      this.logError('Unexpected server error occurred', error);
    };

    process.on('SIGINT', async () => {
      this.logInfo('Gracefully shutting down server');
      await this.server.close();
      process.exit(0);
    });

    // Verify tool schemas on startup
    this._verifyToolSchemas();
  }

  private async _verifyToolSchemas() {
    this.logInfo("Attempting to verify tool schemas...");
    // The Server class in the SDK has a public `requestHandlers` Map.
    const listToolsHandler = (this.server as any).requestHandlers.get(ListToolsRequestSchema.shape.method.value);

    if (listToolsHandler) {
      try {
        // We need to provide a dummy context object for the handler.
        // The actual context content doesn't matter for 'tools/list'.
        const dummyContext = {
          traceId: `verification-${this.generateRequestId()}`,
          auth: null 
        };
        const toolsResponse = await listToolsHandler({ method: "tools/list" } as any, dummyContext as any);
        
        if (!toolsResponse || !toolsResponse.tools) {
          this.logError("Tool schema verification failed: tools/list response is invalid or missing 'tools' array.", new Error("Invalid tools/list response"));
          return;
        }
        const tools = toolsResponse.tools;
        
        this._checkGetDatabaseSchemaTool(tools);
        this._checkGetPostgresPerformanceDiagnosticsTool(tools);
        this.logInfo("Tool schema verification successful.");
      } catch (error) {
        this.logError("Tool schema verification failed during handler execution", error);
      }
    } else {
      this.logWarn("Could not find ListToolsRequestSchema handler for verification. This might indicate an issue with server setup or SDK internals.");
    }
  }

  private _checkGetDatabaseSchemaTool(tools: any[]) {
    const toolName = "get_database_schema";
    const tool = tools.find(t => t.name === toolName);

    if (!tool) {
      this.logError(`Schema Check Failed: Tool "${toolName}" not found.`, new Error(`Tool ${toolName} missing`));
      return;
    }
    if (!tool.description || typeof tool.description !== 'string' || tool.description.trim() === '') {
      this.logError(`Schema Check Failed: Tool "${toolName}" description is invalid.`, new Error(`${toolName} description error`));
    }
    if (!tool.inputSchema || tool.inputSchema.type !== 'object') {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.type is not 'object'.`, new Error(`${toolName} inputSchema.type error`));
    }
    if (!tool.inputSchema.properties || !tool.inputSchema.properties.database_id) {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.database_id is missing.`, new Error(`${toolName} database_id property missing`));
    } else if (tool.inputSchema.properties.database_id.type !== 'number') {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.database_id.type is not 'number'.`, new Error(`${toolName} database_id type error`));
    }
    if (!tool.inputSchema.required || !Array.isArray(tool.inputSchema.required) || !tool.inputSchema.required.includes('database_id')) {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.required does not include 'database_id'.`, new Error(`${toolName} required field error`));
    }
  }

  private _checkGetPostgresPerformanceDiagnosticsTool(tools: any[]) {
    const toolName = "get_postgres_performance_diagnostics";
    const tool = tools.find(t => t.name === toolName);

    if (!tool) {
      this.logError(`Schema Check Failed: Tool "${toolName}" not found.`, new Error(`Tool ${toolName} missing`));
      return;
    }
    if (!tool.description || typeof tool.description !== 'string' || tool.description.trim() === '') {
      this.logError(`Schema Check Failed: Tool "${toolName}" description is invalid.`, new Error(`${toolName} description error`));
    }
    if (!tool.inputSchema || tool.inputSchema.type !== 'object') {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.type is not 'object'.`, new Error(`${toolName} inputSchema.type error`));
    }
    const props = tool.inputSchema.properties;
    if (!props || !props.database_id || props.database_id.type !== 'number') {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.database_id is invalid.`, new Error(`${toolName} database_id error`));
    }
    if (!props || !props.num_slow_queries || props.num_slow_queries.type !== 'number') {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.num_slow_queries is invalid.`, new Error(`${toolName} num_slow_queries error`));
    }
    if (!props || !props.target_table_name || props.target_table_name.type !== 'string') {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.properties.target_table_name is invalid.`, new Error(`${toolName} target_table_name error`));
    }
    if (!tool.inputSchema.required || !Array.isArray(tool.inputSchema.required) || !tool.inputSchema.required.includes('database_id')) {
      this.logError(`Schema Check Failed: Tool "${toolName}" inputSchema.required does not include 'database_id'.`, new Error(`${toolName} required field error`));
    }
  }

  // Enhanced logging utilities
  private log(level: LogLevel, message: string, data?: unknown, error?: Error) {
    const timestamp = new Date().toISOString();

    const logMessage: Record<string, unknown> = {
      timestamp,
      level,
      message
    };

    if (data !== undefined) {
      logMessage.data = data;
    }

    if (error) {
      logMessage.error = error.message || 'Unknown error';
      logMessage.stack = error.stack;
    }

    // Output structured log for machine processing
    console.error(JSON.stringify(logMessage));

    // Output human-readable format
    try {
      let logPrefix = level.toUpperCase();

      if (error) {
        console.error(`[${timestamp}] ${logPrefix}: ${message} - ${error.message || 'Unknown error'}`);
      } else {
        console.error(`[${timestamp}] ${logPrefix}: ${message}`);
      }
    } catch (e) {
      // Ignore if console is not available
    }
  }

  private logDebug(message: string, data?: unknown) {
    this.log(LogLevel.DEBUG, message, data);
  }

  private logInfo(message: string, data?: unknown) {
    this.log(LogLevel.INFO, message, data);
  }

  private logWarn(message: string, data?: unknown, error?: Error) {
    this.log(LogLevel.WARN, message, data, error);
  }

  private logError(message: string, error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.log(LogLevel.ERROR, message, undefined, errorObj);
  }

  private logFatal(message: string, error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.log(LogLevel.FATAL, message, undefined, errorObj);
  }

  /**
   * HTTP request utility method
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const headers = { ...this.headers };

    // Add appropriate authentication headers based on the method
    if (this.authMethod === AuthMethod.API_KEY && this.apiKey) {
      // Use X-API-KEY header as specified in the Metabase documentation
      headers['X-API-KEY'] = this.apiKey;
    } else if (this.authMethod === AuthMethod.SESSION && this.sessionToken) {
      headers['X-Metabase-Session'] = this.sessionToken;
    }

    this.logDebug(`Making request to ${url.toString()}`);
    this.logDebug(`Using headers: ${JSON.stringify(headers)}`);

    const response = await fetch(url.toString(), {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = `API request failed with status ${response.status}: ${response.statusText}`;
      this.logWarn(errorMessage, errorData);

      throw {
        status: response.status,
        message: response.statusText,
        data: errorData
      };
    }

    this.logDebug(`Received successful response from ${path}`);
    return response.json() as Promise<T>;
  }

  /**
   * Get Metabase session token (only needed for session auth method)
   */
  private async getSessionToken(): Promise<string> {
    // If using API Key authentication, return the API key directly
    if (this.authMethod === AuthMethod.API_KEY && this.apiKey) {
      this.logInfo('Using API Key authentication', {
        keyLength: this.apiKey.length,
        keyFormat: this.apiKey.includes('mb_') ? 'starts with mb_' : 'other format'
      });
      return this.apiKey;
    }

    // For session auth, continue with existing logic
    if (this.sessionToken) {
      return this.sessionToken;
    }

    this.logInfo('Initiating authentication with Metabase');
    try {
      const response = await this.request<{ id: string }>('/api/session', {
        method: 'POST',
        body: JSON.stringify({
          username: METABASE_USER_EMAIL,
          password: METABASE_PASSWORD,
        }),
      });

      this.sessionToken = response.id;
      this.logInfo('Successfully authenticated with Metabase');
      return this.sessionToken;
    } catch (error) {
      this.logError('Authentication with Metabase failed', error);
      throw new McpError(
        ErrorCode.InternalError,
        'Failed to authenticate with Metabase'
      );
    }
  }

  /**
   * Set up resource handlers
   */
  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async (_request) => {
      this.logInfo('Processing request to list resources', { requestId: this.generateRequestId() });
      await this.getSessionToken();

      try {
        // Get dashboard list
        this.logDebug('Fetching dashboards from Metabase');
        const dashboardsResponse = await this.request<any[]>('/api/dashboard');

        const resourceCount = dashboardsResponse.length;
        this.logInfo(`Successfully retrieved ${resourceCount} dashboards from Metabase`);

        // Return dashboards as resources
        return {
          resources: dashboardsResponse.map((dashboard: any) => ({
            uri: `metabase://dashboard/${dashboard.id}`,
            mimeType: "application/json",
            name: dashboard.name,
            description: `Metabase dashboard: ${dashboard.name}`
          }))
        };
      } catch (error) {
        this.logError('Failed to retrieve dashboards from Metabase', error);
        throw new McpError(
          ErrorCode.InternalError,
          'Failed to retrieve Metabase resources'
        );
      }
    });

    // Resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      this.logInfo('Processing request to list resource templates');
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

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const requestId = this.generateRequestId();
      this.logInfo('Processing request to read resource', {
        requestId,
        uri: request.params?.uri
      });

      await this.getSessionToken();

      const uri = request.params?.uri;
      if (!uri) {
        this.logWarn('Missing URI parameter in resource request', { requestId });
        throw new McpError(
          ErrorCode.InvalidParams,
          "URI parameter is required"
        );
      }

      let match;

      try {
        // Handle dashboard resource
        if ((match = uri.match(/^metabase:\/\/dashboard\/(\d+)$/))) {
          const dashboardId = match[1];
          this.logDebug(`Fetching dashboard with ID: ${dashboardId}`);

          const response = await this.request<any>(`/api/dashboard/${dashboardId}`);
          this.logInfo(`Successfully retrieved dashboard: ${response.name || dashboardId}`);

          return {
            contents: [{
              uri: request.params?.uri,
              mimeType: "application/json",
              text: JSON.stringify(response, null, 2)
            }]
          };
        }

        // Handle question/card resource
        else if ((match = uri.match(/^metabase:\/\/card\/(\d+)$/))) {
          const cardId = match[1];
          this.logDebug(`Fetching card/question with ID: ${cardId}`);

          const response = await this.request<any>(`/api/card/${cardId}`);
          this.logInfo(`Successfully retrieved card: ${response.name || cardId}`);

          return {
            contents: [{
              uri: request.params?.uri,
              mimeType: "application/json",
              text: JSON.stringify(response, null, 2)
            }]
          };
        }

        // Handle database resource
        else if ((match = uri.match(/^metabase:\/\/database\/(\d+)$/))) {
          const databaseId = match[1];
          this.logDebug(`Fetching database with ID: ${databaseId}`);

          const response = await this.request<any>(`/api/database/${databaseId}`);
          this.logInfo(`Successfully retrieved database: ${response.name || databaseId}`);

          return {
            contents: [{
              uri: request.params?.uri,
              mimeType: "application/json",
              text: JSON.stringify(response, null, 2)
            }]
          };
        }

        else {
          this.logWarn(`Invalid URI format: ${uri}`, { requestId });
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Invalid URI format: ${uri}`
          );
        }
      } catch (error) {
        const apiError = error as ApiError;
        const errorMessage = apiError.data?.message || apiError.message || 'Unknown error';
        this.logError(`Failed to fetch Metabase resource: ${errorMessage}`, error);

        throw new McpError(
          ErrorCode.InternalError,
          `Metabase API error: ${errorMessage}`
        );
      }
    });
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Set up tool handlers
   */
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logInfo('Processing request to list available tools');
      return {
        tools: [
          {
            name: "list_dashboards",
            description: "List all dashboards in Metabase",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "list_cards",
            description: "List all questions/cards in Metabase",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "list_databases",
            description: "List all databases in Metabase",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "execute_card",
            description: "Execute a Metabase question/card and get results",
            inputSchema: {
              type: "object",
              properties: {
                card_id: {
                  type: "number",
                  description: "ID of the card/question to execute"
                },
                parameters: {
                  type: "object",
                  description: "Optional parameters for the query"
                }
              },
              required: ["card_id"]
            }
          },
          {
            name: "get_dashboard_cards",
            description: "Get all cards in a dashboard",
            inputSchema: {
              type: "object",
              properties: {
                dashboard_id: {
                  type: "number",
                  description: "ID of the dashboard"
                }
              },
              required: ["dashboard_id"]
            }
          },
          {
            name: "execute_query",
            description: "Execute a SQL query against a Metabase database",
            inputSchema: {
              type: "object",
              properties: {
                database_id: {
                  type: "number",
                  description: "ID of the database to query"
                },
                query: {
                  type: "string",
                  description: "SQL query to execute"
                },
                native_parameters: {
                  type: "array",
                  description: "Optional parameters for the query",
                  items: {
                    type: "object"
                  }
                }
              },
              required: ["database_id", "query"]
            }
          },
          {
            name: "get_database_schema",
            description: "Get the schema of a specific database (tables, columns, types) connected to Metabase.",
            inputSchema: {
              type: "object",
              properties": {
                database_id: {
                  type: "number",
                  description: "ID of the Metabase database to get schema for"
                }
              },
              required: ["database_id"]
            }
          },
          {
            name: "get_postgres_performance_diagnostics",
            description: "Get performance diagnostics for a PostgreSQL database from Metabase (e.g., slow queries, index usage).",
            inputSchema: {
              type: "object",
              properties: {
                database_id: {
                  type: "number",
                  description: "ID of the PostgreSQL database in Metabase to diagnose"
                },
                num_slow_queries: {
                  type: "number",
                  description: "Number of slowest queries to retrieve (default: 10)",
                  optional: true
                },
                target_table_name: {
                  type: "string",
                  description: "Specific table name to analyze for index usage and scan frequency",
                  optional: true
                }
              },
              required: ["database_id"]
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params?.name || 'unknown';
      const requestId = this.generateRequestId();

      this.logInfo(`Processing tool execution request: ${toolName}`, {
        requestId,
        toolName,
        arguments: request.params?.arguments
      });

      await this.getSessionToken();

      try {
        switch (request.params?.name) {
          case "list_dashboards": {
            this.logDebug('Fetching all dashboards from Metabase');
            const response = await this.request<any[]>('/api/dashboard');
            this.logInfo(`Successfully retrieved ${response.length} dashboards`);

            return {
              content: [{
                type: "text",
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          // Removed duplicated get_database_schema case from here

          case "list_cards": {
            this.logDebug('Fetching all cards/questions from Metabase');
            const response = await this.request<any[]>('/api/card');
            this.logInfo(`Successfully retrieved ${response.length} cards/questions`);

            return {
              content: [{
                type: "text",
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          case "list_databases": {
            this.logDebug('Fetching all databases from Metabase');
            const response = await this.request<any[]>('/api/database');
            this.logInfo(`Successfully retrieved ${response.length} databases`);

            return {
              content: [{
                type: "text",
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          case "execute_card": {
            const cardId = request.params?.arguments?.card_id;
            if (!cardId) {
              this.logWarn('Missing card_id parameter in execute_card request', { requestId });
              throw new McpError(
                ErrorCode.InvalidParams,
                "Card ID parameter is required"
              );
            }

            this.logDebug(`Executing card with ID: ${cardId}`);
            const parameters = request.params?.arguments?.parameters || {};

            const response = await this.request<any>(`/api/card/${cardId}/query`, {
              method: 'POST',
              body: JSON.stringify({ parameters })
            });

            this.logInfo(`Successfully executed card: ${cardId}`);
            return {
              content: [{
                type: "text",
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          case "get_dashboard_cards": {
            const dashboardId = request.params?.arguments?.dashboard_id;
            if (!dashboardId) {
              this.logWarn('Missing dashboard_id parameter in get_dashboard_cards request', { requestId });
              throw new McpError(
                ErrorCode.InvalidParams,
                "Dashboard ID parameter is required"
              );
            }

            this.logDebug(`Fetching cards for dashboard with ID: ${dashboardId}`);
            const response = await this.request<any>(`/api/dashboard/${dashboardId}`);

            const cardCount = response.cards?.length || 0;
            this.logInfo(`Successfully retrieved ${cardCount} cards from dashboard: ${dashboardId}`);

            return {
              content: [{
                type: "text",
                text: JSON.stringify(response.cards, null, 2)
              }]
            };
          }

          case "execute_query": {
            const databaseId = request.params?.arguments?.database_id;
            const query = request.params?.arguments?.query;
            const nativeParameters = request.params?.arguments?.native_parameters || [];

            if (!databaseId) {
              this.logWarn('Missing database_id parameter in execute_query request', { requestId });
              throw new McpError(
                ErrorCode.InvalidParams,
                "Database ID parameter is required"
              );
            }

            if (!query) {
              this.logWarn('Missing query parameter in execute_query request', { requestId });
              throw new McpError(
                ErrorCode.InvalidParams,
                "SQL query parameter is required"
              );
            }

            this.logDebug(`Executing SQL query against database ID: ${databaseId}`);

            // Build query request body
            const queryData = {
              type: "native",
              native: {
                query: query,
                template_tags: {}
              },
              parameters: nativeParameters,
              database: databaseId
            };

            const response = await this.request<any>('/api/dataset', {
              method: 'POST',
              body: JSON.stringify(queryData)
            });

            this.logInfo(`Successfully executed SQL query against database: ${databaseId}`);
            return {
              content: [{
                type: "text",
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          case "get_database_schema": {
            const databaseId = request.params?.arguments?.database_id;
            if (!databaseId || typeof databaseId !== 'number') {
              this.logWarn('Missing or invalid database_id parameter in get_database_schema request', { requestId });
              throw new McpError(
                ErrorCode.InvalidParams,
                "database_id parameter is required and must be a number"
              );
            }

            this.logDebug(`Fetching schema for database ID: ${databaseId}`, { requestId });
            const response = await this.request<any>(`/api/database/${databaseId}/metadata`);
            this.logInfo(`Successfully retrieved schema for database ID: ${databaseId}`, { requestId });

            return {
              content: [{
                type: "text",
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          case "get_postgres_performance_diagnostics": {
            const args = request.params?.arguments;
            const databaseId = args?.database_id;
            let numSlowQueries = args?.num_slow_queries;
            const targetTableName = args?.target_table_name;
            // const requestId = this.generateRequestId(); // requestId is already generated at the start of CallToolRequestSchema

            if (!databaseId || typeof databaseId !== 'number') {
              this.logWarn('Missing or invalid database_id parameter for get_postgres_performance_diagnostics', { requestId, args });
              throw new McpError(ErrorCode.InvalidParams, "database_id is required and must be a number.");
            }
            
            if (numSlowQueries === undefined) {
              numSlowQueries = 10;
            } else if (typeof numSlowQueries !== 'number' || numSlowQueries <= 0) {
              this.logWarn('Invalid num_slow_queries parameter, using default 10', { requestId, numSlowQueriesProvided: numSlowQueries });
              numSlowQueries = 10;
            }
            
            let validatedTargetTableName: string | undefined = undefined;
            if (targetTableName !== undefined) {
              if (typeof targetTableName === 'string' && targetTableName.trim() !== '') {
                validatedTargetTableName = targetTableName;
              } else {
                this.logWarn('Invalid target_table_name parameter (e.g., empty or not a string), will be ignored.', { requestId, targetTableNameProvided: targetTableName });
              }
            }

            this.logDebug('Fetching PostgreSQL performance diagnostics', { requestId, databaseId, numSlowQueries, targetTableName: validatedTargetTableName });
            const diagnostics = await this._fetchPostgresDiagnostics(databaseId, numSlowQueries, validatedTargetTableName, requestId);

            return {
              content: [{
                type: "text",
                text: JSON.stringify(diagnostics, null, 2)
              }]
            };
          }

          default:
            this.logWarn(`Received request for unknown tool: ${request.params?.name}`, { requestId });
            return {
              content: [
                {
                  type: "text",
                  text: `Unknown tool: ${request.params?.name}`
                }
              ],
              isError: true
            };
        }
      } catch (error) {
        const apiError = error as ApiError;
        const errorMessage = apiError.data?.message || apiError.message || 'Unknown error';

        this.logError(`Tool execution failed: ${errorMessage}`, error);
        return {
          content: [{
            type: "text",
            text: `Metabase API error: ${errorMessage}`
          }],
          isError: true
        };
      }
    });
  }

  private async _fetchPostgresDiagnostics(databaseId: number, numSlowQueries: number, targetTableName?: string, requestId?: string) {
    const results: any = {
      database_id: databaseId,
      parameters_used: {
        num_slow_queries: numSlowQueries,
        target_table_name: targetTableName || null
      },
      slow_queries: [],
      table_analysis: targetTableName ? { table_name: targetTableName, index_usage: [], scan_stats: [] } : undefined
    };
  
    // Query for slow queries
    try {
      const slowQuerySql = `
        SELECT queryid, calls, total_exec_time, mean_exec_time, rows, query 
        FROM pg_stat_statements 
        ORDER BY total_exec_time DESC 
        LIMIT ${numSlowQueries};
      `;
      this.logDebug('Executing slow query diagnostics', { requestId, databaseId, query: slowQuerySql.trim().split('\\n').map(s => s.trim()).join(' ') });
      const slowQueryPayload = { type: "native", native: { query: slowQuerySql }, database: databaseId };
      const slowQueryResponse = await this.request<any>('/api/dataset', {
        method: 'POST',
        body: JSON.stringify(slowQueryPayload)
      });
      
      if (slowQueryResponse.data && slowQueryResponse.data.rows) {
          results.slow_queries = slowQueryResponse.data.rows;
      } else if (slowQueryResponse.status === 'failed') {
        this.logWarn('Slow query diagnostics failed to execute', { requestId, databaseId, error: slowQueryResponse.error });
        results.slow_queries_error = `Query execution failed: ${slowQueryResponse.error}. Ensure pg_stat_statements is enabled and permissions are correct.`;
      } else if (slowQueryResponse.error) {
        this.logWarn('Slow query diagnostics returned an error', { requestId, databaseId, error: slowQueryResponse.error });
        results.slow_queries_error = `Query returned an error: ${slowQueryResponse.error}.`;
      } else {
          this.logWarn('Unexpected response structure for slow queries', { requestId, databaseId, response: slowQueryResponse });
          results.slow_queries_error = 'Unexpected response structure from Metabase for slow queries.';
      }
    } catch (error: any) {
      this.logWarn('Failed to fetch slow queries from pg_stat_statements', { requestId, databaseId, errorMsg: error.message, errorData: error.data });
      results.slow_queries_error = `Failed to fetch from pg_stat_statements: ${error.message || 'Unknown error'}. ${error.data?.message || ''}. Ensure the extension is enabled and Metabase user has permissions.`;
    }
  
    // Query for table-specific diagnostics if target_table_name is provided
    if (targetTableName && results.table_analysis) {
      try {
        // Index Usage
        const indexUsageSql = `
          SELECT sui.schemaname, sui.relname AS table_name, sui.indexrelname AS index_name, sui.idx_scan AS index_scans, 
                 pg_size_pretty(pg_relation_size(pi.indexrelid)) as index_size 
          FROM pg_stat_user_indexes sui
          JOIN pg_indexes pi ON sui.indexrelid = pi.indexrelid
          WHERE sui.relname = '${targetTableName.replace(/'/g, "''")}';
        `;
        this.logDebug('Executing index usage diagnostics', { requestId, databaseId, table: targetTableName, query: indexUsageSql.trim().split('\\n').map(s => s.trim()).join(' ') });
        const indexUsagePayload = { type: "native", native: { query: indexUsageSql }, database: databaseId };
        const indexUsageResponse = await this.request<any>('/api/dataset', {
          method: 'POST',
          body: JSON.stringify(indexUsagePayload)
        });
        if (indexUsageResponse.data && indexUsageResponse.data.rows) {
            results.table_analysis.index_usage = indexUsageResponse.data.rows;
        } else if (indexUsageResponse.status === 'failed') {
            this.logWarn('Index usage query failed', { requestId, databaseId, table: targetTableName, error: indexUsageResponse.error });
            results.table_analysis.index_usage_error = `Query execution failed: ${indexUsageResponse.error}`;
        } else if (indexUsageResponse.error) {
            this.logWarn('Index usage query returned an error', { requestId, databaseId, table: targetTableName, error: indexUsageResponse.error });
            results.table_analysis.index_usage_error = `Query returned an error: ${indexUsageResponse.error}`;
        } else {
            this.logWarn('Unexpected response structure for index usage', { requestId, databaseId, response: indexUsageResponse });
            results.table_analysis.index_usage_error = 'Unexpected response structure from Metabase for index usage.';
        }
  
        // Table Scans
        const tableScanSql = `
          SELECT schemaname, relname AS table_name, seq_scan AS sequential_scans, idx_scan AS total_index_scans,
                 n_live_tup as live_rows, n_dead_tup as dead_rows
          FROM pg_stat_user_tables 
          WHERE relname = '${targetTableName.replace(/'/g, "''")}';
        `;
        this.logDebug('Executing table scan diagnostics', { requestId, databaseId, table: targetTableName, query: tableScanSql.trim().split('\\n').map(s => s.trim()).join(' ') });
        const tableScanPayload = { type: "native", native: { query: tableScanSql }, database: databaseId };
        const tableScanResponse = await this.request<any>('/api/dataset', {
          method: 'POST',
          body: JSON.stringify(tableScanPayload)
        });
        if (tableScanResponse.data && tableScanResponse.data.rows) {
            results.table_analysis.scan_stats = tableScanResponse.data.rows;
        } else if (tableScanResponse.status === 'failed') {
            this.logWarn('Table scan query failed', { requestId, databaseId, table: targetTableName, error: tableScanResponse.error });
            results.table_analysis.scan_stats_error = `Query execution failed: ${tableScanResponse.error}`;
        } else if (tableScanResponse.error) {
            this.logWarn('Table scan query returned an error', { requestId, databaseId, table: targetTableName, error: tableScanResponse.error });
            results.table_analysis.scan_stats_error = `Query returned an error: ${tableScanResponse.error}`;
        } else {
            this.logWarn('Unexpected response structure for table scans', { requestId, databaseId, response: tableScanResponse });
            results.table_analysis.scan_stats_error = 'Unexpected response structure from Metabase for table scans.';
        }
  
      } catch (error: any) {
        this.logWarn('Failed to fetch table diagnostics', { requestId, databaseId, table: targetTableName, errorMsg: error.message, errorData: error.data });
        results.table_analysis_error = `Failed to fetch diagnostics for table ${targetTableName}: ${error.message || 'Unknown error'}. ${error.data?.message || ''}`;
      }
    }
    return results;
  }

  async run() {
    try {
      this.logInfo('Starting Metabase MCP server');
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.logInfo('Metabase MCP server successfully connected and running on stdio transport');
    } catch (error) {
      this.logFatal('Failed to start Metabase MCP server', error);
      throw error;
    }
  }
}

// Add global error handlers
process.on('uncaughtException', (error: Error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'fatal',
    message: 'Uncaught exception detected',
    error: error.message,
    stack: error.stack
  }));
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'fatal',
    message: 'Unhandled promise rejection detected',
    error: errorMessage
  }));
});

const server = new MetabaseServer();
server.run().catch(error => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'fatal',
    message: 'Fatal error during server startup',
    error: error instanceof Error ? error.message : String(error)
  }));
  process.exit(1);
});
