// src/metabase_client.ts

// Custom error enum
export enum ErrorCode {
  InternalError = "internal_error",
  InvalidRequest = "invalid_request",
  InvalidParams = "invalid_params",
  MethodNotFound = "method_not_found"
}

// Custom error class
export class McpError extends Error {
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

// Logger level enum
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

// Authentication method enum
export enum AuthMethod {
  SESSION = 'session',
  API_KEY = 'api_key'
}

export class MetabaseClient {
  private baseUrl: string;
  private sessionToken: string | null = null;
  private apiKey: string | null = null;
  private authMethod: AuthMethod;
  private headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  private METABASE_USER_EMAIL?: string;
  private METABASE_PASSWORD?: string;

  constructor() {
    const METABASE_URL_ENV = process.env.METABASE_URL;
    this.METABASE_USER_EMAIL = process.env.METABASE_USER_EMAIL;
    this.METABASE_PASSWORD = process.env.METABASE_PASSWORD;
    const METABASE_API_KEY_ENV = process.env.METABASE_API_KEY;

    if (!METABASE_URL_ENV || (!METABASE_API_KEY_ENV && (!this.METABASE_USER_EMAIL || !this.METABASE_PASSWORD))) {
      this.logFatal("Metabase configuration error", new Error("METABASE_URL is required, and either METABASE_API_KEY or both METABASE_USER_EMAIL and METABASE_PASSWORD must be provided"));
      throw new Error("METABASE_URL is required, and either METABASE_API_KEY or both METABASE_USER_EMAIL and METABASE_PASSWORD must be provided");
    }
    this.baseUrl = METABASE_URL_ENV;

    if (METABASE_API_KEY_ENV) {
      this.apiKey = METABASE_API_KEY_ENV;
      this.authMethod = AuthMethod.API_KEY;
      this.logInfo('MetabaseClient: Using API Key authentication method');
    } else {
      this.authMethod = AuthMethod.SESSION;
      this.logInfo('MetabaseClient: Using Session Token authentication method');
    }
  }

  // Enhanced logging utilities
  public log(level: LogLevel, message: string, data?: unknown, error?: Error) {
    const timestamp = new Date().toISOString();
    const logMessage: Record<string, unknown> = { timestamp, level, message};
    if (data !== undefined) logMessage.data = data;
    if (error) {
      logMessage.error = error.message || 'Unknown error';
      logMessage.stack = error.stack;
    }
    console.error(JSON.stringify(logMessage)); // Structured log
    // Human-readable format
    // try {
    //   let logPrefix = level.toUpperCase();
    //   if (error) console.error(`[${timestamp}] ${logPrefix}: ${message} - ${error.message || 'Unknown error'}`);
    //   else console.error(`[${timestamp}] ${logPrefix}: ${message}`);
    // } catch (e) { /* Ignore if console is not available */ }
  }

  public logDebug(message: string, data?: unknown) { this.log(LogLevel.DEBUG, message, data); }
  public logInfo(message: string, data?: unknown) { this.log(LogLevel.INFO, message, data); }
  public logWarn(message: string, data?: unknown, error?: Error) { this.log(LogLevel.WARN, message, data, error); }
  public logError(message: string, error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.log(LogLevel.ERROR, message, undefined, errorObj);
  }
  public logFatal(message: string, error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.log(LogLevel.FATAL, message, undefined, errorObj);
  }

  public async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const headers = { ...this.headers };

    if (this.authMethod === AuthMethod.API_KEY && this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    } else if (this.authMethod === AuthMethod.SESSION && this.sessionToken) {
      headers['X-Metabase-Session'] = this.sessionToken;
    }

    this.logDebug(`MetabaseClient: Making request to ${url.toString()}`);
    // this.logDebug(`MetabaseClient: Using headers: ${JSON.stringify(headers)}`); // Potentially sensitive

    const response = await fetch(url.toString(), { ...options, headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = `MetabaseClient: API request failed with status ${response.status}: ${response.statusText}`;
      this.logWarn(errorMessage, errorData);
      throw { status: response.status, message: response.statusText, data: errorData } as ApiError;
    }

    this.logDebug(`MetabaseClient: Received successful response from ${path}`);
    return response.json() as Promise<T>;
  }

  public async getSessionToken(): Promise<string> {
    if (this.authMethod === AuthMethod.API_KEY && this.apiKey) {
      // this.logInfo('MetabaseClient: Using API Key directly as session token equivalent.', { keyLength: this.apiKey.length });
      return this.apiKey;
    }
    if (this.sessionToken) return this.sessionToken;

    this.logInfo('MetabaseClient: Initiating session token authentication with Metabase');
    try {
      const response = await this.request<{ id: string }>('/api/session', {
        method: 'POST',
        body: JSON.stringify({
          username: this.METABASE_USER_EMAIL,
          password: this.METABASE_PASSWORD,
        }),
      });
      this.sessionToken = response.id;
      this.logInfo('MetabaseClient: Successfully authenticated and obtained session token');
      return this.sessionToken;
    } catch (error) {
      this.logError('MetabaseClient: Authentication with Metabase failed', error);
      throw new McpError(ErrorCode.InternalError, 'Failed to authenticate with Metabase');
    }
  }

  public async _fetchPostgresDiagnostics(databaseId: number, numSlowQueries: number, targetTableName?: string, requestId?: string) {
    const results: any = {
      database_id: databaseId,
      parameters_used: {
        num_slow_queries: numSlowQueries,
        target_table_name: targetTableName || null
      },
      slow_queries: [],
      table_analysis: targetTableName ? { table_name: targetTableName, index_usage: [], scan_stats: [] } : undefined
    };
  
    try {
      const slowQuerySql = `
        SELECT queryid, calls, total_exec_time, mean_exec_time, rows, query 
        FROM pg_stat_statements 
        ORDER BY total_exec_time DESC 
        LIMIT ${numSlowQueries};
      `;
      this.logDebug('MetabaseClient: Executing slow query diagnostics', { requestId, databaseId, query: slowQuerySql.trim().split('\\n').map(s => s.trim()).join(' ') });
      const slowQueryPayload = { type: "native", native: { query: slowQuerySql }, database: databaseId };
      // Directly use this.request here.
      const slowQueryResponse = await this.request<any>('/api/dataset', {
        method: 'POST',
        body: JSON.stringify(slowQueryPayload)
      });
      
      if (slowQueryResponse.data && slowQueryResponse.data.rows) {
          results.slow_queries = slowQueryResponse.data.rows;
      } else if (slowQueryResponse.status === 'failed' || slowQueryResponse.error) {
        const errorMsg = slowQueryResponse.error || 'Query execution failed';
        this.logWarn('MetabaseClient: Slow query diagnostics failed to execute or returned error', { requestId, databaseId, error: errorMsg });
        results.slow_queries_error = `${errorMsg}. Ensure pg_stat_statements is enabled and permissions are correct.`;
      } else {
          this.logWarn('MetabaseClient: Unexpected response structure for slow queries', { requestId, databaseId, response: slowQueryResponse });
          results.slow_queries_error = 'Unexpected response structure from Metabase for slow queries.';
      }
    } catch (error: any) {
      this.logWarn('MetabaseClient: Failed to fetch slow queries from pg_stat_statements', { requestId, databaseId, errorMsg: error.message, errorData: error.data });
      results.slow_queries_error = `Failed to fetch from pg_stat_statements: ${error.message || 'Unknown error'}. ${error.data?.message || ''}. Ensure the extension is enabled and Metabase user has permissions.`;
    }
  
    if (targetTableName && results.table_analysis) {
      try {
        const indexUsageSql = `
          SELECT sui.schemaname, sui.relname AS table_name, sui.indexrelname AS index_name, sui.idx_scan AS index_scans, 
                 pg_size_pretty(pg_relation_size(pi.indexrelid)) as index_size 
          FROM pg_stat_user_indexes sui
          JOIN pg_indexes pi ON sui.indexrelid = pi.indexrelid
          WHERE sui.relname = '${targetTableName.replace(/'/g, "''")}';
        `;
        this.logDebug('MetabaseClient: Executing index usage diagnostics', { requestId, databaseId, table: targetTableName, query: indexUsageSql.trim().split('\\n').map(s => s.trim()).join(' ') });
        const indexUsagePayload = { type: "native", native: { query: indexUsageSql }, database: databaseId };
        const indexUsageResponse = await this.request<any>('/api/dataset', {
          method: 'POST',
          body: JSON.stringify(indexUsagePayload)
        });
        if (indexUsageResponse.data && indexUsageResponse.data.rows) {
            results.table_analysis.index_usage = indexUsageResponse.data.rows;
        } else if (indexUsageResponse.status === 'failed' || indexUsageResponse.error) {
            const errorMsg = indexUsageResponse.error || 'Query execution failed';
            this.logWarn('MetabaseClient: Index usage query failed or returned error', { requestId, databaseId, table: targetTableName, error: errorMsg });
            results.table_analysis.index_usage_error = errorMsg;
        } else {
            this.logWarn('MetabaseClient: Unexpected response structure for index usage', { requestId, databaseId, response: indexUsageResponse });
            results.table_analysis.index_usage_error = 'Unexpected response structure from Metabase for index usage.';
        }
  
        const tableScanSql = `
          SELECT schemaname, relname AS table_name, seq_scan AS sequential_scans, idx_scan AS total_index_scans,
                 n_live_tup as live_rows, n_dead_tup as dead_rows
          FROM pg_stat_user_tables 
          WHERE relname = '${targetTableName.replace(/'/g, "''")}';
        `;
        this.logDebug('MetabaseClient: Executing table scan diagnostics', { requestId, databaseId, table: targetTableName, query: tableScanSql.trim().split('\\n').map(s => s.trim()).join(' ') });
        const tableScanPayload = { type: "native", native: { query: tableScanSql }, database: databaseId };
        const tableScanResponse = await this.request<any>('/api/dataset', {
          method: 'POST',
          body: JSON.stringify(tableScanPayload)
        });
        if (tableScanResponse.data && tableScanResponse.data.rows) {
            results.table_analysis.scan_stats = tableScanResponse.data.rows;
        } else if (tableScanResponse.status === 'failed' || tableScanResponse.error) {
            const errorMsg = tableScanResponse.error || 'Query execution failed';
            this.logWarn('MetabaseClient: Table scan query failed or returned error', { requestId, databaseId, table: targetTableName, error: errorMsg });
            results.table_analysis.scan_stats_error = errorMsg;
        } else {
            this.logWarn('MetabaseClient: Unexpected response structure for table scans', { requestId, databaseId, response: tableScanResponse });
            results.table_analysis.scan_stats_error = 'Unexpected response structure from Metabase for table scans.';
        }
      } catch (error: any) {
        this.logWarn('MetabaseClient: Failed to fetch table diagnostics', { requestId, databaseId, table: targetTableName, errorMsg: error.message, errorData: error.data });
        results.table_analysis_error = `Failed to fetch diagnostics for table ${targetTableName}: ${error.message || 'Unknown error'}. ${error.data?.message || ''}`;
      }
    }
    return results;
  }
}
