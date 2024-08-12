import { FC } from 'react';
import { BUTTON_ACTION } from '../../types';
import {
    BackIcon,
    CodeIcon,
    DownloadIcon,
    FAQIcon,
    FlagIcon,
    PauseIcon,
    SettingsIcon,
    StartIcon,
    UploadIcon,
    ZoomInIcon,
    ZoomOutIcon
} from '../../assets';

export const BUTTON_CONFIG = new Map<BUTTON_ACTION, FC>([
    [BUTTON_ACTION.DEMO, StartIcon],
    [BUTTON_ACTION.OPEN, FlagIcon],
    [BUTTON_ACTION.CODE, CodeIcon],
    [BUTTON_ACTION.OPEN_FAQ, FAQIcon],
    [BUTTON_ACTION.START, StartIcon],
    [BUTTON_ACTION.PAUSE, PauseIcon],
    [BUTTON_ACTION.UPLOAD, UploadIcon],
    [BUTTON_ACTION.DOWNLOAD, DownloadIcon],
    [BUTTON_ACTION.ZOOM_IN, ZoomInIcon],
    [BUTTON_ACTION.ZOOM_OUT, ZoomOutIcon],
    [BUTTON_ACTION.SETTINGS, SettingsIcon],
    [BUTTON_ACTION.BACK, BackIcon]
]);
