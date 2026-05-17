import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";
import type { AddressInfo } from "node:net";
import type { AgentPermissionMode } from "./settingsStore.js";

export const REMOTE_BRIDGE_DISCOVERY_PORT = 18032;
const DISCOVERY_PROTOCOL = "hajimi-remote-bridge-v1";

export type RemoteBridgeDiscoveryResult = {
  name: string;
  address: string;
  permissionMode: AgentPermissionMode;
  workspaceReady: boolean;
  pairingAvailable: boolean;
};

export type RemoteBridgeDiscoveryResponder = {
  port: number;
  stop(): Promise<void>;
};

type DiscoveryQuery = {
  protocol: typeof DISCOVERY_PROTOCOL;
  type: "query";
};

type DiscoveryResponse = {
  protocol: typeof DISCOVERY_PROTOCOL;
  type: "response";
  deviceName: string;
  servicePort: number;
  permissionMode: AgentPermissionMode;
  workspaceReady: boolean;
  pairingAvailable: boolean;
};

type DiscoveryResponderOptions = {
  discoveryPort?: number;
  deviceName: string;
  servicePort: number;
  permissionMode: AgentPermissionMode;
  workspaceReady: boolean;
  pairingAvailable: boolean;
};

type DiscoverOptions = {
  discoveryPort?: number;
  timeoutMs?: number;
  targets?: string[];
};

export async function startRemoteBridgeDiscoveryResponder(
  options: DiscoveryResponderOptions
): Promise<RemoteBridgeDiscoveryResponder> {
  const socket = createSocket("udp4");
  socket.on("message", (message, remote) => {
    const query = parseDiscoveryMessage<DiscoveryQuery>(message);
    if (query?.protocol !== DISCOVERY_PROTOCOL || query.type !== "query") {
      return;
    }

    const response: DiscoveryResponse = {
      protocol: DISCOVERY_PROTOCOL,
      type: "response",
      deviceName: options.deviceName,
      servicePort: options.servicePort,
      permissionMode: options.permissionMode,
      workspaceReady: options.workspaceReady,
      pairingAvailable: options.pairingAvailable
    };
    socket.send(Buffer.from(JSON.stringify(response)), remote.port, remote.address, () => undefined);
  });

  await bindSocket(socket, options.discoveryPort ?? REMOTE_BRIDGE_DISCOVERY_PORT);
  return {
    port: (socket.address() as AddressInfo).port,
    stop: () => closeSocket(socket)
  };
}

export async function discoverRemoteBridgeHosts(options: DiscoverOptions = {}): Promise<RemoteBridgeDiscoveryResult[]> {
  const socket = createSocket("udp4");
  const discoveryPort = options.discoveryPort ?? REMOTE_BRIDGE_DISCOVERY_PORT;
  const timeoutMs = options.timeoutMs ?? 900;
  const targets = options.targets?.length ? options.targets : getLanDiscoveryTargets();
  const results = new Map<string, RemoteBridgeDiscoveryResult>();

  socket.on("message", (message, remote) => {
    const response = parseDiscoveryMessage<DiscoveryResponse>(message);
    if (response?.protocol !== DISCOVERY_PROTOCOL || response.type !== "response") {
      return;
    }
    if (!response.servicePort || !response.deviceName) {
      return;
    }

    const host: RemoteBridgeDiscoveryResult = {
      name: response.deviceName,
      address: `http://${remote.address}:${response.servicePort}`,
      permissionMode: response.permissionMode,
      workspaceReady: Boolean(response.workspaceReady),
      pairingAvailable: Boolean(response.pairingAvailable)
    };
    results.set(`${host.address}:${host.name}`, host);
  });

  await bindSocket(socket, 0);
  socket.setBroadcast(true);
  const query: DiscoveryQuery = { protocol: DISCOVERY_PROTOCOL, type: "query" };
  const payload = Buffer.from(JSON.stringify(query));
  await Promise.all(targets.map((target) => sendUdp(socket, payload, discoveryPort, target)));
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  await closeSocket(socket);
  return [...results.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function getLanDiscoveryTargets(): string[] {
  const targets = new Set<string>(["255.255.255.255", "127.0.0.1"]);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal || !address.address || !address.netmask) {
        continue;
      }
      targets.add(calculateBroadcastAddress(address.address, address.netmask));
    }
  }
  return [...targets];
}

function calculateBroadcastAddress(address: string, netmask: string): string {
  const ip = ipv4ToNumber(address);
  const mask = ipv4ToNumber(netmask);
  return numberToIpv4((ip & mask) | (~mask >>> 0));
}

function ipv4ToNumber(value: string): number {
  return value.split(".").reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

function numberToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => String((value >>> shift) & 255)).join(".");
}

function parseDiscoveryMessage<T>(message: Buffer): T | undefined {
  try {
    return JSON.parse(message.toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

function bindSocket(socket: Socket, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, "0.0.0.0", () => {
      socket.off("error", reject);
      resolve();
    });
  });
}

function sendUdp(socket: Socket, payload: Buffer, port: number, host: string): Promise<void> {
  return new Promise((resolve) => {
    socket.send(payload, port, host, () => resolve());
  });
}

function closeSocket(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.close(() => resolve());
  });
}
