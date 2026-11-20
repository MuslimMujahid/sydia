import Svg, { Path } from "react-native-svg";
import type { TaskPriority } from "@/lib/services/api/tasks/tasks.api";
import { colors, priorityColors } from "@/lib/theme";

interface PriorityFlagProps {
  priority: TaskPriority;
  size?: number;
  /** Fades the flag on finished tasks. */
  muted?: boolean;
}

/** The web's pennant on a pole, tinted by priority: blue, yellow, red. */
export function PriorityFlag({
  priority,
  size = 18,
  muted = false,
}: PriorityFlagProps) {
  const color = priorityColors[priority];

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={muted ? 0.45 : 1}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M5.5 21V3.5" />
      <Path
        d="M5.5 4.5c2.2-1.4 4.4-1.4 6.6 0s4.4 1.4 6.4 0v9c-2 1.4-4.2 1.4-6.4 0s-4.4-1.4-6.6 0z"
        fill={color}
        fillOpacity={0.85}
      />
      <Path
        d="M8 5.6c1.4-.5 2.8-.3 4.1.5"
        stroke={colors.white}
        strokeOpacity={0.55}
        strokeWidth={1.2}
      />
    </Svg>
  );
}
