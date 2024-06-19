export enum BUTTON_ACTION {
    START = 'start',
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
    EXPLORE_CONCAVE = 'exploreConcave'
}

export enum INPUT_TYPE {
    NUMBER,
    BOOLEAN
}

export interface AppFlowProps {
    isDemoMode: boolean
    onClose(): void
}

export interface SettingsData {
    [SETTING_ID.CURVE_TOLERANCE]: number
    [SETTING_ID.SPACING]: number
    [SETTING_ID.ROTATIONS]: number
    [SETTING_ID.POPULATION_SIZE]: number
    [SETTING_ID.MUTATION_RATE]: number
    [SETTING_ID.USE_HOLES]: boolean
    [SETTING_ID.EXPLORE_CONCAVE]: boolean
}

export interface SettingConfig {
    id: SETTING_ID
    label: string
    type: INPUT_TYPE
    description: string
    min: number
    max: number
    step: number
}
