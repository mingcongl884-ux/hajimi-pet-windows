# HaJiMi Remote Relay

HaJiMi Relay is a lightweight cloud relay for cross-network remote bridge mode.
It does not run models, store files, or execute tools. It only forwards paired
tool calls between two HaJiMi clients.

## Deploy

Build the desktop project once, then copy the compiled relay file to your cloud
server:

```powershell
npm.cmd run build
scp dist-electron/electron/remoteBridgeRelayServer.js user@server:/opt/hajimi-relay/server.js
```

Run it on the server:

```bash
PORT=18041 node /opt/hajimi-relay/server.js
```

Expose the port with HTTPS through Nginx/Caddy when sharing it publicly. For a
private test, an HTTP URL such as `http://your-server-ip:18041` also works.

## Use

On computer A:

1. Open HaJiMi -> System -> Cross-computer bridge.
2. Enable local bridge.
3. Enable cloud relay and fill the relay URL.
4. Generate a pairing code.

On computer B:

1. Fill the same relay URL into remote address.
2. Enter A's pairing code.
3. Connect. The connected host will be marked as cloud relay.

After that, B's agent runs on B, but remote tools execute on A through the relay.
Manual direct addresses and LAN discovery still work.

The relay exposes the same MCP tool surface used by direct bridge mode, so
Claude Agent SDK and OpenClaw can call the remote tools through the cloud relay
instead of needing a direct TCP route to computer A. The relay still does not run
tools itself; it only waits for A to poll, forwards the requested tool call, and
returns the result to B.
