export interface MCPServer {
  id: string;
  name: string;
  url: string;
  tools: MCPToolInfo[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
