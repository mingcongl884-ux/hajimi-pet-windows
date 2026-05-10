import type { ChatResponse } from "../../electron/chatClient.js";
import type { PetAction } from "./petActions.js";

export type PetInteractionIntent = {
  reply: string;
  actions: PetAction[];
};

const OFFICE_WORDS = /readme|代码|文件|项目|修改|生成|分析|总结|搜索|运行|命令|脚本|报告|文档|测试|commit|git/i;
const PLAY_WORDS = /去玩|玩耍|自己玩|自由活动|随便走|自己走|自己跑|跑一会|溜达|逛一会/;
const QUIET_WORDS = /安静|别跑|不要跑|别动|不要动|停下|停一停|乖一点|安分|别晃|别走/;
const JUMP_WORDS = /跳一下|跳起来|蹦一下|蹦起来/;
const WAVE_WORDS = /挥手|招手|打招呼/;

export function resolvePetInteractionIntent(input: string): PetInteractionIntent | undefined {
  const text = input.trim();
  if (!text || text.length > 90 || OFFICE_WORDS.test(text)) {
    return undefined;
  }

  if (QUIET_WORDS.test(text)) {
    return {
      reply: "好，我安静一会儿。",
      actions: [
        { type: "stopMovement" },
        { type: "mood", mood: "idle" }
      ]
    };
  }

  if (PLAY_WORDS.test(text)) {
    return {
      reply: "好呀，我自己去玩一会儿。",
      actions: [
        { type: "setMovement", enabled: true, intensity: "normal" },
        { type: "mood", mood: "happy" }
      ]
    };
  }

  if (JUMP_WORDS.test(text)) {
    return {
      reply: "好呀，跳一下。",
      actions: [{ type: "jump" }]
    };
  }

  if (WAVE_WORDS.test(text)) {
    return {
      reply: "在呢，我挥挥手。",
      actions: [{ type: "mood", mood: "happy" }]
    };
  }

  return undefined;
}

export function intentToAssistantMessage(intent: PetInteractionIntent): ChatResponse {
  return {
    role: "assistant",
    content: intent.reply,
    petActions: intent.actions
  };
}
