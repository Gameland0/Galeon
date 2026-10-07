export interface MCPService {
  id: string;
  name: string;
  description: string;
  category: string;
  chainId: number;
  isBuiltin: boolean;
  capabilities: string[];
  configSchema?: any;
}

export interface MCPCapability {
  mcpServiceId: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface MCPCallRequest {
  tool: string;
  params: any;
}

export interface MCPCallResponse {
  success: boolean;
  data?: any;
  requiresSignature?: boolean;
  transaction?: any;
  error?: string;
}