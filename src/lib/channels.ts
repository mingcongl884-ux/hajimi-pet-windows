export type ChannelProvider = "feishu" | "wechat";
export type ChannelPeerKind = "direct" | "group";
export type ChannelStatus = "disabled" | "starting" | "connected" | "error";
export type ChannelAccessMode = "pairing" | "allowlist";
export type ChannelRouteMode = "chat" | "agent";

export type ChannelPeer = {
  id: string;
  channel: ChannelProvider;
  kind: ChannelPeerKind;
  name?: string;
  pairedAt?: string;
};

export type ChannelSettings = {
  enabled: boolean;
  provider: ChannelProvider;
  displayName: string;
  status: ChannelStatus;
  accessMode: ChannelAccessMode;
  allowedPeers: ChannelPeer[];
  routeMode: ChannelRouteMode;
  feishu?: {
    appId: string;
    appSecret: string;
  };
  wechat?: {
    bridgeUrl: string;
    pluginCommand: string;
  };
};

export function defaultChannelSettings(): ChannelSettings[] {
  return [
    {
      enabled: false,
      provider: "feishu",
      displayName: "飞书",
      status: "disabled",
      accessMode: "pairing",
      allowedPeers: [],
      routeMode: "chat",
      feishu: { appId: "", appSecret: "" }
    },
    {
      enabled: false,
      provider: "wechat",
      displayName: "微信",
      status: "disabled",
      accessMode: "pairing",
      allowedPeers: [],
      routeMode: "chat",
      wechat: {
        bridgeUrl: "http://127.0.0.1:18011",
        pluginCommand: "openclaw channels login --channel openclaw-weixin"
      }
    }
  ];
}

export function cloneChannelSettings(channels?: ChannelSettings[]): ChannelSettings[] {
  const defaults = defaultChannelSettings();
  return defaults.map((defaultChannel) => {
    const stored = channels?.find((channel) => channel.provider === defaultChannel.provider);
    return {
      ...defaultChannel,
      ...stored,
      allowedPeers: stored?.allowedPeers ? [...stored.allowedPeers] : [],
      feishu: defaultChannel.feishu ? { ...defaultChannel.feishu, ...stored?.feishu } : undefined,
      wechat: defaultChannel.wechat ? { ...defaultChannel.wechat, ...stored?.wechat } : undefined
    };
  });
}

export function findAllowedPeer(
  channels: ChannelSettings[],
  channel: ChannelProvider,
  kind: ChannelPeerKind,
  id: string
): ChannelPeer | undefined {
  return channels
    .find((item) => item.provider === channel)
    ?.allowedPeers.find((peer) => peer.channel === channel && peer.kind === kind && peer.id === id);
}
