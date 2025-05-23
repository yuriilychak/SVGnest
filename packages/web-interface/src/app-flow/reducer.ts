import {
    ALERT_TYPE,
    MESSAGE_ID,
    NestingStatistics,
    REDUCER_ACTION,
    ReducerAction,
    ReducerMiddleware,
    ReducerState,
    SETTING_ID,
    SettingsData
} from './types';
import { PREDEFINED_ID } from './types';
import { INITIAL_NESTING_STATISTICS, MAX_ZOOM, MIN_ZOOM, PROGRESS_TRASHOLD, ZOOM_STEP } from './constants';
import { toPercents } from './helpers';

const REDUCER = new Map<REDUCER_ACTION, ReducerMiddleware>([
    [
        REDUCER_ACTION.CHANGE_SETTINGS,
        (prevState, { id, value }: { id: SETTING_ID; value: string | boolean }) => {
            const { polygonPacker } = prevState;
            const settings: SettingsData = { ...prevState.settings, [id]: value };

            polygonPacker.stop(true);

            return { ...prevState, settings, isWorking: false, startTime: 0, progress: 0, estimate: 0 };
        }
    ],
    [REDUCER_ACTION.OPEN_DRAWER, prevState => ({ ...prevState, isDrawerOpen: true })],
    [REDUCER_ACTION.CLOSE_DRAWER, prevState => ({ ...prevState, isDrawerOpen: false })],
    [
        REDUCER_ACTION.UPDATE_SVG,
        (prevState, svgSrc: string) => {
            const { polygonPacker } = prevState;

            polygonPacker.stop(false);

            return {
                ...prevState,
                alertType: ALERT_TYPE.INFO,
                messageId: MESSAGE_ID.START,
                svgSrc,
                isBinSelected: false,
                isWorking: false,
                nestingStatistics: INITIAL_NESTING_STATISTICS,
                startTime: 0,
                progress: 0,
                estimate: 0
            };
        }
    ],
    [
        REDUCER_ACTION.DOWNLOAD_SVG,
        prevState => {
            const resultWrapper = document.getElementById(PREDEFINED_ID.SVG_WRAPPER);
            const saver: HTMLLinkElement = document.getElementById(PREDEFINED_ID.FILE_SAVER) as HTMLLinkElement;
            const blob = new Blob([resultWrapper.innerHTML], { type: 'image/svg+xml;charset=utf-8' });
            const blobURL = URL.createObjectURL(blob);

            saver.href = blobURL;

            saver.setAttribute('download', 'SVGNestOutput.svg');
            URL.revokeObjectURL(blobURL);

            return prevState;
        }
    ],
    [
        REDUCER_ACTION.ZOOM_IN,
        prevState => ({
            ...prevState,
            scale: Math.min(prevState.scale + ZOOM_STEP, MAX_ZOOM)
        })
    ],
    [
        REDUCER_ACTION.ZOOM_OUT,
        prevState => ({
            ...prevState,
            scale: Math.max(prevState.scale - ZOOM_STEP, MIN_ZOOM)
        })
    ],
    [
        REDUCER_ACTION.START_NESTING,
        (prevState, { handleProgress, handleRenderSvg }) => {
            const { svgParser, polygonPacker, settings } = prevState;
            const polygons = svgParser.getPolygons(settings);

            polygonPacker.start(settings, polygons, svgParser.binPolygon, handleProgress, handleRenderSvg);

            return { ...prevState, isWorking: true, startTime: 0 };
        }
    ],
    [
        REDUCER_ACTION.PROGRESS,
        (prevState, percent: number) => {
            const progress: number = toPercents(percent);

            return percent > PROGRESS_TRASHOLD
                ? { ...prevState, progress, estimate: ((new Date().getTime() - prevState.startTime) / percent) * (1 - percent) }
                : { ...prevState, progress, estimate: 0, startTime: new Date().getTime() };
        }
    ],
    [
        REDUCER_ACTION.UPDATE_STATISTICS,
        (prevState, nestingStatistics: NestingStatistics) => ({
            ...prevState,
            nestingStatistics,
            messageId: MESSAGE_ID.COMPLETED,
            iterations: ++prevState.iterations
        })
    ],
    [REDUCER_ACTION.NEW_ITERATION, prevState => ({ ...prevState, iterations: ++prevState.iterations })],
    [
        REDUCER_ACTION.SELECT_BIN,
        (prevState, element: SVGElement) => {
            const { svgParser } = prevState;

            svgParser.setBin(element);

            return { ...prevState, isBinSelected: true };
        }
    ],
    [
        REDUCER_ACTION.PAUSE_NESTING,
        prevState => {
            prevState.polygonPacker.stop(false);

            return { ...prevState, isWorking: false };
        }
    ],
    [
        REDUCER_ACTION.THROW_ERROR,
        (prevState, message: string) => ({
            ...prevState,
            messageId: MESSAGE_ID.ERROR,
            message
        })
    ],
    [REDUCER_ACTION.TRIGGER_UPLOAD, preveState => ({ ...preveState, triggerLoader: preveState.triggerLoader + 1 })],
    [REDUCER_ACTION.TRIGGER_CLOSE, prevState => ({ ...prevState, isClosed: true })]
]);

export default function reducer(prevState: ReducerState, { type, payload }: ReducerAction): ReducerState {
    return REDUCER.has(type) ? REDUCER.get(type)(prevState, payload) : prevState;
}
