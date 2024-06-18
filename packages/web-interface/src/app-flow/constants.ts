import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import SettingsIcon from '@mui/icons-material/Settings'
import FileUpload from '@mui/icons-material/FileUpload'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

import { ButtonConfig, getButtonConfig } from '../shared'
import { BUTTON_ACTION, INPUT_TYPE, SETTING_ID, SettingConfig, SettingsData } from './types'

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
        width: '100%'
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

const getSettingConfig = (id: SETTING_ID, type: INPUT_TYPE, label: string, description: string): SettingConfig => ({
    id,
    type,
    label,
    description
})

export const SETTINGS_CONFIG: SettingConfig[] = [
    getSettingConfig(
        SETTING_ID.SPACING,
        INPUT_TYPE.INT,
        'Space between parts',
        'The space between parts in SVG units (conversion depends on exporting software but usually 1 SVG unit = 1px = 1/72 inches = 0.3527777~ mm)'
    ),
    getSettingConfig(
        SETTING_ID.CURVE_TOLERANCE,
        INPUT_TYPE.FLOAT,
        'Curve tolerance',
        'The maximum error allowed when converting Beziers and arcs to line segments. In SVG units. Smaller tolerances will take longer to compute'
    ),
    getSettingConfig(
        SETTING_ID.ROTATIONS,
        INPUT_TYPE.INT,
        'Part rotations',
        'Number of rotations to consider when inserting a part. Larger rotations will take longer to compute, and may also take longer to converge to a good solution'
    ),
    getSettingConfig(
        SETTING_ID.POPULATION_SIZE,
        INPUT_TYPE.INT,
        'GA population',
        'The number of solutions in the Genetic Algorithm population. Larger populations will converge slower but may result in better solutions in the long run'
    ),
    getSettingConfig(
        SETTING_ID.MUTATION_RATE,
        INPUT_TYPE.INT,
        'GA mutation rate',
        'Mutation rate (in percent) at each generation of the Genetic Algorithm. A 100% mutation rate is equivalent to random sampling'
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
