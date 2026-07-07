export interface ApiDeployment {
  id: string;
  flowId: string;
  pathSlug: string;
  rateLimit: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  flowId: string;
  userId: string;
  keyPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  rawKey: string;
}

export interface OpenApiSpec {
  openapi: '3.0.3';
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, OpenApiPathItem>;
  components: {
    schemas: Record<string, object>;
    securitySchemes: Record<string, object>;
  };
}

export interface OpenApiPathItem {
  post?: {
    summary: string;
    operationId: string;
    parameters?: Array<{
      name: string;
      in: 'path' | 'query';
      required?: boolean;
      description: string;
      schema: object;
    }>;
    requestBody?: {
      required: boolean;
      content: Record<string, { schema: object }>;
    };
    responses: Record<string, { description: string; content?: Record<string, { schema: object }> }>;
    security: Array<Record<string, string[]>>;
  };
  get?: {
    summary: string;
    operationId: string;
    parameters?: Array<{
      name: string;
      in: 'path' | 'query';
      required?: boolean;
      description: string;
      schema: object;
    }>;
    responses: Record<string, { description: string; content?: Record<string, { schema: object }> }>;
    security: Array<Record<string, string[]>>;
  };
}
