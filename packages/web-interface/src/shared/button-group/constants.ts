import { BUTTON_ACTION } from '../../types';

export const BUTTON_CONFIG = new Map<BUTTON_ACTION, string>([
    [BUTTON_ACTION.DEMO, 'start'],
    [BUTTON_ACTION.OPEN, 'flag'],
    [BUTTON_ACTION.CODE, 'code'],
    [BUTTON_ACTION.OPEN_FAQ, 'faq'],
    [BUTTON_ACTION.START, 'start'],
    [BUTTON_ACTION.PAUSE, 'pause'],
    [BUTTON_ACTION.UPLOAD, 'upload'],
    [BUTTON_ACTION.DOWNLOAD, 'download'],
    [BUTTON_ACTION.ZOOM_IN, 'zoomIn'],
    [BUTTON_ACTION.ZOOM_OUT, 'zoomOut'],
    [BUTTON_ACTION.SETTINGS, 'settings'],
    [BUTTON_ACTION.BACK, 'back']
]);
