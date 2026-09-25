import { PauseCircle, Tray, CircleHalf, BellRinging, CheckCircle, type Icon } from '@phosphor-icons/react';
import type { Status } from './columns';

export const STATUS_ICON: Record<Status, Icon> = {
  hold: PauseCircle,
  backlog: Tray,
  doing: CircleHalf,
  waiting: BellRinging,
  done: CheckCircle,
};
