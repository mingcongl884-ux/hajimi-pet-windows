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

export type OpenClawSetupStep = {
  label: string;
  command?: string;
  note?: string;
};

export type ChannelSettings = {
  enabled: boolean;
  provider: ChannelProvider;
  displayName: string;
  status: ChannelStatus;
  accessMode: ChannelAccessMode;
  allowedPeers: ChannelPeer[];
  routeMode: ChannelRouteMode;
  bridgePort: number;
  feishu?: {
    appId: string;
    appSecret: string;
    connectionMode: "websocket" | "webhook";
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
      bridgePort: 18011,
      feishu: { appId: "", appSecret: "", connectionMode: "websocket" }
    },
    {
      enabled: false,
      provider: "wechat",
      displayName: "微信",
      status: "disabled",
      accessMode: "pairing",
      allowedPeers: [],
      routeMode: "chat",
      bridgePort: 18011,
      wechat: {
        bridgeUrl: "http://127.0.0.1:18011",
        pluginCommand: "openclaw channels login --channel openclaw-weixin --verbose"
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

export function openClawSetupSteps(channel: ChannelSettings): OpenClawSetupStep[] {
  if (channel.provider === "wechat") {
    return [
      { label: "准备内置插件", note: "哈基Mi 会自动复制微信 ClawBot、二维码依赖和 OpenClaw 运行文件。" },
      { label: "启用插件", command: "openclaw plugins enable openclaw-weixin" },
      { label: "扫码登录", command: "openclaw channels login --channel openclaw-weixin --verbose" },
      { label: "重启网关", command: "openclaw gateway restart" },
      { label: "检查通道", command: "openclaw channels status --probe" }
    ];
  }

  return [
    { label: "添加飞书通道", command: "openclaw channels add" },
    { label: "确认网关运行", command: "openclaw gateway status" },
    {
      label: "配置飞书事件",
      note: "在飞书开放平台事件订阅里选择长连接 WebSocket，并添加 im.message.receive_v1。"
    },
    { label: "重启网关", command: "openclaw gateway restart" },
    { label: "检查通道", command: "openclaw channels status --probe" }
  ];
}
