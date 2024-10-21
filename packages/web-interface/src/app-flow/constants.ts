import { PolygonPacker } from 'polygon-packer';
import { SVGParser } from 'svg-parser';

import {
    ALERT_TYPE,
    INPUT_TYPE,
    MESSAGE_ID,
    NestingStatistics,
    REDUCER_ACTION,
    ReducerState,
    SETTING_ID,
    SettingConfig,
    SettingsData,
    ViewBoxAttribute
} from './types';
import { BUTTON_ACTION } from '../types';

export const DESKTOP_BUTTON_CONFIG: BUTTON_ACTION[] = [
    BUTTON_ACTION.START,
    BUTTON_ACTION.PAUSE,
    BUTTON_ACTION.UPLOAD,
    BUTTON_ACTION.DOWNLOAD,
    BUTTON_ACTION.ZOOM_IN,
    BUTTON_ACTION.ZOOM_OUT,
    BUTTON_ACTION.SETTINGS,
    BUTTON_ACTION.BACK
];

export const DEFAULT_SETTING: SettingsData = {
    [SETTING_ID.CURVE_TOLERANCE]: 0.3,
    [SETTING_ID.SPACING]: 0,
    [SETTING_ID.ROTATIONS]: 4,
    [SETTING_ID.POPULATION_SIZE]: 10,
    [SETTING_ID.MUTATION_RATE]: 10,
    [SETTING_ID.USE_HOLES]: false
};

const getSettingConfig = (
    id: SETTING_ID,
    type: INPUT_TYPE,
    min: number = 0,
    max: number = 0,
    step: number = 0
): SettingConfig => ({ id, type, min, max, step });

export const SETTINGS_CONFIG: SettingConfig[] = [
    getSettingConfig(SETTING_ID.SPACING, INPUT_TYPE.NUMBER, 0, 16, 1),
    getSettingConfig(SETTING_ID.CURVE_TOLERANCE, INPUT_TYPE.NUMBER, 0.1, 1, 0.01),
    getSettingConfig(SETTING_ID.ROTATIONS, INPUT_TYPE.NUMBER, 1, 16, 1),
    getSettingConfig(SETTING_ID.POPULATION_SIZE, INPUT_TYPE.NUMBER, 2, 64, 1),
    getSettingConfig(SETTING_ID.MUTATION_RATE, INPUT_TYPE.NUMBER, 2, 64, 1),
    getSettingConfig(SETTING_ID.USE_HOLES, INPUT_TYPE.BOOLEAN)
];

export const INITIAL_NESTING_STATISTICS: NestingStatistics = {
    efficiency: 0,
    total: 0,
    placed: 0
};

export const INITIAL_STATE: ReducerState = {
    svgSrc: '',
    isWorking: false,
    settings: DEFAULT_SETTING,
    isDrawerOpen: false,
    polygonPacker: new PolygonPacker(),
    fileReader: new FileReader(),
    svgParser: new SVGParser(),
    scale: 1,
    progress: 0,
    startTime: 0,
    estimate: 0,
    iterations: 0,
    nestingStatistics: INITIAL_NESTING_STATISTICS,
    isBinSelected: false,
    messageId: MESSAGE_ID.UPLOAD,
    message: '',
    triggerLoader: 0,
    isClosed: false
};

export const MESSAGE_ID_TO_ALERT_TYPE = new Map<MESSAGE_ID, ALERT_TYPE>([
    [MESSAGE_ID.UPLOAD, ALERT_TYPE.INFO],
    [MESSAGE_ID.START, ALERT_TYPE.INFO],
    [MESSAGE_ID.ERROR, ALERT_TYPE.ERROR],
    [MESSAGE_ID.COMPLETED, ALERT_TYPE.SUCCESS]
]);

export const VIEW_BOX_ATTRIBUTES: ViewBoxAttribute[] = ['x', 'y', 'width', 'height'];

export const ZOOM_STEP: number = 0.2;

export const MIN_ZOOM: number = 0.2;

export const MAX_ZOOM: number = 4;

export const PROGRESS_TRASHOLD: number = 0.02;

export const BUTTON_TO_REDUCER_ACTION = new Map<BUTTON_ACTION, REDUCER_ACTION>([
    [BUTTON_ACTION.START, REDUCER_ACTION.START_NESTING],
    [BUTTON_ACTION.PAUSE, REDUCER_ACTION.PAUSE_NESTING],
    [BUTTON_ACTION.BACK, REDUCER_ACTION.TRIGGER_CLOSE],
    [BUTTON_ACTION.UPLOAD, REDUCER_ACTION.TRIGGER_UPLOAD],
    [BUTTON_ACTION.DOWNLOAD, REDUCER_ACTION.DOWNLOAD_SVG],
    [BUTTON_ACTION.SETTINGS, REDUCER_ACTION.OPEN_DRAWER],
    [BUTTON_ACTION.CLOSE_SETTINGS, REDUCER_ACTION.CLOSE_DRAWER],
    [BUTTON_ACTION.ZOOM_IN, REDUCER_ACTION.ZOOM_IN],
    [BUTTON_ACTION.ZOOM_OUT, REDUCER_ACTION.ZOOM_OUT]
]);
