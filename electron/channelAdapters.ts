import type { ChannelProvider, ChannelSettings } from "../src/lib/channels.js";

export type ChannelAdapterResult = {
  provider: ChannelProvider;
  status: "disabled" | "starting" | "connected" | "error";
  message: string;
};

export async function startChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  const { provider } = channel;
  if (provider === "feishu") {
    return channel.feishu?.appId.trim() && channel.feishu.appSecret.trim()
      ? { provider, status: "connected", message: "飞书通道配置已就绪，等待长连接接入。" }
      : { provider, status: "error", message: "请先填写飞书 App ID 和 App Secret。" };
  }

  if (provider === "wechat") {
    return channel.wechat?.bridgeUrl.trim()
      ? { provider, status: "connected", message: "微信插件桥接地址已就绪。" }
      : { provider, status: "error", message: "请先填写微信插件桥接地址。" };
  }

  return { provider, status: "error", message: "未知通道。" };
}

export async function stopChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  return { provider: channel.provider, status: "disabled", message: `${channel.displayName} 已停止。` };
}

export async function testChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  return startChannelAdapter(channel);
}
