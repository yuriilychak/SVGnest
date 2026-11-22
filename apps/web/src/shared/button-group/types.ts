import { BUTTON_ACTION } from '../../types';

export interface ButtonGroupProps {
    buttonsConfig: BUTTON_ACTION[];
    disabledButtons?: string[];
    hiddenButtons?: string[];
    localePrefix: string;
    onClick(id: BUTTON_ACTION): void;
}
