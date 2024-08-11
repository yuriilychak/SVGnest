import { BUTTON_ACTION } from '../types';

export const getModifiedButtons = (
    isWorking: boolean,
    isBinSlected: boolean,
    iterations: number,
    svgSrc: string
): { disabledButtons: BUTTON_ACTION[]; hiddenButtons: BUTTON_ACTION[] } => {
    const disabledButtons: BUTTON_ACTION[] = [];
    const hiddenButtons: BUTTON_ACTION[] = [];

    if (isWorking) {
        hiddenButtons.push(BUTTON_ACTION.START);
        disabledButtons.push(BUTTON_ACTION.UPLOAD);
        disabledButtons.push(BUTTON_ACTION.SETTINGS);
    } else {
        hiddenButtons.push(BUTTON_ACTION.PAUSE);
    }

    if (!isBinSlected || !svgSrc) {
        disabledButtons.push(BUTTON_ACTION.START);
    }

    if (iterations === 0 || isWorking) {
        disabledButtons.push(BUTTON_ACTION.DOWNLOAD);
    }

    return { disabledButtons, hiddenButtons };
};

export const toPercents = (value: number): number => Math.min(Math.ceil(value * 100), 100);
