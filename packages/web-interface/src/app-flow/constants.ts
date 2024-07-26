// @ts-expect-error no ts definition
import { PolygonPacker } from 'polygon-packer';

import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SettingsIcon from '@mui/icons-material/Settings';
import FileUpload from '@mui/icons-material/FileUpload';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import { ButtonConfig, getButtonConfig } from '../shared';
import {
    ALERT_TYPE,
    BUTTON_ACTION,
    INPUT_TYPE,
    MESSAGE_ID,
    NestingStatistics,
    PREDEFINED_ID,
    ReducerState,
    SETTING_ID,
    SettingConfig,
    SettingsData,
    ViewBoxAttribute
} from './types';

export const DESKTOP_BUTTON_CONFIG: ButtonConfig[] = [
    getButtonConfig(BUTTON_ACTION.START, PlayArrowIcon),
    getButtonConfig(BUTTON_ACTION.PAUSE, PauseIcon),
    getButtonConfig(BUTTON_ACTION.UPLOAD, FileUpload),
    getButtonConfig(BUTTON_ACTION.DOWNLOAD, FileDownloadIcon),
    getButtonConfig(BUTTON_ACTION.ZOOM_IN, ZoomInIcon),
    getButtonConfig(BUTTON_ACTION.ZOOM_OUT, ZoomOutIcon),
    getButtonConfig(BUTTON_ACTION.SETTINGS, SettingsIcon),
    getButtonConfig(BUTTON_ACTION.BACK, ArrowBackIcon)
];

export const STYLES: { [key: string]: object } = {
    root: {
        position: 'relative',
        width: '100vw',
        height: '100vh',
        padding: 2,
        boxSizing: 'border-box',
        gap: 1,
        alignItems: { xs: 'center', sm: 'start' }
    },
    alert: {
        width: '100%',
        boxSizing: 'border-box'
    },
    content: {
        flex: 1,
        boxSizing: 'border-box',
        width: '100%',
        position: 'relative'
    },
    fileLoader: { position: 'absolute', opacity: 0 },
    svgWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        overflow: 'auto'
    },
    svgContent: {
        boxSizing: 'border-box',
        position: 'relative',
        '& svg': {
            width: '100%',
            height: 'auto',
            position: 'absolute',
            '& *': {
                fill: '#fff !important',
                fillOpacity: '0 !important',
                stroke: '#3bb34a !important',
                strokeWidth: '2px !important',
                vectorEffect: 'non-scaling-stroke !important',
                strokeLinejoin: 'round !important',
                pointerEvents: 'fill'
            },
            '& *:hover': {
                stroke: '#0d6818 !important',
                cursor: 'pointer !important'
            }
        },
        [`& #${PREDEFINED_ID.BACKGROUND_RECT}`]: {
            fill: '#eee !important',
            fillOpacity: '1 !important',
            stroke: '#eee !important',
            strokeWidth: '2px !important',
            vectorEffect: 'non-scaling-stroke !important',
            strokeLinejoin: 'round !important'
        },

        [`& #${PREDEFINED_ID.SELECTED_ELEMENT}`]: {
            stroke: '#06380c !important',
            strokeWidth: '3px !important'
        }
    }
};

export const DEFAULT_SETTING: SettingsData = {
    [SETTING_ID.CURVE_TOLERANCE]: 0.3,
    [SETTING_ID.SPACING]: 0,
    [SETTING_ID.ROTATIONS]: 4,
    [SETTING_ID.POPULATION_SIZE]: 10,
    [SETTING_ID.MUTATION_RATE]: 10,
    [SETTING_ID.USE_HOLES]: false,
    [SETTING_ID.EXPLORE_CONCAVE]: false
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
    getSettingConfig(SETTING_ID.USE_HOLES, INPUT_TYPE.BOOLEAN),
    getSettingConfig(SETTING_ID.EXPLORE_CONCAVE, INPUT_TYPE.BOOLEAN)
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
    scale: 1,
    progress: 0,
    startTime: 0,
    estimate: 0,
    iterations: 0,
    nestingStatistics: INITIAL_NESTING_STATISTICS,
    isBinSelected: false,
    messageId: MESSAGE_ID.UPLOAD,
    message: ''
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
