//@ts-ignore
import { SvgNest } from 'polygon-packer'

import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import SettingsIcon from '@mui/icons-material/Settings'
import FileUpload from '@mui/icons-material/FileUpload'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

import { ButtonConfig, getButtonConfig } from '../shared'
import {
    BUTTON_ACTION,
    INPUT_TYPE,
    NestingStatistics,
    PREDEFINED_ID,
    ReducerState,
    SETTING_ID,
    SettingConfig,
    SettingsData,
    ViewBoxAttribute
} from './types'

export const DESKTOP_BUTTON_CONFIG: ButtonConfig[] = [
    getButtonConfig(BUTTON_ACTION.START, PlayArrowIcon, 'Start Nest'),
    getButtonConfig(BUTTON_ACTION.UPLOAD, FileUpload, 'Upload SVG'),
    getButtonConfig(BUTTON_ACTION.DOWNLOAD, FileDownloadIcon, 'Download SVG'),
    getButtonConfig(BUTTON_ACTION.ZOOM_IN, ZoomInIcon),
    getButtonConfig(BUTTON_ACTION.ZOOM_OUT, ZoomOutIcon),
    getButtonConfig(BUTTON_ACTION.SETTINGS, SettingsIcon),
    getButtonConfig(BUTTON_ACTION.BACK, ArrowBackIcon)
]

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
}

export const DEFAULT_SETTING: SettingsData = {
    [SETTING_ID.CURVE_TOLERANCE]: 0.3,
    [SETTING_ID.SPACING]: 0,
    [SETTING_ID.ROTATIONS]: 4,
    [SETTING_ID.POPULATION_SIZE]: 10,
    [SETTING_ID.MUTATION_RATE]: 10,
    [SETTING_ID.USE_HOLES]: false,
    [SETTING_ID.EXPLORE_CONCAVE]: false
}

const getSettingConfig = (
    id: SETTING_ID,
    type: INPUT_TYPE,
    label: string,
    description: string,
    min: number = 0,
    max: number = 0,
    step: number = 0
): SettingConfig => ({
    id,
    type,
    label,
    description,
    min,
    max,
    step
})

export const SETTINGS_CONFIG: SettingConfig[] = [
    getSettingConfig(
        SETTING_ID.SPACING,
        INPUT_TYPE.NUMBER,
        'Space between parts',
        'The space between parts in SVG units (conversion depends on exporting software but usually 1 SVG unit = 1px = 1/72 inches = 0.3527777~ mm)',
        0,
        16,
        1
    ),
    getSettingConfig(
        SETTING_ID.CURVE_TOLERANCE,
        INPUT_TYPE.NUMBER,
        'Curve tolerance',
        'The maximum error allowed when converting Beziers and arcs to line segments. In SVG units. Smaller tolerances will take longer to compute',
        0.1,
        1,
        0.01
    ),
    getSettingConfig(
        SETTING_ID.ROTATIONS,
        INPUT_TYPE.NUMBER,
        'Part rotations',
        'Number of rotations to consider when inserting a part. Larger rotations will take longer to compute, and may also take longer to converge to a good solution',
        1,
        16,
        1
    ),
    getSettingConfig(
        SETTING_ID.POPULATION_SIZE,
        INPUT_TYPE.NUMBER,
        'GA population',
        'The number of solutions in the Genetic Algorithm population. Larger populations will converge slower but may result in better solutions in the long run',
        2,
        64,
        1
    ),
    getSettingConfig(
        SETTING_ID.MUTATION_RATE,
        INPUT_TYPE.NUMBER,
        'GA mutation rate',
        'Mutation rate (in percent) at each generation of the Genetic Algorithm. A 100% mutation rate is equivalent to random sampling',
        2,
        64,
        1
    ),
    getSettingConfig(
        SETTING_ID.USE_HOLES,
        INPUT_TYPE.BOOLEAN,
        'Part in Part',
        'Place parts in the holes of other parts. This will take much longer to compute'
    ),
    getSettingConfig(
        SETTING_ID.EXPLORE_CONCAVE,
        INPUT_TYPE.BOOLEAN,
        'Explore concave areas',
        'Try to solve for enclosed concave areas (eg. a jigsaw puzzle piece) This will take much longer to compute'
    )
]

export const INITIAL_NESTING_STATISTICS: NestingStatistics = {
    efficiency: 0,
    total: 0,
    placed: 0
}

export const INITIAL_STATE: ReducerState = {
    svgSrc: '',
    isWorking: false,
    settings: DEFAULT_SETTING,
    isDrawerOpen: false,
    svgNest: new SvgNest(),
    fileReader: new FileReader(),
    scale: 1,
    progress: 0,
    startTime: 0,
    estimate: 0,
    iterations: 0,
    nestingStatistics: INITIAL_NESTING_STATISTICS
}

export const VIEW_BOX_ATTRIBUTES: ViewBoxAttribute[] = ['x', 'y', 'width', 'height']
