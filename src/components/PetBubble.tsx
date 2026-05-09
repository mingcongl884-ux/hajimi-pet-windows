import { X } from "lucide-react";

type Props = {
  text: string;
  tone?: "info" | "working";
  onOpen(): void;
  onClose(): void;
};

export default function PetBubble({ text, tone = "info", onOpen, onClose }: Props) {
  return (
    <section className={`pet-bubble ${tone}`} onClick={onOpen}>
      <p>{text}</p>
      <button
        title="关闭气泡"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X size={13} />
      </button>
    </section>
  );
}
