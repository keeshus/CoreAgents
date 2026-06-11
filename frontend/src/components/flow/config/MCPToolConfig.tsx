import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

interface MCPToolConfigProps {
  config: {
    serverId: string;
    toolName: string;
    parameters: Record<string, any>;
  };
  onChange: (config: any) => void;
}

export function MCPToolConfig({ config, onChange }: MCPToolConfigProps) {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<any>(null);

  useEffect(() => {
    api.mcpServers.list().then(setServers).catch(() => {});
  }, []);

  useEffect(() => {
    const srv = servers.find((s: any) => s.id === config.serverId);
    setSelectedServer(srv || null);
  }, [config.serverId, servers]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">MCP Server</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
          value={config.serverId}
          onChange={(e) => {
            const srv = servers.find((s: any) => s.id === e.target.value);
            onChange({ ...config, serverId: e.target.value, serverName: srv?.name || '', toolName: '' });
          }}
        >
          <option value="">Select server...</option>
          {servers.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.tools?.length || 0} tools)
            </option>
          ))}
        </select>
      </label>

      {selectedServer && selectedServer.tools?.length > 0 && (
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Tool</span>
          <select
            className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
            value={config.toolName}
            onChange={(e) => onChange({ ...config, toolName: e.target.value })}
          >
            <option value="">Select tool...</option>
            {selectedServer.tools.map((t: any) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {config.toolName && (
            <p className="mt-1 text-[10px] text-gray-500">
              {selectedServer.tools.find((t: any) => t.name === config.toolName)
                ?.description || ''}
            </p>
          )}
        </label>
      )}

      {config.toolName && (
        <div>
          <span className="text-xs font-medium text-gray-700">Parameters</span>
          <p className="text-[10px] text-gray-400 mt-1">
            Parameters are passed directly to the tool at execution time based on
            upstream node output.
          </p>
        </div>
      )}
    </div>
  );
}
