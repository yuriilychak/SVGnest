import { PolygonPacker } from 'polygon-packer';
import { SVGParser } from 'svg-parser';

export enum BUTTON_ACTION {
    START = 'start',
    PAUSE = 'pause',
    UPLOAD = 'upload',
    DOWNLOAD = 'download',
    SETTINGS = 'settings',
    CLOSE_SETTINGS = 'closeSettings',
    ZOOM_IN = 'zoomIn',
    ZOOM_OUT = 'zoomOut',
    BACK = 'back'
}

export enum SETTING_ID {
    SPACING = 'spacing',
    CURVE_TOLERANCE = 'curveTolerance',
    ROTATIONS = 'rotations',
    POPULATION_SIZE = 'populationSize',
    MUTATION_RATE = 'mutationRate',
    USE_HOLES = 'useHoles',
    EXPLORE_CONCAVE = 'exploreConcave',
    CLIPPER_SCALE = 'clipperScale'
}

export enum INPUT_TYPE {
    NUMBER,
    BOOLEAN
}

export interface AppFlowProps {
    isDemoMode: boolean;
    onClose(): void;
}

export interface SettingsData {
    [SETTING_ID.CURVE_TOLERANCE]: number;
    [SETTING_ID.SPACING]: number;
    [SETTING_ID.ROTATIONS]: number;
    [SETTING_ID.POPULATION_SIZE]: number;
    [SETTING_ID.MUTATION_RATE]: number;
    [SETTING_ID.USE_HOLES]: boolean;
    [SETTING_ID.EXPLORE_CONCAVE]: boolean;
    [SETTING_ID.CLIPPER_SCALE]: number;
}

export interface SettingConfig {
    id: SETTING_ID;
    type: INPUT_TYPE;
    min: number;
    max: number;
    step: number;
}

export type NestingStatistics = {
    efficiency: number;
    placed: number;
    total: number;
};

export enum ALERT_TYPE {
    INFO = 'info',
    SUCCESS = 'success',
    ERROR = 'error'
}

export enum MESSAGE_ID {
    START = 'start',
    UPLOAD = 'upload',
    COMPLETED = 'completed',
    ERROR = 'error'
}

export interface ReducerState {
    svgSrc: string;
    isWorking: boolean;
    settings: SettingsData;
    isDrawerOpen: boolean;
    polygonPacker: PolygonPacker;
    fileReader: FileReader;
    svgParser: SVGParser;
    scale: number;
    progress: number;
    startTime: number;
    estimate: number;
    iterations: number;
    nestingStatistics: NestingStatistics;
    isBinSelected: boolean;
    messageId: MESSAGE_ID;
    message: string;
}

export enum REDUCER_ACTION {
    TOGGLE_DRAWER,
    CHANGE_SETTINGS,
    UPDATE_SVG,
    DOWNLOAD_SVG,
    ZOOM_IN,
    ZOOM_OUT,
    PROGRESS,
    START_NESTING,
    PAUSE_NESTING,
    UPDATE_STATISTICS,
    SELECT_BIN,
    THROW_ERROR,
    NEW_ITERATION
}

export type ReducerMiddleware = (prevState: ReducerState, payload: unknown) => ReducerState;

export type ReducerAction = {
    type: REDUCER_ACTION;
    payload: unknown;
};

export enum PREDEFINED_ID {
    SVG_WRAPPER = 'svgWrapper',
    FILE_SAVER = 'fileSaver',
    SELECTED_ELEMENT = 'selectedElement',
    BACKGROUND_RECT = 'backgroundRect'
}

export type ViewBoxAttribute = 'x' | 'y' | 'width' | 'height';
