import type { AppSettings, PetConversationMode } from "../../electron/settingsStore.js";
import type { ChannelPeer, ChannelPeerKind, ChannelProvider } from "./channels.js";
import { findAllowedPeer } from "./channels.js";
import { ensureActiveConversation } from "./conversations.js";

export type ChannelAttachment = {
  id: string;
  name?: string;
  mimeType?: string;
  url?: string;
};

export type ChannelMessage = {
  channel: ChannelProvider;
  peerId: string;
  peerKind: ChannelPeerKind;
  text: string;
  attachments: ChannelAttachment[];
  receivedAt: string;
};

export type ChannelRouteDecision =
  | { type: "pairing-required"; reply: string }
  | { type: "ignored"; reply?: string }
  | {
      type: "route";
      mode: PetConversationMode;
      conversationId: string;
      text: string;
      peerToAllow?: ChannelPeer;
    };

export function routeChannelMessage(settings: AppSettings, message: ChannelMessage): ChannelRouteDecision {
  const channel = settings.channels.find((item) => item.provider === message.channel);
  if (!channel?.enabled) {
    return { type: "ignored", reply: "这个通道还没有启用。" };
  }

  const allowed = findAllowedPeer(settings.channels, message.channel, message.peerKind, message.peerId);
  if (!allowed && channel.accessMode !== "pairing") {
    return {
      type: "pairing-required",
      reply: `需要先在哈基Mi的通道页完成配对：${message.channel}:${message.peerId}`
    };
  }

  const prepared = ensureActiveConversation(settings, message.receivedAt);

  return {
    type: "route",
    mode: channel.routeMode,
    conversationId: prepared.activeConversationId,
    text: message.text,
    peerToAllow: allowed
      ? undefined
      : {
        id: message.peerId,
        channel: message.channel,
        kind: message.peerKind,
        pairedAt: message.receivedAt
      }
  };
}
